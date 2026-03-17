(function () {
  // --- 共通: ユーザー ID を取得 ---
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // --- タイマーの状態管理用変数 ---
  var timerId = null;     // setInterval の ID
  var elapsedSec = 0;     // 経過秒数（スタートしてからの合計）
  var lastSeconds = 0;    // 直近の計測結果（秒）。「記録する」ボタンで使う。

  /**
   * 画面中央の「00:00」の表示を、現在の elapsedSec に合わせて更新する。
   * mm:ss 形式（ゼロ埋め）で表示する。
   */
  function updateTimerDisplay() {
    var el = document.getElementById("timer-display");
    if (!el) return;
    var m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    var s = String(elapsedSec % 60).padStart(2, "0");
    el.textContent = m + ":" + s;
  }

  // 計測した秒数をそのまま記録する
  function saveTimer(date, subject, seconds) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    var ref = window.firebaseDb.ref("timerMemos/" + uid).push();
    // 分はおまけ情報として保存（小数1桁まで）
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
        var label = (m.date || "") + " / " + (m.subject || "科目未設定");
        // seconds があれば mm:ss 表示、なければ分のみ表示
        var bodyText;
        if (typeof m.seconds === "number" && !isNaN(m.seconds)) {
          var total = Math.max(0, m.seconds | 0);
          var mm = String(Math.floor(total / 60)).padStart(2, "0");
          var ss = String(total % 60).padStart(2, "0");
          bodyText = mm + ":" + ss;
        } else {
          bodyText = (m.minutes || 0) + " 分";
        }
        return "<li class=\"memo-item\"><span class=\"memo-date\">" + label +
          "</span><div class=\"memo-body\">" + bodyText + "</div></li>";
      }).join("");
    });
  }

  $(function () {
    window.EduChar.ensureProfileThen("record-timer.html");
    loadTimers();

    // 「はじめる」ボタンが押されたときの処理
    $("#timer-start-btn").on("click", function () {
      if (timerId) return; // すでに動いている場合は何もしない（二重スタート防止）
      elapsedSec = 0;
      lastSeconds = 0;
      updateTimerDisplay();
      // 計測中は「記録する」は押せないように隠しておく
      $("#timer-save-btn").hide();
      timerId = setInterval(function () {
        elapsedSec++;
        updateTimerDisplay();
      }, 1000);
    });

    // 「終了」ボタンが押されたときの処理
    $("#timer-stop-btn").on("click", function () {
      if (!timerId) return; // 動いていないときは何もしない
      clearInterval(timerId);
      timerId = null;

      if (elapsedSec <= 0) {
        alert("まだ時間が経過していません。");
        return;
      }
      // 計測結果（秒）を保持しておき、「記録する」ボタンを表示する。
      lastSeconds = elapsedSec;
      $("#timer-save-btn").show();
    });

    // 「記録する」ボタンが押されたときの処理
    $("#timer-save-btn").on("click", function () {
      if (!lastSeconds) {
        alert("記録できる時間がありません。");
        return;
      }
      var today = new Date().toISOString().slice(0, 10);
      var date = today;
      var subjectInput = document.getElementById("timer-subject");
      var subject = subjectInput ? subjectInput.value.trim() : "";

      saveTimer(date, subject, lastSeconds);
      // 記録が終わったら「記録する」を隠し、次の計測に備える。
      $("#timer-save-btn").hide();
      if (subjectInput) subjectInput.value = "";
    });
  });
})();
