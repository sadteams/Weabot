import { getAiSettings, getSession, setSession } from './history.js';
import { wantsVoice } from './intent.js';
import { analyzeMood } from './mood-analyzer.js';
import { planVaniaActions } from './action-planner.js';

const STICKERS = {
  happy: 'https://raw.githubusercontent.com/Xvannn07/Data-Ai-Vania/refs/heads/main/ekspresi/bahagia.webp',
  neutral: 'https://raw.githubusercontent.com/Xvannn07/Data-Ai-Vania/refs/heads/main/ekspresi/biasa.webp',
  respect: 'https://raw.githubusercontent.com/Xvannn07/Data-Ai-Vania/refs/heads/main/ekspresi/respect.webp',
  sad: 'https://raw.githubusercontent.com/Xvannn07/Data-Ai-Vania/refs/heads/main/ekspresi/sedih.webp',
  cheerful: 'https://raw.githubusercontent.com/Xvannn07/Data-Ai-Vania/refs/heads/main/ekspresi/senang.webp',
};

const MOODS = {
  sad: {
    emoji: '🫂',
    sticker: 'sad',
    extra: 'Aku di sini. Pelan-pelan aja, kamu boleh cerita tanpa harus terlihat kuat terus.',
    patterns: [/\b(sedih|capek|lelah|hancur|nangis|kecewa|sendiri|patah hati|takut|cemas|overthinking)\b/i],
  },
  respect: {
    emoji: '🤍',
    sticker: 'respect',
    extra: 'Aku paham. Aku akan jawab dengan tenang dan tetap bantu kamu beresin ini satu-satu.',
    patterns: [/\b(marah|kesal|sebel|emosi|nyebelin|benci|brengsek|anjir|anjing|bangsat|tolong serius)\b/i],
  },
  cheerful: {
    emoji: '✨',
    sticker: 'cheerful',
    extra: 'Hehe, aku ikut senang dengarnya.',
    patterns: [/\b(senang|bahagia|mantap|keren|wkwk|haha|asyik|yeay|hore)\b/i],
  },
  happy: {
    emoji: '😊',
    sticker: 'happy',
    extra: 'Sama-sama. Senang bisa bantu.',
    patterns: [/\b(makasih|terima kasih|thanks|thank you|sip|oke makasih)\b/i],
  },
  confused: {
    emoji: '🤔',
    sticker: 'neutral',
    extra: 'Aku coba rapikan dulu maksudnya biar lebih gampang dipahami.',
    patterns: [/\b(bingung|gimana|gmn|pusing|nggak ngerti|ga ngerti|tidak paham|kurang paham)\b/i],
  },
};

function detectMood(text = '') {
  const value = String(text || '');
  for (const [name, config] of Object.entries(MOODS)) {
    if (config.patterns.some((pattern) => pattern.test(value))) return { name, ...config };
  }
  return { name: 'neutral', emoji: '🙂', sticker: 'neutral', extra: '' };
}

function getExpressionSettings() {
  const settings = getAiSettings();
  const expressions = settings.expressions ||= {};
  expressions.enabled ??= true;
  expressions.reactions ??= true;
  expressions.extraText ??= true;
  expressions.stickers ??= true;
  expressions.voice ??= true;
  expressions.cooldownMs = Number(expressions.cooldownMs || 120000);
  expressions.stickerCooldownMs = Number(expressions.stickerCooldownMs || 300000);
  expressions.voiceCooldownMs = Number(expressions.voiceCooldownMs || 300000);
  expressions.extraTextChance = Number(expressions.extraTextChance ?? 0.35);
  expressions.stickerChance = Number(expressions.stickerChance ?? 0.28);
  return expressions;
}

function canUse(session, key, cooldown) {
  const last = Number(session?.[key] || 0);
  return !last || Date.now() - last >= cooldown;
}

function chance(value) {
  return Math.random() < Math.max(0, Math.min(1, Number(value || 0)));
}

