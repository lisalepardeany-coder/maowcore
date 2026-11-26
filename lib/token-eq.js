// Compare a secret (the dashboard token) in constant time. A plain === stops
// at the first wrong character, so response times can leak how much of a guess
// was right. Hashing first makes both sides the same length.
const crypto = require('node:crypto');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

const tokenEq = (given, secret) => {
  if (typeof given !== 'string' || !given || typeof secret !== 'string' || !secret) return false;
  return crypto.timingSafeEqual(digest(given), digest(secret));
};

module.exports = { tokenEq };
