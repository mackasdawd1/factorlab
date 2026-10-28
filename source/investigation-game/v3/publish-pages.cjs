const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { build, staging, output, sha } = require('./build-pages.cjs');

const repo = 'zhugeliang7512-eng/factorlab';
function api(endpoint, method = 'GET', body) {
  const args = ['api', `repos/${repo}/${endpoint}`, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  return JSON.parse(execFileSync('gh', args, {
    input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024, windowsHide: true, timeout: 60000
  }));
}
function publish() {
  const result = build();
  if (!process.argv.includes('--publish')) {
    console.log(JSON.stringify({ mode: 'preview', ...result }, null, 2));
    return;
  }
  const qa = JSON.parse(fs.readFileSync(path.join(staging, 'browser-pages.json'), 'utf8'));
  assert.equal(qa.version, result.version, 'Run browser-pages.cjs against this exact build before publishing');
  assert.equal(qa.status, 'PASS', 'The public build must pass browser checks');
  assert.ok(Date.now() - Date.parse(qa.finishedAt) < 24 * 60 * 60 * 1000, 'Repeat stale browser verification');
  const head = api('git/ref/heads/main').object.sha;
  const commit = api(`git/commits/${head}`);
  const before = api(`git/trees/${commit.tree.sha}?recursive=1`);
  assert.equal(before.truncated, false);
  const originals = new Map(before.tree.map(item => [item.path, item]));
  const paths = result.files.map(file => file.path);
  const archive = 'research-studio/previous/index.html';
  fs.writeFileSync(path.join(staging, `remote-before-${head}.json`), JSON.stringify({ head, commit, tree: before, plannedPaths: paths }, null, 2) + '\n');
  const changes = [];
  for (const file of result.files) {
    const bytes = fs.readFileSync(path.join(output, file.path.slice('research-studio/'.length)));
    assert.equal(sha(bytes), file.sha256);
    const gitSha = require('node:crypto').createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (originals.get(file.path)?.sha === gitSha) continue;
    assert.ok(!file.path.includes('/releases/') || !originals.has(file.path), `Immutable release was changed remotely: ${file.path}`);
    const blob = api('git/blobs', 'POST', { content: bytes.toString('base64'), encoding: 'base64' });
    assert.equal(blob.sha, gitSha);
    changes.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  if (!originals.has(archive)) {
    const original = originals.get('research-studio/index.html');
    assert.equal(original?.type, 'blob', 'The previous published entry must be preserved');
    changes.push({ path: archive, mode: '100644', type: 'blob', sha: original.sha });
  }
  if (!changes.length) {
    console.log(JSON.stringify({ unchanged: true, head, version: result.version }));
    return;
  }
  const tree = api('git/trees', 'POST', { base_tree: commit.tree.sha, tree: changes });
  const proposed = api(`git/trees/${tree.sha}?recursive=1`);
  assert.equal(proposed.truncated, false);
  const allowed = new Set([...paths, archive]);
  const after = new Map(proposed.tree.map(item => [item.path, item]));
  for (const item of before.tree.filter(item => item.type === 'blob')) {
    if (!allowed.has(item.path)) assert.equal(after.get(item.path)?.sha, item.sha, `Unrelated file changed: ${item.path}`);
  }
  for (const item of proposed.tree.filter(item => item.type === 'blob')) {
    if (!originals.has(item.path)) assert.ok(allowed.has(item.path), `Unexpected public file: ${item.path}`);
  }
  const created = api('git/commits', 'POST', {
    message: `Publish FactorLab research studio ${result.version}`,
    tree: tree.sha, parents: [head]
  });
  assert.equal(api('git/ref/heads/main').object.sha, head, 'Remote main changed; stop and review before retrying');
  api('git/refs/heads/main', 'PATCH', { sha: created.sha, force: false });
  const verified = api('git/ref/heads/main').object.sha;
  assert.equal(verified, created.sha);
  const receipt = {
    publishedAt: new Date().toISOString(), repository: repo, branch: 'main', previousCommit: head,
    commit: verified, version: result.version, changedPaths: changes.map(change => change.path),
    url: 'https://zhugeliang7512-eng.github.io/factorlab/research-studio/',
    deployment: 'PENDING', localDevelopmentCommit: false
  };
  fs.writeFileSync(path.join(staging, 'publication.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}
publish();
