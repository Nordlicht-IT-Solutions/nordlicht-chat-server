import WebSocket from 'ws';

type Rooms = { [key: string]: Room };

type UserDataMap = { [key: string]: UserData };

type DbSchema = {
  rooms: Rooms;
  userDataMap: UserDataMap;
};

type UserData = {
  joinedRooms: { [room: string]: true };
};

type Context = {
  username?: string;
  userData?: UserData;
  send: (method: string, params: object) => void;
  ws: WebSocket;
};
