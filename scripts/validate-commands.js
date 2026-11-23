// Check every slash command against Discord's rules before it reaches the bot
// (one invalid command makes Discord reject the whole list). Exit code 1 on
// any problem. Run: npm run validate   (also runs on every push, see .github/workflows/ci.yml)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const problems = [];
const add = (f, msg) => problems.push(`${f}: ${msg}`);
const NAME = /^[-_\p{Ll}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

const checkOpts = (f, where, opts = [], depth = 0) => {
  if (opts.length > 25) add(f, `${where}: ${opts.length} options (max 25)`);
  let sawOptional = false;
  const names = new Set();
  for (const o of opts) {
    const w = `${where} > ${o.name}`;
    if (!NAME.test(o.name || '')) add(f, `${w}: invalid name`);
    if (names.has(o.name)) add(f, `${w}: duplicate option name`);
    names.add(o.name);
    if (!o.description || o.description.length > 100) add(f, `${w}: description is ${o.description?.length ?? 0} characters (1-100)`);
    if (o.type === 1 || o.type === 2) { checkOpts(f, w, o.options, depth + 1); continue; }
    if (o.required && sawOptional) add(f, `${w}: required option after an optional one`);
    if (!o.required) sawOptional = true;
    if (o.choices) {
      if (o.choices.length > 25) add(f, `${w}: ${o.choices.length} choices (max 25)`);
      const seen = new Set();
      for (const c of o.choices) {
        if (!c.name || c.name.length > 100) add(f, `${w}: choice name length`);
        if (typeof c.value === 'string' && c.value.length > 100) add(f, `${w}: choice value too long`);
        if (seen.has(c.value)) add(f, `${w}: duplicate choice value ${c.value}`);
        seen.add(c.value);
      }
    }
  }
  if (depth === 0 && opts.some((o) => o.type === 1 || o.type === 2) && opts.some((o) => o.type > 2)) add(f, `${where}: mixes subcommands with plain options`);
};

const commands = new Map();
let n = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'commands')).filter((x) => x.endsWith('.js'))) {
  let c;
  try { c = require(path.join(ROOT, 'commands', f)); } catch (e) { add(f, `fails to load: ${e.message.split('\n')[0]}`); continue; }
  if (!c?.data) { add(f, 'no data export'); continue; }
  if (typeof c.execute !== 'function') add(f, 'no execute()');
  let j;
  try { j = c.data.toJSON(); } catch (e) { add(f, `toJSON failed: ${e.message}`); continue; }
  n++;
  if (commands.has(j.name)) add(f, `command name /${j.name} is also used by ${commands.get(j.name)}`);
  commands.set(j.name, f);
  const size = JSON.stringify(j).length;
  if (size > 8000) add(f, `command is ${size} characters (Discord's limit is 8000)`);
  if (!NAME.test(j.name)) add(f, `invalid command name ${j.name}`);
  if (!j.description || j.description.length > 100) add(f, `description is ${j.description?.length ?? 0} characters (1-100)`);
  checkOpts(f, `/${j.name}`, j.options);
}

// lib/command-deploy.js splits commands into a per-server set and a global set; each must be <= 100.
try {
  const { buildCommandsArray, buildGlobalArray } = require(path.join(ROOT, 'lib', 'command-deploy'));
  const fake = { commands: new Map([...commands.keys()].map((k) => [k, require(path.join(ROOT, 'commands', commands.get(k)))])) };
  const per = buildCommandsArray(fake).length; const glob = buildGlobalArray(fake).length;
  if (per > 100 || glob > 100) add('command-deploy', `sets too big: ${per} per server, ${glob} global (max 100 each)`);
  console.log(`${n} commands: ${per} per server + ${glob} global`);
} catch (e) { add('command-deploy', e.message); }

if (problems.length) {
  console.error(`✕ ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('✓ all commands are valid');
