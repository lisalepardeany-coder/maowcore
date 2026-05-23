// Free Google Translate endpoint (unofficial). No key required, lightly rate-limited.
const translate = async (text, target = 'en') => {
  if (!text) return '';
  // Chunk to stay under URL length limits
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 1500));
    remaining = remaining.slice(1500);
  }
  const out = [];
  for (const c of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(c)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Translate API ${res.status}`);
    const data = await res.json();
    out.push(data[0].map((row) => row[0]).join(''));
  }
  return out.join('');
};

module.exports = { translate };
