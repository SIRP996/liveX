import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, writeBatch, query, where, getDoc } from 'firebase/firestore/lite';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

// Single Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyA5eKymLFvDLWXdodk-AvDP6P9dzjhmnI4",
  authDomain: "tiktok-live-monitor-b6c4d.firebaseapp.com",
  projectId: "tiktok-live-monitor-b6c4d",
  storageBucket: "tiktok-live-monitor-b6c4d.firebasestorage.app",
  messagingSenderId: "153939223108",
  appId: "1:153939223108:web:657026dc9314e31dbb5211",
  measurementId: "G-RZXTMEMNFM"
};

let db: any = null;
let auth: any = null;
if (firebaseConfig.projectId && firebaseConfig.apiKey) {
  try {
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    console.log('Firebase initialized successfully.');
  } catch (e) {
    console.error('Firebase init error:', e);
  }
} else {
  console.warn('Firebase configuration is missing.');
}

interface UserConfig {
  telegramBotToken: string;
  telegramChatId: string;
}

interface User {
  username: string;
  passwordHash: string;
  config: UserConfig;
}

const botInstances = new Map<string, TelegramBot>();
const userServices = new Map<string, { bot: TelegramBot | null, chatId: string, token: string }>();

async function initUserService(username: string, config: UserConfig) {
  if (!username) return;

  const existingService = userServices.get(username);
  const oldToken = existingService?.token;
  const newToken = config.telegramBotToken;

  // We don't stop polling if the token is still used by other users
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
            bot?.sendMessage(msg.chat.id, 'Firebase is not configured on the server.');
            return;
          }
          
          // Find users matching this chat ID and bot
          const users = [];
          for (const [u, s] of userServices.entries()) {
            if (s.bot === bot && s.chatId === chatIdStr) {
              users.push(u);
            }
          }

          if (users.length === 0) return;

          for (const u of users) {
            try {
              const q = query(collection(db, 'channels'), where('username', '==', u), where('isLive', '==', true));
              const querySnapshot = await getDocs(q);
              const liveChannels: string[] = [];
              querySnapshot.forEach((doc) => {
                liveChannels.push(doc.data().id);
              });

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
          const status = await checkTikTokLive(channelId);
          
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

  userServices.set(username, { bot, chatId: config.telegramChatId, token: newToken });
}

async function initAllServices() {
  if (!db) return;
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    querySnapshot.forEach((docSnap) => {
      const userData = docSnap.data() as User;
      initUserService(userData.username, userData.config || { telegramBotToken: '', telegramChatId: '' });
    });
  } catch (error) {
    console.error('Error initializing all services:', error);
  }
}

if (!process.env.VERCEL) {
  // Initialize services after a short delay to ensure DB is ready
  setTimeout(initAllServices, 2000);
}

