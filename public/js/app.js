/**
 * 共通: フッターナビ・ユーザー判定・Firebase 連携
 */
(function () {
  const NAV_ITEMS = [
    { path: "index.html", label: "home", icon: "🏠" },
    { path: "news.html", label: "ニュース", icon: "📰" },
    { path: "record.html", label: "記録", icon: "📝" },
    { path: "study.html", label: "学習", icon: "📚" },
    { path: "settings.html", label: "設定", icon: "⚙️" }
  ];

  const USER_ID_KEY = "edu_char_user_id";

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
          window.firebaseAuth.signInAnonymously().then(function () {});
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

  function renderFooter() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    let html = '<nav class="footer-nav">';
    NAV_ITEMS.forEach(function (item) {
      const isActive = currentPage === item.path ? " active" : "";
      html += '<a href="' + item.path + '" class="nav-link' + isActive + '">';
      html += '<span class="nav-icon">' + item.icon + "</span>";
      html += "<span>" + item.label + "</span></a>";
    });
    html += "</nav>";
    const footer = document.getElementById("footer-nav");
    if (footer) footer.innerHTML = html;
  }

  function hasProfile(callback) {
    if (typeof firebase === "undefined" || !window.firebaseDb) {
      callback(false);
      return;
    }
    function check(uid) {
      if (!uid) { callback(false); return; }
      window.firebaseDb.ref("profiles/" + uid).once("value", function (snap) {
        callback(snap.exists() && snap.val() !== null);
      }, function () {
        callback(false);
      });
    }
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
      check(window.firebaseAuth.currentUser.uid);
    } else if (window.firebaseAuth) {
      window.firebaseAuth.onAuthStateChanged(function (user) {
        check(user ? user.uid : getUserIdSync());
      });
    } else {
      check(getUserIdSync());
    }
  }

  function ensureProfileThen(nextUrl) {
    hasProfile(function (exists) {
      if (exists) {
        window.location.href = nextUrl || "index.html";
      } else {
        window.location.href = "login.html";
      }
    });
  }

  window.EduChar = window.EduChar || {};
  window.EduChar.getUserId = getUserId;
  window.EduChar.getUserIdSync = getUserIdSync;
  window.EduChar.hasProfile = hasProfile;
  window.EduChar.ensureProfileThen = ensureProfileThen;
  window.EduChar.NAV_ITEMS = NAV_ITEMS;

  $(function () {
    renderFooter();
  });
})();
