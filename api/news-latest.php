<?php
/**
 * 最新ニュース API
 * GET /api/news-latest
 * 教育・学習系の最新ニュースを返す。Gemini + Google Search 使用。
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

require __DIR__ . '/_news_shared.php';

$result = news_fetch_from_gemini('');
echo json_encode($result);
