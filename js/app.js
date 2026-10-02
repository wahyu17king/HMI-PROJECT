// ── DATA GENERATION (480 Rooms) ──
let role = '';
const rooms = [];
const floorCount = 12;
const roomsPerFloor = 40;

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
      cleaned: !isOccupied || Math.random() > 0.3,
      checkIn: isOccupied ? '2026-09-' + (25 + Math.floor(Math.random() * 5)) : '',
      checkOut: ''
    });
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

function applyFilters() {
  filters.floor = document.getElementById('filterFloor').value;
  filters.type = document.getElementById('filterType').value;
  filters.status = document.getElementById('filterStatus').value;
  filters.search = document.getElementById('filterSearch').value.trim().toUpperCase();
  renderGrid();
}

// ── LOGIN / LOGOUT ──
const loginAccounts = {
  housekeeping: { username: 'housekeeping', password: 'hk123' },
  engineer: { username: 'engineer', password: 'eng123' },
  admin: { username: 'admin', password: 'admin123' }
};

document.getElementById('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const account = Object.entries(loginAccounts).find(([, credentials]) =>
    credentials.username === username && credentials.password === password
  );

  if (!account) {
    document.getElementById('loginError').textContent = 'Username atau password salah.';
    return;
  }

  document.getElementById('loginError').textContent = '';
  loginAs(account[0]);
});

function loginAs(r) {
  role = r;
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const badge = document.getElementById('roleBadge');
  badge.textContent = r;
  badge.className = 'role-badge role-' + r;
  const addRoomBtn = document.getElementById('addRoomBtn');
  addRoomBtn.style.display = (r === 'admin' || r === 'engineer') ? 'inline-flex' : 'none';
  render();
}
function logout() {
  role = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('loginForm').reset();
  document.getElementById('loginError').textContent = '';
}

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
  
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="val">${rooms.length}</div><div class="lbl">Total Rooms</div></div>
    <div class="stat-card occ"><div class="val">${occ}</div><div class="lbl">Occupied</div></div>
    <div class="stat-card vac"><div class="val">${vac}</div><div class="lbl">Vacant</div></div>
    <div class="stat-card dnd"><div class="val">${dnd}</div><div class="lbl">DND Active</div></div>
    <div class="stat-card mur"><div class="val">${mur}</div><div class="lbl">MUR Active</div></div>
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
    const cls = rm.dnd ? 'dnd-active' : (rm.occupied ? 'occupied' : 'vacant');
    
    let badges = '';
    if (rm.dnd) badges += '<span class="badge badge-dnd">DND</span>';
    else if (rm.mur) badges += '<span class="badge badge-mur">MUR</span>';
    badges += rm.occupied ? '<span class="badge badge-occ">Occupied</span>' : '<span class="badge badge-vac">Vacant</span>';
    if (rm.cleaned) badges += '<span class="badge badge-clean">Cleaned</span>';

    let guest = rm.occupied ? `<div class="guest-name">Guest: <strong>${rm.guest}</strong></div>` : '';

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
    
    info += `<div class="info-item"><div class="info-label">Address</div><div class="info-value">${rm.address || 'Not set'}</div></div>`;
    info += `<div class="info-item"><div class="info-label">IP</div><div class="info-value">${rm.ipAddress || 'Not set'}</div></div>`;
    if (rm.checkIn) info += `<div class="info-item"><div class="info-label">Check-In</div><div class="info-value">${rm.checkIn}</div></div>`;
    if (rm.checkOut) info += `<div class="info-item"><div class="info-label">Check-Out</div><div class="info-value">${rm.checkOut}</div></div>`;
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
      controls += `<button class="btn btn-ac btn-sm" onclick="toggleDND(${i})">${rm.dnd ? 'DND ON' : 'DND OFF'}</button>`;
      controls += `<button class="btn btn-ac btn-sm" onclick="toggleMUR(${i})">${rm.mur ? 'MUR ON' : 'MUR OFF'}</button>`;
      controls += `<button class="btn btn-edit" onclick="openRoomEditor(${i})">Edit</button>`;
    }
    controls += '</div>';

    let acCtrl = '';
    if (role === 'engineer') {
      acCtrl = `<div class="ac-control">
        <span class="ac-label">AC Set</span>
        <input type="range" min="16" max="30" value="${rm.acSet}" oninput="setAC(${i},this.value)">
        <span class="sp-val" id="sp${i}">${rm.acSet}°</span>
      </div>`;
    }

    const div = document.createElement('div');
    div.className = `room ${cls}`;
    div.innerHTML = `
      <div class="room-head">
        <div class="room-num-block">
          <div class="room-type">${rm.type}</div>
          <div class="room-num">${rm.num}</div>
        </div>
        <div class="badges">${badges}</div>
      </div>
      ${guest}${info}${controls}${acCtrl}
    `;
    fragment.appendChild(div);
  });
  
  g.innerHTML = '';
  g.appendChild(fragment);
}

