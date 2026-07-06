const MOOD_RULES = {
  lonely: {
    label: 'kesepian / butuh ditemani',
    sticker: 'cheerful',
    emoji: '🤍',
    base: 0.25,
    patterns: [
      /\b(kesepian|sendirian|sepi|butuh teman|temenin|nemenin|ga ada teman|nggak ada teman|sendiri banget)\b/i,
    ],
  },
  sad: {
    label: 'sedih / terluka',
    sticker: 'sad',
    emoji: '🫂',
    base: 0.24,
    patterns: [
      /\b(sedih|capek|lelah|hancur|nangis|kecewa|patah hati|diputusin|putus|sakit hati|terluka)\b/i,
    ],
  },
  anxious: {
    label: 'cemas / overthinking',
    sticker: 'respect',
    emoji: '🤍',
    base: 0.22,
    patterns: [
      /\b(cemas|takut|overthinking|panik|khawatir|gelisah|deg-degan|kepikiran)\b/i,
    ],
  },
  angry: {
    label: 'marah / kesal',
    sticker: 'respect',
    emoji: '🤍',
    base: 0.2,
    patterns: [
      /\b(marah|kesal|sebel|emosi|nyebelin|benci|brengsek|bangsat|tolong serius)\b/i,
    ],
  },
  happy: {
    label: 'senang / apresiatif',
    sticker: 'happy',
    emoji: '😊',
    base: 0.18,
    patterns: [
      /\b(makasih|terima kasih|thanks|thank you|senang|bahagia|lega|sip|mantap)\b/i,
    ],
  },
  playful: {
    label: 'bercanda / santai',
    sticker: 'cheerful',
    emoji: '✨',
    base: 0.16,
    patterns: [
      /\b(wkwk|haha|hehe|lucu|bercanda|candaan|iseng|cie|gemes)\b/i,
    ],
  },
  confused: {
    label: 'bingung / butuh arahan',
    sticker: 'neutral',
    emoji: '🤔',
    base: 0.18,
    patterns: [
      /\b(bingung|gimana|gmn|pusing|nggak ngerti|ga ngerti|tidak paham|kurang paham|maksudnya)\b/i,
    ],
  },
};

function normalize(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function scoreMood(text, rule) {
  let score = 0;
  for (const pattern of rule.patterns) {
    const matches = normalize(text).match(pattern);
    if (matches) score += rule.base + Math.min(0.28, matches[0].length / 80);
  }
  if (/[!?]{2,}|😭|😢|🥺|😔|😞|💔/.test(text)) score += 0.16;
  if (/\.\.\.|…/.test(text)) score += 0.04;
  return Math.min(1, score);
}

export function analyzeMood({ text = '', answer = '', quotedText = '', previousMood = '' } = {}) {
  const combined = [text, quotedText, answer].map(normalize).filter(Boolean).join('\n');
  const scores = Object.fromEntries(Object.entries(MOOD_RULES).map(([mood, rule]) => [mood, scoreMood(combined, rule)]));
  if (previousMood && scores[previousMood] != null) scores[previousMood] = Math.min(1, scores[previousMood] + 0.06);

  const [mood, confidence] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || ['neutral', 0];
  if (!confidence || confidence < 0.18) {
    return {
      mood: 'neutral',
      label: 'netral',
      confidence: 0,
      intensity: 0,
      emoji: '🙂',
      sticker: 'neutral',
      scores,
    };
  }

  const rule = MOOD_RULES[mood];
  return {
    mood,
    label: rule.label,
    confidence: Number(confidence.toFixed(2)),
    intensity: Number(Math.min(1, confidence + (combined.length > 120 ? 0.08 : 0)).toFixed(2)),
    emoji: rule.emoji,
    sticker: rule.sticker,
    scores,
  };
}

export function moodInstruction(analysis = {}) {
  switch (analysis.mood) {
    case 'lonely':
      return 'User tampak kesepian atau ingin ditemani. Jadilah teman bicara yang hangat, hadir, dan beri pilihan obrolan ringan.';
    case 'sad':
      return 'User tampak sedih/terluka. Validasi perasaan dulu, jangan menggurui, lalu tawarkan ruang cerita.';
    case 'anxious':
      return 'User tampak cemas. Tenangkan, pecah masalah jadi langkah kecil, jangan menambah tekanan.';
    case 'angry':
      return 'User tampak marah/kesal. Tetap tenang dan respect, jangan membalas dengan nada kesal.';
    case 'happy':
      return 'User sedang positif/apresiatif. Balas hangat dan ringan.';
    case 'playful':
      return 'User sedang bercanda/santai. Boleh ikut ringan, tapi jangan berlebihan.';
    case 'confused':
      return 'User tampak bingung. Jelaskan dengan struktur sederhana dan tawarkan langkah kecil.';
    default:
      return 'Mood netral. Jawab natural dan relevan.';
  }
}
