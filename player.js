// ホスト側と同じFirebaseの接続情報
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

const buzzerButton = document.getElementById('buzzer');
const usernameInput = document.getElementById('username');

buzzerButton.addEventListener('click', () => {
    const name = usernameInput.value.trim() || '名無しさん';

    // データベースの状態を一度だけ確認する（ロックアウト機能）
    database.ref('room').once('value', (snapshot) => {
        const data = snapshot.val();
        
        // 現在のステータスが「playing（再生中）」の時だけ、自分が最初の勝者になれる
        if (data && data.status === 'playing') {
            database.ref('room').set({
                status: 'paused',
                winner: name
            });
            console.log('ブザーが押されました！');
        } else {
            console.log('すでに他の誰かに押されています');
        }
    });
});