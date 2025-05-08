const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const chalk = require('chalk');
const FileType = require('file-type');
const path = require('path');
const axios = require('axios');
const _ = require('lodash');
const moment = require('moment-timezone');
const PhoneNumber = require('awesome-phonenumber');
const readline = require('readline');
const NodeCache = require('node-cache');

const {
  default: makeWASocket,
  delay,
  PHONENUMBER_MCC,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateForwardMessageContent,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  generateMessageID,
  downloadContentFromMessage,
  makeInMemoryStore,
  jidDecode,
  proto,
  Browsers
} = require('@whiskeysockets/baileys');

const store = makeInMemoryStore({
  logger: pino().child({ level: 'silent', stream: 'store' })
});

const pairingCode = true || process.argv.includes('--pairing-code');
const useMobile = process.argv.includes('--mobile');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startSpam() {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./NextBiy');
  const msgRetryCounterCache = new NodeCache();

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !pairingCode,
    browser: Browsers.macOS('Firefox'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: 'SPAM PAIRING CODE' };
    },
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined
  });

  store.bind(sock.ev);

  if (pairingCode && !sock.authState.creds.registered) {
    if (useMobile) throw new Error('Tidak dapat menggunakan kode pasangan dengan API seluler');

    console.log(chalk.bgBlack(chalk.blueBright('')));
    console.log(chalk.bgBlack(chalk.redBright('Masukkan nomor WhatsApp:')));

    let nomor = await question(chalk.whiteBright('Input NO Whatsapp: +628xxx : '));
    nomor = nomor.replace(/[^0-9]/g, '');

    while (!Object.keys(PHONENUMBER_MCC).some((prefix) => nomor.startsWith(prefix))) {
      console.log(chalk.bgBlack(chalk.redBright('Nomor tidak valid.')));
      nomor = await question(chalk.whiteBright('Input NO Whatsapp: +628xxx : '));
    }

    let countdown = 60; //ganti sesuai kebutuhan rekomendasi 60 kali saja
    while (countdown > 0) {
      let pairingCode = await sock.requestPairingCode(nomor);
      pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
      console.log(chalk.bgBlack(chalk.greenBright('Pairing Code: ' + pairingCode)));
      console.log(chalk.whiteBright('Spam Dalam..: ' + countdown + ' s...'));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      countdown--;
    }
  }

  const file = require.resolve(__filename);
  fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.redBright('Update ' + __filename));
    delete require.cache[file];
    require(file);
  });
}

startSpam();

process.on('uncaughtException', function (err) {
  const errorStr = String(err);
  if (
    errorStr.includes('conflict') ||
    errorStr.includes('Connection Closed') ||
    errorStr.includes('Socket connection timeout') ||
    errorStr.includes('not-authorized') ||
    errorStr.includes('already-exists') ||
    errorStr.includes('rate-overlimit') ||
    errorStr.includes('Timed Out') ||
    errorStr.includes('uncaughtexception')
  ) {
    return;
  }
  console.log('Caught exception:', err);
});
