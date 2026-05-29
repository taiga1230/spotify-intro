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
const statusMessage = document.getElementById('status-message');

// 状態の変化を監視してボタンを有効化・無効化する (フライング防止)
database.ref('room').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    if (data.status === 'playing') {
        buzzerButton.disabled = false;
        buzzerButton.textContent = 'DON!';
        buzzerButton.style.backgroundColor = '#f44336';
        statusMessage.textContent = '曲が流れています！押して！';
        statusMessage.style.color = '#4CAF50';
    } else if (data.status === 'paused') {
        buzzerButton.disabled = true;
        buzzerButton.textContent = 'STOP';
        if (data.winner) {
            statusMessage.textContent = `${data.winner} さんが回答中...`;
            statusMessage.style.color = '#2196F3';
        } else {
            statusMessage.textContent = '一時停止中...';
            statusMessage.style.color = '#FF9800';
        }
    } else {
        buzzerButton.disabled = true;
        buzzerButton.textContent = 'WAIT';
        statusMessage.textContent = 'ホストが曲を流すのを待っています...';
        statusMessage.style.color = '#616161';
    }
});

// トランザクションを使った厳密な早押し判定 (同時押し衝突回避)
buzzerButton.addEventListener('click', () => {
    const name = usernameInput.value.trim() || '名無しさん';

    database.ref('room').transaction((currentData) => {
        // 現在のステータスが「playing」の時だけ上書きを許可する
        if (currentData && currentData.status === 'playing') {
            currentData.status = 'paused';
            currentData.winner = name;
            currentData.action = 'none';
            return currentData;
        }
        return; // すでに誰かに押されてpausedになっている場合は処理をキャンセル
    }, (error, committed, snapshot) => {
        if (committed) {
            console.log('あなたが最初の勝者です！');
        } else {
            console.log('一瞬遅かったです！');
        }
    });
});
