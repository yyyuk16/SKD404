/**
 * 共通: フッターナビ・ユーザー判定・Firebase 連携
 */
(function () {
  const NAV_ITEMS = [
    { path: "index.html", label: "ホーム", icon: "🏠" },
    { path: "news.html", label: "ニュース", icon: "📰" },
    { path: "record.html", label: "記録", icon: "+", isPlus: true },
    { path: "study.html", label: "学習", icon: "📚" },
    { path: "settings.html", label: "設定", icon: "⚙️" }
  ];

  const USER_ID_KEY = "edu_char_user_id";
  var _profileCache = null; // { uid: string, profile: object|null }

  function getProfile(uid, callback) {
    if (typeof callback !== "function" || !uid) {
      if (typeof callback === "function") callback(null);
      return;
    }
    if (_profileCache && _profileCache.uid === uid) {
      callback(_profileCache.profile);
      return;
    }
    if (typeof firebase === "undefined" || !window.firebaseDb) {
      callback(null);
      return;
    }
    window.firebaseDb.ref("profiles/" + uid).once("value").then(function (snap) {
      var profile = snap.val();
      _profileCache = { uid: uid, profile: profile };
      callback(profile);
    }).catch(function () {
      callback(null);
    });
  }

  function clearProfileCache() {
    _profileCache = null;
  }

  function getUserId(callback) {
    if (typeof callback !== "function") {
      return localStorage.getItem(USER_ID_KEY) || null;
    }
    if (window.firebaseAuth) {
      window.firebaseAuth.onAuthStateChanged(function (user) {
        if (user) {
          localStorage.setItem(USER_ID_KEY, user.uid);
          callback(user.uid);
        } else {
          window.firebaseAuth.signInAnonymously().then(function (anonUser) {
            if (anonUser && anonUser.user) {
              localStorage.setItem(USER_ID_KEY, anonUser.user.uid);
              callback(anonUser.user.uid);
            } else {
              var fallbackId = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
              localStorage.setItem(USER_ID_KEY, fallbackId);
              callback(fallbackId);
            }
          }).catch(function () {
            var fallbackId = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
            localStorage.setItem(USER_ID_KEY, fallbackId);
            callback(fallbackId);
          });
        }
      });
    } else {
      var id = localStorage.getItem(USER_ID_KEY);
      if (!id) id = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(USER_ID_KEY, id);
      callback(id);
    }
  }

  function getUserIdSync() {
    return localStorage.getItem(USER_ID_KEY) || null;
  }

  function ensureAuthenticated(callback, errorCallback) {
    if (!window.firebaseAuth) {
      if (typeof errorCallback === "function") {
        errorCallback(new Error("Firebase Auth is not initialized"));
      }
      return;
    }
    var currentUser = window.firebaseAuth.currentUser;
    if (currentUser) {
      localStorage.setItem(USER_ID_KEY, currentUser.uid);
      callback(currentUser);
      return;
    }
    window.firebaseAuth.signInAnonymously().then(function (anonUser) {
      if (anonUser && anonUser.user) {
        localStorage.setItem(USER_ID_KEY, anonUser.user.uid);
        callback(anonUser.user);
      } else {
        throw new Error("匿名ログインに失敗しました");
      }
    }).catch(function (err) {
      if (typeof errorCallback === "function") {
        errorCallback(err);
      }
    });
  }

  function signInWithEmailPassword(email, password, callback, errorCallback) {
    if (!window.firebaseAuth) {
      if (typeof errorCallback === "function") {
        errorCallback(new Error("Firebase Auth is not initialized"));
      }
      return;
    }
    window.firebaseAuth.signInWithEmailAndPassword(email, password)
      .then(function (result) {
        localStorage.setItem(USER_ID_KEY, result.user.uid);
        if (typeof callback === "function") callback(result.user);
      })
      .catch(function (err) {
        if (typeof errorCallback === "function") errorCallback(err);
      });
  }

  function createUserWithEmailPassword(email, password, callback, errorCallback) {
    if (!window.firebaseAuth) {
      if (typeof errorCallback === "function") {
        errorCallback(new Error("Firebase Auth is not initialized"));
      }
      return;
    }
    window.firebaseAuth.createUserWithEmailAndPassword(email, password)
      .then(function (result) {
        localStorage.setItem(USER_ID_KEY, result.user.uid);
        if (typeof callback === "function") callback(result.user);
      })
      .catch(function (err) {
        if (typeof errorCallback === "function") errorCallback(err);
      });
  }

  function renderFooter() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    let html = '<nav class="footer-nav">';
    NAV_ITEMS.forEach(function (item) {
      const isActive = currentPage === item.path ? " active" : "";
      const plusClass = item.isPlus ? " nav-link--plus" : "";
      html += '<a href="' + item.path + '" class="nav-link' + isActive + plusClass + '">';
      html += '<span class="nav-icon">' + item.icon + "</span>";
      if (!item.isPlus) html += "<span>" + item.label + "</span>";
      html += "</a>";
    });
    html += "</nav>";
    const footer = document.getElementById("footer-nav");
    if (footer) footer.innerHTML = html;
  }

  function hasProfile(callback) {
    if (typeof callback !== "function") return;
    getUserId(function (uid) {
      if (!uid) {
        callback(false);
        return;
      }
      getProfile(uid, function (profile) {
        callback(profile !== null && typeof profile === "object");
      });
    });
  }


  // プロフィールがあれば nextUrl へ、なければ login へ。すでに nextUrl にいるときは「同じページへ」のリダイレクトをしない（毎回の再読み込みでチラつくのを防ぐ）
  function ensureProfileThen(nextUrl) {
    var target = nextUrl || "index.html";
    var currentPage = (window.location.pathname.split("/").pop() || window.location.href.split("/").pop() || "").split("?")[0];
    var alreadyOnTarget = (currentPage === target || (currentPage === "" && target === "index.html"));
    hasProfile(function (exists) {
      if (!exists) {
        window.location.href = "login.html";
        return;
      }
      if (!alreadyOnTarget) {
        window.location.href = target;
      }
    });
  }

  window.EduChar = window.EduChar || {};
  window.EduChar.getUserId = getUserId;
  window.EduChar.getUserIdSync = getUserIdSync;
  window.EduChar.getProfile = getProfile;
  window.EduChar.clearProfileCache = clearProfileCache;
  window.EduChar.hasProfile = hasProfile;
  window.EduChar.ensureProfileThen = ensureProfileThen;
  window.EduChar.ensureAuthenticated = ensureAuthenticated;
  window.EduChar.signInWithEmailPassword = signInWithEmailPassword;
  window.EduChar.createUserWithEmailPassword = createUserWithEmailPassword;
  window.EduChar.NAV_ITEMS = NAV_ITEMS;

  window.signInWithEmailPassword = signInWithEmailPassword;
  window.createUserWithEmailPassword = createUserWithEmailPassword;
  window.ensureAuthenticated = ensureAuthenticated;

  $(function () {
    renderFooter();
  });
})();
