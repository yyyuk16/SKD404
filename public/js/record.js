(function () {
  function getUid() {
    return window.EduChar.getUserIdSync();
  }

  // --- 【追加】今週のタイマー合計時間を計算して表示する関数 ---
  function updateWeeklyTotal() {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;

    // 今週の月曜日 0:00 のタイムスタンプを計算
    var now = new Date();
    var day = now.getDay(); // 0(日)〜6(土)
    // 月曜日(1)を起点にする計算（日曜日の場合は前週の月曜へ）
    var diff = now.getDate() - day + (day === 0 ? -6 : 1);
    var monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    var mondayTimestamp = monday.getTime();

    // タイマー記録（timerMemos）から今週分を取得
    window.firebaseDb.ref("timerMemos/" + uid)
      .orderByChild("createdAt")
      .startAt(mondayTimestamp)
      .once("value")
      .then(function (snap) {
        var totalSeconds = 0;
        snap.forEach(function (child) {
          var data = child.val();
          if (data.seconds) {
            totalSeconds += data.seconds;
          } else if (data.minutes) {
            totalSeconds += (data.minutes * 60);
          }
        });

        // 秒を分に変換（小数点以下切り捨て）
        var totalMinutes = Math.floor(totalSeconds / 60);

        // HTMLの id="weekly-minutes" を書き換え
        var weeklyEl = document.getElementById("weekly-minutes");
        if (weeklyEl) {
          weeklyEl.textContent = totalMinutes;
        }
      })
      .catch(function (err) {
        console.error("週間合計の取得失敗:", err);
      });
  }

  function loadProfileGradeAndName(cb) {
    var uid = getUid();
    if (!uid) {
      if (cb) cb("", "");
      return;
    }
    if (window.EduChar && typeof window.EduChar.getProfile === "function") {
      window.EduChar.getProfile(uid, function (p) {
        if (cb) cb((p && p.grade) || "", (p && p.name) || "");
      });
      return;
    }
    if (!window.firebaseDb) {
      if (cb) cb("", "");
      return;
    }
    window.firebaseDb.ref("profiles/" + uid).once("value").then(function (snap) {
      var p = snap.val();
      if (cb) cb((p && p.grade) || "", (p && p.name) || "");
    }).catch(function () {
      if (cb) cb("", "");
    });
  }

  function setDefaultDate() {
    var today = new Date().toISOString().slice(0, 10);
    var el = document.getElementById("memo-date");
    if (el && !el.value) el.value = today;
  }

  function saveMemo(date, grade, name, body) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    var ref = window.firebaseDb.ref("memos/" + uid).push();
    ref.set({
      date: date,
      grade: grade,
      name: name,
      body: body,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("保存しました。");
      var bodyEl = document.getElementById("memo-body");
      if (bodyEl) bodyEl.value = "";
      loadMemos();
    }).catch(function (err) {
      alert("保存に失敗しました: " + (err.message || err));
    });
  }

  function loadMemos() {
    var uid = getUid();
    var listEl = document.getElementById("memo-list");
    if (!listEl) return;
    if (!window.firebaseDb || !uid) {
      listEl.innerHTML = "<li>記録はありません。</li>";
      return;
    }
    window.firebaseDb.ref("memos/" + uid).orderByChild("createdAt").limitToLast(30).once("value").then(function (snap) {
      var items = [];
      snap.forEach(function (child) {
        var v = child.val();
        items.push({ key: child.key, date: v.date, grade: v.grade, name: v.name, body: v.body });
      });
      items.reverse();
      if (items.length === 0) {
        listEl.innerHTML = "<li>まだ記録がありません。</li>";
        return;
      }
      listEl.innerHTML = items.map(function (m) {
        var line = (m.date || "") + (m.name ? " / " + m.name : "") + (m.grade ? " [" + m.grade + "]" : "");
        return "<li class=\"memo-item\"><span class=\"memo-date\">" + line + "</span><div class=\"memo-body\">" + (m.body || "").replace(/</g, "&lt;") + "</div></li>";
      }).join("");
    });
  }

  // --- メイン処理 ---
  $(function () {
    window.EduChar.ensureProfileThen("record.html").then(function() {
      // ログイン後に実行
      setDefaultDate();
      loadProfileGradeAndName(function (grade, name) {
        var g = document.getElementById("memo-grade");
        var n = document.getElementById("memo-name");
        if (g && grade) g.value = grade;
        if (n && name) n.value = name;
      });
      loadMemos();
      updateWeeklyTotal(); // タイマー合計の更新
    });

    $("#memo-form").on("submit", function (e) {
      e.preventDefault();
      var date = $("#memo-date").val();
      var grade = $("#memo-grade").val();
      var name = $("#memo-name") ? $("#memo-name").val().trim() : "";
      var body = $("#memo-body") ? $("#memo-body").val().trim() : "";
      
      if (!date) {
        alert("日付を入力してください。");
        return;
      }
      saveMemo(date, grade, name, body);
    });
  });
})();