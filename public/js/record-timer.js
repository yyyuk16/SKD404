$(function () {
  var timerId = null;
  var elapsedSec = 0;
  var lastSeconds = 0;
  var currentMode = "stopwatch";
  var currentPage = 1;
  var itemsPerPage = 5;
  var allItems = [];

  // 半角変換
  function toHalfWidth(str) {
    if (!str) return "";
    return str.replace(/[０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/[^0-9]/g, '');
  }

  // UID取得（EduCharの仕様に合わせる）
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // 表示の更新
  function updateTimerDisplay() {
    var el = document.getElementById("timer-display");
    if (!el) return;
    var m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    var s = String(elapsedSec % 60).padStart(2, "0");
    el.textContent = m + ":" + s;
  }

  // 【追加】表示のリセット（モード切替や保存後に使用）
  function resetUI() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    elapsedSec = 0;
    lastSeconds = 0;
    updateTimerDisplay();
    
    // ボタン類の初期化
    $("#timer-start-btn").show().find("span").text("▶ はじめる");
    $("#input-title").text("なにをする？(科目・内容)");
    $("#timer-stop-btn").show();
    $("#timer-save-btn").hide();
    $("#timer-msg").text("はじめる準備はできた？");
    $("#timer-subject").val("");
  }

  // プリセット（いつものタイマー）読み込み
  function loadPresets() {
    var uid = getUid();
    if (!uid) return;
    window.firebaseDb.ref("timerPresets/" + uid).once("value").then(function(snap) {
      var html = "";
      snap.forEach(function(child) {
        var data = child.val();
        var m = data.mins || 0;
        var s = data.secs || 0;
        var label = m + ":" + String(s).padStart(2, "0");
        html += '<li data-mins="' + m + '" data-secs="' + s + '">' + label + '</li>';
      });
      $("#preset-ul").html(html || '<li style="border:none; color:#ccc; pointer-events:none;">まだ保存がありません</li>');
    }).catch(function(e) { console.error("Presets Load Error:", e); });
  }

  // プリセット保存
  function savePreset(mins, secs) {
    var uid = getUid();
    if (!uid) return alert("ログインが必要です");
    var ref = window.firebaseDb.ref("timerPresets/" + uid).push();
    ref.set({
      mins: mins,
      secs: secs,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function() {
      alert(mins + "分" + secs + "秒 を保存したよ！");
      loadPresets();
    }).catch(function(e) { alert("保存に失敗しました。ルールの設定を確認してください。"); });
  }

  // 学習記録の保存
  function saveTimer(date, subject, seconds) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;
    var ref = window.firebaseDb.ref("timerMemos/" + uid).push();
    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    
    ref.set({
      date: date,
      time: timeStr,
      subject: subject || "内容なし",
      seconds: seconds,
      mode: currentMode,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("記録しました！");
      loadTimers();

      // 別タブの `record.html` が開いている場合も、保存のたびに表示更新する
      try {
        localStorage.setItem("edu_char_level_refresh", String(Date.now()));
      } catch (e) {}
    }).catch(function(e) { alert("記録の保存に失敗しました"); });
  }

  // 履歴の読み込み
  function loadTimers() {
    var uid = getUid();
    if (!uid) return;
    window.firebaseDb.ref("timerMemos/" + uid).orderByChild("createdAt").once("value").then(function (snap) {
      allItems = [];
      snap.forEach(function (child) { allItems.push(child.val()); });
      allItems.reverse();
      currentPage = 1;
      renderPage();
    });
  }

  // 履歴の描画（ページネーション対応）
  function renderPage() {
    var listEl = document.getElementById("timer-list");
    var pageDisplay = document.getElementById("page-number");
    if (!listEl) return;
    var totalPages = Math.ceil(allItems.length / itemsPerPage) || 1;
    var start = (currentPage - 1) * itemsPerPage;
    var pageItems = allItems.slice(start, start + itemsPerPage);

    listEl.innerHTML = pageItems.length === 0 ? "<li>記録がありません。</li>" : pageItems.map(function (m) {
      var sec = m.seconds || 0;
      var displayTime = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
      return '<li class="memo-item pencil-border"><div class="memo-content"><div class="memo-upper"><span class="memo-subject">' + m.subject + '</span><span class="memo-time-tag">' + displayTime + '</span></div><div class="memo-lower"><span class="memo-date">' + m.date + ' ' + (m.time || "") + '</span></div></div></li>';
    }).join("");

    if (pageDisplay) pageDisplay.textContent = currentPage + " / " + totalPages;
    $("#prev-page").prop("disabled", currentPage === 1);
    $("#next-page").prop("disabled", currentPage === totalPages);
  }

  // --- 初期化実行 ---
  window.EduChar.ensureProfileThen("record-timer.html");
  loadTimers();
  loadPresets();

  // 履歴の開閉
  $("#toggle-history-btn").on("click", function() {
    var $content = $("#history-content");
    var $btn = $(this);
    if ($content.is(":hidden")) {
      loadTimers(); 
      $content.slideDown(300);
      $btn.text("閉じる△");
    } else {
      $content.slideUp(300);
      $btn.text("見る▽");
    }
  });

  // モーダル操作
  $("#open-preset-modal").on("click", function() { $("#preset-modal").fadeIn(200); });
  $("#close-preset-modal").on("click", function() { $("#preset-modal").fadeOut(200); });

  // プリセット保存
  $("#save-current-timer").on("click", function() {
    var mins = parseInt(toHalfWidth($("#input-minutes").val())) || 0;
    var secs = parseInt(toHalfWidth($("#input-seconds").val())) || 0;
    if (mins === 0 && secs === 0) return alert("時間を入力してね！");
    savePreset(mins, secs);
  });

  // プリセット選択時
  $(document).on("click", "#preset-ul li", function() {
    var mins = $(this).data("mins");
    var secs = $(this).data("secs");
    if (mins === undefined) return;
    
    $("#input-minutes").val(mins);
    $("#input-seconds").val(secs);
    
    $("#preset-modal").fadeOut(200, function() {
        // 設定を反映させるために一度時間を計算
        elapsedSec = (parseInt(mins) * 60) + parseInt(secs);
        $("#timer-start-btn").click(); 
    });
  });

  // モード切替
  $("#mode-stopwatch, #mode-timer").on("click", function() {
    if (timerId) return; // 動いているときは切り替え不可
    $(".mode-btn").removeClass("active");
    $(this).addClass("active");
    
    // UIを初期状態にリセット
    resetUI();

    if (this.id === "mode-timer") {
      currentMode = "timer";
      $("#timer-setting").css("display", "flex");
      $("#timer-display").hide();
    } else {
      currentMode = "stopwatch";
      $("#timer-setting").hide();
      $("#timer-display").show();
    }
  });

  // タイマー開始・一時停止
  $("#timer-start-btn").on("click", function () {
    $("#input-title").text("なにをしてる？(科目・内容)");
    var $btn = $(this);
    if (!timerId) {
      // タイマーモードかつ開始前ならセット
      if (currentMode === "timer" && elapsedSec <= 0) {
        var mins = parseInt(toHalfWidth($("#input-minutes").val())) || 0;
        var secs = parseInt(toHalfWidth($("#input-seconds").val())) || 0;
        elapsedSec = (mins * 60) + secs;
        if (elapsedSec <= 0) return alert("時間を入力してね！");
        lastSeconds = elapsedSec;
        $("#timer-setting").hide();
        $("#timer-display").show();
      }
      
      $btn.find("span").text("一時停止");
      $("#timer-msg").text("おいしく結び中...");
      
      timerId = setInterval(function () {
        if (currentMode === "stopwatch") {
          elapsedSec++;
        } else {
          elapsedSec--;
          if (elapsedSec <= 0) {
            clearInterval(timerId);
            timerId = null;
            updateTimerDisplay();
            $("#timer-start-btn").hide();
            $("#timer-stop-btn").click(); // 自動で終了処理へ
            return;
          }
        }
        updateTimerDisplay();
      }, 1000);
    } else {
      // 一時停止
      clearInterval(timerId);
      timerId = null;
      $btn.find("span").text("再開する");
      $("#timer-msg").text("ちょっと休憩。");
    }
  });

  // 終了ボタン
  $("#timer-stop-btn").on("click", function () {
    if (timerId) { clearInterval(timerId); timerId = null; }
    
    // 実際に計測した時間を計算
    var recordedSec = (currentMode === "stopwatch") ? elapsedSec : (lastSeconds - elapsedSec);
    
    if (recordedSec <= 0 && currentMode === "stopwatch") return alert("まだ時間が経過していません。");
    
    lastSeconds = recordedSec; // 保存用に保持
    $("#timer-start-btn").hide();
    $(this).hide();
    $("#timer-save-btn").show();
    $("#timer-msg").text("完成！記録しよう！");
    $("#input-title").text("なにをした？(科目・内容)");
  });

  // データベースへ登録
  $("#timer-save-btn").on("click", function () {
    var subject = $("#timer-subject").val().trim();
    saveTimer(new Date().toISOString().slice(0, 10), subject, lastSeconds);
    
    // 全体をリセット
    resetUI();
    if (currentMode === "timer") {
      $("#timer-setting").css("display", "flex");
      $("#timer-display").hide();
    }
  });

  // ページネーション
  $("#prev-page").on("click", function() { if (currentPage > 1) { currentPage--; renderPage(); } });
  $("#next-page").on("click", function() { if (currentPage < Math.ceil(allItems.length / itemsPerPage)) { currentPage++; renderPage(); } });
});