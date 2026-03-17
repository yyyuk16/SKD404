<?php
/**
 * Googleニュース RSS から日本のニュースを取得する共通関数。
 * news-latest.php / news-personalized.php から require して使用。
 */

if (!function_exists('news_fetch_from_google_rss')) {
    /**
     * @param string $query 検索クエリ（日本語可）。空なら教育・学習系の汎用ニュース。
     * @return array { success: bool, summary: string, news: array, error?: string, demo?: bool }
     */
    function news_fetch_from_google_rss($query)
    {
        // デフォルトは教育・学習まわり
        if ($query === '' || $query === null) {
            $query = '教育 学習 勉強';
        }

        // Googleニュース RSS 検索URL（日本語・日本向け）
        // 参考: https://news.google.com/rss/search?q=キーワード&hl=ja&gl=JP&ceid=JP:ja
        $encoded = urlencode($query);
        $url = 'https://news.google.com/rss/search?q=' . $encoded . '&hl=ja&gl=JP&ceid=JP:ja';

        // RSS の取得
        $context = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'timeout' => 10,
                'header'  => "User-Agent: SKD404-NewsFetcher/1.0\r\n",
            ],
        ]);

        $xmlString = @file_get_contents($url, false, $context);
        if ($xmlString === false) {
            return [
                'success' => false,
                'summary' => '',
                'news'    => [],
                'error'   => 'GoogleニュースRSSの取得に失敗しました。',
            ];
        }

        $xml = @simplexml_load_string($xmlString);
        if ($xml === false || !isset($xml->channel)) {
            return [
                'success' => false,
                'summary' => '',
                'news'    => [],
                'error'   => 'RSSの解析に失敗しました。',
            ];
        }

        $items = [];
        if (isset($xml->channel->item)) {
            foreach ($xml->channel->item as $item) {
                $title = (string)($item->title ?? '');
                $link  = (string)($item->link ?? '');
                $sourceEl = $item->children('http://www.w3.org/2005/Atom');
                $source = '';
                // GoogleニュースRSSでは <source> 要素が channel/item/source に入っていることが多い
                if (isset($item->source)) {
                    $source = (string)$item->source;
                }
                $summary = '';

                if ($title === '' && $link === '') {
                    continue;
                }

                $items[] = [
                    'title'   => $title,
                    'url'     => $link,
                    'source'  => $source,
                    'summary' => $summary,
                ];

                if (count($items) >= 15) {
                    break;
                }
            }
        }

        if (empty($items)) {
            return [
                'success' => false,
                'summary' => '',
                'news'    => [],
                'error'   => 'ニュースが見つかりませんでした。',
            ];
        }

        return [
            'success' => true,
            'summary' => '',
            'news'    => $items,
        ];
    }
}

