/**
 * 設定: プロフィール表示・編集・ログアウト
 */
(function () {
  var USER_ID_KEY = "edu_char_user_id";
  var isEditMode = false;
  var DEMO_CHARACTER_IMAGES = [
    "img/base.jpg",
    "img/nori.jpg",
    "img/shake.png",
    "img/tempura.jpg",
    "img/ume.jpg"
  ];

  function getDemoCharacterImage(uid) {
    var seed = uid || "guest";
    var total = 0;
    for (var i = 0; i < seed.length; i++) total += seed.charCodeAt(i);
    return DEMO_CHARACTER_IMAGES[total % DEMO_CHARACTER_IMAGES.length];
  }

  function showDemoCharIcon(uid) {
    var imgEl = document.querySelector(".char-icon-img");
    if (!imgEl) return;
    imgEl.src = getDemoCharacterImage(uid);
    imgEl.alt = "デモ用キャラクターアイコン";
  }

  function loadLatestLevelToCharIcon() {
    var imgEl = document.querySelector(".char-icon-img");
    if (!imgEl) return Promise.resolve(false);

    var uid = window.EduChar && typeof window.EduChar.getUserIdSync === "function"
      ? window.EduChar.getUserIdSync()
      : null;
    if (!uid || !window.firebaseDb) {
      showDemoCharIcon(uid);
      return Promise.resolve(false);
    }

    if (!window.EduChar || typeof window.EduChar.getLatestOnigiriImageInfo !== "function") {
      showDemoCharIcon(uid);
      return Promise.resolve(false);
    }

    return window.EduChar.getLatestOnigiriImageInfo(uid)
      .then(function (item) {
        if (!item) {
          showDemoCharIcon(uid);
          return false;
        }
        if (item.downloadUrl) {
          imgEl.src = item.downloadUrl;
          imgEl.alt = "最新レベルのキャラクターアイコン";
          return true;
        }
        showDemoCharIcon(uid);
        return false;
      })
      .catch(function () {
        showDemoCharIcon(uid);
        return false;
      });
  }

  function showProfileData(profile) {
    var name = (profile && profile.name) || "—";
    var grade = (profile && profile.grade) || "—";
    var subject = (profile && profile.subject) || "—";
    var hobby = (profile && profile.hobby) || "—";

    // 表示用テキストの更新
    $("#disp-name").text(name);
    $("#disp-grade").text(grade);
    $("#disp-subject").text(subject);
    $("#disp-hobby").text(hobby);

    // 入力フォームの初期値更新
    $("input[name='name']").val(name === "—" ? "" : name);
    $("input[name='grade']").val(grade === "—" ? "" : grade);
    $("input[name='subject']").val(subject === "—" ? "" : subject);
    $("input[name='hobby']").val(hobby === "—" ? "" : hobby);
  }

  // 表示モードと編集モードの切り替え
  function toggleEditMode() {
    isEditMode = !isEditMode;
    if (isEditMode) {
      $("#edit-toggle-btn").text("キャンセル").addClass("cancel");
      // .hide() / .show() は display 属性を直接操作するので CSS より優先されます
      $(".view-mode").hide();
      $(".edit-mode").show();
    } else {
      $("#edit-toggle-btn").text("編集").removeClass("cancel");
      $(".view-mode").show();
      $(".edit-mode").hide();
    }
  }

  // Firebaseへデータを保存
  function saveProfile(uid) {
    var newData = {
      name: $("input[name='name']").val(),
      grade: $("input[name='grade']").val(),
      subject: $("input[name='subject']").val(),
      hobby: $("input[name='hobby']").val(),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (!window.firebaseDb) return;

    window.firebaseDb.ref("profiles/" + uid).update(newData)
      .then(function () {
        alert("プロフィールを更新しました！");
        if (window.EduChar && typeof window.EduChar.clearProfileCache === "function") {
          window.EduChar.clearProfileCache();
        }
        // 画面をリロードして最新状態を表示
        window.location.reload();
      })
      .catch(function (error) {
        console.error("Save Error:", error);
        alert("保存に失敗しました。");
      });
  }

  function logout() {
    localStorage.removeItem(USER_ID_KEY);
    sessionStorage.removeItem("edu_char_image_url");
    if (window.EduChar && typeof window.EduChar.clearProfileCache === "function") {
      window.EduChar.clearProfileCache();
    }
    if (window.firebaseAuth) {
      window.firebaseAuth.signOut();
    }
    window.location.href = "login.html";
  }

  $(function () {
    // --- 【重要】初期状態の設定 ---
    // HTML の style="display:none" や CSS の !important に依存せず、
    // 起動時に JS で確実に表示・非表示を上書きします。
    $(".view-mode").show();
    $(".edit-mode").hide();

    // ログアウトボタン
    $("#logout-btn").on("click", function () {
      if (confirm("ログアウトしてもよろしいですか？")) {
        logout();
      }
    });

    // 編集/キャンセルボタン
    $("#edit-toggle-btn").on("click", function () {
      toggleEditMode();
    });

    // 保存ボタン（フォーム送信）
    $("#profile-form").on("submit", function (e) {
      e.preventDefault();
      var uid = (window.EduChar && typeof window.EduChar.getUserIdSync === "function") 
                ? window.EduChar.getUserIdSync() 
                : localStorage.getItem(USER_ID_KEY);
      
      if (uid) {
        saveProfile(uid);
      }
    });

    // 初期データの読み込み
    if (!window.EduChar || typeof window.EduChar.getUserId !== "function") {
      showProfileData(null);
      return;
    }

    window.EduChar.getUserId(function (uid) {
      if (!uid) {
        window.location.href = "login-first.html";
        return;
      }
      window.EduChar.getProfile(uid, function (profile) {
        if (!profile) {
          window.location.href = "login-first.html";
          return;
        }
        showProfileData(profile);
        loadLatestLevelToCharIcon();
      });
    });
  });
})();