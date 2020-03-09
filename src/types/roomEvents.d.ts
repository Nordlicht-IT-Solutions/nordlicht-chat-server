interface BaseRoomEvent {
  ts: number;
  id: number;
  sender: string;
}

interface MessageRoomEvent extends BaseRoomEvent {
  type: 'message';
  message: string;
}

interface JoinRoomEvent extends BaseRoomEvent {
  type: 'join';
}

interface LeaveRoomEvent extends BaseRoomEvent {
  type: 'leave';
}

type RoomEvent = MessageRoomEvent | JoinRoomEvent | LeaveRoomEvent;

type Room = {
  name: string;
  users: { [name: string]: true };
  roomEvents: RoomEvent[];
};
