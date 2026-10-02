function ensureTrendHistory(room) {
  if (Array.isArray(room.trendHistory) && room.trendHistory.length) return;
  const now = Date.now();
  room.trendHistory = Array.from({ length: 168 }, (_, index) => ({
    timestamp: new Date(now - (167 - index) * 60 * 60 * 1000).toISOString(),
    value: index === 167
      ? room.acTemp
      : Math.round((room.acTemp + Math.sin(index / 11) * 1.2 + (Math.random() - 0.5) * 0.8) * 10) / 10
  }));
}

function openTrendExplorer(roomIndex = 0) {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  const room = rooms[roomIndex] || rooms[0];
  document.getElementById('modalTitle').textContent = 'Temperature Trends';
  document.getElementById('modalBody').className = 'feature-panel';
  document.getElementById('modalBody').innerHTML = `
    <div class="feature-toolbar">
      <label for="trendRoomNumber">Room</label>
      <input id="trendRoomNumber" type="number" value="${escapeHTML(room.num)}" aria-label="Room number">
      <label for="trendPeriod">Period</label>
      <select id="trendPeriod"><option value="24h">24 hours</option><option value="7d">7 days</option></select>
      <button class="btn btn-ac" type="button" onclick="renderTrendChart()">Show</button>
    </div>
    <canvas id="trendChart" class="trend-chart" role="img" aria-label="Room temperature trend chart"></canvas>
    <div id="trendSummary" class="trend-summary" role="status"></div>
  `;
  document.getElementById('modalOk').hidden = true;
  document.getElementById('modal').classList.add('show');
  renderTrendChart();
}

