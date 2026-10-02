// ── DATA GENERATION (480 Rooms) ──
let role = '';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;
const IDLE_TIMEOUT_MS = 10 * 60_000;
let failedLoginAttempts = 0;
let lockoutUntil = 0;
let idleTimeoutId;
let lastActivityAt = 0;
const COMMAND_HISTORY_STORAGE_KEY = 'hmi.commandHistory';
const SHIFT_NOTES_STORAGE_KEY = 'hmi.shiftNotes';

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

const commandHistory = loadLocalRecords(COMMAND_HISTORY_STORAGE_KEY);
const shiftNotes = loadLocalRecords(SHIFT_NOTES_STORAGE_KEY);
const auditEvents = [];
const setpointAuditTimeouts = new Map();
const alarms = [];
let nextAlarmId = 1;
const rooms = [];
const floorCount = 12;
const roomsPerFloor = 40;

function createTemperatureTrend(currentTemp) {
  const now = Date.now();
  return Array.from({ length: 168 }, (_, index) => ({
    timestamp: new Date(now - (167 - index) * 60 * 60 * 1000).toISOString(),
    value: index === 167
      ? currentTemp
      : Math.round((currentTemp + Math.sin(index / 11) * 1.2 + (Math.random() - 0.5) * 0.8) * 10) / 10
  }));
}

for (let f = 1; f <= floorCount; f++) {
  for (let r = 1; r <= roomsPerFloor; r++) {
    const num = `${f * 100 + r}`;
    let type = 'STANDARD';
    if (f >= 9 && f <= 10) type = 'DELUXE';
    else if (f === 11) type = 'SUITE';
    else if (f === 12) type = 'PRESIDENTIAL';

    const isOccupied = Math.random() > 0.4;
    const guestNames = ['John Smith', 'Emma Wilson', 'David Chen', 'Sarah Miller', 'Michael Brown', 'Lisa Anderson', 'Robert Taylor', 'Anna Martinez'];
    const guest = isOccupied ? guestNames[Math.floor(Math.random() * guestNames.length)] : '';
    const acTemp = 21 + Math.floor(Math.random() * 6);
    const online = (f * roomsPerFloor + r) % 53 !== 0;
    
    rooms.push({
      num, type, floor: f,
      address: `KNX/${f}/${r}`,
      feedbackAddress: `KNX/${f}/${r}/status`,
      ipAddress: `192.168.${f}.${r}`,
      functions: {
        dnd: isOccupied && Math.random() > 0.85,
        mur: isOccupied && Math.random() > 0.9,
        ac: true,
        lighting: true,
        curtains: true,
        doorLock: true
      },
      dnd: isOccupied && Math.random() > 0.85,
      mur: isOccupied && Math.random() > 0.9,
      occupied: isOccupied,
      guest, acTemp, acSet: 22,
      online,
      lastSeenAt: new Date(Date.now() - (online ? Math.random() * 30_000 : 5 * 60_000)).toISOString(),
      commandState: 'idle',
      responseMs: online ? Math.round(90 + Math.random() * 220) : null,
      disconnectCount: online ? 0 : 1,
      trendHistory: createTemperatureTrend(acTemp),
      cleaned: !isOccupied || Math.random() > 0.3,
      checkIn: isOccupied ? '2026-09-' + (25 + Math.floor(Math.random() * 5)) : '',
      checkOut: ''
    });
    if (!online) createAlarm(rooms[rooms.length - 1], 'controller_offline', 'Room controller is offline', 'high');
  }
}

// Populate floor filter
const floorSelect = document.getElementById('filterFloor');
for (let f = 1; f <= floorCount; f++) {
  const opt = document.createElement('option');
  opt.value = f;
  opt.textContent = `Floor ${f}`;
  floorSelect.appendChild(opt);
}

// ── STATE & FILTERS ──
let filters = { floor: 'ALL', type: 'ALL', status: 'ALL', search: '' };

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function applyFilters() {
  filters.floor = document.getElementById('filterFloor').value;
  filters.type = document.getElementById('filterType').value;
  filters.status = document.getElementById('filterStatus').value;
  filters.search = document.getElementById('filterSearch').value.trim().toUpperCase();
  renderGrid();
}

