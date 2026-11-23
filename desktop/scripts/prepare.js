// Before building: copy the bot's source (no node_modules, data, .env or
// logs — never your token or database) into build/bot-bundle, and draw the
// app icon into build/icon.png.
const fs = require('node:fs');
const path = require('node:path');
const { copyBot } = require('../lib/tools');
const png = require('../lib/png');

const BOT = path.join(__dirname, '..', '..');
const BUILD = path.join(__dirname, '..', 'build');
const OUT = path.join(BUILD, 'bot-bundle');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
copyBot(BOT, OUT, (l) => console.log(l));
// Safety net: nothing secret may end up inside the exe.
for (const bad of ['.env', path.join('data', 'maow.db'), path.join('data', 'youtube-cookies.txt')]) {
  if (fs.existsSync(path.join(OUT, bad))) throw new Error(`Refusing to bundle ${bad}`);
}
fs.rmSync(path.join(OUT, 'data'), { recursive: true, force: true });
// Ready-made native builds that need a compiler on a fresh PC (Node 24 ABI).
const PREBUILT = [path.join('@discordjs', 'opus', 'prebuild')];
for (const rel of PREBUILT) {
  const from = path.join(BOT, 'node_modules', rel);
  if (!fs.existsSync(from)) { console.warn(`(skip prebuilt ${rel}: not found)`); continue; }
  fs.cpSync(from, path.join(OUT, '.prebuilt', rel), { recursive: true });
}
fs.writeFileSync(path.join(BUILD, 'icon.png'), png.appIcon(256));
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`bundle ready: ${count(OUT)} files · icon.png written`);
