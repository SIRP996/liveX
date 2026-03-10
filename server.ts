import express from 'express';
import { createServer as createViteServer } from 'vite';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

let appConfig = {
  firebaseApiKey: process.env.FIREBASE_API_KEY || '',
  firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  firebaseAppId: process.env.FIREBASE_APP_ID || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || ''
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      appConfig = { ...appConfig, ...parsed };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
}

loadConfig();

let db: any = null;
let bot: TelegramBot | null = null;
let currentChatId = '';

async function initServices() {
  // Firebase Setup
  const firebaseConfig = {
    apiKey: appConfig.firebaseApiKey,
    authDomain: appConfig.firebaseAuthDomain,
    projectId: appConfig.firebaseProjectId,
    storageBucket: appConfig.firebaseStorageBucket,
    messagingSenderId: appConfig.firebaseMessagingSenderId,
    appId: appConfig.firebaseAppId
  };

  if (firebaseConfig.projectId && firebaseConfig.apiKey) {
    try {
      const apps = getApps();
      if (apps.length > 0) {
        await deleteApp(apps[0]);
      }
      const firebaseApp = initializeApp(firebaseConfig);
      db = getFirestore(firebaseApp);
      console.log('Firebase initialized');
    } catch (e) {
      console.error('Firebase init error:', e);
      db = null;
    }
  } else {
    db = null;
    console.warn('Firebase config missing.');
  }

  // Telegram Bot Setup
  if (bot) {
    try {
      await bot.stopPolling();
    } catch (e) {
      console.error('Error stopping bot polling:', e);
    }
    bot = null;
  }

  const token = appConfig.telegramBotToken;
  currentChatId = appConfig.telegramChatId;

  if (token) {
    try {
      bot = new TelegramBot(token, { polling: true });
      console.log('Telegram bot initialized');

      bot.onText(/\/check/, async (msg) => {
        const chatId = msg.chat.id;
        if (!db) {
          bot?.sendMessage(chatId, 'Firebase is not configured.');
          return;
        }
        try {
          const querySnapshot = await getDocs(collection(db, 'channels'));
          const liveChannels: string[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.isLive) {
              liveChannels.push(data.id);
            }
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
      console.error('Telegram bot init error:', e);
      bot = null;
    }
  }
}

initServices();

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
    
    if (sigiStateStr) {
      const sigiState = JSON.parse(sigiStateStr);
      const userInfo = sigiState?.LiveRoom?.liveRoomUserInfo;
      
      const isLive = userInfo?.user?.status === 2 || userInfo?.liveRoom?.status === 2;
      
      if (isLive) {
        return { 
          isLive: true, 
          coverUrl: userInfo?.liveRoom?.coverUrl || userInfo?.user?.avatarLarger || null,
          title: userInfo?.liveRoom?.title || '',
          viewerCount: userInfo?.liveRoom?.userCount || 0
        };
      }
    }
    
    const html = response.data;
    if (html.includes('room_id') && html.includes('live_room')) {
       return { isLive: true, coverUrl: null, title: '', viewerCount: 0 };
    }

    return { isLive: false, viewerCount: 0 };
  } catch (error: any) {
    console.error(`Error checking TikTok for ${username}:`, error.message);
    return { isLive: false, viewerCount: 0 };
  }
}

// Background Worker
const CHECK_INTERVAL = 60 * 1000;

async function checkAllChannels() {
  if (!db || !bot || !currentChatId) return;
  
  try {
    const querySnapshot = await getDocs(collection(db, 'channels'));
    const channels: any[] = [];
    querySnapshot.forEach((doc) => {
      channels.push({ docId: doc.id, ...doc.data() });
    });

    for (const channel of channels) {
      const status = await checkTikTokLive(channel.id);
      
      if (status.isLive && !channel.isLive) {
        console.log(`${channel.id} is now LIVE!`);
        
        await updateDoc(doc(db, 'channels', channel.docId), {
          isLive: true,
          lastLiveAt: new Date().toISOString(),
          coverUrl: status.coverUrl || null,
          title: status.title || '',
          viewerCount: status.viewerCount || 0
        });

        const message = `🔴 Kênh <b>${channel.id}</b> đang LIVE!\n${status.title ? `Tiêu đề: ${status.title}\n` : ''}Người xem: ${status.viewerCount || 0}\nLink: https://www.tiktok.com/@${channel.id}/live`;
        
        if (status.coverUrl) {
          bot.sendPhoto(currentChatId, status.coverUrl, { caption: message, parse_mode: 'HTML' }).catch(e => console.error(e));
        } else {
          bot.sendMessage(currentChatId, message, { parse_mode: 'HTML' }).catch(e => console.error(e));
        }
      } 
      else if (status.isLive && channel.isLive) {
        // Update viewer count if already live
        await updateDoc(doc(db, 'channels', channel.docId), {
          viewerCount: status.viewerCount || 0
        });
      }
      else if (!status.isLive && channel.isLive) {
        console.log(`${channel.id} is now OFFLINE.`);
        await updateDoc(doc(db, 'channels', channel.docId), {
          isLive: false,
          viewerCount: 0
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('Error in background worker:', error);
  }
}

setInterval(checkAllChannels, CHECK_INTERVAL);

// API Routes
app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

app.post('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    appConfig = { ...appConfig, ...newConfig };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    await initServices();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.get('/api/config-status', (req, res) => {
  res.json({
    firebase: !!db,
    telegramBot: !!bot,
    telegramChatId: !!currentChatId
  });
});

app.get('/api/check-live', async (req, res) => {
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

app.get('/api/channels', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const querySnapshot = await getDocs(collection(db, 'channels'));
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

app.post('/api/channels', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Channel ID is required' });
  
  try {
    const querySnapshot = await getDocs(collection(db, 'channels'));
    let exists = false;
    querySnapshot.forEach((doc) => {
      if (doc.data().id === id) exists = true;
    });
    
    if (exists) {
      return res.status(400).json({ error: 'Channel already exists' });
    }

    const newChannel = {
      id,
      isLive: false,
      addedAt: new Date().toISOString()
    };
    
    await setDoc(doc(collection(db, 'channels')), newChannel);
    res.json({ success: true, channel: newChannel });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

app.post('/api/channels/bulk', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Channel IDs array is required' });
  
  try {
    console.log('Fetching existing channels...');
    const querySnapshot = await getDocs(collection(db, 'channels'));
    const existingIds = new Set();
    querySnapshot.forEach((doc) => {
      existingIds.add(doc.data().id);
    });
    console.log('Existing channels fetched.');
    
    const addedChannels = [];
    let addedCount = 0;
    
    // Filter and deduplicate new IDs
    const uniqueNewIds = [...new Set(
      ids.map(id => id.trim().replace(/^@/, ''))
         .filter(id => id && !existingIds.has(id))
    )];

    // Process in batches of 400 (Firebase limit is 500)
    const chunkSize = 400;
    for (let i = 0; i < uniqueNewIds.length; i += chunkSize) {
      const chunk = uniqueNewIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      
      for (const cleanId of chunk) {
        const newChannel = {
          id: cleanId,
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

app.delete('/api/channels/:docId', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Firebase not configured' });
  const { docId } = req.params;
  try {
    await deleteDoc(doc(db, 'channels', docId));
    res.json({ success: true });
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
