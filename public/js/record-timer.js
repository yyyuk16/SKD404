(function () {
  // --- 共通: ユーザー ID を取得 ---
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // --- タイマーの状態管理用変数 ---
  var timerId = null;     // setInterval の ID
  var elapsedSec = 0;     // 経過秒数
  var lastSeconds = 0;    // 直近の計測結果

  /**
   * 画面中央の表示を更新
   */
  function updateTimerDisplay() {
    var el = document.getElementById("timer-display");
    if (!el) return;
    var m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    var s = String(elapsedSec % 60).padStart(2, "0");
    el.textContent = m + ":" + s;
  }

  // Firebaseへ保存
  function saveTimer(date, subject, seconds) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    var ref = window.firebaseDb.ref("timerMemos/" + uid).push();
    var minutes = Math.round((seconds / 60) * 10) / 10;
    ref.set({
      date: date,
      subject: subject,
      minutes: minutes,
      seconds: seconds,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("記録しました。");
      loadTimers();
    }).catch(function (err) {
      alert("保存に失敗しました: " + (err.message || err));
    });
  }

  // 履歴の読み込み
  function loadTimers() {
    var uid = getUid();
    var listEl = document.getElementById("timer-list");
    if (!listEl) return;
    if (!window.firebaseDb || !uid) {
      listEl.innerHTML = "<li>記録はありません。</li>";
      return;
    }
    window.firebaseDb.ref("timerMemos/" + uid).orderByChild("createdAt").limitToLast(30).once("value").then(function (snap) {
      var items = [];
      snap.forEach(function (child) {
        var v = child.val();
        items.push({
          date: v.date,
          subject: v.subject,
          minutes: v.minutes,
          seconds: v.seconds
        });
      });
      items.reverse();
      if (items.length === 0) {
        listEl.innerHTML = "<li>まだ記録がありません。</li>";
        return;
      }

      listEl.innerHTML = items.map(function (m) {
        var subjectText = m.subject || "内容なし";
        var dateText = m.date || "";
        var displayTime = "";
        if (typeof m.seconds === "number" && !isNaN(m.seconds)) {
          var total = Math.max(0, m.seconds | 0);
          var mm = String(Math.floor(total / 60)).padStart(2, "0");
          var ss = String(total % 60).padStart(2, "0");
          displayTime = mm + ":" + ss;
        } else {
          displayTime = (m.minutes || 0) + " 分";
        }

        return '<li class="memo-item pencil-border">' +
                 '<div class="memo-content">' +
                   '<div class="memo-upper">' +
                     '<span class="memo-subject">' + subjectText + '</span>' +
                     '<span class="memo-time-tag">' + displayTime + '</span>' +
                   '</div>' +
                   '<div class="memo-lower">' +
                     '<span class="memo-date">' + dateText + '</span>' +
                   '</div>' +
                 '</div>' +
               '</li>';
      }).join("");
    });
  }

  $(function () {
    window.EduChar.ensureProfileThen("record-timer.html");
    loadTimers();

    // --- 【修正】はじめる / 一時停止 ボタンの切り替え ---
    $("#timer-start-btn").on("click", function () {
      var $btn = $(this);
      var $msg = $("#timer-msg");

      if (!timerId) {
        // 【開始・再開】
        $btn.find("span").text("一時停止"); // HTML構造に合わせて中のspanを書き換え
        $btn.removeClass("btn-primary").addClass("btn-secondary");
        $msg.text("おいしく結び中...");

        timerId = setInterval(function () {
          elapsedSec++;
          updateTimerDisplay();
        }, 1000);

        $("#timer-save-btn").hide();
      } else {
        // 【一時停止】
        clearInterval(timerId);
        timerId = null;
        $btn.find("span").text("再開する");
        $btn.removeClass("btn-secondary").addClass("btn-primary");
        $msg.text("ちょっと休憩。");
      }
    });

    // --- 【修正】終了ボタン ---
    $("#timer-stop-btn").on("click", function () {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }

      if (elapsedSec <= 0) {
        alert("まだ時間が経過していません。");
        return;
      }

      lastSeconds = elapsedSec;
      $("#timer-start-btn").hide();
      $(this).hide();
      $("#timer-save-btn").show();
      $("#timer-msg").text("完成！記録しよう！");
    });

    // --- 【修正】記録するボタン ---
    $("#timer-save-btn").on("click", function () {
      if (!lastSeconds) return;
      
      var today = new Date().toISOString().slice(0, 10);
      var subjectInput = document.getElementById("timer-subject");
      var subject = subjectInput ? subjectInput.value.trim() : "";

      saveTimer(today, subject, lastSeconds);

      // 初期状態に戻す
      $(this).hide();
      $("#timer-start-btn").find("span").text("▶ はじめる");
      $("#timer-start-btn").show();
      $("#timer-stop-btn").show();
      elapsedSec = 0;
      lastSeconds = 0;
      updateTimerDisplay();
      if (subjectInput) subjectInput.value = "";
      $("#timer-msg").text("はじめる準備はできた？");
    });
  });
})();