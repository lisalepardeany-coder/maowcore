// Tiny TTS helper using the unofficial Google Translate TTS endpoint.
// Returns an audio URL the bot can play.

const SEGMENT_LIMIT = 200;

const splitText = (text) => {
  const out = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= SEGMENT_LIMIT) { out.push(remaining); break; }
    let cut = remaining.lastIndexOf(' ', SEGMENT_LIMIT);
    if (cut === -1) cut = SEGMENT_LIMIT;
    out.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trim();
  }
  return out;
};

const ttsUrl = (text, lang = 'en') => {
  const t = encodeURIComponent(text);
  // Validate lang to a safe pattern (BCP-47 subset) so user input can't break
  // out of the query param. Falls back to 'en' on garbage.
  const safeLang = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(lang) ? lang : 'en';
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${t}&tl=${encodeURIComponent(safeLang)}&client=tw-ob&total=1&idx=0&textlen=${text.length}`;
};

const speakUrls = (text, lang = 'en') => splitText(text).map((seg) => ttsUrl(seg, lang));

module.exports = { ttsUrl, speakUrls };
