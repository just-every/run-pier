// Back up, check and restore a hosted Pier's D1 database with this checkout's
// own wrangler: `rer run hosted <command> --environment <name> --env-file <file>`.
// The env file is read as KEY=VALUE lines, never sourced by a shell.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const usage = `Usage, from the Pier folder:
  rer run hosted database --environment production
  rer run hosted backup --environment production --env-file ~/pier-deploy.env
  rer run hosted check --environment production --env-file ~/pier-deploy.env --file exports/<file>.sql
  rer run hosted restore --environment production --env-file ~/pier-deploy.env --file exports/<file>.sql --yes
  rer run hosted rewind --environment production --env-file ~/pier-deploy.env --timestamp 2026-10-17T09:00:00Z --yes`;

function options(argv) {
  const [command, ...rest] = argv, flags = {};
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i].replace(/^--/, '');
    if (name === 'yes') flags.yes = true;
    else if (['environment', 'env-file', 'file', 'timestamp'].includes(name) && rest[i + 1]) flags[name] = rest[++i];
    else stop(`Unknown option ${rest[i]}.\n${usage}`);
  }
  return { command, environment: flags.environment ?? 'production', ...flags };
}
function stop(message) { console.error(message); process.exit(2); }

/** The D1 database `rer deploy` created for this environment, from its record in this folder. */
function database(environment) {
  const path = join('.rer', 'deploy', `${environment}.json`);
  if (!existsSync(path)) stop(`This folder holds no deployment of the ${environment} environment. Run this from the folder you deployed from.`);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const names = Object.values(record.owned?.d1 ?? {}).map(entry => entry?.name).filter(Boolean);
  if (names.length !== 1) stop(`The ${environment} deployment record does not name exactly one database.`);
  return names[0];
}

function settings(file) {
  if (!file) stop(`Name your deploy settings file with --env-file.\n${usage}`);
  const values = {};
  for (const line of readFileSync(resolve(file.replace(/^~(?=\/)/, process.env.HOME ?? '~')), 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) if (!values[key] && !process.env[key]) stop(`${file} has no ${key}. Add it as on the Put Pier online page.`);
  return { CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: values.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN };
}

// This checkout's own wrangler, the one `rer install` put in node_modules.
const wranglerPackage = createRequire(import.meta.url).resolve('wrangler/package.json');
const wranglerBin = join(dirname(wranglerPackage), JSON.parse(readFileSync(wranglerPackage, 'utf8')).bin.wrangler);
function wrangler(env, args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], { env: { ...process.env, ...env, WRANGLER_SEND_METRICS: 'false' }, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
  if (result.status !== 0) stop(`wrangler ${args.slice(0, 3).join(' ')} failed (exit ${result.status}). Nothing after this step ran.`);
  return result.stdout;
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function backup(env, db, label = '') {
  mkdirSync('exports', { recursive: true });
  const file = join('exports', `${db}${label}-${stamp()}.sql`);
  wrangler(env, ['d1', 'export', db, '--remote', '--output', file]);
  return file;
}
function counts(env, db) {
  const out = wrangler(env, ['d1', 'execute', db, '--remote', '--json', '--command', 'SELECT kind, COUNT(*) AS records FROM pier_records GROUP BY kind'], { capture: true });
  const rows = JSON.parse(out)[0]?.results ?? [];
  for (const row of rows) console.log(`  ${row.kind}: ${row.records}`);
  return rows;
}
function backupFile(file) {
  if (!file || !existsSync(file)) stop(`Name an existing backup file with --file, for example --file exports/pier-production-db-2026-10-17T09-00-00.sql.`);
  return file;
}

const o = options(process.argv.slice(2));
if (o.command === 'database') { console.log(database(o.environment)); process.exit(0); }
if (!['backup', 'check', 'restore', 'rewind'].includes(o.command)) stop(usage);
const db = database(o.environment), env = settings(o['env-file']);

if (o.command === 'backup') {
  const file = backup(env, db);
  console.log(`Saved the hosted ${o.environment} database ${db} to ${file}. Keep it private.`);
} else if (o.command === 'check') {
  // Load the file into a throwaway database, count what it holds, then delete it.
  const file = backupFile(o.file), check = `${db.replace(/-db$/, '')}-check-db`;
  // A check database left by an interrupted run is removed before a new one is made.
  spawnSync(process.execPath, [wranglerBin, 'd1', 'delete', check, '--skip-confirmation'], { env: { ...process.env, ...env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'ignore' });
  wrangler(env, ['d1', 'create', check]);
  try {
    wrangler(env, ['d1', 'execute', check, '--remote', '--file', file, '--yes']);
    console.log(`${file} restores into a fresh database with these records:`);
    counts(env, check);
  } finally {
    wrangler(env, ['d1', 'delete', check, '--skip-confirmation']);
    console.log(`Deleted the check database ${check}.`);
  }
} else if (o.command === 'restore') {
  // Replace the live database's contents with a backup. The current contents are saved first.
  const file = backupFile(o.file);
  if (!o.yes) stop(`This replaces every record in the live ${o.environment} Pier with ${file}. Run the same command with --yes to go ahead.`);
  const before = backup(env, db, '-before-restore');
  console.log(`Saved the current live records to ${before} first.`);
  const tables = JSON.parse(wrangler(env, ['d1', 'execute', db, '--remote', '--json', '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"], { capture: true }))[0]?.results.map(row => row.name) ?? [];
  if (tables.length) wrangler(env, ['d1', 'execute', db, '--remote', '--yes', '--command', ['PRAGMA defer_foreign_keys = on', ...tables.map(name => `DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`)].join('; ')]);
  wrangler(env, ['d1', 'execute', db, '--remote', '--file', file, '--yes']);
  console.log(`The live ${o.environment} Pier now holds ${file}:`);
  counts(env, db);
  console.log(`To undo, run the same command with --file ${before}.`);
} else if (o.command === 'rewind') {
  if (!o.timestamp) { wrangler(env, ['d1', 'time-travel', 'info', db]); process.exit(0); }
  if (!o.yes) stop(`This puts the live ${o.environment} Pier back to ${o.timestamp}. Run the same command with --yes to go ahead.`);
  wrangler(env, ['d1', 'time-travel', 'restore', db, '--timestamp', o.timestamp]);
}
