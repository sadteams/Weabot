import syntaxerror from 'syntax-error';
import { format } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import connection from '../../lib/connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);

let handler = async (m, context = {}) => {
  const { conn, usedPrefix, noPrefix, args, groupMetadata } = context;
  const db = global.db;
  const store = conn?.store || global.store || connection.store;
  let _return;
  let _syntax = '';
  const _text = (/^=/.test(usedPrefix) ? 'return ' : '') + noPrefix;
  const old = m.exp * 1;

  try {
    let i = 15;
    const f = { exports: {} };
    const exec = new (async () => {}).constructor(
      'print',
      'm',
      'handler',
      'require',
      'conn',
      'db',
      'store',
      'connection',
      'Array',
      'process',
      'args',
      'groupMetadata',
      'module',
      'exports',
      'argument',
      _text
    );

    _return = await exec.call(
      conn,
      (...args) => {
        if (--i < 1) return;
        console.log(...args);
        return conn.reply(m.chat, format(...args), m);
      },
      m,
      handler,
      require,
      conn,
      db,
      store,
      connection,
      CustomArray,
      process,
      args,
      groupMetadata,
      f,
      f.exports,
      [conn, context]
    );
  } catch (e) {
    const err = syntaxerror(_text, 'Execution Function', {
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      sourceType: 'module',
    });
    if (err) _syntax = '```' + err + '```\n\n';
    _return = e;
  } finally {
    await conn.reply(m.chat, _syntax + format(_return), m);
    m.exp = old;
  }
};

handler.help = ['> ', '=> '];
handler.tags = ['advanced'];
handler.customPrefix = /^=?> /;
handler.command = /(?:)/i;
handler.rowner = true;
handler.description = 'Menjalankan evaluasi kode JavaScript untuk real owner dengan prefix > dan =>.';

export default handler;

class CustomArray extends Array {
  constructor(...args) {
    if (typeof args[0] === 'number') return super(Math.min(args[0], 10000));
    return super(...args);
  }
}
