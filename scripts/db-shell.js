// Interactive read-only SQL shell for data/maow.db.
//
// Usage:
//   npm run db-shell                       (interactive prompt)
//   npm run db-shell -- "SELECT 1"        (one-shot query)
//   npm run db-shell -- ".tables"          (meta: list tables)
//   npm run db-shell -- ".schema history"  (meta: show table schema)
//
// READ-ONLY by default — opens the db with the readonly flag so a stray
// DROP TABLE in your test query can't wreck anything. Pass --write to allow
// mutations (use with extreme care, and stop the bot first to avoid WAL
// lock conflicts).

const path = require('node:path');
const readline = require('node:readline');

let Database;
try { Database = require('better-sqlite3'); }
catch (e) {
  console.error('▲ better-sqlite3 not installed. Run: npm run install-native');
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'maow.db');
const writeMode = process.argv.includes('--write');
const args = process.argv.slice(2).filter((a) => a !== '--write');

let db;
try {
  db = new Database(DB_PATH, { readonly: !writeMode, fileMustExist: true });
} catch (e) {
  console.error(`▲ Could not open ${DB_PATH}: ${e.message}`);
  process.exit(1);
}

console.log(`Opened ${DB_PATH} (${writeMode ? 'WRITE' : 'read-only'})`);
if (writeMode) console.log('⚠ WRITE MODE — make sure the bot is stopped to avoid WAL conflicts.');

// Pretty-print a result set as a column-aligned table. Truncates long values.
const printRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('(0 rows)');
    return;
  }
  const cols = Object.keys(rows[0]);
  const fmt = (v) => v == null ? 'NULL' : String(v).replace(/\n/g, '\\n').slice(0, 80);
  // Column widths
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c]).length)));
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const row = (vals) => '| ' + vals.map((v, i) => fmt(v).padEnd(widths[i])).join(' | ') + ' |';
  console.log(sep);
  console.log(row(cols));
  console.log(sep);
  for (const r of rows) console.log(row(cols.map((c) => r[c])));
  console.log(sep);
  console.log(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
};

// Handle meta-commands. Returns true if handled.
const runMeta = (input) => {
  const trimmed = input.trim();
  if (trimmed === '.tables') {
    const rows = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ).all();
    printRows(rows);
    return true;
  }
  if (trimmed === '.indexes' || trimmed === '.indices') {
    const rows = db.prepare(
      `SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`,
    ).all();
    printRows(rows);
    return true;
  }
  const schemaMatch = trimmed.match(/^\.schema\s+(\w+)/);
  if (schemaMatch) {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(schemaMatch[1]);
    console.log(row?.sql || `(no such table: ${schemaMatch[1]})`);
    return true;
  }
  if (trimmed === '.help' || trimmed === 'help') {
    console.log('Meta commands:');
    console.log('  .tables           list user tables');
    console.log('  .indexes          list user indexes');
    console.log('  .schema <table>   show CREATE TABLE for <table>');
    console.log('  .quit             exit');
    console.log('  .help             this message');
    console.log('Anything else is run as SQL (SELECTs return tables, others run as exec).');
    return true;
  }
  if (trimmed === '.quit' || trimmed === '.exit') {
    db.close(); process.exit(0);
  }
  return false;
};

const runSql = (sql) => {
  try {
    // For SELECTs (and other read queries) use prepare().all() to get rows;
    // for everything else, use exec() and report changes.
    const isSelect = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql);
    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      printRows(rows);
    } else {
      if (!writeMode) {
        console.log('▲ Read-only mode. Re-run with --write to execute mutating SQL.');
        return;
      }
      const result = db.exec(sql);
      console.log('OK');
    }
  } catch (e) {
    console.error('▲', e.message);
  }
};

// One-shot mode if an argument is given.
if (args.length > 0) {
  const input = args.join(' ');
  if (!runMeta(input)) runSql(input);
  db.close();
  process.exit(0);
}

// Interactive REPL.
console.log('Type .help for meta-commands, .quit to exit.');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sql> ' });
rl.prompt();
let buffer = '';
rl.on('line', (line) => {
  buffer += (buffer ? ' ' : '') + line;
  // Heuristic: meta-commands are one-line; SQL ends at ';'.
  if (buffer.startsWith('.') || buffer.trim().endsWith(';') || !buffer.trim()) {
    const input = buffer.replace(/;$/, '').trim();
    buffer = '';
    if (input) {
      if (!runMeta(input)) runSql(input);
    }
    rl.prompt();
  } else {
    rl.setPrompt('  ... ');
    rl.prompt();
  }
});
rl.on('close', () => { db.close(); process.exit(0); });
