import { appLogger } from './logging';
import { getEnv } from './env';
import WebSocket from 'ws';
import { createMultimap } from './Multimap';

const logger = appLogger.child({ module: 'app' });

const wss = new WebSocket.Server({
  port: Number(getEnv('SERVER_PORT', '8080')),
});

type UserData = {
  contacts: Set<string>;
  joinedRooms: Set<string>;
};

type Context = {
  username?: string;
  userData?: UserData;
  send: (method: string, params: object) => void;
  ws: WebSocket;
};

class JsonRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
  }
}

const userDataMap = new Map<string, UserData>();

const userContexts = createMultimap<string, Context>();

const rooms = new Map<string, Room>();

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

function heartbeat() {
  this.isAlive = true;
}

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

      ctx.userData = userDataMap.get(username);

      if (!ctx.userData) {
        ctx.userData = { contacts: new Set(), joinedRooms: new Set() };
        userDataMap.set(username, ctx.userData);
      }

      userContexts.put(username, ctx);

      for (const roomName of ctx.userData.joinedRooms) {
        for (const user of rooms.get(roomName).users) {
          ctx.send('joinRoom', { room: roomName, user });
        }

        for (const roomEvent of rooms.get(roomName).roomEvents) {
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

    // case 'addContact': {
    //   const [contact] = params as [string];

    //   ctx.userData.contacts.add(contact);

    //   break;
    // }

    // case 'removeContact': {
    //   const [contact] = params as [string];

    //   ctx.userData.contacts.delete(contact);

    //   break;
    // }

    // case 'getContacts':
    //   return [...ctx.userData.contacts];

    // case 'getJoinedRooms':
    //   return [...ctx.userData.joinedRooms];

    // case 'getRoomMessages': {
    //   const [roomName] = params as [string];

    //   return rooms.get(roomName).roomEvents; // TODO error on non-existent room
    // }

    // case 'getRoomUsers': {
    //   const [roomName] = params as [string];

    //   return [...rooms.get(roomName).users]; // TODO error on non-existent room
    // }

    case 'getRooms': {
      return [...rooms.keys()];
    }

    case 'joinRoom': {
      const [roomName] = params as [string];

      if (ctx.userData.joinedRooms.has(roomName)) {
        throw new JsonRpcError(3, 'Already joined');
      }

      ctx.userData.joinedRooms.add(roomName);

      let room = rooms.get(roomName);

      if (!room) {
        room = { users: new Set(), roomEvents: [], name: roomName };
        rooms.set(roomName, room);
      }

      room.users.add(ctx.username);

      sendToRoomUsers(room, 'joinRoom', {
        room: room.name,
        user: ctx.username,
      });

      processRoomEvent(room, { type: 'join', sender: ctx.username });

      break;
    }

    case 'leaveRoom': {
      const [roomName] = params as [string];

      ctx.userData.joinedRooms.delete(roomName);

      const room = rooms.get(roomName);

      if (!room) {
        throw new JsonRpcError(4, 'No such room');
      }

      if (!room.users.has(ctx.username)) {
        throw new JsonRpcError(5, 'Not a member');
      }

      sendToRoomUsers(room, 'leaveRoom', {
        room: room.name,
        user: ctx.username,
      });

      room.users.delete(ctx.username);

      processRoomEvent(room, { type: 'leave', sender: ctx.username });

      break;
    }

    case 'sendMessage': {
      const p = params as {
        message: string;
      } & ({ to: 'user'; user: string } | { to: 'room'; room: string });

      let room: Room;

      if (p.to === 'user') {
        const roomName = '!' + [ctx.username, p.user].sort().join('!');

        room = rooms.get(roomName);

        if (!room) {
          room = {
            users: new Set([ctx.username, p.user]),
            roomEvents: [],
            name: roomName,
          };

          rooms.set(roomName, room);
        }
      } else {
        const roomName = p.room;

        if (!ctx.userData.joinedRooms.has(roomName)) {
          throw new JsonRpcError(5, 'Not a member');
        }

        room = rooms.get(roomName);

        if (!room) {
          throw new JsonRpcError(4, 'No such room');
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

  for (const user of room.users) {
    for (const userCtx of userContexts.get(user) ?? []) {
      userCtx.send('roomEvent', {
        room: room.name,
        ...event,
      });
    }
  }
}

function sendToRoomUsers(room: Room, method: string, params: object) {
  for (const user of room.users) {
    for (const userCtx of userContexts.get(user) ?? []) {
      userCtx.send(method, params);
    }
  }
}
