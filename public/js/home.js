/**
 * ホーム: プロフィールからキャラ説明文を組み立て、画像エリアに表示
 * 将来は Gemini API で画像生成して表示
 */
(function () {
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

  function buildGeminiPrompt(profile) {
    var desc = [];
    var subject = (profile.subject || "").trim();
    var hobby = (profile.hobby || "").trim();
    if (subject) desc.push(subject + "をイメージした服装や小物");
    if (hobby) desc.push(hobby + "を連想させるポーズやアイテム");
    if (desc.length === 0) desc.push("学びを応援する明るい雰囲気");
    return "児童・生徒向けの親しみやすいイラスト、".concat(desc.join("、"), "。一枚絵、キャラクター中心。");
  }

  function loadProfileAndShow() {
    var uid = window.EduChar.getUserIdSync();
    if (!uid || !window.firebaseDb) {
      document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
      return;
    }
    window.firebaseDb.ref("profiles/" + uid).once("value").then(function (snap) {
      var profile = snap.val();
      if (!profile) {
        document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
        window.location.href = "login.html";
        return;
      }
      var textPrompt = buildCharacterPrompt(profile);
      document.getElementById("character-description").textContent = textPrompt;

      window.EduChar._lastGeminiPrompt = buildGeminiPrompt(profile);

      var imgUrl = sessionStorage.getItem("edu_char_image_url");
      var imgEl = document.querySelector("#character-image img");
      var emojiEl = document.getElementById("character-emoji");
      if (imgUrl && imgEl) {
        imgEl.src = imgUrl;
        imgEl.style.display = "block";
        if (emojiEl) emojiEl.style.display = "none";
      } else if (emojiEl) {
        emojiEl.style.display = "block";
        emojiEl.textContent = "🎓";
      }
    }).catch(function () {
      document.getElementById("character-description").textContent = "プロフィールの読み込みに失敗しました。";
    });
  }

  $(function () {
    window.EduChar.ensureProfileThen("index.html");
    loadProfileAndShow();
  });
})();
