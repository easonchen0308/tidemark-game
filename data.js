/**
 * Dulles Diary - Unified Data Layer & Adaptive Hybrid Server Sync Driver
 * This script bridges both the Frontend (index.html) and Backend (admin.html).
 * 
 * DESIGN PHILOSOPHY:
 * 1. ZERO-CONFIGURATION STATIC FALLBACK:
 *    If opened as a local static file (file:///) or hosted on static pages (GitHub Pages, Vercel),
 *    it operates perfectly using Web Storage (localStorage). All custom puzzles, configs,
 *    and player logs are preserved on this browser.
 * 
 * 2. LIVE SEAMLESS SERVER SYNC (HYBRID MODE):
 *    If hosted on an active Node Express Server, it automatically detects it, persists everything
 *    to the backend database files (config.json, puzzles.json, players.json), and allows
 *    multi-device players log collection in real time.
 */

function getGameSlug() {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        return params.get('game') || 'tidemark';
    }
    return 'tidemark';
}

const SLUG = getGameSlug();
const STORAGE_KEYS = {
    CONFIG: `game_${SLUG}_config_v2`,
    PUZZLES: `game_${SLUG}_puzzles_v2`,
    PLAYERS: `game_${SLUG}_players_v2`
};
const LEGACY_STORAGE_KEYS = {
    CONFIG: `game_${SLUG}_config_v1`,
    PUZZLES: `game_${SLUG}_puzzles_v1`,
    PLAYERS: `game_${SLUG}_players_v1`
};

// 💡 建立對安全性限制沙盒（例如 file:/// 下禁用 localStorage 或 iframe 安全限制）的自癒安全代理
const safeStorage = {
    _memoryStore: {},
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn(`safeStorage: Failed to read "${key}" from localStorage, using memory fallback:`, e);
            return this._memoryStore[key] || null;
        }
    },
    setItem(key, val) {
        try {
            localStorage.setItem(key, val);
        } catch (e) {
            console.warn(`safeStorage: Failed to write "${key}" to localStorage, using memory fallback:`, e);
            this._memoryStore[key] = val;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn(`safeStorage: Failed to remove "${key}" from localStorage, using memory fallback:`, e);
            delete this._memoryStore[key];
        }
    }
};

