const CLIENT_ID = '93fe81b4793c46f693d2ec27e134d5b8'; 
const REDIRECT_URI = 'https://taiga1230.github.io/spotify-intro/';

let spotifyPlayer = null; 
let previewAudio = null; // サビ音声を制御するためのグローバル変数

const s='s', p='p', o='o', t='t', i='i', f='f', y='y', dot='.', c='c', m='m';
const spotifyDomain = s+p+o+t+i+f+y+dot+c+o+m;

const ACCOUNTS_URL = "https://accounts." + spotifyDomain;
const API_URL = "https://api." + spotifyDomain;

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
    const params = { response_type: 'code', client_id: CLIENT_ID, scope: scope, code_challenge_method: 'S256', code_challenge: codeChallenge, redirect_uri: REDIRECT_URI, show_dialog: 'true' };
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
        spotifyPlayer = new Spotify.Player({
            name: 'イントロドン・プレイヤー',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        spotifyPlayer.addListener('ready', ({ device_id }) => {
            document.getElementById('player-controls').style.display = 'block';
            
            const playerUrl = 'https://taiga1230.github.io/spotify-intro/player.html';
            const qrCodeArea = document.getElementById('qrcode-area');
            qrCodeArea.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(playerUrl)}" alt="QR Code">`;

            setupButtons(token, device_id);
            listenToBuzzer(token, device_id);
        });
        spotifyPlayer.connect();
    };
    if (window.Spotify) { window.onSpotifyWebPlaybackSDKReady(); }
}

function setupButtons(token, deviceId) {
    const resetButton = document.getElementById('reset-button');
    const correctButton = document.getElementById('correct-button');
    const closeAnswerButton = document.getElementById('close-answer-button');

    // サビの音声を止める共通関数
    function stopPreview() {
        if (previewAudio) {
            previewAudio.pause();
            previewAudio = null;
        }
    }

    // 回答者リセット：サビを止め、状態を元に戻す
    resetButton.addEventListener('click', () => {
        stopPreview();
        document.getElementById('answer-panel').style.display = 'none';
        database.ref('room').set({ status: 'playing', winner: '' });
    });

    // ◯ 正解：曲名を表示し、同時にサビ（プレビュー音源）を再生する
    correctButton.addEventListener('click', () => {
        if (!spotifyPlayer) return;

        stopPreview(); // すでに鳴っていたら一旦リセット

        spotifyPlayer.getCurrentState().then(state => {
            if (!state) {
                document.getElementById('track-info-display').textContent = '曲情報が取得できませんでした（Spotifyアプリで再生中か確認してください）';
                document.getElementById('answer-panel').style.display = 'block';
                return;
            }
            
            const trackId = state.track_window.current_track.id;
            const trackName = state.track_window.current_track.name;
            const artistName = state.track_window.current_track.artists.map(a => a.name).join(', ');
            
            document.getElementById('track-info-display').textContent = `${trackName} / ${artistName}`;
            document.getElementById('answer-panel').style.display = 'block';

            // Spotify APIからその曲のプレビューURL（mp3）を取得してブラウザで鳴らす
            fetch(`${API_URL}/v1/tracks/${trackId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(trackData => {
                if (trackData.preview_url) {
                    previewAudio = new Audio(trackData.preview_url);
                    previewAudio.volume = 0.4; // サビの音量調整（0.0 〜 1.0）
                    previewAudio.play();
                } else {
                    console.log('この曲はSpotify側でプレビュー音源（サビデータ）が用意されていません。');
                }
            })
            .catch(err => console.error('プレビュー取得失敗:', err));
        });
    });

    // 曲名表示を閉じる：サビを止める
    closeAnswerButton.addEventListener('click', () => {
        stopPreview();
        document.getElementById('answer-panel').style.display = 'none';
    });
}

function playBuzzerSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.25); 
        
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.7); 
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.7);
    } catch (e) {
        console.error('音声再生エラー:', e);
    }
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
            
            playBuzzerSound();
            currentStatus = 'paused';
        } 
        
        else if (data.status === 'playing' && currentStatus !== 'playing') {
            document.getElementById('winner-display').textContent = '次の回答を待っています...';
            
            await fetch(`${API_URL}/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            currentStatus = 'playing';
        }
    });
}
