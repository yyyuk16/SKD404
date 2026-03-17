<?php
/**
 * あなた向けニュース API（プロフィールの得意教科・趣味に基づく）
 * GET /api/news-personalized?subject=算数&hobby=サッカー
 * subject, hobby は任意。両方空の場合は「教育・学習」の一般的なニュースを返す。
 * GoogleニュースRSS の検索クエリに subject / hobby を反映して取得する。
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

require __DIR__ . '/_news_rss.php';

$subject = isset($_GET['subject']) ? trim((string) $_GET['subject']) : '';
$hobby = isset($_GET['hobby']) ? trim((string) $_GET['hobby']) : '';

$queryParts = [];
if ($subject !== '') $queryParts[] = $subject;
if ($hobby !== '')  $queryParts[] = $hobby;

// プロフィール情報があればそれを中心に、なければ教育・学習の汎用クエリ
$query = '';
if (!empty($queryParts)) {
    $query = implode(' ', $queryParts) . ' 教育 学習';
}

$result = news_fetch_from_google_rss($query);
echo json_encode($result);
