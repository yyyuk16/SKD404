/**
 * レベルアップ後に新しいおにぎり画像が生成・保存されたとき、
 * ホーム（index.html）で「新種発見」ポップアップを出すための sessionStorage 連携。
 *
 * 使い方（画像を Firebase に保存した直後）:
 *   if (window.EduChar && window.EduChar.notifyNewOnigiriDiscovered) {
 *     window.EduChar.notifyNewOnigiriDiscovered({
 *       imageUrl: downloadUrl,
 *       displayName: "3レベル なまえ",
 *       generatedLevel: 3
 *     });
 *   }
 */
(function () {
  var STORAGE_KEY = "skd404_pending_onigiri_discovery";

  function safeSet(payload) {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          imageUrl: payload.imageUrl || "",
          displayName: payload.displayName || "",
          generatedLevel:
            payload.generatedLevel != null ? Number(payload.generatedLevel) : null,
          at: Date.now()
        })
      );
    } catch (e) {
      console.warn("onigiri-discovery: sessionStorage set failed", e);
    }
  }

  function safeGet() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function safeClear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  window.EduChar = window.EduChar || {};

  /** 無条件で保留（テスト用・特殊ケース用） */
  window.EduChar.setPendingOnigiriDiscovery = function (payload) {
    if (!payload || !payload.imageUrl) return;
    safeSet(payload);
  };

  /** レベル2以上のときだけ保留（レベル1の base シードでは出さない） */
  window.EduChar.notifyNewOnigiriDiscovered = function (payload) {
    if (!payload || !payload.imageUrl) return;
    var lv = payload.generatedLevel != null ? Number(payload.generatedLevel) : NaN;
    if (!isNaN(lv) && lv < 2) return;
    safeSet(payload);
  };

  window.EduChar.peekPendingOnigiriDiscovery = function () {
    return safeGet();
  };

  window.EduChar.clearPendingOnigiriDiscovery = function () {
    safeClear();
  };
})();
