import WebSocket from 'ws';
import { createMultimap } from './multimap';
import { createRpcHandler, JsonRpcError } from './rpc';
import { handleCallAsync } from './callHandler';

export function attachWsConnectionHandler(
  wss: WebSocket.Server,
  rooms: Rooms,
  userDataMap: UserDataMap,
) {
  const userContexts = createMultimap<string, Context>();

  wss.on('connection', (ws: WebSocket) => {
    const ctx: Context = {
      rooms,
      userDataMap,
      userContexts,

      send(method, params) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
          }),
        );
      },
    };

    ws.on(
      'message',
      createRpcHandler(handleCallAsync.bind(undefined, ctx), data => {
        ws.send(data);
      }),
    );

    ws.on('close', () => {
      if (ctx.username) {
        userContexts.delete(ctx.username, ctx);
      }
    });
  });
}
