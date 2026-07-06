import { clearHistory, getAiSettings, getHistory } from '../../lib/ai/history.js';
import { getPluginCatalog } from '../../lib/ai/plugin-registry.js';
import { securitySummary } from '../../lib/ai/security-policy.js';
import { resolveUserRole } from '../../lib/ai/roles.js';
import { isGeminiConfigured } from '../../lib/ai/gemini-client.js';

const BOOLEAN_KEYS = new Map([
  ['enabled', (settings, value) => { settings.enabled = value; }],
  ['tools', (settings, value) => { settings.allowTools = value; }],
  ['allowTools', (settings, value) => { settings.allowTools = value; }],
  ['proactive', (settings, value) => { settings.proactive = value; }],
  ['expression', (settings, value) => { settings.expressions ||= {}; settings.expressions.enabled = value; }],
  ['expressions', (settings, value) => { settings.expressions ||= {}; settings.expressions.enabled = value; }],
  ['voice', (settings, value) => { settings.expressions ||= {}; settings.expressions.voice = value; }],
  ['sticker', (settings, value) => { settings.expressions ||= {}; settings.expressions.stickers = value; }],
  ['stickers', (settings, value) => { settings.expressions ||= {}; settings.expressions.stickers = value; }],
  ['extraText', (settings, value) => { settings.expressions ||= {}; settings.expressions.extraText = value; }],
  ['multiMessage', (settings, value) => { settings.delivery ||= {}; settings.delivery.multiMessage = value; }],
  ['typingPresence', (settings, value) => { settings.delivery ||= {}; settings.delivery.typingPresence = value; }],
]);

function parseBool(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['on', 'true', 'aktif', 'enable', 'enabled', '1', 'yes', 'ya'].includes(text)) return true;
  if (['off', 'false', 'mati', 'disable', 'disabled', '0', 'no', 'tidak'].includes(text)) return false;
  return null;
}

function boolText(value) {
  return value ? 'aktif' : 'nonaktif';
}

function statusText(roleInfo) {
  const settings = getAiSettings();
  const tools = getPluginCatalog({ roleInfo });
  return [
    '*Kontrol Vania*',
    'Gemini: ' + (isGeminiConfigured() ? 'siap' : 'GEMINI_API_KEY belum disetel'),
    'AI: ' + boolText(settings.enabled),
    'Tools: ' + boolText(settings.allowTools),
    'Proaktif: ' + boolText(settings.proactive),
    'Ekspresi: ' + boolText(settings.expressions?.enabled),
    'Voice: ' + boolText(settings.expressions?.voice),
    'Sticker: ' + boolText(settings.expressions?.stickers),
    'Multi pesan: ' + boolText(settings.delivery?.multiMessage),
    'Typing: ' + boolText(settings.delivery?.typingPresence),
    'Model: ' + settings.model,
    'Tools aman role ' + roleInfo.role + ': ' + tools.length,
  ].join('\n');
}

function toolsText(roleInfo) {
  const tools = getPluginCatalog({ roleInfo });
  if (!tools.length) return 'Belum ada tools aman yang tersedia untuk role ini.';
  return ['*Tools Aman Vania*', ...tools.map((tool, index) => (index + 1) + '. ' + tool.name + ' - ' + tool.description)].join('\n');
}

function usageText() {
  return [
    '*Vania Control*',
    '.vaniacontrol status',
    '.vaniacontrol tools',
    '.vaniacontrol security',
    '.vaniacontrol set <key> <on/off>',
    '.vaniacontrol reset-history',
    '',
    'Key aman: enabled, tools, proactive, expression, voice, sticker, extraText, multiMessage, typingPresence',
  ].join('\n');
}

function argsFromText(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

const handler = async (m, context = {}) => {
  const conn = context.conn || this;
  const roleInfo = resolveUserRole(m, conn, context);
  if (!roleInfo.isOwner) return global.dfail ? global.dfail('owner', m, conn) : m.reply('Fitur ini hanya untuk owner.');

  const aiArgs = context.aiArgs || {};
  const rawArgs = context.args?.length ? context.args : argsFromText(context.text);
  const action = String(aiArgs.action || rawArgs[0] || 'status').toLowerCase();
  const settings = getAiSettings();

  if (['status', 'info'].includes(action)) return m.reply(statusText(roleInfo));
  if (['tools', 'list_tools', 'tool'].includes(action)) return m.reply(toolsText(roleInfo));
  if (['security', 'policy', 'keamanan'].includes(action)) {
    return m.reply(['*Security Policy Vania*', '', securitySummary()].join('\n'));
  }

  if (['set', 'set_setting', 'setting'].includes(action)) {
    const key = String(aiArgs.key || rawArgs[1] || '').trim();
    const bool = parseBool(aiArgs.value ?? rawArgs[2]);
    const apply = BOOLEAN_KEYS.get(key);
    if (!apply || bool === null) {
      return m.reply('Format: .vaniacontrol set <key> <on/off>\nKey aman: ' + Array.from(BOOLEAN_KEYS.keys()).join(', '));
    }
    apply(settings, bool);
    return m.reply('Pengaturan *' + key + '* sekarang *' + boolText(bool) + '*.');
  }

  if (['reset-history', 'reset_history', 'clear_history'].includes(action)) {
    clearHistory(m.chat, m.sender);
    return m.reply('History Vania untuk chat ini sudah dihapus. Sisa history: ' + getHistory(m.chat, m.sender).length + '.');
  }

  return m.reply(usageText());
};

handler.help = ['vaniacontrol status/tools/security/set/reset-history'];
handler.tags = ['ai', 'owner'];
handler.command = /^(vaniacontrol|vaniakontrol|aicontrol)$/i;
handler.owner = true;
handler.description = 'Mengelola konfigurasi AI Vania yang aman tanpa akses file, session WhatsApp, broadcast, atau eksekusi kode.';
handler.ai = {
  tool: true,
  name: 'vania_control',
  description: 'Mengelola pengaturan aman AI Vania: status, tools aman, security policy, toggle ekspresi/voice/tools/proaktif, dan reset history chat saat ini.',
  permissions: ['owner'],
  risk: 'medium',
  parameters: {
    action: {
      type: 'string',
      description: 'Aksi aman: status, tools, security, set_setting, reset_history.',
      enum: ['status', 'tools', 'security', 'set_setting', 'reset_history'],
      required: true,
    },
    key: {
      type: 'string',
      description: 'Key setting untuk action set_setting.',
      enum: ['enabled', 'tools', 'proactive', 'expression', 'voice', 'sticker', 'extraText', 'multiMessage', 'typingPresence'],
    },
    value: {
      type: 'string',
      description: 'Nilai on/off untuk action set_setting.',
      enum: ['on', 'off'],
    },
  },
  examples: ['cek status sistem Vania', 'matikan voice Vania', 'tampilkan security policy Vania'],
};

export default handler;
