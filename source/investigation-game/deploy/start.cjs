const path = require('node:path');
const { createServer } = require('../server.cjs');

function configuration(env = process.env) {
  const requestedRoot = env.FACTORLAB_DATA_DIR ?? '/var/lib/factorlab';
  if (typeof requestedRoot !== 'string' || !path.isAbsolute(requestedRoot)) throw Error('An absolute data root is required');
  const dataRoot = path.resolve(requestedRoot);
  if (dataRoot === path.parse(dataRoot).root) throw Error('The data root cannot be a filesystem root directory');
  const releaseRelative = path.relative(path.resolve(__dirname, '..'), dataRoot);
  if (!releaseRelative || (!releaseRelative.startsWith('..') && !path.isAbsolute(releaseRelative))) {
    throw Error('The data root must be outside the application directory');
  }
  const requestedPort = env.FACTORLAB_PORT ?? '18991';
  const port = Number(requestedPort);
  if (!/^\d+$/.test(requestedPort) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw Error('The port must be an integer between 1024 and 65535');
  }
  return { dataRoot, dbPath: path.join(dataRoot, 'factorlab.sqlite'), port };
}

async function start(env = process.env) {
  const { dataRoot, dbPath, port } = configuration(env);
  const server = createServer({ env, accounts: { dataRoot, dbPath } });
  await new Promise((resolve, reject) => {
    server.once('error', error => { server.close(); reject(error); });
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (require.main === module) {
  process.umask(0o077);
  start().then(server => {
    process.stdout.write(`FactorLab ready: http://127.0.0.1:${server.address().port}/v3/\n`);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => server.closeAllConnections(), 5000);
      deadline.unref();
      server.close(() => { clearTimeout(deadline); });
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }).catch(error => {
    process.stderr.write(`FactorLab could not start (${error.code || 'invalid configuration'}).\n`);
    process.exitCode = 1;
  });
}

module.exports = { configuration, start };
