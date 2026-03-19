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


// ☆新種のおにぎりを発見したときの演出など
$(function() {
    // ページ読み込み後の演出
    setTimeout(function() {
        $('#new-onigiri-popup').fadeIn(300);
    }, 800);

    // 登録ボタン
    $('#register-btn').on('click', function(e) {
        e.stopPropagation(); // 重なりによる誤動作防止
        $(this).text('登録したよ！').css({
            'background-color': '#8a7357',
            'box-shadow': 'none',
            'transform': 'translateY(2px)'
        });
        
        setTimeout(function() {
            $('#new-onigiri-popup').fadeOut(400);
        }, 800);
    });

    // 閉じる処理
    $('.popup-close-btn, .popup-overlay').on('click', function(e) {
        if (e.target !== e.currentTarget && !$(e.target).hasClass('popup-close-btn')) return;
        $('#new-onigiri-popup').fadeOut(300);
    });
});


// 読みこんだとき、前回の画像と変わっているか比較する処理(アニメが発動するか否か)。アニメーション確認のため一時的にコメントアウト中。実装出来れば上の星マークの処理は消してOK

// $(function() {
//     // 1. 現在表示しようとしているおにぎりの画像パスを取得
//     // (例: 'img/shake.png')。Firebaseから取得した値を入れる変数に合わせて変えてください。
//     const currentOnigiriSrc = $('#new-onigiri-img').attr('src');

//     // 2. ローカルストレージから「最後に見たおにぎり」を取り出す
//     const lastOnigiri = localStorage.getItem('last_seen_onigiri');

//     // 3. 比較する：前回の画像と違う、かつ現在の画像が空でない場合
//     if (currentOnigiriSrc && currentOnigiriSrc !== lastOnigiri) {
        
//         // --- アニメーション開始演出 ---
//         setTimeout(function() {
//             // ポップアップを表示
//             $('#new-onigiri-popup').fadeIn(300);
            
//             // 転がるおにぎりの画像も現在のおにぎりに合わせる
//             $('.rolling-onigiri img').attr('src', currentOnigiriSrc);
//         }, 800);

//         // --- 登録ボタンが押されたら「見たよ」として保存 ---
//         $('#register-btn').on('click', function() {
//             localStorage.setItem('last_seen_onigiri', currentOnigiriSrc);
            
//             // (ここにFirebaseへの登録処理などを追加)
            
//             setTimeout(function() {
//                 $('#new-onigiri-popup').fadeOut(400);
//             }, 800);
//         });

//     } else {
//         // 同じ画像、もしくは画像がない場合はポップアップを消したままにする
//         $('#new-onigiri-popup').hide();
//     }

//     // ×ボタンで閉じる場合（保存はしない設定にすれば、次開いた時もまた出ます）
//     $('.popup-close-btn, .popup-overlay').on('click', function(e) {
//         if (e.target !== e.currentTarget && !$(e.target).hasClass('popup-close-btn')) return;
//         $('#new-onigiri-popup').fadeOut(300);
//     });
// });