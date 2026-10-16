#!/usr/bin/env node
// Exercise the browser's Engine.IO transport path without an application login.
const { Socket } = require('../webapp/node_modules/engine.io-client');

const [origin, hostHeader, socketPath='/socket.io/'] = process.argv.slice(2);
if (!origin || !/^https?:\/\//.test(origin)) {
  console.error('Usage: node scripts/check-socket-transport.cjs ORIGIN [HOST_HEADER] [SOCKET_PATH]');
  process.exit(2);
}

// Host header overrides can be dropped by a WebSocket client. Resolve the named
// origin to the requested address instead, so polling and upgrade share a host.
const address=new URL(origin), virtual=new URL(origin);
if(hostHeader)virtual.hostname=hostHeader;
const agent=hostHeader?new (require(address.protocol==='https:'?'https':'http').Agent)({lookup:(_hostname,options,callback)=>require('dns').lookup(address.hostname,options,callback)}):undefined;

function probe(index) {
  return new Promise((resolve, reject) => {
    const socket = new Socket(virtual.toString(), {
      path: socketPath,
      transports: ['polling', 'websocket'],
      agent,
    });
    let opened = false;
    let settled = false;
    let sawPolling = socket.transport?.name === 'polling';
    let sessionId;
    const timer = setTimeout(() => finish(new Error('timed out before WebSocket upgrade')), 12000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(new Error(`connection ${index}: ${error.message}`));
      else resolve();
    }

    socket.on('open', () => {
      opened = true;
      sessionId = socket.id;
      sawPolling ||= socket.transport?.name === 'polling';
    });
    socket.on('upgrade', (transport) => {
      if (!sessionId || socket.id !== sessionId || !sawPolling) {
        finish(new Error('upgrade did not preserve a polling session'));
      } else if (transport.name === 'websocket') {
        finish();
      }
    });
    socket.on('error', (error) => finish(new Error(`transport error: ${error.message}`)));
    socket.on('close', (reason) => {
      if (opened && !settled) finish(new Error(`closed before upgrade: ${reason}`));
    });
  });
}

Promise.allSettled(Array.from({ length: 8 }, (_, index) => probe(index + 1)))
  .then((results) => {
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      console.error(`Socket.IO transport probe failed: ${failure.reason.message}`);
      process.exitCode = 1;
    } else {
      console.log(`Socket.IO polling and WebSocket upgrade passed: ${origin}${socketPath}${hostHeader ? ` (Host: ${hostHeader})` : ''}`);
    }
    agent?.destroy();
    // A failed upgrade can leave an Engine.IO HTTP request open after close().
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
