import { getAiSettings, getSession, setSession, clearSession, clearHistory, appendHistory, getHistory } from '../../lib/ai/history.js';
import { resolveUserRole } from '../../lib/ai/roles.js';
import { getPluginCatalog } from '../../lib/ai/plugin-registry.js';
import { buildVaniaSystemPrompt, VANIA_IDENTITY } from '../../lib/ai/prompt.js';
import { isGeminiConfigured } from '../../lib/ai/gemini-client.js';
import { runVania } from '../../lib/ai/vania-agent.js';
import { deliverVaniaResponse } from '../../lib/ai/delivery.js';
import { securitySummary } from '../../lib/ai/security-policy.js';
import { sameJid } from '../../lib/lid.js';

function formatTools(tools) {
  if (!tools.length) return 'Belum ada tools AI yang tersedia untuk role kamu.';
  return tools.map((tool, index) => [
    `${index + 1}. *${tool.name}*`,
    `   ${tool.description}`,
    `   Permission: ${tool.permissions.join(', ')}`,
    `   Risk: ${tool.risk}`,
  ].join('\n')).join('\n\n');
}

function sessionText(session, settings, roleInfo, history) {
  return [
    '*Status Vania*',
    `Nama: ${VANIA_IDENTITY.name}`,
    `Sesi: ${session?.enabled ? 'aktif' : 'nonaktif'}`,
    `Role kamu: ${roleInfo.role}`,
    `Model: ${settings.model}`,
    `Gemini: ${isGeminiConfigured() ? 'siap' : 'GEMINI_API_KEY belum disetel'}`,
    `Tools: ${settings.allowTools ? 'aktif' : 'nonaktif'}`,
    `Proaktif: ${settings.proactive ? 'aktif' : 'nonaktif'}`,
    `Ekspresi: ${settings.expressions?.enabled ? 'aktif' : 'nonaktif'}`,
    `Voice: ${settings.expressions?.voice ? 'aktif' : 'nonaktif'}`,
    `Multi pesan: ${settings.delivery?.multiMessage ? 'aktif' : 'nonaktif'}`,
    `History: ${history.length}/${settings.maxHistory}`,
  ].join('\n');
}

function usageText() {
  return [
    'Perintah Vania:',
    '.vania on - aktifkan sesi',
    '.vania off - matikan sesi',
    '.vania status - lihat status',
    '.vania tools - lihat tools yang dikenali',
    '.vania reset - hapus history',
    '.vania delete - hapus session',
    '.vania expression on/off - kontrol ekspresi tambahan',
    '.vania voice on/off - kontrol pesan suara',
    '.vania security - lihat batas keamanan AI',
    '.vania <pesan> - ngobrol atau minta jalankan tools',
  ].join('\n');
}

