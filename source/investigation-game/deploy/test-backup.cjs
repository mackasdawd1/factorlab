'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const testRoot = path.resolve(__dirname, '../../.local/cloud-20261020/tests');
fs.mkdirSync(testRoot, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(testRoot, 'backup-'));
const cli = path.join(__dirname, 'backup.cjs');

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true
  });
}

function fixture(name) {
  const root = path.join(runRoot, name);
  const directory = path.join(root, 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const source = path.join(root, 'synthetic.sqlite');
  const db = new DatabaseSync(source);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE synthetic_saves (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
    PRAGMA wal_checkpoint(TRUNCATE);
    INSERT INTO synthetic_saves VALUES (1, '合成研究存档'), (2, 'synthetic committed save');
  `);
  return { root, directory, source, db };
}

function successfulBackup(source, directory) {
  const result = run(['--source', source, '--directory', directory]);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test('online WAL backup restores committed synthetic rows without changing source bytes', () => {
  const { root, directory, source, db } = fixture('online-wal');
  try {
    assert.ok(fs.statSync(`${source}-wal`).size > 0);
    const before = { database: sha256(source), wal: sha256(`${source}-wal`) };
    db.exec("BEGIN; INSERT INTO synthetic_saves VALUES (3, 'uncommitted synthetic save');");
    const metadata = successfulBackup(source, directory);
    assert.equal(metadata.quickCheck, 'ok');
    assert.equal(metadata.source, fs.realpathSync(source));
    assert.equal(path.dirname(metadata.backup), fs.realpathSync(directory));
    assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
    assert.equal(metadata.sha256, sha256(metadata.backup));
    assert.equal(metadata.bytes, fs.statSync(metadata.backup).size);
    assert.ok(metadata.pages > 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(`${metadata.backup}.json`, 'utf8')), metadata);
    assert.equal(sha256(source), before.database);
    assert.equal(sha256(`${source}-wal`), before.wal);
    db.exec('ROLLBACK');

    const restoredFile = path.join(root, 'isolated-restored.sqlite');
    fs.copyFileSync(metadata.backup, restoredFile, fs.constants.COPYFILE_EXCL);
    const restored = new DatabaseSync(restoredFile, { readOnly: true });
    try {
      assert.equal(restored.prepare('PRAGMA quick_check').get().quick_check, 'ok');
      assert.deepEqual(
        restored.prepare('SELECT id, label FROM synthetic_saves ORDER BY id').all().map(row => ({ ...row })),
        [{ id: 1, label: '合成研究存档' }, { id: 2, label: 'synthetic committed save' }]
      );
    } finally {
      restored.close();
    }
    assert.equal(sha256(restoredFile), metadata.sha256);
  } finally {
    db.close();
  }
});

test('repeated backups have unique paths and preserve earlier backups and unrelated files', () => {
  const { directory, source, db } = fixture('unique');
  try {
    const sentinel = path.join(directory, 'keep-existing.txt');
    fs.writeFileSync(sentinel, 'must stay untouched', { flag: 'wx' });
    const first = successfulBackup(source, directory);
    db.exec("INSERT INTO synthetic_saves VALUES (3, 'new committed synthetic save')");
    const second = successfulBackup(source, directory);
    assert.notEqual(first.backup, second.backup);
    assert.equal(sha256(first.backup), first.sha256);
    assert.notEqual(first.sha256, second.sha256);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'must stay untouched');
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.sqlite')).length, 2);
  } finally {
    db.close();
  }
});

test('missing sources fail without creating a database or a backup', () => {
  const directory = path.join(runRoot, 'missing-source');
  fs.mkdirSync(directory);
  const source = path.join(directory, 'missing.sqlite');
  const result = run(['--source', source, '--directory', directory]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Source must be an existing regular file/);
  assert.equal(fs.existsSync(source), false);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('invalid CLI paths and options fail before any backup is made', () => {
  const { directory, source, db } = fixture('arguments');
  try {
    for (const args of [
      ['--source', 'relative.sqlite', '--directory', directory],
      ['--source', source, '--directory', 'relative-directory'],
      ['--source', source, '--source', source, '--directory', directory],
      ['--unknown', source],
      ['--source'],
      ['--directory', '']
    ]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Usage:|absolute path/);
    }
    const wrongSource = run(['--source', directory, '--directory', directory]);
    assert.equal(wrongSource.status, 1);
    assert.match(wrongSource.stderr, /Source must be an existing regular file/);
    const missingDirectory = path.join(directory, 'not-created');
    const wrongDirectory = run(['--source', source, '--directory', missingDirectory]);
    assert.equal(wrongDirectory.status, 1);
    assert.match(wrongDirectory.stderr, /Backup directory must already exist/);
    assert.equal(fs.existsSync(missingDirectory), false);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    db.close();
  }
});

test('invalid database fails without publishing successful metadata or removing input', () => {
  const directory = path.join(runRoot, 'invalid-db');
  fs.mkdirSync(directory);
  const source = path.join(directory, 'invalid.sqlite');
  fs.writeFileSync(source, 'synthetic non-SQLite input', { flag: 'wx' });
  const before = sha256(source);
  const result = run(['--source', source, '--directory', directory]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Backup failed:/);
  assert.equal(result.stdout, '');
  assert.equal(sha256(source), before);
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.json')).length, 0);
});

test.after(() => {
  console.log(`Synthetic backup/restore artifacts: ${runRoot}`);
});
