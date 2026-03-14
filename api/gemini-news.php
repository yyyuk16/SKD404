<?php
/**
 * Gemini API: Google Search Grounding で最新ニュース取得
 * news.html 用。興味・学習分野に合わせたニュースを取得し、タイトル・URL一覧を返す。
 * 環境変数 GEMINI_API_KEY または .env で API キーを設定すること。
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// トピック: GET の query / POST の body から取得（任意）
$topic = '';
if ($method === 'GET' && !empty($_GET['topic'])) {
    $topic = trim((string) $_GET['topic']);
} elseif ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    $topic = isset($body['topic']) ? trim((string) $body['topic']) : '';
}

$apiKey = getenv('GEMINI_API_KEY');
if ($apiKey === false || $apiKey === '') {
    $envPath = dirname(__DIR__) . '/.env';
    if (is_file($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos($line, 'GEMINI_API_KEY=') === 0) {
                $apiKey = trim(substr($line, strlen('GEMINI_API_KEY=')), " \t\"'");
                break;
            }
        }
    }
}

if ($apiKey === false || $apiKey === '') {
    http_response_code(500);
    echo json_encode(['error' => 'GEMINI_API_KEY not configured']);
    exit;
}

// Grounding with Google Search 対応モデル（gemini-2.5-flash など）
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
    'contents' => [
        [
            'parts' => [
                ['text' => $prompt]
            ]
        ]
    ],
    'generationConfig' => [
        'maxOutputTokens' => 2048,
        'temperature' => 0.7
    ],
    'tools' => [
        ['google_search' => (object)[]]
    ]
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
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed', 'detail' => $err]);
    exit;
}

$data = json_decode($response, true);

if ($status !== 200 || !is_array($data)) {
    http_response_code(502);
    echo json_encode([
        'error' => 'Gemini API error',
        'status' => $status,
        'body' => $response
    ]);
    exit;
}

// テキスト回答
$summary = '';
if (!empty($data['candidates'][0]['content']['parts'][0]['text'])) {
    $summary = trim($data['candidates'][0]['content']['parts'][0]['text']);
}

// groundingMetadata から引用元（ニュース記事リンク）を抽出
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

// 重複 URL を除去（同一記事の重複を防ぐ）
$seen = [];
$newsItems = array_values(array_filter($newsItems, function ($item) use (&$seen) {
    $url = $item['url'];
    if (isset($seen[$url])) {
        return false;
    }
    $seen[$url] = true;
    return true;
}));

// 最大件数
$newsItems = array_slice($newsItems, 0, 15);

echo json_encode([
    'success' => true,
    'summary' => $summary,
    'news' => $newsItems,
    'searchQueries' => $grounding['webSearchQueries'] ?? []
]);
