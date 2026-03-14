/**
 * 設定: プロフィール表示・ログアウト
 */
(function () {
  var USER_ID_KEY = "edu_char_user_id";

  function loadProfile() {
    var uid = window.EduChar.getUserIdSync();
    if (!uid || !window.firebaseDb) {
      document.getElementById("disp-name").textContent = "—";
      document.getElementById("disp-grade").textContent = "—";
      document.getElementById("disp-subject").textContent = "—";
      document.getElementById("disp-hobby").textContent = "—";
      return;
    }
    window.firebaseDb.ref("profiles/" + uid).once("value").then(function (snap) {
      var p = snap.val();
      document.getElementById("disp-name").textContent = (p && p.name) || "—";
      document.getElementById("disp-grade").textContent = (p && p.grade) || "—";
      document.getElementById("disp-subject").textContent = (p && p.subject) || "—";
      document.getElementById("disp-hobby").textContent = (p && p.hobby) || "—";
    }).catch(function () {
      document.getElementById("disp-name").textContent = "—";
      document.getElementById("disp-grade").textContent = "—";
      document.getElementById("disp-subject").textContent = "—";
      document.getElementById("disp-hobby").textContent = "—";
    });
  }

  function logout() {
    localStorage.removeItem(USER_ID_KEY);
    sessionStorage.removeItem("edu_char_image_url");
    if (window.firebaseAuth) {
      window.firebaseAuth.signOut();
    }
    window.location.href = "login.html";
  }

  $(function () {
    window.EduChar.ensureProfileThen("settings.html");
    loadProfile();
    $("#logout-btn").on("click", function () {
      if (confirm("ログアウトすると、再度プロフィール登録が必要になります。よろしいですか？")) {
        logout();
      }
    });
  });
})();
