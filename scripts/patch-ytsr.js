// Postinstall patches applied to node_modules so the bot runs on current Node.js
// and current yt-dlp / current YouTube. Runs via "postinstall" in package.json
// so they reapply whenever node_modules is regenerated.
//
// 1. @distube/ytsr — replace removed fs.rmdirSync({recursive:true}) with fs.rmSync
//    (Node 22+ removed the recursive option, Node 25 throws).
// 2. @distube/yt-dlp — remove `noCallHome: true` from all flag objects.
//    yt-dlp deprecated --no-call-home; the warning leaks into stdout and breaks
//    the plugin's JSON.parse. Affects resolve() AND getStreamURL().
// 3. @distube/ytsr parseItem — add optional chaining on `browseEndpoint`. YouTube
//    sometimes omits the inner object for special channel types, which made
//    every /play search crash with `Cannot read properties of undefined
//    (reading 'canonicalBaseUrl')`. Upstream hasn't shipped a fix as of 2.0.4.

const fs = require('node:fs');
const path = require('node:path');

const patch = (label, target, transform) => {
  try {
    if (!fs.existsSync(target)) return;
    const src = fs.readFileSync(target, 'utf8');
    const patched = transform(src);
    if (src !== patched) {
      fs.writeFileSync(target, patched);
      console.log(`[patch] ${label}: applied`);
    }
  } catch (e) {
    console.warn(`[patch] ${label} failed:`, e.message);
  }
};

const ROOT = path.join(__dirname, '..');

// 1. ytsr — rmdirSync → rmSync
patch(
  'ytsr',
  path.join(ROOT, 'node_modules', '@distube', 'ytsr', 'lib', 'util.js'),
  (s) => s.replace(
    'FS.rmdirSync(dumpDir, { recursive: true })',
    'FS.rmSync(dumpDir, { recursive: true, force: true })',
  ),
);

// 2. yt-dlp plugin — strip `noCallHome: true,` (deprecated flag pollutes stdout)
patch(
  'yt-dlp',
  path.join(ROOT, 'node_modules', '@distube', 'yt-dlp', 'dist', 'index.js'),
  (s) => s.replace(/\s*noCallHome:\s*true,?/g, ''),
);

// 3. ytsr parseItem — `.browseEndpoint.canonicalBaseUrl` / `.browseEndpoint.browseId`
//    crash when YouTube omits the inner object. Insert optional chaining.
//    Idempotent: after the first run, the regex no longer matches the patched
//    version (it has `?.` which `\.browseEndpoint\.` doesn't), so re-running is
//    a no-op.
patch(
  'ytsr parseItem',
  path.join(ROOT, 'node_modules', '@distube', 'ytsr', 'lib', 'parseItem.js'),
  (s) => s.replace(/\.browseEndpoint\.(canonicalBaseUrl|browseId)/g, '.browseEndpoint?.$1'),
);
