<?php
/**
 * ニュース API キー確認用（開発時のみ使用）
 * GET /api/news-debug
 * キーが .env から読めているか・形式の目安だけ返す（キー本体は出さない）
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

require __DIR__ . '/_news_shared.php';
$key = news_load_gemini_key();

$out = [
    'envFound' => $key !== '',
    'keyLength' => strlen($key),
    'keyPrefix' => $key !== '' ? substr($key, 0, 5) : '',
    'hint' => ''
];

if ($key === '') {
    $out['hint'] = '.env の GEMINI_API_KEY が空です。';
} elseif (strlen($key) < 30) {
    $out['hint'] = 'キーが短すぎる可能性があります。コピー漏れを確認してください。';
} elseif (strpos($key, 'AIza') !== 0) {
    $out['hint'] = 'Google API キーは通常 AIza で始まります。';
} else {
    $out['hint'] = '形式は問題なさそうです。GCP で「Generative Language API」が有効か確認してください。';
}

echo json_encode($out);
