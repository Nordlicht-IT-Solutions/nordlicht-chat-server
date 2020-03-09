import { JsonRpcError } from './rpc';

let roomEventId = Date.now() - 1583791699098;

export async function handleCallAsync(
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

      ctx.userData = ctx.userDataMap[username];

      if (!ctx.userData) {
        ctx.userData = { joinedRooms: {} };
        ctx.userDataMap[username] = ctx.userData;
      }

      ctx.userContexts.put(username, ctx);

      for (const roomName in ctx.userData.joinedRooms) {
        for (const user in ctx.rooms[roomName].users) {
          ctx.send('joinRoom', { room: roomName, user });
        }

        for (const roomEvent of ctx.rooms[roomName].roomEvents) {
          ctx.send('roomEvent', { room: roomName, ...roomEvent });
        }
      }

      break;
    }

    case 'logout': {
      ctx.userContexts.delete(ctx.username, ctx);

      delete ctx.username;
      delete ctx.userData;

      break;
    }

    case 'getRooms': {
      return Object.keys(ctx.rooms);
    }

    case 'getUsers': {
      return Object.keys(ctx.userDataMap);
    }

    case 'joinRoom': {
      const [roomName] = params as [string];

      if (roomName in ctx.userData.joinedRooms) {
        throw new JsonRpcError(3, 'Already joined');
      }

      ctx.userData.joinedRooms[roomName] = true;

      let room = ctx.rooms[roomName];

      if (!room) {
        room = { users: {}, roomEvents: [], name: roomName };
        ctx.rooms[roomName] = room;
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

      const room = ctx.rooms[roomName];

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

        room = ctx.rooms[p.room];

        // if (!room) {
        //   room = {
        //     users: new Set([ctx.username, toUserName]),
        //     roomEvents: [],
        //     name: p.room,
        //   };

        //   ctx.rooms.set(p.room, room);

        const userData = ctx.userDataMap[toUserName];

        if (!userData) {
          throw new JsonRpcError(6, 'No such user');
        }

        if (!(p.room in userData.joinedRooms)) {
          userData.joinedRooms[p.room] = true;

          let room = ctx.rooms[p.room];

          if (!room) {
            room = { users: {}, roomEvents: [], name: p.room };
            ctx.rooms[p.room] = room;
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
      for (const userCtx of ctx.userContexts.get(user) ?? []) {
        userCtx.send('roomEvent', {
          room: room.name,
          ...event,
        });
      }
    }
  }

  function sendToRoomUsers(room: Room, method: string, params: object) {
    for (const user in room.users) {
      for (const userCtx of ctx.userContexts.get(user) ?? []) {
        userCtx.send(method, params);
      }
    }
  }
}