// TikTok Scraper
async function checkTikTokLive(username: string) {
  try {
    const url = `https://www.tiktok.com/@${username}/live`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const sigiStateStr = $('#SIGI_STATE').html();
    
    let viewerCount = 0;
    if (sigiStateStr) {
      const sigiState = JSON.parse(sigiStateStr);
      const userInfo = sigiState?.LiveRoom?.liveRoomUserInfo;
      
      const isLive = userInfo?.user?.status === 2 || userInfo?.liveRoom?.status === 2;
      
      if (isLive) {
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
    if (html.includes('room_id') && html.includes('live_room')) {
       // Try to extract viewer count from HTML if SIGI_STATE fails
       const match = html.match(/"userCount":(\d+)/) || html.match(/"totalUser":(\d+)/) || html.match(/"user_count":(\d+)/) || html.match(/"viewer_count":(\d+)/);
       if (match && match[1]) {
         viewerCount = parseInt(match[1], 10);
       }
       return { isLive: true, coverUrl: null, title: '', viewerCount: viewerCount };
    }

    if (html.includes('verify-page') || html.includes('captcha') || html.includes('Access Denied')) {
       return { isLive: false, viewerCount: 0, error: true };
    }

    return { isLive: false, viewerCount: 0 };
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return { isLive: false, viewerCount: 0 };
    }
    console.error(`Error checking TikTok for ${username}:`, error.message);
    return { isLive: false, viewerCount: 0, error: true };
  }
}

// Background Worker
const CHECK_INTERVAL = 60 * 1000;

let lastCheckedDay = new Date().getDate();

// --- CACHE SYSTEM ---
const channelsCache = new Map<string, any[]>();
const channelsCacheTime = new Map<string, number>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let usersCache: string[] = [];
let usersCacheTime = 0;
const USERS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getUserChannels(username: string): Promise<any[]> {
  if (!db) return [];
  const now = Date.now();
  if (channelsCache.has(username) && channelsCacheTime.has(username)) {
    if (now - channelsCacheTime.get(username)! < CACHE_TTL) {
      return channelsCache.get(username)!;
    }
  }
  
  try {
    const q = query(collection(db, 'channels'), where('username', '==', username));
    const querySnapshot = await getDocs(q);
    const channels: any[] = [];
    querySnapshot.forEach((doc) => {
      channels.push({ docId: doc.id, ...doc.data() });
    });
    
    channelsCache.set(username, channels);
    channelsCacheTime.set(username, now);
    return channels;
  } catch (error) {
    console.error(`Error fetching channels for ${username}:`, error);
    return channelsCache.get(username) || []; // Fallback to stale cache if error
  }
}

async function getAllUsers(): Promise<string[]> {
  if (!db) return [];
  const now = Date.now();
  if (usersCache.length > 0 && now - usersCacheTime < USERS_CACHE_TTL) {
    return usersCache;
  }
  
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    usersCache = querySnapshot.docs.map(doc => doc.id);
    usersCacheTime = now;
    return usersCache;
  } catch (error) {
    console.error('Error fetching users:', error);
    return usersCache; // Fallback to stale
  }
}
// --- END CACHE SYSTEM ---

async function checkChannelsForUser(username: string, shouldClearLogs: boolean = false) {
  if (!db || !username) return;
  let service = userServices.get(username);
  
  // If service is not in memory (e.g. serverless environment), fetch from DB
  if (!service) {
    try {
      const userDoc = await getDoc(doc(db, 'users', username));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        if (userData.config && userData.config.telegramBotToken) {
          await initUserService(username, userData.config);
          service = userServices.get(username);
        }
      }
    } catch (error) {
      console.error(`Error fetching user config for ${username}:`, error);
    }
  }

  if (!service || !service.bot || !service.chatId) return;

  try {
    const channels = await getUserChannels(username);

    const processChannel = async (channel: any) => {
      let sessions = channel.sessions || [];
      let needsUpdate = false;
      let updateData: any = {};

      if (shouldClearLogs) {
        sessions = [];
        needsUpdate = true;
        updateData.sessions = sessions;
      }

      const status = await checkTikTokLive(channel.id);
      
      if (status.error) {
        console.log(`Skipping update for ${channel.id} due to fetch error.`);
        if (needsUpdate) {
          await updateDoc(doc(db, 'channels', channel.docId), updateData);
          Object.assign(channel, updateData);
        }
        return;
      }

      let didUpdate = false;

      if (status.isLive && !channel.isLive) {
        console.log(`${channel.id} is now LIVE for ${username}!`);
        
        sessions.push(Date.now()); // Log start time
        
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
        
        await updateDoc(doc(db, 'channels', channel.docId), updateData);
        didUpdate = true;

        const message = `🔴 Kênh <b>${channel.id}</b> đang LIVE!\n${status.title ? `Tiêu đề: ${status.title}\n` : ''}Người xem: ${status.viewerCount || 0}\nLink: https://www.tiktok.com/@${channel.id}/live`;
        
        if (status.coverUrl && service?.bot && service?.chatId) {
          service.bot.sendPhoto(service.chatId, status.coverUrl, { caption: message, parse_mode: 'HTML' }).catch(e => console.error(e));
        } else if (service?.bot && service?.chatId) {
          service.bot.sendMessage(service.chatId, message, { parse_mode: 'HTML' }).catch(e => console.error(e));
        }
      } 
      else if (status.isLive && channel.isLive) {
        updateData = {
          ...updateData,
          viewerCount: status.viewerCount || 0,
          offlineStrikes: 0
        };
        await updateDoc(doc(db, 'channels', channel.docId), updateData);
        didUpdate = true;
      }
      else if (!status.isLive && channel.isLive) {
        const strikes = (channel.offlineStrikes || 0) + 1;
        // Require 3 consecutive offline checks (3 minutes) before marking as offline
        if (strikes >= 3) {
          console.log(`${channel.id} is now OFFLINE for ${username}.`);
          sessions.push(Date.now()); // Log end time
          
          updateData = {
            ...updateData,
            isLive: false,
            offlineStrikes: 0,
            viewerCount: 0,
            sessions: sessions
          };
          await updateDoc(doc(db, 'channels', channel.docId), updateData);
          didUpdate = true;
        } else {
          updateData = {
            ...updateData,
            offlineStrikes: strikes
          };
          await updateDoc(doc(db, 'channels', channel.docId), updateData);
          didUpdate = true;
        }
      } else if (needsUpdate) {
        await updateDoc(doc(db, 'channels', channel.docId), updateData);
        didUpdate = true;
      }

      if (didUpdate) {
        Object.assign(channel, updateData);
      }
    };

    const CONCURRENCY = 50;
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
  } catch (error) {
    console.error('Error fetching users in checkAllChannels:', error);
  }
}

