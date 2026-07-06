import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
process.env.TMPDIR = process.env.TMPDIR || tmpDir;
process.env.TMP = process.env.TMP || tmpDir;
process.env.TEMP = process.env.TEMP || tmpDir;

function loadEnvFile(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

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

// Guard upload media besar. Naikkan jika server kuat dan storage stabil.
global.maxUploadSize = 95 * 1024 * 1024;      // 95 MB
global.minUploadFreeSpace = 300 * 1024 * 1024; // 300 MB
global.mediaUploadTimeoutMs = 5 * 60 * 1000;     // 5 menit


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
