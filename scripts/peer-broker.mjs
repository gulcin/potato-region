import { PeerServer } from 'peer';

PeerServer({
  port: 9000,
  path: '/signal',
  allow_discovery: false,
});

console.log('party broker on 127.0.0.1:9000/signal');
