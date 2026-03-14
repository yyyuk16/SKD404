function updateDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];

    const timeString = `${year}年${month}月${date}日(${dayOfWeek}) ${hours}:${minutes}`;
    
    document.getElementById('current-date-time').textContent = timeString;
}

// 1秒ごとに更新
setInterval(updateDateTime, 1000);
updateDateTime(); // 初回実行


// 最初のこんにちは！のメッセージを時間帯によって変更
$(document).ready(function() {
    // 現在の時間を取得 (0-23)
    const hour = new Date().getHours();
    let message = "";

    // 時間帯による条件分岐
    if (hour >= 5 && hour < 11) {
        message = "おはよう！";
    } else if (hour >= 11 && hour < 18) {
        message = "こんにちは！";
    } else {
        message = "こんばんは！";
    }

    // IDを指定してテキストを書き換え
    $('#time-message').text(message);
});