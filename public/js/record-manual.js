;(function () {
  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // この画面で選べる「既存タイマー」の一覧
  var PRESET_TIMERS = [
    { id: "break5",  title: "休憩 5 min", seconds: 5 * 60 },
    { id: "study10", title: "勉強 10 min", seconds: 10 * 60 },
    { id: "work45",  title: "ワークアウト休憩", seconds: 45 * 60 },
    { id: "coffee4", title: "コーヒー抽出", seconds: 4 * 60 }
  ];

  function savePresetTimer(preset) {
    var uid = getUid();
    if (!window.firebaseDb || !uid) {
      alert("Firebase の設定を確認してください。");
      return;
    }
    var ref = window.firebaseDb.ref("timerMemos/" + uid).push();
    var minutes = Math.floor(preset.seconds / 60);
    var today = new Date().toISOString().slice(0, 10);

    ref.set({
      date: today,
      subject: preset.title,
      minutes: minutes,
      presetId: preset.id,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      alert("タイマーを記録しました。");
    }).catch(function (err) {
      alert("保存に失敗しました: " + (err.message || err));
    });
  }

  function renderPresetList() {
    var listEl = document.getElementById("preset-timer-list");
    if (!listEl) return;

    listEl.innerHTML = PRESET_TIMERS.map(function (t) {
      var mm = String(Math.floor(t.seconds / 60)).padStart(2, "0");
      var ss = String(t.seconds % 60).padStart(2, "0");
      return ''
        + '<li class="timer-item" data-id="' + t.id + '">'
        + '  <button class="timer-item-left" type="button">'
        + '    <div class="timer-icon"><span>⏱</span></div>'
        + '    <div class="timer-text">'
        + '      <div class="timer-title">' + t.title + '</div>'
        + '      <div class="timer-sub">' + mm + ':' + ss + '</div>'
        + '    </div>'
        + '  </button>'
        + '  <div class="timer-item-actions">'
        + '    <button class="timer-play-btn" type="button">▶</button>'
        + '  </div>'
        + '</li>';
    }).join("");
  }

  $(function () {
    // プロフィールが無い場合はログイン/プロフィール登録へ
    window.EduChar.ensureProfileThen("record-manual.html");

    renderPresetList();

    // 行全体 or ▶ ボタンを押したら、そのプリセットを Firebase に保存
    $("#preset-timer-list").on("click", ".timer-item-left, .timer-play-btn", function () {
      var li = $(this).closest(".timer-item")[0];
      if (!li) return;
      var id = li.getAttribute("data-id");
      var preset = PRESET_TIMERS.find(function (p) { return p.id === id; });
      if (!preset) return;
      savePresetTimer(preset);
    });
  });
})();

