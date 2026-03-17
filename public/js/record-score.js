(function () {
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  function saveScore(date, subject, score) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    var ref = window.firebaseDb.ref("scoreMemos/" + uid).push();
    ref.set({
      date: date,
      subject: subject,
      score: score,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("記録しました。");
      document.getElementById("score-value").value = "";
      loadScores();
    }).catch(function (err) {
      alert("保存に失敗しました: " + (err.message || err));
    });
  }

  function loadScores() {
    var uid = getUid();
    var listEl = document.getElementById("score-list");
    if (!listEl) return;
    if (!window.firebaseDb || !uid) {
      listEl.innerHTML = "<li>記録はありません。</li>";
      return;
    }
    window.firebaseDb.ref("scoreMemos/" + uid).orderByChild("createdAt").limitToLast(30).once("value").then(function (snap) {
      var items = [];
      snap.forEach(function (child) {
        var v = child.val();
        items.push({
          date: v.date,
          subject: v.subject,
          score: v.score
        });
      });
      items.reverse();
      if (items.length === 0) {
        listEl.innerHTML = "<li>まだ記録がありません。</li>";
        return;
      }
      listEl.innerHTML = items.map(function (m) {
        var label = (m.date || "") + " / " + (m.subject || "テスト名未設定");
        return "<li class=\"memo-item\"><span class=\"memo-date\">" + label +
          "</span><div class=\"memo-body\">" + (m.score || 0) + " 点</div></li>";
      }).join("");
    });
  }

  $(function () {
    window.EduChar.ensureProfileThen("record-score.html");
    var today = new Date().toISOString().slice(0, 10);
    var dateEl = document.getElementById("score-date");
    if (dateEl && !dateEl.value) dateEl.value = today;

    loadScores();

    $("#score-form").on("submit", function (e) {
      e.preventDefault();
      var date = $("#score-date").val();
      var subject = $("#score-subject").val().trim();
      var score = parseInt($("#score-value").val(), 10);
      if (!date) {
        alert("日付を入力してください。");
        return;
      }
      if (isNaN(score)) {
        alert("点数を正しく入力してください。");
        return;
      }
      saveScore(date, subject, score);
    });
  });
})();

