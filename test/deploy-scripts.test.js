// The Pterodactyl shell scripts: valid bash, Linux line endings, and the
// startup command in boot.sh's header matches what deploy/pterodactyl/README.md
// tells people.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DIR = path.join(__dirname, '..', 'deploy', 'pterodactyl');
const scripts = fs.readdirSync(DIR).filter((f) => f.endsWith('.sh'));
const hasBash = spawnSync('bash', ['--version']).status === 0;

for (const f of scripts) {
  test(`deploy: ${f} has Linux line endings`, () => {
    assert.ok(!fs.readFileSync(path.join(DIR, f)).includes(13), 'no CR characters');
  });
  test(`deploy: ${f} is valid bash`, { skip: !hasBash && 'no bash here (checked on Linux CI)' }, () => {
    const r = spawnSync('bash', ['-n', path.join(DIR, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

test('deploy: the generic-egg startup command is the same in boot.sh and the README', () => {
  const header = fs.readFileSync(path.join(DIR, 'boot.sh'), 'utf8').match(/^#\s{3}(if \[\[ ! -d \.git .*boot\.sh)$/m);
  assert.ok(header, 'boot.sh shows the startup command');
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  assert.ok(readme.includes(header[1]), 'README has the same command');
});
