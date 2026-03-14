/**
 * 関連ニュース: 最新ニュース API とあなた向けニュース API から取得して表示
 */
(function () {
  var API_BASE = '/api';

  function renderList(selector, items) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (!items || items.length === 0) {
      el.innerHTML = '<li>ニュースはありません。</li>';
      return;
    }
    var html = items.map(function (n) {
      var title = (n.title || '').replace(/</g, '&lt;');
      var url = n.url || '#';
      var source = (n.source || '').replace(/</g, '&lt;');
      return '<li class="news-item"><a href="' + url + '" target="_blank" rel="noopener">' + title + '</a><div class="news-meta">' + source + '</div></li>';
    }).join('');
    el.innerHTML = html;
  }

  function showLoading(selector, show) {
    var el = document.querySelector(selector);
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function showError(selector, message) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.textContent = message || '読み込みに失敗しました。';
    el.style.display = message ? 'block' : 'none';
  }

  function loadLatest() {
    var listId = '#news-list-latest';
    var loadingId = '#news-latest-loading';
    var errorId = '#news-latest-error';

    showLoading(loadingId, true);
    showError(errorId, '');

    fetch(API_BASE + '/news-latest')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        showLoading(loadingId, false);
        if (data.success && Array.isArray(data.news)) {
          renderList(listId, data.news);
        } else {
          showError(errorId, data.error || 'ニュースを取得できませんでした。');
          renderList(listId, []);
        }
      })
      .catch(function () {
        showLoading(loadingId, false);
        showError(errorId, '通信エラーです。');
        renderList(listId, []);
      });
  }

  function loadPersonalized(subject, hobby) {
    var listId = '#news-list-personalized';
    var loadingId = '#news-personalized-loading';
    var errorId = '#news-personalized-error';

    showLoading(loadingId, true);
    showError(errorId, '');

    var params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (hobby) params.set('hobby', hobby);
    var url = API_BASE + '/news-personalized' + (params.toString() ? '?' + params.toString() : '');

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        showLoading(loadingId, false);
        if (data.success && Array.isArray(data.news)) {
          renderList(listId, data.news);
        } else {
          showError(errorId, data.error || 'ニュースを取得できませんでした。');
          renderList(listId, []);
        }
      })
      .catch(function () {
        showLoading(loadingId, false);
        showError(errorId, '通信エラーです。');
        renderList(listId, []);
      });
  }

  $(function () {
    loadLatest();

    if (!window.EduChar || typeof window.EduChar.getUserId !== 'function') {
      loadPersonalized('', '');
      return;
    }

    window.EduChar.getUserId(function (uid) {
      if (!uid) {
        loadPersonalized('', '');
        return;
      }
      window.EduChar.getProfile(uid, function (profile) {
        var subject = (profile && profile.subject) ? profile.subject : '';
        var hobby = (profile && profile.hobby) ? profile.hobby : '';
        loadPersonalized(subject, hobby);
      });
    });
  });
})();
