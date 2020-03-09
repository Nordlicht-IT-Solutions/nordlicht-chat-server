type Room = {
  name: string;
  users: { [name: string]: true };
  roomEvents: RoomEvent[];
};

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
  rooms: Rooms;
  userDataMap: UserDataMap;
  userContexts: Multimap<string, Context>;
};

type Multimap<K, V> = {
  get(key: K): Set<V>;
  has(key: K): void;
  put(key: K, value: V): void;
  deleteAll(key: K): void;
  delete(key: K, value: V): void;
};
