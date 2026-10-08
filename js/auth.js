// ── Authentication, session lockout, and idle timeout ──
'use strict';

const LOGIN_ACCOUNTS = Object.freeze({
  housekeeping: { username: 'housekeeping', password: 'hk123' },
  engineer: { username: 'engineer', password: 'eng123' },
  admin: { username: 'admin', password: 'admin123' }
});

const IDLE_TIMEOUT_MESSAGE = 'Sesi berakhir karena tidak ada aktivitas selama 10 menit.';

function setLoginError(message) {
  dom.byId('loginError').textContent = message;
}

function findAccount(username, password) {
  return Object.entries(LOGIN_ACCOUNTS).find(([, credentials]) =>
    credentials.username === username && credentials.password === password
  );
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const now = Date.now();

  if (now < state.login.lockoutUntil) {
    const seconds = Math.ceil((state.login.lockoutUntil - now) / 1000);
    setLoginError(`Terlalu banyak percobaan. Coba lagi dalam ${seconds} detik.`);
    return;
  }

  const username = dom.byId('username').value.trim().toLowerCase();
  const password = dom.byId('password').value;
  const account = findAccount(username, password);

  if (!account) {
    recordAudit('login_failed');
    state.login.failedAttempts += 1;
    if (state.login.failedAttempts >= CONFIG.maxLoginAttempts) {
      state.login.lockoutUntil = now + CONFIG.lockoutDurationMs;
      state.login.failedAttempts = 0;
      recordAudit('login_locked', '60 seconds');
      setLoginError('Terlalu banyak percobaan. Login dikunci selama 60 detik.');
    } else {
      const remaining = CONFIG.maxLoginAttempts - state.login.failedAttempts;
      setLoginError(`Username atau password salah. Sisa percobaan: ${remaining}.`);
    }
    return;
  }

  state.login.failedAttempts = 0;
  setLoginError('');
  loginAs(account[0]);
}

function updateHeaderButtons() {
  const isEngineer = state.role === 'engineer';
  const canViewLogs = ROLE_ACCESS.auditLog.includes(state.role);
  const toggles = [
    ['addRoomBtn', isEngineer],
    ['simulateLinkBtn', isEngineer],
    ['auditLogBtn', canViewLogs],
    ['exportBtn', canViewLogs]
  ];
  toggles.forEach(([id, visible]) => {
    const element = dom.byId(id);
    if (element) element.style.display = visible ? 'inline-flex' : 'none';
  });
}

function loginAs(newRole) {
  state.role = newRole;
  recordAudit('login_success');
  resetIdleTimeout();

  dom.byId('login').style.display = 'none';
  dom.byId('app').style.display = 'block';

  const badge = dom.byId('roleBadge');
  badge.textContent = newRole;
  badge.className = `role-badge role-${newRole}`;

  updateHeaderButtons();
  render();
}

function logout(message = '') {
  clearTimeout(state.idle.timeoutId);
  state.pendingCommandTimeouts.forEach(clearTimeout);
  state.pendingCommandTimeouts.clear();
  rooms.forEach((room) => {
    if (room.commandState === 'pending') room.commandState = 'idle';
  });
  if (state.role) recordAudit(message ? 'session_timeout' : 'logout');
  state.role = '';
  dom.byId('app').style.display = 'none';
  dom.byId('login').style.display = 'flex';
  dom.byId('loginForm').reset();
  setLoginError(message);
  closeModal();
}

function resetIdleTimeout() {
  clearTimeout(state.idle.timeoutId);
  if (!state.role) return;
  state.idle.lastActivityAt = Date.now();
  state.idle.timeoutId = setTimeout(() => logout(IDLE_TIMEOUT_MESSAGE), CONFIG.idleTimeoutMs);
}

function registerIdleWatchers() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (state.role) resetIdleTimeout();
    }, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    const idleFor = Date.now() - state.idle.lastActivityAt;
    if (state.role && !document.hidden && idleFor >= CONFIG.idleTimeoutMs) {
      logout(IDLE_TIMEOUT_MESSAGE);
    }
  });
}

function initAuth() {
  commandHistory.push(...loadLocalRecords(CONFIG.storageKeys.commandHistory));
  shiftNotes.push(...loadLocalRecords(CONFIG.storageKeys.shiftNotes));
  dom.byId('loginForm').addEventListener('submit', handleLoginSubmit);
  registerIdleWatchers();
}
