const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');

const repository = path.resolve(__dirname, '../..');
const testRoot = path.join(repository, '.local/cloud-20261020/package/tests');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function temporary() {
  fs.mkdirSync(testRoot, { recursive: true });
  return fs.mkdtempSync(path.join(testRoot, 'run-'));
}
function builder() {
  assert.ok(fs.existsSync(path.join(__dirname, 'build-package.cjs')), 'Server package builder must exist');
  return require('./build-package.cjs');
}
function command(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
function archiveEntries(file) {
  const bytes = gunzipSync(fs.readFileSync(file));
  const entries = [];
  for (let offset = 0; offset + 512 <= bytes.length && bytes[offset] !== 0;) {
    const header = bytes.subarray(offset, offset + 512);
    const field = (start, end) => header.subarray(start, end).toString().replace(/\0.*$/, '');
    const size = parseInt(field(124, 136), 8);
    const name = [field(345, 500), field(0, 100)].filter(Boolean).join('/');
    entries.push({ name, mode: parseInt(field(100, 108), 8), type: field(156, 157) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
function get(port, route) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: route }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
function copyFixture(destination, excluded = '') {
  for (const file of builder().FILES) {
    if (file === excluded) continue;
    const output = path.join(destination, file);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(path.join(repository, file), output);
  }
}

test('entry pages and stylesheet resources stay inside the explicit allowlist', () => {
  const { FILES } = builder();
  for (const file of ['index.html', 'v2/index.html', 'v3/index.html']) {
    const source = fs.readFileSync(path.join(repository, 'investigation-game', file), 'utf8');
    for (const [, reference] of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:#|data:|https?:)/.test(reference)) continue;
      let resource = path.posix.normalize(path.posix.join('investigation-game', path.posix.dirname(file), reference));
      if (reference.endsWith('/')) resource = path.posix.join(resource, 'index.html');
      assert.ok(FILES.includes(resource), `Unlisted page dependency: ${resource}`);
    }
  }
  for (const file of FILES.filter(name => name.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(repository, file), 'utf8');
    for (const [, reference] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (/^(?:data:|https?:|#)/.test(reference)) continue;
      const resource = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
      assert.ok(FILES.includes(resource), `Unlisted CSS dependency: ${resource}`);
    }
  }
});

test('release extracts with verified hashes, safe permissions and working runtime dependencies', async t => {
  const { build, FILES } = builder();
  const temp = temporary();
  const result = build({ outputDir: path.join(temp, 'output'), workDir: path.join(temp, 'work') });
  const entries = archiveEntries(result.archivePath);
  assert.deepEqual(entries.map(entry => entry.name).sort(), [...FILES, 'SHA256SUMS'].sort());
  for (const entry of entries) {
    assert.ok(entry.type === '0' || entry.type === '', `Only regular files: ${entry.name}`);
    assert.equal(entry.mode & 0o022, 0, `No group/world write permission: ${entry.name}`);
    assert.ok(!entry.name.startsWith('/') && !entry.name.split('/').includes('..'));
  }
  assert.equal(fs.readFileSync(result.checksumPath, 'utf8'),
    `${sha256(fs.readFileSync(result.archivePath))}  ${path.basename(result.archivePath)}\n`);
  const extracted = path.join(temp, 'extracted');
  fs.mkdirSync(extracted);
  command(['-xzf', result.archivePath, '-C', extracted]);
  const manifest = fs.readFileSync(path.join(extracted, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.equal(manifest.length, FILES.length);
  for (const line of manifest) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert.ok(match, 'GNU sha256sum-compatible manifest line');
    const bytes = fs.readFileSync(path.join(extracted, match[2]));
    assert.equal(sha256(bytes), match[1], match[2]);
    assert.deepEqual(bytes, fs.readFileSync(path.join(repository, match[2])), match[2]);
  }
  for (const required of [
    'investigation-game/deploy/start.cjs', 'investigation-game/deploy/backup.cjs',
    'investigation-game/deploy/factorlab.service', 'investigation-game/deploy/factorlab-backup.service',
    'investigation-game/deploy/factorlab-backup.timer', 'investigation-game/accounts.cjs',
    'investigation-game/quick-check.cjs', 'investigation-game/coach-conversation.cjs', 'card-game/engine.js',
    'investigation-game/v3/assistant.js', 'investigation-game/v3/visuals.js', 'investigation-game/v3/report.js',
    'investigation-game/v2/vendor/i18next.LICENSE', 'investigation-game/v3/vendor/PHOSPHOR-LICENSE.txt',
    'investigation-game/v3/vendor/anime-LICENSE.md', 'investigation-game/v3/vendor/lottie-LICENSE.md',
    'investigation-game/v3/vendor/MOTION-LICENSE.txt'
  ]) assert.ok(fs.statSync(path.join(extracted, required)).isFile(), required);
  const { createServer } = require(path.join(extracted, 'investigation-game/server.cjs'));
  assert.equal(typeof require(path.join(extracted, 'investigation-game/deploy/start.cjs')).start, 'function');
  const serverSource = fs.readFileSync(path.join(extracted, 'investigation-game/server.cjs'), 'utf8');
  const assetsEnd = serverSource.indexOf('\nconst TYPES');
  assert.ok(assetsEnd > 0);
  const assets = vm.runInNewContext(serverSource.slice(0, assetsEnd) + '\n[...ASSETS]', {
    require: createRequire(path.join(extracted, 'investigation-game/server.cjs')), __dirname: path.join(extracted, 'investigation-game')
  });
  for (const [route, file] of assets) assert.ok(fs.statSync(file).isFile(), `Missing registered asset: ${route}`);
  const dataRoot = path.join(temp, 'isolated-test-data');
  const server = createServer({ env: {}, accounts: { dataRoot, dbPath: path.join(dataRoot, 'factorlab.sqlite') } });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  for (const route of ['/', '/v2/', '/v3/']) {
    const response = await get(port, route);
    assert.equal(response.status, 200, route);
    const links = [...response.bytes.toString().matchAll(/(?:src|href)="([^"]+)"/g)];
    for (const [, link] of links) {
      if (/^(?:#|data:|https?:)/.test(link)) continue;
      const target = new URL(link, `http://localhost${route}`).pathname;
      assert.equal((await get(port, target)).status, 200, `${route} -> ${link}`);
    }
  }
  for (const [route] of assets) assert.equal((await get(port, route)).status, 200, route);
  const status = await get(port, '/api/status');
  assert.deepEqual(JSON.parse(status.bytes.toString()), { configured: false, mode: 'example' });
  const session = await get(port, '/api/session');
  assert.equal(JSON.parse(session.bytes.toString()).enabled, true);
});

test('unlisted secrets, data, tests and source media cannot enter the archive', () => {
  const { build } = builder();
  const temp = temporary();
  const sourceRoot = path.join(temp, 'source');
  copyFixture(sourceRoot);
  for (const file of [
    'investigation-game/.env', 'investigation-game/accounts.sqlite',
    'investigation-game/v3/evidence/private.json', 'investigation-game/deploy/test-local.cjs',
    'investigation-game/v3/assets/mascot/manifest.json', 'private-source.mp4', '.git/config'
  ]) {
    const target = path.join(sourceRoot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'PACKAGE_SECRET_SENTINEL');
  }
  const result = build({ sourceRoot, outputDir: path.join(temp, 'output'), workDir: path.join(temp, 'work') });
  const names = archiveEntries(result.archivePath).map(entry => entry.name);
  assert.ok(names.every(name => !/(?:\.env|\.sqlite|evidence|(?:^|\/)test-|manifest\.json|private-source|\.git)/i.test(name)));
  assert.ok(!gunzipSync(fs.readFileSync(result.archivePath)).includes(Buffer.from('PACKAGE_SECRET_SENTINEL')));
});

test('missing runtime dependencies fail before a release is produced', () => {
  const { build } = builder();
  const temp = temporary();
  const sourceRoot = path.join(temp, 'source');
  copyFixture(sourceRoot, 'investigation-game/v2/simulation.js');
  const outputDir = path.join(temp, 'output');
  assert.throws(() => build({ sourceRoot, outputDir, workDir: path.join(temp, 'work') }), /simulation\.js/);
  assert.ok(!fs.existsSync(outputDir) || fs.readdirSync(outputDir).length === 0);
});
