// Tool checks + installers for MaowCore Portable. No Electron imports, so the
// pure parts can be unit tested with plain Node.
//
// What the bot needs, and where each piece comes from:
//   Node.js   system install (v22+) or a portable copy we download from
//             nodejs.org into <data>/tools/node (SHA-256 checked)
//   packages  `npm install` in the bot folder (brings ffmpeg-static and the
//             yt-dlp binary with it)
//   ffmpeg    FFMPEG_PATH from .env, else node_modules/ffmpeg-static
//   yt-dlp    node_modules/@distube/yt-dlp/bin, else downloaded from the
//             official GitHub release (SHA-256 checked)
//   settings  .env with DISCORD_TOKEN + CLIENT_ID
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const MIN_NODE_MAJOR = 22;
const NODE_MAJOR = 24;

const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: opts.timeout || 30000, ...opts }, (err, stdout, stderr) => {
    resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
  });
});

// Stream a long command's output line by line.
const runStreaming = (cmd, args, { cwd, env, onLine } = {}) => new Promise((resolve) => {
  const p = spawn(cmd, args, { cwd, env, windowsHide: true });
  const feed = (buf) => String(buf).split(/\r?\n/).forEach((l) => { if (l.trim()) onLine?.(l); });
  p.stdout.on('data', feed);
  p.stderr.on('data', feed);
  p.on('error', (e) => { onLine?.(`✕ ${e.message}`); resolve(1); });
  p.on('close', (code) => resolve(code));
});

// ===== .env (pure) =====
const parseEnv = (text) => {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
};
// Replace/add keys, keeping comments and other lines as they are.
const mergeEnv = (text, values) => {
  let t = String(text || '');
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    if (/[\r\n]/.test(String(v))) throw new Error(`Bad value for ${k}`);
    const rx = new RegExp(`^\\s*${k}\\s*=.*$`, 'm');
    t = rx.test(t) ? t.replace(rx, `${k}=${v}`) : `${t.replace(/\s*$/, '')}${t.trim() ? '\n' : ''}${k}=${v}\n`;
  }
  return t;
};
const readEnv = (botDir) => { try { return parseEnv(fs.readFileSync(path.join(botDir, '.env'), 'utf8')); } catch { return {}; } };
const writeEnv = (botDir, values) => {
  const file = path.join(botDir, '.env');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* new */ }
  fs.writeFileSync(file, mergeEnv(text, values));
};

// ===== Node.js =====
const nodeMajor = (v) => Number(String(v || '').replace(/^v/, '').split('.')[0]) || 0;

// Pure: pick the newest Node 24 (LTS) build for Windows x64 from dist/index.json.
const pickNodeRelease = (index, major = NODE_MAJOR) => (index || [])
  .filter((r) => nodeMajor(r.version) === major && (r.files || []).includes('win-x64-zip'))
  .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0] || null;

const findNode = async ({ preferred, toolsDir } = {}) => {
  const candidates = [];
  if (preferred) candidates.push({ path: preferred, source: 'chosen' });
  if (toolsDir) candidates.push({ path: path.join(toolsDir, 'node', 'node.exe'), source: 'app' });
  const where = await run('where', ['node']);
  if (where.ok) where.stdout.split(/\r?\n/).filter(Boolean).forEach((p) => candidates.push({ path: p.trim(), source: 'system' }));
  for (const c of candidates) {
    if (!fs.existsSync(c.path)) continue;
    const v = await run(c.path, ['-v']);
    if (v.ok && nodeMajor(v.stdout.trim()) >= MIN_NODE_MAJOR) return { ...c, version: v.stdout.trim() };
  }
  return null;
};

const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

const download = async (url, file, onProgress) => {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`Download failed (${r.status}) for ${url}`);
  const total = Number(r.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = fs.createWriteStream(file);
  let got = 0; let lastPct = -1;
  for await (const chunk of r.body) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; onProgress?.(pct, got, total); }
  }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  return file;
};

// Pure: find a file's hash in a SHASUMS-style list ("<hash>  <name>").
const hashFromList = (text, name) => {
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (m && m[2].trim() === name) return m[1].toLowerCase();
  }
  return null;
};

