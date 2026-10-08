// ── App-wide configuration constants (single source of truth) ──
'use strict';

const CONFIG = Object.freeze({
  floors: 12,
  roomsPerFloor: 40,
  trendHours: 168,
  commandHistoryLimit: 500,
  shiftNotesLimit: 100,
  auditLogLimit: 100,
  maxLoginAttempts: 5,
  lockoutDurationMs: 60_000,
  idleTimeoutMs: 10 * 60_000,
  commandAckDelayMs: 900,
  toastDurationMs: 2_500,
  slowResponseThresholdMs: 250,
  minTempC: 16,
  maxTempC: 30,
  storageKeys: Object.freeze({
    commandHistory: 'hmi.commandHistory',
    shiftNotes: 'hmi.shiftNotes'
  })
});

// Room types keyed by the floor range they occupy.
const ROOM_TYPE_BY_FLOOR = [
  { minFloor: 9, maxFloor: 10, type: 'DELUXE' },
  { minFloor: 11, maxFloor: 11, type: 'SUITE' },
  { minFloor: 12, maxFloor: 12, type: 'PRESIDENTIAL' }
];

const ROLE_ACCESS = Object.freeze({
  alarmCenter: ['admin', 'engineer', 'housekeeping'],
  acknowledgeAlarm: ['admin', 'engineer'],
  linkSimulation: ['engineer'],
  roomEditor: ['engineer'],
  occupancy: ['admin', 'engineer'],
  cleaning: ['housekeeping', 'engineer'],
  deviceCommands: ['engineer'],
  auditLog: ['admin', 'engineer'],
  export: ['admin', 'engineer'],
  features: ['admin', 'engineer', 'housekeeping']
});
