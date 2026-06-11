import { stopJadibot } from '../../lib/jadibot-manager.js';

const handler = async (m, { args, isOwner }) => {
  const target = isOwner && args[0] ? args[0] : m.sender;
  const stopped = await stopJadibot(target, isOwner && args[0] ? 'stopped by owner' : 'stopped by requester');
  return m.reply(stopped ? 'Session jadibot berhasil dihentikan.' : 'Tidak ada session jadibot yang cocok.');
};

handler.help = ['stopjadibot'];
handler.tags = ['jadibot'];
handler.command = /^stopjadibot$/i;

export default handler;