if (!process.env.VERCEL) {
  setInterval(checkAllChannels, CHECK_INTERVAL);
}

let firebasePublicKeys: Record<string, string> = {};

const fetchFirebasePublicKeys = async () => {
  try {
    const res = await axios.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    firebasePublicKeys = res.data;
  } catch (e) {
    console.error('Failed to fetch Firebase public keys', e);
  }
};

// Auth Middleware
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    
    // Fallback for old custom JWT tokens
    if (!decodedHeader || typeof decodedHeader === 'string' || !decodedHeader.header.kid) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    const kid = decodedHeader.header.kid;
    if (!firebasePublicKeys[kid]) {
      await fetchFirebasePublicKeys();
    }
    
    const publicKey = firebasePublicKeys[kid];
    if (!publicKey) {
      return res.status(401).json({ error: 'Invalid token signature' });
    }

    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
    req.user = { username: decoded.email, uid: decoded.user_id };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth Routes
app.post(['/api/auth/register', '/auth/register'], async (req, res) => {
  try {
    if (!db || !auth) return res.status(500).json({ error: 'Firebase not initialized' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Email and password required' });
    
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, username, password);
    const token = await userCredential.user.getIdToken();

    // Create user document in Firestore
    const newUser: User = {
      username,
      passwordHash: '', // No longer needed
      config: {
        telegramBotToken: '',
        telegramChatId: ''
      }
    };
    await setDoc(doc(db, 'users', username), newUser);

    res.json({ token, username });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: 'Registration failed', details: error.message || String(error) });
  }
});

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    if (!db || !auth) return res.status(500).json({ error: 'Firebase not initialized' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Email and password required' });
    
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, username, password);
    const token = await userCredential.user.getIdToken();

    // Ensure user document exists in Firestore (for backward compatibility)
    const userDoc = await getDoc(doc(db, 'users', username));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', username), {
        username,
        passwordHash: '',
        config: { telegramBotToken: '', telegramChatId: '' }
      });
    }

    res.json({ token, username });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(400).json({ error: 'Invalid credentials', details: error.message || String(error) });
  }
});

app.get(['/api/auth/me', '/auth/me'], authenticate, (req: any, res: any) => {
  res.json({ username: req.user.username });
});

// API Routes
app.get(['/api/config', '/config'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const userDoc = await getDoc(doc(db, 'users', req.user.username));
  if (!userDoc.exists()) return res.status(404).json({ error: 'User not found' });
  res.json(userDoc.data().config || {});
});

