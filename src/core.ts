import WebSocket from 'ws';
import { Context, DbSchema, Rooms, UserDataMap } from 'core';
import { appLogger } from './logging';
import { createMultimap } from './Multimap';

const logger = appLogger.child({ module: 'core' });

function heartbeat() {
  this.isAlive = true;
}

class JsonRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
  }
}

export function start(
  wss: WebSocket.Server,
  rooms: Rooms,
  userDataMap: UserDataMap,
) {
  const userContexts = createMultimap<string, Context>();

  wss.on('connection', (ws: WebSocket) => {
    (ws as any).isAlive = true;
    ws.on('pong', heartbeat);

    const ctx: Context = {
      ws,

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

    ws.on('message', message => {
      if (typeof message !== 'string') {
        return;
      }

      let data: any;

      try {
        data = JSON.parse(message);
      } catch {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
            },
          }),
        );

        return;
      }

      if (
        !data ||
        typeof data !== 'object' ||
        data.jsonrpc !== '2.0' ||
        typeof data.method !== 'string' ||
        !['array', 'object', 'undefined'].includes(typeof data.params) ||
        data.params === null
      ) {
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        });

        return;
      }

      const callLogger = logger.child({ id: data.id, method: data.method });

      callLogger.info('Handling JSON-RPC call');

      handleCallAsync(ctx, data.method, data.params).then(
        (result: any) => {
          logger.info('Success.');

          if ('id' in data) {
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: data.id,
                result: result ?? null,
              }),
            );
          }
        },
        (err: any) => {
          logger.error({ err }, 'Error.');

          if ('id' in data) {
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: data.id,
                error:
                  err instanceof JsonRpcError
                    ? {
                        code: err.code,
                        message: err.message,
                      }
                    : {
                        code: -32603,
                        message: 'Internal error',
                      },
              }),
            );
          }
        },
      );
    });

    ws.on('close', () => {
      if (ctx.username) {
        userContexts.delete(ctx.username, ctx);
      }
    });
  });

  async function handleCallAsync(
    ctx: Context,
    method: string,
    params?: any[] | object,
  ): Promise<any> {
    if (method !== 'login' && !ctx.username) {
      throw new JsonRpcError(1, 'Not logged in');
    }

    switch (method) {
      case 'login': {
        if (ctx.username) {
          throw new JsonRpcError(2, 'Already logged in');
        }

        const [username] = params as [string];

        ctx.username = username;

        ctx.userData = userDataMap[username];

        if (!ctx.userData) {
          ctx.userData = { joinedRooms: {} };
          userDataMap[username] = ctx.userData;
        }

        userContexts.put(username, ctx);

        for (const roomName in ctx.userData.joinedRooms) {
          for (const user in rooms[roomName].users) {
            ctx.send('joinRoom', { room: roomName, user });
          }

          for (const roomEvent of rooms[roomName].roomEvents) {
            ctx.send('roomEvent', { room: roomName, ...roomEvent });
          }
        }

        break;
      }

      case 'logout': {
        userContexts.delete(ctx.username, ctx);

        delete ctx.username;
        delete ctx.userData;

        break;
      }

      case 'getRooms': {
        return Object.keys(rooms);
      }

      case 'getUsers': {
        return Object.keys(userDataMap);
      }

      case 'joinRoom': {
        const [roomName] = params as [string];

        if (roomName in ctx.userData.joinedRooms) {
          throw new JsonRpcError(3, 'Already joined');
        }

        ctx.userData.joinedRooms[roomName] = true;

        let room = rooms[roomName];

        if (!room) {
          room = { users: {}, roomEvents: [], name: roomName };
          rooms[roomName] = room;
        }

        room.users[ctx.username] = true;

        sendToRoomUsers(room, 'joinRoom', {
          room: room.name,
          user: ctx.username,
        });

        if (!roomName.startsWith('!')) {
          processRoomEvent(room, { type: 'join', sender: ctx.username });
        }

        break;
      }

      case 'leaveRoom': {
        const [roomName] = params as [string];

        delete ctx.userData.joinedRooms[roomName];

        const room = rooms[roomName];

        if (!room) {
          throw new JsonRpcError(4, 'No such room');
        }

        if (!(ctx.username in room.users)) {
          throw new JsonRpcError(5, 'Not a member');
        }

        sendToRoomUsers(room, 'leaveRoom', {
          room: room.name,
          user: ctx.username,
        });

        delete room.users[ctx.username];

        if (!roomName.startsWith('!')) {
          processRoomEvent(room, { type: 'leave', sender: ctx.username });
        }

        break;
      }

      case 'sendMessage': {
        const p = params as {
          message: string;
        } & { to: 'room'; room: string };

        let room: Room;

        if (p.room.startsWith('!')) {
          const toUserName = p.room.replace(`!${ctx.username}`, '').slice(1);

          room = rooms[p.room];

          // if (!room) {
          //   room = {
          //     users: new Set([ctx.username, toUserName]),
          //     roomEvents: [],
          //     name: p.room,
          //   };

          //   rooms.set(p.room, room);

          const userData = userDataMap[toUserName];

          if (!userData) {
            throw new JsonRpcError(6, 'No such user');
          }

          if (!(p.room in userData.joinedRooms)) {
            userData.joinedRooms[p.room] = true;

            let room = rooms[p.room];

            if (!room) {
              room = { users: {}, roomEvents: [], name: p.room };
              rooms[p.room] = room;
            }

            // room.users.add(ctx.username);
            room.users[toUserName] = true;

            // sendToRoomUsers(room, 'joinRoom', {
            //   room: room.name,
            //   user: ctx.username,
            // });

            sendToRoomUsers(room, 'joinRoom', {
              room: p.room,
              user: ctx.username,
            });

            // processRoomEvent(room, { type: 'join', sender: ctx.username });
          }
          // }
        } else {
          if (!room) {
            throw new JsonRpcError(4, 'No such room');
          }

          const roomName = p.room;

          if (!(roomName in ctx.userData.joinedRooms)) {
            throw new JsonRpcError(5, 'Not a member');
          }
        }

        processRoomEvent(room, {
          type: 'message',
          sender: ctx.username,
          message: p.message,
        });

        break;
      }

      default:
        throw new JsonRpcError(-32601, 'Method not found');
    }
  }

  let roomEventId = 0;

  function processRoomEvent(
    room: Room,
    eventDetails: DistributiveOmit<RoomEvent, 'ts' | 'id'>,
  ) {
    const event: RoomEvent = {
      ts: Date.now(),
      id: roomEventId++,
      ...eventDetails,
    };

    room.roomEvents.push(event);

    for (const user in room.users) {
      for (const userCtx of userContexts.get(user) ?? []) {
        userCtx.send('roomEvent', {
          room: room.name,
          ...event,
        });
      }
    }
  }

  function sendToRoomUsers(room: Room, method: string, params: object) {
    for (const user in room.users) {
      for (const userCtx of userContexts.get(user) ?? []) {
        userCtx.send(method, params);
      }
    }
  }
}
