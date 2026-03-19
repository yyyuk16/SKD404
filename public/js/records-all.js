$(function () {
  var allTimerItems = [];
  var allScoreItems = [];
  var viewDate = new Date(); // 表示中の日付
  
  // 表示状態の管理
  var currentView = 'text';  // 'text'（もじ） or 'graph'（グラフ）
  var currentType = 'timer'; // 'timer'（じかん） or 'score'（とくてん）
  var myChart = null;        // グラフインスタンス保持用

  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  // 日付を yyyy-mm-dd 形式の文字列にする
  function formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var date = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + date;
  }

  // 表示用の日本語形式
  function formatDisplayDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var date = String(d.getDate()).padStart(2, "0");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var target = new Date(d);
    target.setHours(0, 0, 0, 0);
    
    var diff = Math.floor((today - target) / 86400000);
    var label = y + "年" + m + "月" + date + "日";
    if (diff === 0) label += " (今日)";
    return label;
  }

  // --- データ一括取得 ---
  function fetchAllData() {
    var uid = getUid();
    if (!uid) return;
    
    var p1 = window.firebaseDb.ref("timerMemos/" + uid).once("value").then(function(snap) {
      allTimerItems = [];
      snap.forEach(function(child) { allTimerItems.push(child.val()); });
    });
    
    var p2 = window.firebaseDb.ref("scoreMemos/" + uid).once("value").then(function(snap) {
      allScoreItems = [];
      snap.forEach(function(child) { allScoreItems.push(child.val()); });
    });

    return Promise.all([p1, p2]);
  }

  // --- グラフ描画処理 ---
  function drawWeeklyGraph() {
    var canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var labels = [];
    var dataValues = [];

    // 表示中の日から過去7日間を計算
    for (var i = 6; i >= 0; i--) {
      var d = new Date(viewDate);
      d.setDate(d.getDate() - i);
      var dStr = formatDate(d);
      labels.push((d.getMonth() + 1) + "/" + d.getDate());
      
      var dayData = (currentType === 'timer' ? allTimerItems : allScoreItems).filter(function(item) {
        return item.date === dStr;
      });
      
      var val = 0;
      if (currentType === 'timer') {
        // 時間モード：合計（分）
        val = dayData.reduce(function(sum, item) { return sum + (item.seconds || 0); }, 0);
        dataValues.push(Math.floor(val / 60));
      } else {
        // 点数モード：平均点
        val = dayData.reduce(function(sum, item) { return sum + (item.score || 0); }, 0);
        dataValues.push(dayData.length > 0 ? Math.round(val / dayData.length) : 0);
      }
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: currentType === 'timer' ? '勉強時間 (分)' : '平均点 (点)',
          data: dataValues,
          backgroundColor: currentType === 'timer' ? '#e67e22' : '#3498db',
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });
  }

  // --- 描画処理 ---
  function render() {
    var listEl = $("#all-records-list");
    var graphContainer = $("#graph-container");
    var dateStr = formatDate(viewDate);
    
    // 1. 日付表示とカレンダー同期
    $("#display-date").text(formatDisplayDate(new Date(viewDate)));
    $("#calendar-input").val(dateStr);

    // 2. データの抽出
    var targetData = (currentType === 'timer' ? allTimerItems : allScoreItems).filter(function(item) {
      return item.date === dateStr;
    });

    // 3. 合計・平均エリアの計算と表示
    if (currentType === 'timer') {
      var totalSeconds = targetData.reduce(function(sum, item) { return sum + (item.seconds || 0); }, 0);
      var h = Math.floor(totalSeconds / 3600);
      var m = Math.floor((totalSeconds % 3600) / 60);
      var displayTotal = (h > 0 ? h + "時間" : "") + m + "分";
      
      $("#total-label").text("合計");
      $("#day-total-value").text(displayTotal);
      $("#day-total-area").show(); 
    } else {
      var totalScore = targetData.reduce(function(sum, item) { return sum + (item.score || 0); }, 0);
      var avgScore = targetData.length > 0 ? Math.round(totalScore / targetData.length) : 0;
      
      $("#total-label").text("平均");
      $("#day-total-value").text(avgScore + "点");
      $("#day-total-area").show();
    }

    // 4. 未来へのボタン制御
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var current = new Date(viewDate);
    current.setHours(0, 0, 0, 0);

    if (current >= today) {
      $("#next-date").css({"opacity": "0.3", "pointer-events": "none"});
    } else {
      $("#next-date").css({"opacity": "1", "pointer-events": "auto"});
    }

    // 5. ヘッダー情報の更新
    $("#history-title").text(currentType === 'timer' ? "べんきょうの記録" : "テストの点数");
    $("#item-count").text(targetData.length + "件");

    // 6. 表示形式（もじ or グラフ）の切り替え
    if (currentView === 'graph') {
      listEl.hide();
      graphContainer.show();
      drawWeeklyGraph();
    } else {
      graphContainer.hide();
      listEl.show();
      
      var html = "";
      if (targetData.length === 0) {
        html = '<li class="memo-item" style="color:#ccc; text-align:center; padding: 40px 10px;">この日の記録はありません</li>';
      } else {
        html = targetData.map(function(m) {
          var rightLabel = (currentType === 'timer') 
            ? Math.floor(m.seconds / 60) + "分" + (m.seconds % 60) + "秒" 
            : m.score + "点";

          return '<li class="memo-item pencil-border">' +
                   '<div class="memo-content">' +
                     '<div class="memo-upper">' +
                       '<span class="memo-subject">' + (m.subject || "なし") + '</span>' +
                       '<span class="memo-time-tag">' + rightLabel + '</span>' +
                     '</div>' +
                   '</div>' +
                 '</li>';
        }).reverse().join("");
      }
      listEl.html(html);
    }
  }

  // --- イベント設定 ---

  // 表示モード（もじ/グラフ）の切り替え
  $(".view-btn").on("click", function() {
    currentView = $(this).attr("id") === "view-text" ? 'text' : 'graph';
    $(".view-btn").removeClass("active");
    $(this).addClass("active");
    render();
  });

  // データ種別（じかん/とくてん）の切り替え
  $(".type-btn").on("click", function() {
    currentType = $(this).attr("id") === "type-timer" ? 'timer' : 'score';
    $(".type-btn").removeClass("active");
    $(this).addClass("active");
    render();
  });

  $("#calendar-input").on("change", function() {
    var val = $(this).val();
    if (!val) return;
    viewDate = new Date(val);
    render();
  });

  $("#prev-date").on("click", function() {
    viewDate.setDate(viewDate.getDate() - 1);
    render();
  });

  $("#next-date").on("click", function() {
    viewDate.setDate(viewDate.getDate() + 1);
    render();
  });

  // 初期起動
  window.EduChar.ensureProfileThen("records.html");
  fetchAllData().then(function() {
    render();
  });
});