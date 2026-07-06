const TOOL_KEYWORDS = [
  'download', 'unduh', 'downloadkan', 'ambilkan', 'instagram', 'reel',
  'translate', 'terjemah', 'terjemahkan', 'artikan',
  'short', 'shorten', 'pendekkan', 'tinyurl', 'link pendek',
  'sticker', 'stiker', 'brat', 'ocr', 'baca gambar', 'baca teks',
  'cek limit', 'limit saya', 'runtime', 'uptime', 'ping', 'status bot',
  'profile', 'profil', 'menu', 'cek id', 'jid', 'khodam',
];

const CHAT_KEYWORDS = [
  'curhat', 'cerita', 'sedih', 'capek', 'bingung', 'takut', 'marah', 'kesal',
  'menurut kamu', 'gimana ya', 'apa pendapat', 'aku merasa', 'aku lagi',
  'temani', 'ngobrol', 'nasihat', 'saran', 'motivasi', 'jelasin', 'explain',
];

const EXECUTION_PATTERNS = [
  /\b(pakai|gunakan|jalankan|eksekusi|buka)\s+(tool|fitur|plugin)\b/i,
  /\b(tolong|coba|bantu)\s+(download|unduh|terjemah|translate|pendekkan|shorten|buat\s+stiker|buat\s+sticker|ocr|cek\s+limit|cek\s+id|cek\s+runtime|ping)\b/i,
  /\b(ig|igdl)\b/i,
  /https?:\/\/\S+/i,
];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasKeyword(text, keyword) {
  const escaped = escapeRegExp(keyword).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i').test(text);
}

export function detectVaniaIntent(text = '', options = {}) {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  const explicitChat = CHAT_KEYWORDS.some((keyword) => hasKeyword(lower, keyword));
  const explicitTool = EXECUTION_PATTERNS.some((pattern) => pattern.test(value))
    || TOOL_KEYWORDS.some((keyword) => hasKeyword(lower, keyword));

  if (options.forceTool) return { mode: 'tool', allowTools: true, reason: 'forced-tool' };
  if (options.forceChat) return { mode: 'chat', allowTools: false, reason: 'forced-chat' };
  if (explicitTool && !explicitChat) return { mode: 'tool', allowTools: true, reason: 'explicit-tool-intent' };
  if (explicitTool && explicitChat) return { mode: 'chat', allowTools: false, reason: 'chat-intent-priority' };
  return { mode: 'chat', allowTools: false, reason: 'default-chat' };
}

export function wantsVoice(text = '') {
  const value = String(text || '');
  return /\b(jawab|balas|kirim|bikin|buat)\b.{0,24}\b(voice|vn|ptt|pesan suara|audio)\b/i.test(value)
    || /\b(pakai|dengan|dalam)\s+(voice|vn|ptt|pesan suara|audio)\b/i.test(value);
}

export function stripVoiceRequest(text = '') {
  return String(text || '')
    .replace(/\b(jawab|balas|kirim|bikin|buat)\b.{0,24}\b(voice|vn|ptt|pesan suara|audio)\b/gi, '')
    .replace(/\b(pakai|dengan|dalam)\s+(voice|vn|ptt|pesan suara|audio)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
