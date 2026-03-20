(function () {
  function getUid() {
    return window.EduChar.getUserIdSync();
  }


 // 一週間の合計分数を表示させるための確定版コード
  function updateWeeklyTotal() {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;

    // --- 1. 今週の月曜日を YYYY-MM-DD 形式で計算 ---
    var now = new Date();
    var tempDate = new Date(now.getTime());
    var day = tempDate.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    tempDate.setDate(tempDate.getDate() + diff);
    var startDate = tempDate.getFullYear() + "-" + 
                    String(tempDate.getMonth() + 1).padStart(2, "0") + "-" + 
                    String(tempDate.getDate()).padStart(2, "0");

    console.log("今週の開始日:", startDate);

    // --- 2. Firebaseから取得して計算 ---
    window.firebaseDb.ref("timerMemos/" + uid)
      .once("value")
      .then(function (snap) {
        var totalSeconds = 0;
        
        snap.forEach(function (child) {
          var data = child.val();
          
          console.log("データ:", data);
          
          // 今週の開始日以降のデータのみ対象
          if (data.date && data.date >= startDate) {
            var s = parseInt(data.seconds, 10) || 0;
            totalSeconds += s;
            console.log("追加秒数:", s, "合計:", totalSeconds);
          } else {
            console.log("今週外:", data.date);
          }
        });

        // --- 3. 分に変換して画面に表示 ---
        var totalMinutes = Math.floor(totalSeconds / 60);
        var weeklyEl = document.getElementById("weekly-minutes");
        
        console.log("合計分数:", totalMinutes);
        
        if (weeklyEl) {
          weeklyEl.textContent = totalMinutes;
        }
      })
      .catch(function (err) {
        console.error("週間合計の取得失敗:", err);
      });
  }

  function updateWeeklyChart() {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;

    // 今週の開始日（月曜日）を計算
    var now = new Date();
    var tempDate = new Date(now.getTime());
    var day = tempDate.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    tempDate.setDate(tempDate.getDate() + diff);
    var startDate = tempDate.getFullYear() + "-" + 
                    String(tempDate.getMonth() + 1).padStart(2, "0") + "-" + 
                    String(tempDate.getDate()).padStart(2, "0");

    // 今週の日付配列を作成（月〜日）
    var weekDates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(tempDate);
      d.setDate(tempDate.getDate() + i);
      weekDates.push(d.getFullYear() + "-" + 
                     String(d.getMonth() + 1).padStart(2, "0") + "-" + 
                     String(d.getDate()).padStart(2, "0"));
    }

    // データベースから今週のデータを取得
    window.firebaseDb.ref("timerMemos/" + uid)
      .once("value")
      .then(function (snap) {
        var dailyMinutes = [0, 0, 0, 0, 0, 0, 0]; // 月〜日

        snap.forEach(function (child) {
          var data = child.val();
          if (data.date && data.date >= startDate && data.seconds !== undefined) {
            var dateIndex = weekDates.indexOf(data.date);
            if (dateIndex !== -1) {
              dailyMinutes[dateIndex] += Math.floor(data.seconds / 60);
            }
          }
        });

        // 最大値を計算（高さの基準）
        var maxMinutes = Math.max(...dailyMinutes, 1); // 最低1分

        // 棒グラフの要素を取得
        var bars = document.querySelectorAll('.flex.items-end.justify-between.h-32 .w-full');
        if (bars.length === 7) {
          bars.forEach(function (bar, index) {
            var heightPercent = (dailyMinutes[index] / maxMinutes) * 100;
            heightPercent = Math.max(heightPercent, 5); // 最低5%
            bar.style.height = heightPercent + '%';
          });
        }

        console.log("週間チャート更新:", dailyMinutes);
      })
      .catch(function (err) {
        console.error("週間チャート取得失敗:", err);
      });
  }

  function updateLoginStreak() {
    var uid = getUid();
    if (!window.firebaseDb || !uid) return;

    // timerMemos から日付を取得して連続日数を計算
    window.firebaseDb.ref("timerMemos/" + uid)
      .once("value")
      .then(function (snap) {
        var dates = new Set();
        snap.forEach(function (child) {
          var data = child.val();
          if (data.date) {
            dates.add(data.date);
          }
        });

        // 日付をソート
        var sortedDates = Array.from(dates).sort();

        // 今日の日付（JST）
        var now = new Date();
        var jstOffset = now.getTimezoneOffset() + 540;
        now.setMinutes(now.getMinutes() + jstOffset);
        var today = now.getFullYear() + "-" + 
                    String(now.getMonth() + 1).padStart(2, "0") + "-" + 
                    String(now.getDate()).padStart(2, "0");

        // 連続日数を計算
        var streak = 0;
        var currentDate = new Date(today);
        while (true) {
          var dateStr = currentDate.getFullYear() + "-" + 
                        String(currentDate.getMonth() + 1).padStart(2, "0") + "-" + 
                        String(currentDate.getDate()).padStart(2, "0");
          if (dates.has(dateStr)) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
          } else {
            break;
          }
        }

        // 表示
        var streakEl = document.getElementById("login-streak");
        if (streakEl) {
          streakEl.textContent = streak;
        }

        console.log("連続ログイン日数:", streak);
      })
      .catch(function (err) {
        console.error("連続ログイン日数取得失敗:", err);
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
      updateWeeklyChart(); // 週間チャートの更新
      updateLoginStreak(); // 連続ログイン日数の更新
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