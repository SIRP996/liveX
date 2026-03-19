import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Public health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

app.get('/api/system/stats', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    rss: Math.round(mem.rss / 1024 / 1024), // Resident Set Size
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
    timestamp: new Date().toISOString()
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

// SQLite Initialization
let db: any = null;

async function initDB() {
  db = await open({
    filename: path.join(process.cwd(), 'database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      passwordHash TEXT,
      config TEXT
    );
    CREATE TABLE IF NOT EXISTS channels (
      docId TEXT PRIMARY KEY,
      id TEXT,
      username TEXT,
      isLive INTEGER,
      addedAt TEXT,
      isTemporary INTEGER,
      viewerCount INTEGER,
      lastCheckedAt TEXT,
      lastLiveAt TEXT,
      coverUrl TEXT,
      title TEXT,
      offlineStrikes INTEGER,
      sessions TEXT
    );
  `);
  console.log('SQLite database initialized successfully.');
  
  if (!process.env.VERCEL) {
    // Initialize services after DB is ready
    setTimeout(initAllServices, 2000);
  }
}

initDB().catch(console.error);

interface UserConfig {
  telegramBotToken: string;
  telegramChatId: string;
  zaloBotToken?: string;
  zaloUserId?: string;
  proxies?: string[];
  useSystemProxies?: boolean;
}

interface User {
  username: string;
  passwordHash: string;
  config: UserConfig;
}

const botInstances = new Map<string, TelegramBot>();
const userServices = new Map<string, { 
  bot: TelegramBot | null, 
  chatId: string, 
  token: string, 
  zaloToken?: string,
  zaloUserId?: string,
  proxies: string[], 
  proxyIndex: number 
}>();

const DEFAULT_PROXIES: string[] = [];

const DEAD_PROXIES = [
  'user49087:K2XeksQyBk@42.96.12.188:49087',
  'user49102:qVb3QPLprT@103.162.31.234:49102',
  'user49238:jgKjDBXQrW@103.162.31.234:49238',
  'user49431:uQsr37nOBF@103.162.31.100:49431',
  'user49360:Wz0jUHs61H@103.162.31.234:49360'
];

async function initUserService(username: string, config: UserConfig) {
  if (!username) return;

  const existingService = userServices.get(username);
  const oldToken = existingService?.token;
  const newToken = config.telegramBotToken;

  if (oldToken && oldToken !== newToken) {
    let isUsedByOthers = false;
    for (const [u, s] of userServices.entries()) {
      if (u !== username && s.token === oldToken) {
        isUsedByOthers = true;
        break;
      }
    }
    if (!isUsedByOthers) {
      const oldBot = botInstances.get(oldToken);
      if (oldBot) {
        try {
          await oldBot.stopPolling();
        } catch (e) {
          console.error(`Error stopping bot polling for old token:`, e);
        }
        botInstances.delete(oldToken);
      }
    }
  }

  let bot = null;
  if (newToken) {
    try {
      bot = botInstances.get(newToken) || null;
      if (!bot) {
        const isVercel = !!process.env.VERCEL;
        bot = new TelegramBot(newToken, { polling: !isVercel });
        console.log(`Telegram bot initialized for token (polling: ${!isVercel})`);

        bot.on('polling_error', (error) => {
          console.error(`[polling_error] ${error.code}: ${error.message}`);
        });

        bot.onText(/\/check/, async (msg) => {
          const chatIdStr = msg.chat.id.toString();
          if (!db) {
            bot?.sendMessage(msg.chat.id, 'Database is not configured on the server.');
            return;
          }
          
          const users = [];
          for (const [u, s] of userServices.entries()) {
            if (s.bot === bot && s.chatId === chatIdStr) {
              users.push(u);
            }
          }

          if (users.length === 0) return;

          for (const u of users) {
            try {
              const rows = await db.all('SELECT id FROM channels WHERE username = ? AND isLive = 1', [u]);
              const liveChannels = rows.map((r: any) => r.id);

              if (liveChannels.length > 0) {
                bot?.sendMessage(msg.chat.id, `Các kênh đang live (User: ${u}):\n${liveChannels.join('\n')}`);
              } else {
                bot?.sendMessage(msg.chat.id, `Hiện tại không có kênh nào đang live (User: ${u}).`);
              }
            } catch (error) {
              console.error('Error checking live channels:', error);
              bot?.sendMessage(msg.chat.id, 'Có lỗi xảy ra khi kiểm tra.');
            }
          }
        });

        bot.onText(/\/(.+)/, async (msg, match) => {
          if (!match) return;
          const command = match[1];
          if (command === 'check' || command === 'start') return;
          
          const channelId = command;
          bot?.sendMessage(msg.chat.id, `Đang kiểm tra kênh ${channelId}...`);
          const status = await checkTikTokLive(channelId, 0, username);
          
          if (status.isLive) {
            if (status.coverUrl) {
              bot?.sendPhoto(msg.chat.id, status.coverUrl, { caption: `Kênh ${channelId} đang LIVE!` });
            } else {
              bot?.sendMessage(msg.chat.id, `Kênh ${channelId} đang LIVE!`);
            }
          } else {
            bot?.sendMessage(msg.chat.id, `Kênh ${channelId} hiện KHÔNG live.`);
          }
        });

        botInstances.set(newToken, bot);
      }
    } catch (e) {
      console.error(`Telegram bot init error for token:`, e);
      bot = null;
    }
  }

  let userProxies = (config.proxies && config.proxies.length > 0) ? config.proxies : (config.useSystemProxies ? DEFAULT_PROXIES : []);
  userProxies = userProxies.filter(p => !DEAD_PROXIES.some(dead => p.includes(dead.split('@').pop()!)));

  userServices.set(username, { 
    bot, 
    chatId: config.telegramChatId, 
    token: newToken, 
    zaloToken: config.zaloBotToken,
    zaloUserId: config.zaloUserId,
    proxies: userProxies, 
    proxyIndex: 0 
  });
}

async function sendZaloMessage(token: string, userId: string, text: string) {
  if (!token || !userId) return;
  console.log(`Attempting to send Zalo message to ${userId} using token ${token.substring(0, 10)}...`);
  try {
    const url = `https://bot-api.zaloplatforms.com/bot${token}/sendMessage`;
    await axios.post(url, {
      to: userId,
      text: text
    }).catch(async (err) => {
      console.warn(`Zalo sendMessage failed for ${userId} with standard payload:`, err.response?.data || err.message);
      console.log('Trying OA-style payload...');
      return axios.post(url, {
        recipient: { user_id: userId },
        message: { text: text }
      });
    });
    console.log(`Zalo message successfully sent to ${userId}`);
  } catch (error: any) {
    console.error(`CRITICAL: Error sending Zalo message to ${userId}:`, error.response?.data || error.message);
  }
}

app.all(['/api/zalo/webhook', '/api/zalo/webhook/:identifier'], async (req: any, res: any) => {
  console.log(`[Zalo Webhook] ${req.method} hit from ${req.ip}`);
  
  if (req.method === 'GET') {
    return res.status(200).send(req.query.challenge || 'Zalo Webhook Active');
  }

  res.status(200).json({ error: 0, message: 'Success', ok: true });

  const data = req.body;
  const secretToken = req.headers['x-zalo-secret-token'] || data?.secret_token;
  
  console.log(`[Zalo Webhook Data]`, JSON.stringify(data));
  
  const senderId = data?.sender?.id || data?.from?.id || data?.user_id || data?.uid || data?.sender_id || data?.follower?.id;
  
  if (senderId && db) {
    try {
      let targetUsername = '';
      const users = await db.all('SELECT * FROM users');
      
      const sanitizedSecret = secretToken ? String(secretToken).replace(/:/g, '_') : null;

      for (const userRow of users) {
        const config = JSON.parse(userRow.config || '{}');
        const userToken = config.zaloBotToken;
        if (userToken) {
          const sanitizedUserToken = userToken.replace(/:/g, '_');
          if (sanitizedSecret === sanitizedUserToken || userToken === secretToken || JSON.stringify(data).includes(userToken)) {
            targetUsername = userRow.username;
            break;
          }
        }
      }

      if (targetUsername) {
        const userRow = await db.get('SELECT config FROM users WHERE username = ?', [targetUsername]);
        if (userRow) {
          const config = JSON.parse(userRow.config || '{}');
          config.lastZaloUserId = senderId;
          await db.run('UPDATE users SET config = ? WHERE username = ?', [JSON.stringify(config), targetUsername]);
          console.log(`[Zalo Webhook] SUCCESS: Updated ID ${senderId} for ${targetUsername}`);
          
          const token = config.zaloBotToken;
          if (token) {
            await sendZaloMessage(token, senderId, `Đã nhận diện được ID của bạn: ${senderId}. Hãy quay lại ứng dụng để hoàn tất cấu hình.`);
          }
        }
      }
    } catch (e) {
      console.error('[Zalo Webhook] Background Error:', e);
    }
  }
});

async function initAllServices() {
  if (!db) return;
  try {
    const users = await db.all('SELECT * FROM users');
    for (const userRow of users) {
      const config = JSON.parse(userRow.config || '{}');
      await initUserService(userRow.username, config);
    }
  } catch (error) {
    console.error('Error initializing all services:', error);
  }
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (AppleWebKit/537.36; Chrome/122.0.0.0; Mobile; rv:123.0) Gecko/20100101 Firefox/123.0'
];

async function checkTikTokLive(username: string, retryCount = 0, ownerUsername?: string): Promise<any> {
  const cleanUsername = username.trim().split(' ')[0].replace(/[^a-zA-Z0-9._-]/g, '');
  
  if (!cleanUsername || cleanUsername.length < 2) {
    return { isLive: false, viewerCount: 0 };
  }

  try {
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    const url = `https://www.tiktok.com/@${cleanUsername}/live`;
    
    let agent = null;
    let useProxy = false;
    
    if (ownerUsername && retryCount < 5) {
      const service = userServices.get(ownerUsername);
      if (service && service.proxies && service.proxies.length > 0) {
        useProxy = true;
        const proxy = service.proxies[service.proxyIndex];
        service.proxyIndex = (service.proxyIndex + 1) % service.proxies.length;
        
        try {
          const proxyUrl = proxy.includes('://') ? proxy : `http://${proxy}`;
          agent = new HttpsProxyAgent(proxyUrl);
          if (retryCount === 0) {
            console.log(`Using proxy for ${cleanUsername}: ${proxy.split('@').pop()}`);
          }
        } catch (e) {
          console.error('Invalid proxy format:', proxy);
        }
      }
    }

    if (retryCount === 5) {
      console.log(`Exhausted proxy retries for ${cleanUsername}, trying direct connection...`);
      agent = null;
    }

    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': randomUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/',
        'Origin': 'https://www.tiktok.com',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      validateStatus: (status) => status < 500
    });

    if (response.status === 403 || response.status === 429) {
      const msg = `TikTok blocked request (Status ${response.status}) for ${cleanUsername}, retrying... (${retryCount + 1}/6)`;
      console.log(msg);
      if (retryCount < 6) {
        const delay = (retryCount + 1) * 2000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return checkTikTokLive(cleanUsername, retryCount + 1, ownerUsername);
      }
      return { isLive: false, viewerCount: 0, error: true };
    }

    if (response.status === 404) {
      return { isLive: false, viewerCount: 0 };
    }
    
    // Check if TikTok redirected us to a different user's live stream
    const finalUrl = response.request?.res?.responseUrl || response.config?.url || '';
    if (finalUrl && !finalUrl.toLowerCase().includes(cleanUsername.toLowerCase())) {
      console.log(`Redirected from ${cleanUsername} to ${finalUrl}, assuming not live.`);
      return { isLive: false, viewerCount: 0 };
    }

    const $ = cheerio.load(response.data);
    let sigiStateStr = $('#SIGI_STATE').html();
    
    if (!sigiStateStr) {
      const rehydrationData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
      if (rehydrationData) {
        try {
          const parsed = JSON.parse(rehydrationData);
          const liveData = parsed?.__DEFAULT_SCOPE__?.['webapp.live-detail'] || 
                           parsed?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.liveRoom;
          
          if (liveData) {
            const isLive = liveData.liveRoomUserInfo?.user?.status === 2 || 
                           liveData.liveRoomUserInfo?.liveRoom?.status === 2 ||
                           liveData.status === 2;
            
            const userInfo = liveData.liveRoomUserInfo || liveData;
            const liveUsername = userInfo?.user?.uniqueId || userInfo?.user?.secUid || '';
            
            if (isLive && (!liveUsername || liveUsername.toLowerCase() === cleanUsername.toLowerCase())) {
              return {
                isLive: true,
                coverUrl: userInfo?.liveRoom?.coverUrl || userInfo?.user?.avatarLarger || userInfo?.coverUrl || null,
                title: userInfo?.liveRoom?.title || userInfo?.title || '',
                viewerCount: userInfo?.liveRoom?.userCount || userInfo?.userCount || 0
              };
            }
          }
        } catch (e) {
          console.error('Error parsing rehydration data:', e);
        }
      }
    }
    
    let viewerCount = 0;
    if (sigiStateStr) {
      const sigiState = JSON.parse(sigiStateStr);
      const userInfo = sigiState?.LiveRoom?.liveRoomUserInfo;
      
      const isLive = userInfo?.user?.status === 2 || userInfo?.liveRoom?.status === 2;
      const liveUsername = userInfo?.user?.uniqueId || '';
      
      if (isLive && (!liveUsername || liveUsername.toLowerCase() === cleanUsername.toLowerCase())) {
        if (userInfo?.liveRoom?.userCount) viewerCount = userInfo.liveRoom.userCount;
        else if (userInfo?.liveRoom?.liveRoomStats?.userCount) viewerCount = userInfo.liveRoom.liveRoomStats.userCount;
        else if (userInfo?.stats?.userCount) viewerCount = userInfo.stats.userCount;
        else if (sigiState?.LiveRoom?.liveRoomStats?.userCount) viewerCount = sigiState.LiveRoom.liveRoomStats.userCount;

        if (viewerCount === 0) {
           const match = response.data.match(/"userCount":(\d+)/) || response.data.match(/"totalUser":(\d+)/) || response.data.match(/"user_count":(\d+)/) || response.data.match(/"viewer_count":(\d+)/);
           if (match && match[1]) {
             viewerCount = parseInt(match[1], 10);
           }
        }

        return { 
          isLive: true, 
          coverUrl: userInfo?.liveRoom?.coverUrl || userInfo?.user?.avatarLarger || null,
          title: userInfo?.liveRoom?.title || '',
          viewerCount: viewerCount
        };
      }
    }
    
    const html = response.data;
    if (html.includes('verify-page') || html.includes('captcha') || html.includes('Access Denied')) {
       return { isLive: false, viewerCount: 0, error: true };
    }

    return { isLive: false, viewerCount: 0 };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return { isLive: false, viewerCount: 0 };
    }
    
    if (retryCount < 6 && (
      !error.response || 
      error.response.status >= 500 || 
      error.code === 'ECONNREFUSED' || 
      error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'EPROTO'
    )) {
      const msg = `Proxy/Network error for ${username} (${error.message}), retrying... (${retryCount + 1}/6)`;
      console.log(msg);
      addLog(ownerUsername || 'system', username, 'retrying', msg);
      return checkTikTokLive(username, retryCount + 1, ownerUsername);
    }

    const errorMsg = `Error checking TikTok for ${username}: ${error.message}`;
    console.error(errorMsg);
    addLog(ownerUsername || 'system', username, 'error', errorMsg);
    return { isLive: false, viewerCount: 0, error: true };
  }
}

