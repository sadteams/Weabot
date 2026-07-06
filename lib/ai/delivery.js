import { getAiSettings, getSession, setSession } from './history.js';
import { sendVaniaExpression } from './expression.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deliverySettings() {
  const settings = getAiSettings();
  const delivery = settings.delivery ||= {};
  delivery.enabled ??= true;
  delivery.multiMessage ??= true;
  delivery.typingPresence ??= true;
  delivery.maxMessages = Number(delivery.maxMessages || 2);
  delivery.minSecondMessageLength = Number(delivery.minSecondMessageLength || 80);
  delivery.delayMs = Number(delivery.delayMs || 650);
  delivery.followUpChance = Number(delivery.followUpChance ?? 0.25);
  return delivery;
}

function chance(value) {
  return Math.random() < Math.max(0, Math.min(1, Number(value || 0)));
}

function cleanText(text = '') {
  return String(text || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitNatural(text = '', options = {}) {
  const clean = cleanText(text);
  if (!clean) return [];
  if (!options.multiMessage || clean.length < Number(options.minSecondMessageLength || 80)) return [clean];

  const paragraphs = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    return [paragraphs[0], paragraphs.slice(1).join('\n\n')].slice(0, options.maxMessages || 2);
  }

  const sentences = clean.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)?.map((part) => part.trim()).filter(Boolean) || [clean];
  if (sentences.length < 3) return [clean];
  const first = sentences.slice(0, Math.ceil(sentences.length / 2)).join(' ');
  const second = sentences.slice(Math.ceil(sentences.length / 2)).join(' ');
  return [first, second].filter(Boolean).slice(0, options.maxMessages || 2);
}

function followUpText({ intent, expression, toolsUsed, userText } = {}) {
  if (toolsUsed?.length) return '';
  if (intent?.mode !== 'chat') return '';
  const mood = expression?.mood;
  const lower = String(userText || '').toLowerCase();

  if (mood === 'sad') return 'Kalau kamu mau, ceritain bagian yang paling berat dulu. Aku dengerin.';
  if (mood === 'confused') return 'Mau aku bantu pecah jadi langkah kecil biar lebih gampang?';
  if (mood === 'respect') return 'Kita bahas pelan-pelan aja, biar nggak makin bikin kepala penuh.';
  if (/menurut kamu|gimana|gmn|apa pendapat/.test(lower)) return 'Aku bisa bantu lihat dari sisi lain juga kalau kamu mau.';
  return '';
}

async function sendTyping(conn, jid, duration = 600) {
  if (typeof conn.sendPresenceUpdate !== 'function') return;
  try {
    await conn.sendPresenceUpdate('composing', jid);
    await sleep(duration);
    await conn.sendPresenceUpdate('paused', jid);
  } catch {}
}

export async function deliverVaniaResponse({ conn, m, result, userText = '' } = {}) {
  if (!result) return result;
  const settings = deliverySettings();
  const sent = [];

  if (result.text) {
    const parts = settings.enabled ? splitNatural(result.text, settings) : [result.text];
    for (let i = 0; i < parts.length; i++) {
      if (settings.typingPresence) await sendTyping(conn, m.chat, Math.min(1200, 350 + parts[i].length * 8));
      if (i > 0) await sleep(settings.delayMs);
      await m.reply(parts[i]);
      sent.push('text');
    }
  }

  const expressionHasText = Array.isArray(result.expression?.actions) && result.expression.actions.some((action) => action.type === 'text');
  const followUp = expressionHasText ? '' : followUpText({
    intent: result.intent,
    expression: result.expression,
    toolsUsed: result.toolsUsed,
    userText,
  });

  const session = getSession(m.chat, m.sender) || {};
  const canFollowUp = !session.lastFollowUpAt || Date.now() - Number(session.lastFollowUpAt) > 180000;
  if (settings.enabled && followUp && canFollowUp && chance(settings.followUpChance)) {
    await sleep(settings.delayMs + 350);
    await conn.sendMessage(m.chat, { text: followUp }, { quoted: m });
    setSession(m.chat, m.sender, { lastFollowUpAt: Date.now() });
    sent.push('followup');
  }

  if (result.expression?.actions?.length) {
    result.expression.sent = await sendVaniaExpression(conn, m, result.expression);
    sent.push(...result.expression.sent.map((item) => `expression:${item}`));
  }

  result.delivery = sent;
  return result;
}