// ── ACTIONS ──
function markClean(i) {
  rooms[i].cleaned = true;
  rooms[i].dnd = false;
  rooms[i].mur = false;
  toast(`Room ${rooms[i].num} Marked Cleaned`);
  render();
}
function toggleDND(i) {
  if (rooms[i].dnd) {
    rooms[i].dnd = false;
  } else {
    rooms[i].dnd = true;
    rooms[i].mur = false;
  }
  toast(`Room ${rooms[i].num} DND: ${rooms[i].dnd ? 'ON' : 'OFF'}`);
  render();
}
function toggleMUR(i) {
  if (rooms[i].mur) {
    rooms[i].mur = false;
  } else {
    rooms[i].mur = true;
    rooms[i].dnd = false;
  }
  toast(`Room ${rooms[i].num} MUR: ${rooms[i].mur ? 'ON' : 'OFF'}`);
  render();
}
function setAC(i, v) {
  rooms[i].acSet = parseInt(v);
  const el = document.getElementById('sp' + i);
  if (el) el.textContent = v + '°';
  setTimeout(() => { rooms[i].acTemp = rooms[i].acSet; render(); }, 1500);
}

function openRoomEditor(i = null) {
  if (role !== 'engineer') {
    toast('Only engineer can manage room KNX address');
    return;
  }

  const isEdit = i !== null;
  const room = isEdit ? rooms[i] : {
    num: '', floor: 1, type: 'STANDARD', address: '', feedbackAddress: '', ipAddress: '',
    occupied: false, guest: '', acTemp: 22, acSet: 22, cleaned: true,
    dnd: false, mur: false, checkIn: '', checkOut: '',
    functions: { dnd: false, mur: false, ac: true, lighting: true, curtains: true, doorLock: true }
  };

  document.getElementById('modalTitle').textContent = isEdit ? `Edit Room ${room.num}` : 'Add Room';
  document.getElementById('modalBody').innerHTML = `
    <label>Room No</label>
    <input id="mRoomNo" value="${room.num || ''}" placeholder="101">
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
    <input id="mAddress" value="${room.address || ''}" placeholder="KNX/1/10">
    <label>Feedback KNX Address</label>
    <input id="mFeedbackAddress" value="${room.feedbackAddress || ''}" placeholder="KNX/1/10/status">
    <label>IP Address</label>
    <input id="mIpAddress" value="${room.ipAddress || ''}" placeholder="192.168.1.10">
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
      toast(`Room ${roomNo} updated`);
    } else {
      const exists = rooms.some(r => r.num === roomNo);
      if (exists) { toast('Room number already exists'); return; }
      rooms.push(roomData);
      toast(`Room ${roomNo} added`);
    }

    closeModal();
    render();
  };

  document.getElementById('modal').classList.add('show');
}

function removeRoom(i) {
  if (role !== 'engineer') {
    toast('Only engineer can remove rooms');
    return;
  }
  const target = rooms[i];
  if (!target) return;
  if (!confirm(`Remove room ${target.num}?`)) return;
  rooms.splice(i, 1);
  toast(`Room ${target.num} removed`);
  render();
}

function openCheckIn(i) {
  document.getElementById('modalTitle').textContent = `Occupancy — Room ${rooms[i].num} (${rooms[i].type})`;
  document.getElementById('modalBody').innerHTML = `
    <label>Guest Name</label>
    <input id="mGuest" placeholder="Full name" value="${rooms[i].guest || ''}">
    <label>Check-In Date</label>
    <input id="mDate" type="date" value="${rooms[i].checkIn || new Date().toISOString().slice(0,10)}">
    <label>KNX Address</label>
    <input id="mKnxAddress" value="${rooms[i].address || ''}" placeholder="KNX/room/address" ${role === 'engineer' ? '' : 'readonly'}>
    <label>Feedback KNX Address</label>
    <input id="mKnxFeedback" value="${rooms[i].address ? rooms[i].address + '/status' : ''}" placeholder="KNX/status/feedback" ${role === 'engineer' ? '' : 'readonly'}>
  `;
  document.getElementById('modalOk').onclick = () => {
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
    closeModal();
    toast(`${g} Checked In — Room ${rooms[i].num}`);
    render();
  };
  document.getElementById('modal').classList.add('show');
}

function doCheckOut(i) {
  const rm = rooms[i];
  if (!confirm(`Check out ${rm.guest} from room ${rm.num}?`)) return;
  rm.checkOut = new Date().toISOString().slice(0, 10);
  rm.occupied = false;
  rm.guest = '';
  rm.dnd = false;
  rm.mur = false;
  rm.cleaned = false;
  toast(`Room ${rm.num} Checked Out`);
  render();
}

function closeModal() { document.getElementById('modal').classList.remove('show'); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}