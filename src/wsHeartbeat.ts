import WebSocket = require('ws');
import { getEnv } from './env';

export function installWsHeartbeat(wss: WebSocket.Server) {
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

  wss.on('connection', (ws: WebSocket) => {
    (ws as any).isAlive = true;

    ws.on('pong', heartbeat);
  });
}

function heartbeat() {
  this.isAlive = true;
}
