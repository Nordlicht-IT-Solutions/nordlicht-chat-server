import { appLogger } from './logging';
import { getEnv } from './env';
import WebSocket from 'ws';
import exitHook from 'async-exit-hook';
import { promises as fs } from 'fs';
import http from 'http';
import { DbSchema as Db } from 'core';
import { start } from './core';

const logger = appLogger.child({ module: 'app' });

const server = http.createServer();

const wss = new WebSocket.Server({
  noServer: true,
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  });
});

loadDb().then(({ rooms, userDataMap }) => {
  start(wss, rooms, userDataMap);

  exitHook((callback: () => void) => {
    fs.writeFile(
      'db.json',
      JSON.stringify({
        version: 1,
        rooms,
        userDataMap,
      }),
    ).finally(callback);
  });

  server.listen(Number(getEnv('SERVER_PORT', '8080')));
});

async function loadDb(): Promise<Db> {
  try {
    const data = (await fs.readFile('db.json', {
      encoding: 'UTF-8',
    })) as string;

    const value = JSON.parse(data);

    if (value && typeof value === 'object' && value.version === 1) {
      return value;
    }
  } catch (err) {
    logger.warn({ err }, 'Error loading store.');
  }

  return {
    rooms: {},
    userDataMap: {},
  };
}

setInterval(() => {
  wss.clients.forEach(function each(ws) {
    if ((ws as any).isAlive === false) {
      ws.terminate();
    } else {
      (ws as any).isAlive = false;
      ws.ping(() => {});
    }
  });
}, Number(getEnv('WS_KEEPALIVE_PERIOD', '30000')));
