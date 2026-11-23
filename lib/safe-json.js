// ===== Saving JSON files safely =====
// Several stores used to overwrite their file directly and, when it couldn't
// be read, carry on with empty data. A restart or crash in the middle of a
// save leaves a half-written file; the next start read it as "empty", and the
// next save wrote that emptiness over everything (giveaways, polls, tickets,
// API keys, preferences...).
//
// writeJson: write to a temp file, then rename it over the real one. The
//   rename is all-or-nothing, so the real file is always either the old
//   version or the new one. The previous version is kept as <file>.bak.
// readJson: a missing file gives the fallback. A damaged one is moved aside
//   (<file>.corrupt-<time>, never deleted) and <file>.bak is used instead;
//   only if that fails too does it start from the fallback, and says so.
const fs = require('node:fs');
const path = require('node:path');

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  try { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`); } catch { /* backup is best effort */ }
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // Windows can refuse a rename while another program has the file open: write in place instead.
    fs.writeFileSync(file, JSON.stringify(data));
    try { fs.unlinkSync(tmp); } catch { /* */ }
  }
};

const parseFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// `valid(data)` can reject the wrong shape (e.g. an object where a list belongs).
const readJson = (file, fallback, { valid = () => true, label = path.basename(file) } = {}) => {
  if (!fs.existsSync(file)) return fallback;
  try {
    const data = parseFile(file);
    if (valid(data)) return data;
    throw new Error('unexpected contents');
  } catch (e) {
    const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { fs.renameSync(file, aside); } catch { /* leave it */ }
    try {
      const data = parseFile(`${file}.bak`);
      if (valid(data)) {
        console.warn(`▲ [${label}] file was damaged (${e.message}); restored the previous save. The damaged copy is ${path.basename(aside)}.`);
        return data;
      }
    } catch { /* no usable backup */ }
    console.warn(`▲ [${label}] file was damaged (${e.message}) and there is no usable backup; starting empty. The damaged copy is ${path.basename(aside)}.`);
    return fallback;
  }
};

module.exports = { writeJson, readJson };
