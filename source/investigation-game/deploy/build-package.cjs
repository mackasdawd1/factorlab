const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGE_NAME = 'FactorLab-server-20261020.tar.gz';
const FILES = Object.freeze([
  'card-game/engine.js',
  ...[
    'server.cjs', 'accounts.cjs', 'quick-check.cjs', 'coach-conversation.cjs', 'chapter.js', 'research.js',
    'index.html', 'app.js', 'style.css', 'board.svg', 'design.html', 'sketch.svg',
    'deploy/start.cjs', 'deploy/backup.cjs', 'deploy/factorlab.service',
    'deploy/factorlab-backup.service', 'deploy/factorlab-backup.timer',
    'v2/index.html', 'v2/app.js', 'v2/style.css', 'v2/i18n.js', 'v2/simulation.js',
    'v2/vendor/i18next.min.js', 'v2/vendor/i18next.LICENSE', 'v2/import/zh-CN.html', 'v2/import/en.html',
    'v3/index.html', 'v3/app.js', 'v3/workspace.js', 'v3/icons.js', 'v3/style.css',
    'v3/quick-check.js', 'v3/quick-check.css', 'v3/accounts.js', 'v3/accounts.css',
    'v3/vendor/motion.js', 'v3/vendor/MOTION-LICENSE.txt', 'v3/vendor/PHOSPHOR-LICENSE.txt',
    'v3/vendor/anime.js', 'v3/vendor/anime-LICENSE.md', 'v3/vendor/lottie.js', 'v3/vendor/lottie-LICENSE.md',
    'v3/mascot.js', 'v3/experience.js', 'v3/theme.css', 'v3/icon-atlas.css', 'v3/assets/icons/woodcut-atlas.png',
    'v3/assistant.js', 'v3/visuals.js', 'v3/report.js',
    'v3/assets/mascot/poster.png', 'v3/assets/mascot/idle.mp4', 'v3/assets/mascot/welcome.mp4',
    'v3/assets/mascot/thinking.mp4', 'v3/assets/mascot/success.mp4',
    'v3/assets/mascot/growth.mp4', 'v3/assets/mascot/milestone.mp4',
    'v3/import/zh-CN.html', 'v3/import/en.html',
    'v3/delivery/FactorLab-Research-Studio.html', 'v3/delivery/FactorLab-Research-Studio-html-to-design.zip',
    ...[
      '01-research', '02-backtest', '03-allocation', '04-event', '05-risk',
      '06-review', '07-complete', '08-coach', '09-settings', '10-sources'
    ].flatMap(state => ['zh-CN', 'en'].map(language => `v3/import/screens/${state}-${language}.html`))
  ].map(file => `investigation-game/${file}`)
].sort());
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`tar failed: ${result.error?.message || result.stderr.trim() || result.status}`);
  return result.stdout;
}

function build({
  sourceRoot = ROOT,
  outputDir = path.join(ROOT, 'deliverables/cloud-20261020'),
  workDir = path.join(ROOT, '.local/cloud-20261020/package')
} = {}) {
  sourceRoot = fs.realpathSync(sourceRoot);
  const sources = FILES.map(file => {
    let current = sourceRoot;
    for (const component of file.split('/')) {
      current = path.join(current, component);
      if (fs.lstatSync(current).isSymbolicLink()) throw Error(`Symbolic links are not allowed in a release: ${file}`);
    }
    if (!fs.lstatSync(current).isFile()) throw Error(`Release source must be a regular file: ${file}`);
    const bytes = fs.readFileSync(current);
    return { path: file, bytes, sha256: sha256(bytes) };
  });
  const version = tar(['--version']);
  fs.mkdirSync(workDir, { recursive: true });
  const workPath = fs.mkdtempSync(path.join(path.resolve(workDir), 'build-'));
  const stagePath = path.join(workPath, 'release');
  fs.mkdirSync(stagePath);
  const manifest = sources.map(file => `${file.sha256}  ${file.path}\n`).join('');
  const staged = [...sources, { path: 'SHA256SUMS', bytes: Buffer.from(manifest) }];
  for (const file of staged) {
    const target = path.join(stagePath, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.bytes);
    fs.chmodSync(target, 0o444);
  }
  const stagedArchive = path.join(workPath, PACKAGE_NAME);
  const owner = /bsdtar/i.test(version) ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root']
    : ['--owner=0', '--group=0'];
  tar(['-czf', stagedArchive, '--format=ustar', ...owner, '-C', stagePath, ...staged.map(file => file.path)]);
  const listed = tar(['-tzf', stagedArchive]).trim().split(/\r?\n/).sort();
  const expected = staged.map(file => file.path).sort();
  if (listed.length !== expected.length || listed.some((name, index) => name !== expected[index])) throw Error('Archive file list differs from the release allowlist');
  const archiveHash = sha256(fs.readFileSync(stagedArchive));
  fs.mkdirSync(outputDir, { recursive: true });
  const archivePath = path.resolve(outputDir, PACKAGE_NAME);
  const checksumPath = `${archivePath}.sha256`;
  fs.copyFileSync(stagedArchive, archivePath);
  fs.writeFileSync(checksumPath, `${archiveHash}  ${PACKAGE_NAME}\n`);
  return {
    archivePath, checksumPath, stagePath, sha256: archiveHash,
    files: sources.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: file.sha256 }))
  };
}

if (require.main === module) {
  try {
    const result = build();
    process.stdout.write(JSON.stringify({
      archive: result.archivePath, checksum: result.checksumPath,
      sha256: result.sha256, files: result.files.length
    }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Server package was not built: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { build, FILES, PACKAGE_NAME };
