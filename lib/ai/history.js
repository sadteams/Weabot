function getAiDb() {
  if (!global.db) global.db = {};
  if (!global.db.data) global.db.data = {};
  if (!global.db.data.ai) global.db.data.ai = {};
  const ai = global.db.data.ai;
  ai.settings ||= {};
  ai.sessions ||= {};
  ai.histories ||= {};
  ai.memories ||= {};
  ai.toolCalls ||= {};
  ai.usage ||= {};
  return ai;
}

export function sessionKey(chat, sender) {
  return `${chat || 'unknown'}:${sender || 'unknown'}`;
}

export function getAiSettings() {
  const ai = getAiDb();
  ai.settings.enabled ??= true;
  ai.settings.model ||= 'gemini-3.5-flash';
  ai.settings.provider ||= 'gemini';
  ai.settings.maxHistory = Number(ai.settings.maxHistory || 20);
  ai.settings.temperature = Number(ai.settings.temperature ?? 0.82);
  ai.settings.topP = Number(ai.settings.topP ?? 0.95);
  ai.settings.maxTokens = Number(ai.settings.maxTokens || 2048);
  ai.settings.thinkingLevel ||= 'minimal';
  ai.settings.allowTools ??= true;
  ai.settings.proactive ??= false;
  ai.settings.delivery ||= {};
  ai.settings.delivery.enabled ??= true;
  ai.settings.delivery.multiMessage ??= true;
  ai.settings.delivery.typingPresence ??= true;
  ai.settings.delivery.maxMessages = Number(ai.settings.delivery.maxMessages || 2);
  ai.settings.delivery.minSecondMessageLength = Number(ai.settings.delivery.minSecondMessageLength || 120);
  ai.settings.delivery.delayMs = Number(ai.settings.delivery.delayMs || 650);
  ai.settings.delivery.followUpChance = Number(ai.settings.delivery.followUpChance ?? 0.22);
  ai.settings.expressions ||= {};
  ai.settings.expressions.enabled ??= true;
  ai.settings.expressions.reactions ??= true;
  ai.settings.expressions.extraText ??= true;
  ai.settings.expressions.stickers ??= true;
  ai.settings.expressions.voice ??= true;
  ai.settings.expressions.cooldownMs = Number(ai.settings.expressions.cooldownMs || 120000);
  ai.settings.expressions.stickerCooldownMs = Number(ai.settings.expressions.stickerCooldownMs || 300000);
  ai.settings.expressions.voiceCooldownMs = Number(ai.settings.expressions.voiceCooldownMs || 300000);
  ai.settings.expressions.extraTextChance = Number(ai.settings.expressions.extraTextChance ?? 0.35);
  ai.settings.expressions.stickerChance = Number(ai.settings.expressions.stickerChance ?? 0.28);
  return ai.settings;
}

export function getSession(chat, sender) {
  const ai = getAiDb();
  const key = sessionKey(chat, sender);
  return ai.sessions[key] || null;
}

export function setSession(chat, sender, patch = {}) {
  const ai = getAiDb();
  const key = sessionKey(chat, sender);
  ai.sessions[key] = {
    ...(ai.sessions[key] || {}),
    ...patch,
    chat,
    sender,
    updatedAt: Date.now(),
  };
  return ai.sessions[key];
}

export function clearSession(chat, sender) {
  const ai = getAiDb();
  const key = sessionKey(chat, sender);
  delete ai.sessions[key];
  delete ai.histories[key];
  return true;
}

export function getHistory(chat, sender) {
  const ai = getAiDb();
  const key = sessionKey(chat, sender);
  return Array.isArray(ai.histories[key]) ? ai.histories[key] : [];
}

export function appendHistory(chat, sender, message, maxHistory = getAiSettings().maxHistory) {
  const ai = getAiDb();
  const key = sessionKey(chat, sender);
  ai.histories[key] = Array.isArray(ai.histories[key]) ? ai.histories[key] : [];
  ai.histories[key].push({ ...message, at: Date.now() });
  const limit = Math.max(2, Number(maxHistory || 20));
  if (ai.histories[key].length > limit) ai.histories[key] = ai.histories[key].slice(-limit);
  return ai.histories[key];
}

export function clearHistory(chat, sender) {
  const ai = getAiDb();
  delete ai.histories[sessionKey(chat, sender)];
  return true;
}

export function recordToolCall(call = {}) {
  const ai = getAiDb();
  const id = call.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  ai.toolCalls[id] = { id, ...call, at: Date.now() };
  return ai.toolCalls[id];
}
