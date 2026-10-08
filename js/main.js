// ── Application bootstrap ──
'use strict';

document.getElementById('logoutBtn').addEventListener('click', () => logout());

generateDemoRooms();
populateFloorFilter();
initAuth();
updateAlarmCount();
