export const pending = new Map();
export const ttl = 2 * 60 * 1000;

export function keyOf(m) {
  return `${m.chat}:${m.sender}`;
}

export function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

export function normalizePhone(text) {
  const clean = String(text || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('08')) return `62${clean.slice(1)}`;
  return clean;
}

export function formatTime(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });
}

export function formatSessions(sessions) {
  return sessions.map((session, index) => [
    `${index + 1}. *${session.id}*`,
    `Status: ${session.active ? 'aktif' : (session.status || 'off')}`,
    `Mode: ${session.mode || '-'}`,
    `Requester: ${session.requesterNumber || '-'}`,
    `Nomor login: ${session.phone || '-'}`,
    `Akun: ${session.jid || '-'}`,
    `Terhubung: ${formatTime(session.lastConnected)}`,
    `Update: ${formatTime(session.updatedAt)}`
  ].join('\n')).join('\n\n');
}