function hasCommandPrefix(match, text = '') {
  if (match?.[0]?.[0]) return true;
  return /^[.!/#$]/.test(String(text || '').trim());
}

function isBotMentioned(m, conn) {
  const botJid = conn?.user?.id;
  return Array.isArray(m.mentionedJid) && m.mentionedJid.some((jid) => sameJid(jid, botJid));
}

function isReplyToBot(m, conn) {
  return !!(m.quoted?.sender && sameJid(m.quoted.sender, conn?.user?.id));
}

function stripVaniaCall(text) {
  return String(text || '').replace(/^(vania|viona)[,\s:]*/i, '').trim();
}

async function answerWithVania(m, conn, text, context = {}) {
  const result = await runVania({ conn, m, text, context });
  return deliverVaniaResponse({ conn, m, result, userText: text || m.text });
}

const handler = async (m, { conn, args, text, isOwner, isPrems, isMods, isAdmin, isBotAdmin }) => {
  const sub = String(args[0] || '').toLowerCase();
  const settings = getAiSettings();
  const roleInfo = resolveUserRole(m, conn, { isOwner, isPrems, isMods, isAdmin, isBotAdmin });
  const session = getSession(m.chat, m.sender);

  if (!sub || ['status', 'info'].includes(sub)) {
    return m.reply(sessionText(session, settings, roleInfo, getHistory(m.chat, m.sender)));
  }

  if (['on', 'aktif', 'enable'].includes(sub)) {
    setSession(m.chat, m.sender, {
      enabled: true,
      mode: 'chat',
      role: roleInfo.role,
      startedAt: session?.startedAt || Date.now(),
      lastActive: Date.now(),
    });
    appendHistory(m.chat, m.sender, { role: 'system', content: 'Sesi Vania diaktifkan.' });
    return m.reply([
      '*Vania aktif*',
      'Aku akan mengingat konteks percakapan di sesi ini.',
      `Role kamu terdeteksi sebagai *${roleInfo.role}*.`,
      `Gemini: ${isGeminiConfigured() ? 'siap digunakan' : 'belum siap, GEMINI_API_KEY belum disetel'}.`,
      '',
      'Kirim *.vania <pesan>* atau panggil aku dengan nama Vania saat sesi aktif.',
    ].join('\n'));
  }

  if (['off', 'mati', 'disable'].includes(sub)) {
    setSession(m.chat, m.sender, { enabled: false, lastActive: Date.now(), role: roleInfo.role });
    return m.reply('Sesi Vania dimatikan untuk chat ini.');
  }

  if (['reset', 'clear'].includes(sub)) {
    clearHistory(m.chat, m.sender);
    setSession(m.chat, m.sender, { enabled: !!session?.enabled, role: roleInfo.role, lastActive: Date.now() });
    return m.reply('History percakapan Vania sudah direset.');
  }

  if (['delete', 'hapus'].includes(sub)) {
    clearSession(m.chat, m.sender);
    return m.reply('Session dan history Vania untuk chat ini sudah dihapus.');
  }

  if (['expression', 'ekspresi'].includes(sub)) {
    const value = String(args[1] || '').toLowerCase();
    if (!['on', 'off', 'aktif', 'mati', 'enable', 'disable'].includes(value)) {
      return m.reply(`Ekspresi Vania saat ini: *${settings.expressions?.enabled ? 'aktif' : 'nonaktif'}*.\nGunakan *.vania expression on* atau *.vania expression off*.`);
    }
    settings.expressions ||= {};
    settings.expressions.enabled = ['on', 'aktif', 'enable'].includes(value);
    return m.reply(`Ekspresi tambahan Vania sekarang *${settings.expressions.enabled ? 'aktif' : 'nonaktif'}*.`);
  }

  if (['voice', 'vn', 'suara'].includes(sub)) {
    const value = String(args[1] || '').toLowerCase();
    if (!['on', 'off', 'aktif', 'mati', 'enable', 'disable'].includes(value)) {
      return m.reply(`Voice Vania saat ini: *${settings.expressions?.voice ? 'aktif' : 'nonaktif'}*.\nGunakan *.vania voice on* atau *.vania voice off*.`);
    }
    settings.expressions ||= {};
    settings.expressions.voice = ['on', 'aktif', 'enable'].includes(value);
    return m.reply(`Pesan suara Vania sekarang *${settings.expressions.voice ? 'aktif' : 'nonaktif'}*.`);
  }

  if (['security', 'secure', 'policy', 'keamanan'].includes(sub)) {
    return m.reply(['*Security Policy Vania*', '', securitySummary()].join('\n'));
  }

  if (['tools', 'tool', 'fitur'].includes(sub)) {
    const tools = getPluginCatalog({ roleInfo });
    return m.reply(['*Tools Vania yang tersedia*', '', formatTools(tools)].join('\n'));
  }

  if (['prompt'].includes(sub)) {
    if (!roleInfo.isOwner) return global.dfail('owner', m, conn);
    const tools = getPluginCatalog({ roleInfo });
    return m.reply(buildVaniaSystemPrompt({ roleInfo, tools }));
  }

  if (['help', 'menu', 'bantuan'].includes(sub)) return m.reply(usageText());

  const prompt = text || m.text.replace(/^\S+\s*/, '').trim();
  if (!session?.enabled) {
    return m.reply([
      'Sesi Vania belum aktif untuk chat ini.',
      'Gunakan *.vania on* dulu, lalu kirim *.vania <pesan>*.',
    ].join('\n'));
  }

  return answerWithVania(m, conn, prompt, { isOwner, isPrems, isMods, isAdmin, isBotAdmin });
};

handler.before = async function beforeVania(m, context = {}) {
  const conn = context.conn || this;
  if (!m?.text || m.fromMe || m.isBaileys) return false;
  if (hasCommandPrefix(context.match, m.text)) return false;

  const session = getSession(m.chat, m.sender);
  if (!session?.enabled) return false;

  const rawText = String(m.text || '').trim();
  let prompt = rawText;

  if (m.isGroup) {
    const calledByName = /^(vania|viona)[,\s:]/i.test(rawText);
    const called = calledByName || isBotMentioned(m, conn) || isReplyToBot(m, conn);
    if (!called) return false;
    prompt = stripVaniaCall(rawText).replace(/@\d+/g, '').trim();
  }

  if (!prompt) return false;

  await answerWithVania(m, conn, prompt, context);
  return true;
};

handler.help = ['vania on/off/status/tools/reset', 'vania <pesan>'];
handler.tags = ['ai'];
handler.command = /^(vania|viona|ai)$/i;
handler.description = 'Mengelola sesi AI Vania, ngobrol dengan Gemini, dan menjalankan tools plugin yang diizinkan.';
handler.ai = {
  tool: false,
  name: 'manage_vania_session',
  description: handler.description,
  permissions: ['user', 'premium', 'owner'],
  risk: 'low',
};

export default handler;
