import chalk from 'chalk';
import moment from 'moment-timezone';
import { jidNumber, formatSize } from './helper.js';

function messageSize(m) {
  const raw = m.msg?.vcard || m.msg?.fileLength?.low || m.msg?.fileLength || m.msg?.axolotlSenderKeyDistributionMessage || m.text || '';
  return typeof raw === 'number' ? raw : String(raw).length;
}

function messageType(m) {
  if (!m?.mtype) return '-';
  return m.mtype
    .replace(/message$/i, '')
    .replace(/audio/i, m.msg?.ptt ? 'PTT' : 'Audio')
    .replace(/^./, (value) => value.toUpperCase());
}

function formatMarkdown(text) {
  const mdRegex = /(?<=(?:^|[\s\n])\S?)(?:([*_~])(.+?)\1|```((?:.|[\n\r])+?)```)(?=\S?(?:[\s\n]|$))/g;
  const format = (depth = 4) => (_, type, value, monospace) => {
    const styles = { _: 'italic', '*': 'bold', '~': 'strikethrough' };
    const content = value || monospace;
    return !styles[type] || depth < 1 ? content : chalk[styles[type]](content.replace(mdRegex, format(depth - 1)));
  };
  return String(text || '').replace(/\u200e+/g, '').replace(mdRegex, format());
}

async function getName(conn, jid) {
  try {
    if (!jid) return '';
    if (typeof conn.getName === 'function') return await conn.getName(jid);
  } catch {}
  return jidNumber(jid) || jid;
}

function formatJid(jid, name = '') {
  const number = jidNumber(jid);
  const value = number ? `+${number}` : (jid || '-');
  return name && name !== number ? `${value} ~${name}` : value;
}

export default async function printMsg(m, conn = { user: {} }) {
  try {
    if (!m) return;

    const time = moment.tz('Asia/Makassar').format('HH:mm:ss');
    const botJid = conn.user?.jid || conn.user?.id || '';
    const botName = conn.user?.name || global.namebot || 'Bot';
    const senderName = m.name || await getName(conn, m.sender);
    const chatName = m.isGroup ? await getName(conn, m.chat) : senderName;
    const user = global.db?.data?.users?.[m.sender] || {};
    const plugin = m.plugin ? m.plugin.split('/').pop()?.replace(/\.js$/i, '') : '-';
    const status = m.error ? chalk.bgRed.white(' ERROR ') : m.isCommand ? chalk.bgYellow.black(' COMMAND ') : chalk.bgGreen.black(' MESSAGE ');
    const stub = m.messageStubType ? ` stub:${m.messageStubType}` : '';
    const size = messageSize(m);

    console.log([
      '',
      `${chalk.redBright(formatJid(botJid, botName))} ${chalk.black(chalk.bgYellow(time))} ${status} ${chalk.magenta(`${size} [${formatSize(size)}]`)}${chalk.gray(stub)}`,
      `${chalk.green(formatJid(m.sender, senderName))} ${chalk.gray('exp')} ${chalk.yellow(m.exp ?? 0)}${user ? chalk.gray(` |${user.exp ?? 0}|${user.limit ?? 0}`) : ''} ${chalk.blueBright('to')} ${chalk.green(formatJid(m.chat, chatName))} ${chalk.black(chalk.bgYellow(messageType(m)))}`,
      `${chalk.gray('plugin')} ${chalk.magenta(plugin)} ${chalk.gray('id')} ${chalk.white(m.id || '-')}`,
    ].join('\n'));

    if (typeof m.text === 'string' && m.text) {
      let log = formatMarkdown(m.text);
      for (const jid of m.mentionedJid || []) {
        const name = await getName(conn, jid);
        log = log.replace('@' + jidNumber(jid), chalk.blueBright('@' + (name || jidNumber(jid))));
      }
      console.log(m.error ? chalk.red(log) : m.isCommand ? chalk.yellow(log) : log);
    }

    if (m.messageStubParameters?.length) {
      console.log(chalk.gray(m.messageStubParameters.map((jid) => formatJid(conn.decodeJid ? conn.decodeJid(jid) : jid)).join(', ')));
    }
    if (/document/i.test(m.mtype)) console.log(chalk.gray(`file ${m.msg.fileName || m.msg.displayName || 'document'}`));
    else if (/contact/i.test(m.mtype)) console.log(chalk.gray(`contact ${m.msg.displayName || '-'}`));
    else if (/audio/i.test(m.mtype)) {
      const duration = m.msg.seconds || 0;
      const mm = Math.floor(duration / 60).toString().padStart(2, '0');
      const ss = String(duration % 60).padStart(2, '0');
      console.log(chalk.gray(`${m.msg.ptt ? 'ptt' : 'audio'} ${mm}:${ss}`));
    }
  } catch (error) {
    console.error(chalk.red('[Print Error]'), error.message);
  }
}
