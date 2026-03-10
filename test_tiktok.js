import axios from 'axios';
import * as cheerio from 'cheerio';

async function check() {
  try {
    const url = `https://www.tiktok.com/@ngockhanhday/live`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    const sigiStateStr = $('#SIGI_STATE').html();
    
    if (sigiStateStr) {
      const sigiState = JSON.parse(sigiStateStr);
      const userInfo = sigiState?.LiveRoom?.liveRoomUserInfo;
      console.log("userInfo.liveRoom.userCount:", userInfo?.liveRoom?.userCount);
      console.log("userInfo.liveRoom.liveRoomStats.userCount:", userInfo?.liveRoom?.liveRoomStats?.userCount);
      console.log("userInfo.stats.userCount:", userInfo?.stats?.userCount);
      console.log("sigiState.LiveRoom.liveRoomStats.userCount:", sigiState?.LiveRoom?.liveRoomStats?.userCount);
      
      // Let's dump the whole liveRoom object keys
      if (userInfo?.liveRoom) {
        console.log("liveRoom keys:", Object.keys(userInfo.liveRoom));
      }
      if (sigiState?.LiveRoom) {
        console.log("sigiState.LiveRoom keys:", Object.keys(sigiState.LiveRoom));
      }
    } else {
      console.log("SIGI_STATE not found");
    }
    
    const match1 = html.match(/"userCount":(\d+)/);
    const match2 = html.match(/"totalUser":(\d+)/);
    const match3 = html.match(/"user_count":(\d+)/);
    const match4 = html.match(/"viewer_count":(\d+)/);
    
    console.log("match1:", match1 ? match1[1] : null);
    console.log("match2:", match2 ? match2[1] : null);
    console.log("match3:", match3 ? match3[1] : null);
    console.log("match4:", match4 ? match4[1] : null);

    const scriptTags = $('script');
    scriptTags.each((i, el) => {
        const text = $(el).html();
        if (text && text.includes('userCount')) {
            console.log("Found userCount in script tag", i);
            const m = text.match(/"userCount":(\d+)/);
            if (m) console.log("Extracted:", m[1]);
        }
    });

  } catch (e) {
    console.error(e.message);
  }
}
check();
