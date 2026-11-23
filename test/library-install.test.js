const test = require('node:test');
const assert = require('node:assert/strict');
const { explainYtDlpError } = require('../lib/library');

test('library: yt-dlp errors come with what to do', () => {
  assert.match(explainYtDlpError("ERROR: [youtube] abc: Sign in to confirm you're not a bot"), /Add YouTube cookies/);
  assert.match(explainYtDlpError('yt-dlp binary not found at /x/bin/yt-dlp'), /Reinstall/);
  assert.match(explainYtDlpError('ERROR: Requested format is not available'), /Restart the bot/);
  assert.match(explainYtDlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden'), /403/);
  assert.match(explainYtDlpError('ERROR: Postprocessing: ffprobe and ffmpeg not found'), /Original/);
  assert.match(explainYtDlpError('ERROR: [youtube] abc: Private video'), /can't be downloaded/);
  assert.equal(explainYtDlpError('something else'), 'something else');
});