function recordAudit(action, details = '') {
  auditEvents.unshift({
    timestamp: new Date().toISOString(),
    role: role || 'anonymous',
    action,
    details
  });
  auditEvents.splice(100);
}

function recordCommandHistory(room, action, outcome, responseMs = null) {
  commandHistory.unshift({
    timestamp: new Date().toISOString(),
    roomNum: room.num,
    role: role || 'anonymous',
    action,
    outcome,
    responseMs
  });
  commandHistory.splice(500);
  persistLocalRecords(COMMAND_HISTORY_STORAGE_KEY, commandHistory);
}

function appendTemperatureReading(room) {
  room.trendHistory.push({ timestamp: new Date().toISOString(), value: room.acTemp });
  room.trendHistory.splice(168);
}

function createAlarm(room, type, message, priority = 'medium') {
  const existing = alarms.find((alarm) => alarm.roomNum === room.num && alarm.type === type && !alarm.acknowledged && !alarm.resolvedAt);
  if (existing) return existing;
  const alarm = {
    id: nextAlarmId++,
    roomNum: room.num,
    type,
    message,
    priority,
    createdAt: new Date().toISOString(),
    acknowledged: false,
    resolvedAt: ''
  };
  alarms.unshift(alarm);
  if (role) recordAudit('alarm_created', `${room.num}: ${type}`);
  updateAlarmCount();
  return alarm;
}

function updateAlarmCount() {
  const count = alarms.filter((alarm) => !alarm.acknowledged && !alarm.resolvedAt).length;
  const badge = document.getElementById('alarmCount');
  if (badge) badge.textContent = count;
}

function openAlarmCenter() {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  const activeAlarms = alarms.filter((alarm) => !alarm.resolvedAt);
  document.getElementById('modalTitle').textContent = `Alarm Center · ${activeAlarms.length}`;
  document.getElementById('modalBody').className = 'alarm-center';
  document.getElementById('modalBody').innerHTML = `
    <div class="alarm-toolbar">
      <label for="alarmPriorityFilter">Priority</label>
      <select id="alarmPriorityFilter" onchange="renderAlarmEntries()">
        <option value="ALL">All priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
    <div id="alarmEntries" class="alarm-list"></div>
  `;
  document.getElementById('modalOk').hidden = true;
  document.getElementById('modal').classList.add('show');
  renderAlarmEntries();
}

function acknowledgeAlarm(id) {
  if (!requireRole(['admin', 'engineer'])) return;
  const alarm = alarms.find((item) => item.id === id && !item.resolvedAt);
  if (!alarm || alarm.acknowledged) return;
  alarm.acknowledged = true;
  recordAudit('alarm_acknowledged', `${alarm.roomNum}: ${alarm.type}`);
  updateAlarmCount();
  openAlarmCenter();
}

function restoreDemoLink(i) {
  if (!requireRole(['engineer'])) return;
  const room = rooms[i];
  if (!room || room.online) return;
  room.online = true;
  room.lastSeenAt = new Date().toISOString();
  room.responseMs = Math.round(90 + Math.random() * 220);
  alarms.forEach((alarm) => {
    if (alarm.roomNum === room.num && alarm.type === 'controller_offline' && !alarm.resolvedAt) {
      alarm.resolvedAt = new Date().toISOString();
    }
  });
  recordAudit('demo_link_restored', room.num);
  updateAlarmCount();
  toast(`Demo connection restored · Room ${room.num}`);
  render();
}

function simulateLinkDrop() {
  if (!requireRole(['engineer'])) return;
  const availableRooms = rooms.filter((room) => room.online);
  if (availableRooms.length === 0) {
    toast('All demo controllers are already offline.');
    return;
  }
  const room = availableRooms[Math.floor(Math.random() * availableRooms.length)];
  room.online = false;
  room.disconnectCount = (room.disconnectCount || 0) + 1;
  room.responseMs = null;
  createAlarm(room, 'controller_offline', 'Room controller is offline', 'high');
  recordAudit('demo_link_dropped', room.num);
  toast(`Simulated link drop · Room ${room.num}`);
  render();
}