function normalizeTeamPassword(password) {
    return String(password || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

function getPasswordKind(password) {
    const clean = normalizeTeamPassword(password);
    if (/^\d{6}A\d{2}$/.test(clean)) return 'regular';
    if (/^\d{6}T\d{2}$/.test(clean) || clean.startsWith('TEST')) return 'test';
    if (/^\d{6}P\d{2}$/.test(clean) || clean.startsWith('PR')) return 'pr';
    return '';
}

function countPasswordsByKind(players, kind) {
    return players.filter(p => p.approved === true && p.teamPassword && getPasswordKind(p.teamPassword) === kind).length;
}

function buildTeamPassword(memberCount, letter, sequence) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${mm}${dd}${String(parseInt(memberCount, 10) || 1).padStart(2, '0')}${letter}${String(sequence).padStart(2, '0')}`;
}

function recordPasswordLogin(player, device) {
    const now = Date.now();
    const loginDevice = String(device || '').trim() || 'Unknown Device';
    player.active = true;
    player.loginTime = now;
    player.device = loginDevice;
    if (!Array.isArray(player.loginSessions)) player.loginSessions = [];
    const maxSessions = Math.max(parseInt(player.memberCount, 10) || 1, 1);
    const existingSession = player.loginSessions.find(session => session.device === loginDevice);
    if (existingSession) {
        existingSession.loginTime = now;
        player.activeLoginCount = Math.min(player.loginSessions.length, maxSessions);
        return true;
    }
    if (player.loginSessions.length >= maxSessions) {
        return false;
    }
    player.loginSessions.push({
        device: loginDevice,
        loginTime: now
    });
    player.activeLoginCount = Math.min(player.loginSessions.length, maxSessions);
    if (!player.startTime) {
        player.startTime = now;
        player.currentProgress = '\u5e8f\u5e55';
    }
    return true;
}

// 完美復刻原版預設全局設定
const LEGACY_DEFAULT_CONFIG = {
    bgUrl: 'https://lh3.googleusercontent.com/pw/AP1GczN6sFl9b9fdCgfQD93oDqGmvFNAzPAd3l7DprUXM2YmGWvyUng8S38vf_qbmZcoQA1vor4lsVhwNFmraQmEJMNhPm1hKWoD0Swm2iOpy-NIoEaEKXv-ADa91HEw2NEx0pr3tx8GpucH4lBfbgQY8Lc=w721-h901-s-no-gm?authuser=0',
    logoUrl: '',
    bgMusicUrl: '',
    regLogoUrl: '',
    titleTop: '絕對傳奇',
    titleMain: '杜勒日記',
    titleSub: '絕對傳奇 • Legend of Absolutus • dulles\' Diary',
    titleCredit: '嘿路島民工作室製作',
    adminPassword: '',
    youtubeUrl: 'https://www.youtube.com/embed/CFJbG26WZDQ?si=DsqeFpbK4ETv3sJZ',
    navArchiveText: '基本設定',
    successTitle: '返航成功',
    successStory: '穿梭口重新亮起，海霧在你們身後慢慢散開。\n\n杜勒日記的最後幾頁不再顫動，像是終於等到有人把那些散落的記憶帶回來。\n\n你們完成了這段不屬於此刻，卻屬於八斗子的旅程。',
    summaryTitle: '五段八斗子記憶',
    summaryStory: '你們沿著杜勒留下的線索，重新看見八斗子的入口、地方味道、消失的沙灘、信仰守護，以及老照片裡仍然發亮的海。\n\n每一段記憶都不是單獨存在的謎題，而是一塊座標。當它們被重新拼回一起，返航的路才真正出現。\n\n最後，你們用自己的觀察、選擇與解答，讓這本日記完成了它等待多年的航程。',
    prologuePages: [
        {
            title: "序章：杜勒日記",
            text: "四周忽然安靜下來。\n\n原本午後的人聲、腳步聲、餐後的笑鬧聲，像被海霧一層一層吞沒。\n\n「你們停下腳步。」\n\n牆面上的光開始扭曲，腳下的地面傳來微微震動，像是踩在一艘即將離岸的老船上。\n\n遠處，有人低聲喊著「%*^#@#!**」\n\n那聲音像是從海邊傳來，卻又像從很久以前傳來。\n\n下一秒，眼前的八斗子變得陌生。",
            image: "https://lh3.googleusercontent.com/pw/AP1GczMvgx5XjBFVZFSCcIFC5yv4Bb38QWIcM3kPRx1JWYpo92STcw1rLLk21TUs9ZlpV3yy0ymNYiX-QbVLn3GyDKkpWFoDCkvgIVH-g49oGTuOAntpN_NIQC4xO9UBZdZv0EWYYFD8mrUTDAr1p3MYzE=w1601-h901-s-no-gm?authuser=0"
        },
        {
            title: "序章：杜勒日記",
            text: "我為杜勒。\n\n若你們已經翻開這本日記，\n\n代表穿梭口已經關閉，\n\n「你們也已踏入不屬於自己的八斗子。」\n\n當你們拿到這本日記時，\n\n我已不再行走於海風之中。\n\n不再掌舵，不再補網，\n\n也不再聽見清晨漁船出港時的引擎聲。\n但我仍留下了這些文字。",
            image: "https://lh3.googleusercontent.com/pw/AP1GczO1FD6oPkteQJ8HfsB0oS9U_2X3M39PSFRpBw6hb4sqxAq2HRByIjAqTm5eC-7u5LwhvF-nQfrjJ8ZOA7eL6POxImF_7w-1YVA8NBNfoZu9CjEsEJhF1kAkMGrq77D-BhqfQhHLbd7LhU6r7eKUhaM=w1601-h901-s-no-gm?authuser=0"
        },
        {
            title: "序章：杜勒日記",
            text: "你們想回到自己的世界，\n\n不能只靠力氣，也不能只靠運氣。\n\n「穿梭口需要記憶作為座標。」\n\n若座標散失，歸途將會封閉。\n\n「去把那些被遺忘的圖騰喚醒吧。」",
            image: ""
        }
    ],
    endingPerfectTitle: '完美結局：失落圖騰的歸宿',
    endingPerfectStory: '你們不僅順利返航，更在旅途中尋回了所有隱藏的八斗子圖騰與記憶碎片...\n\n這片海洋的每一縷風、每一艘歸港的漁船，都將銘記你們的名字。八斗子的完整面貌在你們眼前徹底鋪展，這是一場真正完美的傳奇航程。'
};

function withRequiredConfigText(config) {
    const textKeys = ['successTitle', 'successStory', 'summaryTitle', 'summaryStory'];
    const normalized = Object.assign({}, config || {});
    textKeys.forEach(key => {
        if (!String(normalized[key] || '').trim()) {
            normalized[key] = DEFAULT_CONFIG[key];
        }
    });
    return normalized;
}

function getSeedConfigForSlug(slug = SLUG) {
    const normalizedSlug = String(slug || '').toLowerCase();
    if (normalizedSlug === 'default') return LEGACY_DEFAULT_CONFIG;
    if (normalizedSlug === 'shouchaoedu') return EDUCATION_CONFIG;
    return DEFAULT_CONFIG;
}

function getSeedPuzzlesForSlug(slug = SLUG) {
    const normalizedSlug = String(slug || '').toLowerCase();
    if (normalizedSlug === 'default') return LEGACY_DEFAULT_PUZZLES;
    if (normalizedSlug === 'shouchaoedu') return EDUCATION_PUZZLES;
    return DEFAULT_PUZZLES;
}

const LEGACY_DEFAULT_PUZZLES = [
    { 
        id: 1, chapter: "任務一", name: "入口的老約定", stars: 1, radar: [1, 1, 3, 2, 1, 1], 
        story: [
            `1983.07.08 晴，海風微弱\n\n今日海風不大，船也沒有急著出去。\n我沿著八斗子的入口慢慢走，看見幾個外地來的人站在路口張望。\n他門一邊看著手上的東西，一邊確認自己是不是走對地方。\n我看了覺得有些好笑。以前哪有這麼方便。\n那時候要約人，只能把地點說清楚，然後相信對方會來。\n八斗子入口有個大家都懂的老地方。不是廟，也不是港口，更不是魚市場。`,
            `那裡站著幾個有趣的傢伙。\n不會出海，不會補網，不懂潮汐，也聽不懂漁人的口令。可是很多人第一次來八斗子，都是靠牠們找到方向。\n年輕人談感情，會約在那裡。親戚回鄉，會說在那裡等。遊客找不到人，也會先往那裡走。\n我有時候想，牠們依然跟這邊沒關係，卻比很多人更早看見八斗子的日子。只要牠們還站在那裡，\n八斗子就還有人記得怎麼相遇。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczMH64KveyW8t85mg7Ke0aSDXFbcX_sAtxFdkliTrFrABNKTc__oAV4u9y3Kkj-sdH49XK3qOuQxz4-oNlhN4gb2pAla_IfY7jN0qDsXwbvfrSkUe92uZN-X-t63lUG3GssFszGbshwRsC9QflMADUs=w1204-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczO1FD6oPkteQJ8HfsB0oS9U_2X3M39PSFRpBw6hb4sqxAq2HRByIjAqTm5eC-7u5LwhvF-nQfrjJ8ZOA7eL6POxImF_7w-1YVA8NBNfoZu9CjEsEJhF1kAkMGrq77D-BhqfQhHLbd7LhU6r7eKUhaM=w1601-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "https://lh3.googleusercontent.com/pw/AP1GczMH64KveyW8t85mg7Ke0aSDXFbcX_sAtxFdkliTrFrABNKTc__oAV4u9y3Kkj-sdH49XK3qOuQxz4-oNlhN4gb2pAla_IfY7jN0qDsXwbvfrSkUe92uZN-X-t63lUG3GssFszGbshwRsC9QflMADUs=w1204-h901-s-no-gm?authuser=0",
        landmarkText: "任務目標：\n請觀察八斗子入口處，找出杜勒口中「不屬於這裡的傢伙」共有多少。",
        landmarkBtnText: "前往解謎",
        puzzleDesc: "請觀察八斗子入口處，找出杜勒口中「不屬於這裡的傢伙」共有多少。",
        inputPlaceholder: "請輸入數字",
        submitBtnText: "送出答案",
        answer: "2",
        errorMsg: "日記上的鹽痕沒有反應。你似乎找到了方向，但還沒有看清楚杜勒說的「牠們」到底有多少。",
        postStory: "日記第一頁忽然發出微弱的藍光。\n紙面上那些模糊的入口輪廓開始移動，像是有人從海霧中慢慢走近。\n你們聽見杜勒留下的聲音：\n「人若能找到彼此，就不算真正迷路。」\n入口的影子中，一枚圖騰緩緩浮現。",
        postStoryImg: "https://lh3.googleusercontent.com/pw/AP1GczMxxa-Ms3ma-_E1lLzUnJcOnXQmafzy1d2Q57555v0O79cwFDFfDsxmHxdRfUjRSY1ofQJegpl7QE6KL4Mz3dHxMNRrRSSO2M0iJkekyQuC9rueJslq_k08VZv41_AJH3m3243g3RrE5JyD6FxeSKw=w370-h386-s-no-gm?authuser=0",
        totemDesc: "「人若能找到彼此，就不算真正迷路。」\n喚醒八斗子入口處人們在此相遇、等待與約定的老約定記憶。",
        totemImg: "https://lh3.googleusercontent.com/pw/AP1GczMxxa-Ms3ma-_E1lLzUnJcOnXQmafzy1d2Q57555v0O79cwFDFfDsxmHxdRfUjRSY1ofQJegpl7QE6KL4Mz3dHxMNRrRSSO2M0iJkekyQuC9rueJslq_k08VZv41_AJH3m3243g3RrE5JyD6FxeSKw=w370-h386-s-no-gm?authuser=0"
    },
    { 
        id: 2, chapter: "任務二", name: "地方的味道", stars: 2, radar: [2, 2, 3, 3, 2, 3], 
        story: [
            `1983.07.15 午後陰，炭火味重\n\n今日回到八斗街。走過那間老屋時，腳步又慢了下來。\n年輕時，那裡總是很忙。天還沒亮，就有人搬魚、洗籃子、整理漁具。地板常是濕的，空氣裡混著魚味、鹽味、柴油味，還有人忙到來不及擦汗的味道。\n外地人聞了，多半會皺眉。可對我們來說，那就是生活。\n後來港變了，船變了，討海人的日子也變了。\n很多老地方安靜下來，不再像以前那樣日日有人進出。\n可那間老屋沒有真的沉睡。`,
            `進去，屋裡常飄出炭火香.\n有人把海裡細小而珍貴的味道，拌進肉裡，慢慢烤熟。\n咬下去的時候，嘴裡會有細細的聲響。\n像浪花碎開，也像從前魚寮裡那些沒有寫進帳本的日子，又重新活了過來。\n我常覺得，地方的味道不一定會消失。它飾物換了模樣。從討海人的手上，走進旅人的記憶裡。\n想知道八斗子的海味從哪裡轉身，就去找那間曾經是魚寮、如今仍有香氣升起的老屋。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczNGV885efIHAiO4UTl1X67VTuPQ3NpGOhEwInmCUWCgnTHspFVTPmsPdXJ1eLgk1Q2aCTvJ9vpVdjjjlnoCK18rVO58JdCl358m-Q3fUbWt3qRlI-3IYXqS3j9lBV1qivfJo-Dzi9kn-OE0F5pGtrA=w1296-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczNjtSmk2e1SqaqnMIO1wnp2V4kpjsV1eRX4oChZcRVN10QzQRoFS-Z-GeR0Dr_OUYn-WFlhEV87ZuvfBP384zonG-lzjVRGb8c41A_iVAMN8ul1vMS1XCpQCIcLqJWg8eF0ogCI51vw0v0VZJSZXec=w1284-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "",
        landmarkText: "杜勒沒有寫下地址。\n他只記得那裡曾經是魚寮，後來成為保存八斗子地方味道的場域。請根據日記內容，找到那間「曾經是魚寮、如今仍有香氣升起的老屋」，並完成屋內的挑戰及輸入密碼。",
        landmarkBtnText: "前往解謎",
        puzzleDesc: "請前往現地，在引路人的指導下製作飛魚卵香腸，完成挑戰後，引路人將給予密鑰提示",
        inputPlaceholder: "請點選正確的答案圖示",
        submitBtnText: "送出答案",
        puzzleType: "flag",
        puzzleOptions: [
            { "label": "八斗街 53 之 1 號 (魚寮老屋)", "img": "https://lh3.googleusercontent.com/pw/AP1GczNGV885efIHAiO4UTl1X67VTuPQ3NpGOhEwInmCUWCgnTHspFVTPmsPdXJ1eLgk1Q2aCTvJ9vpVdjjjlnoCK18rVO58JdCl358m-Q3fUbWt3qRlI-3IYXqS3j9lBV1qivfJo-Dzi9kn-OE0F5pGtrA=w1296-h901-s-no-gm?authuser=0" },
            { "label": "八斗街 15 之 3 號 (吉古拉工坊)", "img": "https://lh3.googleusercontent.com/pw/AP1GczMH64KveyW8t85mg7Ke0aSDXFbcX_sAtxFdkliTrFrABNKTc__oAV4u9y3Kkj-sdH49XK3qOuQxz4-oNlhN4gb2pAla_IfY7jN0qDsXwbvfrSkUe92uZN-X-t63lUG3GssFszGbshwRsC9QflMADUs=w1204-h901-s-no-gm?authuser=0" },
            { "label": "八斗街 35 之 1 號 (石花海藻屋)", "img": "https://lh3.googleusercontent.com/pw/AP1GczNboihlABnxiCunviZ0IKQddvN2UMYn3qfPQtEkI-6e78XUZpGjfSCNA8gl8dguhHoJyCVmOhJkfCpG8ltrKfBJqWlURVLCEhtrC9dl-y0mDivaVoIXTQDBipfrqI9u7uz0ryHWFV6ZcJUkikFN5QU=w634-h901-s-no-gm?authuser=0" },
            { "label": "八斗街 51 之 3 號 (小卷鮮米粉)", "img": "https://lh3.googleusercontent.com/pw/AP1GczNjtSmk2e1SqaqnMIO1wnp2V4kpjsV1eRX4oChZcRVN10QzQRoFS-Z-GeR0Dr_OUYn-WFlhEV87ZuvfBP384zonG-lzjVRGb8c41A_iVAMN8ul1vMS1XCpQCIcLqJWg8eF0ogCI51vw0v0VZJSZXec=w1284-h901-s-no-gm?authuser=0" }
        ],
        answer: "A",
        errorMsg: "日記上的油漬沒有變化。你看見了門牌，但並非杜勒記憶中的老屋味道所在。",
        postStory: "當正確門牌被輸入後，日記忽然散出淡淡的炭火香。\n紙面上的魚寮輪廓逐漸清晰。\n你們彷彿聽見鐵網翻動、炭火輕響，以及海風穿過老屋門縫的聲音。杜勒留下的字跡慢慢浮現：\n「海的味道，若有人願意記得，就不會真正離開。」\n老屋的影子中，一枚新的圖騰浮現。",
        postStoryImg: "https://lh3.googleusercontent.com/pw/AP1GczNOP5RCCSJ6DaNUOA5qA3uMmqiWSUF9i3Fo-Ronf5pTovgLw_tvqNoTTeMI6SFI52s9T1jyPuX6MCgozUV_9-Ib9ANXKjQs7HK-RXaJLoD0nY_Zb_o7j007LjqCiRorgNAwZAimdzG-0DO1-o7iuMs=w350-h386-s-no-gm?authuser=0",
        totemDesc: "「海的味道，若有人願意記得，就不會真正離開。」\n喚醒八斗子老街魚寮裡柴火翻動、香氣升起的地方海味道記憶。",
        totemImg: "https://lh3.googleusercontent.com/pw/AP1GczNOP5RCCSJ6DaNUOA5qA3uMmqiWSUF9i3Fo-Ronf5pTovgLw_tvqNoTTeMI6SFI52s9T1jyPuX6MCgozUV_9-Ib9ANXKjQs7HK-RXaJLoD0nY_Zb_o7j007LjqCiRorgNAwZAimdzG-0DO1-o7iuMs=w350-h386-s-no-gm?authuser=0"
    },
    { 
        id: 3, chapter: "任務三", name: "沙灘消失後", stars: 3, radar: [1, 2, 3, 5, 4, 2], 
        story: [
            `1983.08.02 午後雨停，港風帶鹽\n\n今日雨停後，我沿著八斗街走了一段。港邊的風變得很直，吹過來時，已經不是我小時候熟悉的味道。年輕人若沒有聽老人說，大概學難相信，這條街以前離海那麼近。\n那時候，房舍前方不遠就是沙。孩子放學後會往海邊跑，腳底踩著細沙，褲管常被浪打濕。\n大人一邊整理漁具，一邊喊人回家吃飯。\n海浪聲很近。近得像在門口說話。工程來了，海岸線慢慢往外退。船有了新的停靠地方，討海人也多了一些安全。`,
            `我知道，這是時代往前走。可是每次走到那排房子前，我還是會停一下。它們站得很整齊，一棟接著一棟，像是替那片消失的沙灘守著位置。\n人們現在從它們前面走過，多半只會看見房子，但我看見的是浪線，是魚寮的影子，是以前孩子跑過去又跑回來的腳印。\n若想知道沙灘後來變成了什麼，就別只看港，去看看那排房子，老沙灘的痕跡，還站在那裡。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczNboihlABnxiCunviZ0IKQddvN2UMYn3qfPQtEkI-6e78XUZpGjfSCNA8gl8dguhHoJyCVmOhJkfCpG8ltrKfBJqWlURVLCEhtrC9dl-y0mDivaVoIXTQDBipfrqI9u7uz0ryHWFV6ZcJUkikFN5QU=w634-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczMvgx5XjBFVZFSCcIFC5yv4Bb38QWIcM3kPRx1JWYpo92STcw1rLLk21TUs9ZlpV3yy0ymNYiX-QbVLn3GyDKkpWFoDCkvgIVH-g49oGTuOAntpN_NIQC4xO9UBZdZv0EWYYFD8mrUTDAr1p3MYzE=w1601-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "https://lh3.googleusercontent.com/pw/AP1GczNboihlABnxiCunviZ0IKQddvN2UMYn3qfPQtEkI-6e78XUZpGjfSCNA8gl8dguhHoJyCVmOhJkfCpG8ltrKfBJqWlURVLCEhtrC9dl-y0mDivaVoIXTQDBipfrqI9u7uz0ryHWFV6ZcJUkikFN5QU=w634-h901-s-no-gm?authuser=0",
        landmarkText: "八斗街曾經靠近沙灘，後來因為建港與海岸變化，原本的沙灘逐漸消失，成為今日的漁民住宅空間，請分析潮汐趨勢，找出最安全乾潮回收時段。",
        landmarkBtnText: "前往解謎",
        puzzleDesc: "請觀察潮汐變化波浪圖，選出波谷水位最低且最安全的時段以回收零件。",
        inputPlaceholder: "請點選最安全的時段",
        submitBtnText: "確認送出",
        puzzleType: "tide",
        puzzleOptions: ["A. 12:00", "B. 14:30", "C. 16:30 (最安全乾潮)", "D. 18:30"],
        answer: "C",
        errorMsg: "日記頁上的沙痕沒有變化。選取的乾潮時間並非最安全的低水位，請重試！",
        postStory: "當正確數字被輸入後，杜勒日記上的沙痕開始移動。紙面上原本模糊的海岸線，慢慢浮現出舊沙灘的輪廓。接著，浪線退去，一排房子的影子站了起來。\n\n你們聽見杜勒留下的聲音：\n「海不在眼前，不代表它沒有來過。」\n「有人記得，沙灘就還沒有完全消失。」\n\n排屋與浪線之間，一枚新的圖騰緩緩浮現。",
        postStoryImg: "https://lh3.googleusercontent.com/pw/AP1GczN2uwsPEqbXnRZSgQD_C0CDuS5xtzqFva7mPfMMUIYRX6yUUtk2tq0-v5pPYTKOlJi6KIXUCknAL7r2cH_I8K5N_X66DhjDECloApchC1JtxQIdnAj_33BFIexIGJwgJRxxj6ZHOMBJE_8pQamzox8=w371-h386-s-no-gm?authuser=0",
        totemDesc: "「海不在眼前，不代表它沒有來過。」\n訴說著被時間與海浪掩埋的黃金老沙灘，凝聚海洋最深沉的歷史痕跡。",
        totemImg: "https://lh3.googleusercontent.com/pw/AP1GczN2uwsPEqbXnRZSgQD_C0CDuS5xtzqFva7mPfMMUIYRX6yUUtk2tq0-v5pPYTKOlJi6KIXUCknAL7r2cH_I8K5N_X66DhjDECloApchC1JtxQIdnAj_33BFIexIGJwgJRxxj6ZHOMBJE_8pQamzox8=w371-h386-s-no-gm?authuser=0"
    },
    { 
        id: 4, chapter: "任務四", name: "神蹟", stars: 3, radar: [3, 1, 2, 4, 4, 3], 
        story: [
            `1983.08.18 雨後放晴，廟前香煙未散\n\n今日到廟前上香。\n雨剛停，石階還濕，香爐裡的煙被風一吹，慢慢往屋簷下散開。\n年輕時我總以為，人只要力氣夠、船夠穩、眼睛看得準，就能靠自己闖過海上的風浪。老了才知道，很多時候，人不是不勇敢，只是需要一點能讓心安定下來的東西。\n八斗子的媽祖，最早並不是住在今日這樣的廟裡。老人說，香火先來，神像後來，廟宇又是更後來的事。我小時候，常聽長輩說起一段戰爭時期的往事。`,
            `那時，村裡有一批人被徵召，要離開八斗子，到很遠、很危險的地方去。出發前，眾人向媽祖求香火護身。誰都知道，離開家門的人，都希望能帶著一份平安走。\n可是神明的指示，卻和眾人原本想的不一樣。後來才知道，神明不是少給。是早一步知道，真正要離開的人，並沒有原先以為的那麼多。\n我年輕時聽這故事，只覺得神奇.\n現在再想，才知道那幾份香火裡，藏著的不僅是牽掛。討海人最懂這種心情。\n人走向海，或走向遠方，手裡若還握著一點家鄉的香火，心就不會那麼孤單。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczMY1tXkJjJOhsrtBPtJxQMRoQvWAVGq24jpdAoLGHZwFUlR3LSlcyGyZzCNgut-SJG2DUf5izxwocLRI4_X8lJoaD9WuMhMc0GKQvJmn9YxqjsuWnzFtr-dyiANB1tGnQEEKXmaA33OPf5yHhInYKQ=w1274-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczN6sFl9b9fdCgfQD93oDqGmvFNAzPAd3l7DprUXM2YmGWvyUng8S38vf_qbmZcoQA1vor4lsVhwNFmraQmEJMNhPm1hKWoD0Swm2iOpy-NIoEaEKXv-ADa91HEw2NEx0pr3tx8GpucH4lBfbgQY8Lc=w721-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "",
        landmarkText: "日記提到一段八斗子媽祖的地方記憶。當年有一批村民即將離鄉，眾人向媽祖祈求護身，但神明的指示，卻和眾人原本預期不同。請判讀 CCTV 監視畫面中的海面行為風險。",
        landmarkBtnText: "前往解謎",
        puzzleDesc: "請使用環境監測 CCTV 監視系統，辨識畫面中有幾處錯誤/違規的沙灘遊憩行為。",
        inputPlaceholder: "請點選違規數量",
        submitBtnText: "提交判讀結果",
        puzzleType: "violation",
        puzzleImg: "https://lh3.googleusercontent.com/pw/AP1GczPdbN9rxoOjS-dwoOMm9sZgGR9Kz-_rWJ0FgUBfSFLnk3Y2kASvn3uzkpc-qHqmW9uXyvM6kCddNrKT7VAZ9T15SArdGQDRNzhukHMSomXgBKKfWFlWE09R4iqzXUxVsNWBWCF4bSWzguCPWkcMfgE=w1602-h901-s-no-gm?authuser=0",
        puzzleOptions: ["A. 8 處", "B. 12 處", "C. 14 處 (正確)", "D. 18 處"],
        answer: "C",
        errorMsg: "日記頁上的香灰沒有散開。您似乎算錯了違規點，請重新仔細糾察影像特徵！",
        postStory: "當正確數字被輸入後，杜勒日記上的香灰痕跡開始發亮。\n紙面上浮現出一縷細細的香煙。香煙向上盤旋，最後化成廟宇屋脊的形狀。\n\n你們聽見杜勒留下的聲音：\n「人離開家，不一定知道自己會去哪裡。」\n「但只要有人替他點香，他就知道自己不是孤身一人。」\n\n香煙與屋脊之間，一枚新的圖騰緩緩浮現。",
        postStoryImg: "https://lh3.googleusercontent.com/pw/AP1GczP66CCYywi1KMaLl8yj5gqNA6zsQ9vD_aX1t_YQAqjv2UFyjBQyQfW2x7u3cZsN4aHh-f2cIb0A9U13cZAm0QvNyKyx_e54-9eknQHunZAcN4uTqrLggZH2Gk_uslK6lB_xcJXMa_FA5fbWdju1zfI=w370-h386-s-no-gm?authuser=0",
        totemDesc: "「只要有人替他點香，他就知道自己不是孤身一人。」\n喚醒八斗子度天宮媽祖守護子民與離鄉遊子溫暖印記的神蹟圖騰。",
        totemImg: "https://lh3.googleusercontent.com/pw/AP1GczP66CCYywi1KMaLl8yj5gqNA6zsQ9vD_aX1t_YQAqjv2UFyjBQyQfW2x7u3cZsN4aHh-f2cIb0A9U13cZAm0QvNyKyx_e54-9eknQHunZAcN4uTqrLggZH2Gk_uslK6lB_xcJXMa_FA5fbWdju1zfI=w370-h386-s-no-gm?authuser=0"
    },
    { 
        id: 5, chapter: "任務五", name: "溫慢的海", stars: 5, radar: [4, 2, 4, 5, 4, 4], 
        story: [
            `1983.09.03 薄雲，夕色泛紅\n\n今日整理舊物，翻出一張很久以前的照片。照片裡的八斗子，看起來離海很近。沙還在，風也像是比較慢。夕陽落在水面上的時候，海會變成一片紅。那種紅不是熱鬧的紅，是一天快要結束時，海面靜下來的顏色。\n我看著照片，看了很久。有些年輕人若看到，可能只會說：\n「那是以前的海邊。」\n可我知道，那不進入海邊。那裡曾經有孩子的笑聲，有放學後不想太早回家的腳步，也有大人嘴上罵危險、卻還是站在一旁看著的背影。尤其是天冷的時候，孩子們總知道該往哪裡去。`,
            `那一帶的水，和別處不太一樣。不是因為陽光特別偏愛那片海。也不是因為潮水自己變了性子。照片裡有些尖尖的影子，從水面露出來。\n沒聽過故事的人，會把它們當成普通的東西。但老八斗子人看見，心裡會明白。那些影子後面，藏著一段冬天也願意靠近海的理由。\n海岸變了。沙被填起來，路變直了，房子慢慢站上原本浪會拍到的地方。有些地方，一旦不見了，就只能留在老照片和老人家的嘴裡。\n我把照片夾回日記裡，如果以後有人看到它，希望他不要只看見夕陽，也要看見那片曾經在冬天比較溫暖的海。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczNjtSmk2e1SqaqnMIO1wnp2V4kpjsV1eRX4oChZcRVN10QzQRoFS-Z-GeR0Dr_OUYn-WFlhEV87ZuvfBP384zonG-lzjVRGb8c41A_iVAMN8ul1vMS1XCpQCIcLqJWg8eF0ogCI51vw0v0VZJSZXec=w1284-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczPdbN9rxoOjS-dwoOMm9sZgGR9Kz-_rWJ0FgUBfSFLnk3Y2kASvn3uzkpc-qHqmW9uXyvM6kCddNrKT7VAZ9T15SArdGQDRNzhukHMSomXgBKKfWFlWE09R4iqzXUxVsNWBWCF4bSWzguCPWkcMfgE=w1602-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "https://lh3.googleusercontent.com/pw/AP1GczNjtSmk2e1SqaqnMIO1wnp2V4kpjsV1eRX4oChZcRVN10QzQRoFS-Z-GeR0Dr_OUYn-WFlhEV87ZuvfBP384zonG-lzjVRGb8c41A_iVAMN8ul1vMS1XCpQCIcLqJWg8eF0ogCI51vw0v0VZJSZXec=w1284-h901-s-no-gm?authuser=0",
        landmarkText: "日記提到一張舊照片。照片裡的八斗子仍有沙灘，海邊有人遠望夕陽。請解讀昔日冬天也溫慢暖心的出水口求求訊號組合。",
        landmarkBtnText: "前往解謎",
        puzzleDesc: "電力即將耗盡。請對照國際求救訊號表，選出正確的 SOS 莫斯密碼組合以召喚救援。",
        inputPlaceholder: "請點選正確訊號組合",
        submitBtnText: "送出求救訊號",
        puzzleType: "sos",
        puzzleOptions: ["A. ★★／🌙🌙／★★", "B. ★★★／🌙🌙🌙／★★★", "C. 🌙🌙🌙／★★★／🌙🌙🌙", "D. ★🌙★／🌙★🌙／★🌙★"],
        answer: "B",
        errorMsg: "日記中的老照片沒有反應。訊號格式排列錯誤，救援無法鎖定位置，請重新傳送！",
        postStory: "當正確名稱被輸入後，老照片上的夕陽忽然亮起。水面開始泛出一圈又一圈細小波紋。那些原本模糊的尖影逐漸清晰，像是從記憶深處重新浮上來。\n\n你們聽見杜勒留下的聲音：「照片會褪色，地方會改變。」「但只要有人願意說起，消失的海就還會在記憶裡發亮。」\n\n照片中的水波向外擴散，圖騰從夕光與海面之間浮現。",
        postStoryImg: "https://lh3.googleusercontent.com/pw/AP1GczNufGX9cPmOYMFaftqk9fLNPNcR6Gq_hVDW67PvWNmaMg1zuwfMsG6q4qP8EMu5GPhbMaiQegqhZY2vRrsHueZwYwU0bUlQoGO-h81B08DubgwExD18jOZMzARhfZyvyT1h7mR1AFiHOHwXIjDy9H0=w383-h386-s-no-gm?authuser=0",
        totemDesc: "「照片會褪色，地方會改變。但只要有人願意說起，消失的海就還會在記憶裡發亮。」\n喚醒八斗子昔日北火出水口的溫慢暖心歷史印記。",
        totemImg: "https://lh3.googleusercontent.com/pw/AP1GczNufGX9cPmOYMFaftqk9fLNPNcR6Gq_hVDW67PvWNmaMg1zuwfMsG6q4qP8EMu5GPhbMaiQegqhZY2vRrsHueZwYwU0bUlQoGO-h81B08DubgwExD18jOZMzARhfZyvyT1h7mR1AFiHOHwXIjDy9H0=w383-h386-s-no-gm?authuser=0"
    },
    { 
        id: 6, chapter: "任務六", name: "最後的考驗-穿梭口", dependsOn: "all", stars: 2, radar: [2, 2, 1, 3, 4, 1], 
        story: [
            `五枚圖騰甦醒後，杜勒日記忽然變得很安靜。\n海風停了，紙頁不再翻動。連遠處的浪聲，也像被某種力量按住，你們手中的五枚圖騰，開始依序發光。`,
            `1983.09.10 夜風轉強，潮聲很近\n\n我這一生，大多時間都在八斗子。年輕時以為，船開得遠，才算看過世界。老了才知道，有些地方就算一輩子住在那裡，也未必真的看懂。\n人會老、房子會改、沙灘會退去、舊照片會褪色。但只要還有人願意說起，地方就不會真正消失。\n我記得入口怎麼等人、記得魚寮怎麼忙起來、記得沙灘以前離家門多近、記得香火怎麼讓離鄉的人安心、也記得冬天那片比較溫暖的海。`,
            `八斗子不是一個人撐起來的、船省不是一個人推得動的。我到現在還記得那個聲音、大家肩靠著肩，手推著船，腳踩著沙。有人先喊，其他人跟上，那聲音一起出去，船才會慢慢動起來。\n若有一天，你們要回到自己的世界，就把那個聲音喊出來。\n不要一個人喊，要一起喊。`
        ], 
        storyImg: [
            "https://lh3.googleusercontent.com/pw/AP1GczNn5Aft82neLg4TizfBZ_TK6IKgMpF3Xpy0L8FZM80L4aMvyeRd1J8gxh9gBwzK4e31p8LZQpqaJeOx6EsyWHgVfYOB6s9Cy9n81XJ_p_pXUd4FooyNFoImuYSk4YIhzi7nzkYQ42bhfY3yJSqDvWc=w1601-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczO1FD6oPkteQJ8HfsB0oS9U_2X3M39PSFRpBw6hb4sqxAq2HRByIjAqTm5eC-7u5LwhvF-nQfrjJ8ZOA7eL6POxImF_7w-1YVA8NBNfoZu9CjEsEJhF1kAkMGrq77D-BhqfQhHLbd7LhU6r7eKUhaM=w1601-h901-s-no-gm?authuser=0", 
            "https://lh3.googleusercontent.com/pw/AP1GczMvgx5XjBFVZFSCcIFC5yv4Bb38QWIcM3kPRx1JWYpo92STcw1rLLk21TUs9ZlpV3yy0ymNYiX-QbVLn3GyDKkpWFoDCkvgIVH-g49oGTuOAntpN_NIQC4xO9UBZdZv0EWYYFD8mrUTDAr1p3MYzE=w1601-h901-s-no-gm?authuser=0"
        ],
        landmarkImg: "https://lh3.googleusercontent.com/pw/AP1GczNn5Aft82neLg4TizfBZ_TK6IKgMpF3Xpy0L8FZM80L4aMvyeRd1J8gxh9gBwzK4e31p8LZQpqaJeOx6EsyWHgVfYOB6s9Cy9n81XJ_p_pXUd4FooyNFoImuYSk4YIhzi7nzkYQ42bhfY3yJSqDvWc=w1601-h901-s-no-gm?authuser=0",
        landmarkText: "穿梭口就在眼前。海風從裂縫中吹出，帶著熟悉又陌生的鹽味，五枚圖騰在你們身後排列。輸入返航口訣",
        landmarkBtnText: "前往驗證",
        puzzleDesc: "穿梭口就在眼前。海風從裂縫中吹出，帶著熟悉又陌生的鹽味，五枚圖騰在你們身後排列.輸入返航口訣",
        inputPlaceholder: "請輸入口訣",
        submitBtnText: "啟動穿梭口",
        answer: "A-LOO",
        answers: ["A-LOO", "ALO", "A LOO"],
        errorMsg: "穿梭口短暫亮起，卻又重新暗下。你們還沒有說出真正能推動船的聲音。",
        postStory: `當你們輸入正確口訣的瞬間，五枚圖騰同時發出光芒。\n入口的圖騰化成路標。\n老屋的圖騰化成炭火。\n沙灘的圖騰化成浪線。\n香火的圖騰化成煙。\n夕照的圖騰化成水波。\n\n它們沿著杜勒日記的頁面連成一條發光的海岸線，遠方傳來熟悉的聲音。\nA——LOO——\nA——LOO——\n這一次，不是從過去傳來，是你們一起喊出的聲音，穿梭口完全打開。`,
        postStoryImg: ""
    }
];

const DEFAULT_CONFIG = {
    bgUrl: '',
    logoUrl: '',
    bgMusicUrl: '',
    regLogoUrl: '',
    regTitle: '守潮藏寶圖：外木山海岸安全航程',
    regSubtitle: '守潮小隊報名',
    regDesc: '請填寫隊伍、場次與安全資料。送出後，工作人員會確認報名內容並提供入場金鑰。',
    regSafetyAgreementText: '我已理解本活動為戶外海岸實境解謎，會遵守現場告示、工作人員引導與安全界線。',
    regWeatherAgreementText: '我同意若遇天候、潮汐、海象或現場安全疑慮，活動可調整、延期或取消。',
    regTeamTypeOptions: '地圖派：先確認路線與回程\n觀察派：先看現場與線索\n推理派：先分析資訊與矛盾\n安全派：先確認能不能前進',
    regTeamNameLabel: '\u968a\u4f0d\u540d\u7a31',
    regTeamNamePlaceholder: '\u4f8b\u5982\uff1a\u6f6e\u6c50\u5075\u63a2\u968a',
    regLeaderNameLabel: '\u4e3b\u8981\u806f\u7d61\u4eba',
    regLeaderNamePlaceholder: '\u8acb\u586b\u5beb\u4e3b\u8981\u806f\u7d61\u4eba',
    regMemberCountLabel: '\u968a\u4f0d\u4eba\u6578',
    regMemberCountMin: 6,
    regMemberCountMax: 99,
    regMemberCountDefault: 6,
    regPhoneLabel: '\u806f\u7d61\u96fb\u8a71',
    regPhonePlaceholder: '\u8acb\u586b\u5beb\u53ef\u806f\u7d61\u7684\u96fb\u8a71',
    regEmailLabel: 'Email \u4fe1\u7bb1',
    regEmailPlaceholder: '\u8acb\u586b\u5beb\u63a5\u6536\u901a\u77e5\u7684 Email',
    regSessionDateLabel: '\u53c3\u52a0\u65e5\u671f',
    regSessionTimeLabel: '\u53c3\u52a0\u5834\u6b21',
    regSessionTimePlaceholder: '\u8acb\u9078\u64c7\u5834\u6b21',
    regSessionTimeOptions: '\u4e0a\u5348\u5834 09:30\n\u4e0b\u5348\u5834 14:00\n\u81ea\u8a02\u5834\u6b21 / \u5f85\u5de5\u4f5c\u4eba\u54e1\u78ba\u8a8d',
    regTeamTypeLabel: '\u968a\u4f0d\u985e\u578b',
    regTeamTypePlaceholder: '\u8acb\u9078\u64c7\u968a\u4f0d\u985e\u578b',
    regEmergencyNameLabel: '\u7dca\u6025\u806f\u7d61\u4eba',
    regEmergencyNamePlaceholder: '\u975e\u672c\u968a\u540c\u884c\u8005\u5c24\u4f73',
    regEmergencyPhoneLabel: '\u7dca\u6025\u806f\u7d61\u96fb\u8a71',
    regEmergencyPhonePlaceholder: '\u6d3b\u52d5\u4e2d\u53ef\u806f\u7d61\u96fb\u8a71',
    regChildrenLabel: '\u5152\u7ae5\u6216\u7279\u6b8a\u9700\u6c42',
    regNoChildrenOption: '\u968a\u4f0d\u4e2d\u6c92\u6709 12 \u6b72\u4ee5\u4e0b\u5152\u7ae5',
    regHasChildrenOption: '\u968a\u4f0d\u4e2d\u6709 12 \u6b72\u4ee5\u4e0b\u5152\u7ae5',
    regSpecialNeedsPlaceholder: '\u82e5\u6709\u7279\u6b8a\u9700\u6c42\u8acb\u586b\u5beb\uff0c\u6c92\u6709\u53ef\u7559\u7a7a\u3002',
    regSubmitButtonText: '\u9001\u51fa\u5831\u540d\u8cc7\u6599',
    regBank: '',
    titleTop: '守潮藏寶圖',
    titleMain: '外木山海岸安全航程',
    titleSub: '地方文化 x 海岸安全 x 實境解謎',
    titleCredit: '基隆外木山海岸走讀任務',
    adminPassword: '',
    youtubeUrl: '',
    navArchiveText: '守潮任務',
    overlayArchiveTitle: '守潮印記庫',
    overlayArchiveDesc: '查看你已找回的守潮卡與支線印記。',
    overlayArchiveCloseBtn: '關閉',
    overlaySettingsTitle: '航程設定',
    overlaySettingsDesc: '如果你想重新走一次守潮航程，可以在這裡重置進度。',
    overlaySettingsResetBtn: '重置任務進度',
    navSettingsText: '設定',
    successTitle: '普通結局：安全回家的路',
    successStory: '守潮寶匣打開了。\n\n匣中沒有金幣，也沒有寶石，只有一張乾燥的紙。紙上寫著：「你已經學會安全回家的路。」\n\n你完成了主要試煉，知道要敬海、認路、看告示、查海象、辨認風險，也知道條件不對時要停下。\n\n但是木匣底部還有幾個淡淡的空位。那裡原本應該放著地方的記憶、地標的理解、潮汐的時間，以及同行者的約定。\n\n阿潮伯的字跡慢慢浮現：「能回家，已經很好。但如果你還願意多聽一點地方的故事，多看一點海岸的細節，你會知道，守潮不是一個人的事。」\n\n你成為了守潮員，找到了安全回家的方法。',
    summaryTitle: '守潮航程紀錄',
    summaryStory: '你從外木山漁港出發，穿過王船文化、三柱香地標、海岸告示、即時海象、離岸流判斷與最後的停止選擇。\n\n你一路收回的不是答案，而是一套可以帶著走的安全判斷：先問、先看、先查、再判斷；條件不對，就不上水。\n\n真正的冒險，不是靠近危險，而是知道什麼時候該停下。',
    prologuePages: [
        {
            title: '海不開門',
            text: '外木山一直流傳著一句老話：\n\n「海不會阻止人靠近，但海會記得誰沒有準備。」\n\n很多年前，外木山有一位老漁民，人們都叫他阿潮伯。他熟悉每一道潮、每一種浪，也知道哪一天的海看起來安靜，其實最危險。\n\n協安宮王船巡港那一年，外海忽然起霧。幾個年輕人看見浪不大，想沿著岸邊去找一條傳說中的藏寶路線。阿潮伯攔住他們，只說了一句話：\n\n「今天海不開門。」',
            image: ''
        },
        {
            title: '濕掉的藏寶圖',
            text: '沒有人聽懂那句話。\n\n直到潮水漲起，原本露出的礁石路被海吞沒；遠處看似平靜的水面，開始把漂浮物往外拉。那一刻，年輕人才明白，海不是沒有聲音，只是人沒有學會聽。\n\n後來，阿潮伯把自己一生讀海的經驗畫成一張圖，藏在外木山到大武崙之間。那張圖不是尋寶圖，而是一張守潮藏寶圖。\n\n圖上沒有金銀財寶的位置，只有被海水暈開的線、看不清的記號，以及幾句像是提醒、又像是警告的話。',
            image: ''
        },
        {
            title: '成為守潮員',
            text: '多年後，一條名為「外木山最美下水路線」的貼文在網路流傳。貼文裡有美景、有路線、有打卡點，卻沒有提醒旗幟、潮汐、離岸流，也沒有告訴人們什麼時候該停下。\n\n你收到一張被海水浸濕的藏寶圖。圖角浮出阿潮伯的字：\n\n「如果你只是來找寶藏，請停在岸上。\n如果你想學會安全回家，就讀懂海留下的記號。」',
            image: ''
        }
    ],
    endingPerfectTitle: '最佳結局：真正的守潮員',
    endingPerfectStory: '當最後一道安全流程排好，守潮寶匣沒有立刻打開。\n\n那些曾經被你多看一眼的小記號，先亮了起來。\n\n王船巡港的鑼聲，從港邊傳來。三柱香的影子，落在海岸線上。潮汐的水線，沿著地圖慢慢退去。結伴的記號，像燈一樣亮在回家的路上。\n\n這一次，寶匣打開時，裡面不只是一張紙。\n\n裡面有一枚舊銅牌，上面刻著：「守潮員，不是替海決定誰能靠近。守潮員，是提醒每一個人，都要安全回家。」\n\n你終於明白，阿潮伯留下藏寶圖，不是為了考驗誰最聰明，也不是為了找到哪條最刺激的路線。\n\n他想留下的是一種地方的智慧：漁民敬海，所以先問天候；地方記得王船，所以祈求平安；海岸有地標，所以人知道自己在哪裡；潮汐會改變，所以路不能只看眼前；朋友會互相提醒，所以冒險不該只靠逞強。\n\n你不是找到了寶藏。你把寶藏帶回了岸上。\n\n你成為真正的守潮員。'
};

const DEFAULT_PUZZLES = [
    {
        id: 1,
        questType: 'main',
        chapter: '第一道浪紋',
        name: '王船留下的第一句話',
        stars: 1,
        radar: [2, 2, 2, 4, 2, 3],
        story: [
            '藏寶圖的第一角，被海水泡得發皺。你只看得見幾個字：\n\n「王船來時，不是叫人出海，而是叫人記得平安。」',
            '你站在外木山漁港邊，聽見港邊老人說起協安宮王船的故事。王船巡港不是表演，也不是傳說裡的神祕寶船。對漁民來說，那是面對海以前的一種提醒：人可以靠海生活，但不能忘記海的脾氣。\n\n地圖背面浮出阿潮伯的字：\n\n「守潮員的第一課，不是勇敢，是敬海。」'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你站在外木山漁港邊，海風從港口吹來。藏寶圖上的第一道浪紋還沒有亮起，像是在等你先聽懂這裡的人如何面對海。',
        landmarkBtnText: '閱讀藏寶圖',
        puzzleType: 'choice',
        puzzleDesc: '港邊老人指著海說：「王船巡港不是叫人去贏過海。」你要把第一句守潮訓寫進藏寶圖，哪一句最接近這份提醒？',
        puzzleOptions: [
            'A. 海象看起來平靜時，就可以放心挑戰更遠的地方',
            'B. 靠近海以前，先敬海、問平安，再決定能不能出發',
            'C. 只要有祈求平安，就可以不用看現場警示',
            'D. 王船巡港是在鼓勵人證明自己比海更勇敢'
        ],
        answer: 'B',
        inputPlaceholder: '選擇答案',
        submitBtnText: '交出判斷',
        errorMsg: '你再想想。這句話如果讓人更想逞強，就不是王船留下的提醒。守潮的第一步，是先承認海比人更大。',
        postStory: '你把答案寫在藏寶圖上，濕掉的紙面慢慢浮出第一枚浪紋。\n\n阿潮伯留下的聲音像從風裡傳來：\n\n「記得，海不是敵人。但不敬海的人，會把自己變成危險。」\n\n你取得守潮卡：敬海。',
        postStoryImg: '',
        totemDesc: '守潮卡：敬海\n\n靠近海以前，先懂得敬畏。',
        totemImg: ''
    },
    {
        id: 2,
        questType: 'main',
        chapter: '第二道浪紋',
        name: '三柱香下的海岸',
        dependsOn: 1,
        stars: 1,
        radar: [2, 2, 4, 3, 3, 3],
        story: [
            '你沿著海岸線前進，遠方出現高聳的煙囪。藏寶圖上用炭筆畫著幾道直線，旁邊寫著：\n\n「看得見三柱香，就知道自己還在外木山的風裡。」',
            '地方人口中的「基隆三柱香」，指的是協和電廠高聳的煙囪。它讓外木山不只是風景照裡的海岸，也是一個有產業、有生活、有記憶的地方。\n\n阿潮伯在地圖上留下第二個問題：\n\n「你不能只看海，也要知道自己站在哪裡。」'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你抬頭看向遠方的煙囪。它們像釘在海岸線上的座標，提醒你：你走進的不是單純景點，而是一個有人生活、有產業痕跡的海岸。',
        landmarkBtnText: '辨認地標',
        puzzleType: 'choice',
        puzzleDesc: '你抬頭看見遠方煙囪。同行的人說：「那只是拍照背景吧？」你要怎麼把這個地標寫進藏寶圖？',
        puzzleOptions: [
            'A. 它只是觀光背景，和安全航程沒有關係',
            'B. 它是協和電廠高聳煙囪，也是你確認外木山位置的地方座標',
            'C. 它代表附近一定有安全下水點，可以直接往海邊走',
            'D. 它是三座燈塔，只要看見它就不用再確認路線'
        ],
        answer: 'B',
        inputPlaceholder: '選擇答案',
        submitBtnText: '標記地標',
        errorMsg: '你抓到地標了嗎？三柱香不是安全保證，也不是單純背景；它提醒你先確認自己在什麼地方。',
        postStory: '你在藏寶圖上標出三柱香的位置。原本模糊的海岸線變得清楚了一些。\n\n阿潮伯的字跡再次浮現：\n\n「認得地標的人，不容易迷路。認得地方的人，才知道海岸不是只給人拍照的背景。」\n\n你取得守潮卡：認路。',
        postStoryImg: '',
        totemDesc: '守潮卡：認路\n\n知道自己站在哪裡，才知道該怎麼安全離開。',
        totemImg: ''
    },
    {
        id: 3,
        questType: 'main',
        chapter: '第三道浪紋',
        name: '紅圈不是裝飾',
        dependsOn: 2,
        stars: 2,
        radar: [3, 2, 4, 4, 3, 2],
        story: [
            '你來到一處海岸告示牌前。藏寶圖上的墨線突然停住，像是在提醒你：\n\n「很多人看見海，卻沒有看見牌子。」',
            '告示牌上有紅色、黃色、藍色的標誌。紅色圓形不是裝飾，黃色三角形不是花紋，藍色方形也不是單純的指示圖案。它們是海岸開口說話的方式。\n\n阿潮伯留下第三道考驗：\n\n「如果你連海岸寫下的警告都不讀，就不該再往前走。」'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你走到告示牌前，藏寶圖的墨線停住了。海已經把警告寫在岸上，現在輪到你讀懂它。',
        landmarkBtnText: '查看告示',
        puzzleType: 'choice',
        puzzleDesc: '你看見紅色圓形標誌。旁邊有人說：「那邊不能下，那我們走到旁邊沒牌子的地方。」你要怎麼判斷？',
        puzzleOptions: [
            'A. 紅色圓形多半是禁止或限制，應停止靠近並重新找安全區',
            'B. 只要離標誌幾公尺，沒有牌子的地方就可以下水',
            'C. 如果海面看起來平靜，警示可以先當參考',
            'D. 紅色標誌通常是推薦拍照點，代表視野很好'
        ],
        answer: 'A',
        inputPlaceholder: '選擇答案',
        submitBtnText: '讀懂告示',
        errorMsg: '你差點被「旁邊看起來可以」騙走。警示標誌不是只管標誌正下方，而是在提醒這一帶有風險。',
        postStory: '你把紅色禁制標誌描進藏寶圖。地圖邊緣浮出一句話：\n\n「真正的自由，不是什麼都做，而是知道哪裡不能做。」\n\n你取得守潮卡：看告示。',
        postStoryImg: '',
        totemDesc: '守潮卡：看告示\n\n海岸已經把警告寫下來，守潮員要先讀懂。',
        totemImg: ''
    },
    {
        id: 4,
        questType: 'main',
        chapter: '第四道浪紋',
        name: '今天海開門嗎',
        dependsOn: 3,
        stars: 2,
        radar: [3, 3, 3, 5, 5, 4],
        story: [
            '你抵達烏龜岩附近。海面看起來很亮，風也不算大。隊伍裡有人說：\n\n「看起來很平靜，應該可以吧？」',
            '藏寶圖突然滲出一圈水痕，浮現阿潮伯的一句話：\n\n「眼睛看到的海，只是海願意讓你看的部分。」\n\n你不能只憑感覺判斷。你要查浪高、風速、潮汐、警戒資訊，也要留意現場公告與救生員提醒。'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你站在觀海點，眼前的海看起來很亮。手機在你手上，不只可以拍照，也可以幫你確認今天海是不是真的開門。',
        landmarkBtnText: '查詢海象',
        puzzleType: 'choice',
        puzzleDesc: '天氣看起來很好，但藏寶圖上的潮線開始變深。下水或靠近礁岩前，你最需要先確認哪一組資訊？',
        puzzleOptions: [
            'A. 今天照片好不好看、社群上哪個角度最熱門',
            'B. 浪高、風速、潮汐、漲退潮時間、海域警戒與現場公告',
            'C. 只要查現在是不是退潮，退潮就一定安全',
            'D. 只要天氣預報沒有下雨，就不用查海象'
        ],
        answer: 'B',
        inputPlaceholder: '選擇答案',
        submitBtnText: '完成查詢',
        errorMsg: '你只看見其中一部分。晴天、退潮、熱門路線都不能單獨代表安全；要把浪、風、潮、警戒一起看。',
        postStory: '你查完海象，把浪高與潮汐時間記在藏寶圖上。地圖上的海線開始移動，像是在提醒你：\n\n「海不是固定的路，海是會改變的門。」\n\n你取得守潮卡：查海象。',
        postStoryImg: '',
        totemDesc: '守潮卡：查海象\n\n你看海，不只看眼前，也要看資料。',
        totemImg: ''
    },
    {
        id: 5,
        questType: 'main',
        chapter: '第五道浪紋',
        name: '平靜缺口',
        dependsOn: 4,
        stars: 3,
        radar: [4, 2, 5, 5, 4, 3],
        story: [
            '你望向沙灘外側，發現有一段水面特別平，浪花比兩側少，看起來像是比較安全的通道。\n\n隊伍裡有人興奮地說：\n\n「那邊浪比較小，從那裡下去剛好！」',
            '藏寶圖忽然變冷，阿潮伯的字浮了出來：\n\n「最安靜的地方，有時候最會把人帶走。」\n\n你不需要在現場硬判斷真實離岸流，但你必須記住一件事：看似平靜，不一定安全。真正的判斷，要回到救生員、公告與現場海象。'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你望向沙灘外側，有一段水面看起來特別平。藏寶圖像是變重了，提醒你不要被海面的安靜騙走。',
        landmarkBtnText: '觀察水面',
        puzzleType: 'choice',
        puzzleDesc: '你看見一段水面特別平、浪花比較少，同行的人想從那裡下去。這時你應該怎麼判斷？',
        puzzleOptions: [
            'A. 浪花比較少，代表那裡比較安全，可以優先下水',
            'B. 中間有一道較深、較平、浪花較少並往外延伸的水道，可能是危險水流線索',
            'C. 只要自己會游泳，就可以先下去試試水流',
            'D. 如果旁邊有人拍照，就代表這一帶沒有危險'
        ],
        answer: 'B',
        inputPlaceholder: '選擇答案',
        submitBtnText: '圈出風險',
        errorMsg: '你差點相信「安靜就是安全」。離岸流常常不是用大浪提醒你，有時反而藏在浪花中斷的缺口裡。',
        postStory: '你沒有把「平靜」當成安全。藏寶圖上的那道水路被紅線圈起，旁邊浮出新的字：\n\n「會讀海的人，不被表面騙走。」\n\n你取得守潮卡：辨流。',
        postStoryImg: '',
        totemDesc: '守潮卡：辨流\n\n平靜不等於安全，判斷要回到公告、救生員與海象。',
        totemImg: ''
    },
    {
        id: 6,
        questType: 'main',
        chapter: '第六道浪紋',
        name: '最難的勇氣',
        dependsOn: 5,
        stars: 3,
        radar: [3, 3, 3, 5, 4, 3],
        story: [
            '你們來到最後一段海岸。有人拿著網路上流傳的「最美下水路線」，說只差一步就能完成打卡。\n\n可是你看見現場旗幟不是綠色，海象資訊也不理想，附近沒有救生員。更重要的是，潮水正在往上。',
            '朋友說：\n\n「都走到這裡了，不下去一下很可惜。」\n\n藏寶圖上的浪紋同時亮起。阿潮伯留下最後一道提醒：\n\n「你最難的任務，不是前進，是停下。」'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '你已經走到最後一段海岸。現在不是再多知道一個答案，而是要做出選擇：要不要把所有人帶回岸上。',
        landmarkBtnText: '做出選擇',
        puzzleType: 'choice',
        puzzleDesc: '你已經走到最後一段海岸。有人說：「都來了，再靠近一下就好。」但現場沒有救生員，潮水正在改變。你要怎麼做？',
        puzzleOptions: [
            'A. 派一個人先去探路，其他人在岸上等結果',
            'B. 只靠近一下拍照，不真的下水就沒關係',
            'C. 停止靠近海域，帶大家回到安全區或集合點',
            'D. 趁潮水還沒完全上來，趕快完成最後一段'
        ],
        answer: 'C',
        inputPlaceholder: '選擇答案',
        submitBtnText: '守住回家的路',
        errorMsg: '你聽見的是很像真的理由，但它還是在把人推向風險。守潮不是找理由繼續，是有勇氣停下。',
        postStory: '你收起手機，請隊伍停在岸上。\n\n那一刻，藏寶圖上的路線沒有繼續往海裡延伸，而是轉向回家的方向。\n\n阿潮伯的字跡浮現：\n\n「能安全回家的人，才是真正完成航程的人。」\n\n你取得守潮卡：停下。',
        postStoryImg: '',
        totemDesc: '守潮卡：停下\n\n真正的勇氣，是在風險不對時停下來。',
        totemImg: ''
    },
    {
        id: 7,
        questType: 'main',
        isFinal: true,
        chapter: '最終關',
        name: '守潮寶匣',
        dependsOn: 6,
        stars: 5,
        radar: [5, 4, 3, 5, 5, 4],
        story: [
            '六張守潮卡依序亮起：敬海、認路、看告示、查海象、辨流、停下。\n\n守潮寶匣出現在畫面中央。木匣沒有鎖，只有一道刻痕：\n\n「請把安全回家的路排出來。」',
            '這不是考驗你記不記得答案，而是確認你是否真的理解：靠近海以前，安全不是單一動作，而是一整套流程。'
        ],
        storyImg: ['', ''],
        landmarkImg: '',
        landmarkText: '守潮寶匣就在你面前。前面每一道浪紋都在發光，你需要把它們排成一條能安全回家的路。',
        landmarkBtnText: '開啟寶匣',
        puzzleType: 'sort',
        puzzleDesc: '六張守潮卡散在寶匣前。請把它們排成你真正靠近海以前，應該完成的安全航程。',
        puzzleOptions: [
            '1. 敬海：先承認海有自己的脾氣',
            '2. 認路：確認地標、位置與回程方向',
            '3. 看告示：讀懂禁制標誌、旗幟與現場公告',
            '4. 查海象：確認浪高、風速、潮汐與警戒資訊',
            '5. 辨流：觀察水色、浪花缺口與可能的危險水流',
            '6. 停下：條件不對，就帶大家回到安全區'
        ],
        answer: '1. 敬海：先承認海有自己的脾氣,2. 認路：確認地標、位置與回程方向,3. 看告示：讀懂禁制標誌、旗幟與現場公告,4. 查海象：確認浪高、風速、潮汐與警戒資訊,5. 辨流：觀察水色、浪花缺口與可能的危險水流,6. 停下：條件不對，就帶大家回到安全區',
        inputPlaceholder: '',
        submitBtnText: '排列完成',
        errorMsg: '寶匣沒有打開。你把某張卡放得太早或太晚了。先理解地方與界線，再查資料與判斷風險，最後才做出要不要靠近海的選擇。',
        postStory: '六張守潮卡依序落入刻痕。寶匣開始發光。\n\n你找到的不是金幣，而是安全回家的方法。',
        postStoryImg: '',
        totemDesc: '守潮寶匣\n\n把安全流程排對，航程才真正完成。',
        totemImg: ''
    },
    {
        id: 101,
        questType: 'side',
        chapter: '藏圖暗記',
        name: '王船巡港印記',
        dependsOn: 1,
        stars: 2,
        radar: [2, 2, 2, 4, 3, 3],
        story: [
            '第一道浪紋亮起後，藏寶圖背面滲出一行小字：\n\n「王船不是停在故事裡，它走過港，也走過人心。」',
            '你把圖拿近一點，發現紙背還藏著一枚幾乎被海水蓋住的小印。它沒有催你前進，只像是在問：你願不願意多停一會兒？'
        ],
        landmarkText: '你摸到藏寶圖背面的凹痕。這不是必經的路，但如果你願意多看一眼，圖上的地方記憶會變得更完整。',
        landmarkBtnText: '尋找印記',
        puzzleType: 'choice',
        puzzleDesc: '你看著王船印記，心裡冒出幾種解讀。哪一種理解，最不會把「敬海」誤讀成「有保佑就能冒險」？',
        puzzleOptions: [
            'A. 它是漁民與地方共同祈求平安的文化記憶，也提醒人要謹慎',
            'B. 只要拜過王船，就算海象不好也可以出發',
            'C. 它只是拍照道具，和地方生活沒有關係',
            'D. 它代表越靠近海越能證明勇敢'
        ],
        answer: 'A',
        errorMsg: '這個理解太像把文化當成通行證了。王船的平安願望不是讓人忽略風險，而是提醒人謹慎靠海。',
        postStory: '你把王船印記蓋在藏寶圖角落。海風中像傳來港邊鑼鼓聲。\n\n圖上的海線安靜了一些，像是有人在遠處替你點了一盞平安燈。',
        totemDesc: '暗記：王船巡港\n\n地方的平安願望，也是一種守潮智慧。',
        branch1Label: '收下王船印記',
        branch1Tag: 'side_wangchuan',
        branch2Label: '繼續航程',
        branch2Tag: 'side_wangchuan'
    },
    {
        id: 102,
        questType: 'side',
        chapter: '藏圖暗記',
        name: '三柱香地標印記',
        dependsOn: 2,
        stars: 2,
        radar: [2, 2, 4, 3, 3, 3],
        story: [
            '藏寶圖上畫著幾道高高的線，旁邊有一句話：\n\n「不要只找漂亮的海，也要看見海岸背後的城市。」',
            '這個支線讓你重新看見外木山：自然景觀、產業設施與居民生活，其實都在同一條海岸線上。'
        ],
        landmarkText: '你看見遠方煙囪立在海岸線上。藏寶圖的邊角微微發熱，像是在提醒你：地標不只是方向，也是地方留下的痕跡。',
        landmarkBtnText: '補上地標',
        puzzleType: 'choice',
        puzzleDesc: '你在地圖上補三柱香印記。哪一種說法，最能把它從「背景」變成真正的地方線索？',
        puzzleOptions: [
            'A. 海岸同時承載自然景觀、產業設施與城市記憶',
            'B. 看見三柱香，就代表附近一定可以安全下水',
            'C. 它只是遠方背景，和你的位置判斷無關',
            'D. 它只適合夜間冒險時當作目標'
        ],
        answer: 'A',
        errorMsg: '三柱香可以幫你認地方，但不能替你保證海況。地標是線索，不是安全許可。',
        postStory: '你在藏寶圖上補上煙囪的位置。地圖不再只是海岸線，而像是一張地方生活的輪廓。\n\n你忽然覺得，自己不是走在風景裡，而是走進一個仍在呼吸的地方。',
        totemDesc: '暗記：三柱香\n\n看見地標，也看見地方。',
        branch1Label: '收下地標印記',
        branch1Tag: 'side_chimney',
        branch2Label: '繼續航程',
        branch2Tag: 'side_chimney'
    },
    {
        id: 103,
        questType: 'side',
        chapter: '藏圖暗記',
        name: '潮汐時間印記',
        dependsOn: 4,
        stars: 3,
        radar: [4, 3, 3, 5, 5, 4],
        story: [
            '藏寶圖上有一段路，退潮時露出，漲潮時消失。旁邊寫著：\n\n「路不是一直都在，海會把路收回去。」',
            '你發現，安全不是只看空間，也要看時間。退潮時能走的地方，漲潮後可能變成危險區。'
        ],
        landmarkText: '你發現藏寶圖上的某段路忽明忽暗。它不是壞了，而是在提醒你：海岸的路，有時候會被潮水收回去。',
        landmarkBtnText: '查看潮線',
        puzzleType: 'choice',
        puzzleDesc: '退潮時，一段礁石路露了出來。它看起來像捷徑，也像誘惑。你要怎麼處理這條「暫時出現的路」？',
        puzzleOptions: [
            'A. 趁現在能走就往前，回程再看情況',
            'B. 先查潮汐時間，確認漲潮前有足夠時間安全返回',
            'C. 只要天空很晴朗，就不用管漲退潮',
            'D. 看到別人走過，就代表你也一定可以走'
        ],
        answer: 'B',
        errorMsg: '退潮時能走的地方，漲潮後可能被海水淹沒。靠近礁石、潮間帶或沙洲前，要查潮汐並預留返回時間。',
        postStory: '你在地圖上畫下一條潮線。原來海岸的路會變，真正安全的路，必須把時間也算進去。\n\n圖上的水痕退開了一點，你看見回程的方向更清楚了。',
        totemDesc: '暗記：潮汐\n\n路會變，時間也要算進安全判斷。',
        branch1Label: '收下潮汐印記',
        branch1Tag: 'side_tide',
        branch2Label: '繼續航程',
        branch2Tag: 'side_tide'
    },
    {
        id: 104,
        questType: 'side',
        chapter: '藏圖暗記',
        name: '結伴守護印記',
        dependsOn: 6,
        stars: 2,
        radar: [3, 4, 2, 4, 4, 2],
        story: [
            '藏寶圖最後一角只剩一句簡短的話：\n\n「一個人可以走得快，一群人才能一起回家。」',
            '這一題不是問你會不會游泳，而是問你是否理解海岸活動中的互相照應。'
        ],
        landmarkText: '你看見藏寶圖角落有兩個小小的人形記號。它們靠得很近，像是在提醒你：安全回家，不該只靠一個人。',
        landmarkBtnText: '確認同行',
        puzzleType: 'choice',
        puzzleDesc: '你看見同行印記亮起。出發前，哪一種準備最像真正能把人帶回岸上的約定？',
        puzzleOptions: [
            'A. 一個人行動比較自由，真的出事再打電話',
            'B. 結伴同行，確認活動範圍，準備必要安全裝備，也約好不上水的條件',
            'C. 只要會游泳，就不用告訴別人自己的路線',
            'D. 讓不會游泳的人留在岸邊，其他人就可以放心下水'
        ],
        answer: 'B',
        errorMsg: '結伴不是湊人數，而是彼此確認界線、裝備、回程與停止條件。能互相提醒，才是真的同行。',
        postStory: '你在藏寶圖上補上同行者的記號。你不是只保護自己，也要提醒身邊的人一起安全回家。\n\n圖上的回家路亮了一小段，像有人在岸上等你們。',
        totemDesc: '暗記：結伴\n\n安全回家不是一個人的事。',
        branch1Label: '收下結伴印記',
        branch1Tag: 'side_partner',
        branch2Label: '繼續航程',
        branch2Tag: 'side_partner'
    }
];

function attachShouchaoImageAssets() {
    const A = 'assets/shouchao/A_opening入口圖/';
    const B = 'assets/shouchao/B_main關卡圖/';
    const C = 'assets/shouchao/C_side印記圖/';

    Object.assign(DEFAULT_CONFIG, {
        bgUrl: A + 'A04_cover_main.png',
        logoUrl: A + 'A06_logo_shouchao.png',
        regBgUrl: A + 'A05_register_bg.png',
        regLogoUrl: A + 'A06_logo_shouchao.png',
        successImg: B + 'M07_3_normal_ending.png',
        endingPerfectImg: B + 'M07_4_best_ending.png'
    });

    if (Array.isArray(DEFAULT_CONFIG.prologuePages)) {
        const prologueImgs = [
            A + 'A01_opening_prologue_01.png',
            A + 'A02_opening_prologue_02.png',
            A + 'A03_opening_prologue_03.png'
        ];
        DEFAULT_CONFIG.prologuePages.forEach((page, index) => {
            if (page && prologueImgs[index]) page.image = prologueImgs[index];
        });
    }

    const mainImages = {
        1: {
            storyImg: [B + 'M01_1_story.png'],
            landmarkImg: B + 'M01_2_landmark.png',
            puzzleImg: B + 'M01_2_landmark.png',
            postStoryImg: B + 'M01_3_reward_card.png',
            totemImg: B + 'M01_3_reward_card.png'
        },
        2: {
            storyImg: [B + 'M02_1_story.png'],
            landmarkImg: B + 'M02_2_landmark.png',
            puzzleImg: B + 'M02_2_landmark.png',
            postStoryImg: B + 'M02_3_reward_card.png',
            totemImg: B + 'M02_3_reward_card.png'
        },
        3: {
            storyImg: [B + 'M03_1_story.png'],
            landmarkImg: B + 'M03_1_story.png',
            puzzleImg: B + 'M03_2_puzzle.png',
            postStoryImg: B + 'M03_3_reward_card.png',
            totemImg: B + 'M03_3_reward_card.png'
        },
        4: {
            storyImg: [B + 'M04_1_story.png'],
            landmarkImg: B + 'M04_1_story.png',
            puzzleImg: B + 'M04_2_tide_system.png',
            postStoryImg: B + 'M04_3_reward_card.png',
            totemImg: B + 'M04_3_reward_card.png'
        },
        5: {
            storyImg: [B + 'M05_1_story.png'],
            landmarkImg: B + 'M05_1_story.png',
            puzzleImg: B + 'M05_2_rip_current.png',
            postStoryImg: B + 'M05_3_reward_card.png',
            totemImg: B + 'M05_3_reward_card.png'
        },
        6: {
            storyImg: [B + 'M06_1_story.png'],
            landmarkImg: B + 'M06_1_story.png',
            puzzleImg: B + 'M06_2_decision.png',
            postStoryImg: B + 'M06_3_reward_card.png',
            totemImg: B + 'M06_3_reward_card.png'
        },
        7: {
            storyImg: [B + 'M07_1_story.png'],
            landmarkImg: B + 'M07_2_final_puzzle.png',
            puzzleImg: B + 'M07_2_final_puzzle.png',
            postStoryImg: B + 'M07_3_normal_ending.png',
            totemImg: B + 'M07_4_best_ending.png'
        }
    };

    const sideImages = {
        101: C + 'side_01_wangchuan_stamp.png',
        102: C + 'side_02_three_chimneys_stamp.png',
        103: C + 'side_03_tide_stamp.png',
        104: C + 'side_04_team_stamp.png'
    };

    DEFAULT_PUZZLES.forEach(puzzle => {
        if (!puzzle || !puzzle.id) return;
        if (mainImages[puzzle.id]) {
            Object.assign(puzzle, mainImages[puzzle.id]);
        }
        if (sideImages[puzzle.id]) {
            puzzle.storyImg = [sideImages[puzzle.id]];
            puzzle.landmarkImg = sideImages[puzzle.id];
            puzzle.puzzleImg = sideImages[puzzle.id];
            puzzle.postStoryImg = sideImages[puzzle.id];
            puzzle.totemImg = sideImages[puzzle.id];
        }
    });
}

attachShouchaoImageAssets();

const EDUCATION_CONFIG = Object.assign({}, DEFAULT_CONFIG, {
    "bgUrl": "assets/shouchao_edu/A_opening/EDU_A04_cover.png",
    "logoUrl": "assets/shouchao_edu/A_opening/EDU_A06_logo.png",
    "bgMusicUrl": "",
    "regLogoUrl": "assets/shouchao_edu/A_opening/EDU_A06_logo.png",
    "regTitle": "守潮學院：海岸安全任務",
    "regSubtitle": "海岸安全教育版報名",
    "regDesc": "這是一場以外木山海岸為場域的安全教育實境解謎。你將學習讀懂告示、潮汐、地標與地方文化，完成安全回家的判斷。",
    "regSafetyAgreementText": "我已理解本活動為戶外海岸安全教育任務，會遵守現場告示、工作人員引導與安全界線。",
    "regWeatherAgreementText": "我同意若遇天候、潮汐、海象或現場安全疑慮，活動可調整、延期或取消。",
    "regTeamTypeOptions": "守潮觀察隊：擅長看現場\n安全判斷隊：擅長做決策\n文化導覽隊：擅長找地方故事\n任務協作隊：擅長分工合作",
    "regTeamNameLabel": "隊伍名稱",
    "regTeamNamePlaceholder": "例如：潮汐偵探隊",
    "regLeaderNameLabel": "主要聯絡人",
    "regLeaderNamePlaceholder": "請填寫主要聯絡人",
    "regMemberCountLabel": "隊伍人數",
    "regMemberCountMin": 6,
    "regMemberCountMax": 99,
    "regMemberCountDefault": 6,
    "regPhoneLabel": "聯絡電話",
    "regPhonePlaceholder": "請填寫可聯絡的電話",
    "regEmailLabel": "Email 信箱",
    "regEmailPlaceholder": "請填寫接收通知的 Email",
    "regSessionDateLabel": "參加日期",
    "regSessionTimeLabel": "參加場次",
    "regSessionTimePlaceholder": "請選擇場次",
    "regSessionTimeOptions": "上午場 09:30\n下午場 14:00\n自訂場次 / 待工作人員確認",
    "regTeamTypeLabel": "隊伍類型",
    "regTeamTypePlaceholder": "請選擇隊伍類型",
    "regEmergencyNameLabel": "緊急聯絡人",
    "regEmergencyNamePlaceholder": "非本隊同行者尤佳",
    "regEmergencyPhoneLabel": "緊急聯絡電話",
    "regEmergencyPhonePlaceholder": "活動中可聯絡電話",
    "regChildrenLabel": "兒童或特殊需求",
    "regNoChildrenOption": "隊伍中沒有 12 歲以下兒童",
    "regHasChildrenOption": "隊伍中有 12 歲以下兒童",
    "regSpecialNeedsPlaceholder": "若有特殊需求請填寫，沒有可留空。",
    "regSubmitButtonText": "送出報名資料",
    "regBank": "",
    "titleTop": "守潮學院",
    "titleMain": "海岸安全任務",
    "titleSub": "海岸安全 x 地方文化 x 實境解謎",
    "titleCredit": "外木山海岸安全教育行動",
    "adminPassword": "",
    "youtubeUrl": "",
    "navArchiveText": "學習印記",
    "overlayArchiveTitle": "守潮學習紀錄",
    "overlayArchiveDesc": "查看你已取得的安全卡與文化印記。",
    "overlayArchiveCloseBtn": "關閉",
    "overlaySettingsTitle": "航程設定",
    "overlaySettingsDesc": "如果你想重新走一次守潮航程，可以在這裡重置進度。",
    "overlaySettingsResetBtn": "重置任務進度",
    "navSettingsText": "設定",
    "successTitle": "普通結局：你完成了安全回家路線",
    "successStory": "最後的安全地圖完成了。\n\n你已經學會辨認外木山的地標、理解王船文化與地方信仰，也知道靠近海岸以前，要先看告示、查天候、讀潮汐、判斷風險。\n\n你完成主要課題，取得安全回家的方法。\n\n不過，學院的紀錄板上還有幾枚支線印記尚未亮起。那代表你還可以再多理解一點地方故事，多練習一點安全判斷。\n\n你是一名合格的守潮學員。下一次靠近海以前，請記得先問自己：今天的海，適合我靠近嗎？",
    "summaryTitle": "守潮學院任務紀錄",
    "summaryStory": "你完成外木山海岸安全任務，從地方文化、地標辨識、告示判讀、潮汐觀察、風險判斷到最後的安全物件配置，建立了一套可以帶著走的海岸安全流程。",
    "prologuePages": [
        {
            "title": "開學任務：海岸不是遊樂場",
            "text": "你收到守潮學院的入學通知。\n\n通知上沒有課表，只有一張外木山海岸地圖。地圖邊緣寫著：「海岸可以親近，但不能輕忽。」\n\n今天，你不是來挑戰海，而是來學會怎麼安全地接近海。",
            "image": "assets/shouchao_edu/A_opening/EDU_A01_academy_gate.png"
        },
        {
            "title": "地方記憶：外木山的提醒",
            "text": "外木山有漁港、有協安宮王船文化，也有遠方看得見的協和電廠煙囪。這些不是背景，而是辨認地方、理解海岸生活的重要線索。\n\n守潮學院第一條規則是：先認識地方，再開始任務。",
            "image": "assets/shouchao_edu/A_opening/EDU_A02_local_memory.png"
        },
        {
            "title": "安全任務：把危險停在岸上",
            "text": "你要完成七段主線課題與四個支線練習。完成支線不是為了加分，而是讓你看見安全判斷背後的地方智慧。\n\n準備好了，就打開你的守潮任務本。",
            "image": "assets/shouchao_edu/A_opening/EDU_A03_safety_mission_book.png"
        }
    ],
    "endingPerfectTitle": "完美結局：守潮學院認證",
    "endingPerfectStory": "最後的地圖亮起來了。\n\n你不只完成主要安全流程，也找回四枚支線印記：王船平安、三柱香地標、潮汐時間、同行提醒。\n\n守潮學院的紀錄板浮出一行字：「安全不是禁止冒險，而是讓每一次靠近海，都有回家的能力。」\n\n你明白，地方文化不是課本裡的段落，海岸安全也不是口號。王船提醒人敬海，地標幫人定位，潮汐告訴人路會改變，同伴讓人不只靠自己判斷。\n\n你完成守潮學院認證，成為能把安全帶回隊伍的人。",
    "regBgUrl": "assets/shouchao_edu/A_opening/EDU_A05_register_bg.png",
    "successImg": "assets/shouchao_edu/D_reward/EDU_R01_normal_ending.png",
    "endingPerfectImg": "assets/shouchao_edu/D_reward/EDU_R02_perfect_ending.png"
});

const EDUCATION_PUZZLES = [
    {
        "id": 1,
        "questType": "main",
        "chapter": "第一課",
        "name": "王船不是出發令",
        "stars": 1,
        "radar": [
            2,
            2,
            3,
            4,
            2,
            3
        ],
        "story": [
            "你抵達外木山漁港，守潮任務本的第一頁亮起。",
            "協安宮王船文化提醒漁民祈求平安，也提醒人們：面對海以前，要先懂得敬海。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M01_wangchuan_safety.png",
            "assets/shouchao_edu/generated/EDU_GEN_M01_wangchuan_safety.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M01_wangchuan_safety.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M01_wangchuan_safety.png",
        "landmarkText": "你看見港邊與王船文化的線索。這一題要確認你是否理解「敬海」不是迷信，而是安全態度。",
        "landmarkBtnText": "開始判讀",
        "puzzleType": "choice",
        "puzzleDesc": "王船巡港對海岸安全任務最重要的提醒是什麼？",
        "puzzleOptions": [
            "A. 有拜拜就可以放心下水",
            "B. 靠近海以前，要先尊重海、確認風險",
            "C. 只要人多就可以去任何地方",
            "D. 海看起來平靜就代表安全"
        ],
        "answer": "B",
        "answers": [
            "B"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "送出判斷",
        "errorMsg": "再想想。王船文化提醒的是平安與敬海，不是讓人忽略風險。",
        "postStory": "你寫下第一條守潮規則：敬海不是害怕，而是先承認海有自己的規律。\n\n任務本多了一行提醒：\n靠近海以前，別只問「好不好玩」，先問「今天適不適合靠近」。看告示、查海象、確認範圍，才是真的把平安帶在身上。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD01_respect_sea.png",
        "totemDesc": "安全卡：敬海\n\n這張卡提醒你：海不會因為你很期待就變安全。先確認規範、海象與活動範圍，再靠近。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD01_respect_sea.png"
    },
    {
        "id": 2,
        "questType": "main",
        "chapter": "第二課",
        "name": "三柱香定位法",
        "dependsOn": 1,
        "stars": 1,
        "radar": [
            3,
            3,
            2,
            2,
            3,
            2
        ],
        "story": [
            "你沿著海岸往前走，遠方高聳的煙囪像地圖上的記號。",
            "協和電廠的煙囪被稱為基隆三柱香。對外地人來說，它是醒目的地標；對任務來說，它提醒你要知道自己站在哪裡。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M02_chimneys_location.png",
            "assets/shouchao_edu/generated/EDU_GEN_M02_chimneys_location.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M02_chimneys_location.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M02_chimneys_location.png",
        "landmarkText": "認得地標，才能向同伴與救援者說清楚位置。",
        "landmarkBtnText": "辨認地標",
        "puzzleType": "choice",
        "puzzleDesc": "在海岸活動中，認得「三柱香」這類大型地標最實用的安全功能是什麼？",
        "puzzleOptions": [
            "A. 當成拍照背景就好",
            "B. 幫助定位、集合與回報位置",
            "C. 可以判斷海水深度",
            "D. 可以取代天氣預報"
        ],
        "answer": "B",
        "answers": [
            "B"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "送出判斷",
        "errorMsg": "地標最大的安全價值，是幫助你知道自己在哪裡。",
        "postStory": "你在任務本上標出三柱香。地圖線條變得更清楚：定位，是安全回家的第一步。\n\n任務本多了一行提醒：\n如果真的需要求助，「我在海邊」不夠清楚。先記住集合點、回程路線和看得見的大地標，隊伍才不容易散掉。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD02_location.png",
        "totemDesc": "安全卡：定位\n\n這張卡提醒你：先記住集合點、回程路線和大地標。說得出位置，才找得到回家的路。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD02_location.png"
    },
    {
        "id": 3,
        "questType": "main",
        "chapter": "第三課",
        "name": "告示上的紅線",
        "dependsOn": 2,
        "stars": 2,
        "radar": [
            2,
            3,
            4,
            4,
            3,
            2
        ],
        "story": [
            "海岸邊出現告示牌。有人說只是提醒，不一定要管。",
            "守潮學院要求你把告示讀完，因為許多事故不是不知道海危險，而是明明看見提醒卻選擇忽略。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M03_warning_stop.png",
            "assets/shouchao_edu/generated/EDU_GEN_M03_warning_stop.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M03_warning_stop.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M03_warning_stop.png",
        "landmarkText": "請找出告示中最核心的安全概念，輸入關鍵詞。",
        "landmarkBtnText": "輸入關鍵詞",
        "puzzleType": "text",
        "puzzleDesc": "當現場告示標明禁止進入或危險區域時，你應該做出的安全行動是什麼？請輸入兩個字。",
        "puzzleOptions": [],
        "answer": "停下",
        "answers": [
            "停下",
            "停止",
            "不進入"
        ],
        "inputPlaceholder": "請輸入安全行動",
        "submitBtnText": "送出",
        "errorMsg": "告示不是裝飾。若已標明危險，最重要的是先停下。",
        "postStory": "你把「停下」寫進任務本。安全不是少玩一點，而是讓大家都能回家。\n\n任務本多了一行提醒：\n告示牌不是背景，也不是給別人看的。看到禁止進入、危險區域或封鎖線，就停下來，換一條安全的路。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD03_warning.png",
        "totemDesc": "安全卡：看告示\n\n這張卡提醒你：告示牌已經先替你看見風險。看到了，就不要硬闖。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD03_warning.png"
    },
    {
        "id": 4,
        "questType": "main",
        "chapter": "第四課",
        "name": "潮汐圖判讀",
        "dependsOn": 3,
        "stars": 2,
        "radar": [
            4,
            3,
            3,
            5,
            4,
            3
        ],
        "story": [
            "你走到潮間帶附近，任務本跳出一張潮汐圖。",
            "同一條路，退潮時可能看得見，漲潮時可能消失。守潮學院要求你用資料判斷，而不是只相信眼前。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M04_tide_chart.png",
            "assets/shouchao_edu/generated/EDU_GEN_M04_tide_chart.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M04_tide_chart.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M04_tide_chart.png",
        "landmarkText": "請觀察時間、水位與潮況，選出較安全的觀察時段。",
        "landmarkBtnText": "查看潮汐圖",
        "puzzleType": "tide",
        "tidePoints": [
            {
                "key": "A",
                "time": "09:00",
                "level": 125,
                "state": "漲潮"
            },
            {
                "key": "B",
                "time": "11:30",
                "level": 70,
                "state": "退潮"
            },
            {
                "key": "C",
                "time": "13:30",
                "level": 30,
                "state": "乾潮"
            },
            {
                "key": "D",
                "time": "16:30",
                "level": 95,
                "state": "漲潮"
            }
        ],
        "puzzleDesc": "若只進行岸上觀察與潮間帶邊緣導覽，哪一個時段相對適合安排？",
        "puzzleOptions": [
            "A. 09:00 漲潮 / 水位 125",
            "B. 11:30 退潮 / 水位 70",
            "C. 13:30 乾潮 / 水位 30",
            "D. 16:30 漲潮 / 水位 95"
        ],
        "answer": "C",
        "answers": [
            "C"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "送出判斷",
        "errorMsg": "潮汐會改變路線。請找出水位最低、最適合岸上觀察的時段。",
        "postStory": "你沒有只看浪，而是查了潮汐。地圖上的水線慢慢退開，露出可以安全觀察的距離。\n\n任務本多了一行提醒：\n退潮時看得見的路，漲潮後可能就不見了。出發前看潮汐，到了現場也要一直看水線有沒有變。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD04_tide.png",
        "totemDesc": "安全卡：讀潮\n\n這張卡提醒你：海岸的路會跟著潮汐改變。別只相信眼前，也要看時間。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD04_tide.png"
    },
    {
        "id": 5,
        "questType": "main",
        "chapter": "第五課",
        "name": "九宮格風險判讀",
        "dependsOn": 4,
        "stars": 3,
        "radar": [
            5,
            4,
            4,
            4,
            5,
            3
        ],
        "story": [
            "照片上的海面看起來平靜，但守潮學院提醒你：危險不一定會大聲出現。",
            "請點出畫面中疑似危險水流或不可接近區域。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M05_rip_current_grid_v4.png",
            "assets/shouchao_edu/generated/EDU_GEN_M05_rip_current_grid_v4.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M05_rip_current_grid_v4.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M05_rip_current_grid_v4.png",
        "landmarkText": "九宮格題會把圖片切成 3x3。請點選風險區塊，系統會用格號加總判斷答案。",
        "landmarkBtnText": "開始判讀",
        "puzzleType": "grid",
        "puzzleDesc": "請點選中間直線疑似離岸流或回流通道的三個格子。",
        "puzzleOptions": [],
        "gridCorrectCells": [
            2,
            5,
            8
        ],
        "answer": "15",
        "answers": [
            "15"
        ],
        "inputPlaceholder": "點選格子後自動加總",
        "submitBtnText": "送出九宮格判讀",
        "errorMsg": "再觀察一次。這題要找的是中間疑似把水往外帶的連續通道。",
        "postStory": "你沒有被平靜表面騙走。守潮任務本記下：看起來空、平、深的水道，也可能是離岸流線索。\n\n任務本多了一行提醒：\n有些危險看起來很安靜。顏色較深、浪花較少、漂浮物往外跑的地方，不要下水試，先離遠一點。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD05_current.png",
        "totemDesc": "安全卡：辨流\n\n這張卡提醒你：平靜不等於安全。疑似離岸流的地方，不靠近、不測試。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD05_current.png"
    },
    {
        "id": 6,
        "questType": "main",
        "chapter": "第六課",
        "name": "出發前安全排序",
        "dependsOn": 5,
        "stars": 3,
        "radar": [
            4,
            5,
            4,
            5,
            4,
            5
        ],
        "story": [
            "你已經學會看文化、看地標、看告示、看潮汐與看海面。",
            "現在，請把出發前應該完成的安全流程排成正確順序。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M06_safety_sequence.png",
            "assets/shouchao_edu/generated/EDU_GEN_M06_safety_sequence.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M06_safety_sequence.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M06_safety_sequence.png",
        "landmarkText": "這是一題排序題。請把流程拖曳成安全出發前的正確順序。",
        "landmarkBtnText": "開始排序",
        "puzzleType": "sort",
        "puzzleDesc": "請排序：外木山海岸安全活動出發前，應該先做什麼，再做什麼？",
        "puzzleOptions": [
            "只在安全界線內活動",
            "確認隊伍人數與緊急聯絡",
            "確認天氣、海象與潮汐",
            "條件不對時取消或延期",
            "確認集合點、地標與回程路線",
            "閱讀現場告示與禁制範圍"
        ],
        "answer": "確認天氣、海象與潮汐,閱讀現場告示與禁制範圍,確認集合點、地標與回程路線,確認隊伍人數與緊急聯絡,只在安全界線內活動,條件不對時取消或延期",
        "answers": [
            "確認天氣、海象與潮汐,閱讀現場告示與禁制範圍,確認集合點、地標與回程路線,確認隊伍人數與緊急聯絡,只在安全界線內活動,條件不對時取消或延期"
        ],
        "hints": [
            "先不要急著排細節。把六張卡分成三類：出發前查資料、到現場確認、隊伍開始行動後要遵守的事。",
            "安全流程通常先看「環境能不能去」，再看「現場允不允許」，接著才安排人、路線與行動。",
            "最後一張不是出發，而是保留煞車。當條件不對時，真正安全的流程會把「取消或延期」放在最後的決定點。"
        ],
        "inputPlaceholder": "",
        "submitBtnText": "送出排序",
        "errorMsg": "順序還不夠安全。出發前要先查資料與界線，再確認人員與行動。",
        "postStory": "你把流程排好，任務本亮起第六枚安全卡：安全不是最後提醒，而是一開始就要做的準備。\n\n任務本多了一行提醒：\n先查資料、看告示、確認路線、點清隊伍，再決定要不要出發。條件不對就改天，這不是掃興，是守住回家的路。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD06_sequence.png",
        "totemDesc": "安全卡：安全流程\n\n這張卡提醒你：先準備，再出發。條件不對，改天就是最好的答案。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD06_sequence.png"
    },
    {
        "id": 7,
        "questType": "main",
        "isFinal": true,
        "chapter": "最終測驗",
        "name": "沙灘旗色判斷",
        "dependsOn": 6,
        "stars": 5,
        "radar": [
            5,
            5,
            5,
            5,
            5,
            5
        ],
        "story": [
            "你們終於來到沙灘。有人已經脫鞋準備衝向海邊，守潮學院卻先把任務本闔上。",
            "下水前的最後一題不是地圖，而是抬頭看旗子。旗色會告訴你現在能不能靠近海，以及應該在哪裡活動。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_M07_flag_judgment.png",
            "assets/shouchao_edu/generated/EDU_GEN_M07_flag_judgment.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_M07_flag_judgment.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_M07_flag_judgment.png",
        "landmarkText": "來到沙灘後，準備下水以前，先看現場旗幟顏色與救生員守望範圍。",
        "landmarkBtnText": "觀察旗色",
        "puzzleType": "choice",
        "puzzleDesc": "來到沙灘準備下水前，先看現場旗色。依照紅、黃、綠、紅黃旗的安全意義，哪一個判斷最適合？",
        "puzzleOptions": [
            "A. 上紅下黃的四角旗，且只在兩支旗之間活動",
            "B. 紅色三角旗，代表水域關閉但可以快速玩一下",
            "C. 黃色三角旗，代表水況不佳但不用特別注意",
            "D. 沒看到旗子時，海面平靜就可以自行下水"
        ],
        "answer": "A",
        "answers": [
            "A"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "送出旗色判斷",
        "errorMsg": "下水前要先看旗色。紅旗禁止下水；黃旗要特別注意；沒有旗子或沒有救生員，不代表安全。",
        "postStory": "你先看旗子，再決定行動。隊伍停在岸上確認範圍，沒有把「想玩」放在「安全」前面。\n\n任務本多了一行提醒：\n紅黃旗之間，是救生員守望的游泳範圍；紅旗是危險禁止下水；黃旗表示水況不佳要特別注意；綠旗才代表適宜游泳。下水前，先看旗，也先看有沒有救生員。",
        "postStoryImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD07_map.png",
        "totemDesc": "最終測驗：先看旗色\n\n這張卡提醒你：到沙灘不是先下水，是先看旗子、看救生員、看自己是否在安全範圍內。",
        "totemImg": "assets/shouchao_edu/E_reward_cards/EDU_RWD07_map.png"
    },
    {
        "id": 101,
        "questType": "side",
        "chapter": "支線印記",
        "name": "王船平安印",
        "dependsOn": 1,
        "stars": 2,
        "radar": [
            2,
            2,
            3,
            4,
            2,
            3
        ],
        "story": [
            "你在港邊找到一枚王船印記。它不是要求人冒險，而是提醒人祈求平安也要落實行動。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_S01_wangchuan_stamp.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_S01_wangchuan_stamp.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_S01_wangchuan_stamp.png",
        "landmarkText": "支線任務：理解王船文化與海岸安全的連結。",
        "landmarkBtnText": "解開印記",
        "puzzleType": "choice",
        "puzzleDesc": "哪一個行動最符合「祈求平安，也要落實安全」？",
        "puzzleOptions": [
            "A. 出發前確認天氣與海象",
            "B. 只要有祈福就不看告示",
            "C. 趁沒人注意越過護欄",
            "D. 拍完照就離開隊伍"
        ],
        "answer": "A",
        "answers": [
            "A"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "取得印記",
        "errorMsg": "平安不是只靠願望，也要靠正確行動。",
        "postStory": "王船平安印亮起。你理解了地方信仰背後的安全提醒。\n\n印記背面浮出一行字：\n平安不是一句祝福就結束。把風險看清楚、把界線守住，才是把平安真的帶回隊伍。",
        "postStoryImg": "assets/shouchao_edu/generated/EDU_GEN_S01_wangchuan_stamp.png",
        "totemDesc": "支線印記：王船平安\n\n這枚印記提醒你：祈求平安，也要用行動守住平安。",
        "totemImg": "assets/shouchao_edu/generated/EDU_GEN_S01_wangchuan_stamp.png"
    },
    {
        "id": 102,
        "questType": "side",
        "chapter": "支線印記",
        "name": "協和冰棒小調查",
        "dependsOn": 2,
        "stars": 2,
        "radar": [
            3,
            3,
            2,
            2,
            3,
            2
        ],
        "story": [
            "你在三柱香附近聽到有人提起「協和冰棒」。這不是普通伴手禮，而是一段從電廠工作環境長出來的地方記憶。",
            "守潮學院把這題改成小調查：電廠為什麼會和冰棒連在一起？"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png",
            "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png",
        "landmarkText": "支線任務：讀懂協和冰棒的由來，選出最接近地方故事的說法。",
        "landmarkBtnText": "調查協和冰棒",
        "puzzleType": "choice",
        "puzzleDesc": "依照台電電業文物典藏的介紹，協和電廠冰棒最合理的由來是什麼？",
        "puzzleOptions": [
            "A. 電廠退役後才設計的觀光紀念品，與員工生活無關",
            "B. 員工在高溫環境工作，福利社供應消暑冰品，後來成為地方記憶與特色美食",
            "C. 因為海邊遊客太多，政府要求電廠販售冰棒",
            "D. 協和電廠原本是製冰工廠，所以自然生產冰棒"
        ],
        "answer": "B",
        "answers": [
            "B"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "取得印記",
        "errorMsg": "再想想。協和冰棒不是先為觀光打造，而是和電廠職工福利、工作環境與餘電製冰有關。",
        "postStory": "協和冰棒印亮起。你知道三柱香不只是遠方地標，也連著電廠員工的日常。\n\n印記背面浮出一行字：\n地方故事有時不在紀念碑上，而在一支冰棒裡。早期電廠福委會把冰品作為員工福利，口碑慢慢傳出去，才讓協和冰棒成為外木山一帶被人記住的味道。",
        "postStoryImg": "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png",
        "totemDesc": "支線印記：協和冰棒\n\n這枚印記提醒你：地方記憶不只有地標，也有工作、生活與味道。",
        "totemImg": "assets/shouchao_edu/generated/EDU_GEN_S02_hsiehho_icepop.png"
    },
    {
        "id": 103,
        "questType": "side",
        "chapter": "支線印記",
        "name": "潮汐提醒排序",
        "dependsOn": 4,
        "stars": 2,
        "radar": [
            4,
            3,
            3,
            5,
            4,
            3
        ],
        "story": [
            "你在任務本夾層找到一張潮汐提醒卡。它要求你把「查資料到現場判斷」排成正確順序。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_S03_tide_sequence.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_S03_tide_sequence.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_S03_tide_sequence.png",
        "landmarkText": "這是一題支線排序題。完成後可取得潮汐印記。",
        "landmarkBtnText": "開始排序",
        "puzzleType": "sort",
        "puzzleDesc": "請排序：安排海岸活動前，潮汐安全判斷流程應該怎麼做？",
        "puzzleOptions": [
            "抵達現場後再次觀察浪況",
            "若條件改變就調整或取消",
            "查詢官方潮汐與天氣資料",
            "確認活動時段是否接近漲潮"
        ],
        "answer": "查詢官方潮汐與天氣資料,確認活動時段是否接近漲潮,抵達現場後再次觀察浪況,若條件改變就調整或取消",
        "answers": [
            "查詢官方潮汐與天氣資料,確認活動時段是否接近漲潮,抵達現場後再次觀察浪況,若條件改變就調整或取消"
        ],
        "inputPlaceholder": "",
        "submitBtnText": "取得印記",
        "errorMsg": "順序還不對。要先查資料，再到現場確認，最後保留調整彈性。",
        "postStory": "潮汐時間印亮起。你知道資料不是出發前看一次就好，現場也要重新確認。\n\n印記背面浮出一行字：\n潮汐表先告訴你時間，現場再告訴你能不能走。風浪變了、人累了、路濕了，就要跟著改變計畫。",
        "postStoryImg": "assets/shouchao_edu/generated/EDU_GEN_S03_tide_sequence.png",
        "totemDesc": "支線印記：潮汐時間\n\n這枚印記提醒你：先看潮汐表，再看現場。兩個都安全，才繼續走。",
        "totemImg": "assets/shouchao_edu/generated/EDU_GEN_S03_tide_sequence.png"
    },
    {
        "id": 104,
        "questType": "side",
        "chapter": "支線印記",
        "name": "同行者提醒",
        "dependsOn": 6,
        "stars": 2,
        "radar": [
            3,
            5,
            4,
            4,
            4,
            5
        ],
        "story": [
            "最後一枚支線印記藏在隊伍約定裡。守潮學院提醒你，安全不是一個人的判斷。"
        ],
        "storyImg": [
            "assets/shouchao_edu/generated/EDU_GEN_S04_team_reminder.png"
        ],
        "landmarkImg": "assets/shouchao_edu/generated/EDU_GEN_S04_team_reminder.png",
        "puzzleImg": "assets/shouchao_edu/generated/EDU_GEN_S04_team_reminder.png",
        "landmarkText": "支線任務：選出最安全的同行者行動。",
        "landmarkBtnText": "解開印記",
        "puzzleType": "choice",
        "puzzleDesc": "隊伍中有人想越過安全線拍照，你最應該怎麼做？",
        "puzzleOptions": [
            "A. 幫他拍快一點",
            "B. 假裝沒看到",
            "C. 立即提醒並請他回到安全線內",
            "D. 讓他自己承擔風險"
        ],
        "answer": "C",
        "answers": [
            "C"
        ],
        "inputPlaceholder": "請選擇 A/B/C/D",
        "submitBtnText": "取得印記",
        "errorMsg": "同行者的安全需要互相提醒，不是放任彼此冒險。",
        "postStory": "同行提醒印亮起。你完成了守潮學院最重要的一課：安全要一起完成。\n\n印記背面浮出一行字：\n看到同伴越線，不是笑一下就好；有人落單，也不是等一下就好。喊住、點名、一起回來，才是真的同一隊。",
        "postStoryImg": "assets/shouchao_edu/generated/EDU_GEN_S04_team_reminder.png",
        "totemDesc": "支線印記：同行提醒\n\n這枚印記提醒你：同隊不是一起出發而已，也要一起安全回來。",
        "totemImg": "assets/shouchao_edu/generated/EDU_GEN_S04_team_reminder.png"
    }
];


const DullesData = {
    _initialized: false,
    _syncPromise: null,
    _puzzleRevision: 0,

    // 偵測目前是否運行於 Express 後端伺服器 (若主機名不為空，且不為 file://)
    isServerMode() {
        return typeof window !== 'undefined' && 
               window.location.protocol.startsWith('http') && 
               !window.location.hostname.includes('github.io'); // GitHub Pages 降級至 LocalStorage
    },

    // 取得伺服器主機網址
    getServerUrl() {
        return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
    },

    // 取得當前的遊戲代碼
    getSlug() {
        return getGameSlug();
    },

    getAdminSession() {
        try {
            const raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('dulles_admin_session') : null)
                || safeStorage.getItem('dulles_admin_session');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    getAdminToken() {
        const session = this.getAdminSession();
        return session && session.token ? session.token : '';
    },

    authHeaders(extra = {}) {
        const headers = Object.assign({}, extra);
        const token = this.getAdminToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    },

    async loginAdmin(password, username = '') {
        if (this.isServerMode()) {
            const res = await fetch(`${this.getServerUrl()}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (!res.ok) return null;
            const data = await res.json();
            const session = {
                username: data.user.username,
                role: data.user.role,
                token: data.token,
                expiresAt: data.expiresAt
            };
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('dulles_admin_session', JSON.stringify(session));
            }
            safeStorage.setItem('dulles_admin_session', JSON.stringify(session));
            safeStorage.setItem('dulles_admin_authed', 'true');
            return session;
        }

        const config = this.getConfig() || {};
        const correctPass = config.adminPassword || '';
        if (password && correctPass && password === correctPass) {
            const session = { username: 'offline-admin', role: 'superadmin' };
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('dulles_admin_session', JSON.stringify(session));
            }
            safeStorage.setItem('dulles_admin_session', JSON.stringify(session));
            safeStorage.setItem('dulles_admin_authed', 'true');
            return session;
        }
        return null;
    },

    async logoutAdmin() {
        if (this.isServerMode() && this.getAdminToken()) {
            try {
                await fetch(`${this.getServerUrl()}/api/admin/logout`, {
                    method: 'POST',
                    headers: this.authHeaders()
                });
            } catch (e) {
                console.warn('Server logout failed:', e);
            }
        }
        safeStorage.removeItem('dulles_admin_authed');
        safeStorage.removeItem('dulles_admin_session');
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('dulles_admin_session');
        }
    },

    // 初始化 LocalStorage 預設值 (單機/靜態模式備用)
    init() {
        if (this._initialized) return;
        this._initialized = true;

        Object.keys(STORAGE_KEYS).forEach(key => {
            if (!safeStorage.getItem(STORAGE_KEYS[key]) && safeStorage.getItem(LEGACY_STORAGE_KEYS[key])) {
                safeStorage.setItem(STORAGE_KEYS[key], safeStorage.getItem(LEGACY_STORAGE_KEYS[key]));
            }
        });
        const gamesV1 = safeStorage.getItem('dulles_platform_games_v1');
        const gamesV2 = safeStorage.getItem('dulles_platform_games_v2');
        if (gamesV1 || gamesV2) {
            try {
                const listV1 = gamesV1 ? JSON.parse(gamesV1) : [];
                const listV2 = gamesV2 ? JSON.parse(gamesV2) : [];
                const bySlug = new Map();
                [...(Array.isArray(listV2) ? listV2 : []), ...(Array.isArray(listV1) ? listV1 : [])].forEach(game => {
                    if (game && game.slug) bySlug.set(game.slug, Object.assign({}, bySlug.get(game.slug) || {}, game));
                });
                safeStorage.setItem('dulles_platform_games_v2', JSON.stringify(Array.from(bySlug.values())));
            } catch (e) {
                if (!gamesV2 && gamesV1) safeStorage.setItem('dulles_platform_games_v2', gamesV1);
            }
        }

        const safeOceanGame = {
            slug: 'safeocean',
            name: '守潮藏寶圖：外木山海岸安全航程',
            owner: 'halopataw',
            createdAt: Date.now()
        };
        const educationGame = {
            slug: 'shouchaoedu',
            name: '守潮學院：海岸安全任務',
            owner: 'halopataw',
            createdAt: Date.now()
        };
        let platformGames = [];
        try {
            platformGames = JSON.parse(safeStorage.getItem('dulles_platform_games_v2') || '[]');
        } catch (e) {
            platformGames = [];
        }
        if (!Array.isArray(platformGames)) platformGames = [];
        [safeOceanGame, educationGame].forEach(seedGame => {
            if (!platformGames.some(game => game && game.slug === seedGame.slug)) {
                platformGames.push(seedGame);
            } else {
                platformGames = platformGames.map(game => game && game.slug === seedGame.slug ? Object.assign({}, game, { name: seedGame.name }) : game);
            }
        });
        safeStorage.setItem('dulles_platform_games_v2', JSON.stringify(platformGames));

        const safeOceanSeedKey = 'game_safeocean_seed_version';
        if (safeStorage.getItem(safeOceanSeedKey) !== 'shouchao-v6-images') {
            try {
                const savedConfigRaw = safeStorage.getItem('game_safeocean_config_v2');
                const savedConfig = savedConfigRaw ? JSON.parse(savedConfigRaw) : {};
                safeStorage.setItem('game_safeocean_config_v2', JSON.stringify(Object.assign({}, DEFAULT_CONFIG, savedConfig)));
            } catch (e) {
                safeStorage.setItem('game_safeocean_config_v2', JSON.stringify(DEFAULT_CONFIG));
            }

            try {
                const savedPuzzlesRaw = safeStorage.getItem('game_safeocean_puzzles_v2');
                const savedPuzzles = savedPuzzlesRaw ? JSON.parse(savedPuzzlesRaw) : [];
                if (Array.isArray(savedPuzzles) && savedPuzzles.length) {
                    const defaultsById = new Map(DEFAULT_PUZZLES.map(p => [p.id, p]));
                    const savedIds = new Set(savedPuzzles.map(p => p && p.id));
                    const mergedPuzzles = savedPuzzles.map(p => Object.assign({}, defaultsById.get(p.id) || {}, p));
                    DEFAULT_PUZZLES.forEach(p => {
                        if (!savedIds.has(p.id)) mergedPuzzles.push(p);
                    });
                    safeStorage.setItem('game_safeocean_puzzles_v2', JSON.stringify(mergedPuzzles));
                } else {
                    safeStorage.setItem('game_safeocean_puzzles_v2', JSON.stringify(DEFAULT_PUZZLES));
                }
            } catch (e) {
                safeStorage.setItem('game_safeocean_puzzles_v2', JSON.stringify(DEFAULT_PUZZLES));
            }

            if (!safeStorage.getItem('game_safeocean_players_v2')) {
                safeStorage.setItem('game_safeocean_players_v2', JSON.stringify([]));
            }
            safeStorage.setItem(safeOceanSeedKey, 'shouchao-v6-images');
        }

        const educationSeedKey = 'game_shouchaoedu_seed_version';
        if (safeStorage.getItem(educationSeedKey) !== 'shouchao-academy-v10-realistic-rip-current') {
            // A bundled content version is only a first-run seed. Existing admin
            // edits must never be replaced merely because a new app is deployed.
            if (!safeStorage.getItem('game_shouchaoedu_config_v2')) {
                safeStorage.setItem('game_shouchaoedu_config_v2', JSON.stringify(EDUCATION_CONFIG));
            }
            if (!safeStorage.getItem('game_shouchaoedu_puzzles_v2')) {
                safeStorage.setItem('game_shouchaoedu_puzzles_v2', JSON.stringify(EDUCATION_PUZZLES));
            }
            if (!safeStorage.getItem('game_shouchaoedu_players_v2')) {
                safeStorage.setItem('game_shouchaoedu_players_v2', JSON.stringify([]));
            }
            safeStorage.setItem(educationSeedKey, 'shouchao-academy-v10-realistic-rip-current');
        }

        if (!safeStorage.getItem(STORAGE_KEYS.CONFIG)) {
            safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(getSeedConfigForSlug()));
        }
        if (!safeStorage.getItem(STORAGE_KEYS.PUZZLES)) {
            safeStorage.setItem(STORAGE_KEYS.PUZZLES, JSON.stringify(getSeedPuzzlesForSlug()));
        }
        if (!safeStorage.getItem(STORAGE_KEYS.PLAYERS)) {
            safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify([]));
        }
        
        // 初始化平台遊戲列表
        if (!safeStorage.getItem('dulles_platform_games_v2')) {
            safeStorage.setItem('dulles_platform_games_v2', JSON.stringify([
                { slug: 'default', name: '絕對傳奇:杜勒日記', createdAt: Date.now() }
            ]));
        }

        // 💡 如果在伺服器模式，在背景非同步與伺服器進行同步校準！
        if (this.isServerMode()) {
            this.syncWithServer();
        }
    },

    // 與伺服器同步資料 (從伺服器拉取最新設定更新到 localStorage)
    async syncWithServer() {
        if (this._syncPromise) return this._syncPromise;

        const puzzleRevisionAtStart = this._puzzleRevision;
        const syncPromise = this._performServerSync(puzzleRevisionAtStart);
        this._syncPromise = syncPromise;
        try {
            return await syncPromise;
        } finally {
            if (this._syncPromise === syncPromise) this._syncPromise = null;
        }
    },

    async _performServerSync(puzzleRevisionAtStart) {
        try {
            const url = this.getServerUrl();
            const slug = this.getSlug();
            
            // 1. 同步全局遊戲列表
            const gamesRes = await fetch(`${url}/api/games`, { headers: this.authHeaders(), cache: 'no-store' });
            if (gamesRes.ok && gamesRes.headers.get('content-type') && gamesRes.headers.get('content-type').includes('application/json')) {
                const games = await gamesRes.json();
                if (Array.isArray(games)) {
                    safeStorage.setItem('dulles_platform_games_v2', JSON.stringify(games));
                }
            }

            // 2. 同步全站設定
            const configRes = await fetch(`${url}/api/${slug}/config`, { cache: 'no-store' });
            if (configRes.ok && configRes.headers.get('content-type') && configRes.headers.get('content-type').includes('application/json')) {
                const config = await configRes.json();
                safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
            }

            // 3. 同步關卡設定
            const puzzleRes = await fetch(`${url}/api/${slug}/puzzles`, { headers: this.authHeaders(), cache: 'no-store' });
            if (puzzleRes.ok && puzzleRes.headers.get('content-type') && puzzleRes.headers.get('content-type').includes('application/json')) {
                const puzzles = await puzzleRes.json();
                if (Array.isArray(puzzles) && puzzleRevisionAtStart === this._puzzleRevision) {
                    safeStorage.setItem(STORAGE_KEYS.PUZZLES, JSON.stringify(puzzles));
                }
            }

            // 4. 同步玩家日誌
            const playersRes = this.getAdminToken()
                ? await fetch(`${url}/api/${slug}/players`, { headers: this.authHeaders(), cache: 'no-store' })
                : null;
            if (playersRes && playersRes.ok && playersRes.headers.get('content-type') && playersRes.headers.get('content-type').includes('application/json')) {
                const players = await playersRes.json();
                if (Array.isArray(players)) {
                    safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
                }
            }
        } catch (e) {
            console.warn('Background sync with backend server failed, fallback to offline storage:', e);
        }
    },

    // 取得所有建立的遊戲列表
    getGames() {
        this.init();
        try {
            const gamesStr = safeStorage.getItem('dulles_platform_games_v2');
            return gamesStr ? JSON.parse(gamesStr) : [{ slug: 'safeocean', name: '守潮藏寶圖：外木山海岸安全航程', owner: 'halopataw', createdAt: Date.now() }];
        } catch (e) {
            return [{ slug: 'safeocean', name: '守潮藏寶圖：外木山海岸安全航程', owner: 'halopataw', createdAt: Date.now() }];
        }
    },

    // 儲存所有建立的遊戲列表
    saveGames(games) {
        safeStorage.setItem('dulles_platform_games_v2', JSON.stringify(games));
    },

    // 更新遊戲名稱
    updateGameName(slug, newName) {
        const games = this.getGames();
        const gameIndex = games.findIndex(g => g.slug === slug);
        if (gameIndex !== -1) {
            games[gameIndex].name = newName;
            this.saveGames(games);
            
            // 伺服器同步
            if (this.isServerMode()) {
                fetch(`${this.getServerUrl()}/api/games/${slug}/name`, {
                    method: 'PUT',
                    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ name: newName })
                }).catch(e => console.warn('Failed to sync game name update:', e));
            }
            return true;
        }
        return false;
    },

    // 創建全新的遊戲 (支援單機 LocalStorage 初始化與伺服器後台同步)
    async createGame(slug, name, templateSlug = '', owner = '') {
        const games = this.getGames();
        if (games.some(g => g.slug === slug)) {
            return false;
        }

        const currentSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('dulles_admin_session') : null;
        const sessionUser = currentSession ? JSON.parse(currentSession) : null;
        const finalOwner = owner || (sessionUser ? sessionUser.username : 'halopataw');

        if (this.isServerMode()) {
            const res = await fetch(`${this.getServerUrl()}/api/games`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ slug, name, templateSlug, owner: finalOwner })
            });
            if (res.status === 401) {
                await this.logoutAdmin();
                throw new Error('管理員登入已逾時，請重新登入後再建立遊戲。');
            }
            if (!res.ok) {
                throw new Error(`正式站建立遊戲失敗（${res.status}）。`);
            }
        }

        const newGame = {
            slug: slug,
            name: name,
            owner: finalOwner,
            createdAt: Date.now()
        };
        games.push(newGame);
        this.saveGames(games);

        // 離線單機模式 LocalStorage 資料複製與配置
        const targetKeys = {
            CONFIG: `game_${slug}_config_v2`,
            PUZZLES: `game_${slug}_puzzles_v2`,
            PLAYERS: `game_${slug}_players_v2`
        };

        let srcConfig = Object.assign({}, DEFAULT_CONFIG, {
            titleTop: '',
            titleMain: name,
            titleSub: '',
            titleCredit: '',
            youtubeUrl: '',
            bgUrl: '',
            logoUrl: '',
            bgMusicUrl: '',
            regLogoUrl: '',
            regTitle: name,
            regSubtitle: '',
            regDesc: '',
            prologuePages: []
        });
        let srcPuzzles = [];

        if (templateSlug) {
            srcConfig = DEFAULT_CONFIG;
            srcPuzzles = DEFAULT_PUZZLES;
            try {
                const cfg = safeStorage.getItem(`game_${templateSlug}_config_v2`);
                const pzl = safeStorage.getItem(`game_${templateSlug}_puzzles_v2`);
                if (cfg) srcConfig = JSON.parse(cfg);
                if (pzl) srcPuzzles = JSON.parse(pzl);
            } catch (e) {
                console.error("Cloning offline failed, using defaults:", e);
            }
        }

        safeStorage.setItem(targetKeys.CONFIG, JSON.stringify(JSON.parse(JSON.stringify(srcConfig))));
        safeStorage.setItem(targetKeys.PUZZLES, JSON.stringify(JSON.parse(JSON.stringify(srcPuzzles))));
        safeStorage.setItem(targetKeys.PLAYERS, JSON.stringify([]));

        return true;
    },

    // 刪除遊戲資料 (支援單機 LocalStorage 清理與伺服器後台同步)
    async deleteGame(slug) {
        if (slug === 'default') return false; // 預設核心遊戲受保護

        if (this.isServerMode()) {
            const res = await fetch(`${this.getServerUrl()}/api/games/${slug}`, {
                method: 'DELETE',
                headers: this.authHeaders()
            });
            if (res.status === 401) {
                await this.logoutAdmin();
                throw new Error('管理員登入已逾時，請重新登入後再刪除遊戲。');
            }
            if (!res.ok) {
                throw new Error(`正式站刪除遊戲失敗（${res.status}）。`);
            }
        }
        
        let games = this.getGames();
        games = games.filter(g => g.slug !== slug);
        this.saveGames(games);

        safeStorage.removeItem(`game_${slug}_config_v2`);
        safeStorage.removeItem(`game_${slug}_puzzles_v2`);
        safeStorage.removeItem(`game_${slug}_players_v2`);

        return true;
    },

    // 取得全站設定
    getConfig() {
        this.init();
        try {
            const seedConfig = getSeedConfigForSlug(this.getSlug());
            const configStr = safeStorage.getItem(STORAGE_KEYS.CONFIG);
            const savedConfig = configStr ? JSON.parse(configStr) : {};
            return withRequiredConfigText(Object.assign({}, seedConfig, savedConfig));
        } catch (e) {
            console.error('Failed to parse config from localStorage, falling back to default:', e);
            return withRequiredConfigText(Object.assign({}, getSeedConfigForSlug(this.getSlug())));
        }
    },

    // 儲存全站設定
    async saveConfig(config) {
        const seedConfig = getSeedConfigForSlug(this.getSlug());
        const mergedConfig = withRequiredConfigText(Object.assign({}, seedConfig, config || {}));

        if (this.isServerMode()) {
            const slug = this.getSlug();
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/config`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(mergedConfig)
            });
            if (res.status === 401) {
                await this.logoutAdmin();
                throw new Error('管理員登入已逾時，請重新登入後再儲存。');
            }
            if (!res.ok) {
                throw new Error(`正式站基本設定儲存失敗（${res.status}）。`);
            }

            const verifyRes = await fetch(`${this.getServerUrl()}/api/${slug}/config`, { cache: 'no-store' });
            if (!verifyRes.ok) {
                throw new Error(`正式站基本設定寫入後驗證失敗（${verifyRes.status}）。`);
            }
            const persistedConfig = await verifyRes.json();
            const changedKeys = Object.keys(mergedConfig).filter(key => mergedConfig[key] !== undefined);
            const mismatchedKey = changedKeys.find(key =>
                JSON.stringify(persistedConfig[key]) !== JSON.stringify(mergedConfig[key])
            );
            if (mismatchedKey) {
                throw new Error(`正式站重新讀取後設定不一致（欄位：${mismatchedKey}）。`);
            }
        }
        safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(mergedConfig));
        return true;
    },

    // 取得所有關卡
    getPuzzles() {
        this.init();
        try {
            const seedPuzzles = getSeedPuzzlesForSlug(this.getSlug());
            const puzzlesStr = safeStorage.getItem(STORAGE_KEYS.PUZZLES);
            let puzzles = puzzlesStr ? JSON.parse(puzzlesStr) : seedPuzzles;
            
            if (!Array.isArray(puzzles) || puzzles.length === 0) {
                puzzles = seedPuzzles;
                safeStorage.setItem(STORAGE_KEYS.PUZZLES, JSON.stringify(seedPuzzles));
            }
            
            // 自適應補全 dependsOn 與 puzzleType 欄位
            const activePuzzles = puzzles.filter(p => p.enabled !== false);
            puzzles.forEach(p => {
                if (p.dependsOn === undefined) {
                    if (activePuzzles.length > 0 && p.id === activePuzzles[activePuzzles.length - 1].id) {
                        p.dependsOn = "all";
                    } else {
                        p.dependsOn = p.id > 1 ? p.id - 1 : null;
                    }
                }
                if (p.puzzleType === undefined) {
                    p.puzzleType = "text";
                }
                if (p.postStoryBtnText === undefined) {
                    p.postStoryBtnText = "";
                }
            });
            return puzzles;
        } catch (e) {
            console.error('Failed to parse puzzles from localStorage, falling back to default:', e);
            let puzzles = JSON.parse(JSON.stringify(DEFAULT_PUZZLES));
            if (!Array.isArray(puzzles)) {
                puzzles = [];
            }
            const activePuzzles = puzzles.filter(p => p.enabled !== false);
            puzzles.forEach(p => {
                if (p.dependsOn === undefined) {
                    if (activePuzzles.length > 0 && p.id === activePuzzles[activePuzzles.length - 1].id) {
                        p.dependsOn = "all";
                    } else {
                        p.dependsOn = p.id > 1 ? p.id - 1 : null;
                    }
                }
                if (p.puzzleType === undefined) {
                    p.puzzleType = "text";
                }
                if (p.postStoryBtnText === undefined) {
                    p.postStoryBtnText = "";
                }
            });
            return puzzles;
        }
    },

    // 儲存所有關卡
    async savePuzzles(puzzles) {
        this._puzzleRevision += 1;
        if (this.isServerMode()) {
            const slug = this.getSlug();
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/puzzles`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(puzzles)
            });
            if (res.status === 401) {
                await this.logoutAdmin();
                throw new Error('管理員登入已逾時，請重新登入後再儲存。');
            }
            if (!res.ok) {
                throw new Error(`正式站儲存失敗（${res.status}），資料尚未確認寫入。`);
            }
        }
        safeStorage.setItem(STORAGE_KEYS.PUZZLES, JSON.stringify(puzzles));
        return true;
    },

    // 取得單一關卡
    getPuzzle(id) {
        const puzzles = this.getPuzzles();
        return puzzles.find(p => p.id === parseInt(id));
    },

    async verifyPuzzleAnswer(puzzleId, answer) {
        if (!this.isServerMode()) {
            const puzzle = this.getPuzzle(puzzleId);
            const input = String(answer || '').trim().toUpperCase();
            if (!input || !puzzle) return false;
            if (puzzle.answers) {
                return puzzle.answers.map(a => String(a || '').toUpperCase()).includes(input);
            }
            if (puzzle.answer) {
                return input === String(puzzle.answer || '').toUpperCase();
            }
            return false;
        }

        const res = await fetch(`${this.getServerUrl()}/api/${this.getSlug()}/puzzles/${puzzleId}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer })
        });
        if (!res.ok) return false;
        const data = await res.json();
        return !!data.correct;
    },

    // 新增全新空白關卡
    async addNewPuzzle() {
        const puzzles = this.getPuzzles();
        const nextId = puzzles.length > 0 ? Math.max(...puzzles.map(p => p.id)) + 1 : 1;
        const newPuzzle = {
            id: nextId,
            chapter: `任務${nextId}`,
            name: `全新任務 #${nextId}`,
            stars: 3,
            radar: [3, 3, 3, 3, 3, 3],
            story: [],
            storyImg: [],
            landmarkImg: "",
            landmarkBtnText: "前往解謎",
            landmarkText: "請在此處輸入目的地引導說明...",
            puzzleDesc: "請在此處輸入核心謎題問題與提示描述...",
            inputPlaceholder: "請輸入答案",
            submitBtnText: "送出答案",
            answer: "答案",
            answers: ["答案"],
            errorMsg: "驗證失敗，密鑰不符。請再次確認線索！",
            postStoryImg: "",
            postStory: "恭喜！解密成功，圖騰印記已甦醒。",
            postStoryBtnText: "",
            totemDesc: "",
            totemImg: "",
            enabled: true
        };
        puzzles.push(newPuzzle);
        await this.savePuzzles(puzzles);
        return nextId;
    },

    // 刪除關卡
    async deletePuzzle(id) {
        let puzzles = this.getPuzzles();
        puzzles = puzzles.filter(p => p.id !== parseInt(id));
        await this.savePuzzles(puzzles);
        return true;
    },

    // 更新單一關卡
    async savePuzzle(id, updatedPuzzle) {
        const puzzles = this.getPuzzles();
        const index = puzzles.findIndex(p => p.id === parseInt(id));
        if (index !== -1) {
            puzzles[index] = { ...puzzles[index], ...updatedPuzzle };
            this._puzzleRevision += 1;

            if (this.isServerMode()) {
                const slug = this.getSlug();
                const res = await fetch(`${this.getServerUrl()}/api/${slug}/puzzles/${id}`, {
                    method: 'POST',
                    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(updatedPuzzle)
                });
                if (res.status === 401) {
                    await this.logoutAdmin();
                    throw new Error('管理員登入已逾時，請重新登入後再儲存。');
                }
                if (!res.ok) {
                    throw new Error(`正式站儲存失敗（${res.status}），請稍後再試。`);
                }
                const result = await res.json();
                if (result && result.puzzle) puzzles[index] = result.puzzle;

                const verifyRes = await fetch(`${this.getServerUrl()}/api/${slug}/puzzles`, {
                    headers: this.authHeaders(),
                    cache: 'no-store'
                });
                if (verifyRes.status === 401) {
                    await this.logoutAdmin();
                    throw new Error('管理員登入已逾時，請重新登入後再儲存。');
                }
                if (!verifyRes.ok) {
                    throw new Error(`正式站寫入後驗證失敗（${verifyRes.status}）。`);
                }
                const persistedPuzzles = await verifyRes.json();
                const persistedPuzzle = Array.isArray(persistedPuzzles)
                    ? persistedPuzzles.find(p => Number(p.id) === Number(id))
                    : null;
                const changedKeys = Object.keys(updatedPuzzle).filter(key => updatedPuzzle[key] !== undefined);
                const mismatchedKey = !persistedPuzzle ? 'puzzle' : changedKeys.find(key =>
                    JSON.stringify(persistedPuzzle[key]) !== JSON.stringify(updatedPuzzle[key])
                );
                if (mismatchedKey) {
                    throw new Error(`正式站重新讀取後內容不一致（欄位：${mismatchedKey}），未顯示假成功。`);
                }
                puzzles[index] = persistedPuzzle;
            }
            safeStorage.setItem(STORAGE_KEYS.PUZZLES, JSON.stringify(puzzles));
            return true;
        }
        return false;
    },

    // 取得所有玩家日誌
    getPlayers() {
        this.init();
        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players`, { headers: this.authHeaders() })
                .then(res => {
                    if (res.status === 401) {
                        this.logoutAdmin();
                        throw new Error('Admin authorization expired');
                    }
                    if (res.ok && res.headers.get('content-type') && res.headers.get('content-type').includes('application/json')) {
                        return res.json();
                    }
                    throw new Error('Not JSON response');
                })
                .then(players => {
                    safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
                }).catch(e => {});
        }
        try {
            const playersStr = safeStorage.getItem(STORAGE_KEYS.PLAYERS);
            return playersStr ? JSON.parse(playersStr) : [];
        } catch (e) {
            console.error('Failed to parse players from localStorage, falling back to empty:', e);
            return [];
        }
    },

    async fetchPlayersFromServer() {
        this.init();
        if (!this.isServerMode()) return this.getPlayers();
        const slug = this.getSlug();
        const res = await fetch(`${this.getServerUrl()}/api/${slug}/players`, { headers: this.authHeaders() });
        if (res.status === 401) {
            await this.logoutAdmin();
            throw new Error('Admin authorization expired');
        }
        if (!res.ok || !res.headers.get('content-type') || !res.headers.get('content-type').includes('application/json')) {
            return this.getPlayers();
        }
        const players = await res.json();
        this.savePlayers(players);
        return players;
    },

    // 儲存所有玩家日誌
    savePlayers(players) {
        safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    },

    // 登記玩家登入
    loginPlayer(teamName, deviceMetadata = '') {
        let players = [];
        try {
            const playersStr = safeStorage.getItem(STORAGE_KEYS.PLAYERS);
            players = playersStr ? JSON.parse(playersStr) : [];
        } catch (e) {
            players = [];
        }
        const now = Date.now();
        const dev = deviceMetadata || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device');

        const targetTeamName = String(teamName || '').trim().toLowerCase();
        let player = players.find(p => String(p && p.teamName || '').trim().toLowerCase() === targetTeamName);
        
        if (!player) {
            player = {
                id: 'player_' + Math.random().toString(36).substr(2, 9),
                teamName: teamName,
                loginTime: now,
                device: dev,
                completedLevels: [],
                currentProgress: '序幕',
                startTime: now,
                endTime: null,
                totalDuration: 0,
                active: true,
                attempts: [],
                unlockedBranches: [], // 支援劇情分支抉擇
                gpsChecked: [] // 支援 GPS 定位驗證紀錄
            };
            players.push(player);
        } else {
            player.active = true;
            player.loginTime = now;
        }
        
        safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));

        // 伺服器同步
        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/login`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ teamName, device: dev })
            }).then(res => res.json()).then(servPlayer => {
                const localPlayers = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PLAYERS)) || [];
                const idx = localPlayers.findIndex(p => p.teamName === teamName);
                if (idx !== -1) {
                    localPlayers[idx] = servPlayer;
                    safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(localPlayers));
                }
            }).catch(e => console.error('Server login sync failed:', e));
        }

        return player;
    },
    async openTestPlayer(deviceMetadata = "") {
        const dev = deviceMetadata || (typeof navigator !== "undefined" ? navigator.userAgent : "Open Test Device");

        if (this.isServerMode()) {
            const slug = this.getSlug();
            try {
                const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/open-test`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ device: dev })
                });
                if (res.ok) {
                    const serverPlayer = await res.json();
                    const players = this.getPlayers();
                    const idx = players.findIndex(p => p.id === serverPlayer.id);
                    if (idx === -1) {
                        players.push(serverPlayer);
                    } else {
                        players[idx] = serverPlayer;
                    }
                    this.savePlayers(players);
                    return serverPlayer;
                }
            } catch (e) {
                console.warn("Open test player sync failed, using local fallback:", e);
            }
        }

        const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
        const randomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        return this.loginPlayer(`[\u516c\u958b\u6e2c\u8a66] ${this.getSlug()}-${stamp}-${randomCode}`, dev);
    },

    // 登記玩家隊伍報名提交
    async registerTeamSubmission(teamName, leaderName, phone, email, memberCount, extraFields = {}) {
        let players = this.getPlayers();
        const now = Date.now();
        const newId = 'player_' + Math.random().toString(36).substr(2, 9);
        const finalTeamName = teamName.trim() || (leaderName.trim() + '\u7684\u63a2\u96aa\u968a'); // leaderName 的探險隊

        const player = {
            id: newId,
            teamName: finalTeamName,
            leaderName: leaderName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            memberCount: parseInt(memberCount) || 1,
            sessionDate: (extraFields.sessionDate || '').trim(),
            sessionTime: (extraFields.sessionTime || '').trim(),
            teamType: (extraFields.teamType || '').trim(),
            hasChildren: !!extraFields.hasChildren,
            specialNeeds: (extraFields.specialNeeds || '').trim(),
            emergencyName: (extraFields.emergencyName || '').trim(),
            emergencyPhone: (extraFields.emergencyPhone || '').trim(),
            safetyAgreement: !!extraFields.safetyAgreement,
            weatherAgreement: !!extraFields.weatherAgreement,
            safetyAgreementText: (extraFields.safetyAgreementText || '').trim(),
            weatherAgreementText: (extraFields.weatherAgreementText || '').trim(),
            approved: false, // 待審核
            teamPassword: '', // 尚未核准生成
            loginTime: null,
            device: '',
            completedLevels: [],
            currentProgress: '\u672a\u958b\u59cb', // 未開始
            startTime: null,
            endTime: null,
            totalDuration: 0,
            active: false,
            attempts: [],
            unlockedBranches: [],
            gpsChecked: [],
            createdAt: now
        };

        if (this.isServerMode()) {
            const slug = this.getSlug();
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ teamName: finalTeamName, leaderName, phone, email, memberCount }, extraFields))
            });
            if (!res.ok) {
                let message = '報名資料無法送出，請稍後再試。';
                try {
                    const data = await res.json();
                    if (data && data.error) message = data.error;
                } catch (e) {}
                throw new Error(message);
            }
            const serverPlayer = await res.json();
            const localPlayers = this.getPlayers().filter(p => p.id !== serverPlayer.id && p.teamName !== serverPlayer.teamName);
            localPlayers.push(serverPlayer);
            this.savePlayers(localPlayers);
            return serverPlayer;
        }

        players.push(player);
        this.savePlayers(players);
        return player;
    },

    // 後台核准匯款確認，並配發玩家密碼
    approveTeamPayment(id) {
        const players = this.getPlayers();
        const player = players.find(p => p.id === id);
        if (!player) return null;

        const approvedCount = countPasswordsByKind(players, 'regular');
        const password = buildTeamPassword(player.memberCount, 'A', approvedCount + 1);

        player.approved = true;
        player.teamPassword = password;
        player.currentProgress = '\u5df2\u6838\u51c6\u767b\u5165'; // 已核准登入

        this.savePlayers(players);

        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/approve`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ id })
            }).then(res => res.json()).then(servPlayer => {
                const localPlayers = this.getPlayers();
                const idx = localPlayers.findIndex(p => p.id === id);
                if (idx !== -1) {
                    localPlayers[idx] = servPlayer;
                    this.savePlayers(localPlayers);
                }
            }).catch(e => console.error('Server approval sync failed:', e));
        }

        return player;
    },

    // 生成測試或公關用特殊登入密碼組
    generateSpecialTeam(type, memberCount, remark) {
        const players = this.getPlayers();
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const MMDD = `${mm}${dd}`;

        let kind = 'test';
        let label = 'T';
        let teamNamePrefix = '[\u6e2c\u8a66] \u6e2c\u8a66\u5e33\u865f'; // [測試] 測試帳號
        if (type === 'pr') {
            kind = 'pr';
            label = 'P';
            teamNamePrefix = '[\u516c\u95dc] \u8cb4\u8cd9\u516c\u95dc'; // [公關] 貴賓公關
        }

        const seats = parseInt(memberCount, 10) || (type === 'test' ? 99 : 5);
        const typeCount = countPasswordsByKind(players, kind);
        const seq = String(typeCount + 1).padStart(2, '0');
        const password = buildTeamPassword(seats, label, typeCount + 1);

        const newId = 'player_' + Math.random().toString(36).substr(2, 9);
        const finalTeamName = `${teamNamePrefix} ${label}${seq}`;

        const player = {
            id: newId,
            teamName: finalTeamName,
            leaderName: type === 'test' ? 'System Test' : (remark || 'KOL Guest'),
            phone: type === 'test' ? '00000000' : 'PR-PROMO',
            email: type === 'test' ? 'test@system.local' : 'promo@system.local',
            memberCount: seats,
            approved: true,
            teamPassword: password,
            loginTime: null,
            device: '',
            completedLevels: [],
            currentProgress: '\u5df2\u6838\u51c6\u767b\u5165', // 已核准登入
            startTime: null,
            endTime: null,
            totalDuration: 0,
            active: false,
            attempts: [],
            unlockedBranches: [],
            gpsChecked: [],
            createdAt: now.getTime()
        };

        players.push(player);
        this.savePlayers(players);

        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/special`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ type, memberCount, remark })
            }).then(res => res.json()).then(servPlayer => {
                const localPlayers = this.getPlayers();
                const idx = localPlayers.findIndex(p => p.id === newId);
                if (idx !== -1) {
                    localPlayers[idx] = servPlayer;
                    this.savePlayers(localPlayers);
                }
            }).catch(e => console.error('Server special team sync failed:', e));
        }

        return player;
    },

    // 更新報名隊伍資訊 (後台編輯連動)
    updatePlayerRegistration(id, updatedFields) {
        let players = this.getPlayers();
        const idx = players.findIndex(p => p.id === id);
        if (idx !== -1) {
            players[idx] = Object.assign({}, players[idx], updatedFields);
            this.savePlayers(players);

            if (this.isServerMode()) {
                const slug = this.getSlug();
                return fetch(`${this.getServerUrl()}/api/${slug}/players/update/${id}`, {
                    method: 'POST',
                    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(updatedFields)
                }).then(res => res.json()).then(servPlayer => {
                    const localPlayers = this.getPlayers();
                    const localIdx = localPlayers.findIndex(p => p.id === id);
                    if (localIdx !== -1) {
                        localPlayers[localIdx] = servPlayer;
                        this.savePlayers(localPlayers);
                    }
                    return servPlayer;
                }).catch(e => {
                    console.error('Server registration update sync failed:', e);
                    return players[idx];
                });
            }
            return Promise.resolve(players[idx]);
        }
        return Promise.resolve(null);
    },

    // 使用配發的密碼進行驗證登入
    async loginPlayerByPassword(password, deviceMetadata = '') {
        let players = this.getPlayers();
        const now = Date.now();
        const dev = deviceMetadata || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device');
        
        const cleanPwd = normalizeTeamPassword(password);
        let player = players.find(p => p.approved === true && p.teamPassword && normalizeTeamPassword(p.teamPassword) === cleanPwd);

        if (this.isServerMode()) {
            const slug = this.getSlug();
            try {
                const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/loginByPassword`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: cleanPwd, device: dev })
                });
                if (!res.ok) {
                    return null;
                }
                if (res.ok) {
                    const serverPlayer = await res.json();
                    if (serverPlayer && serverPlayer.id) {
                        players = this.getPlayers();
                        const idx = players.findIndex(p => p.id === serverPlayer.id);
                        if (idx === -1) {
                            players.push(serverPlayer);
                        } else {
                            players[idx] = serverPlayer;
                        }
                        this.savePlayers(players);
                        return serverPlayer;
                    }
                }
            } catch (e) {
                console.error('Server loginByPassword failed:', e);
            }
        }

        if (!player) {
            return null;
        }

        if (!recordPasswordLogin(player, dev)) {
            return null;
        }
        /*
        if (!player.startTime) {
            player.startTime = now;
            player.currentProgress = '\u5e8f\u5e55'; // 序幕
        }
        */

        this.savePlayers(players);

        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/loginByPassword`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: cleanPwd, device: dev })
            }).then(res => res.json()).then(servPlayer => {
                const localPlayers = this.getPlayers();
                const idx = localPlayers.findIndex(p => p.id === player.id);
                if (idx !== -1) {
                    localPlayers[idx] = servPlayer;
                    this.savePlayers(localPlayers);
                }
            }).catch(e => console.error('Server loginByPassword sync failed:', e));
        }

        return player;
    },

    async loginPlayerByAccessCode(accessCode, deviceMetadata = '') {
        let players = this.getPlayers();
        const dev = deviceMetadata || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device');
        const cleanCode = String(accessCode || '').replace(/\D/g, '').slice(0, 6);

        if (this.isServerMode()) {
            const slug = this.getSlug();
            try {
                const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/loginByAccessCode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessCode: cleanCode, device: dev })
                });
                if (!res.ok) return null;
                const serverPlayer = await res.json();
                if (serverPlayer && serverPlayer.id) {
                    players = this.getPlayers();
                    const idx = players.findIndex(p => p.id === serverPlayer.id);
                    if (idx === -1) {
                        players.push(serverPlayer);
                    } else {
                        players[idx] = serverPlayer;
                    }
                    this.savePlayers(players);
                    return serverPlayer;
                }
            } catch (e) {
                console.error('Server loginByAccessCode failed:', e);
            }
        }

        const player = players.find(p => p.approved === true && String(p.accessCode || '') === cleanCode);
        if (!player) return null;
        if (!recordPasswordLogin(player, dev)) return null;
        this.savePlayers(players);
        return player;
    },

    // 更新玩家進度與嘗試日誌 (擴充分支選擇 branchChoice)
    updatePlayerProgress(teamName, levelId, stepName, isSuccess = false, answerSubmitted = '', branchChoice = '') {
        let puzzles = [];
        let players = [];
        try {
            const playersStr = safeStorage.getItem(STORAGE_KEYS.PLAYERS);
            players = playersStr ? JSON.parse(playersStr) : [];
        } catch (e) {
            players = [];
        }
        const targetTeamName = String(teamName || '').trim().toLowerCase();
        if (!targetTeamName) return null;
        const player = players.find(p => String(p && p.teamName || '').trim().toLowerCase() === targetTeamName);
        if (!player) return null;

        const now = Date.now();

        // 防止升級時因舊資料結構缺漏
        if (!player.unlockedBranches) player.unlockedBranches = [];
        if (!player.gpsChecked) player.gpsChecked = [];

        if (answerSubmitted) {
            player.attempts.push({
                levelId: parseInt(levelId),
                answer: answerSubmitted,
                success: !!isSuccess,
                timestamp: now
            });
        }

        if (branchChoice) {
            if (!player.unlockedBranches.includes(branchChoice)) {
                player.unlockedBranches.push(branchChoice);
            }
        }

        if (isSuccess && levelId) {
            const lid = parseInt(levelId);
            if (!player.completedLevels.includes(lid)) {
                player.completedLevels.push(lid);
            }
            try {
                const puzzlesStr = safeStorage.getItem(STORAGE_KEYS.PUZZLES);
                puzzles = puzzlesStr ? JSON.parse(puzzlesStr) : [];
            } catch (e) {
                puzzles = [];
            }
            const activePuzzles = puzzles.filter(p => p.enabled !== false);
            const finalPuzzle = activePuzzles[activePuzzles.length - 1] || puzzles[puzzles.length - 1];
            const finalId = finalPuzzle ? finalPuzzle.id : 6;

            if (lid === finalId) {
                player.endTime = now;
                player.currentProgress = '通關成功';
                player.totalDuration = Math.floor((player.endTime - player.startTime) / 1000);
            } else {
                player.currentProgress = `任務 #0${lid} PASS`;
            }
        } else {
            player.currentProgress = stepName;
        }

        safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));

        // 伺服器同步
        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: player.id,
                    playerToken: player.playerToken,
                    levelId,
                    stepName,
                    isSuccess,
                    answerSubmitted,
                    branchChoice
                })
            }).catch(e => console.error('Server progress update failed:', e));
        }

        return player;
    },

    recordHintUse(teamName, levelId, hintIndex, hintText = '') {
        let players = [];
        try {
            const playersStr = safeStorage.getItem(STORAGE_KEYS.PLAYERS);
            players = playersStr ? JSON.parse(playersStr) : [];
        } catch (e) {
            players = [];
        }
        const player = players.find(p => p.teamName && p.teamName.trim().toLowerCase() === String(teamName || '').trim().toLowerCase());
        if (!player) return null;
        if (!Array.isArray(player.hintUses)) player.hintUses = [];
        player.hintUses.push({
            levelId: parseInt(levelId),
            hintIndex: parseInt(hintIndex),
            hintText: String(hintText || ''),
            timestamp: Date.now()
        });
        safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));

        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/hints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: player.id,
                    playerToken: player.playerToken,
                    levelId,
                    hintIndex,
                    hintText
                })
            }).catch(e => console.error('Server hint sync failed:', e));
        }
        return player;
    },

    // 清空玩家紀錄
    clearPlayers() {
        safeStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify([]));

        if (this.isServerMode()) {
            const slug = this.getSlug();
            fetch(`${this.getServerUrl()}/api/${slug}/players/clear`, {
                method: 'POST',
                headers: this.authHeaders()
            }).catch(e => console.error('Server clear logs failed:', e));
        }
    },

    async getPlayerBackups() {
        if (!this.isServerMode()) return [];
        const slug = this.getSlug();
        try {
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/backups`, {
                headers: this.authHeaders()
            });
            return res.ok ? await res.json() : [];
        } catch (e) {
            console.error('Fetch player backups failed:', e);
            return [];
        }
    },

    async fetchPlayerBackup(name) {
        if (!this.isServerMode() || !name) return null;
        const slug = this.getSlug();
        try {
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/backups/${encodeURIComponent(name)}`, {
                headers: this.authHeaders()
            });
            return res.ok ? await res.blob() : null;
        } catch (e) {
            console.error('Fetch player backup failed:', e);
            return null;
        }
    },

    // 🛡️ 總後台帳戶管理核心 API
    async getAccounts() {
        if (this.isServerMode()) {
            try {
                const res = await fetch(`${this.getServerUrl()}/api/accounts`, { headers: this.authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    safeStorage.setItem('dulles_platform_accounts_v2', JSON.stringify(data));
                    return data;
                }
            } catch (e) {
                console.warn("Fetch accounts failed, falling back:", e);
            }
        }
        const localStr = safeStorage.getItem('dulles_platform_accounts_v2');
        if (localStr) {
            return JSON.parse(localStr);
        }
        // Offline-only placeholder; real server accounts are stored on the backend.
        const initial = [];
        safeStorage.setItem('dulles_platform_accounts_v2', JSON.stringify(initial));
        return initial;
    },

    async saveAccount(username, password, role = 'admin') {
        if (this.isServerMode()) {
            try {
                await fetch(`${this.getServerUrl()}/api/accounts`, {
                    method: 'POST',
                    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ username, password, role })
                });
            } catch (e) {
                console.error("Save account to server failed:", e);
            }
        }
        // 儲存本地
        const accounts = await this.getAccounts();
        const existingIdx = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
        const accountData = { username: username.trim(), password: password.trim(), role };
        
        if (existingIdx !== -1) {
            accounts[existingIdx] = accountData;
        } else {
            accounts.push(accountData);
        }
        safeStorage.setItem('dulles_platform_accounts_v2', JSON.stringify(accounts));
        return true;
    },

    async deleteAccount(username) {
        if (username.toLowerCase() === 'halopataw') return false; // 總後台安全保護
        
        if (this.isServerMode()) {
            try {
                await fetch(`${this.getServerUrl()}/api/accounts/${username}`, {
                    method: 'DELETE',
                    headers: this.authHeaders()
                });
            } catch (e) {
                console.error("Delete account from server failed:", e);
            }
        }
        // 刪除本地
        let accounts = await this.getAccounts();
        accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
        safeStorage.setItem('dulles_platform_accounts_v2', JSON.stringify(accounts));
        return true;
    },

    async updateGameOwner(slug, owner) {
        if (this.isServerMode()) {
            try {
                await fetch(`${this.getServerUrl()}/api/games/${slug}/owner`, {
                    method: 'PUT',
                    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ owner })
                });
            } catch (e) {
                console.error("Update game owner to server failed:", e);
            }
        }
        // 更新本地
        const games = this.getGames();
        const g = games.find(item => item.slug === slug);
        if (g) {
            g.owner = owner;
            this.saveGames(games);
            return true;
        }
        return false;
    },

    async updateGameName(slug, name) {
        if (this.isServerMode()) {
            const res = await fetch(`${this.getServerUrl()}/api/games/${slug}/name`, {
                method: 'PUT',
                headers: this.authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name })
            });
            if (res.status === 401) {
                await this.logoutAdmin();
                throw new Error('管理員登入已逾時，請重新登入後再修改名稱。');
            }
            if (!res.ok) {
                throw new Error(`正式站修改遊戲名稱失敗（${res.status}）。`);
            }
        }
        // 更新本地
        const games = this.getGames();
        const g = games.find(item => item.slug === slug);
        if (g) {
            g.name = name;
            this.saveGames(games);
            return true;
        }
        return false;
    },

    async resetPlayerPassCard(playerId) {
        if (!this.isServerMode()) return null;
        const slug = this.getSlug();
        try {
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/${playerId}/pass/reset`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            if (!res.ok) return null;
            const player = await res.json();
            const players = this.getPlayers();
            const idx = players.findIndex(p => p.id === player.id);
            if (idx !== -1) {
                players[idx] = player;
                this.savePlayers(players);
            }
            return player;
        } catch (e) {
            console.error('Reset pass card failed:', e);
            return null;
        }
    },

    async disablePlayerPassCard(playerId) {
        if (!this.isServerMode()) return null;
        const slug = this.getSlug();
        try {
            const res = await fetch(`${this.getServerUrl()}/api/${slug}/players/${playerId}/pass/disable`, {
                method: 'POST',
                headers: this.authHeaders({ 'Content-Type': 'application/json' })
            });
            if (!res.ok) return null;
            const player = await res.json();
            const players = this.getPlayers();
            const idx = players.findIndex(p => p.id === player.id);
            if (idx !== -1) {
                players[idx] = player;
                this.savePlayers(players);
            }
            return player;
        } catch (e) {
            console.error('Disable pass card failed:', e);
            return null;
        }
    }
};

// 全局導出
if (typeof window !== 'undefined') {
    window.DullesData = DullesData;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULT_CONFIG, DEFAULT_PUZZLES, LEGACY_DEFAULT_CONFIG, LEGACY_DEFAULT_PUZZLES, DullesData };
}
