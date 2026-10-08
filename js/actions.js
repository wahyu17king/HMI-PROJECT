// ── Room actions: cleaning, occupancy, commands, and link simulation ──
'use strict';

const COMMAND_STATE_LABELS = {
  idle: 'No command',
  pending: 'Waiting',
  acknowledged: 'Confirmed',
  failed: 'Failed'
};

function commandStateLabel(commandState) {
  return COMMAND_STATE_LABELS[commandState] || 'Unknown';
}

function setCommandState(index, commandState) {
  rooms[index].commandState = commandState;
  const status = dom.byId(`cmd${index}`);
  if (status) {
    status.textContent = commandStateLabel(commandState);
    status.className = `command-state ${commandState}`;
  }
}

function markClean(index) {
  if (!requireRole(ROLE_ACCESS.cleaning)) return;
  const room = rooms[index];
  room.cleaned = true;
  room.dnd = false;
  room.mur = false;
  recordAudit('room_cleaned', room.num);
  toast(`Room ${room.num} Marked Cleaned`);
  render();
}

function failCommand(room, index, action, reason, message) {
  setCommandState(index, 'failed');
  createAlarm(room, 'command_failed', reason, 'high');
  recordCommandHistory(room, action, 'failed');
  recordAudit('command_failed', `${room.num}: ${action}`);
  toast(message);
}

function acknowledgeCommand(room, index, action, onAcknowledged) {
  onAcknowledged();
  room.lastSeenAt = new Date().toISOString();
  room.responseMs = Math.round(90 + Math.random() * 420);
  setCommandState(index, 'acknowledged');
  recordCommandHistory(room, action, 'confirmed', room.responseMs);
  recordAudit('command_acknowledged', `${room.num}: ${action}`);
  toast(`${action} confirmed · Room ${room.num}`);
}

function issueDeviceCommand(index, action, onAcknowledged) {
  if (!requireRole(ROLE_ACCESS.deviceCommands)) return;
  const room = rooms[index];

  if (!room.online) {
    failCommand(room, index, action,
      `${action} command failed while controller is offline`,
      `Command failed · Room ${room.num} is offline`);
    render();
    return;
  }

  setCommandState(index, 'pending');
  clearTimeout(state.pendingCommandTimeouts.get(index));
  state.pendingCommandTimeouts.set(index, setTimeout(() => {
    state.pendingCommandTimeouts.delete(index);
    if (!requireRole(ROLE_ACCESS.deviceCommands)) return;
    if (!room.online) {
      failCommand(room, index, action,
        `${action} command received no controller feedback`,
        `No controller feedback · Room ${room.num}`);
    } else {
      acknowledgeCommand(room, index, action, onAcknowledged);
    }
    render();
  }, CONFIG.commandAckDelayMs));
}

function toggleDND(index) {
  issueDeviceCommand(index, 'DND', () => {
    const room = rooms[index];
    room.dnd = !room.dnd;
    if (room.dnd) room.mur = false;
  });
}

function toggleMUR(index) {
  issueDeviceCommand(index, 'MUR', () => {
    const room = rooms[index];
    room.mur = !room.mur;
    if (room.mur) room.dnd = false;
  });
}

function setAC(index, value) {
  if (!requireRole(ROLE_ACCESS.deviceCommands)) return;
  const room = rooms[index];
  if (!room.online) {
    issueDeviceCommand(index, 'AC setpoint', () => {});
    return;
  }
  room.acSet = parseInt(value, 10);
  const label = dom.byId(`sp${index}`);
  if (label) label.textContent = `${value}°`;
  issueDeviceCommand(index, 'AC setpoint', () => {
    room.acTemp = room.acSet;
    appendTemperatureReading(room);
    recordAudit('setpoint_changed', `${room.num}: ${room.acSet}°C`);
  });
}

function restoreDemoLink(index) {
  if (!requireRole(ROLE_ACCESS.linkSimulation)) return;
  const room = rooms[index];
  if (!room || room.online) return;
  room.online = true;
  room.lastSeenAt = new Date().toISOString();
  room.responseMs = Math.round(90 + Math.random() * 220);
  resolveAlarmsForRoom(room.num, 'controller_offline');
  recordAudit('demo_link_restored', room.num);
  updateAlarmCount();
  toast(`Demo connection restored · Room ${room.num}`);
  render();
}

function simulateLinkDrop() {
  if (!requireRole(ROLE_ACCESS.linkSimulation)) return;
  const onlineRooms = rooms.filter((room) => room.online);
  if (onlineRooms.length === 0) {
    toast('All demo controllers are already offline.');
    return;
  }
  const room = randomElement(onlineRooms);
  room.online = false;
  room.disconnectCount = (room.disconnectCount || 0) + 1;
  room.responseMs = null;
  createAlarm(room, 'controller_offline', 'Room controller is offline', 'high');
  recordAudit('demo_link_dropped', room.num);
  toast(`Simulated link drop · Room ${room.num}`);
  render();
}

function openCheckIn(index) {
  if (!requireRole(ROLE_ACCESS.occupancy)) return;
  const room = rooms[index];
  const editable = state.role === 'engineer' ? '' : 'readonly';
  const today = new Date().toISOString().slice(0, 10);

  openModal({
    title: `Occupancy — Room ${room.num} (${room.type})`,
    bodyHtml: `
      <label>Guest Name</label>
      <input id="mGuest" placeholder="Full name" value="${escapeHTML(room.guest || '')}">
      <label>Check-In Date</label>
      <input id="mDate" type="date" value="${escapeHTML(room.checkIn || today)}">
      <label>KNX Address</label>
      <input id="mKnxAddress" value="${escapeHTML(room.address || '')}" placeholder="KNX/room/address" ${editable}>
      <label>Feedback KNX Address</label>
      <input id="mKnxFeedback" value="${escapeHTML(room.address ? `${room.address}/status` : '')}" placeholder="KNX/status/feedback" ${editable}>
    `,
    confirmButton: { label: 'Confirm', onClick: () => submitCheckIn(index) }
  });
}

function submitCheckIn(index) {
  if (!requireRole(ROLE_ACCESS.occupancy)) return;
  const room = rooms[index];
  const guestName = dom.byId('mGuest').value.trim();
  const checkInDate = dom.byId('mDate').value;
  if (!guestName) {
    toast('Guest Name Required');
    return;
  }

  if (state.role === 'engineer') {
    const knxAddress = dom.byId('mKnxAddress').value.trim();
    const knxFeedback = dom.byId('mKnxFeedback').value.trim();
    if (knxAddress) room.address = knxAddress;
    if (knxFeedback) room.feedbackAddress = knxFeedback;
  }

  room.occupied = true;
  room.guest = guestName;
  room.checkIn = checkInDate;
  room.checkOut = '';
  room.cleaned = false;
  room.dnd = false;
  room.mur = false;
  recordAudit('guest_checked_in', room.num);
  closeModal();
  toast(`${guestName} Checked In — Room ${room.num}`);
  render();
}

function doCheckOut(index) {
  if (!requireRole(ROLE_ACCESS.occupancy)) return;
  const room = rooms[index];
  if (!confirm(`Check out ${room.guest} from room ${room.num}?`)) return;
  room.checkOut = new Date().toISOString().slice(0, 10);
  room.occupied = false;
  room.guest = '';
  room.dnd = false;
  room.mur = false;
  room.cleaned = false;
  recordAudit('guest_checked_out', room.num);
  toast(`Room ${room.num} Checked Out`);
  render();
}