// ── LOGIN / LOGOUT ──
const loginAccounts = {
  housekeeping: { username: 'housekeeping', password: 'hk123' },
  engineer: { username: 'engineer', password: 'eng123' },
  admin: { username: 'admin', password: 'admin123' }
};

document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const now = Date.now();
  if (now < lockoutUntil) {
    const seconds = Math.ceil((lockoutUntil - now) / 1000);
    document.getElementById('loginError').textContent = `Terlalu banyak percobaan. Coba lagi dalam ${seconds} detik.`;
    return;
  }

  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const account = Object.entries(loginAccounts).find(([, credentials]) =>
    credentials.username === username && credentials.password === password
  );

  if (!account) {
    recordAudit('login_failed');
    failedLoginAttempts += 1;
    if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      lockoutUntil = now + LOCKOUT_DURATION_MS;
      failedLoginAttempts = 0;
      recordAudit('login_locked', '60 seconds');
      document.getElementById('loginError').textContent = 'Terlalu banyak percobaan. Login dikunci selama 60 detik.';
      return;
    }
    const remaining = MAX_LOGIN_ATTEMPTS - failedLoginAttempts;
    document.getElementById('loginError').textContent = `Username atau password salah. Sisa percobaan: ${remaining}.`;
    return;
  }

  failedLoginAttempts = 0;
  document.getElementById('loginError').textContent = '';
  loginAs(account[0]);
});

function loginAs(r) {
  role = r;
  recordAudit('login_success');
  lastActivityAt = Date.now();
  resetIdleTimeout();
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const badge = document.getElementById('roleBadge');
  badge.textContent = r;
  badge.className = 'role-badge role-' + r;
  const addRoomBtn = document.getElementById('addRoomBtn');
  addRoomBtn.style.display = r === 'engineer' ? 'inline-flex' : 'none';
  document.getElementById('simulateLinkBtn').style.display = r === 'engineer' ? 'inline-flex' : 'none';
  document.getElementById('auditLogBtn').style.display = ['admin', 'engineer'].includes(r) ? 'inline-flex' : 'none';
  document.getElementById('exportBtn').style.display = ['admin', 'engineer'].includes(r) ? 'inline-flex' : 'none';
  render();
}
function logout(message = '') {
  clearTimeout(idleTimeoutId);
  setpointAuditTimeouts.forEach(clearTimeout);
  setpointAuditTimeouts.clear();
  rooms.forEach((room) => {
    if (room.commandState === 'pending') room.commandState = 'idle';
  });
  if (role) recordAudit(message ? 'session_timeout' : 'logout');
  role = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('loginForm').reset();
  document.getElementById('loginError').textContent = message;
  closeModal();
}

function requireRole(allowedRoles) {
  if (allowedRoles.includes(role)) return true;
  recordAudit('access_denied', allowedRoles.join(', '));
  toast(role ? 'Akses ditolak untuk role ini.' : 'Sesi berakhir. Silakan login kembali.');
  return false;
}

function openAuditLog() {
  if (!requireRole(['admin', 'engineer'])) return;
  document.getElementById('modalTitle').textContent = 'Security Audit Log';
  const entries = auditEvents.map((entry) => `
    <div class="audit-entry">
      <div class="audit-entry-header">
        <strong>${escapeHTML(entry.action)}</strong>
        <span>${escapeHTML(entry.role)}</span>
      </div>
      <div class="audit-entry-details">${escapeHTML(new Date(entry.timestamp).toLocaleString())}${entry.details ? ` · ${escapeHTML(entry.details)}` : ''}</div>
    </div>
  `).join('');
  document.getElementById('modalBody').className = 'audit-list';
  document.getElementById('modalBody').innerHTML = entries || '<p>No security events recorded.</p>';
  document.getElementById('modalOk').hidden = true;
  document.getElementById('modal').classList.add('show');
}

