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