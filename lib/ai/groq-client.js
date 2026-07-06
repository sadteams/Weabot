import fetch from 'node-fetch';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export function getGroqApiKey() {
  return process.env.GROQ_API_KEY
    || process.env.GROQ_API_KEY_V1
    || process.env.GROQ_API_KEY_V2
    || global.groqApiKey
    || global.GROQ_API_KEY
    || '';
}

export function isGroqConfigured() {
  return !!getGroqApiKey();
}

function normalizeGroqError(status, body) {
  const message = body?.error?.message || body?.message || JSON.stringify(body);
  const error = new Error(`Groq API error ${status}: ${message}`);
  error.status = status;
  error.body = body;
  return error;
}

export async function createChatCompletion({
  model,
  messages,
  tools,
  toolChoice = 'auto',
  temperature = 0.7,
  maxTokens = 1024,
  topP = 1,
} = {}) {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('GROQ_API_KEY belum disetel. Isi environment variable GROQ_API_KEY, GROQ_API_KEY_V1, atau GROQ_API_KEY_V2 sebelum memakai Vania.');
  if (!model) throw new Error('Model Groq belum ditentukan.');
  if (!Array.isArray(messages) || !messages.length) throw new Error('Messages Groq tidak boleh kosong.');

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };

  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  if (!response.ok) throw normalizeGroqError(response.status, body);
  return body;
}