function resetIdleTimeout() {
  clearTimeout(idleTimeoutId);
  if (!role) return;
  lastActivityAt = Date.now();
  idleTimeoutId = setTimeout(() => logout('Sesi berakhir karena tidak ada aktivitas selama 10 menit.'), IDLE_TIMEOUT_MS);
}

['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    if (role) resetIdleTimeout();
  }, { passive: true });
});

document.addEventListener('visibilitychange', () => {
  if (role && !document.hidden && Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
    logout('Sesi berakhir karena tidak ada aktivitas selama 10 menit.');
  }
});

// ── RENDER ──
function render() {
  renderStats();
  renderGrid();
}

function renderStats() {
  const occ = rooms.filter(r => r.occupied).length;
  const vac = rooms.length - occ;
  const dnd = rooms.filter(r => r.dnd).length;
  const mur = rooms.filter(r => r.mur).length;
  const dirty = rooms.filter(r => r.occupied && !r.cleaned).length;
  const offline = rooms.filter(r => !r.online).length;
  updateAlarmCount();
  
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="val">${rooms.length}</div><div class="lbl">Total Rooms</div></div>
    <div class="stat-card occ"><div class="val">${occ}</div><div class="lbl">Occupied</div></div>
    <div class="stat-card vac"><div class="val">${vac}</div><div class="lbl">Vacant</div></div>
    <div class="stat-card dnd"><div class="val">${dnd}</div><div class="lbl">DND Active</div></div>
    <div class="stat-card mur"><div class="val">${mur}</div><div class="lbl">MUR Active</div></div>
    <div class="stat-card offline"><div class="val">${offline}</div><div class="lbl">Controllers Offline</div></div>
    ${role === 'housekeeping' ? `<div class="stat-card clean"><div class="val">${dirty}</div><div class="lbl">Needs Cleaning</div></div>` : ''}
  `;
}

function renderGrid() {
  const g = document.getElementById('grid');
  
  const filtered = rooms.filter(rm => {
    if (filters.floor !== 'ALL' && rm.floor !== parseInt(filters.floor)) return false;
    if (filters.type !== 'ALL' && rm.type !== filters.type) return false;
    if (filters.status === 'OCCUPIED' && !rm.occupied) return false;
    if (filters.status === 'VACANT' && rm.occupied) return false;
    if (filters.status === 'DND' && !rm.dnd) return false;
    if (filters.status === 'MUR' && !rm.mur) return false;
    if (filters.status === 'CLEAN' && (rm.occupied && !rm.cleaned)) return false;
    if (filters.status === 'OFFLINE' && rm.online) return false;
    if (filters.search && !rm.num.includes(filters.search) && !rm.guest.toUpperCase().includes(filters.search)) return false;
    return true;
  });

  document.getElementById('resultCount').innerHTML = `Showing <span>${filtered.length}</span> of ${rooms.length} Rooms`;

  if (filtered.length === 0) {
    g.innerHTML = `<div style="grid-column:1/-1; padding:60px; text-align:center; color:#666; text-transform:uppercase; letter-spacing:0.2em; font-size:12px;">No rooms match the current filters</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  
  filtered.forEach((rm) => {
    const i = rooms.indexOf(rm);
    const cls = `${rm.dnd ? 'dnd-active' : (rm.occupied ? 'occupied' : 'vacant')}${rm.online ? '' : ' offline'}`;
    
    let badges = '';
    if (rm.dnd) badges += '<span class="badge badge-dnd">DND</span>';
    else if (rm.mur) badges += '<span class="badge badge-mur">MUR</span>';
    badges += rm.occupied ? '<span class="badge badge-occ">Occupied</span>' : '<span class="badge badge-vac">Vacant</span>';
    if (rm.cleaned) badges += '<span class="badge badge-clean">Cleaned</span>';
    badges += rm.online ? '<span class="badge badge-online">Online</span>' : '<span class="badge badge-offline">Offline</span>';

    let guest = rm.occupied ? `<div class="guest-name">Guest: <strong>${escapeHTML(rm.guest)}</strong></div>` : '';
    const lastSeen = new Date(rm.lastSeenAt).toLocaleTimeString();
    const connectionInfo = `<div class="device-connection"><span class="connection-state ${rm.online ? 'online' : 'offline'}">Controller ${rm.online ? 'online' : 'offline'}</span><span>Last seen ${escapeHTML(lastSeen)}</span></div>`;

    let info = `
      <div class="room-info">
        <div class="info-item">
          <div class="info-label">Room Temp</div>
          <div class="info-value temp">${rm.acTemp}°C</div>
        </div>
    `;
    if (role === 'engineer' || role === 'admin') {
      info += `
        <div class="info-item">
          <div class="info-label">Setpoint</div>
          <div class="info-value temp">${rm.acSet}°C</div>
        </div>
      `;
    } else {
      info += `<div></div>`;
    }
    
    info += `<div class="info-item"><div class="info-label">Address</div><div class="info-value">${escapeHTML(rm.address || 'Not set')}</div></div>`;
    info += `<div class="info-item"><div class="info-label">IP</div><div class="info-value">${escapeHTML(rm.ipAddress || 'Not set')}</div></div>`;
    if (rm.checkIn) info += `<div class="info-item"><div class="info-label">Check-In</div><div class="info-value">${escapeHTML(rm.checkIn)}</div></div>`;
    if (rm.checkOut) info += `<div class="info-item"><div class="info-label">Check-Out</div><div class="info-value">${escapeHTML(rm.checkOut)}</div></div>`;
    info += '</div>';

    let controls = '<div class="controls">';
    if (role === 'housekeeping') {
      if (rm.occupied && !rm.cleaned) controls += `<button class="btn btn-clean" onclick="markClean(${i})">Mark Cleaned</button>`;
    }
    if (role === 'admin') {
      if (!rm.occupied) controls += `<button class="btn btn-checkin" onclick="openCheckIn(${i})">Check-In</button>`;
      else controls += `<button class="btn btn-checkout" onclick="doCheckOut(${i})">Check-Out</button>`;
    }
    if (role === 'engineer') {
      if (!rm.occupied) controls += `<button class="btn btn-checkin" onclick="openCheckIn(${i})">Check-In</button>`;
      else controls += `<button class="btn btn-checkout" onclick="doCheckOut(${i})">Check-Out</button>`;
      if (rm.occupied && !rm.cleaned) controls += `<button class="btn btn-clean" onclick="markClean(${i})">Mark Cleaned</button>`;
      controls += `<button class="btn btn-ac btn-sm" onclick="toggleDND(${i})" ${rm.online ? '' : 'disabled title="Controller offline"'}>${rm.dnd ? 'DND ON' : 'DND OFF'}</button>`;
      controls += `<button class="btn btn-ac btn-sm" onclick="toggleMUR(${i})" ${rm.online ? '' : 'disabled title="Controller offline"'}>${rm.mur ? 'MUR ON' : 'MUR OFF'}</button>`;
      if (!rm.online) controls += `<button class="btn btn-edit" onclick="restoreDemoLink(${i})">Restore Link (Demo)</button>`;
      controls += `<button class="btn btn-edit" onclick="openRoomEditor(${i})">Edit</button>`;
    }
    controls += '</div>';

    let acCtrl = '';
    if (role === 'engineer') {
      acCtrl = `<div class="ac-control">
        <span class="ac-label">AC Set</span>
        <input type="range" min="16" max="30" value="${rm.acSet}" oninput="setAC(${i},this.value)" ${rm.online ? '' : 'disabled'}>
        <span class="sp-val" id="sp${i}">${rm.acSet}°</span>
        <span class="command-state ${escapeHTML(rm.commandState)}" id="cmd${i}" role="status">${commandStateLabel(rm.commandState)}</span>
      </div>`;
    }

    const div = document.createElement('div');
    div.className = `room ${cls}`;
    div.innerHTML = `
      <div class="room-head">
        <div class="room-num-block">
          <div class="room-type">${escapeHTML(rm.type)}</div>
          <div class="room-num">${escapeHTML(rm.num)}</div>
        </div>
        <div class="badges">${badges}</div>
      </div>
      ${guest}${connectionInfo}${info}${controls}${acCtrl}
    `;
    fragment.appendChild(div);
  });
  
  g.innerHTML = '';
  g.appendChild(fragment);
}

