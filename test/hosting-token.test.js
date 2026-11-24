const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// hosting.js decides "on a panel" when it's first loaded, so load a fresh copy.
function loadHosting(onPanel) {
  const key = require.resolve('../lib/hosting');
  delete require.cache[key];
  if (onPanel) process.env.P_SERVER_UUID = 'test-uuid'; else delete process.env.P_SERVER_UUID;
  const keys = ['CONTROL_PORT', 'CONTROL_HOST', 'TMPDIR', 'FFMPEG_PATH', 'YTDLP_DIR', 'YTDLP_FILENAME'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const mod = require('../lib/hosting');
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  delete process.env.P_SERVER_UUID;
  return mod;
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'maow-token-'));

test('on a panel with no token, one is made, saved and reused', (t) => {
  t.after(() => { delete process.env.CONTROL_TOKEN; });
  delete process.env.CONTROL_TOKEN;
  const dir = tmpDir();
  const h = loadHosting(true);
  const file = h.ensureControlToken(dir);
  const first = process.env.CONTROL_TOKEN;
  assert.ok(first && first.length >= 30);
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim(), first);

  delete process.env.CONTROL_TOKEN;
  h.ensureControlToken(dir);
  assert.strictEqual(process.env.CONTROL_TOKEN, first, 'same token after a restart');
});

test('a token from the Startup tab or .env wins', (t) => {
  t.after(() => { delete process.env.CONTROL_TOKEN; });
  process.env.CONTROL_TOKEN = 'mine';
  const dir = tmpDir();
  assert.strictEqual(loadHosting(true).ensureControlToken(dir), null);
  assert.strictEqual(process.env.CONTROL_TOKEN, 'mine');
  assert.ok(!fs.existsSync(path.join(dir, 'control-token.txt')));
});

test('off a panel (the PC) nothing changes', () => {
  delete process.env.CONTROL_TOKEN;
  const dir = tmpDir();
  assert.strictEqual(loadHosting(false).ensureControlToken(dir), null);
  assert.strictEqual(process.env.CONTROL_TOKEN, undefined);
});
