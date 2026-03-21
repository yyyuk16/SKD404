/**
 * ホーム: プロフィールからキャラ説明文を組み立て、画像エリアに表示
 * 将来は Gemini API で画像生成して表示
 */
(function () {
  var DEMO_CHARACTER_IMAGES = [
    "img/base.jpg",
    "img/nori.jpg",
    "img/shake.png",
    "img/tempura.jpg",
    "img/ume.jpg"
  ];

  function getDemoCharacterImage(profile) {
    var seed = ((profile && profile.grade) || "") + "|" + ((profile && profile.subject) || "") + "|" + ((profile && profile.hobby) || "");
    var total = 0;
    for (var i = 0; i < seed.length; i++) total += seed.charCodeAt(i);
    return DEMO_CHARACTER_IMAGES[total % DEMO_CHARACTER_IMAGES.length];
  }

  function showDemoCharacterImage(profile) {
    var imgEl = document.getElementById("character-img");
    var emojiEl = document.getElementById("character-emoji");
    if (!imgEl) return;
    imgEl.src = getDemoCharacterImage(profile);
    imgEl.alt = "デモ用キャラクター";
    imgEl.style.display = "block";
    if (emojiEl) emojiEl.style.display = "none";
  }

  /**
   * プロフィールから「テキストのキャラ説明文」を作る。
   * 画面の説明テキストと、画像生成プロンプトの両方で再利用する。
   */
  function buildCharacterPrompt(profile) {
    var parts = [];
    var grade = profile.grade || "";
    var subject = profile.subject || "";
    var hobby = profile.hobby || "";
    if (grade.indexOf("小学") === 0) parts.push("小学生");
    else if (grade.indexOf("中学") === 0) parts.push("中学生");
    else if (grade.indexOf("高校") === 0) parts.push("高校生");
    if (subject) parts.push(subject + "が得意");
    if (hobby) parts.push(hobby + "が好き");
    if (parts.length === 0) return "あなたを表すキャラクター";
    return parts.join("、") + "のキャラクター";
  }

  function loadLatestLevelImage(uid, profile) {
    var imgEl = document.getElementById("character-img");
    var emojiEl = document.getElementById("character-emoji");
    if (!imgEl || !uid) return Promise.resolve(false);
    if (!window.EduChar || typeof window.EduChar.getLatestOnigiriImageInfo !== "function") {
      showDemoCharacterImage(profile);
      return Promise.resolve(false);
    }

    return window.EduChar.getLatestOnigiriImageInfo(uid)
      .then(function (item) {
        if (!item || !item.downloadUrl) {
          showDemoCharacterImage(profile);
          return false;
        }
        imgEl.src = item.downloadUrl;
        imgEl.alt = "最新レベルのキャラクター";
        imgEl.style.display = "block";
        if (emojiEl) emojiEl.style.display = "none";
        return true;
      })
      .catch(function () {
        showDemoCharacterImage(profile);
        return false;
      });
  }

  function showProfile(profile) {
    if (!profile) {
      document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
      return;
    }
    var textPrompt = buildCharacterPrompt(profile);
    document.getElementById("character-description").textContent = textPrompt;
  }

  $(function () {
    // 認証が完了して UID が確定してからプロフィール確認・表示を行う
    if (!window.EduChar || typeof window.EduChar.getUserId !== "function") {
      showProfile(null);
      return;
    }

    window.EduChar.getUserId(function (uid) {
      if (!uid) {
        document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
        window.location.href = "login-first.html";
        return;
      }
      window.EduChar.getProfile(uid, function (profile) {
        if (!profile) {
          document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
          window.location.href = "login-first.html";
          return;
        }
        showProfile(profile);
        loadLatestLevelImage(uid, profile);
      });
    });
  });
})();
