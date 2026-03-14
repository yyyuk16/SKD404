<?php
/**
 * ニュース API 共通: Gemini + Google Search でニュース取得
 * news-latest.php / news-personalized.php から require して使用
 */

if (!function_exists('news_load_gemini_key')) {
    function news_load_gemini_key() {
        $apiKey = getenv('GEMINI_API_KEY');
        if ($apiKey !== false && $apiKey !== '') {
            return $apiKey;
        }
        $envPath = dirname(__DIR__) . '/.env';
        if (is_file($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos($line, 'GEMINI_API_KEY=') === 0) {
                    return trim(substr($line, strlen('GEMINI_API_KEY=')), " \t\"'");
                }
            }
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

        $model = 'gemini-2.0-flash';
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . urlencode($apiKey);

        $prompt = 'List the latest news articles (in Japan, from the last few days) about ';
        if ($topic !== '') {
            $prompt .= $topic . '. ';
        } else {
            $prompt .= 'education, learning, or study tips for students. ';
        }
        $prompt .= 'For each news item, provide: 1) title, 2) source name, 3) publication date if available, 4) URL. Format as a clear list. Write in Japanese.';

        $payload = [
            'contents' => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['maxOutputTokens' => 2048, 'temperature' => 0.7],
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

        $summary = '';
        if (!empty($data['candidates'][0]['content']['parts'][0]['text'])) {
            $summary = trim($data['candidates'][0]['content']['parts'][0]['text']);
        }

        $newsItems = [];
        $candidate = $data['candidates'][0] ?? [];
        $grounding = $candidate['groundingMetadata'] ?? [];
        if (!empty($grounding['groundingChunks']) && is_array($grounding['groundingChunks'])) {
            foreach ($grounding['groundingChunks'] as $chunk) {
                $web = $chunk['web'] ?? null;
                if ($web && !empty($web['uri'])) {
                    $newsItems[] = [
                        'title' => isset($web['title']) ? $web['title'] : preg_replace('#^https?://#', '', $web['uri']),
                        'url' => $web['uri'],
                        'source' => isset($web['title']) ? $web['title'] : ''
                    ];
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
