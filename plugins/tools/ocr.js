import fetch from 'node-fetch';
import FormData from 'form-data';

const handler = async (m, { conn }) => {
  const quoted = m.quoted || m;
  if (!quoted.mediaType?.includes('image')) return m.reply('Reply gambar dulu!');
  await m.reply(global.wait);
  const buf  = await quoted.download();
  const form = new FormData();
  form.append('apikey', 'helloworld');
  form.append('base64Image', `data:image/png;base64,${buf.toString('base64')}`);
  form.append('language', 'ind+eng');
  const res  = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form });
  const data = await res.json();
  const text = data?.ParsedResults?.[0]?.ParsedText || 'Tidak ada teks ditemukan';
  await m.reply(`📝 *Hasil OCR*\n\n${text}`);
};
handler.help    = ['ocr'];
handler.tags    = ['tools'];
handler.command = /^(ocr|readtext)$/i;
handler.description = 'Membaca teks dari gambar yang dikirim atau direply menggunakan OCR.';
handler.ai = {
  tool: true,
  name: 'read_image_text',
  description: handler.description,
  permissions: ['user', 'premium', 'owner'],
  risk: 'low',
  parameters: {},
  examples: ['baca teks pada gambar ini'],
};

export default handler;
