'use strict';

const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { backup, DatabaseSync } = require('node:sqlite');

function optionsFrom(argv) {
  const options = {
    source: '/var/lib/factorlab/factorlab.sqlite',
    directory: '/var/backups/factorlab'
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--source', '--directory'].includes(flag) || seen.has(flag) || !value || value.startsWith('--')) {
      throw new Error('Usage: backup.cjs [--source absolute-file] [--directory absolute-directory]');
    }
    seen.add(flag);
    options[flag.slice(2)] = value;
  }
  for (const [name, value] of Object.entries(options)) {
    if (!path.isAbsolute(value)) throw new Error(`${name} requires an absolute path`);
  }
  return options;
}

async function createBackup(options) {
  let sourceInfo;
  try {
    sourceInfo = fs.lstatSync(options.source);
  } catch {
    throw new Error('Source must be an existing regular file');
  }
  if (!sourceInfo.isFile()) throw new Error('Source must be an existing regular file');
  let directoryInfo;
  try {
    directoryInfo = fs.lstatSync(options.directory);
  } catch {
    throw new Error('Backup directory must already exist');
  }
  if (!directoryInfo.isDirectory()) throw new Error('Backup directory must already exist');
  const source = fs.realpathSync(options.source);
  const directory = fs.realpathSync(options.directory);
  const createdAt = new Date().toISOString();
  const destination = path.join(directory, `factorlab-${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`);
  const sourceDb = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
  let pages;
  try {
    // The SQLite backup API overwrites its target, so reserve only a new path.
    const reserved = fs.openSync(destination, 'wx', 0o600);
    fs.closeSync(reserved);
    pages = await backup(sourceDb, destination);
  } finally {
    sourceDb.close();
  }
  const verified = new DatabaseSync(destination, { readOnly: true, timeout: 5000 });
  try {
    const checks = verified.prepare('PRAGMA quick_check').all();
    if (checks.length !== 1 || checks[0].quick_check !== 'ok') {
      throw new Error('Backup quick_check failed; files retained for inspection');
    }
  } finally {
    verified.close();
  }
  const durable = fs.openSync(destination, 'r+');
  try {
    fs.fsyncSync(durable);
  } finally {
    fs.closeSync(durable);
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(destination)) hash.update(chunk);
  const metadata = {
    createdAt,
    source,
    backup: destination,
    bytes: fs.statSync(destination).size,
    pages,
    quickCheck: 'ok',
    sha256: hash.digest('hex')
  };
  fs.writeFileSync(`${destination}.json`, `${JSON.stringify(metadata, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
    flush: true
  });
  return metadata;
}

if (require.main === module) {
  process.umask(0o077);
  Promise.resolve()
    .then(() => createBackup(optionsFrom(process.argv.slice(2))))
    .then(metadata => process.stdout.write(`${JSON.stringify(metadata)}\n`))
    .catch(error => {
      process.stderr.write(`Backup failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