const CHECK_INTERVAL = 60 * 1000;
let lastCheckedDay = new Date().getDate();

const channelsCache = new Map<string, any[]>();
const channelsCacheTime = new Map<string, number>();
const temporaryChannels = new Map<string, any[]>();
const CACHE_TTL = 5 * 60 * 1000;

let usersCache: string[] = [];
let usersCacheTime = 0;
const USERS_CACHE_TTL = 60 * 60 * 1000;

interface ScanLog {
  id: string;
  channelId: string;
  status: 'success' | 'error' | 'retrying' | 'info';
  message: string;
  timestamp: string;
  username: string;
}

let scanLogs: ScanLog[] = [];
const MAX_LOGS = 50;

function addLog(username: string, channelId: string, status: ScanLog['status'], message: string) {
  const log: ScanLog = {
    id: Math.random().toString(36).substring(2, 9),
    channelId,
    status,
    message,
    timestamp: new Date().toISOString(),
    username
  };
  scanLogs.unshift(log);
  if (scanLogs.length > MAX_LOGS) {
    scanLogs = scanLogs.slice(0, MAX_LOGS);
  }
}

async function getUserChannels(username: string): Promise<any[]> {
  if (!db || username.startsWith('guest_')) return temporaryChannels.get(username) || [];
  const now = Date.now();
  let sqliteChannels: any[] = [];
  
  if (channelsCache.has(username) && channelsCacheTime.has(username) && (now - channelsCacheTime.get(username)! < CACHE_TTL)) {
    sqliteChannels = channelsCache.get(username)!;
  } else {
    try {
      const rows = await db.all('SELECT * FROM channels WHERE username = ?', [username]);
      const channels = rows.map((r: any) => ({
        ...r,
        isLive: !!r.isLive,
        isTemporary: !!r.isTemporary,
        sessions: r.sessions ? JSON.parse(r.sessions) : []
      }));
      
      channelsCache.set(username, channels);
      channelsCacheTime.set(username, now);
      sqliteChannels = channels;
    } catch (error: any) {
      console.error(`Error fetching channels for ${username}:`, error);
      sqliteChannels = channelsCache.get(username) || [];
    }
  }
  
  const tempChannels = temporaryChannels.get(username) || [];
  return [...sqliteChannels, ...tempChannels];
}

