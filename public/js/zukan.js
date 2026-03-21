(function () {
  // クリック / モーダルは動的描画後でも動くように委譲で実装
  $(document).on("click", ".onigiri-cup", function () {
    const $item = $(this).closest(".onigiri-item");
    const name = $item.find(".onigiri-name").text();
    const imgSrc = $(this).find("img").attr("src");

    $("#modal-name").text(name);
    $("#modal-img").attr("src", imgSrc);
    $("#download-btn").attr("href", imgSrc);

    $(".modal-img-wrap").removeClass("is-puru-shake");
    $("#onigiri-modal").fadeIn(250);
  });

  // 閉じる処理（ボタン または 背景クリック）
  $(document).on("click", ".close-btn, .modal-overlay", function (e) {
    if (e.target !== e.currentTarget && !$(e.target).hasClass("close-btn")) return;
    $("#onigiri-modal").fadeOut(200);
  });

  // モーダル内のおにぎりクリックで「ぷるぷる」
  $(document).on("click", ".modal-img-wrap", function () {
    const $el = $(this);
    $el.removeClass("is-puru-shake");
    void this.offsetWidth; // 強制再レンダリング（リセットに必要）
    $el.addClass("is-puru-shake");
  });

  function buildCardHTML(item) {
    // downloadUrl が無い場合は空になるが、将来 downloadUrl か getDownloadURL に統一して埋める想定
    var imgSrc = item.downloadUrl || "";
    var alt = item.displayName || item.name || "onigiri";
    return (
      '<li class="onigiri-item" data-image-id="' +
      (item.id || "") +
      '">' +
      '<div class="onigiri-cup">' +
      '<img src="' +
      imgSrc +
      '" alt="' +
      alt.replace(/"/g, "&quot;") +
      '" class="onigiri-img">' +
      "</div>" +
      '<span class="onigiri-name">' +
      (item.displayName || alt).replace(/</g, "&lt;") +
      "</span>" +
      "</li>"
    );
  }

  async function loadZukanItemsForUser(uid) {
    if (!window.firebaseDb) return [];
    var snap = await window.firebaseDb.ref("userOnigiriImages/" + uid).once("value");
    var items = [];
    snap.forEach(function (child) {
      var v = child.val() || {};
      items.push(
        Object.assign({}, v, {
          id: child.key,
        })
      );
    });
    items = items.filter(function (it) {
      return !!(it && it.downloadUrl);
    });
    items.sort(function (a, b) {
      var ga = parseInt(a.generatedLevel, 10) || 0;
      var gb = parseInt(b.generatedLevel, 10) || 0;
      if (ga !== gb) return ga - gb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    return items;
  }

  // ユーザーごとに base.jpg をレベル1として Storage/DB に用意する（重複生成は userGeneratedForLevel でガード）
  async function ensureUserLevel1BaseImage(uid, userName) {
    if (!uid || !window.firebaseDb) return;
    if (!window.firebaseStorage) return;

    if (!userName) userName = "";
    var level = 1;
    var imageId = "level1";
    var storagePath = "zukan/" + uid + "/" + imageId + "/image.jpg";
    var genRef = window.firebaseDb.ref("userGeneratedForLevel/" + uid + "/" + level);

    var snap = await genRef.once("value");
    if (snap && snap.exists()) return;

    var blob = await fetch("img/base.jpg").then(function (res) {
      return res.blob();
    });

    var ref = window.firebaseStorage.ref(storagePath);
    await ref.put(blob);
    var downloadUrl = await ref.getDownloadURL();

    var serverTs = firebase.database.ServerValue.TIMESTAMP;

    await window.firebaseDb.ref("userOnigiriImages/" + uid + "/" + imageId).set({
      userName: userName,
      displayName: "1レベル " + userName,
      generatedLevel: level,
      baseLevel: 0,
      baseImageId: null,
      promptUsed: "base.jpg",
      storagePath: storagePath,
      downloadUrl: downloadUrl,
      createdAt: serverTs,
    });

    await genRef.set({
      imageId: imageId,
      createdAt: serverTs,
    });
  }

  function setupPagination(itemsPerPage, $items) {
    var totalPages = Math.ceil($items.length / itemsPerPage) || 1;
    var currentPage = 1;

    function updateDisplay() {
      $items.hide();

      var start = (currentPage - 1) * itemsPerPage;
      var end = start + itemsPerPage;
      $items.slice(start, end).fadeIn(300);

      $("#page-number").text(currentPage + " / " + totalPages);
      $("#prev-page").prop("disabled", currentPage === 1);
      $("#next-page").prop("disabled", currentPage === totalPages);
    }

    $("#next-page").off("click.zukan").on("click.zukan", function () {
      if (currentPage < totalPages) {
        currentPage++;
        updateDisplay();
      }
    });
    $("#prev-page").off("click.zukan").on("click.zukan", function () {
      if (currentPage > 1) {
        currentPage--;
        updateDisplay();
      }
    });

    updateDisplay();
  }

  // 外部（zukan.htmlのinline script）から呼ぶ
  window.loadZukanFromFirebase = async function () {
    var uid = window.EduChar && typeof window.EduChar.getUserIdSync === "function"
      ? window.EduChar.getUserIdSync()
      : null;
    if (!uid) return;

    var $grid = $(".onigiri-grid");
    if (!$grid.length) return;

    try {
      $("#prev-page, #next-page").prop("disabled", true);
      $("#page-number").text("—");

      // 念のため level1 base を用意してから表示する
      var profSnap = await window.firebaseDb.ref("profiles/" + uid).once("value");
      var prof = profSnap.val() || {};
      await ensureUserLevel1BaseImage(uid, prof.name || "");

      var items = await loadZukanItemsForUser(uid);

      if (!items.length) {
        $grid.html('<li style="list-style:none; color:#aaa; text-align:center; padding:16px;">まだ登録された画像がありません。</li>');
        $("#page-number").text("0 / 0");
        $("#prev-page").prop("disabled", true);
        $("#next-page").prop("disabled", true);
        return;
      }

      $grid.html(items.map(buildCardHTML).join(""));

      // カードクリック / モーダル表示は委譲しているため、ここではページングだけ設定
      setupPagination(12, $grid.find(".onigiri-item"));
    } catch (e) {
      console.error("Zukan load error:", e);
    }
  };
})();