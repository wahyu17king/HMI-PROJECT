// ── Room grid rendering: stats, filters, and cards ──
'use strict';

const STATUS_PREDICATES = {
  OCCUPIED: (room) => room.occupied,
  VACANT: (room) => !room.occupied,
  DND: (room) => room.dnd,
  MUR: (room) => room.mur,
  CLEAN: (room) => !(room.occupied && !room.cleaned),
  OFFLINE: (room) => !room.online
};

function applyFilters() {
  state.filters.floor = dom.byId('filterFloor').value;
  state.filters.type = dom.byId('filterType').value;
  state.filters.status = dom.byId('filterStatus').value;
  state.filters.search = dom.byId('filterSearch').value.trim().toUpperCase();
  renderGrid();
}

function matchesFilters(room) {
  const { floor, type, status, search } = state.filters;
  if (floor !== 'ALL' && room.floor !== parseInt(floor, 10)) return false;
  if (type !== 'ALL' && room.type !== type) return false;
  const predicate = STATUS_PREDICATES[status];
  if (predicate && !predicate(room)) return false;
  if (search && !room.num.includes(search) && !room.guest.toUpperCase().includes(search)) return false;
  return true;
}

function populateFloorFilter() {
  const select = dom.byId('filterFloor');
  for (let floor = 1; floor <= CONFIG.floors; floor++) {
    const option = document.createElement('option');
    option.value = floor;
    option.textContent = `Floor ${floor}`;
    select.appendChild(option);
  }
}

function render() {
  renderStats();
  renderGrid();
}

function renderStats() {
  const countWhere = (predicate) => rooms.reduce((sum, room) => sum + (predicate(room) ? 1 : 0), 0);
  const occupied = countWhere((room) => room.occupied);
  const cards = [
    { value: rooms.length, label: 'Total Rooms' },
    { value: occupied, label: 'Occupied', cls: 'occ' },
    { value: rooms.length - occupied, label: 'Vacant', cls: 'vac' },
    { value: countWhere((room) => room.dnd), label: 'DND Active', cls: 'dnd' },
    { value: countWhere((room) => room.mur), label: 'MUR Active', cls: 'mur' },
    { value: countWhere((room) => !room.online), label: 'Controllers Offline', cls: 'offline' }
  ];
  if (state.role === 'housekeeping') {
    cards.push({ value: countWhere((room) => room.occupied && !room.cleaned), label: 'Needs Cleaning', cls: 'clean' });
  }

  updateAlarmCount();
  dom.byId('stats').innerHTML = cards.map((card) => `
    <div class="stat-card${card.cls ? ` ${card.cls}` : ''}">
      <div class="val">${card.value}</div>
      <div class="lbl">${card.label}</div>
    </div>
  `).join('');
}

function buildBadgeRow(room) {
  let badges = '';
  if (room.dnd) badges += '<span class="badge badge-dnd">DND</span>';
  else if (room.mur) badges += '<span class="badge badge-mur">MUR</span>';
  badges += room.occupied
    ? '<span class="badge badge-occ">Occupied</span>'
    : '<span class="badge badge-vac">Vacant</span>';
  if (room.cleaned) badges += '<span class="badge badge-clean">Cleaned</span>';
  badges += room.online
    ? '<span class="badge badge-online">Online</span>'
    : '<span class="badge badge-offline">Offline</span>';
  return badges;
}

function buildRoomInfo(room) {
  const canSeeSetpoint = state.role === 'engineer' || state.role === 'admin';
  const items = [
    `<div class="info-item"><div class="info-label">Room Temp</div><div class="info-value temp">${room.acTemp}°C</div></div>`,
    canSeeSetpoint
      ? `<div class="info-item"><div class="info-label">Setpoint</div><div class="info-value temp">${room.acSet}°C</div></div>`
      : '<div></div>',
    `<div class="info-item"><div class="info-label">Address</div><div class="info-value">${escapeHTML(room.address || 'Not set')}</div></div>`,
    `<div class="info-item"><div class="info-label">IP</div><div class="info-value">${escapeHTML(room.ipAddress || 'Not set')}</div></div>`
  ];
  if (room.checkIn) items.push(`<div class="info-item"><div class="info-label">Check-In</div><div class="info-value">${escapeHTML(room.checkIn)}</div></div>`);
  if (room.checkOut) items.push(`<div class="info-item"><div class="info-label">Check-Out</div><div class="info-value">${escapeHTML(room.checkOut)}</div></div>`);
  return `<div class="room-info">${items.join('')}</div>`;
}

