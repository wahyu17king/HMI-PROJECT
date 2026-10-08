// ── Shared application state (single mutable registry) ──
'use strict';

const state = {
  role: '',
  rooms: [],
  alarms: [],
  nextAlarmId: 1,
  auditEvents: [],
  commandHistory: [],
  shiftNotes: [],
  filters: { floor: 'ALL', type: 'ALL', status: 'ALL', search: '' },
  login: { failedAttempts: 0, lockoutUntil: 0 },
  idle: { timeoutId: undefined, lastActivityAt: 0 },
  pendingCommandTimeouts: new Map()
};

// Backward-compatible aliases used across the modules.
const rooms = state.rooms;
const alarms = state.alarms;
const auditEvents = state.auditEvents;
const commandHistory = state.commandHistory;
const shiftNotes = state.shiftNotes;

function loadLocalRecords(key) {
  try {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function persistLocalRecords(key, records) {
  try {
    localStorage.setItem(key, JSON.stringify(records));
  } catch {
    toast('Browser storage is unavailable; this entry will not persist.');
  }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function recordAudit(action, details = '') {
  auditEvents.unshift({
    timestamp: new Date().toISOString(),
    role: state.role || 'anonymous',
    action,
    details
  });
  auditEvents.splice(CONFIG.auditLogLimit);
}

function recordCommandHistory(room, action, outcome, responseMs = null) {
  commandHistory.unshift({
    timestamp: new Date().toISOString(),
    roomNum: room.num,
    role: state.role || 'anonymous',
    action,
    outcome,
    responseMs
  });
  commandHistory.splice(CONFIG.commandHistoryLimit);
  persistLocalRecords(CONFIG.storageKeys.commandHistory, commandHistory);
}

function createAlarm(room, type, message, priority = 'medium') {
  const existing = alarms.find((alarm) =>
    alarm.roomNum === room.num && alarm.type === type && !alarm.acknowledged && !alarm.resolvedAt
  );
  if (existing) return existing;
  const alarm = {
    id: state.nextAlarmId++,
    roomNum: room.num,
    type,
    message,
    priority,
    createdAt: new Date().toISOString(),
    acknowledged: false,
    resolvedAt: ''
  };
  alarms.unshift(alarm);
  if (state.role) recordAudit('alarm_created', `${room.num}: ${type}`);
  updateAlarmCount();
  return alarm;
}

function resolveAlarmsForRoom(roomNum, type) {
  const now = new Date().toISOString();
  alarms.forEach((alarm) => {
    if (alarm.roomNum === roomNum && alarm.type === type && !alarm.resolvedAt) {
      alarm.resolvedAt = now;
    }
  });
}