async function getAllUsers(): Promise<string[]> {
  const activeUsers = new Set([
    ...Array.from(userServices.keys()),
    ...Array.from(temporaryChannels.keys())
  ]);
  if (!db) return Array.from(activeUsers);
  const now = Date.now();
  
  let sqliteUsers: string[] = [];
  if (usersCache.length > 0 && now - usersCacheTime < USERS_CACHE_TTL) {
    sqliteUsers = usersCache;
  } else {
    try {
      const rows = await db.all('SELECT username FROM users');
      usersCache = rows.map((r: any) => r.username);
      usersCacheTime = now;
      sqliteUsers = usersCache;
    } catch (error: any) {
      console.error('Error fetching users:', error);
      sqliteUsers = usersCache;
    }
  }

  const allUsers = new Set([...sqliteUsers, ...activeUsers]);
  return Array.from(allUsers);
}

async function checkChannelsForUser(username: string, shouldClearLogs: boolean = false) {
  if (!db || !username) return;
  let service = userServices.get(username);
  
  if (!service) {
    try {
      const userRow = await db.get('SELECT config FROM users WHERE username = ?', [username]);
      if (userRow) {
        const config = JSON.parse(userRow.config || '{}');
        if (config.telegramBotToken) {
          await initUserService(username, config);
          service = userServices.get(username);
        }
      }
    } catch (error: any) {
      console.error(`Error fetching user config for ${username}:`, error);
    }
  }

  try {
    const channels = await getUserChannels(username);

    const safeUpdateDoc = async (channelDocId: string, data: any) => {
      try {
        const keys = Object.keys(data);
        if (keys.length === 0) return;
        const values = Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        await db.run(`UPDATE channels SET ${setClause} WHERE docId = ?`, [...values, channelDocId]);
      } catch (error: any) {
        console.error(`SQLite update error for ${channelDocId}:`, error);
      }
    };

    const processChannel = async (channel: any) => {
      addLog(username, channel.id, 'info', `Bắt đầu quét kênh @${channel.id}...`);
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      
      let sessions = channel.sessions || [];
      let needsUpdate = false;
      let updateData: any = {};

      if (shouldClearLogs) {
        sessions = [];
        needsUpdate = true;
        updateData.sessions = sessions;
      }

      const status = await checkTikTokLive(channel.id, 0, username);
      
      if (status.error) {
        addLog(username, channel.id, 'error', `Quét kênh @${channel.id} thất bại (Lỗi Proxy/TikTok).`);
        console.log(`Skipping update for ${channel.id} due to fetch error.`);
        if (needsUpdate) {
          if (!channel.isTemporary) {
            await safeUpdateDoc(channel.docId, updateData);
          }
          Object.assign(channel, updateData);
        }
        return;
      }

      let didUpdate = false;

      if (status.isLive && !channel.isLive) {
        addLog(username, channel.id, 'success', `Kênh @${channel.id} vừa bắt đầu LIVE!`);
        console.log(`${channel.id} is now LIVE for ${username}!`);
        
        sessions.push(Date.now());
        
        updateData = {
          ...updateData,
          isLive: true,
          offlineStrikes: 0,
          lastLiveAt: new Date().toISOString(),
          coverUrl: status.coverUrl || null,
          title: status.title || '',
          viewerCount: status.viewerCount || 0,
          sessions: sessions
        };
        
        if (!channel.isTemporary) {
          await safeUpdateDoc(channel.docId, updateData);
        }
        didUpdate = true;

        const message = `🔴 Kênh <b>${channel.id}</b> đang LIVE!\n${status.title ? `Tiêu đề: ${status.title}\n` : ''}Người xem: ${status.viewerCount || 0}\nLink: https://www.tiktok.com/@${channel.id}/live`;
        
        if (status.coverUrl && service?.bot && service?.chatId) {
          service.bot.sendPhoto(service.chatId, status.coverUrl, { caption: message, parse_mode: 'HTML' }).catch(e => console.error(e));
        } else if (service?.bot && service?.chatId) {
          service.bot.sendMessage(service.chatId, message, { parse_mode: 'HTML' }).catch(e => console.error(e));
        }

        if (service?.zaloToken && service?.zaloUserId) {
          const zaloMessage = `🔴 Kênh ${channel.id} đang LIVE!\n${status.title ? `Tiêu đề: ${status.title}\n` : ''}Người xem: ${status.viewerCount || 0}\nLink: https://www.tiktok.com/@${channel.id}/live`;
          sendZaloMessage(service.zaloToken, service.zaloUserId, zaloMessage);
        }
      } 
      else if (status.isLive && channel.isLive) {
        addLog(username, channel.id, 'success', `Kênh @${channel.id} vẫn đang LIVE (${status.viewerCount} người xem).`);
        updateData = {
          ...updateData,
          viewerCount: status.viewerCount || 0,
          offlineStrikes: 0
        };
        if (!channel.isTemporary) {
          await safeUpdateDoc(channel.docId, updateData);
        }
        didUpdate = true;
      }
      else if (!status.isLive && channel.isLive) {
        const strikes = (channel.offlineStrikes || 0) + 1;
        addLog(username, channel.id, 'info', `Kênh @${channel.id} tạm thời Offline (Lần ${strikes}/3).`);
        if (strikes >= 3) {
          console.log(`${channel.id} is now OFFLINE for ${username}.`);
          sessions.push(Date.now());
          
          updateData = {
            ...updateData,
            isLive: false,
            offlineStrikes: 0,
            viewerCount: 0,
            sessions: sessions
          };
          if (!channel.isTemporary) {
            await safeUpdateDoc(channel.docId, updateData);
          }
          didUpdate = true;
        } else {
          updateData = {
            ...updateData,
            offlineStrikes: strikes
          };
          if (!channel.isTemporary) {
            await safeUpdateDoc(channel.docId, updateData);
          }
          didUpdate = true;
        }
      } else if (needsUpdate) {
        if (!channel.isTemporary) {
          await safeUpdateDoc(channel.docId, updateData);
        }
        didUpdate = true;
      } else {
        addLog(username, channel.id, 'info', `Kênh @${channel.id} đang Offline.`);
      }

      if (didUpdate) {
        Object.assign(channel, updateData);
        if (channelsCache.has(username)) {
          const cachedChannels = channelsCache.get(username)!;
          const index = cachedChannels.findIndex(c => c.docId === channel.docId);
          if (index !== -1) {
            cachedChannels[index] = { ...cachedChannels[index], ...updateData };
          }
        }
      }
    };

    const CONCURRENCY = 5;
    const workers = [];
    let index = 0;
    
    const worker = async () => {
      while (index < channels.length) {
        const currentIndex = index++;
        await processChannel(channels[currentIndex]);
      }
    };
    
    for (let i = 0; i < Math.min(CONCURRENCY, channels.length); i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
  } catch (error) {
    console.error(`Error in background worker for ${username}:`, error);
  }
}

async function checkAllChannels() {
  if (!db) return;
  
  const currentDay = new Date().getDate();
  const shouldClearLogs = currentDay !== lastCheckedDay;
  if (shouldClearLogs) {
    lastCheckedDay = currentDay;
    console.log('Midnight reached, clearing daily live logs.');
  }

  try {
    const usernames = await getAllUsers();
    
    for (const username of usernames) {
      if (!username) continue;
      await checkChannelsForUser(username, shouldClearLogs);
    }
  } catch (error: any) {
    console.error('Error fetching users in checkAllChannels:', error);
  }
}

if (!process.env.VERCEL) {
  setInterval(checkAllChannels, CHECK_INTERVAL);
}

const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e: any) {
    console.error('Authentication error:', e.message);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

app.get('/api/system/logs', authenticate, (req: any, res: any) => {
  const userLogs = scanLogs.filter(log => log.username === req.user.username || log.username === 'system');
  res.json(userLogs);
});

app.post(['/api/zalo/set-webhook', '/zalo/set-webhook'], authenticate, async (req: any, res: any) => {
  const { token } = req.body;
  const username = req.user.username;
  
  if (!token) return res.status(400).json({ error: 'Bot Token is required' });

  try {
    const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
    const webhookUrl = `${baseUrl}/api/zalo/webhook`;
    const entrypoint = `https://bot-api.zaloplatforms.com/bot${token}/setWebhook`;
    
    const response = await axios.post(entrypoint, {
      url: webhookUrl,
      secret_token: token.replace(/:/g, '_')
    });

    if (response.data && (response.data.error === 0 || response.data.ok)) {
      res.json({ ok: true, webhookUrl, data: response.data });
    } else {
      res.json({ ok: false, error: response.data?.message || 'Zalo returned an error', details: response.data });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set Zalo webhook', details: error.response?.data || error.message });
  }
});

app.post(['/api/auth/register', '/auth/register'], async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const existing = await db.get('SELECT username FROM users WHERE username = ?', [username]);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const hash = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO users (username, passwordHash, config) VALUES (?, ?, ?)', [username, hash, '{}']);
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: 'Registration failed', details: error.message || String(error) });
  }
});

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(400).json({ error: 'Login failed', details: error.message || String(error) });
  }
});