// ── ACTIONS ──
function markClean(i) {
  if (!requireRole(['housekeeping', 'engineer'])) return;
  rooms[i].cleaned = true;
  rooms[i].dnd = false;
  rooms[i].mur = false;
  recordAudit('room_cleaned', rooms[i].num);
  toast(`Room ${rooms[i].num} Marked Cleaned`);
  render();
}

function commandStateLabel(state) {
  return ({
    idle: 'No command',
    pending: 'Waiting',
    acknowledged: 'Confirmed',
    failed: 'Failed'
  })[state] || 'Unknown';
}

function setCommandState(i, state) {
  rooms[i].commandState = state;
  const status = document.getElementById(`cmd${i}`);
  if (status) {
    status.textContent = commandStateLabel(state);
    status.className = `command-state ${state}`;
  }
}

function issueDeviceCommand(i, action, onAcknowledged) {
  if (!requireRole(['engineer'])) return;
  const room = rooms[i];
  if (!room.online) {
    setCommandState(i, 'failed');
    createAlarm(room, 'command_failed', `${action} command failed while controller is offline`, 'high');
    recordCommandHistory(room, action, 'failed');
    recordAudit('command_failed', `${room.num}: ${action}`);
    toast(`Command failed · Room ${room.num} is offline`);
    render();
    return;
  }

  setCommandState(i, 'pending');
  clearTimeout(setpointAuditTimeouts.get(i));
  setpointAuditTimeouts.set(i, setTimeout(() => {
    setpointAuditTimeouts.delete(i);
    if (!requireRole(['engineer'])) return;
    if (!room.online) {
      setCommandState(i, 'failed');
      createAlarm(room, 'command_failed', `${action} command received no controller feedback`, 'high');
      recordCommandHistory(room, action, 'failed');
      recordAudit('command_failed', `${room.num}: ${action}`);
      toast(`No controller feedback · Room ${room.num}`);
    } else {
      onAcknowledged();
      room.lastSeenAt = new Date().toISOString();
      room.responseMs = Math.round(90 + Math.random() * 420);
      setCommandState(i, 'acknowledged');
      recordCommandHistory(room, action, 'confirmed', room.responseMs);
      recordAudit('command_acknowledged', `${room.num}: ${action}`);
      toast(`${action} confirmed · Room ${room.num}`);
    }
    render();
  }, 900));
}

