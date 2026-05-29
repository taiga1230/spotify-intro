const CLIENT_ID = '93fe81b4793c46f693d2ec27e134d5b8'; 
const REDIRECT_URI = 'https://taiga1230.github.io/spotify-intro/';

// --- イントロドンに使用する曲のリスト ---
const TRACK_LIST = [
    'spotify:track:4IorGv8976Xm6nS7vB6ZpG', // デフォルト: ダンスホール (Mrs. GREEN APPLE)
    // 曲を増やしたい場合はここにカンマ区切りで 'spotify:track:xxxx' を追加してください
];

// ランダムに1曲選ぶ関数
function getRandomTrack() {
    const randomIndex = Math.floor(Math.random() * TRACK_LIST.length);
    return TRACK_LIST[randomIndex];
}

const ACCOUNTS_URL = "https:" + "//" + "accounts" + ".spotify.com";
const API_URL = "https:" + "//" + "api" + ".spotify.com";

// --- Firebase の初期化 ---
const firebaseConfig = {
    apiKey: "AIzaSyDNjRsJN9J_vDNa-ZnwONrdDll4wloJFpo",
    authDomain: "spotify-intro-don.firebaseapp.com",
    databaseURL: "https://spotify-intro-don-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "spotify-intro-don",
    storageBucket: "spotify-intro-don.firebasestorage.app",
    messagingSenderId: "811779984428",
    appId: "1:811779984428:web:c7c9c2146ca987ec8bd589"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const loginButton = document.getElementById('login-button');

const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};
const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
};
const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

loginButton.addEventListener('click', async () => {
    const codeVerifier = generateRandomString(64);
    window.localStorage.setItem('code_verifier', codeVerifier);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    
    const authUrl = new URL(`${ACCOUNTS_URL}/authorize`);
    const params = { response_type: 'code', client_id: CLIENT_ID, scope: scope, code_challenge_method: 'S256', code_challenge: codeChallenge, redirect_uri: REDIRECT_URI };
    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
});

const urlParams = new URLSearchParams(window.location.search);
let code = urlParams.get('code');
if (code) { getToken(code); }

async function getToken(code) {
    const codeVerifier = localStorage.getItem('code_verifier');
    const payload = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT_URI, code_verifier: codeVerifier }),
    };
    try {
        const body = await fetch(`${ACCOUNTS_URL}/api/token`, payload);
        const response = await body.json();
        if (response.access_token) {
            loginButton.style.display = 'none';
            window.history.replaceState({}, document.title, window.location.pathname);
            initSpotifyPlayer(response.access_token);
        }
    } catch (error) { console.error(error); }
}

function initSpotifyPlayer(token) {
    window.onSpotifyWebPlaybackSDKReady = () => {
        const player = new Spotify.Player({
            name: 'イントロドン・プレイヤー',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        player.addListener('ready', ({ device_id }) => {
            document.getElementById('player-controls').style.display = 'block';
            
            const playerUrl = 'https://taiga1230.github.io/spotify-intro/player.html';
            const qrCodeArea = document.getElementById('qrcode-area');
            qrCodeArea.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(playerUrl)}" alt="QR Code">`;

            setupButtons(token, device_id);
            listenToBuzzer(token, device_id);
        });
        player.connect();
    };
    if (window.Spotify) { window.onSpotifyWebPlaybackSDKReady(); }
}

function setupButtons(token, deviceId) {
    const nextButton = document.getElementById('next-button');
    const correctButton = document.getElementById('correct-button');
    const resumeButton = document.getElementById('resume-button');
    const restartButton = document.getElementById('restart-button');

    nextButton.addEventListener('click', () => {
        const nextTrack = getRandomTrack();
        database.ref('room').set({ status: 'playing', winner: '', action: 'next', trackUri: nextTrack });
    });

    correctButton.addEventListener('click', () => {
        const nextTrack = getRandomTrack();
        database.ref('room').set({ status: 'playing', winner: '', action: 'next', trackUri: nextTrack });
    });

    resumeButton.addEventListener('click', () => {
        database.ref('room').once('value', (snapshot) => {
            const data = snapshot.val();
            const currentTrack = data ? data.trackUri : TRACK_LIST[0];
            database.ref('room').set({ status: 'playing', winner: '', action: 'resume', trackUri: currentTrack });
        });
    });

    restartButton.addEventListener('click', () => {
        database.ref('room').once('value', (snapshot) => {
            const data = snapshot.val();
            const currentTrack = data ? data.trackUri : TRACK_LIST[0];
            database.ref('room').set({ status: 'playing', winner: '', action: 'restart', trackUri: currentTrack });
        });
    });
}

function listenToBuzzer(token, deviceId) {
    let currentStatus = 'initial';

    database.ref('room').on('value', async (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === 'paused' && currentStatus !== 'paused') {
            await fetch(`${API_URL}/v1/me/player/pause?device_id=${deviceId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if(data.winner) {
                document.getElementById('winner-display').textContent = `押した人: ${data.winner}`;
            }
            currentStatus = 'paused';
        } 
        
        else if (data.status === 'playing' && (currentStatus !== 'playing' || data.action === 'next' || data.action === 'restart')) {
            document.getElementById('winner-display').textContent = '再生中...';
            
            let bodyData = null;
            if (data.action === 'next' || data.action === 'restart') {
                bodyData = JSON.stringify({ uris: [data.trackUri] });
            }

            await fetch(`${API_URL}/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: bodyData,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
            
            currentStatus = 'playing';
            database.ref('room/action').set('none'); // アクション完了後にリセット
        }
    });
}
