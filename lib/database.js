const isNumber = (x) => typeof x === 'number' && !isNaN(x);

export default function initDatabase(m) {
  /* ── USER ── */
  if (typeof global.db.data.users[m.sender] !== 'object')
    global.db.data.users[m.sender] = {};

  const user = global.db.data.users[m.sender];
  if (!isNumber(user.exp))          user.exp          = 0;
  if (!isNumber(user.limit))        user.limit         = 100;
  if (!isNumber(user.saldo))        user.saldo         = 1000;
  if (!isNumber(user.money))        user.money         = 100000;
  if (!isNumber(user.bank))         user.bank          = 100000;
  if (!isNumber(user.lastclaim))    user.lastclaim     = 0;
  if (!isNumber(user.afk))          user.afk           = -1;
  if (!('afkReason'   in user))     user.afkReason     = '';
  if (!('registered'  in user))     user.registered    = false;
  if (!('name'        in user))     user.name          = m.name;
  if (!isNumber(user.age))          user.age           = -1;
  if (!isNumber(user.regTime))      user.regTime       = -1;
  if (!('banned'      in user))     user.banned        = false;
  if (!('online'      in user))     user.online        = false;
  if (!('premium'     in user))     user.premium       = false;
  if (!('premiumDate' in user))     user.premiumDate   = '';
  if (!('moderator'   in user))     user.moderator     = false;
  if (!isNumber(user.warn))         user.warn          = 0;
  if (!isNumber(user.chat))         user.chat          = 0;
  if (!isNumber(user.level))        user.level         = 1;
  if (!isNumber(user.joinlimit))    user.joinlimit     = 1;

  /* ── CHAT ── */
  if (typeof global.db.data.chats[m.chat] !== 'object')
    global.db.data.chats[m.chat] = {};

  const chat = global.db.data.chats[m.chat];
  if (!('isBanned'  in chat))  chat.isBanned   = false;
  if (!('mute'      in chat))  chat.mute        = false;
  if (!('welcome'   in chat))  chat.welcome     = false;
  if (!('detect'    in chat))  chat.detect      = false;
  if (!('sWelcome'  in chat))  chat.sWelcome    = '';
  if (!('sBye'      in chat))  chat.sBye        = '';
  if (!('sPromote'  in chat))  chat.sPromote    = '';
  if (!('sDemote'   in chat))  chat.sDemote     = '';
  if (!('antilink'  in chat))  chat.antilink    = false;
  if (!('antispam'  in chat))  chat.antispam    = false;
  if (!('antibot'   in chat))  chat.antibot     = false;
  if (!('whitelist' in chat))  chat.whitelist   = false;
  if (!isNumber(chat.chat))    chat.chat        = 0;

  /* ── AI / VANIA ── */
  if (typeof global.db.data.ai !== 'object') global.db.data.ai = {};
  const ai = global.db.data.ai;
  if (typeof ai.settings !== 'object') ai.settings = {};
  if (!('enabled' in ai.settings)) ai.settings.enabled = true;
  if (!('model' in ai.settings)) ai.settings.model = 'gemini-3.5-flash';
  if (!('provider' in ai.settings)) ai.settings.provider = 'gemini';
  if (!isNumber(ai.settings.maxHistory)) ai.settings.maxHistory = 20;
  if (!isNumber(ai.settings.temperature)) ai.settings.temperature = 0.82;
  if (!isNumber(ai.settings.topP)) ai.settings.topP = 0.95;
  if (!isNumber(ai.settings.maxTokens)) ai.settings.maxTokens = 2048;
  if (!('thinkingLevel' in ai.settings)) ai.settings.thinkingLevel = 'minimal';
  if (!('allowTools' in ai.settings)) ai.settings.allowTools = true;
  if (!('proactive' in ai.settings)) ai.settings.proactive = false;
  if (typeof ai.settings.delivery !== 'object') ai.settings.delivery = {};
  if (!('enabled' in ai.settings.delivery)) ai.settings.delivery.enabled = true;
  if (!('multiMessage' in ai.settings.delivery)) ai.settings.delivery.multiMessage = true;
  if (!('typingPresence' in ai.settings.delivery)) ai.settings.delivery.typingPresence = true;
  if (!isNumber(ai.settings.delivery.maxMessages)) ai.settings.delivery.maxMessages = 2;
  if (!isNumber(ai.settings.delivery.minSecondMessageLength)) ai.settings.delivery.minSecondMessageLength = 120;
  if (!isNumber(ai.settings.delivery.delayMs)) ai.settings.delivery.delayMs = 650;
  if (!isNumber(ai.settings.delivery.followUpChance)) ai.settings.delivery.followUpChance = 0.22;
  if (typeof ai.settings.expressions !== 'object') ai.settings.expressions = {};
  if (!('enabled' in ai.settings.expressions)) ai.settings.expressions.enabled = true;
  if (!('reactions' in ai.settings.expressions)) ai.settings.expressions.reactions = true;
  if (!('extraText' in ai.settings.expressions)) ai.settings.expressions.extraText = true;
  if (!('stickers' in ai.settings.expressions)) ai.settings.expressions.stickers = true;
  if (!('voice' in ai.settings.expressions)) ai.settings.expressions.voice = true;
  if (!isNumber(ai.settings.expressions.cooldownMs)) ai.settings.expressions.cooldownMs = 120000;
  if (!isNumber(ai.settings.expressions.stickerCooldownMs)) ai.settings.expressions.stickerCooldownMs = 300000;
  if (!isNumber(ai.settings.expressions.voiceCooldownMs)) ai.settings.expressions.voiceCooldownMs = 300000;
  if (!isNumber(ai.settings.expressions.extraTextChance)) ai.settings.expressions.extraTextChance = 0.35;
  if (!isNumber(ai.settings.expressions.stickerChance)) ai.settings.expressions.stickerChance = 0.28;
  if (typeof ai.sessions !== 'object') ai.sessions = {};
  if (typeof ai.histories !== 'object') ai.histories = {};
  if (typeof ai.memories !== 'object') ai.memories = {};
  if (typeof ai.toolCalls !== 'object') ai.toolCalls = {};
  if (typeof ai.usage !== 'object') ai.usage = {};
}
