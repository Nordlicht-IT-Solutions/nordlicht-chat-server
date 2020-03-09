import WebSocket from 'ws';
import exitHook from 'async-exit-hook';
import { promises as fs } from 'fs';
import { appLogger } from './logging';
import { getEnv } from './env';
import { attachWsConnectionHandler } from './wsConnectionHandler';
import { installHeartbeat } from './wsHeartbeat';

const logger = appLogger.child({ module: 'app' });

loadDb().then(({ rooms, userDataMap }) => {
  const wss = new WebSocket.Server({
    port: Number(getEnv('SERVER_PORT', '8080')),
  });

  installHeartbeat(wss);

  attachWsConnectionHandler(wss, rooms, userDataMap);

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
});

async function loadDb(): Promise<DbSchema> {
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
