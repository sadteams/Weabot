import { listJadibots } from '../../lib/jadibot-manager.js';
import { formatSessions, normalizeText } from './_shared.js';

const handler = async (m, { args, isOwner }) => {
  const showAll = isOwner && ['all', 'semua'].includes(normalizeText(args[0]));
  const sessions = listJadibots(showAll ? {} : { requester: m.sender });
  if (!sessions.length) return m.reply(showAll ? 'Belum ada session jadibot.' : 'Kamu belum punya session jadibot.');
  return m.reply(formatSessions(sessions));
};

handler.help = ['listjadibot'];
handler.tags = ['jadibot'];
handler.command = /^listjadibot$/i;

export default handler;