function toggleDND(i) {
  issueDeviceCommand(i, 'DND', () => {
    rooms[i].dnd = !rooms[i].dnd;
    if (rooms[i].dnd) rooms[i].mur = false;
  });
}
function toggleMUR(i) {
  issueDeviceCommand(i, 'MUR', () => {
    rooms[i].mur = !rooms[i].mur;
    if (rooms[i].mur) rooms[i].dnd = false;
  });
}
function setAC(i, v) {
  if (!requireRole(['engineer'])) return;
  if (!rooms[i].online) {
    issueDeviceCommand(i, 'AC setpoint', () => {});
    return;
  }
  rooms[i].acSet = parseInt(v);
  const el = document.getElementById('sp' + i);
  if (el) el.textContent = v + '°';
  issueDeviceCommand(i, 'AC setpoint', () => {
    rooms[i].acTemp = rooms[i].acSet;
    appendTemperatureReading(rooms[i]);
    recordAudit('setpoint_changed', `${rooms[i].num}: ${rooms[i].acSet}°C`);
  });
}

function openRoomEditor(i = null) {
  if (!requireRole(['engineer'])) return;

  const isEdit = i !== null;
  const room = isEdit ? rooms[i] : {
    num: '', floor: 1, type: 'STANDARD', address: '', feedbackAddress: '', ipAddress: '',
    online: true, lastSeenAt: new Date().toISOString(), commandState: 'idle',
    responseMs: 120, disconnectCount: 0, trendHistory: createTemperatureTrend(22),
    occupied: false, guest: '', acTemp: 22, acSet: 22, cleaned: true,
    dnd: false, mur: false, checkIn: '', checkOut: '',
    functions: { dnd: false, mur: false, ac: true, lighting: true, curtains: true, doorLock: true }
  };

  document.getElementById('modalTitle').textContent = isEdit ? `Edit Room ${room.num}` : 'Add Room';
  document.getElementById('modalBody').innerHTML = `
    <label>Room No</label>
    <input id="mRoomNo" value="${escapeHTML(room.num || '')}" placeholder="101">
    <label>Floor</label>
    <input id="mFloor" type="number" min="1" max="12" value="${room.floor || 1}">
    <label>Room Type</label>
    <select id="mType">
      <option value="STANDARD" ${room.type === 'STANDARD' ? 'selected' : ''}>Standard</option>
      <option value="DELUXE" ${room.type === 'DELUXE' ? 'selected' : ''}>Deluxe</option>
      <option value="SUITE" ${room.type === 'SUITE' ? 'selected' : ''}>Suite</option>
      <option value="PRESIDENTIAL" ${room.type === 'PRESIDENTIAL' ? 'selected' : ''}>Presidential</option>
    </select>
    <label>KNX Address</label>
    <input id="mAddress" value="${escapeHTML(room.address || '')}" placeholder="KNX/1/10">
    <label>Feedback KNX Address</label>
    <input id="mFeedbackAddress" value="${escapeHTML(room.feedbackAddress || '')}" placeholder="KNX/1/10/status">
    <label>IP Address</label>
    <input id="mIpAddress" value="${escapeHTML(room.ipAddress || '')}" placeholder="192.168.1.10">
    <label>Functions</label>
    <div class="function-grid">
      <label><input type="checkbox" id="fnDnd" ${room.functions?.dnd || room.dnd ? 'checked' : ''}> DND</label>
      <label><input type="checkbox" id="fnMur" ${room.functions?.mur || room.mur ? 'checked' : ''}> MUR</label>
      <label><input type="checkbox" id="fnAc" ${room.functions?.ac !== false ? 'checked' : ''}> AC</label>
      <label><input type="checkbox" id="fnLighting" ${room.functions?.lighting !== false ? 'checked' : ''}> Lighting</label>
      <label><input type="checkbox" id="fnCurtains" ${room.functions?.curtains !== false ? 'checked' : ''}> Curtains</label>
      <label><input type="checkbox" id="fnDoorLock" ${room.functions?.doorLock !== false ? 'checked' : ''}> Door Lock</label>
    </div>
  `;

  document.getElementById('modalOk').onclick = () => {
    if (!requireRole(['engineer'])) return;
    const roomNo = document.getElementById('mRoomNo').value.trim();
    const floor = parseInt(document.getElementById('mFloor').value || '1', 10);
    const type = document.getElementById('mType').value;
    const address = document.getElementById('mAddress').value.trim();
    const feedbackAddress = document.getElementById('mFeedbackAddress').value.trim();
    const ipAddress = document.getElementById('mIpAddress').value.trim();

    if (!roomNo) { toast('Room number required'); return; }
    if (!address) { toast('Address required'); return; }

    const roomData = {
      num: roomNo,
      floor: Number.isNaN(floor) ? 1 : floor,
      type,
      address,
      feedbackAddress,
      ipAddress,
      occupied: room.occupied || false,
      guest: room.guest || '',
      acTemp: room.acTemp || 22,
      acSet: room.acSet || 22,
      online: room.online !== false,
      lastSeenAt: room.lastSeenAt || new Date().toISOString(),
      commandState: room.commandState || 'idle',
      responseMs: room.responseMs ?? 120,
      disconnectCount: room.disconnectCount || 0,
      trendHistory: room.trendHistory || createTemperatureTrend(room.acTemp || 22),
      cleaned: room.cleaned !== undefined ? room.cleaned : true,
      dnd: room.dnd || false,
      mur: room.mur || false,
      checkIn: room.checkIn || '',
      checkOut: room.checkOut || '',
      functions: {
        dnd: document.getElementById('fnDnd').checked,
        mur: document.getElementById('fnMur').checked,
        ac: document.getElementById('fnAc').checked,
        lighting: document.getElementById('fnLighting').checked,
        curtains: document.getElementById('fnCurtains').checked,
        doorLock: document.getElementById('fnDoorLock').checked
      }
    };

    if (isEdit) {
      rooms[i] = { ...rooms[i], ...roomData };
      recordAudit('room_updated', roomNo);
      toast(`Room ${roomNo} updated`);
    } else {
      const exists = rooms.some(r => r.num === roomNo);
      if (exists) { toast('Room number already exists'); return; }
      rooms.push(roomData);
      recordAudit('room_added', roomNo);
      toast(`Room ${roomNo} added`);
    }

    closeModal();
    render();
  };

  document.getElementById('modal').classList.add('show');
}

