import moment from 'moment-timezone';

global.owner      = ['62895336282144'];
global.nameowner  = 'The.Sad.Boy01';
global.nomorown   = '62895336282144';

global.wm         = 'Ayudhia Bot';
global.packname   = 'Intan';
global.author     = 'The.Sad.Boy01';
global.isPairing  = true;          // true = pairing code, false = QR
global.gconly     = false;         // true = group only mode
global.selfMode   = false;         // true = self / owner only

global.wait       = '*⏳ Loading…* Mohon tunggu sebentar';
global.eror       = '*❌ Error System*';
global.done       = '*✅ Berhasil*';
global.maxwarn    = 3;

const APIs = { // API Prefix
  // name: 'https://website'
  nrtm: 'https://nurutomo.herokuapp.com',
  xteam: 'https://api.xteam.xyz',
  zahir: 'https://zahirr-web.herokuapp.com',
  bcil: 'https://75.119.137.248:21587',
  neoxr: 'https://api.neoxr.eu.org/',
  zeks: 'https://api.zeks.me',
  gimez: 'https://masgimenz.my.id/',
  melcanz: 'https://melcanz.com',
  pencarikode: 'https://pencarikode.xyz',
  LeysCoder: 'https://leyscoders-api.herokuapp.com',
  restapi: 'https://x-restapi.herokuapp.com',
  nevt: 'https://web-production-bcd9.up.railway.app'
}
const APIKeys = { // APIKey Here
  // 'https://website': 'apikey'
  'https://api.xteam.xyz': 'NezukoTachibana281207',
  'https://zahirr-web.herokuapp.com': 'zahirgans',
  'https://api.neoxr.eu.org/': 'jVEMyB2ITJ',
  'https://api.zeks.me': 'apivinz',
  'https://pencarikode.xyz': 'pais',
  'https://melcanz.com': 'ZZBk7EBb',
  'https://leyscoders-api.herokuapp.com': 'dappakntlll',
  'https://x-restapi.herokuapp.com': 'BETA',
  'https://web-production-bcd9.up.railway.app': 'Hn3OeoELM2'
}

global.API = (name, path = '/', query = {}, apikeyqueryname) => (name in APIs ? APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: APIKeys[name in APIs ? APIs[name] : name] } : {}) })) : '')

global.fakestatus = (txt) => ({
  key: { remoteJid: '0@s.whatsapp.net', participant: '0@s.whatsapp.net', id: '' },
  message: { conversation: txt },
});

global.fkontak = {
  key: {
    remoteJid: 'status@broadcast',
    fromMe: false,
    id: 'Bot Whatsapp',
  },
  message: {
    contactMessage: {
      vcard: [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Bot;;;;',
        'FN:Whatsapp',
        `item1.TEL;waid='${global.nomorown}':'${global.nomorown}'`,
        'item1.X-ABLabel:Ponsel',
        'END:VCARD',
      ].join('\n'),
    },
  },
  participant: `${global.nomorown}@s.whatsapp.net`,
};

global.capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

global.pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

global.tanggal = (numer) => {
  const days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date(numer);
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
