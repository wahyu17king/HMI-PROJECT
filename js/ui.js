// ── UI primitives: modal, toast, role gating ──
'use strict';

const dom = {
  byId: (id) => document.getElementById(id)
};

function requireRole(allowedRoles) {
  if (allowedRoles.includes(state.role)) return true;
  recordAudit('access_denied', allowedRoles.join(', '));
  toast(state.role ? 'Akses ditolak untuk role ini.' : 'Sesi berakhir. Silakan login kembali.');
  return false;
}

function updateAlarmCount() {
  const count = alarms.filter((alarm) => !alarm.acknowledged && !alarm.resolvedAt).length;
  const badge = dom.byId('alarmCount');
  if (badge) badge.textContent = count;
}

function openModal({ title, bodyHtml, panelClass = '', confirmButton = null }) {
  const body = dom.byId('modalBody');
  const okButton = dom.byId('modalOk');
  dom.byId('modalTitle').textContent = title;
  body.className = panelClass;
  body.innerHTML = bodyHtml;
  if (confirmButton) {
    okButton.hidden = false;
    okButton.textContent = confirmButton.label || 'Confirm';
    okButton.onclick = confirmButton.onClick;
  } else {
    okButton.hidden = true;
    okButton.onclick = null;
  }
  dom.byId('modal').classList.add('show');
}

function closeModal() {
  const modal = dom.byId('modal');
  modal.classList.remove('show', 'wide');
  const confirmButton = dom.byId('modalOk');
  confirmButton.hidden = false;
  confirmButton.textContent = 'Confirm';
  confirmButton.onclick = null;
  dom.byId('modalBody').className = '';
}

function toast(message) {
  const element = dom.byId('toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), CONFIG.toastDurationMs);
}