function renderTrendChart() {
  const roomNumber = document.getElementById('trendRoomNumber')?.value.trim();
  const room = rooms.find((item) => item.num === roomNumber);
  const canvas = document.getElementById('trendChart');
  const summary = document.getElementById('trendSummary');
  if (!canvas || !summary) return;
  if (!room) {
    summary.textContent = 'Room not found.';
    return;
  }

  ensureTrendHistory(room);
  const period = document.getElementById('trendPeriod').value;
  const readings = period === '24h' ? room.trendHistory.slice(-24) : room.trendHistory.slice(-168);
  const values = readings.map((reading) => reading.value);
  const width = Math.max(canvas.clientWidth, 280);
  const height = 250;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const padding = { top: 18, right: 14, bottom: 32, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minimum = Math.floor(Math.min(...values) - 1);
  const maximum = Math.ceil(Math.max(...values) + 1);
  context.font = '11px Segoe UI, sans-serif';
  context.strokeStyle = 'rgba(255,255,255,0.12)';
  context.fillStyle = '#9bb0cc';
  context.lineWidth = 1;

  for (let line = 0; line <= 4; line++) {
    const y = padding.top + chartHeight * line / 4;
    const value = maximum - (maximum - minimum) * line / 4;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${value.toFixed(0)}°`, 4, y + 4);
  }

  context.strokeStyle = '#64d3ff';
  context.lineWidth = 2;
  context.beginPath();
  readings.forEach((reading, index) => {
    const x = padding.left + chartWidth * index / Math.max(readings.length - 1, 1);
    const y = padding.top + chartHeight * (maximum - reading.value) / (maximum - minimum || 1);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  const start = new Date(readings[0].timestamp);
  const end = new Date(readings[readings.length - 1].timestamp);
  context.fillStyle = '#9bb0cc';
  context.fillText(start.toLocaleString(), padding.left, height - 8);
  const endLabel = end.toLocaleString();
  context.fillText(endLabel, Math.max(padding.left, width - padding.right - context.measureText(endLabel).width), height - 8);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  summary.textContent = `Room ${room.num} · ${period} · Min ${Math.min(...values).toFixed(1)}°C · Avg ${average.toFixed(1)}°C · Max ${Math.max(...values).toFixed(1)}°C`;
}

function openCommandHistory() {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  document.getElementById('modalTitle').textContent = 'Command History';
  document.getElementById('modalBody').className = 'feature-panel';
  document.getElementById('modalBody').innerHTML = `
    <label for="historyRoomNumber">Filter by room</label>
    <input id="historyRoomNumber" type="search" placeholder="All rooms">
    <div id="commandHistoryList" class="history-list"></div>
  `;
  document.getElementById('modalOk').hidden = true;
  document.getElementById('modal').classList.add('show');
  document.getElementById('historyRoomNumber').addEventListener('input', renderCommandHistory);
  renderCommandHistory();
}

function renderCommandHistory() {
  const list = document.getElementById('commandHistoryList');
  if (!list) return;
  const roomFilter = document.getElementById('historyRoomNumber').value.trim().toLowerCase();
  const entries = commandHistory
    .filter((entry) => !roomFilter || String(entry.roomNum).toLowerCase().includes(roomFilter))
    .slice(0, 100);
  list.innerHTML = entries.map((entry) => `
    <div class="history-entry">
      <div class="history-entry-main"><strong>Room ${escapeHTML(entry.roomNum)}</strong><span class="outcome-${escapeHTML(entry.outcome)}">${escapeHTML(entry.outcome)}</span></div>
      <div class="history-entry-meta">${escapeHTML(entry.action)} · ${escapeHTML(entry.role)} · ${escapeHTML(new Date(entry.timestamp).toLocaleString())}${entry.responseMs === null ? '' : ` · ${escapeHTML(entry.responseMs)} ms`}</div>
    </div>
  `).join('') || '<p>No commands recorded for this filter.</p>';
}

function openShiftHandover() {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  document.getElementById('modalTitle').textContent = 'Shift Handover';
  document.getElementById('modalBody').className = 'feature-panel';
  document.getElementById('modalBody').innerHTML = `
    <label for="handoverShift">Shift</label>
    <select id="handoverShift"><option>Day</option><option>Evening</option><option>Night</option></select>
    <label for="handoverOperator">Operator</label>
    <input id="handoverOperator" value="${escapeHTML(role)}" maxlength="40">
    <label for="handoverNote">Handover note</label>
    <textarea id="handoverNote" rows="4" maxlength="1000" placeholder="Outstanding alarms, work in progress, follow-up..."></textarea>
    <h4>Recent Notes</h4>
    <div id="shiftNoteList" class="history-list"></div>
  `;
  const confirmButton = document.getElementById('modalOk');
  confirmButton.hidden = false;
  confirmButton.textContent = 'Save Note';
  confirmButton.onclick = saveShiftNote;
  document.getElementById('modal').classList.add('show');
  renderShiftNotes();
}

function renderShiftNotes() {
  const list = document.getElementById('shiftNoteList');
  if (!list) return;
  list.innerHTML = shiftNotes.slice(0, 20).map((entry) => `
    <div class="history-entry">
      <div class="history-entry-main"><strong>${escapeHTML(entry.shift)} shift · ${escapeHTML(entry.operator)}</strong><span>${escapeHTML(entry.role)}</span></div>
      <div class="history-entry-meta">${escapeHTML(new Date(entry.timestamp).toLocaleString())}</div>
      <p>${escapeHTML(entry.note)}</p>
    </div>
  `).join('') || '<p>No handover notes yet.</p>';
}

function saveShiftNote() {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  const note = document.getElementById('handoverNote').value.trim();
  if (!note) {
    toast('Enter a handover note first.');
    return;
  }
  shiftNotes.unshift({
    timestamp: new Date().toISOString(),
    shift: document.getElementById('handoverShift').value,
    operator: document.getElementById('handoverOperator').value.trim() || role,
    role,
    note
  });
  shiftNotes.splice(100);
  persistLocalRecords(SHIFT_NOTES_STORAGE_KEY, shiftNotes);
  recordAudit('shift_handover_added', role);
  closeModal();
  toast('Shift note saved on this browser.');
}

function openDiagnostics() {
  if (!requireRole(['admin', 'engineer', 'housekeeping'])) return;
  const onlineRooms = rooms.filter((room) => room.online);
  const offlineRooms = rooms.filter((room) => !room.online);
  const latencies = onlineRooms.map((room) => room.responseMs).filter(Number.isFinite);
  const averageLatency = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0;
  const disconnects = rooms.reduce((sum, room) => sum + (room.disconnectCount || 0), 0);
  const slowRooms = onlineRooms.filter((room) => room.responseMs >= 250).sort((a, b) => b.responseMs - a.responseMs).slice(0, 10);
  const offlineRows = offlineRooms.slice(0, 20).map((room) => `
    <div class="diagnostic-row"><strong>Room ${escapeHTML(room.num)}</strong><span>OFFLINE</span><span>Last seen ${escapeHTML(new Date(room.lastSeenAt).toLocaleString())}</span></div>
  `).join('');
  const slowRows = slowRooms.map((room) => `
    <div class="diagnostic-row"><strong>Room ${escapeHTML(room.num)}</strong><span>${escapeHTML(room.responseMs)} ms</span><span>Online</span></div>
  `).join('');
  document.getElementById('modalTitle').textContent = 'Device Diagnostics';
  document.getElementById('modalBody').className = 'feature-panel diagnostics-panel';
  document.getElementById('modalBody').innerHTML = `
    <div class="diagnostic-summary">
      <div><strong>${onlineRooms.length}</strong><span>Online</span></div>
      <div><strong>${offlineRooms.length}</strong><span>Offline</span></div>
      <div><strong>${averageLatency} ms</strong><span>Avg response</span></div>
      <div><strong>${disconnects}</strong><span>Link drops</span></div>
    </div>
    <p class="simulation-note">SIMULATED DIAGNOSTICS · NOT LIVE DEVICE MEASUREMENTS</p>
    <h4>Offline controllers</h4>
    <div class="diagnostics-list">${offlineRows || '<p>All demo controllers are online.</p>'}</div>
    <h4>Slow responses (&gt; 250 ms)</h4>
    <div class="diagnostics-list">${slowRows || '<p>No slow demo responses.</p>'}</div>
  `;
  document.getElementById('modalOk').hidden = true;
  document.getElementById('modal').classList.add('show');
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildRoomCsv() {
  const columns = ['room', 'floor', 'type', 'occupied', 'temperature_c', 'setpoint_c', 'controller', 'last_seen', 'response_ms', 'disconnect_count', 'dnd', 'mur'];
  const rows = rooms.map((room) => [
    room.num, room.floor, room.type, room.occupied, room.acTemp, room.acSet,
    room.online ? 'online' : 'offline', room.lastSeenAt, room.responseMs ?? '',
    room.disconnectCount || 0, room.dnd, room.mur
  ]);
  return `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function exportRoomCsv() {
  if (!requireRole(['admin', 'engineer'])) return;
  const csv = buildRoomCsv();
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hmi-room-status-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  recordAudit('room_status_exported', `${rooms.length} rooms`);
  toast('Room status CSV exported.');
}

function renderAlarmEntries() {
  const target = document.getElementById('alarmEntries');
  if (!target) return;
  const filter = document.getElementById('alarmPriorityFilter').value;
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const visibleAlarms = alarms
    .filter((alarm) => !alarm.resolvedAt && (filter === 'ALL' || alarm.priority === filter))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.createdAt) - new Date(a.createdAt));
  target.innerHTML = visibleAlarms.map((alarm) => `
    <div class="alarm-entry">
      <div>
        <div class="alarm-entry-title">${escapeHTML(alarm.message)} · Room ${escapeHTML(alarm.roomNum)}</div>
        <div class="alarm-entry-meta"><span class="severity-badge severity-${escapeHTML(alarm.priority)}">${escapeHTML(alarm.priority)}</span> ${escapeHTML(new Date(alarm.createdAt).toLocaleString())} · ${escapeHTML(alarm.type)}</div>
      </div>
      ${alarm.acknowledged
        ? '<span class="alarm-acknowledged">Acknowledged</span>'
        : ['admin', 'engineer'].includes(role)
          ? `<button class="btn btn-cancel" onclick="acknowledgeAlarm(${alarm.id})">Acknowledge</button>`
          : '<span class="alarm-entry-meta">Requires engineer/admin</span>'}
    </div>
  `).join('') || '<p>No active alarms for this priority.</p>';
}