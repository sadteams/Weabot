import fetch from 'node-fetch';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_AI_API_KEY
    || global.geminiApiKey
    || global.GEMINI_API_KEY
    || '';
}

export function isGeminiConfigured() {
  return !!getGeminiApiKey();
}

function normalizeGeminiError(status, body) {
  const message = body?.error?.message || body?.message || JSON.stringify(body);
  const error = new Error(`Gemini API error ${status}: ${message}`);
  error.status = status;
  error.body = body;
  return error;
}

export async function generateGeminiContent({
  model,
  contents,
  systemInstruction,
  tools,
  temperature = 0.75,
  maxTokens = 1024,
  topP = 0.95,
  thinkingLevel = 'minimal',
} = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY belum disetel. Isi environment variable GEMINI_API_KEY sebelum memakai Vania.');
  if (!model) throw new Error('Model Gemini belum ditentukan.');
  if (!Array.isArray(contents) || !contents.length) throw new Error('Contents Gemini tidak boleh kosong.');

  const payload = {
    contents,
    generationConfig: {
      temperature,
      topP,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel },
    },
  };

  if (systemInstruction) payload.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
  if (Array.isArray(tools) && tools.length) payload.tools = tools;

  const response = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }

  if (!response.ok) throw normalizeGeminiError(response.status, body);
  return body;
}

export function geminiText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('')
    .trim();
}

export function geminiFunctionCalls(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.functionCall)
    .filter(Boolean);
}

export function geminiModelContent(response) {
  return response?.candidates?.[0]?.content || null;
}
