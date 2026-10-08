// ── Simulated telemetry / demo data generation ──
'use strict';

const GUEST_NAMES = [
  'John Smith', 'Emma Wilson', 'David Chen', 'Sarah Miller',
  'Michael Brown', 'Lisa Anderson', 'Robert Taylor', 'Anna Martinez'
];

function randomElement(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function roomTypeForFloor(floor) {
  const entry = ROOM_TYPE_BY_FLOOR.find((range) => floor >= range.minFloor && floor <= range.maxFloor);
  return entry ? entry.type : 'STANDARD';
}

function createTemperatureTrend(currentTemp) {
  const now = Date.now();
  return Array.from({ length: CONFIG.trendHours }, (_, index) => ({
    timestamp: new Date(now - (CONFIG.trendHours - 1 - index) * 60 * 60 * 1000).toISOString(),
    value: index === CONFIG.trendHours - 1
      ? currentTemp
      : Math.round((currentTemp + Math.sin(index / 11) * 1.2 + (Math.random() - 0.5) * 0.8) * 10) / 10
  }));
}

function appendTemperatureReading(room) {
  room.trendHistory.push({ timestamp: new Date().toISOString(), value: room.acTemp });
  room.trendHistory.splice(CONFIG.trendHours);
}

function ensureTrendHistory(room) {
  if (Array.isArray(room.trendHistory) && room.trendHistory.length) return;
  room.trendHistory = createTemperatureTrend(room.acTemp);
}

function defaultRoomState() {
  return {
    occupied: false,
    guest: '',
    acTemp: 22,
    acSet: 22,
    online: true,
    lastSeenAt: new Date().toISOString(),
    commandState: 'idle',
    responseMs: 120,
    disconnectCount: 0,
    trendHistory: createTemperatureTrend(22),
    cleaned: true,
    dnd: false,
    mur: false,
    checkIn: '',
    checkOut: '',
    functions: { dnd: false, mur: false, ac: true, lighting: true, curtains: true, doorLock: true }
  };
}

function createDemoRoom(floor, number) {
  const num = `${floor * 100 + number}`;
  const isOccupied = Math.random() > 0.4;
  const acTemp = 21 + Math.floor(Math.random() * 6);
  const online = (floor * CONFIG.roomsPerFloor + number) % 53 !== 0;

  return {
    ...defaultRoomState(),
    num,
    type: roomTypeForFloor(floor),
    floor,
    address: `KNX/${floor}/${number}`,
    feedbackAddress: `KNX/${floor}/${number}/status`,
    ipAddress: `192.168.${floor}.${number}`,
    functions: { dnd: false, mur: false, ac: true, lighting: true, curtains: true, doorLock: true },
    dnd: isOccupied && Math.random() > 0.85,
    mur: isOccupied && Math.random() > 0.9,
    occupied: isOccupied,
    guest: isOccupied ? randomElement(GUEST_NAMES) : '',
    acTemp,
    acSet: 22,
    online,
    lastSeenAt: new Date(Date.now() - (online ? Math.random() * 30_000 : 5 * 60_000)).toISOString(),
    responseMs: online ? Math.round(90 + Math.random() * 220) : null,
    disconnectCount: online ? 0 : 1,
    trendHistory: createTemperatureTrend(acTemp),
    cleaned: !isOccupied || Math.random() > 0.3,
    checkIn: isOccupied ? `2026-09-${25 + Math.floor(Math.random() * 5)}` : ''
  };
}

function generateDemoRooms() {
  for (let floor = 1; floor <= CONFIG.floors; floor++) {
    for (let number = 1; number <= CONFIG.roomsPerFloor; number++) {
      const room = createDemoRoom(floor, number);
      rooms.push(room);
      if (!room.online) {
        createAlarm(room, 'controller_offline', 'Room controller is offline', 'high');
      }
    }
  }
}