const installNode = async (toolsDir, log) => {
  log('Looking up the latest Node.js 24…');
  const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
  const rel = pickNodeRelease(index);
  if (!rel) throw new Error('Could not find a Node.js 24 build for Windows.');
  const name = `node-${rel.version}-win-x64.zip`;
  const base = `https://nodejs.org/dist/${rel.version}`;
  const tmp = path.join(toolsDir, 'tmp');
  const zip = path.join(tmp, name);
  log(`Downloading Node.js ${rel.version} (~35 MB)…`);
  await download(`${base}/${name}`, zip, (pct) => pct >= 0 && log(`  ${pct}%`));
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const want = hashFromList(sums, name);
  const got = await sha256File(zip);
  if (!want || want !== got) { fs.rmSync(zip, { force: true }); throw new Error('Node.js download failed its checksum — not installed.'); }
  log('Checksum OK. Unpacking…');
  const unpack = path.join(tmp, 'unpack');
  fs.rmSync(unpack, { recursive: true, force: true });
  fs.mkdirSync(unpack, { recursive: true });
  const t = await run('tar', ['-xf', zip, '-C', unpack], { timeout: 300000 });
  if (!t.ok) throw new Error(`Unpacking failed: ${t.stderr.slice(0, 200)}`);
  const dest = path.join(toolsDir, 'node');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(path.join(unpack, `node-${rel.version}-win-x64`), dest);
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`✓ Node.js ${rel.version} installed.`);
  return path.join(dest, 'node.exe');
};

// ===== Bot packages =====
const npmCli = (nodePath) => {
  const dir = path.dirname(nodePath);
  const local = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return fs.existsSync(local) ? local : null;
};
const envForNode = (nodePath) => {
  const env = { ...process.env, PATH: `${path.dirname(nodePath)};${process.env.PATH || ''}` };
  delete env.ELECTRON_RUN_AS_NODE;   // the bot runs on real Node, not Electron
  return env;
};

// Packages are installed with scripts OFF, then only the steps the bot needs
// are run by hand. That works the same on npm 10 and 11 (npm 11 blocks
// unknown install scripts) and never tries to compile C++: the database
// (better-sqlite3) and voice crypto (sodium-native) ship ready-made Windows
// builds, and the optional Opus encoder comes from the app's own copy.
const npmInstall = async (nodePath, botDir, log) => {
  const cli = npmCli(nodePath);
  if (!cli) throw new Error('npm was not found next to Node.js.');
  const env = envForNode(nodePath);
  log('Installing the bot\'s packages (this can take a few minutes)…');
  const code = await runStreaming(nodePath, [cli, 'install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: botDir, env, onLine: (l) => log(`  ${l}`) });
  if (code !== 0) throw new Error(`npm install failed (exit ${code}). See the log above.`);
  const ffDir = path.join(botDir, 'node_modules', 'ffmpeg-static');
  if (fs.existsSync(path.join(ffDir, 'install.js')) && !fs.existsSync(path.join(ffDir, 'ffmpeg.exe'))) {
    log('Downloading ffmpeg…');
    const c = await runStreaming(nodePath, ['install.js'], { cwd: ffDir, env, onLine: (l) => log(`  ${l}`) });
    if (c !== 0) log('▲ ffmpeg download had a problem — see above.');
  }
  if (!fs.existsSync(ytdlpPath(botDir))) await installYtDlp(botDir, log);
  if (fs.existsSync(path.join(botDir, 'scripts', 'patch-ytsr.js'))) {
    await runStreaming(nodePath, [path.join('scripts', 'patch-ytsr.js')], { cwd: botDir, env, onLine: (l) => log(`  ${l}`) });
  }
  applyPrebuilt(botDir, log);
  log('✓ Packages installed.');
};

// Copy ready-made native builds that came with the app (data in .prebuilt/,
// mirroring node_modules/) into place when they're missing.
const applyPrebuilt = (botDir, log) => {
  const src = path.join(botDir, '.prebuilt');
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { walk(r); continue; }
      const dst = path.join(botDir, 'node_modules', r);
      const parts = r.split(path.sep);
      const pkgRoot = path.join(botDir, 'node_modules', ...parts.slice(0, parts[0].startsWith('@') ? 2 : 1));
      if (!fs.existsSync(pkgRoot)) continue;   // package not installed (optional) — nothing to add
      if (fs.existsSync(dst)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(src, r), dst);
      n++;
    }
  };
  walk('');
  if (n) log?.(`✓ Added ${n} ready-made native file${n === 1 ? '' : 's'} (voice encoder).`);
  return n;
};

const npmRebuild = async (nodePath, botDir, log) => {
  const cli = npmCli(nodePath);
  if (!cli) throw new Error('npm was not found next to Node.js.');
  log('Rebuilding native parts for this Node.js…');
  const code = await runStreaming(nodePath, [cli, 'rebuild'], { cwd: botDir, env: envForNode(nodePath), onLine: (l) => log(`  ${l}`) });
  if (code !== 0) throw new Error(`npm rebuild failed (exit ${code}).`);
  log('✓ Rebuilt.');
};

