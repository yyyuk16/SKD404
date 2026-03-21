(function () {
  function getUid() {
    return window.EduChar.getUserIdSync();
  }

  // 小学生向けレベル要件（累積学習時間：分）
  const levelRequirements = {
    1: 0, 2: 10, 3: 20, 4: 30, 5: 40, 6: 50, 7: 60, 8: 72, 9: 84, 10: 96,
    11: 108, 12: 123, 13: 138, 14: 153, 15: 168, 16: 188, 17: 208, 18: 228, 19: 248, 20: 268,
    21: 290, 22: 312, 23: 337, 24: 362, 25: 387, 26: 412, 27: 440, 28: 468, 29: 498, 30: 528,
    31: 558, 32: 590, 33: 622, 34: 657, 35: 692, 36: 727, 37: 765, 38: 803, 39: 843, 40: 883,
    41: 925, 42: 967, 43: 1012, 44: 1057, 45: 1102, 46: 1152, 47: 1204, 48: 1259, 49: 1314, 50: 1369,
    51: 1429, 52: 1491, 53: 1556, 54: 1621, 55: 1686, 56: 1756, 57: 1828, 58: 1903, 59: 1978, 60: 2053,
    61: 2133, 62: 2215, 63: 2300, 64: 2385, 65: 2470, 66: 2560, 67: 2652, 68: 2747, 69: 2842, 70: 2937,
    71: 3037, 72: 3139, 73: 3244, 74: 3349, 75: 3454, 76: 3564, 77: 3676, 78: 3791, 79: 3906, 80: 4021,
    81: 4141, 82: 4263, 83: 4388, 84: 4513, 85: 4638, 86: 4773, 87: 4908, 88: 5048, 89: 5188, 90: 5328,
    91: 5478, 92: 5638, 93: 5808, 94: 5988, 95: 6188, 96: 6408, 97: 6658, 98: 6938, 99: 7238
  };

  // 累積学習時間を取得（全期間）
  function getTotalLearningMinutes(uid) {
    return window.firebaseDb.ref("timerMemos/" + uid)
      .once("value")
      .then(function (snap) {
        var totalSeconds = 0;
        snap.forEach(function (child) {
          var data = child.val();
          totalSeconds += parseInt(data.seconds, 10) || 0;
        });
        return Math.floor(totalSeconds / 60);
      });
  }

  /**
   * 図鑑に「実画像」があるレベルの最大値のみを採用する。
   * userGeneratedForLevel だけ立っていて画像が無いと lastLevel が水増しされ、
   * currentLevel <= lastLevel でレベル2以降の生成が永久にスキップされるため。
   */
  function getMaxGeneratedLevelFromFirebase(uid) {
    if (!window.firebaseDb || !uid) return Promise.resolve(0);
    return window.firebaseDb.ref("userOnigiriImages/" + uid).once("value").then(function (snap) {
      var max = 0;
      snap.forEach(function (child) {
        var v = child.val() || {};
        var g = parseInt(v.generatedLevel, 10);
        if (isNaN(g) || g < 1) return;
        var hasImage = !!(v.downloadUrl || v.storagePath);
        if (!hasImage) return;
        if (g > max) max = g;
      });
      return max;
    });
  }

  // レベル計算
  function getUserLevel(totalMinutes) {
    for (let level = 99; level >= 1; level--) {
      if (totalMinutes >= levelRequirements[level]) {
        return level;
      }
    }
    return 1;
  }

  /** レベル帯ごとのらんく表示（ひらがな表記） */
  function getRankForLevel(level) {
    var lv = parseInt(level, 10) || 1;
    if (lv >= 71) return "ぷらちな";
    if (lv >= 41) return "ごーるど";
    if (lv >= 21) return "しるばー";
    if (lv >= 11) return "ぶろんず";
    return "びぎなー";
  }

  /** レベル帯ごとの称号 */
  function getTitleForLevel(level) {
    var lv = parseInt(level, 10) || 1;
    if (lv >= 71) return "レジェンドマスター";
    if (lv >= 41) return "チャレンジマスター";
    if (lv >= 21) return "がんばりマスター";
    if (lv >= 11) return "べんきょうマスター";
    return "はじめの一歩";
  }

  // おにぎり生成用のプロンプト作成
  function buildGeminiPromptForOnigiri(profile, level) {
    var desc = [];
    if (profile.subject) desc.push(profile.subject + "をイメージした服装や小物");
    if (profile.hobby) desc.push(profile.hobby + "を連想させるポーズやアイテム");
    if (desc.length === 0) desc.push("学びを応援する明るい雰囲気");
    return "レベル" + level + "のおにぎりキャラクター、児童・生徒向けの親しみやすいイラスト、" + desc.join("、") + "。かわいいおにぎりモチーフ、一枚絵、キャラクター中心。";
  }

  /**
   * 新しいレベルのおにぎりを生成
   * @returns {Promise<boolean>} 成功または既に存在なら true、失敗なら false
   */
  async function generateNewOnigiriForLevel(uid, newLevel, profile) {
    var imageId = "level" + newLevel;
    var imgRef = window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + imageId);
    var imgSnap = await imgRef.once("value");
    if (imgSnap.exists()) {
      var existing = imgSnap.val() || {};
      if (existing.downloadUrl || existing.storagePath) {
        var genRefOk = window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + newLevel);
        await genRefOk.set({
          imageId: imageId,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        return true;
      }
    }

    var genRef = window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + newLevel);
    var snap = await genRef.once("value");
    if (snap.exists()) {
      try {
        await genRef.remove();
      } catch (e) {
        console.warn("userGeneratedForLevel の孤立フラグ削除に失敗:", e);
      }
    }

    if (!window.firebaseStorage) {
      console.error("おにぎり生成: Firebase Storage が使えません（firebase-storage-compat の読み込みを確認）");
      return false;
    }

    try {
      var prompt = buildGeminiPromptForOnigiri(profile, newLevel);

      var response = await fetch("/api/gemini.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          prompt: prompt,
          useSkd404Style: true,
          current_level: newLevel,
          is_level_up: true,
          learning_theme: profile.subject || "General Study"
        })
      });
      var data = await response.json();
      if (!data || !data.success || !data.imageBase64) {
        if (data && (data.message || data.body || data.detail)) {
          console.error("Imagen API 詳細:", data.message || data.detail || "", data.body || "");
        }
        throw new Error((data && data.message) || (data && data.error) || "Image generation failed");
      }

      var byteCharacters = atob(data.imageBase64);
      var byteNumbers = new Array(byteCharacters.length);
      for (var i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      var byteArray = new Uint8Array(byteNumbers);
      var blob = new Blob([byteArray], { type: data.mimeType || "image/png" });

      var storagePath = "zukan/" + uid + "/" + imageId + "/image.jpg";
      var storageRef = window.firebaseStorage.ref(storagePath);
      await storageRef.put(blob);
      var downloadUrl = await storageRef.getDownloadURL();

      var serverTs = firebase.database.ServerValue.TIMESTAMP;
      await window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + imageId).set({
        userName: profile.name || "",
        displayName: newLevel + "レベル " + (profile.name || ""),
        generatedLevel: newLevel,
        baseLevel: 0,
        baseImageId: null,
        promptUsed: prompt,
        storagePath: storagePath,
        downloadUrl: downloadUrl,
        createdAt: serverTs
      });

      await genRef.set({ imageId: imageId, createdAt: serverTs });
      return true;
    } catch (e) {
      console.error("おにぎり生成失敗:", e);
      return false;
    }
  }

  /**
   * 記録ページのプロフィールアイコンを、現在レベルで生成済みの画像に差し替える（未生成ならデフォルト）
   * @param {boolean} forceRefresh 真のときは同一レベルでも Firebase を読み直す（レベルアップ直後の画像更新用）
   */
  function refreshRecordCharacterIcon(uid, currentLevel, forceRefresh) {
    var imgEl = document.getElementById("record-char-icon-img");
    if (!imgEl || !uid || !window.firebaseDb) return Promise.resolve();
    if (
      !forceRefresh &&
      imgEl.dataset.charIconUid === uid &&
      String(imgEl.dataset.charIconLevel) === String(currentLevel)
    ) {
      return Promise.resolve();
    }
    var imageId = "level" + currentLevel;
    return window.firebaseDb
      .ref("userOnigiriImages/" + uid + "/" + imageId)
      .once("value")
      .then(function (snap) {
        var item = snap.val();
        if (item && item.downloadUrl) {
          imgEl.src = item.downloadUrl;
          imgEl.alt = "レベル" + currentLevel + "のおにぎりキャラクター";
        } else {
          imgEl.src = "img/shake.png";
          imgEl.alt = "キャラクターアイコン";
        }
        imgEl.dataset.charIconUid = uid;
        imgEl.dataset.charIconLevel = String(currentLevel);
      })
      .catch(function () {
        imgEl.src = "img/shake.png";
        imgEl.alt = "キャラクターアイコン";
        imgEl.dataset.charIconUid = uid;
        imgEl.dataset.charIconLevel = String(currentLevel);
      });
  }

  /**
   * レベルアップ後のおにぎり画像生成中に表示するバナー（record.html の #onigiri-generating-status）
   * @param {number|null} level 生成対象レベル（省略時は汎用メッセージ）
   */
  function showOnigiriGeneratingBanner(level) {
    var el = document.getElementById("onigiri-generating-status");
    if (!el) return;
    var textEl = el.querySelector(".onigiri-generating-text");
    if (textEl) {
      if (level != null && level !== "") {
        textEl.textContent = "レベル" + level + "の 新しいおにぎりを生成中だよ！";
      } else {
        textEl.textContent = "新しいおにぎりを生成中だよ！";
      }
    }
    el.removeAttribute("hidden");
    el.setAttribute("aria-hidden", "false");
  }

  function hideOnigiriGeneratingBanner() {
    var el = document.getElementById("onigiri-generating-status");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
  }

  // レベルアップポップアップ表示（Firebase に保存した生成画像の URL を表示してから開く）
  async function showLevelUpPopup(newLevel, downloadUrl) {
    $("#new-name").text("レベル" + newLevel + "のおにぎり");
    var uid = getUid();
    var imageId = "level" + newLevel;
    var url = downloadUrl || null;
    if (!url && uid && window.firebaseDb) {
      var snap = await window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + imageId).once("value");
      var item = snap.val();
      if (item && item.downloadUrl) url = item.downloadUrl;
    }
    if (url) {
      $("#record-popup-main-img").attr("src", url);
      $("#record-popup-rolling-img").attr("src", url);
    }
    $("#new-onigiri-popup").fadeIn(300);
  }

  // ユーザーレベル更新（累積学習時間に応じたレベル表示 ＋ レベルアップごとにおにぎり画像生成）
  async function updateUserLevel() {
    var uid = getUid();
    if (!uid || !window.firebaseDb) return;

    try {
      var totalMinutes = await getTotalLearningMinutes(uid);
      var currentLevel = getUserLevel(totalMinutes);

      var levelEl = document.getElementById("level-value");
      if (levelEl) levelEl.textContent = currentLevel;

      // ランク表示更新
      var rankEl = document.getElementById("rank-value");
      if (rankEl) {
        rankEl.textContent = getRankForLevel(currentLevel);
      }

      // 称号表示更新
      var titleEl = document.getElementById("title-value");
      if (titleEl) {
        titleEl.textContent = getTitleForLevel(currentLevel);
      }

      var nextLevel = currentLevel + 1;
      var nextLevelRequirement = levelRequirements[nextLevel] || levelRequirements[99];
      var remainingMinutes = Math.max(0, nextLevelRequirement - totalMinutes);

      var remainingEl = document.getElementById("next-level-remaining");
      if (remainingEl) remainingEl.textContent = "あと " + remainingMinutes + " ふん";

      var currentLevelRequirement = levelRequirements[currentLevel] || 0;
      var progressInLevel = totalMinutes - currentLevelRequirement;
      var levelRange = nextLevelRequirement - currentLevelRequirement;
      var progressPercent = levelRange > 0 ? Math.min(100, (progressInLevel / levelRange) * 100) : 100;

      var barEl = document.getElementById("exp-bar-fill");
      if (barEl) barEl.style.width = progressPercent + "%";

      await refreshRecordCharacterIcon(uid, currentLevel);

      // ホーム等と揃えるためプロフィールに現在レベルを保存
      await window.firebaseDb.ref("profiles/" + uid).update({ onigiriLevel: currentLevel });
      if (window.EduChar && typeof window.EduChar.clearProfileCache === "function") {
        window.EduChar.clearProfileCache();
      }

      var profileSnap = await window.firebaseDb.ref("profiles/" + uid).once("value");
      var profile = profileSnap.val() || {};

      var maxFromDb = await getMaxGeneratedLevelFromFirebase(uid);
      // 未設定は 0（レベル1のおにぎりを「未生成」として扱う）。既定を 1 にすると currentLevel===1 で常にスキップされる
      var lastFromStorage = parseInt(localStorage.getItem("last_user_level_" + uid) || "0", 10);
      if (isNaN(lastFromStorage) || lastFromStorage < 0) lastFromStorage = 0;
      // 旧バグで「1」と保存されたが図鑑に1件も無い → 0 に戻して初回生成を許可
      if (maxFromDb === 0 && lastFromStorage === 1) {
        lastFromStorage = 0;
        localStorage.setItem("last_user_level_" + uid, "0");
      }
      // localStorage だけ先に進んでいる（例: 旧不整合）→ DB の実画像に合わせる
      if (lastFromStorage > maxFromDb) {
        lastFromStorage = maxFromDb;
        localStorage.setItem("last_user_level_" + uid, String(maxFromDb));
      }
      var lastLevel = Math.max(lastFromStorage, maxFromDb);

      if (currentLevel <= lastLevel) {
        localStorage.setItem("last_user_level_" + uid, String(lastLevel));
        return;
      }

      var generatingBannerShown = false;
      try {
        showOnigiriGeneratingBanner(lastLevel + 1);
        generatingBannerShown = true;

        var highestOk = lastLevel;
        for (var lvl = lastLevel + 1; lvl <= currentLevel; lvl++) {
          showOnigiriGeneratingBanner(lvl);
          var ok = await generateNewOnigiriForLevel(uid, lvl, profile);
          if (ok) {
            highestOk = lvl;
          } else {
            break;
          }
        }

        localStorage.setItem("last_user_level_" + uid, String(highestOk));

        if (highestOk > lastLevel) {
          var popupSnap = await window.firebaseDb
            .ref("userOnigiriImages/" + uid + "/level" + highestOk)
            .once("value");
          var popupItem = popupSnap.val();
          var popupUrl = popupItem && popupItem.downloadUrl;

          await refreshRecordCharacterIcon(uid, currentLevel, true);
          await showLevelUpPopup(highestOk, popupUrl);

          if (highestOk >= 1 && window.EduChar && typeof window.EduChar.notifyNewOnigiriDiscovered === "function") {
            if (popupUrl) {
              window.EduChar.notifyNewOnigiriDiscovered({
                imageUrl: popupUrl,
                displayName: (popupItem && popupItem.displayName) || highestOk + "レベル " + (profile.name || ""),
                generatedLevel: highestOk
              });
            }
          }
        }
      } finally {
        if (generatingBannerShown) {
          hideOnigiriGeneratingBanner();
        }
      }
    } catch (e) {
      console.error("レベル更新失敗:", e);
    }
  }

  // グローバルに公開
  window.updateUserLevel = updateUserLevel;


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
    console.log("window.EduChar:", window.EduChar);
    console.log("window.EduChar.ensureProfileThen:", window.EduChar.ensureProfileThen);
    if (!window.EduChar || !window.EduChar.ensureProfileThen) {
      console.error("EduChar not loaded properly");
      // フォールバック: 直接レベル更新を試す
      setTimeout(function() {
        updateUserLevel();
      }, 1000);
      return;
    }

    window.EduChar.ensureProfileThen("record.html").then(function() {
      console.log("ensureProfileThen resolved");
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
      updateUserLevel(); // レベル更新
    }).catch(function(err) {
      console.error("ensureProfileThen failed:", err);
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

    // レベルアップポップアップの処理
    $('#register-btn').on('click', function(e) {
        e.stopPropagation();
        $(this).text('わかった！').css({
            'background-color': '#8a7357',
            'box-shadow': 'none',
            'transform': 'translateY(2px)'
        });
        
        setTimeout(function() {
            $('#new-onigiri-popup').fadeOut(400);
        }, 800);
    });

    $('.popup-close-btn, .popup-overlay').on('click', function(e) {
        if (e.target !== e.currentTarget && !$(e.target).hasClass('popup-close-btn')) return;
        $('#new-onigiri-popup').fadeOut(300);
    });
  });
})();