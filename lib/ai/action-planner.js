function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function cooldownReady(session = {}, key, cooldownMs) {
  const last = Number(session?.[key] || 0);
  return !last || Date.now() - last >= Number(cooldownMs || 0);
}

function hasTools(toolsUsed = []) {
  return Array.isArray(toolsUsed) && toolsUsed.length > 0;
}

function suggestedToolForMood(moodAnalysis = {}) {
  if (moodAnalysis.mood === 'sad' || moodAnalysis.mood === 'lonely' || moodAnalysis.mood === 'anxious') {
    return {
      name: 'play_music',
      mode: 'suggest_only',
      text: 'Kalau kamu mau, aku juga bisa bantu cariin sesuatu yang lebih menenangkan buat didengerin.',
      reason: 'Mood user cocok dengan bantuan musik/hiburan ringan, tapi perlu persetujuan dulu.',
    };
  }
  return null;
}

export function planVaniaActions({
  m,
  intent = {},
  moodAnalysis = {},
  answer = '',
  session = {},
  settings = {},
  toolsUsed = [],
  explicitVoice = false,
} = {}) {
  const actions = [];
  const delivery = settings.delivery || {};
  const expressions = settings.expressions || {};
  const emotional = moodAnalysis.mood !== 'neutral' && moodAnalysis.confidence >= 0.18;
  const toolMode = intent.mode === 'tool' || hasTools(toolsUsed);
  const isGroup = !!m?.isGroup;

  if (expressions.reactions && emotional && cooldownReady(session, 'lastExpressionAt', expressions.cooldownMs)) {
    actions.push({ type: 'react', emoji: moodAnalysis.emoji, mood: moodAnalysis.mood, priority: 'low' });
  }

  const stickerThreshold = isGroup ? 0.78 : 0.62;
  if (
    expressions.stickers
    && emotional
    && !toolMode
    && moodAnalysis.confidence >= stickerThreshold
    && cooldownReady(session, 'lastStickerAt', expressions.stickerCooldownMs)
  ) {
    actions.push({ type: 'sticker', mood: moodAnalysis.sticker, reason: moodAnalysis.label, priority: 'medium' });
  }

  const shouldFollowUp = delivery.enabled
    && !toolMode
    && ['lonely', 'sad', 'anxious', 'confused'].includes(moodAnalysis.mood)
    && moodAnalysis.confidence >= 0.45
    && cooldownReady(session, 'lastFollowUpAt', 180000);

  if (shouldFollowUp) {
    actions.push({ type: 'followup', mood: moodAnalysis.mood, priority: 'medium' });
  }

  if (expressions.voice && explicitVoice && cooldownReady(session, 'lastVoiceAt', expressions.voiceCooldownMs)) {
    actions.push({ type: 'voice', text: answer, mood: moodAnalysis.mood, priority: 'high' });
  }

  const suggestion = suggestedToolForMood(moodAnalysis);
  if (suggestion && !toolMode && cooldownReady(session, 'lastToolSuggestionAt', 300000)) {
    actions.push({ type: 'suggest_tool', ...suggestion, priority: 'low' });
  }

  return {
    mood: moodAnalysis.mood,
    confidence: clamp(moodAnalysis.confidence),
    actions,
  };
}
