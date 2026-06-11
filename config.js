import moment from 'moment-timezone';

global.owner      = ['6281775489662'];
global.nameowner  = 'Xvann';
global.nomorown   = '6281775489662';

global.wm         = 'Vanitas Bot';
global.packname   = 'Vanitas';
global.author     = 'xvannn07';
global.isPairing  = true;          // true = pairing code, false = QR
global.gconly     = false;         // true = group only mode
global.selfMode   = false;         // true = self / owner only

global.wait       = '*⏳ Loading…* Mohon tunggu sebentar';
global.eror       = '*❌ Error System*';
global.done       = '*✅ Berhasil*';
global.maxwarn    = 3;


global.htki = '*──────『';
global.htka = '』──────*';


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
