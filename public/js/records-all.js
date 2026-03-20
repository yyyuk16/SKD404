$(function () {
  var allTimerItems = [];
  var allScoreItems = [];
  var viewDate = new Date(); 
  viewDate.setHours(0, 0, 0, 0); // 日付比較のために時刻をリセット
  var currentView = 'text'; 
  var currentType = 'timer'; 
  var myChart = null; 
  var accordionCharts = {}; 

  function getUid() {
    return window.EduChar.getUserIdSync && window.EduChar.getUserIdSync();
  }

  function formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var date = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + date;
  }

  function fetchAllData() {
    var uid = getUid();
    if (!uid) return Promise.resolve();
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

  function drawWeeklyTimerGraph() {
    var canvas = document.getElementById('weeklyChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var labels = [];
    var dataValues = [];

    for (var i = 6; i >= 0; i--) {
      var d = new Date(viewDate);
      d.setDate(d.getDate() - i);
      var dStr = formatDate(d);
      labels.push((d.getMonth() + 1) + "/" + d.getDate());
      var dayData = allTimerItems.filter(item => item.date === dStr);
      var val = dayData.reduce((sum, item) => sum + (item.seconds || 0), 0);
      dataValues.push(Math.floor(val / 60));
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: '#e67e22',
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  function drawScoreHistoryGraph(subject, records) {
    var canvasId = 'chart-' + btoa(encodeURIComponent(subject)).replace(/=/g, "");
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (accordionCharts[subject]) accordionCharts[subject].destroy();

    var ctx = canvas.getContext('2d');
    var labels = records.map((_, i) => (i + 1) + "回目");
    var dataValues = records.map(r => r.score);

    accordionCharts[subject] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230, 126, 34, 0.1)',
          data: dataValues,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: '#fff',
          pointBorderWidth: 2,
          hoverRadius: 5 
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        clip: false, 
        layout: {
          padding: { top: 15, right: 15, left: 5, bottom: 5 }
        },
        scales: { 
          y: { 
            beginAtZero: true, 
            min: 0,
            max: 100,
            ticks: { stepSize: 20 },
            grid: {
              color: function(ctx) { return ctx.tick.value === 100 ? 'rgba(230, 126, 34, 0.4)' : 'rgba(0, 0, 0, 0.05)'; },
              lineWidth: function(ctx) { return ctx.tick.value === 100 ? 2 : 1; }
            }
          } 
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function render() {
    var listEl = $("#all-records-list");
    var graphContainer = $("#graph-container");
    var dateStr = formatDate(viewDate);
    
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayStr = formatDate(today);
    
    // 日付テキストの更新
    $("#display-date").text(viewDate.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' }));
    
    // カレンダーinputの値を現在の表示日に同期
    $("#calendar-trigger").val(dateStr);

    // 未来制限：今日以降なら「次へ」ボタンを無効化
    if (dateStr >= todayStr) {
      $("#next-date").prop("disabled", true).css({"opacity": "0.3", "pointer-events": "none"});
    } else {
      $("#next-date").prop("disabled", false).css({"opacity": "1", "pointer-events": "auto"});
    }
    
    if (currentType === 'timer') {
      $(".compact-date-pager").show();
      var targetData = allTimerItems.filter(item => item.date === dateStr);
      updateSummary(targetData);
      
      if (currentView === 'graph') {
        listEl.hide();
        graphContainer.show();
        drawWeeklyTimerGraph();
      } else {
        graphContainer.hide();
        listEl.show();
        renderTimerList(targetData, listEl);
      }
    } else {
      $(".compact-date-pager").hide();
      graphContainer.hide();
      listEl.show();
      renderScoreAccordion(allScoreItems, listEl);
    }
  }

  function updateSummary(data) {
    var totalSeconds = data.reduce((sum, item) => sum + (item.seconds || 0), 0);
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    $("#day-total-value").text((h > 0 ? h + "時間" : "") + m + "分");
    $("#item-count").text(data.length + "件");
  }

  function renderTimerList(data, container) {
    var html = data.length ? data.map(m => `
      <li class="memo-item pencil-border">
        <div class="memo-content">
          <div class="memo-upper">
            <span class="memo-subject">${m.subject || "なし"}</span>
            <span class="memo-time-tag">${Math.floor(m.seconds / 60)}分${m.seconds % 60}秒</span>
          </div>
        </div>
      </li>
    `).reverse().join("") : '<li class="memo-item" style="color:#ccc; text-align:center;">記録なし</li>';
    container.html(html);
  }

  function renderScoreAccordion(data, container) {
    var grouped = {};
    data.forEach(item => {
      var s = item.subject || "名称なしテスト";
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(item);
    });

    var html = Object.keys(grouped).map(subject => {
      var records = grouped[subject].sort((a, b) => new Date(a.date) - new Date(b.date));
      var canvasId = 'chart-' + btoa(encodeURIComponent(subject)).replace(/=/g, "");
      var contentInner = currentView === 'graph' ? 
        `<div style="height:180px; padding:10px;"><canvas id="${canvasId}"></canvas></div>` :
        `<ul class="score-history-sublist">${records.map((h, i) => `<li><span class="history-count">${i + 1}回目</span><span class="history-date">${h.date.replace(/-/g, '/')}</span><span class="history-score">${h.score}点</span></li>`).reverse().join("")}</ul>`;

      return `
        <li class="score-accordion-item pencil-border">
          <div class="accordion-header" data-subject="${subject}">
            <span class="memo-subject">${subject}</span>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:0.8rem; color:#8a7357;">全${records.length}回</span>
              <span class="accordion-icon">▼</span>
            </div>
          </div>
          <div class="accordion-content" style="display:none;">${contentInner}</div>
        </li>`;
    }).join("");

    container.html(html || '<li class="memo-item" style="color:#ccc; text-align:center;">記録なし</li>');

    $(".accordion-header").off("click").on("click", function() {
      var $content = $(this).next(".accordion-content");
      var subject = $(this).data("subject");
      var records = grouped[subject].sort((a, b) => new Date(a.date) - new Date(b.date));
      $content.slideToggle(250, function() {
        if (currentView === 'graph' && $content.is(":visible")) drawScoreHistoryGraph(subject, records);
      });
      $(this).find(".accordion-icon").toggleClass("is-open");
    });
  }

  // --- イベント登録 ---

  // 1. カレンダー機能
  // input(type="date")を全面に重ねる手法のため、changeイベントのみで完結
  $("#calendar-trigger").on("change", function() {
    var val = $(this).val();
    if (!val) return;
    
    var selected = new Date(val);
    selected.setHours(0, 0, 0, 0);
    
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // 未来の日付なら今日に補正
    if (selected > today) selected = today;
    
    viewDate = selected;
    render();
  });

  // 2. 表示切り替え（もじ / グラフ）
  $(".view-btn").on("click", function() {
    currentView = $(this).attr("id") === "view-text" ? 'text' : 'graph';
    $(".view-btn").removeClass("active"); 
    $(this).addClass("active");
    render();
  });

  // 3. モード切り替え（じかん / とくてん）
  $(".type-btn").on("click", function() {
    currentType = $(this).attr("id") === "type-timer" ? 'timer' : 'score';
    $(".type-btn").removeClass("active"); 
    $(this).addClass("active");
    render();
  });

  // 4. 日付ナビ（◀）
  $("#prev-date").on("click", function() { 
    viewDate.setDate(viewDate.getDate() - 1); 
    render(); 
  });
  
  // 5. 日付ナビ（▶）※今日までしか進めない制限
  $("#next-date").on("click", function() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (viewDate < today) {
      viewDate.setDate(viewDate.getDate() + 1);
      render();
    }
  });

  fetchAllData().then(render);
});