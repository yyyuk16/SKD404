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


// 新種ポップアップを index に置く場合のみ：読み込み直後に自動表示はしない（JS から明示的に fadeIn する）
$(function () {
  var $popup = $("#new-onigiri-popup");
  if (!$popup.length) return;

  $("#register-btn").on("click", function (e) {
    e.stopPropagation();
    $(this)
      .text("登録したよ！")
      .css({
        "background-color": "#8a7357",
        "box-shadow": "none",
        transform: "translateY(2px)"
      });
    setTimeout(function () {
      $popup.fadeOut(400);
    }, 800);
  });

  $(".popup-close-btn, .popup-overlay").on("click", function (e) {
    if (e.target !== e.currentTarget && !$(e.target).hasClass("popup-close-btn")) return;
    $popup.fadeOut(300);
  });
});