app.post(['/api/config', '/config'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const newConfig = req.body;
    const username = req.user.username;
    
    await setDoc(doc(db, 'users', username), {
      config: newConfig
    }, { merge: true });
    
    await initUserService(username, newConfig);
    
    // Add to usersCache if not present
    if (usersCache.length > 0 && !usersCache.includes(username)) {
      usersCache.push(username);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.get(['/api/config-status', '/config-status'], authenticate, (req: any, res: any) => {
  const service = userServices.get(req.user.username);
  res.json({
    firebase: !!db,
    telegramBot: !!service?.bot,
    telegramChatId: !!service?.chatId
  });
});

app.get(['/api/check-live', '/check-live'], authenticate, async (req: any, res: any) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Channel ID is required' });
  }
  
  try {
    const status = await checkTikTokLive(id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check channel' });
  }
});

app.get(['/api/cron', '/cron'], async (req: any, res: any) => {
  try {
    // Run the background worker
    await checkAllChannels();
    res.json({ success: true, message: 'Cron job executed successfully' });
  } catch (error: any) {
    console.error('Cron job failed:', error);
    res.status(500).json({ error: 'Cron job failed' });
  }
});

app.post(['/api/channels/refresh', '/channels/refresh'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  try {
    // Force clear cache to fetch fresh data from DB
    channelsCache.delete(req.user.username);
    channelsCacheTime.delete(req.user.username);
    
    // Run the check asynchronously so we don't block the response for too long
    // But wait for it to finish so the client gets updated data
    await checkChannelsForUser(req.user.username, false);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to refresh channels:', error);
    res.status(500).json({ error: 'Failed to refresh channels' });
  }
});

app.get(['/api/channels', '/channels'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  try {
    const channels = await getUserChannels(req.user.username);
    res.json(channels);
  } catch (error: any) {
    if (error.message?.includes('Quota exceeded')) {
      console.error('Failed to fetch channels: Quota exceeded.');
    } else {
      console.error('Failed to fetch channels:', error);
    }
    res.status(500).json({ error: 'Failed to fetch channels: ' + (error.message || error) });
  }
});

app.post(['/api/channels', '/channels'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Channel ID is required' });
  
  try {
    const channels = await getUserChannels(req.user.username);
    if (channels.some(c => c.id === id)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    const newChannel = {
      id,
      username: req.user.username,
      isLive: false,
      addedAt: new Date().toISOString()
    };
    
    const newDocRef = doc(collection(db, 'channels'));
    await setDoc(newDocRef, newChannel);
    
    if (channelsCache.has(req.user.username)) {
      channelsCache.get(req.user.username)!.push({ docId: newDocRef.id, ...newChannel });
    }
    
    res.json({ success: true, channel: { docId: newDocRef.id, ...newChannel } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

app.post(['/api/channels/bulk', '/channels/bulk'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Channel IDs array is required' });
  
  try {
    const channels = await getUserChannels(req.user.username);
    const existingIds = new Set(channels.map(c => c.id));
    
    const addedChannels = [];
    let addedCount = 0;
    
    const uniqueNewIds = [...new Set(
      ids.map(id => id.trim().replace(/^@/, ''))
         .filter(id => id && !existingIds.has(id))
    )];

    const chunkSize = 400;
    for (let i = 0; i < uniqueNewIds.length; i += chunkSize) {
      const chunk = uniqueNewIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      
      for (const cleanId of chunk) {
        const newChannel = {
          id: cleanId,
          username: req.user.username,
          isLive: false,
          addedAt: new Date().toISOString()
        };
        const newDocRef = doc(collection(db, 'channels'));
        batch.set(newDocRef, newChannel);
        addedChannels.push({ docId: newDocRef.id, ...newChannel });
        addedCount++;
      }
      
      await batch.commit();
    }
    
    if (channelsCache.has(req.user.username)) {
      channelsCache.get(req.user.username)!.push(...addedChannels);
    }
    
    res.json({ success: true, addedCount, channels: addedChannels });
  } catch (error: any) {
    if (error.message?.includes('Quota exceeded')) {
      console.error('Failed to bulk add channels: Quota exceeded.');
    } else {
      console.error('Failed to bulk add channels:', error.message, error.stack);
    }
    res.status(500).json({ error: 'Failed to bulk add channels: ' + error.message });
  }
});

app.delete(['/api/channels/:docId', '/channels/:docId'], authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { docId } = req.params;
  try {
    const docRef = doc(db, 'channels', docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().username === req.user.username) {
      await deleteDoc(docRef);
      
      if (channelsCache.has(req.user.username)) {
        const channels = channelsCache.get(req.user.username)!;
        channelsCache.set(req.user.username, channels.filter(c => c.docId !== docId));
      }
      
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Unauthorized or not found' });
    }
  } catch (error) {
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
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

// Global error handler to prevent HTML error pages
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled Express error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

export default app;
