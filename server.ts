import express from 'express';
import { createServer as createViteServer } from 'vite';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, writeBatch, query, where, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-12345';

// Single Firebase Initialization
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

let db: any = null;
if (firebaseConfig.projectId && firebaseConfig.apiKey) {
  try {
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(firebaseApp);
    console.log('Firebase initialized successfully.');
  } catch (e) {
    console.error('Firebase init error:', e);
  }
} else {
  console.warn('Firebase configuration is missing in environment variables.');
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

const userServices = new Map<string, { bot: TelegramBot | null, chatId: string }>();

async function initUserService(username: string, config: UserConfig) {
  // Telegram Bot Setup
  const existingService = userServices.get(username);
  if (existingService?.bot) {
    try {
      await existingService.bot.stopPolling();
    } catch (e) {
      console.error(`Error stopping bot polling for ${username}:`, e);
    }
  }

  let bot = null;
  if (config.telegramBotToken) {
    try {
      bot = new TelegramBot(config.telegramBotToken, { polling: true });
      console.log(`Telegram bot initialized for ${username}`);

      bot.onText(/\/check/, async (msg) => {
        const chatId = msg.chat.id;
        if (!db) {
          bot?.sendMessage(chatId, 'Firebase is not configured on the server.');
          return;
        }
        try {
          const q = query(collection(db, 'channels'), where('username', '==', username), where('isLive', '==', true));
          const querySnapshot = await getDocs(q);
          const liveChannels: string[] = [];
          querySnapshot.forEach((doc) => {
            liveChannels.push(doc.data().id);
          });

          if (liveChannels.length > 0) {
            bot?.sendMessage(chatId, `Các kênh đang live:\n${liveChannels.join('\n')}`);
          } else {
            bot?.sendMessage(chatId, 'Hiện tại không có kênh nào đang live.');
          }
        } catch (error) {
          console.error('Error checking live channels:', error);
          bot?.sendMessage(chatId, 'Có lỗi xảy ra khi kiểm tra.');
        }
      });

      bot.onText(/\/(.+)/, async (msg, match) => {
        if (!match) return;
        const command = match[1];
        if (command === 'check' || command === 'start') return;
        
        const channelId = command;
        const chatId = msg.chat.id;
        
        bot?.sendMessage(chatId, `Đang kiểm tra kênh ${channelId}...`);
        const status = await checkTikTokLive(channelId);
        
        if (status.isLive) {
          if (status.coverUrl) {
            bot?.sendPhoto(chatId, status.coverUrl, { caption: `Kênh ${channelId} đang LIVE!` });
          } else {
            bot?.sendMessage(chatId, `Kênh ${channelId} đang LIVE!`);
          }
        } else {
          bot?.sendMessage(chatId, `Kênh ${channelId} hiện KHÔNG live.`);
        }
      });
    } catch (e) {
      console.error(`Telegram bot init error for ${username}:`, e);
      bot = null;
    }
  }

  userServices.set(username, { bot, chatId: config.telegramChatId });
}

async function initAllServices() {
  if (!db) return;
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    querySnapshot.forEach((docSnap) => {
      const userData = docSnap.data() as User;
      if (userData.config) {
        initUserService(userData.username, userData.config);
      }
    });
  } catch (error) {
    console.error('Error initializing all services:', error);
  }
}

// Initialize services after a short delay to ensure DB is ready
setTimeout(initAllServices, 2000);

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
    console.error(`Error checking TikTok for ${username}:`, error.message);
    return { isLive: false, viewerCount: 0, error: true };
  }
}

// Background Worker
const CHECK_INTERVAL = 60 * 1000;

