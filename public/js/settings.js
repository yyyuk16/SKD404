/**
 * 設定: プロフィール表示・ログアウト
 */
(function () {
  var USER_ID_KEY = "edu_char_user_id";

  function showProfileData(profile) {
    var name = (profile && profile.name) || "—";
    var grade = (profile && profile.grade) || "—";
    var subject = (profile && profile.subject) || "—";
    var hobby = (profile && profile.hobby) || "—";
    document.getElementById("disp-name").textContent = name;
    document.getElementById("disp-grade").textContent = grade;
    document.getElementById("disp-subject").textContent = subject;
    document.getElementById("disp-hobby").textContent = hobby;
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
    $("#logout-btn").on("click", function () {
      if (confirm("ログアウトすると、再度プロフィール登録が必要になります。よろしいですか？")) {
        logout();
      }
    });

    if (!window.EduChar || typeof window.EduChar.getUserId !== "function") {
      showProfileData(null);
      return;
    }

    window.EduChar.getUserId(function (uid) {
      if (!uid) {
        window.location.href = "login.html";
        return;
      }
      window.EduChar.getProfile(uid, function (profile) {
        if (!profile) {
          window.location.href = "login.html";
          return;
        }
        showProfileData(profile);
      });
    });
  });
})();
