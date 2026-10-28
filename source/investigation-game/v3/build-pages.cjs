const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const staging = path.join(root, '.local/pages-20261020');
const output = path.join(staging, 'site/research-studio');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [
  'style.css', 'quick-check.css', 'accounts.css', 'theme.css', 'pages-update.css', 'icon-atlas.css', 'assets/icons/woodcut-atlas.png',
  'assistant.js', 'visuals.js', 'report.js', 'app.js', 'workspace.js', 'icons.js', 'quick-check.js', 'accounts.js',
  'mascot.js', 'experience.js', 'pages-update.js',
  'vendor/anime.js', 'vendor/anime-LICENSE.md', 'vendor/lottie.js', 'vendor/lottie-LICENSE.md',
  'vendor/PHOSPHOR-LICENSE.txt',
  'assets/mascot/poster.png', ...['idle', 'welcome', 'thinking', 'success', 'growth', 'milestone'].map(name => `assets/mascot/${name}.mp4`)
];
const sharedFiles = {
  'shared/simulation.js': '../v2/simulation.js',
  'shared/i18n.js': '../v2/i18n.js',
  'shared/i18next.min.js': '../v2/vendor/i18next.min.js',
  'shared/i18next.LICENSE': '../v2/vendor/i18next.LICENSE',
  'shared/research.js': '../research.js'
};
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `Expected one source marker: ${from}`);
  return text.replace(from, () => to);
}
function build({cloud=false,staging:destination=staging}={}) {
  const output=path.join(destination,'site/research-studio');
  const files = new Map(sourceFiles.map(name => [name, fs.readFileSync(path.join(__dirname, name))]));
  if(cloud)for(const name of ['cloud.js','cloud-config.js','vendor/supabase-2.118.0.js','vendor/supabase-LICENSE.txt'])files.set(name,fs.readFileSync(path.join(__dirname,name)));
  for (const [name, source] of Object.entries(sharedFiles)) files.set(name, fs.readFileSync(path.resolve(__dirname, source)));
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  if(cloud)html=replaceOnce(html,'<script defer src="app.js"></script>','<script defer src="vendor/supabase-2.118.0.js"></script><script defer src="cloud-config.js"></script><script defer src="cloud.js"></script><script defer src="app.js"></script>');
  html = replaceOnce(html, '</head>', '<meta name="factorlab-hosting" content="static"><meta name="factorlab-version" content="__VERSION__"><link rel="stylesheet" href="pages-update.css"><script defer src="pages-update.js"></script></head>');
  for (const [name, source] of Object.entries(sharedFiles)) {
    if (name.endsWith('.js')) html = replaceOnce(html, `src="${source}"`, `src="${name}"`);
  }
  html = replaceOnce(html, 'href="import/zh-CN.html"', 'href="previous/"');
  html = html.replaceAll('旧版画板 · 10月13日', '上一版 · 10月13日').replaceAll('Previous screens · Oct 13', 'Previous version · Oct 13');
  html = replaceOnce(html, 'href="../v2/"', 'href="previous/"');
  html = html.replaceAll('打开保留的上一版', '打开 10月13日归档版本').replaceAll('Open the preserved previous version', 'Open the Oct 13 archived version');
  html = html.replace(/(src|href)="([^"]+\.(?:js|css))"/g, (_, attr, resource) => {
    assert.ok(files.has(resource), `Unlisted executable resource: ${resource}`);
    return `${attr}="releases/__VERSION__/${resource}"`;
  });
  files.set('mascot.js', Buffer.from(replaceOnce(files.get('mascot.js').toString(), "'assets/mascot/'", "'releases/__VERSION__/assets/mascot/'")));
  const digest = crypto.createHash('sha256').update(html);
  for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) digest.update(name).update('\0').update(bytes);
  const version = digest.digest('hex').slice(0, 16);
  const publish = new Map([['index.html', Buffer.from(html.replaceAll('__VERSION__', version))]]);
  for (const [name, bytes] of files) {
    const content = name === 'mascot.js' ? Buffer.from(bytes.toString().replaceAll('__VERSION__', version)) : bytes;
    publish.set(`releases/${version}/${name}`, content);
  }
  const manifest = {
    schema: 1, id: version,
    files: [...publish].map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: sha(bytes) }))
  };
  publish.set('version.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  for (const [name, bytes] of publish) {
    assert.ok(!/(?:\.env|\.sqlite|test-|evidence|manifest\.json)/i.test(name), `Private artifact in release: ${name}`);
    if (/\.(?:html|css|js|json)$/.test(name)) {
      const text = bytes.toString();
      assert.ok(!/(?:[A-Z]:[\\/](?:Users|ENT|Claude)|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{20,})|(?:sk-[A-Za-z0-9]{24,}))/i.test(text), `Private data pattern in ${name}`);
    }
    const destination = path.join(output, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  fs.mkdirSync(destination, { recursive: true });
  const result = { version, output, files: [...publish].map(([name, bytes]) => ({ path: `research-studio/${name}`, bytes: bytes.length, sha256: sha(bytes) })) };
  fs.writeFileSync(path.join(destination, 'build.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (require.main === module) {
  const result = build();
  console.log(JSON.stringify({ version: result.version, output: result.output, files: result.files.length, bytes: result.files.reduce((sum, file) => sum + file.bytes, 0) }));
}
module.exports = { build, staging, output, sha };
