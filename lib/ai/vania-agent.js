import { appendHistory, getAiSettings, getHistory, setSession } from './history.js';
import { resolveUserRole } from './roles.js';
import { getPluginCatalog, getGeminiToolDefinitions } from './plugin-registry.js';
import { buildVaniaSystemPrompt } from './prompt.js';
import { generateGeminiContent, geminiFunctionCalls, geminiModelContent, geminiText, isGeminiConfigured } from './gemini-client.js';
import { executeAiTool } from './tool-executor.js';
import { detectVaniaIntent, stripVoiceRequest } from './intent.js';
import { planVaniaExpression } from './expression.js';
import { buildUserContext, formatUserContext } from './context.js';
import { analyzeMood, moodInstruction } from './mood-analyzer.js';
import { securitySummary } from './security-policy.js';

const VALID_HISTORY_ROLES = new Set(['user', 'assistant']);

function cleanContent(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function isLegacyRigidAssistantText(text = '') {
  return /saya adalah ai|saya tidak memiliki perasaan|menu telah ditampilkan|sticker telah dibuat|khodam .* sudah dicek|tool berhasil/i.test(text);
}

function toGeminiHistory(history = []) {
  const contents = [];
  let lastRole = null;
  const recent = history.slice(-12);

  for (const item of recent) {
    if (!VALID_HISTORY_ROLES.has(item?.role)) continue;
    const text = cleanContent(item.content).trim();
    if (!text) continue;
    if (item.role === 'assistant' && isLegacyRigidAssistantText(text)) continue;
    const role = item.role === 'assistant' ? 'model' : 'user';
    if (role === lastRole && contents.length) {
      contents[contents.length - 1].parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
      lastRole = role;
    }
  }

  return contents;
}

function isInternalRoutingText(text = '') {
  return /no tools? needed|pure chat|function call|routing|tool decision|tools? needed/i.test(String(text || ''));
}

function fallbackNaturalReply(userText = '', userContext = {}, intent = {}) {
  const name = userContext?.name && !/^\d+$/.test(userContext.name) ? userContext.name : '';
  const prefix = name ? name + ', ' : '';
  const lower = String(userText || '').toLowerCase();
  if (/capek|lelah|sedih|cemas|takut|overthinking/.test(lower)) {
    return prefix + 'aku di sini. Capeknya lebih ke badan, pikiran, atau dua-duanya? Cerita pelan-pelan aja, nggak perlu langsung rapi.';
  }
  if (/bingung|nggak ngerti|ga ngerti|pusing/.test(lower)) {
    return prefix + 'kita pelan-pelan ya. Bagian mana yang paling bikin kamu bingung?';
  }
  if (intent?.mode === 'tool') return 'Aku sudah cek hasilnya. Kalau kamu mau, aku bisa bantu lanjutkan dari situ.';
  return prefix + 'aku dengerin. Mau mulai dari bagian yang paling penting dulu?';
}

function cleanAssistantText(text = '', userText = '', userContext = {}, intent = {}) {
  const value = cleanContent(text).trim();
  if (!value || isInternalRoutingText(value)) return fallbackNaturalReply(userText, userContext, intent);
  return value;
}

function updateUsage(usage = {}) {
  if (!global.db?.data?.ai?.usage) return;
  const dbUsage = global.db.data.ai.usage;
  dbUsage.totalRequests = Number(dbUsage.totalRequests || 0) + 1;
  dbUsage.promptTokens = Number(dbUsage.promptTokens || 0) + Number(usage.promptTokenCount || 0);
  dbUsage.completionTokens = Number(dbUsage.completionTokens || 0) + Number(usage.candidatesTokenCount || 0);
  dbUsage.totalTokens = Number(dbUsage.totalTokens || 0) + Number(usage.totalTokenCount || 0);
  dbUsage.provider = 'gemini';
  dbUsage.updatedAt = Date.now();
}

function toolResponsePart(call, result) {
  return {
    functionResponse: {
      name: call.name,
      id: call.id,
      response: { result },
    },
  };
}

export async function runVania({ conn, m, text, context = {} } = {}) {
  const settings = getAiSettings();
  const roleInfo = resolveUserRole(m, conn, context);
  const rawUserText = cleanContent(text || m?.text || '').trim();
  const voiceRequestedText = rawUserText;
  const userText = stripVoiceRequest(rawUserText) || rawUserText;
  const intent = detectVaniaIntent(userText, context);

  if (!settings.enabled) {
    return { ok: false, text: 'Sistem AI Vania sedang dinonaktifkan dari pengaturan bot.', roleInfo, toolsUsed: [], intent };
  }

  if (!userText) {
    return { ok: false, text: 'Tulis pesan yang ingin kamu bahas dengan Vania.', roleInfo, toolsUsed: [], intent };
  }

  setSession(m.chat, m.sender, { enabled: true, role: roleInfo.role, lastActive: Date.now() });
  appendHistory(m.chat, m.sender, { role: 'user', content: userText }, settings.maxHistory);

  if (!isGeminiConfigured()) {
    return {
      ok: false,
      text: 'GEMINI_API_KEY belum disetel. Tambahkan environment variable GEMINI_API_KEY agar Vania bisa memakai Gemini.',
      roleInfo,
      toolsUsed: [],
      intent,
    };
  }

  const userContext = await buildUserContext({ conn, m, roleInfo });
  const userContextText = formatUserContext(userContext);
  const previousSession = global.db?.data?.ai?.sessions?.[m.chat + ':' + m.sender] || {};
  const quotedText = m?.quoted?.text || m?.quoted?.body || '';
  const moodAnalysis = analyzeMood({ text: userText, quotedText, previousMood: previousSession.lastMood });
  const tools = settings.allowTools && intent.allowTools ? getPluginCatalog({ roleInfo }) : [];
  const geminiTools = settings.allowTools && intent.allowTools ? getGeminiToolDefinitions({ roleInfo }) : [];
  const systemInstruction = buildVaniaSystemPrompt({
    roleInfo,
    tools,
    intent,
    userContextText,
    moodInstructionText: moodInstruction(moodAnalysis),
    securityText: securitySummary(),
  });
  const contents = toGeminiHistory(getHistory(m.chat, m.sender));
  const toolsUsed = [];
  let response;

  for (let round = 0; round < 3; round++) {
    try {
      response = await generateGeminiContent({
        model: settings.model,
        contents,
        systemInstruction,
        tools: geminiTools,
        temperature: Number(settings.temperature ?? 0.82),
        maxTokens: Number(settings.maxTokens || 1024),
        topP: Number(settings.topP || 0.95),
        thinkingLevel: settings.thinkingLevel || (intent.mode === 'tool' ? 'low' : 'minimal'),
      });
    } catch (error) {
      const status = error?.status ? ` (${error.status})` : '';
      return {
        ok: false,
        text: `Vania belum bisa menghubungi Gemini${status}: ${error?.message || String(error)}`,
        roleInfo,
        toolsUsed,
        intent,
      };
    }

    updateUsage(response.usageMetadata);
    const calls = geminiFunctionCalls(response);

    if (!calls.length) {
      const finalText = cleanAssistantText(geminiText(response), userText, userContext, intent) || 'Aku sudah memprosesnya, tapi belum ada jawaban teks dari Gemini.';
      appendHistory(m.chat, m.sender, { role: 'assistant', content: finalText }, settings.maxHistory);
      const expression = planVaniaExpression({ m, text: voiceRequestedText, answer: finalText, intent, toolsUsed, moodAnalysis });
      setSession(m.chat, m.sender, { lastMood: expression.mood || moodAnalysis.mood, lastMoodConfidence: moodAnalysis.confidence });
      return { ok: true, text: finalText, roleInfo, userContext, toolsUsed, intent, moodAnalysis, expression, raw: response };
    }

    const modelContent = geminiModelContent(response);
    if (modelContent) contents.push(modelContent);

    for (const call of calls) {
      const result = await executeAiTool({ conn, m, toolCall: { functionCall: call }, roleInfo, deliverText: false });
      toolsUsed.push({ name: call.name, ok: !!result.ok, outputs: result.outputs || [] });
      contents.push({ role: 'user', parts: [toolResponsePart(call, result)] });
      appendHistory(m.chat, m.sender, {
        role: 'tool',
        name: call.name,
        content: JSON.stringify(result),
      }, settings.maxHistory);
    }
  }

  const fallback = cleanAssistantText(geminiText(response), userText, userContext, intent) || 'Aku sudah menjalankan fitur yang diminta, tapi belum mendapat jawaban akhir yang rapi. Coba ulangi dengan instruksi yang lebih spesifik.';
  appendHistory(m.chat, m.sender, { role: 'assistant', content: fallback }, settings.maxHistory);
  const expression = planVaniaExpression({ m, text: voiceRequestedText, answer: fallback, intent, toolsUsed, moodAnalysis });
  setSession(m.chat, m.sender, { lastMood: expression.mood || moodAnalysis.mood, lastMoodConfidence: moodAnalysis.confidence });
  return { ok: true, text: fallback, roleInfo, userContext, toolsUsed, intent, moodAnalysis, expression, raw: response };
}