// Do the native modules load with this Node? (database + voice encryption)
const nativeCheck = async (nodePath, botDir) => {
  const code = "const r={};for(const m of ['better-sqlite3','sodium-native','@discordjs/opus']){try{require(m);r[m]='ok'}catch(e){r[m]=/NODE_MODULE_VERSION|was compiled against/.test(e.message)?'abi':(e.code==='MODULE_NOT_FOUND'?'missing':'error')}}console.log(JSON.stringify(r))";
  const r = await run(nodePath, ['-e', code], { cwd: botDir, env: envForNode(nodePath), timeout: 30000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return null; }
};

// ===== yt-dlp =====
const ytdlpPath = (botDir) => path.join(botDir, 'node_modules', '@distube', 'yt-dlp', 'bin', 'yt-dlp.exe');
const installYtDlp = async (botDir, log) => {
  const target = ytdlpPath(botDir);
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  log('Downloading yt-dlp (~18 MB)…');
  const tmp = `${target}.download`;
  await download(`${base}/yt-dlp.exe`, tmp, (pct) => pct >= 0 && log(`  ${pct}%`));
  const want = hashFromList(await (await fetch(`${base}/SHA2-256SUMS`)).text(), 'yt-dlp.exe');
  const got = await sha256File(tmp);
  if (!want || want !== got) { fs.rmSync(tmp, { force: true }); throw new Error('yt-dlp download failed its checksum — not installed.'); }
  fs.renameSync(tmp, target);
  log('✓ yt-dlp installed.');
};

// ===== ffmpeg =====
const ffmpegPath = (botDir) => {
  const env = readEnv(botDir);
  if (env.FFMPEG_PATH && fs.existsSync(env.FFMPEG_PATH)) return { path: env.FFMPEG_PATH, source: '.env' };
  const local = path.join(botDir, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  return fs.existsSync(local) ? { path: local, source: 'packages' } : null;
};

// ===== Overall check =====
const isBotFolder = (dir) => !!dir && fs.existsSync(path.join(dir, 'index.js')) && fs.existsSync(path.join(dir, 'commands')) && fs.existsSync(path.join(dir, 'package.json'));

const check = async ({ botDir, toolsDir, preferredNode }) => {
  const res = { botDir: { ok: isBotFolder(botDir), detail: botDir || null } };
  const node = await findNode({ preferred: preferredNode, toolsDir });
  res.node = { ok: !!node, detail: node ? `${node.version} (${node.source})` : `Not found (needs v${MIN_NODE_MAJOR}+)`, path: node?.path || null };
  if (!res.botDir.ok) return res;
  const hasPkgs = fs.existsSync(path.join(botDir, 'node_modules', 'discord.js', 'package.json'))
    && fs.existsSync(path.join(botDir, 'node_modules', 'distube', 'package.json'));
  res.packages = { ok: hasPkgs, detail: hasPkgs ? 'Installed' : 'Not installed' };
  if (hasPkgs && node) {
    const n = await nativeCheck(node.path, botDir);
    const abi = n && Object.values(n).includes('abi');
    res.native = { ok: !!n && !abi, detail: !n ? 'Could not check' : abi ? 'Built for another Node.js — needs a rebuild' : `Database ${n['better-sqlite3']}, voice ${n['sodium-native'] === 'ok' || n['@discordjs/opus'] === 'ok' ? 'ok' : 'basic'}` };
  }
  const ff = ffmpegPath(botDir);
  res.ffmpeg = { ok: !!ff, detail: ff ? `From ${ff.source}` : 'Not found (comes with the packages)' };
  res.ytdlp = { ok: fs.existsSync(ytdlpPath(botDir)), detail: fs.existsSync(ytdlpPath(botDir)) ? 'Installed' : 'Not found' };
  const env = readEnv(botDir);
  const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter((k) => !env[k]);
  res.env = { ok: !missing.length, detail: missing.length ? `Missing ${missing.join(', ')}` : 'Bot token set', port: Number(env.CONTROL_PORT) || 8765 };
  return res;
};

// ===== Fresh install: copy the bundled bot source =====
const SKIP = new Set(['node_modules', 'data', '.git', 'desktop', '.env', 'bot.out.log', 'bot.err.log']);
const copyBot = (from, to, log) => {
  if (!fs.existsSync(path.join(from, 'index.js'))) throw new Error('The bundled bot files are missing from this app.');
  fs.mkdirSync(to, { recursive: true });
  if (fs.readdirSync(to).some((f) => !f.startsWith('.')) && !isBotFolder(to)) {
    throw new Error('That folder is not empty. Pick an empty folder (or an existing bot folder).');
  }
  const walk = (src, dst) => {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (SKIP.has(e.name) || /\.log(\.\d+)?$/.test(e.name)) continue;
      const s = path.join(src, e.name); const d = path.join(dst, e.name);
      if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s, d); } else fs.copyFileSync(s, d);
    }
  };
  walk(from, to);
  fs.mkdirSync(path.join(to, 'data'), { recursive: true });
  log?.(`✓ Bot files copied to ${to}`);
};

module.exports = {
  check, findNode, installNode, npmInstall, npmRebuild, applyPrebuilt, nativeCheck, installYtDlp, ffmpegPath, copyBot, isBotFolder,
  readEnv, writeEnv, parseEnv, mergeEnv, pickNodeRelease, hashFromList, nodeMajor, envForNode, MIN_NODE_MAJOR,
};