async function checkAllChannels() {
  if (!db) return;
  for (const [username, service] of userServices.entries()) {
    if (!service.bot || !service.chatId) continue;
    
    try {
      const q = query(collection(db, 'channels'), where('username', '==', username));
      const querySnapshot = await getDocs(q);
      const channels: any[] = [];
      querySnapshot.forEach((doc) => {
        channels.push({ docId: doc.id, ...doc.data() });
      });

      for (const channel of channels) {
        const status = await checkTikTokLive(channel.id);
        
        if (status.error) {
          console.log(`Skipping update for ${channel.id} due to fetch error.`);
          continue;
        }

        if (status.isLive && !channel.isLive) {
          console.log(`${channel.id} is now LIVE for ${username}!`);
          
          await updateDoc(doc(db, 'channels', channel.docId), {
            isLive: true,
            offlineStrikes: 0,
            lastLiveAt: new Date().toISOString(),
            coverUrl: status.coverUrl || null,
            title: status.title || '',
            viewerCount: status.viewerCount || 0
          });

          const message = `🔴 Kênh <b>${channel.id}</b> đang LIVE!\n${status.title ? `Tiêu đề: ${status.title}\n` : ''}Người xem: ${status.viewerCount || 0}\nLink: https://www.tiktok.com/@${channel.id}/live`;
          
          if (status.coverUrl) {
            service.bot.sendPhoto(service.chatId, status.coverUrl, { caption: message, parse_mode: 'HTML' }).catch(e => console.error(e));
          } else {
            service.bot.sendMessage(service.chatId, message, { parse_mode: 'HTML' }).catch(e => console.error(e));
          }
        } 
        else if (status.isLive && channel.isLive) {
          await updateDoc(doc(db, 'channels', channel.docId), {
            viewerCount: status.viewerCount || 0,
            offlineStrikes: 0
          });
        }
        else if (!status.isLive && channel.isLive) {
          const strikes = (channel.offlineStrikes || 0) + 1;
          if (strikes >= 3) {
            console.log(`${channel.id} is now OFFLINE for ${username}.`);
            await updateDoc(doc(db, 'channels', channel.docId), {
              isLive: false,
              offlineStrikes: 0,
              viewerCount: 0
            });
          } else {
            await updateDoc(doc(db, 'channels', channel.docId), {
              offlineStrikes: strikes
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Error in background worker for ${username}:`, error);
    }
  }
}

setInterval(checkAllChannels, CHECK_INTERVAL);

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  const userDoc = await getDoc(doc(db, 'users', username));
  if (userDoc.exists()) return res.status(400).json({ error: 'Username already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser: User = {
    username,
    passwordHash,
    config: {
      telegramBotToken: '',
      telegramChatId: ''
    }
  };
  
  await setDoc(doc(db, 'users', username), newUser);

  const token = jwt.sign({ username }, JWT_SECRET);
  res.json({ token, username });
});

app.post('/api/auth/login', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { username, password } = req.body;
  
  const userDoc = await getDoc(doc(db, 'users', username));
  if (!userDoc.exists()) return res.status(400).json({ error: 'Invalid credentials' });

  const user = userDoc.data() as User;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username }, JWT_SECRET);
  res.json({ token, username });
});

app.get('/api/auth/me', authenticate, (req: any, res: any) => {
  res.json({ username: req.user.username });
});

// API Routes
app.get('/api/config', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const userDoc = await getDoc(doc(db, 'users', req.user.username));
  if (!userDoc.exists()) return res.status(404).json({ error: 'User not found' });
  res.json(userDoc.data().config || {});
});

app.post('/api/config', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const newConfig = req.body;
    const username = req.user.username;
    
    await updateDoc(doc(db, 'users', username), {
      config: newConfig
    });
    
    await initUserService(username, newConfig);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.get('/api/config-status', authenticate, (req: any, res: any) => {
  const service = userServices.get(req.user.username);
  res.json({
    firebase: !!db,
    telegramBot: !!service?.bot,
    telegramChatId: !!service?.chatId
  });
});

app.get('/api/check-live', authenticate, async (req: any, res: any) => {
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

app.get('/api/channels', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  try {
    const q = query(collection(db, 'channels'), where('username', '==', req.user.username));
    const querySnapshot = await getDocs(q);
    const channels: any[] = [];
    querySnapshot.forEach((doc) => {
      channels.push({ docId: doc.id, ...doc.data() });
    });
    res.json(channels);
  } catch (error) {
    console.error('Failed to fetch channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/channels', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Channel ID is required' });
  
  try {
    const q = query(collection(db, 'channels'), where('username', '==', req.user.username), where('id', '==', id));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    const newChannel = {
      id,
      username: req.user.username,
      isLive: false,
      addedAt: new Date().toISOString()
    };
    
    await setDoc(doc(collection(db, 'channels')), newChannel);
    res.json({ success: true, channel: newChannel });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

app.post('/api/channels/bulk', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Channel IDs array is required' });
  
  try {
    const q = query(collection(db, 'channels'), where('username', '==', req.user.username));
    const querySnapshot = await getDocs(q);
    const existingIds = new Set();
    querySnapshot.forEach((doc) => {
      existingIds.add(doc.data().id);
    });
    
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
        addedChannels.push(newChannel);
        addedCount++;
      }
      
      await batch.commit();
    }
    
    res.json({ success: true, addedCount, channels: addedChannels });
  } catch (error: any) {
    console.error('Failed to bulk add channels:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to bulk add channels: ' + error.message });
  }
});

app.delete('/api/channels/:docId', authenticate, async (req: any, res: any) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { docId } = req.params;
  try {
    const docRef = doc(db, 'channels', docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().username === req.user.username) {
      await deleteDoc(docRef);
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

startServer();
