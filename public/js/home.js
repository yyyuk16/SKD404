/**
 * ホーム: プロフィールからキャラ説明文を組み立て、画像エリアに表示
 * 将来は Gemini API で画像生成して表示
 */
(function () {
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

  function buildGeminiPrompt(profile) {
    var desc = [];
    var subject = (profile.subject || "").trim();
    var hobby = (profile.hobby || "").trim();
    if (subject) desc.push(subject + "をイメージした服装や小物");
    if (hobby) desc.push(hobby + "を連想させるポーズやアイテム");
    if (desc.length === 0) desc.push("学びを応援する明るい雰囲気");
    return "児童・生徒向けの親しみやすいイラスト、".concat(desc.join("、"), "。一枚絵、キャラクター中心。");
  }

  /**
   * 画像のキャッシュキーを、ユーザーごとに決める。
   * 同じユーザーは常に同じキーになるので、1回生成した画像を sessionStorage から再利用できる。
   */
  function getImageCacheKey() {
    var uid = null;
    if (window.EduChar && typeof window.EduChar.getUserIdSync === "function") {
      uid = window.EduChar.getUserIdSync();
    }
    return uid ? "edu_char_image_url_" + uid : "edu_char_image_url_guest";
  }

  function showProfile(profile) {
    if (!profile) {
      document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
      return;
    }
    var textPrompt = buildCharacterPrompt(profile);
    document.getElementById("character-description").textContent = textPrompt;
    window.EduChar._lastGeminiPrompt = buildGeminiPrompt(profile);
  }

  /**
   * Gemini でキャラ画像を生成し、ユーザーごとに sessionStorage に保存する。
   * - すでにキャッシュがあれば API を呼ばずにそれを表示（毎回まったく同じキャラになる）
   * - まだキャッシュがなければ 1 回だけ /api/gemini.php を呼んで画像を作る
   */
  function generateCharacterImage(profile) {
    var cacheKey = getImageCacheKey();
    var cached = sessionStorage.getItem(cacheKey);
    var imgEl = document.getElementById("character-img");
    var emojiEl = document.getElementById("character-emoji");

    // すでにこのユーザーのキャラ画像が生成済みなら、それを表示して終わり
    if (cached && imgEl) {
      imgEl.src = cached;
      imgEl.style.display = "block";
      if (emojiEl) emojiEl.style.display = "none";
      return;
    }

    // ここから下は「まだ一度も生成していないユーザー」のみ通る
    if (!profile) return;

    // ユーザー情報を含んだ日本語プロンプトを組み立てる。
    // 「Firebaseに記録されてるユーザーごとにランダムでキャラクター生成して」という意図を明示しつつ、
    // プロフィール内容を具体的な条件として渡す。
    var base = "Firebaseに記録されてるユーザーごとにランダムでキャラクター生成して。次のユーザー情報にぴったりの1人だけを描いてください。\n\n";
    var profileText =
      "学年: " + (profile.grade || "不明") + "\n" +
      "得意教科: " + (profile.subject || "未設定") + "\n" +
      "趣味: " + (profile.hobby || "未設定") + "\n\n";
    var styleText = window.EduChar && window.EduChar._lastGeminiPrompt ? window.EduChar._lastGeminiPrompt : "";
    var finalPrompt = base + profileText + styleText;

    fetch("/api/gemini.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: finalPrompt })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !data.imageBase64) {
          console.error("Gemini image generation failed", data);
          return;
        }
        var dataUrl = "data:" + (data.mimeType || "image/png") + ";base64," + data.imageBase64;
        if (imgEl) {
          imgEl.src = dataUrl;
          imgEl.style.display = "block";
          if (emojiEl) emojiEl.style.display = "none";
        }
        try {
          sessionStorage.setItem(cacheKey, dataUrl);
        } catch (e) {
          // ストレージ容量の問題などで保存できない場合は、ログだけ出して処理を続ける
          console.warn("Failed to cache character image", e);
        }
      })
      .catch(function (err) {
        console.error("Gemini image request error", err);
      });
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
        window.location.href = "login.html";
        return;
      }
      window.EduChar.getProfile(uid, function (profile) {
        if (!profile) {
          document.getElementById("character-description").textContent = "プロフィールを登録するとキャラが表示されます。";
          window.location.href = "login.html";
          return;
        }
        showProfile(profile);
        // プロフィールが取得できたタイミングでキャラ画像の生成・表示を行う。
        // すでに生成済みならキャッシュされた画像を使うため、同じユーザーは毎回まったく同じキャラになる。
        generateCharacterImage(profile);
      });
    });
  });
})();
