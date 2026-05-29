const CLIENT_ID = '93fe81b4793c46f693d2ec27e134d5b8'; 
const REDIRECT_URI = 'http://127.0.0.1:5500/';

// --- Firebase の初期化 (大雅さんの情報に設定済) ---
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

// --- PKCE制御用関数群 ---
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
    const authUrl = new URL("https://accounts.spotify.com/authorize");
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
        const body = await fetch('https://accounts.spotify.com/api/token', payload);
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
            // --- 追加：プレイヤー画面のURLからQRコード画像を生成して表示 ---
            const playerUrl = `${window.location.origin}/player.html`;
            const qrCodeArea = document.getElementById('qrcode-area');
            qrCodeArea.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(playerUrl)}" alt="QR Code">`;
            // -----------------------------------------------------------
            setupButtons(token, device_id);
            // データベースの監視を開始する
            listenToBuzzer(token, device_id);
        });
        player.connect();
    };
    if (window.Spotify) { window.onSpotifyWebPlaybackSDKReady(); }
}

// 物理ボタン（画面のボタン）での操作
function setupButtons(token, deviceId) {
    const playButton = document.getElementById('play-button');
    const pauseButton = document.getElementById('pause-button');

    playButton.addEventListener('click', () => {
        // 曲を流すときはデータベースの状態を「再生中」に更新する
        database.ref('room').set({ status: 'playing', winner: '' });
    });

    pauseButton.addEventListener('click', () => {
        // 手動で止めたとき
        database.ref('room').set({ status: 'paused', winner: 'ホスト（手動停止）' });
    });
}

// --- データベースを監視してSpotifyをコントロールする核心部分 ---
function listenToBuzzer(token, deviceId) {
    let currentStatus = 'initial';

    database.ref('room').on('value', async (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // 誰かがボタンを押して「paused」になった瞬間、Spotifyを止める
        if (data.status === 'paused' && currentStatus !== 'paused') {
            await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            document.getElementById('winner-display').textContent = `押した人: ${data.winner}`;
            currentStatus = 'paused';
        } 
        
        // ホストがリセット（再開）して「playing」になった瞬間、曲を続きから流す
        else if (data.status === 'playing' && currentStatus !== 'playing') {
            document.getElementById('winner-display').textContent = '再生中...';
            
            let bodyData = null;
            if (currentStatus === 'initial') {
                // 完全な初回だけ曲を指定して1から流す
                const testTrackUri = 'spotify:track:4IorGv8976Xm6nS7vB6ZpG'; 
                bodyData = JSON.stringify({ uris: [testTrackUri] });
            }

            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: bodyData,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
            currentStatus = 'playing';
        }
    });
}