function answerAlreadyExpressive(answer = '', mood = '') {
  const text = String(answer || '').toLowerCase();
  if (!text) return false;
  if (mood === 'sad') return /aku (di sini|dengerin|paham)|pelan-pelan|nggak harus|tidak harus|boleh cerita/.test(text);
  if (mood === 'respect') return /aku paham|aku ngerti|tenang|pelan-pelan|aku bantu|kita beresin/.test(text);
  if (mood === 'happy' || mood === 'cheerful') return /sama-sama|senang|ikut senang|mantap|sip/.test(text);
  if (mood === 'confused') return /aku coba|maksudnya|biar jelas|kita rapikan/.test(text);
  return false;
}

function stickerChanceFor(mood, settings, hasTools, isGroup) {
  if (hasTools) return 0;
  const base = mood === 'sad' ? 0.42
    : mood === 'respect' ? 0.36
    : mood === 'cheerful' ? 0.24
    : mood === 'happy' ? 0.18
    : mood === 'confused' ? 0.12
    : 0;
  const configured = Number(settings.stickerChance ?? base);
  const factor = isGroup ? 0.55 : 1;
  return Math.min(base, configured) * factor;
}

function ttsUrl(text = '') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=id&client=tw-ob&q=${encodeURIComponent(clean)}`;
}

export function planVaniaExpression({ m, text = '', answer = '', intent = {}, toolsUsed = [], moodAnalysis } = {}) {
  const settings = getExpressionSettings();
  if (!settings.enabled) return { enabled: false, actions: [], mood: 'neutral' };

  const userText = String(text || m?.text || '');
  const analysis = moodAnalysis || analyzeMood({ text: userText, answer });
  const explicitVoice = wantsVoice(userText);
  const session = getSession(m?.chat, m?.sender) || {};
  const planner = planVaniaActions({
    m,
    intent,
    moodAnalysis: analysis,
    answer,
    session,
    settings: { expressions: settings, delivery: getAiSettings().delivery || {} },
    toolsUsed,
    explicitVoice,
  });

  const actions = planner.actions.map((action) => {
    if (action.type === 'sticker') {
      return { ...action, url: STICKERS[action.mood] || STICKERS[analysis.sticker] || STICKERS.neutral };
    }
    if (action.type === 'followup') {
      const textMap = {
        lonely: 'Aku di sini kok. Mau ditemenin ngobrol ringan dulu?',
        sad: 'Kalau kamu mau, ceritain bagian yang paling berat dulu. Aku dengerin.',
        anxious: 'Tarik napas dulu. Kita urai satu-satu, pelan-pelan.',
        confused: 'Mau aku bantu pecah jadi langkah kecil biar lebih gampang?',
      };
      return { type: 'text', text: textMap[action.mood] || 'Aku dengerin. Lanjut cerita aja pelan-pelan.', mood: action.mood, priority: action.priority };
    }
    if (action.type === 'suggest_tool') {
      return { type: 'text', text: action.text, mood: analysis.mood, priority: action.priority, suggestion: action.name };
    }
    return action;
  });

  return {
    enabled: true,
    mood: analysis.mood,
    moodLabel: analysis.label,
    confidence: analysis.confidence,
    intensity: analysis.intensity,
    explicitVoice,
    actions,
  };
}

export async function sendVaniaExpression(conn, m, plan = {}) {
  if (!plan?.actions?.length) return [];
  const sent = [];
  const patch = {};

  for (const action of plan.actions) {
    try {
      if (action.type === 'react' && action.emoji && typeof m.react === 'function') {
        await m.react(action.emoji);
        patch.lastExpressionAt = Date.now();
        sent.push(action.type);
      } else if (action.type === 'text' && action.text) {
        await conn.sendMessage(m.chat, { text: action.text }, { quoted: m });
        patch.lastExtraTextAt = Date.now();
        sent.push(action.type);
      } else if (action.type === 'sticker' && action.url) {
        await conn.sendMessage(m.chat, { sticker: { url: action.url } }, { quoted: m });
        patch.lastStickerAt = Date.now();
        sent.push(action.type);
      } else if (action.type === 'voice' && action.text) {
        await conn.sendPTT(m.chat, { url: ttsUrl(action.text) }, m, { mimetype: 'audio/mpeg' });
        patch.lastVoiceAt = Date.now();
        sent.push(action.type);
      }
    } catch (error) {
      sent.push(`${action.type}:failed`);
    }
  }

  if (Object.keys(patch).length) setSession(m.chat, m.sender, patch);
  return sent;
}
