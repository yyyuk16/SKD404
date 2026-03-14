# バックエンド実装 フロントエンド引継ぎ

バックエンドで実装した内容と、フロントエンドで行うべき連携の要点をまとめます。

---

## 1. 実装した API 一覧

| エンドポイント | メソッド | 概要 |
|----------------|----------|------|
| `/api/gemini.php` | POST | キャラクター画像生成（Imagen 4） |
| `/api/gemini-news.php` | GET / POST | 最新ニュース取得（Google Search Grounding） |

開発サーバー起動時は `http://localhost:8000/api/...` でアクセス可能です。

---

## 2. キャラクター画像生成 API（`/api/gemini.php`）

### 仕様

- **リクエスト**: `POST`, `Content-Type: application/json`
- **ボディ**: `{ "prompt": "キャラクターの説明文（英語推奨、日本語も可）" }`
- **レスポンス（成功）**:
  ```json
  {
    "success": true,
    "imageBase64": "base64エンコードされた画像データ",
    "mimeType": "image/png"
  }
  ```
- **レスポンス（失敗）**: `success: false` または `error` キーでメッセージ

日本語プロンプトを送った場合、バックエンド側で簡易英訳してから Imagen に渡しています。

### 参考: Python SDK との対応

公式の Python SDK では次のように呼び出します。PHP の `/api/gemini.php` はこれと同等の処理を REST（`imagen-4.0-generate-001:predict`）で行っています。

```python
from google import genai
from google.genai import types

client = genai.Client()
response = client.models.generate_images(
    model='imagen-4.0-generate-001',
    prompt='Robot holding a red skateboard',
    config=types.GenerateImagesConfig(number_of_images=4)
)
# response.generated_images が画像リスト
```

### フロントでの呼び出し例（ホーム画面）

`public/js/home.js` で、プロフィール読み込み後に「画像を生成」ボタンや自動で次のように呼び出せます。

```javascript
// 例: キャラ説明から画像を生成して表示
function generateCharacterImage() {
  var prompt = window.EduChar._lastGeminiPrompt; // buildGeminiPrompt(profile) の結果
  if (!prompt) return;

  fetch('/api/gemini.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.success && data.imageBase64) {
        var dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
        var imgEl = document.querySelector('#character-image img');
        if (!imgEl) {
          imgEl = document.createElement('img');
          document.getElementById('character-image').appendChild(imgEl);
        }
        imgEl.src = dataUrl;
        imgEl.style.display = 'block';
        var emojiEl = document.getElementById('character-emoji');
        if (emojiEl) emojiEl.style.display = 'none';
        // 任意: sessionStorage に保存して次回表示を維持
        sessionStorage.setItem('edu_char_image_url', dataUrl);
      } else {
        console.error('Image generation failed', data);
      }
    })
    .catch(function (err) {
      console.error('Request failed', err);
    });
}
```

- 既存の `#character-image` 内には `img` が無い場合があるため、存在しなければ `img` を生成して追加してください。
- `index.html` のキャラ画像エリアに `<img>` を事前に置いておく実装でも構いません。

---

## 3. 最新ニュース API（`/api/gemini-news.php`）

### 仕様

- **リクエスト**:
  - **GET**: `GET /api/gemini-news.php?topic=プログラミング教育` （`topic` は任意）
  - **POST**: `Content-Type: application/json`, ボディ `{ "topic": "興味・学習分野" }`（任意）
- **レスポンス（成功）**:
  ```json
  {
    "success": true,
    "summary": "Gemini が生成したニュース要約テキスト（日本語）",
    "news": [
      { "title": "記事タイトルまたはサイト名", "url": "https://...", "source": "サイト名" }
    ],
    "searchQueries": ["検索に使ったクエリ1", "..."]
  }
  ```
- **レスポンス（失敗）**: `error` キーでメッセージ

`news` 配列は Google Search Grounding の引用元（`groundingChunks`）から生成しています。最大 15 件まで返します。

### フロントでの呼び出し例（ニュース画面）

`public/js/news.js` で、固定の `DEMO_NEWS` の代わりに API を呼んで `#news-list` を描画します。

```javascript
// 例: プロフィールの得意教科・趣味を topic にしてもよい
function loadNews(topic) {
  var url = '/api/gemini-news.php';
  if (topic) url += '?topic=' + encodeURIComponent(topic);

  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.success) {
        document.getElementById('news-list').innerHTML = '<li>ニュースの取得に失敗しました。</li>';
        return;
      }
      var list = data.news || [];
      var summary = data.summary || '';
      // list が空の場合は summary だけ表示するなどのフォールバックも可
      var html = '';
      if (summary) {
        html += '<li class="news-summary">' + escapeHtml(summary) + '</li>';
      }
      list.forEach(function (n) {
        html += '<li class="news-item">';
        html += '<a href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener">' + escapeHtml(n.title || n.url) + '</a>';
        html += '<div class="news-meta">' + escapeHtml(n.source || '') + '</div>';
        html += '</li>';
      });
      document.getElementById('news-list').innerHTML = html || '<li>ニュースはありません。</li>';
    })
    .catch(function () {
      document.getElementById('news-list').innerHTML = '<li>ニュースの取得に失敗しました。</li>';
    });
}

function escapeHtml(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
```

- トピックは、ログイン済みなら Firebase のプロフィール（得意教科・趣味）を読み、`loadNews(profile.subject + ' 教育')` のように渡すと、興味に合わせたニュースになります。
- `news` が空でも `summary` がある場合があるので、両方とも表示するかどうかは UI 方針に合わせて調整してください。

---

## 4. 共通事項

### 4.1 API のベース URL

- 開発時: `php -S localhost:8000 router.php` で起動しているため、相対パス `/api/gemini.php`, `/api/gemini-news.php` で同じオリジンとしてアクセスできます。
- 本番で PHP を別ドメインにデプロイする場合は、フロント側でベース URL を定数化し、`fetch(BASE_URL + '/api/gemini.php', ...)` のようにすることを推奨します。

### 4.2 エラーハンドリング

- 両 API とも、エラー時は HTTP 4xx/5xx と JSON の `error` や `message` を返します。フロントでは `res.ok` や `data.success` を確認し、ユーザーに「しばらくしてからやり直してください」などのメッセージを表示するとよいです。

### 4.3 API キー

- バックエンドでは `.env` の `GEMINI_API_KEY` または環境変数 `GEMINI_API_KEY` を参照しています。フロントから API キーを送る必要はありません。

### 4.4 CORS

- 両 API で `Access-Control-Allow-Origin: *` を付与しています。別オリジンから呼ぶ場合も、必要に応じてプリフライト（OPTIONS）に対応済みです。

---

## 5. フロントで行うとよい作業まとめ

1. **ホーム（`index.html` / `home.js`）**
   - キャラ説明表示後に、`/api/gemini.php` を POST で呼び出し、返却された `imageBase64` を `data:image/png;base64,...` として `<img>` に設定する。
   - 必要なら「画像を再生成」ボタンを追加する。

2. **ニュース（`news.html` / `news.js`）**
   - 起動時に `/api/gemini-news.php` を GET（必要なら `?topic=...` 付き）で呼び出し、`news` 配列で `#news-list` を描画する。任意で `summary` も表示する。
   - プロフィールがある場合は `topic` に得意教科・趣味を渡すと、より関連ニュースが出やすくなります。

3. **読み込み中・エラー表示**
   - 両画面とも、API 呼び出し中のローディング表示と、失敗時のメッセージ表示を入れると UX がよくなります。

以上で、バックエンド実装の引継ぎは完了です。不明点があればバックエンド担当に確認してください。
