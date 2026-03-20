$(function () {
  // --- 1. 共通設定・変数 ---
  var allItems = [];
  var currentPage = 1;
  var itemsPerPage = 5;

  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  function toHalfWidth(str) {
    if (!str) return "";
    return str.replace(/[０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/[^0-9]/g, '');
  }

  // --- 2. 履歴データの読み込みと表示 (ここが不足していました) ---

  function loadTimers() {
    var uid = getUid();
    if (!uid) return;
    
    // データベースから取得して新しい順に並べる
    window.firebaseDb.ref("timerMemos/" + uid).orderByChild("createdAt").once("value").then(function (snap) {
      allItems = [];
      snap.forEach(function (child) {
        allItems.push(child.val());
      });
      allItems.reverse(); // 降順にする
      renderPage();
    }).catch(function(e) {
      console.error("履歴読み込みエラー:", e);
    });
  }

  function renderPage() {
    var listEl = document.getElementById("timer-list");
    var pageDisplay = document.getElementById("page-number");
    if (!listEl) return;

    var totalPages = Math.ceil(allItems.length / itemsPerPage) || 1;
    var start = (currentPage - 1) * itemsPerPage;
    var pageItems = allItems.slice(start, start + itemsPerPage);

    // リストのHTML生成
    listEl.innerHTML = pageItems.length === 0 ? "<li>まだ記録がないよ！</li>" : pageItems.map(function (m) {
      var sec = m.seconds || 0;
      var displayTime = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
      return '<li class="memo-item pencil-border"><div class="memo-content"><div class="memo-upper"><span class="memo-subject">' + (m.subject || "内容なし") + '</span><span class="memo-time-tag">' + displayTime + '</span></div><div class="memo-lower"><span class="memo-date">' + m.date + ' ' + (m.time || "") + '</span></div></div></li>';
    }).join("");

    // ページ番号の更新
    if (pageDisplay) pageDisplay.textContent = currentPage + " / " + totalPages;
    $("#prev-page").prop("disabled", currentPage === 1);
    $("#next-page").prop("disabled", currentPage === totalPages);
  }

  // --- 3. プリセット（いつもの時間）読み込み ---

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
      if (!html) {
        html = '<li style="border:none; color:#ccc; pointer-events:none;">保存された時間がありません</li>';
      }
      $("#preset-ul").html(html);
    });
  }

  // --- 4. メイン：データベース登録処理 ---

  function saveManualRecord() {
    var uid = getUid();
    if (!uid) return alert("ログインしてね！");

    var mins = parseInt(toHalfWidth($("#input-minutes").val())) || 0;
    var secs = parseInt(toHalfWidth($("#input-seconds").val())) || 0;
    var subject = $("#timer-subject").val().trim();
    var totalSeconds = (mins * 60) + secs;

    if (totalSeconds <= 0) return alert("勉強時間を入力してね！");
    if (!subject) return alert("なにを勉強したか入力してね！");

    var now = new Date();
    var dateStr = now.getFullYear() + "-" + 
                  String(now.getMonth() + 1).padStart(2, "0") + "-" + 
                  String(now.getDate()).padStart(2, "0");
    var timeStr = String(now.getHours()).padStart(2, "0") + ":" + 
                  String(now.getMinutes()).padStart(2, "0");

    var $saveBtn = $("#manual-save-btn");
    $saveBtn.prop("disabled", true).css("opacity", 0.6);

    window.firebaseDb.ref("timerMemos/" + uid).push().set({
      date: dateStr,
      time: timeStr,
      subject: subject,
      seconds: totalSeconds,
      mode: "manual",
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("記録しました！");

      // 別タブの `record.html` が開いている場合も、保存のたびに表示更新する
      try {
        localStorage.setItem("edu_char_level_refresh", String(Date.now()));
      } catch (e) {}

      $("#input-minutes, #input-seconds, #timer-subject").val("");
      $saveBtn.prop("disabled", false).css("opacity", 1);
      
      // もし履歴が開いていたら、リストを即座に更新する
      if ($("#history-content").is(":visible")) {
        loadTimers();
      }
    }).catch(function (error) {
      alert("失敗したよ：" + error.message);
      $saveBtn.prop("disabled", false).css("opacity", 1);
    });
  }

  // --- 5. イベント設定 ---

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

  // 登録ボタン
  $("#manual-save-btn").on("click", function () {
    saveManualRecord();
  });

  // ページネーションボタン
  $("#prev-page").on("click", function() {
    if (currentPage > 1) { currentPage--; renderPage(); }
  });
  $("#next-page").on("click", function() {
    if (currentPage < Math.ceil(allItems.length / itemsPerPage)) { currentPage++; renderPage(); }
  });

  // モーダル操作
  $("#open-preset-modal").on("click", function() { $("#preset-modal").fadeIn(200); });
  $("#close-preset-modal").on("click", function() { $("#preset-modal").fadeOut(200); });

  $(document).on("click", "#preset-ul li", function() {
    var mins = $(this).data("mins");
    var secs = $(this).data("secs");
    if (mins !== undefined) {
      $("#input-minutes").val(mins);
      $("#input-seconds").val(secs);
      $("#preset-modal").fadeOut(200);
    }
  });

  // --- 6. 初期実行 ---
  window.EduChar.ensureProfileThen("record-manual.html");
  loadPresets();
});