function removeRoom(i) {
  if (!requireRole(['engineer'])) return;
  const target = rooms[i];
  if (!target) return;
  if (!confirm(`Remove room ${target.num}?`)) return;
  rooms.splice(i, 1);
  recordAudit('room_removed', target.num);
  toast(`Room ${target.num} removed`);
  render();
}

function openCheckIn(i) {
  if (!requireRole(['admin', 'engineer'])) return;
  document.getElementById('modalTitle').textContent = `Occupancy — Room ${rooms[i].num} (${rooms[i].type})`;
  document.getElementById('modalBody').innerHTML = `
    <label>Guest Name</label>
    <input id="mGuest" placeholder="Full name" value="${escapeHTML(rooms[i].guest || '')}">
    <label>Check-In Date</label>
    <input id="mDate" type="date" value="${escapeHTML(rooms[i].checkIn || new Date().toISOString().slice(0,10))}">
    <label>KNX Address</label>
    <input id="mKnxAddress" value="${escapeHTML(rooms[i].address || '')}" placeholder="KNX/room/address" ${role === 'engineer' ? '' : 'readonly'}>
    <label>Feedback KNX Address</label>
    <input id="mKnxFeedback" value="${escapeHTML(rooms[i].address ? rooms[i].address + '/status' : '')}" placeholder="KNX/status/feedback" ${role === 'engineer' ? '' : 'readonly'}>
  `;
  document.getElementById('modalOk').onclick = () => {
    if (!requireRole(['admin', 'engineer'])) return;
    const g = document.getElementById('mGuest').value.trim();
    const d = document.getElementById('mDate').value;
    if (!g) { toast('Guest Name Required'); return; }
    if (role === 'engineer') {
      const knxAddress = document.getElementById('mKnxAddress').value.trim();
      const knxFeedback = document.getElementById('mKnxFeedback').value.trim();
      if (knxAddress) rooms[i].address = knxAddress;
      if (knxFeedback) rooms[i].feedbackAddress = knxFeedback;
    }
    rooms[i].occupied = true;
    rooms[i].guest = g;
    rooms[i].checkIn = d;
    rooms[i].checkOut = '';
    rooms[i].cleaned = false;
    rooms[i].dnd = false;
    rooms[i].mur = false;
    recordAudit('guest_checked_in', rooms[i].num);
    closeModal();
    toast(`${g} Checked In — Room ${rooms[i].num}`);
    render();
  };
  document.getElementById('modal').classList.add('show');
}

function doCheckOut(i) {
  if (!requireRole(['admin', 'engineer'])) return;
  const rm = rooms[i];
  if (!confirm(`Check out ${rm.guest} from room ${rm.num}?`)) return;
  rm.checkOut = new Date().toISOString().slice(0, 10);
  rm.occupied = false;
  rm.guest = '';
  rm.dnd = false;
  rm.mur = false;
  rm.cleaned = false;
  recordAudit('guest_checked_out', rm.num);
  toast(`Room ${rm.num} Checked Out`);
  render();
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  document.getElementById('modal').classList.remove('wide');
  const confirmButton = document.getElementById('modalOk');
  confirmButton.hidden = false;
  confirmButton.textContent = 'Confirm';
  confirmButton.onclick = null;
  document.getElementById('modalBody').className = '';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}