/**
 * 関連ニュース: デモ用の固定サンプルニュースを表示
 */
(function () {
  var DEMO_NEWS = [
    { title: "プログラミング教育、小中学校で必修化の動き", date: "2025-03-10", source: "教育ニュース", url: "#" },
    { title: "夏休みの自由研究アイデア特集", date: "2025-03-08", source: "学習サポート", url: "#" },
    { title: "読書習慣で成績アップ？ 調査結果", date: "2025-03-05", source: "教育リサーチ", url: "#" },
    { title: "新しい学習アプリの紹介", date: "2025-03-01", source: "ICT教育", url: "#" }
  ];

  function render() {
    var html = DEMO_NEWS.map(function (n) {
      return "<li class=\"news-item\"><a href=\"" + (n.url || "#") + "\">" + (n.title || "") + "</a><div class=\"news-meta\">" + (n.date || "") + " / " + (n.source || "") + "</div></li>";
    }).join("");
    var el = document.getElementById("news-list");
    if (el) el.innerHTML = html;
  }

  $(function () {
    window.EduChar.ensureProfileThen("news.html");
    render();
  });
})();
