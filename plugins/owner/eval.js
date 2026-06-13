import util from 'util';

const handler = async (m, { text }) => {
  if (!text) return m.reply('Masukkan kode yang ingin dieval.');

  try {
    let result = eval(text);
    if (result instanceof Promise) result = await result;

    const output = typeof result === 'string' ? result : util.inspect(result, {
      depth: null,
      maxArrayLength: null,
      maxStringLength: null,
      breakLength: Infinity,
      compact: false,
    });

    await m.reply(output || 'undefined');
  } catch (error) {
    await m.reply(error?.stack || String(error));
  }
};

handler.help = ['eval <code>'];
handler.tags = ['owner'];
handler.command = /^(eval|=>)$/i;
handler.owner = true;
export default handler;
