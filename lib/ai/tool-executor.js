import { findToolByName } from './plugin-registry.js';
import { roleAllows } from './roles.js';
import { recordToolCall } from './history.js';
import { assessToolSecurity } from './security-policy.js';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value && !Array.isArray(value) ? value : {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toolNameOf(toolCall = {}) {
  return toolCall?.functionCall?.name || toolCall?.function?.name || toolCall?.name;
}

function toolArgsOf(toolCall = {}) {
  if (toolCall?.functionCall) return parseJson(toolCall.functionCall.args);
  return parseJson(toolCall?.function?.arguments || toolCall?.arguments);
}

function firstCommand(entry) {
  const help = Array.isArray(entry?.help) ? entry.help[0] : entry?.help;
  const fromHelp = String(help || '').split(/\s+/)[0];
  if (fromHelp) return fromHelp.replace(/^[./#!]/, '').toLowerCase();
  return String(entry?.name || entry?.pluginName || 'tool').toLowerCase();
}

function buildToolText(toolName, args = {}) {
  args = args && typeof args === 'object' ? args : {};
  switch (toolName) {
    case 'download_instagram':
      return String(args.url || '').trim();
    case 'translate_text': {
      const lang = String(args.lang || 'id').trim();
      const text = String(args.text || '').trim();
      return `${lang} ${text}`.trim();
    }
    case 'shorten_url':
      return String(args.url || '').trim();
    case 'check_khodam':
      return String(args.name || args.text || '').trim();
    case 'make_brat_video_sticker':
      return String(args.text || '').trim();
    case 'make_sticker': {
      const pack = String(args.pack || '').trim();
      const author = String(args.author || '').trim();
      return [pack, author].filter(Boolean).join('|');
    }
    default:
      return String(args.text || args.query || args.url || '').trim();
  }
}

function buildArgs(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function summarizeMessageContent(content = {}) {
  if (typeof content === 'string') return { type: 'text', text: content };
  if (content.text) return { type: 'text', text: String(content.text).slice(0, 1200) };
  if (content.caption) return { type: 'caption', text: String(content.caption).slice(0, 1200) };
  if (content.image) return { type: 'image', text: content.caption || '[image]' };
  if (content.video) return { type: 'video', text: content.caption || '[video]' };
  if (content.audio) return { type: 'audio', text: '[audio]' };
  if (content.sticker) return { type: 'sticker', text: '[sticker]' };
  if (content.document) return { type: 'document', text: content.fileName || '[document]' };
  return { type: 'message', text: '[message]' };
}

function makePluginContext({ conn, m, entry, roleInfo, argsObject, command, text }) {
  const args = buildArgs(text);
  return {
    match: null,
    usedPrefix: '.vania ',
    noPrefix: `${command} ${text}`.trim(),
    _args: args,
    args,
    command,
    text,
    conn,
    participants: [],
    groupMetadata: {},
    user: {},
    bot: {},
    isROwner: !!roleInfo?.isOwner,
    isOwner: !!roleInfo?.isOwner,
    isRAdmin: !!roleInfo?.isAdmin,
    isAdmin: !!roleInfo?.isAdmin,
    isBotAdmin: !!roleInfo?.isBotAdmin,
    isPrems: !!roleInfo?.isPremium,
    isBans: false,
    ai: true,
    aiTool: entry.name,
    aiArgs: argsObject,
  };
}

function isTextOnly(content) {
  if (typeof content === 'string') return true;
  if (!content || typeof content !== 'object') return false;
  return !!content.text && !content.image && !content.video && !content.audio && !content.sticker && !content.document;
}

function fakeMessage(jid) {
  return { key: { remoteJid: jid, id: 'AI_CAPTURED_' + Date.now(), fromMe: true } };
}

function makeCaptureConn(conn, outputs, options = {}) {
  const deliverText = options.deliverText !== false;
  return new Proxy(conn, {
    get(target, prop) {
      if (prop === 'sendMessage') {
        return async (jid, content, messageOptions) => {
          const summary = summarizeMessageContent(content);
          outputs.push({ ...summary, jid, delivered: deliverText || !isTextOnly(content) });
          if (!deliverText && isTextOnly(content)) return fakeMessage(jid);
          return target.sendMessage(jid, content, messageOptions);
        };
      }
      if (prop === 'reply') {
        return async (jid, text, quoted, replyOptions) => {
          outputs.push({ type: 'text', text: String(text).slice(0, 1200), jid, delivered: deliverText });
          if (!deliverText) return fakeMessage(jid);
          return target.reply(jid, text, quoted, replyOptions);
        };
      }
      return target[prop];
    },
  });
}

export async function executeAiTool({ conn, m, toolCall, roleInfo, deliverText = false } = {}) {
  const toolName = toolNameOf(toolCall);
  const argsObject = toolArgsOf(toolCall);
  const entry = findToolByName(toolName, roleInfo);
  const startedAt = Date.now();
  const outputs = [];

  if (!entry) {
    const result = { ok: false, tool: toolName, error: 'Tool tidak tersedia untuk role user ini.', outputs };
    recordToolCall({ tool: toolName, args: argsObject, status: 'denied', result, sender: m?.sender, chat: m?.chat });
    return result;
  }

  if (!roleAllows(entry.permissions, roleInfo)) {
    const result = { ok: false, tool: entry.name, error: 'Permission user tidak cukup untuk menjalankan tool ini.', outputs };
    recordToolCall({ tool: entry.name, args: argsObject, status: 'denied', result, sender: m?.sender, chat: m?.chat });
    return result;
  }

  const security = assessToolSecurity(entry, roleInfo);
  if (!security.allowed) {
    const result = { ok: false, tool: entry.name, error: security.reason, security, outputs };
    recordToolCall({ tool: entry.name, args: argsObject, status: 'security_denied', result, sender: m?.sender, chat: m?.chat });
    return result;
  }

  const plugin = global.plugins?.[entry.pluginName];
  if (typeof plugin !== 'function') {
    const result = { ok: false, tool: entry.name, error: 'Plugin tool tidak ditemukan atau tidak bisa dipanggil.', outputs };
    recordToolCall({ tool: entry.name, args: argsObject, status: 'missing', result, sender: m?.sender, chat: m?.chat });
    return result;
  }

  const command = firstCommand(entry);
  const text = buildToolText(entry.name, argsObject);
  const captureConn = makeCaptureConn(conn, outputs, { deliverText });
  const context = makePluginContext({ conn: captureConn, m, entry, roleInfo, argsObject, command, text });
  const previous = {
    plugin: m.plugin,
    command: m.command,
    usedPrefix: m.usedPrefix,
    isCommand: m.isCommand,
    reply: m.reply,
  };

  try {
    m.plugin = entry.pluginName;
    m.command = command;
    m.usedPrefix = '.vania ';
    m.isCommand = true;
    m.reply = async (replyText, options = {}) => {
      outputs.push({ type: 'text', text: String(replyText).slice(0, 1200), jid: m.chat, delivered: deliverText });
      if (!deliverText) return fakeMessage(m.chat);
      return previous.reply.call(m, replyText, options);
    };
    await plugin.call(captureConn, m, context);
    const result = {
      ok: true,
      tool: entry.name,
      message: outputs.length
        ? (outputs.some((output) => output.delivered) ? 'Tool berhasil dijalankan. Output media dikirim, output teks ditangkap untuk diolah Vania.' : 'Tool berhasil dijalankan. Output teks ditangkap untuk diolah Vania.')
        : 'Tool berhasil dijalankan.',
      outputs,
      elapsedMs: Date.now() - startedAt,
    };
    recordToolCall({ tool: entry.name, args: argsObject, status: 'success', result, sender: m?.sender, chat: m?.chat });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      tool: entry.name,
      error: error?.message || String(error),
      outputs,
      elapsedMs: Date.now() - startedAt,
    };
    recordToolCall({ tool: entry.name, args: argsObject, status: 'error', result, sender: m?.sender, chat: m?.chat });
    return result;
  } finally {
    m.plugin = previous.plugin;
    m.command = previous.command;
    m.usedPrefix = previous.usedPrefix;
    m.isCommand = previous.isCommand;
    m.reply = previous.reply;
  }
}
