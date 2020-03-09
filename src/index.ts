import WebSocket from 'ws';
import exitHook from 'async-exit-hook';
import { promises as fs } from 'fs';
import { getEnv } from './env';
import { attachWsConnectionHandler } from './wsConnectionHandler';
import { installHeartbeat } from './wsHeartbeat';
import { loadDb, currentDbVer } from './dbLoader';

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
        version: currentDbVer,
        rooms,
        userDataMap,
      }),
    ).finally(callback);
  });
});
