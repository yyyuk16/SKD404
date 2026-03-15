<?php
/**
 * ニュース API 共通: Gemini + Google Search でニュース取得
 * news-latest.php / news-personalized.php から require して使用
 */

if (!function_exists('news_load_gemini_key')) {
    function news_load_gemini_key() {
        // 1. .env を優先して読む（開発時に変更が反映されやすいように）
        $envPath = dirname(__DIR__) . '/.env';
        if (is_file($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos($line, 'GEMINI_API_KEY=') === 0) {
                    $value = trim(substr($line, strlen('GEMINI_API_KEY=')));
                    return trim($value, " \t\"'");
                }
            }
        }

        // 2. 環境変数（サーバー本番想定）
        $apiKey = getenv('GEMINI_API_KEY');
        if ($apiKey !== false && $apiKey !== '') {
            return $apiKey;
        }

        return '';
    }
}

if (!function_exists('news_fetch_from_gemini')) {
    /**
     * @param string $topic 検索トピック（空の場合は教育・学習の一般的な最新ニュース）
     * @return array { success: bool, summary: string, news: array, error?: string }
     */
    function news_fetch_from_gemini($topic) {
        $apiKey = news_load_gemini_key();
        if ($apiKey === '') {
            return ['success' => false, 'summary' => '', 'news' => [], 'error' => 'GEMINI_API_KEY not configured'];
        }

        $model = 'gemini-2.5-flash';
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . urlencode($apiKey);

        // 日本語プロンプト + JSON 形式で要約付きニュース一覧を要求
        $prompt = "日本の直近数日間のニュースのうち、";
        if ($topic !== '') {
            $prompt .= "「{$topic}」に関係するものを中心に、";
        } else {
            $prompt .= "教育・学習・勉強のコツなどに関するものを中心に、";
        }
        $prompt .= "重要な記事をいくつか挙げてください。\n";
        $prompt .= "各ニュースについて、次の情報を日本語でまとめてください。\n";
        $prompt .= "- title: 記事のタイトル\n";
        $prompt .= "- summary: 小中高生にも分かるような 1〜2 文の要約\n";
        $prompt .= "- source: 出典（サイト名）\n";
        $prompt .= "- url: 記事の URL\n\n";
        $prompt .= "出力は次のような JSON オブジェクト 1 つだけにしてください。\n";
        $prompt .= "{\"items\":[{\"title\":\"...\",\"summary\":\"...\",\"source\":\"...\",\"url\":\"...\"}]}\n";
        $prompt .= "前後に説明文やコードブロック記号（```）などは付けないでください。";

        $payload = [
            'contents' => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => [
                'maxOutputTokens' => 2048,
                'temperature'     => 0.7,
            ],
            'tools' => [['google_search' => (object)[]]]
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['success' => false, 'summary' => '', 'news' => [], 'error' => '通信エラー: ' . $err];
        }
        $data = json_decode($response, true);
        if ($status !== 200 || !is_array($data)) {
            $message = 'Gemini API error';
            if (is_array($data) && !empty($data['error']['message'])) {
                $message = $data['error']['message'];
            } elseif ($status === 401 || $status === 403) {
                $message = 'API キーが無効か、権限がありません。.env の GEMINI_API_KEY を確認してください。';
            } elseif ($status === 429) {
                $message = 'リクエスト制限に達しました。しばらく待ってから再試行してください。';
            } elseif ($status >= 500) {
                $message = 'サーバーエラーです。しばらくしてから再試行してください。';
            }
            return ['success' => false, 'summary' => '', 'news' => [], 'error' => $message];
        }

        if (empty($data['candidates'][0])) {
            $reason = $data['promptFeedback']['blockReason'] ?? 'no candidates';
            return ['success' => false, 'summary' => '', 'news' => [], 'error' => '結果を取得できませんでした。（' . $reason . '）'];
        }

        // 1. モデルのテキスト出力から JSON をパースして、title / summary / source / url を取得する
        $summary = '';
        $newsItems = [];

        if (!empty($data['candidates'][0]['content']['parts'][0]['text'])) {
            $rawText = trim($data['candidates'][0]['content']['parts'][0]['text']);
            $summary = $rawText;

            // ```json ... ``` や説明文が付いていても、最初の { から最後の } までを JSON とみなしてパースする
            $firstBrace = strpos($rawText, '{');
            $lastBrace  = strrpos($rawText, '}');
            if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
                $jsonText = substr($rawText, $firstBrace, $lastBrace - $firstBrace + 1);
            } else {
                $jsonText = $rawText;
            }

            $json = json_decode($jsonText, true);
            if (is_array($json) && !empty($json['items']) && is_array($json['items'])) {
                foreach ($json['items'] as $item) {
                    if (empty($item['url']) && empty($item['title']) && empty($item['summary'])) {
                        continue;
                    }
                    $newsItems[] = [
                        'title' => isset($item['title']) ? (string)$item['title'] : '',
                        'summary' => isset($item['summary']) ? (string)$item['summary'] : '',
                        'source' => isset($item['source']) ? (string)$item['source'] : '',
                        'url' => isset($item['url']) ? (string)$item['url'] : '#'
                    ];
                }
            }
        }

        // 2. JSON がうまくパースできなかった場合は、groundingMetadata からタイトルと URL だけ拾う従来ロジックにフォールバック
        if (empty($newsItems)) {
            $candidate = $data['candidates'][0] ?? [];
            $grounding = $candidate['groundingMetadata'] ?? [];
            if (!empty($grounding['groundingChunks']) && is_array($grounding['groundingChunks'])) {
                foreach ($grounding['groundingChunks'] as $chunk) {
                    $web = $chunk['web'] ?? null;
                    if ($web && !empty($web['uri'])) {
                        $newsItems[] = [
                            'title' => isset($web['title']) ? $web['title'] : preg_replace('#^https?://#', '', $web['uri']),
                            'summary' => '',
                            'url' => $web['uri'],
                            'source' => isset($web['title']) ? $web['title'] : ''
                        ];
                    }
                }
            }
        }

        $seen = [];
        $newsItems = array_values(array_filter($newsItems, function ($item) use (&$seen) {
            $url = $item['url'];
            if (isset($seen[$url])) return false;
            $seen[$url] = true;
            return true;
        }));
        $newsItems = array_slice($newsItems, 0, 15);

        return ['success' => true, 'summary' => $summary, 'news' => $newsItems];
    }
}
