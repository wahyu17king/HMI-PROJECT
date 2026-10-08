// ── Room editor modal (add / edit room configuration) ──
'use strict';

const ROOM_TYPES = ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'];

const ROOM_FUNCTIONS = [
  { id: 'fnDnd', key: 'dnd', label: 'DND' },
  { id: 'fnMur', key: 'mur', label: 'MUR' },
  { id: 'fnAc', key: 'ac', label: 'AC' },
  { id: 'fnLighting', key: 'lighting', label: 'Lighting' },
  { id: 'fnCurtains', key: 'curtains', label: 'Curtains' },
  { id: 'fnDoorLock', key: 'doorLock', label: 'Door Lock' }
];

function readFunctionFlags() {
  return Object.fromEntries(ROOM_FUNCTIONS.map((fn) => [fn.key, dom.byId(fn.id).checked]));
}

function buildRoomEditorHtml(room) {
  const typeOptions = ROOM_TYPES.map((type) =>
    `<option value="${type}" ${room.type === type ? 'selected' : ''}>${type.charAt(0) + type.slice(1).toLowerCase()}</option>`
  ).join('');
  const functionChecks = ROOM_FUNCTIONS.map((fn) => {
    const enabled = room.functions ? room.functions[fn.key] !== false : true;
    return `<label><input type="checkbox" id="${fn.id}" ${enabled ? 'checked' : ''}> ${fn.label}</label>`;
  }).join('');

  return `
    <label>Room No</label>
    <input id="mRoomNo" value="${escapeHTML(room.num || '')}" placeholder="101">
    <label>Floor</label>
    <input id="mFloor" type="number" min="1" max="${CONFIG.floors}" value="${room.floor || 1}">
    <label>Room Type</label>
    <select id="mType">${typeOptions}</select>
    <label>KNX Address</label>
    <input id="mAddress" value="${escapeHTML(room.address || '')}" placeholder="KNX/1/10">
    <label>Feedback KNX Address</label>
    <input id="mFeedbackAddress" value="${escapeHTML(room.feedbackAddress || '')}" placeholder="KNX/1/10/status">
    <label>IP Address</label>
    <input id="mIpAddress" value="${escapeHTML(room.ipAddress || '')}" placeholder="192.168.1.10">
    <label>Functions</label>
    <div class="function-grid">${functionChecks}</div>
  `;
}

function collectRoomFormData(existingRoom) {
  const floorValue = parseInt(dom.byId('mFloor').value || '1', 10);
  return {
    num: dom.byId('mRoomNo').value.trim(),
    floor: Number.isNaN(floorValue) ? 1 : floorValue,
    type: dom.byId('mType').value,
    address: dom.byId('mAddress').value.trim(),
    feedbackAddress: dom.byId('mFeedbackAddress').value.trim(),
    ipAddress: dom.byId('mIpAddress').value.trim(),
    occupied: existingRoom.occupied || false,
    guest: existingRoom.guest || '',
    acTemp: existingRoom.acTemp || 22,
    acSet: existingRoom.acSet || 22,
    online: existingRoom.online !== false,
    lastSeenAt: existingRoom.lastSeenAt || new Date().toISOString(),
    commandState: existingRoom.commandState || 'idle',
    responseMs: existingRoom.responseMs ?? 120,
    disconnectCount: existingRoom.disconnectCount || 0,
    trendHistory: existingRoom.trendHistory || createTemperatureTrend(existingRoom.acTemp || 22),
    cleaned: existingRoom.cleaned !== undefined ? existingRoom.cleaned : true,
    dnd: existingRoom.dnd || false,
    mur: existingRoom.mur || false,
    checkIn: existingRoom.checkIn || '',
    checkOut: existingRoom.checkOut || '',
    functions: readFunctionFlags()
  };
}

function saveRoomForm(index) {
  if (!requireRole(ROLE_ACCESS.roomEditor)) return;
  const isEdit = index !== null;
  const existingRoom = isEdit ? rooms[index] : defaultRoomState();
  const roomData = collectRoomFormData(existingRoom);

  if (!roomData.num) { toast('Room number required'); return; }
  if (!roomData.address) { toast('Address required'); return; }

  if (isEdit) {
    rooms[index] = { ...rooms[index], ...roomData };
    recordAudit('room_updated', roomData.num);
    toast(`Room ${roomData.num} updated`);
  } else {
    if (rooms.some((room) => room.num === roomData.num)) {
      toast('Room number already exists');
      return;
    }
    rooms.push(roomData);
    recordAudit('room_added', roomData.num);
    toast(`Room ${roomData.num} added`);
  }

  closeModal();
  render();
}

function openRoomEditor(index = null) {
  if (!requireRole(ROLE_ACCESS.roomEditor)) return;
  const room = index !== null ? rooms[index] : defaultRoomState();

  openModal({
    title: index !== null ? `Edit Room ${room.num}` : 'Add Room',
    bodyHtml: buildRoomEditorHtml(room),
    confirmButton: { label: 'Confirm', onClick: () => saveRoomForm(index) }
  });
}

function removeRoom(index) {
  if (!requireRole(ROLE_ACCESS.roomEditor)) return;
  const target = rooms[index];
  if (!target) return;
  if (!confirm(`Remove room ${target.num}?`)) return;
  rooms.splice(index, 1);
  recordAudit('room_removed', target.num);
  toast(`Room ${target.num} removed`);
  render();
}
