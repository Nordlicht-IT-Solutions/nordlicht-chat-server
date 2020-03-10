import WebSocket from 'ws';
import exitHook from 'async-exit-hook';
import { promises as fs } from 'fs';
import { getEnv } from './env';
import { attachWsConnectionHandler } from './wsConnectionHandler';
import { installWsHeartbeat } from './wsHeartbeat';
import { loadDb, currentDbVer } from './dbLoader';

loadDb().then(({ rooms, userDataMap }) => {
  const wss = new WebSocket.Server({
    path: '/chat',
    port: Number(getEnv('SERVER_PORT', '8080')),
  });

  installWsHeartbeat(wss);

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
