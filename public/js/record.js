(function () {
  function getUid() {
    return window.EduChar.getUserIdSync();
  }

  function loadLatestZukanToRecordCharIcon() {
    var imgEl = document.querySelector(".char-icon-img");
    var uid = getUid();
    if (!imgEl || !uid || !window.firebaseDb) return;

    window.firebaseDb.ref("userOnigiriImages/" + uid)
      .orderByChild("createdAt")
      .limitToLast(1)
      .once("value")
      .then(function (snap) {
        var item = null;
        snap.forEach(function (child) {
          item = child.val() || {};
        });
        if (item && item.downloadUrl) {
          imgEl.src = item.downloadUrl;
        }
      })
      .catch(function (err) {
        console.warn("loadLatestZukanToRecordCharIcon failed:", err);
      });
  }

  // ユーザーごとにレベル1のベース画像（base.jpg）を Storage にコピーして DB にメタを登録する
  function ensureUserLevel1BaseImage(userName) {
    var uid = getUid();
    if (!uid) return Promise.resolve();
    if (!window.firebaseDb || !window.firebaseStorage) return Promise.resolve();
    if (!userName) userName = "";

    var level = 1;
    var imageId = "level1";
    var storagePath = "zukan/" + uid + "/" + imageId + "/image.jpg";

    var genRef = window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + level);

    return genRef
      .once("value")
      .then(function (snap) {
        // すでに登録済みなら何もしない
        if (snap && snap.exists()) return;

        // base.jpg を Blob にして Storage にアップロード（画像本体のコピー）
        return fetch("img/base.jpg")
          .then(function (res) {
            return res.blob();
          })
          .then(function (blob) {
            var ref = window.firebaseStorage.ref(storagePath);
            return ref.put(blob).then(function () {
              return ref.getDownloadURL();
            });
          })
          .then(function (downloadUrl) {
            var serverTs = firebase.database.ServerValue.TIMESTAMP;

            // 一覧表示用メタ
            return window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + imageId).set({
              userName: userName,
              displayName: "1レベル " + userName,
              generatedLevel: level,
              baseLevel: 0,
              baseImageId: null,
              promptUsed: "base.jpg",
              storagePath: storagePath,
              downloadUrl: downloadUrl,
              createdAt: serverTs,
            }).then(function () {
              // レベル→画像IDのインデックス
              return genRef.set({
                imageId: imageId,
                createdAt: serverTs,
              });
            });
          });
      })
      .catch(function (err) {
        console.error("Failed to ensure level1 base image:", err);
      });
  }

  /**
   * レベル2以降: L-1 の promptUsed をベースに Imagen で1枚生成 → Storage + DB
   */
  function base64ToBlob(b64, mimeType) {
    var mime = mimeType || "image/png";
    var byteCharacters = atob(b64);
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mime });
  }

  function buildEvolutionPrompt(basePrompt, targetLevel, userName) {
    var base = (basePrompt || "").trim() || "cute onigiri rice-ball character, sticker style, child-friendly";
    return (
      "Evolve this character to the next stage. Keep the same onigiri identity and charm. " +
      "Previous design notes: " +
      base +
      "\n" +
      "Target level: " +
      targetLevel +
      ". User name (optional flavor): " +
      (userName || "") +
      ". " +
      "Single illustration, sticker style, plain background, no text."
    );
  }

  function generateOneOnigiriLevel(uid, userName, targetLevel) {
    if (!uid || !window.firebaseDb || !window.firebaseStorage) {
      return Promise.reject(new Error("missing deps"));
    }
    var imageId = "level" + targetLevel;
    var storagePath = "zukan/" + uid + "/" + imageId + "/image.png";

    var baseLevel = targetLevel - 1;
    var baseGenRef = window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + baseLevel);

    return baseGenRef
      .once("value")
      .then(function (snap) {
        if (!snap || !snap.exists()) {
          throw new Error("base level " + baseLevel + " not found");
        }
        var baseImageId = snap.val().imageId;
        if (!baseImageId) throw new Error("base imageId missing");
        return window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + baseImageId).once("value");
      })
      .then(function (metaSnap) {
        var baseMeta = metaSnap.val() || {};
        var promptUsed = buildEvolutionPrompt(baseMeta.promptUsed, targetLevel, userName);
        return fetch("/api/gemini.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptUsed }),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data, promptUsed: promptUsed };
          });
        });
      })
      .then(function (out) {
        var data = out.data;
        var promptUsed = out.promptUsed;
        if (!data || !data.success || !data.imageBase64) {
          console.error("Gemini image generation failed", data);
          throw new Error((data && data.error) || "gemini failed");
        }
        var mime = data.mimeType || "image/png";
        var blob = base64ToBlob(data.imageBase64, mime);
        var ref = window.firebaseStorage.ref(storagePath);
        return ref.put(blob, { contentType: mime }).then(function () {
          return ref.getDownloadURL().then(function (downloadUrl) {
            return { downloadUrl: downloadUrl, promptUsed: promptUsed, mime: mime };
          });
        });
      })
      .then(function (uploaded) {
        var serverTs = firebase.database.ServerValue.TIMESTAMP;
        var displayName = targetLevel + "レベル " + (userName || "");
        return window.firebaseDb
          .ref("userOnigiriImages/" + uid + "/" + imageId)
          .set({
            userName: userName || "",
            displayName: displayName,
            generatedLevel: targetLevel,
            baseLevel: baseLevel,
            baseImageId: "level" + baseLevel,
            promptUsed: uploaded.promptUsed,
            storagePath: storagePath,
            downloadUrl: uploaded.downloadUrl,
            createdAt: serverTs,
          })
          .then(function () {
            return window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + targetLevel).set({
              imageId: imageId,
              createdAt: serverTs,
            });
          })
          .then(function () {
            return window.firebaseDb.ref("userLevelState/" + uid).update({
              lastGeneratedLevel: targetLevel,
              updatedAt: serverTs,
            });
          });
      });
  }

  /**
   * 現在のゲームレベル currentLevel まで、不足しているレベル分を順に生成（2→currentLevel）
   */
  function maybeGenerateMissingOnigiri(uid, userName, currentLevel) {
    if (!uid || !window.firebaseStorage || !currentLevel || currentLevel < 2) {
      return Promise.resolve();
    }
    if (window.__eduCharOnigiriGenRunning) {
      return Promise.resolve();
    }
    window.__eduCharOnigiriGenRunning = true;

    function runFrom(L) {
      if (L > currentLevel) {
        window.__eduCharOnigiriGenRunning = false;
        try {
          localStorage.setItem(LEVEL_REFRESH_KEY, String(Date.now()));
        } catch (e) {}
        return Promise.resolve();
      }
      return window.firebaseDb
        .ref("userGeneratedForLevel/" + uid + "/" + L)
        .once("value")
        .then(function (snap) {
          if (snap && snap.exists()) {
            return runFrom(L + 1);
          }
          return generateOneOnigiriLevel(uid, userName, L)
            .then(function () {
              return runFrom(L + 1);
            })
            .catch(function (err) {
              console.error("Onigiri gen failed at level " + L + ":", err);
              window.__eduCharOnigiriGenRunning = false;
            });
        });
    }

    return window.firebaseDb
      .ref("userGeneratedForLevel/" + uid + "/1")
      .once("value")
      .then(function (s1) {
        if (!s1 || !s1.exists()) {
          window.__eduCharOnigiriGenRunning = false;
          return;
        }
        return runFrom(2);
      })
      .catch(function (err) {
        console.error("maybeGenerateMissingOnigiri:", err);
        window.__eduCharOnigiriGenRunning = false;
      });
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

  // --- レベル表示（保存のたびに更新） ---
  var LEVEL_REFRESH_KEY = "edu_char_level_refresh";
  // テスト点を「ふん（経験値）」に換算する倍率（調整ポイント）
  var SCORE_TO_MINUTES_FACTOR = 0.5; // 例: 100点 => 50ふん
  // レベルに必要なふん（簡易カーブ）
  var LEVEL_BASE_MINUTES = 120; // level 1 の必要ふん
  var LEVEL_INCREMENT_MINUTES = 60; // level が上がるごとの増分

  function minutesRequiredForLevel(level) {
    // level=1 => 120, level=2 => 180 ... のように増える
    return LEVEL_BASE_MINUTES + (level - 1) * LEVEL_INCREMENT_MINUTES;
  }

  function computeLevelFromExpMinutes(expMinutes) {
    if (!isFinite(expMinutes) || expMinutes < 0) expMinutes = 0;

    var level = 1;
    var expIntoLevel = expMinutes;

    // どのレベル帯にいるかを決める
    while (true) {
      var need = minutesRequiredForLevel(level);
      if (need <= 0) break;
      if (expIntoLevel < need) break;
      expIntoLevel -= need;
      level += 1;

      // 念のための上限（データ破損対策）
      if (level > 9999) break;
    }

    var finalNeed = minutesRequiredForLevel(level);
    var remaining = Math.max(0, finalNeed - expIntoLevel);
    var percent = finalNeed > 0 ? (expIntoLevel / finalNeed) * 100 : 0;
    percent = Math.min(100, Math.max(0, percent));

    return {
      level: level,
      remainingMinutes: Math.ceil(remaining),
      percent: percent
    };
  }

  function fetchTotalTimerSeconds(uid) {
    if (!window.firebaseDb || !uid) return Promise.resolve(0);
    return window.firebaseDb.ref("timerMemos/" + uid).once("value").then(function (snap) {
      var totalSeconds = 0;
      snap.forEach(function (child) {
        var data = child.val() || {};
        var s = 0;
        if (data.seconds !== undefined) {
          s = parseInt(data.seconds, 10) || 0;
        } else if (data.minutes !== undefined) {
          s = (parseInt(data.minutes, 10) || 0) * 60;
        }
        totalSeconds += s;
      });
      return totalSeconds;
    }).catch(function () {
      return 0;
    });
  }

  function fetchTotalScore(uid) {
    if (!window.firebaseDb || !uid) return Promise.resolve(0);
    return window.firebaseDb.ref("scoreMemos/" + uid).once("value").then(function (snap) {
      var totalScore = 0;
      snap.forEach(function (child) {
        var data = child.val() || {};
        var v = parseInt(data.score, 10);
        if (isFinite(v) && v > 0) totalScore += v;
      });
      return totalScore;
    }).catch(function () {
      return 0;
    });
  }

  function updateLevelUI(levelResult) {
    var levelEl = document.getElementById("level-value");
    var remainingEl = document.getElementById("next-level-remaining");
    var barEl = document.getElementById("exp-bar-fill");

    if (levelEl) levelEl.textContent = String(levelResult.level);
    if (remainingEl) remainingEl.textContent = "あと " + String(levelResult.remainingMinutes) + " ふん";
    if (barEl) barEl.style.width = levelResult.percent.toFixed(1) + "%";
  }

  function updateLevelAndProgress() {
    var uid = getUid();
    if (!uid || !window.firebaseDb) return;

    Promise.all([fetchTotalTimerSeconds(uid), fetchTotalScore(uid)]).then(function (results) {
      var totalTimerSeconds = results[0] || 0;
      var totalScore = results[1] || 0;

      var timerMinutes = Math.floor(totalTimerSeconds / 60);
      var scoreMinutes = totalScore * SCORE_TO_MINUTES_FACTOR;
      var expMinutes = timerMinutes + scoreMinutes;

      var levelResult = computeLevelFromExpMinutes(expMinutes);
      updateLevelUI(levelResult);

      // レベル1(base.jpg) を先に確保してから、不足レベル分を Imagen で生成
      loadProfileGradeAndName(function (grade, name) {
        ensureUserLevel1BaseImage(name || "")
          .then(function () {
            return maybeGenerateMissingOnigiri(uid, name || "", levelResult.level);
          })
          .catch(function (e) {
            console.warn("ensure level1 / onigiri gen chain:", e);
          });
      });
    });
  }

  function refreshLevelAndProgress() {
    updateWeeklyTotal(); // 週の合計は別集計なので併せて更新
    updateLevelAndProgress();
  }

  function bindLevelRefreshEvents() {
    if (window.__eduCharLevelRefreshBound) return;
    window.__eduCharLevelRefreshBound = true;

    window.addEventListener("storage", function (e) {
      if (!e || e.key !== LEVEL_REFRESH_KEY) return;
      refreshLevelAndProgress();
    });
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
    // ensureProfileThen は Promise を返さないので .then で繋がない
    window.EduChar.ensureProfileThen("record.html");

    // ログイン後/プロフィール確定後の初期化を実行
    //（プロフィールが無い場合は ensureProfileThen がリダイレクトするため、ここで動いても表示は null uid で止まる）
    setDefaultDate();
    loadProfileGradeAndName(function (grade, name) {
      var g = document.getElementById("memo-grade");
      var n = document.getElementById("memo-name");
      if (g && grade) g.value = grade;
      if (n && name) n.value = name;

      // ここでユーザーごとの base.jpg を Storage にコピーしておく
      ensureUserLevel1BaseImage(name);
      loadLatestZukanToRecordCharIcon();
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
    loadMemos();
    bindLevelRefreshEvents();
    refreshLevelAndProgress();

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