function buildRoomControls(room, index) {
  const offlineAttr = room.online ? '' : 'disabled title="Controller offline"';
  const buttons = [];
  const needsCleaning = room.occupied && !room.cleaned;
  const occupancyButton = room.occupied
    ? `<button class="btn btn-checkout" onclick="doCheckOut(${index})">Check-Out</button>`
    : `<button class="btn btn-checkin" onclick="openCheckIn(${index})">Check-In</button>`;

  if (state.role === 'housekeeping') {
    if (needsCleaning) buttons.push(`<button class="btn btn-clean" onclick="markClean(${index})">Mark Cleaned</button>`);
  } else if (state.role === 'admin') {
    buttons.push(occupancyButton);
  } else if (state.role === 'engineer') {
    buttons.push(occupancyButton);
    if (needsCleaning) buttons.push(`<button class="btn btn-clean" onclick="markClean(${index})">Mark Cleaned</button>`);
    buttons.push(`<button class="btn btn-ac btn-sm" onclick="toggleDND(${index})" ${offlineAttr}>${room.dnd ? 'DND ON' : 'DND OFF'}</button>`);
    buttons.push(`<button class="btn btn-ac btn-sm" onclick="toggleMUR(${index})" ${offlineAttr}>${room.mur ? 'MUR ON' : 'MUR OFF'}</button>`);
    if (!room.online) buttons.push(`<button class="btn btn-edit" onclick="restoreDemoLink(${index})">Restore Link (Demo)</button>`);
    buttons.push(`<button class="btn btn-edit" onclick="openRoomEditor(${index})">Edit</button>`);
  }

  return buttons.length ? `<div class="controls">${buttons.join('')}</div>` : '<div class="controls"></div>';
}

function buildAcControl(room, index) {
  if (state.role !== 'engineer') return '';
  return `<div class="ac-control">
    <span class="ac-label">AC Set</span>
    <input type="range" min="${CONFIG.minTempC}" max="${CONFIG.maxTempC}" value="${room.acSet}" oninput="setAC(${index},this.value)" ${room.online ? '' : 'disabled'}>
    <span class="sp-val" id="sp${index}">${room.acSet}°</span>
    <span class="command-state ${escapeHTML(room.commandState)}" id="cmd${index}" role="status">${commandStateLabel(room.commandState)}</span>
  </div>`;
}

function createRoomCard(room, index) {
  const cardClass = `${room.dnd ? 'dnd-active' : (room.occupied ? 'occupied' : 'vacant')}${room.online ? '' : ' offline'}`;
  const guest = room.occupied ? `<div class="guest-name">Guest: <strong>${escapeHTML(room.guest)}</strong></div>` : '';
  const lastSeen = new Date(room.lastSeenAt).toLocaleTimeString();
  const connectionInfo = `<div class="device-connection"><span class="connection-state ${room.online ? 'online' : 'offline'}">Controller ${room.online ? 'online' : 'offline'}</span><span>Last seen ${escapeHTML(lastSeen)}</span></div>`;

  const div = document.createElement('div');
  div.className = `room ${cardClass}`;
  div.innerHTML = `
    <div class="room-head">
      <div class="room-num-block">
        <div class="room-type">${escapeHTML(room.type)}</div>
        <div class="room-num">${escapeHTML(room.num)}</div>
      </div>
      <div class="badges">${buildBadgeRow(room)}</div>
    </div>
    ${guest}${connectionInfo}${buildRoomInfo(room)}${buildRoomControls(room, index)}${buildAcControl(room, index)}
  `;
  return div;
}

function renderGrid() {
  const grid = dom.byId('grid');
  const filtered = rooms.filter(matchesFilters);

  dom.byId('resultCount').innerHTML = `Showing <span>${filtered.length}</span> of ${rooms.length} Rooms`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-grid">No rooms match the current filters</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((room) => {
    fragment.appendChild(createRoomCard(room, rooms.indexOf(room)));
  });
  grid.innerHTML = '';
  grid.appendChild(fragment);
}
