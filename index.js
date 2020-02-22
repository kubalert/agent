const http = require('http');
const k8s = require('@kubernetes/client-node');
const State = require('./src/State');
const Watcher = require('./src/Watcher');
const Socket = require('./src/Socket');

if (!process.env.TOKEN) {
  console.error('The "TOKEN" environment variable is required, find its value on your kubalert.io sources page.');
  process.exit(1);
}

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const state = new State();
const watcher = new Watcher(kubeConfig, state);
const socket = new Socket(process.env.URL || 'wss://source.kubalert.io', process.env.TOKEN);

watcher.init().then(async () => {
  state.on('change', change => {
    const latest = change.new ? change.new : change.old;
    if (change.type === 'MODIFIED' && (['Node'].includes(latest.kind) || ['kube-system', 'nginx-ingress'].includes(latest.metadata.namespace))) {
      return;
    }

    socket.send(JSON.stringify(change));
  });
  watcher.on('ERROR', err => {
    console.error('Watcher ERROR', err);
  });
  await watcher.start();
}).catch(err => {
  console.error('The agent cannot start. Is it running inside a Kubernetes cluster?', err.message);
  process.exit(1);
});

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.statusCode = (socket.open && watcher.active) ? 200 : 500;
  } else {
    res.statusCode = 404;
  }
  res.end();
}).listen(process.env.PORT || 80);

const shutdown = () => {
  watcher.stop();
  socket.close();
  server.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
