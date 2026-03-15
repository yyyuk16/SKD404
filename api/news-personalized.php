<?php
/**
 * あなた向けニュース API（プロフィールの得意教科・趣味に基づく）
 * GET /api/news-personalized?subject=算数&hobby=サッカー
 * subject, hobby は任意。両方空の場合は「教育・学習」の一般的なニュースを返す。
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

$subject = isset($_GET['subject']) ? trim((string) $_GET['subject']) : '';
$hobby = isset($_GET['hobby']) ? trim((string) $_GET['hobby']) : '';

$topic = '';
if ($subject !== '' || $hobby !== '') {
    $parts = array_filter([$subject, $hobby]);
    $topic = implode(' ', $parts) . ' 教育 学習 ニュース';
}

$result = news_fetch_from_gemini($topic);
echo json_encode($result);
