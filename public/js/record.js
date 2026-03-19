(function () {
  function getUid() {
    return window.EduChar.getUserIdSync();
  }


 // 一週間の合計分数を表示させるための確定版コード
  function updateWeeklyTotal() {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;

    // --- 1. 今週の月曜日 0:00 のタイムスタンプを正確に計算 ---
    var now = new Date();
    var tempDate = new Date(now.getTime()); // 元の時間を壊さないようにコピー
    var day = tempDate.getDay(); // 0:日, 1:月...
    
    // 月曜日(1)を起点にする。日曜日(0)なら-6日、それ以外は 1-day
    var diff = (day === 0) ? -6 : 1 - day;
    tempDate.setDate(tempDate.getDate() + diff);
    tempDate.setHours(0, 0, 0, 0);
    var mondayTimestamp = tempDate.getTime();

    // --- 2. Firebaseから取得して計算 ---
    window.firebaseDb.ref("timerMemos/" + uid)
      .once("value")
      .then(function (snap) {
        var totalSeconds = 0;
        
        snap.forEach(function (child) {
          var data = child.val();
          
          // 今週の月曜以降に作られたデータのみ対象
          if (data.createdAt && data.createdAt >= mondayTimestamp) {
            // secondsがあれば優先、なければminutesを秒換算して足す
            var s = 0;
            if (data.seconds !== undefined) {
              s = parseInt(data.seconds, 10) || 0;
            } else if (data.minutes !== undefined) {
              s = (parseInt(data.minutes, 10) || 0) * 60;
            }
            totalSeconds += s;
          }
        });

        // --- 3. 分に変換して画面に表示 ---
        var totalMinutes = Math.floor(totalSeconds / 60);
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