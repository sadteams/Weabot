import { fileTypeFromBuffer } from 'file-type';

const handler = async (m, { conn }) => {
  const quoted = m.quoted || m;
  if (quoted.mediaType !== 'stickerMessage') return m.reply('Reply stiker dulu!');
  await m.reply(global.wait);
  const buf  = await quoted.download();
  await conn.sendMessage(m.chat, { image: buf, caption: '' }, { quoted: m });
};

handler.help    = ['toimg'];
handler.tags    = ['sticker'];
handler.command = /^(toimg|stickertoimage|stoi)$/i;
handler.description = 'Mengubah sticker yang direply menjadi gambar.';
handler.ai = {
  tool: true,
  name: 'sticker_to_image',
  description: handler.description,
  permissions: ['user', 'premium', 'owner'],
  risk: 'low',
  parameters: {},
  examples: ['ubah sticker ini jadi gambar'],
};

export default handler;
