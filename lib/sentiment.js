// Tiny lyric sentiment analyzer using a small lexicon. No API needed.
// Returns scores 0..1 for happy / sad / angry / love.

const LEX = {
  happy: ['happy', 'joy', 'sunshine', 'smile', 'laugh', 'celebrate', 'bright', 'shining', 'dance', 'free', 'fly', 'high', 'wonderful', 'beautiful', 'good', 'great', 'amazing', 'best', 'win', 'won', 'alive', 'forever', 'yeah'],
  sad:   ['sad', 'cry', 'tears', 'lonely', 'alone', 'gone', 'lost', 'broken', 'hurt', 'pain', 'sorrow', 'grief', 'empty', 'missing', 'goodbye', 'farewell', 'fall', 'falling', 'down', 'dying', 'die', 'leave', 'left'],
  angry: ['hate', 'angry', 'rage', 'fight', 'fire', 'burn', 'kill', 'war', 'enemy', 'pain', 'hell', 'damn', 'never', 'scream', 'shout', 'mad', 'wrong', 'lies', 'lie', 'betray'],
  love:  ['love', 'heart', 'kiss', 'baby', 'darling', 'forever', 'mine', 'yours', 'together', 'soul', 'angel', 'sweet', 'arms', 'embrace', 'romance', 'desire', 'beautiful', 'eyes', 'touch', 'feel'],
};

const analyze = (text) => {
  if (!text) return { happy: 0, sad: 0, angry: 0, love: 0, dominant: 'neutral' };
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const counts = { happy: 0, sad: 0, angry: 0, love: 0 };
  for (const w of words) {
    for (const [k, list] of Object.entries(LEX)) {
      if (list.includes(w)) counts[k]++;
    }
  }
  const total = words.length || 1;
  const scores = {};
  let max = -1; let dominant = 'neutral';
  for (const k of Object.keys(counts)) {
    scores[k] = Number((counts[k] / total).toFixed(4));
    if (scores[k] > max && counts[k] >= 3) { max = scores[k]; dominant = k; }
  }
  return { ...scores, dominant };
};

module.exports = { analyze };
