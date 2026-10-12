#!/usr/bin/env node
// Exercise the same polling -> WebSocket path as the browser, without a user token.
const { io } = require('../webapp/node_modules/socket.io-client');

const [origin, hostHeader] = process.argv.slice(2);
if (!origin || !/^https?:\/\//.test(origin)) {
  console.error('Usage: node scripts/check-socket-transport.cjs ORIGIN [HOST_HEADER]');
  process.exit(2);
}

function probe(index) {
  return new Promise((resolve, reject) => {
    const socket = io(origin, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      query: { token: 'socket-transport-probe' },
      extraHeaders: hostHeader ? { Host: hostHeader } : {},
      reconnection: false,
      timeout: 10000,
      forceNew: true,
    });
    let connected = false;
    let settled = false;
    let sawPolling = socket.io.engine?.transport?.name === 'polling';
    const timer = setTimeout(() => finish(new Error('timed out before WebSocket upgrade')), 12000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.disconnect();
      if (error) reject(new Error(`connection ${index}: ${error.message}`));
      else resolve();
    }

    socket.io.on('open', () => {
      sawPolling ||= socket.io.engine?.transport?.name === 'polling';
    });
    socket.on('connect', () => {
      connected = true;
      sawPolling ||= socket.io.engine?.transport?.name === 'polling';
      if (socket.io.engine?.transport?.name === 'websocket' && sawPolling) finish();
      socket.io.engine?.on('upgrade', (transport) => {
        if (transport.name === 'websocket' && sawPolling) finish();
      });
    });
    socket.on('connect_error', (error) => finish(new Error(`connect error: ${error.message}`)));
    socket.on('disconnect', (reason) => {
      if (connected && !settled) finish(new Error(`disconnected before upgrade: ${reason}`));
    });
  });
}

Promise.all(Array.from({ length: 8 }, (_, index) => probe(index + 1)))
  .then(() => console.log(`Socket.IO polling and WebSocket upgrade passed: ${origin}${hostHeader ? ` (Host: ${hostHeader})` : ''}`))
  .catch((error) => {
    console.error(`Socket.IO transport probe failed: ${error.message}`);
    process.exitCode = 1;
  });
