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

// 3. ytsr parseItem — defensive optional chaining on YouTube's frequently-
//    omitted internal fields. YouTube ships several response shape variants
//    depending on the video type (regular, shorts, live, members-only, etc.)
//    and ytsr 2.0.4 only handles the common case. Patches:
//      (a) `.browseEndpoint.canonicalBaseUrl/browseId` → optional
//      (b) `prepImg(...)[0]?.url` → harden array access too (?.[0])
//          (`prepImg` returns undefined on items YouTube ships with no
//          `thumbnails` array, e.g. live previews — `undefined[0]` throws
//          "Cannot read properties of undefined (reading '0')")
//      (c) `commandMetadata.webCommandMetadata.url` → optional
//      (d) `.runs[0]` access on ownerText / shortBylineText / longBylineText
//          (YouTube ships these objects without `.runs` for collaborations
//          and re-uploaded content)
//      (e) `prepImg(authorImg.thumbnail.thumbnails)[0]` already has `|| null`
//          but `prepImg()` itself can return undefined first
//      (f) `Object.keys(item)[0]` — empty wrapper objects appear on
//          deprecated/removed videos in search results
//    All patches are idempotent: regex no longer matches after first apply.
patch(
  'ytsr parseItem',
  path.join(ROOT, 'node_modules', '@distube', 'ytsr', 'lib', 'parseItem.js'),
  (s) => s
    .replace(/\.browseEndpoint\.(canonicalBaseUrl|browseId)/g, '.browseEndpoint?.$1')
    // prepImg(x)[0].url       → prepImg(x)?.[0]?.url   (raw upstream form)
    // prepImg(x)[0]?.url      → prepImg(x)?.[0]?.url   (half-patched form)
    // Two separate replacements so each is idempotent in isolation.
    .replace(/UTIL\.prepImg\(([^)]+)\)\[0\]\.url/g, 'UTIL.prepImg($1)?.[0]?.url')
    .replace(/UTIL\.prepImg\(([^)]+)\)\[0\]\?\.url/g, 'UTIL.prepImg($1)?.[0]?.url')
    // bare prepImg(x)[0] with no .url access (e.g. `[0] || null`)
    .replace(/UTIL\.prepImg\(([^)]+)\)\[0\](?!\?)/g, 'UTIL.prepImg($1)?.[0]')
    .replace(/commandMetadata\.webCommandMetadata\.url/g, 'commandMetadata?.webCommandMetadata?.url')
    // .runs[0] reads where the parent is checked but .runs is not
    .replace(/(ownerText|shortBylineText|longBylineText)(\s*&&\s*[^.]+)\.runs\[0\]/g, '$1$2.runs?.[0]')
    // Empty-wrapper guard: Object.keys(item)[0] → Object.keys(item)?.[0]
    .replace(/Object\.keys\(item\)\[0\]/g, 'Object.keys(item)?.[0]')
    // .thumbnailOverlays.find — if the array is missing, find() crashes
    .replace(/obj\.thumbnailOverlays\.find\(/g, '(obj.thumbnailOverlays || []).find('),
);