app.all(['/api/auth/guest', '/auth/guest'], async (req, res) => {
  try {
    const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
    const token = jwt.sign({ username: guestId, isGuest: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: guestId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

app.get(['/api/auth/me', '/auth/me'], authenticate, (req: any, res: any) => {
  res.json({ username: req.user.username });
});

app.get(['/api/config', '/config'], authenticate, async (req: any, res: any) => {
  if (req.user.isGuest) {
    const service = userServices.get(req.user.username);
    return res.json({
      telegramBotToken: service?.token || '',
      telegramChatId: service?.chatId || ''
    });
  }
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const userRow = await db.get('SELECT config FROM users WHERE username = ?', [req.user.username]);
    if (!userRow) return res.status(404).json({ error: 'User not found' });
    res.json(JSON.parse(userRow.config || '{}'));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.post(['/api/config', '/config'], authenticate, async (req: any, res: any) => {
  try {
    const newConfig = req.body;
    const username = req.user.username;
    
    if (!req.user.isGuest) {
      if (!db) return res.status(500).json({ error: 'Database not initialized' });
      await db.run('UPDATE users SET config = ? WHERE username = ?', [JSON.stringify(newConfig), username]);
    }
    
    await initUserService(username, newConfig);
    
    if (usersCache.length > 0 && !usersCache.includes(username)) {
      usersCache.push(username);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.get(['/api/config-status', '/config-status'], authenticate, (req: any, res: any) => {
  const service = userServices.get(req.user.username);
  res.json({
    firebase: !!db, // We keep the key 'firebase' for frontend compatibility, but it means SQLite DB
    telegramBot: !!service?.bot,
    telegramChatId: !!service?.chatId,
    zaloBot: !!service?.zaloToken,
    zaloUserId: !!service?.zaloUserId
  });
});

app.get(['/api/check-live', '/check-live'], authenticate, async (req: any, res: any) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Channel ID is required' });
  try {
    const status = await checkTikTokLive(id, 0, req.user.username);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check channel' });
  }
});

app.get(['/api/cron', '/cron'], async (req: any, res: any) => {
  try {
    await checkAllChannels();
    res.json({ success: true, message: 'Cron job executed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Cron job failed' });
  }
});

app.post(['/api/channels/refresh', '/channels/refresh'], authenticate, async (req: any, res: any) => {
  try {
    channelsCache.delete(req.user.username);
    channelsCacheTime.delete(req.user.username);
    checkChannelsForUser(req.user.username, true).catch(err => console.error(err));
    res.json({ success: true, message: 'Đang quét lại danh sách kênh...' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to refresh channels' });
  }
});

app.post(['/api/channels/check-one', '/channels/check-one'], authenticate, async (req: any, res: any) => {
  const { channelId, docId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'Channel ID is required' });

  try {
    const status = await checkTikTokLive(channelId, 0, req.user.username);
    
    if (docId && !docId.startsWith('temp_')) {
      const updateData: any = {
        isLive: status.isLive ? 1 : 0,
        viewerCount: status.viewerCount || 0,
        lastCheckedAt: new Date().toISOString()
      };
      if (status.isLive) updateData.lastLiveAt = new Date().toISOString();
      if (status.coverUrl) updateData.coverUrl = status.coverUrl;
      
      const keys = Object.keys(updateData);
      const values = Object.values(updateData);
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      await db.run(`UPDATE channels SET ${setClause} WHERE docId = ?`, [...values, docId]);
      
      if (channelsCache.has(req.user.username)) {
        const cached = channelsCache.get(req.user.username)!;
        const idx = cached.findIndex(c => c.docId === docId);
        if (idx !== -1) {
          cached[idx] = { ...cached[idx], ...updateData, isLive: !!updateData.isLive };
        }
      }
    } else if (docId && docId.startsWith('temp_')) {
      const temp = temporaryChannels.get(req.user.username) || [];
      const idx = temp.findIndex(c => c.docId === docId);
      if (idx !== -1) {
        temp[idx] = { 
          ...temp[idx], 
          isLive: status.isLive, 
          viewerCount: status.viewerCount || 0,
          lastCheckedAt: new Date().toISOString()
        };
        if (status.isLive) temp[idx].lastLiveAt = new Date().toISOString();
        if (status.coverUrl) temp[idx].coverUrl = status.coverUrl;
      }
    }

    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to check channel' });
  }
});

app.get(['/api/channels', '/channels'], authenticate, async (req: any, res: any) => {
  try {
    const channels = await getUserChannels(req.user.username);
    res.json(channels);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch channels: ' + (error.message || error) });
  }
});

app.post(['/api/channels', '/channels'], authenticate, async (req: any, res: any) => {
  const { id, isTemporary } = req.body;
  if (!id) return res.status(400).json({ error: 'Channel ID is required' });
  
  try {
    const channels = await getUserChannels(req.user.username);
    if (channels.some(c => c.id === id)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    const forceTemp = req.user.isGuest ? true : !!isTemporary;
    const addedAt = new Date().toISOString();
    let docId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newChannel = {
      id,
      username: req.user.username,
      isLive: false,
      addedAt,
      isTemporary: forceTemp
    };
    
    if (forceTemp) {
      if (!temporaryChannels.has(req.user.username)) {
        temporaryChannels.set(req.user.username, []);
      }
      temporaryChannels.get(req.user.username)!.push({ docId, ...newChannel });
    } else {
      if (!db) return res.status(500).json({ error: 'Database not configured' });
      docId = `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.run(
        'INSERT INTO channels (docId, id, username, isLive, addedAt, isTemporary, viewerCount, offlineStrikes, sessions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [docId, id, req.user.username, 0, addedAt, 0, 0, 0, '[]']
      );
      
      if (channelsCache.has(req.user.username)) {
        channelsCache.get(req.user.username)!.push({ docId, ...newChannel });
      }
    }
    
    res.json({ success: true, channel: { docId, ...newChannel } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

app.post(['/api/channels/bulk', '/channels/bulk'], authenticate, async (req: any, res: any) => {
  const { ids, isTemporary } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Channel IDs array is required' });
  
  try {
    const channels = await getUserChannels(req.user.username);
    const existingIds = new Set(channels.map(c => c.id));
    
    const addedChannels = [];
    let addedCount = 0;
    const forceTemp = req.user.isGuest ? true : !!isTemporary;
    const addedAt = new Date().toISOString();

    const uniqueNewIds = [...new Set(
      ids.map(id => id.trim().replace(/^@/, ''))
         .filter(id => id && !existingIds.has(id))
    )];

    if (!forceTemp && db) {
      await db.exec('BEGIN TRANSACTION');
      try {
        for (const cleanId of uniqueNewIds) {
          const docId = `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.run(
            'INSERT INTO channels (docId, id, username, isLive, addedAt, isTemporary, viewerCount, offlineStrikes, sessions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [docId, cleanId, req.user.username, 0, addedAt, 0, 0, 0, '[]']
          );
          addedChannels.push({ docId, id: cleanId, username: req.user.username, isLive: false, addedAt, isTemporary: false });
          addedCount++;
        }
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
    } else {
      for (const cleanId of uniqueNewIds) {
        const docId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        addedChannels.push({ docId, id: cleanId, username: req.user.username, isLive: false, addedAt, isTemporary: true });
        addedCount++;
      }
    }
    
    if (forceTemp) {
      if (!temporaryChannels.has(req.user.username)) {
        temporaryChannels.set(req.user.username, []);
      }
      temporaryChannels.get(req.user.username)!.push(...addedChannels);
    } else if (channelsCache.has(req.user.username)) {
      channelsCache.get(req.user.username)!.push(...addedChannels);
    }
    
    res.json({ success: true, addedCount, channels: addedChannels });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to bulk add channels: ' + error.message });
  }
});

app.delete(['/api/channels/:docId', '/channels/:docId'], authenticate, async (req: any, res: any) => {
  const { docId } = req.params;
  try {
    if (docId.startsWith('temp_')) {
      if (temporaryChannels.has(req.user.username)) {
        const channels = temporaryChannels.get(req.user.username)!;
        temporaryChannels.set(req.user.username, channels.filter(c => c.docId !== docId));
      }
      return res.json({ success: true });
    }

    if (req.user.isGuest) {
      return res.status(403).json({ error: 'Guest cannot delete permanent channels' });
    }

    if (!db) return res.status(500).json({ error: 'Database not configured' });
    
    const row = await db.get('SELECT username FROM channels WHERE docId = ?', [docId]);
    if (row && row.username === req.user.username) {
      await db.run('DELETE FROM channels WHERE docId = ?', [docId]);
      
      if (channelsCache.has(req.user.username)) {
        const channels = channelsCache.get(req.user.username)!;
        channelsCache.set(req.user.username, channels.filter(c => c.docId !== docId));
      }
      
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Unauthorized or not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled Express error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

export default app;
