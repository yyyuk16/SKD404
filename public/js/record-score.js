(function () {
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // --- 点数の保存 ---
  function saveScore(date, subject, score) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    
    var $saveBtn = $("#score-form button[type='submit']");
    $saveBtn.prop("disabled", true).css("opacity", 0.6);

    var ref = window.firebaseDb.ref("scoreMemos/" + uid).push();
    ref.set({
      date: date,
      subject: subject,
      score: score,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("記録しました！");
      $("#score-value").val("");
      $("#score-subject").val("");
      $saveBtn.prop("disabled", false).css("opacity", 1);
      
      // 履歴が開いている場合は更新
      if ($("#history-content").is(":visible")) {
        loadScores();
      }
    }).catch(function (err) {
      alert("保存に失敗しました: " + (err.message || err));
      $saveBtn.prop("disabled", false).css("opacity", 1);
    });
  }

  // --- 履歴の読み込みと描画 ---
  function loadScores() {
    var uid = getUid();
    var listEl = document.getElementById("score-list");
    if (!listEl) return;
    
    if (!window.firebaseDb || !uid) {
      listEl.innerHTML = "<li class='memo-item'>記録はありません。</li>";
      return;
    }

    // 最新30件を取得
    window.firebaseDb.ref("scoreMemos/" + uid).orderByChild("createdAt").limitToLast(30).once("value").then(function (snap) {
      var items = [];
      snap.forEach(function (child) {
        var v = child.val();
        items.push({
          date: v.date,
          subject: v.subject,
          score: v.score
        });
      });
      items.reverse(); // 降順

      if (items.length === 0) {
        listEl.innerHTML = "<li class='memo-item'>まだ記録がありません。</li>";
        return;
      }

      // 勉強時間の履歴と同じ pencil-border デザインを適用
      listEl.innerHTML = items.map(function (m) {
        return '<li class="memo-item pencil-border">' +
                 '<div class="memo-content">' +
                   '<div class="memo-upper">' +
                     '<span class="memo-subject">' + (m.subject || "テスト") + '</span>' +
                     '<span class="memo-time-tag">' + m.score + ' 点</span>' +
                   '</div>' +
                   '<div class="memo-lower">' +
                     '<span class="memo-date">' + m.date + '</span>' +
                   '</div>' +
                 '</div>' +
               '</li>';
      }).join("");
    });
  }

  // --- イベント設定 ---
  $(function () {
    window.EduChar.ensureProfileThen("record-score.html");

    // 初期設定：日付に今日を入れる
    var today = new Date().toISOString().slice(0, 10);
    var dateEl = document.getElementById("score-date");
    if (dateEl && !dateEl.value) dateEl.value = today;

    // --- 履歴の開閉機能 ---
    $("#history-content").hide(); // 最初は隠す

    $("#toggle-history-btn").on("click", function() {
      var $content = $("#history-content");
      var $btn = $(this);
      
      if ($content.is(":hidden")) {
        loadScores(); // 開くときにデータを読み込む
        $content.slideDown(300);
        $btn.text("閉じる△");
      } else {
        $content.slideUp(300);
        $btn.text("見る▽");
      }
    });

    // フォーム送信
    $("#score-form").on("submit", function (e) {
      e.preventDefault();
      var date = $("#score-date").val();
      var subject = $("#score-subject").val().trim();
      var score = parseInt($("#score-value").val(), 10);

      if (!date) {
        alert("日付を入力してください。");
        return;
      }
      if (isNaN(score)) {
        alert("点数を正しく入力してください。");
        return;
      }
      saveScore(date, subject, score);
    });
  });
})();