import util from 'util';

const MAX_CHUNK = 3500;

function splitText(text, size = MAX_CHUNK) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length ? chunks : [''];
}

const handler = async (m, { conn, text }) => {
  try {
    if (!text) return m.reply('Masukkan kode yang ingin dieval.');
    let result = eval(text);
    if (result instanceof Promise) result = await result;
    const out = typeof result === 'string' ? result : util.inspect(result, {
      depth: null,
      maxArrayLength: null,
      maxStringLength: null,
      breakLength: 120,
      compact: false,
    });

    const chunks = splitText(out);
    for (let i = 0; i < chunks.length; i++) {
      const header = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : '';
      await m.reply(header + chunks[i]);
    }
  } catch (error) {
    const out = error?.stack || String(error);
    for (const chunk of splitText(out)) await m.reply(chunk);
  }
};

handler.help = ['eval <code>'];
handler.tags = ['owner'];
handler.command = /^(eval|=>)$/i;
handler.owner = true;
export default handler;
