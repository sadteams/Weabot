import { broadcastJadibot } from '../../lib/jadibot-manager.js';

const handler = async (m, { conn, text, isOwner }) => {
  if (!isOwner) return global.dfail('owner', m, conn);
  if (!text) return m.reply('Masukkan pesan broadcast. Contoh: .broadcastjadibot Maintenance 10 menit.');

  const message = ['*Info Jadibot*', '', text].join('\n');
  const result = await broadcastJadibot(conn, message, { delay: 750 });
  return m.reply([
    '*Broadcast Jadibot selesai*',
    `Target: ${result.total}`,
    `Berhasil: ${result.success}`,
    `Gagal: ${result.failed}`
  ].join('\n'));
};

handler.help = ['broadcastjadibot'];
handler.tags = ['jadibot'];
handler.command = /^(broadcastjadibot|bcjadibot)$/i;
handler.owner = true;

handler.description = "Mengirim broadcast kepada user atau session jadibot yang terhubung.";

export default handler;
