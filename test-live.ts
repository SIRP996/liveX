import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await axios.get('https://www.tiktok.com/@lananhdaily22/live', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    const html = res.data;
    const $ = cheerio.load(html);
    const sigi = $('#SIGI_STATE').html();
    console.log('SIGI_STATE exists:', !!sigi);
    if (sigi) {
      const parsed = JSON.parse(sigi);
      console.log('LiveRoomStatus:', parsed?.LiveRoom?.liveRoomStatus);
      console.log('LiveRoomUserInfo:', parsed?.LiveRoom?.liveRoomUserInfo);
    }
    console.log('room_id exists:', html.includes('room_id'));
    console.log('live_room exists:', html.includes('live_room'));
  } catch (e: any) {
    console.error(e.message);
  }
}
test();
