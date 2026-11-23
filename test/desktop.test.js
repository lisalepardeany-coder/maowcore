// MaowCore Portable (desktop/) — the parts that don't need Electron.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const tools = require('../desktop/lib/tools');
const { nextDelay } = require('../desktop/lib/runner');
const png = require('../desktop/lib/png');

test('desktop: picks the newest Node 24 Windows build', () => {
  const idx = [
    { version: 'v25.1.0', files: ['win-x64-zip'] },
    { version: 'v24.9.0', files: ['win-x64-zip'] },
    { version: 'v24.11.1', files: ['win-x64-zip', 'linux-x64'] },
    { version: 'v24.12.0', files: ['linux-x64'] },
    { version: 'v22.20.0', files: ['win-x64-zip'] },
  ];
  assert.equal(tools.pickNodeRelease(idx).version, 'v24.11.1');
  assert.equal(tools.pickNodeRelease([]), null);
});

test('desktop: reads hashes from SHASUMS lists', () => {
  const list = 'aaaa  other.zip\n' + `${'b'.repeat(64)}  node-v24.11.1-win-x64.zip\n${'c'.repeat(64)} *yt-dlp.exe\n`;
  assert.equal(tools.hashFromList(list, 'node-v24.11.1-win-x64.zip'), 'b'.repeat(64));
  assert.equal(tools.hashFromList(list, 'yt-dlp.exe'), 'c'.repeat(64));
  assert.equal(tools.hashFromList(list, 'missing.zip'), null);
});

test('desktop: .env merge keeps comments and other keys', () => {
  const before = '# my bot\nDISCORD_TOKEN=old\nGENIUS_TOKEN=keep\n';
  const after = tools.mergeEnv(before, { DISCORD_TOKEN: 'new', CLIENT_ID: '123' });
  assert.match(after, /^# my bot$/m);
  assert.match(after, /^DISCORD_TOKEN=new$/m);
  assert.match(after, /^GENIUS_TOKEN=keep$/m);
  assert.match(after, /^CLIENT_ID=123$/m);
  assert.deepEqual(tools.parseEnv('A="x"\nB = y\n# c=1\n'), { A: 'x', B: 'y' });
  assert.throws(() => tools.mergeEnv('', { A: 'x\nEVIL=1' }), /Bad value/);
});

test('desktop: restart backoff grows on quick crashes, resets after a good run', () => {
  assert.equal(nextDelay(3000, 1000), 6000);
  assert.equal(nextDelay(240000, 1000), 300000);
  assert.equal(nextDelay(300000, 1000), 300000);
  assert.equal(nextDelay(60000, 10 * 60 * 1000), 3000);
});

test('desktop: fresh install copies code but never secrets or data', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-src-'));
  const dst = path.join(os.tmpdir(), `maow-dst-${process.pid}`);
  try {
    for (const f of ['index.js', 'package.json', '.env', '.env.example', 'bot.out.log']) fs.writeFileSync(path.join(src, f), 'x');
    for (const d of ['commands', 'data', 'node_modules', 'desktop']) fs.mkdirSync(path.join(src, d));
    fs.writeFileSync(path.join(src, 'commands', 'play.js'), 'x');
    fs.writeFileSync(path.join(src, 'data', 'maow.db'), 'secret');
    tools.copyBot(src, dst);
    assert.ok(fs.existsSync(path.join(dst, 'index.js')));
    assert.ok(fs.existsSync(path.join(dst, 'commands', 'play.js')));
    assert.ok(fs.existsSync(path.join(dst, '.env.example')));
    assert.ok(!fs.existsSync(path.join(dst, '.env')), 'no token copied');
    assert.ok(!fs.existsSync(path.join(dst, 'data', 'maow.db')), 'no database copied');
    assert.ok(!fs.existsSync(path.join(dst, 'bot.out.log')));
    assert.ok(tools.isBotFolder(dst));
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dst, { recursive: true, force: true });
  }
});

test('desktop: terminal cd, version compare, newest build', () => {
  const { resolveCd } = require('../desktop/lib/terminal');
  assert.equal(resolveCd('C:\\bot', '..', 'C:\\Users\\me'), 'C:\\');
  assert.equal(resolveCd('C:\\bot', 'lib', 'C:\\Users\\me'), 'C:\\bot\\lib');
  assert.equal(resolveCd('C:\\bot', '', 'C:\\Users\\me'), 'C:\\Users\\me');
  assert.equal(resolveCd('C:\\bot', '"D:\\Music Files"', 'C:\\Users\\me'), 'D:\\Music Files');
  const m = require('../desktop/lib/maint');
  assert.equal(m.cmpVer('1.1.0', '1.0.9'), 1);
  assert.equal(m.cmpVer('1.10.0', '1.9.0'), 1);
  assert.equal(m.cmpVer('1.0.0', '1.0.0'), 0);
  assert.equal(m.cmpVer('0.9.9', '1.0.0'), -1);
  assert.deepEqual(m.newestBuild(['MaowCore-Portable-1.0.0.exe', 'MaowCore-Portable-1.10.0.exe', 'MaowCore-Portable-1.9.2.exe', 'other.exe']), { n: 'MaowCore-Portable-1.10.0.exe', v: '1.10.0' });
  assert.equal(m.newestBuild(['nothing.txt']), null);
});

test('desktop: icons are valid PNGs', () => {
  for (const buf of [png.appIcon(64), png.trayIcon('online'), png.trayIcon('stopped')]) {
    assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});
