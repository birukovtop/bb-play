<?php
/**
 * VK wall feed proxy for BlackBears Play.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

$offset = max(0, (int)($_GET['offset'] ?? 0));
$count = min(50, max(1, (int)($_GET['count'] ?? 15)));
$ownerId = -221562447;
$token = defined('VK_ACCESS_TOKEN') ? trim((string)VK_ACCESS_TOKEN) : '';

if ($token === '') {
    $parsed = getVkPublicPosts($offset, $count, $ownerId);
    jsonResponse(0, $parsed['posts'] ? 'Success' : 'VK public feed unavailable', [
        'posts' => $parsed['posts'],
        'next_offset' => $parsed['next_offset'],
        'has_more' => $parsed['has_more'],
        'source' => 'public_html',
        'fallback_url' => 'https://vk.com/bbplay__tmb',
        'fallback_reason' => $parsed['fallback_reason'],
        'debug' => $parsed['debug'],
    ]);
}

$params = http_build_query([
    'owner_id' => $ownerId,
    'offset' => $offset,
    'count' => $count,
    'access_token' => $token,
    'v' => '5.199',
]);

$url = 'https://api.vk.com/method/wall.get?' . $params;
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_CONNECTTIMEOUT => 5,
]);
$raw = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($raw === false || $http < 200 || $http >= 300) {
    logMsg('VK_POSTS_ERROR', json_encode(['http' => $http, 'error' => $curlError], JSON_UNESCAPED_UNICODE));
    jsonResponse(0, 'VK API unavailable', [
        'posts' => [],
        'next_offset' => $offset,
        'has_more' => false,
        'fallback_url' => 'https://vk.com/bbplay__tmb',
        'fallback_reason' => 'api_unavailable',
    ]);
}

$json = json_decode($raw, true);
if (!is_array($json) || isset($json['error'])) {
    logMsg('VK_POSTS_RESPONSE_ERROR', $raw);
    jsonResponse(0, 'VK API error', [
        'posts' => [],
        'next_offset' => $offset,
        'has_more' => false,
        'fallback_url' => 'https://vk.com/bbplay__tmb',
        'fallback_reason' => 'api_error',
    ]);
}

$response = $json['response'] ?? [];
$items = is_array($response['items'] ?? null) ? $response['items'] : [];
$total = (int)($response['count'] ?? 0);
$posts = array_map('normalizeVkPost', $items);
$nextOffset = $offset + count($items);

jsonResponse(0, 'Success', [
    'posts' => $posts,
    'next_offset' => $nextOffset,
    'has_more' => $nextOffset < $total,
    'fallback_url' => 'https://vk.com/bbplay__tmb',
]);

function normalizeVkPost(array $post): array {
    $ownerId = (int)($post['owner_id'] ?? -221562447);
    $postId = (int)($post['id'] ?? 0);
    $attachments = [];

    foreach (($post['attachments'] ?? []) as $attachment) {
        if (!is_array($attachment)) continue;
        $type = $attachment['type'] ?? '';
        if ($type === 'photo' && isset($attachment['photo'])) {
            $sizes = $attachment['photo']['sizes'] ?? [];
            $best = null;
            foreach ($sizes as $size) {
                if (!$best || (int)($size['width'] ?? 0) > (int)($best['width'] ?? 0)) {
                    $best = $size;
                }
            }
            if ($best && !empty($best['url'])) {
                $attachments[] = [
                    'type' => 'photo',
                    'url' => $best['url'],
                    'width' => $best['width'] ?? null,
                    'height' => $best['height'] ?? null,
                ];
            }
        } elseif ($type === 'link' && isset($attachment['link'])) {
            $attachments[] = [
                'type' => 'link',
                'url' => $attachment['link']['url'] ?? '',
                'title' => $attachment['link']['title'] ?? '',
                'caption' => $attachment['link']['caption'] ?? '',
            ];
        }
    }

    return [
        'id' => $postId,
        'owner_id' => $ownerId,
        'date' => (int)($post['date'] ?? 0),
        'text' => (string)($post['text'] ?? ''),
        'attachments' => $attachments,
        'url' => 'https://vk.com/wall' . $ownerId . '_' . $postId,
        'embed_hash' => $post['hash'] ?? null,
    ];
}

function getVkPublicPosts(int $offset, int $count, int $ownerId): array {
    $cacheFile = __DIR__ . '/cache/vk_posts_public.json';
    $ttl = 600;

    $cached = readVkPublicCache($cacheFile, $ttl);
    $required = $offset + $count;

    if ($cached && !empty($cached['_legacy_schema']) && count($cached['posts'] ?? []) < $required) {
        $cached = null;
    }

    if (!$cached) {
        $initial = fetchInitialVkPublicFeed($ownerId);
        if (!$initial['posts']) {
            $fallbackReason = $initial['network_failed'] ? 'network_unavailable' : 'parser_unavailable';
            logMsg($initial['network_failed'] ? 'VK_PUBLIC_NETWORK_UNAVAILABLE' : 'VK_PUBLIC_PARSE_EMPTY', json_encode($initial['debug'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $result = slicePublicPosts([], $offset, $count, false);
            $result['fallback_reason'] = $fallbackReason;
            $result['debug'] = $initial['debug'];
            return $result;
        }
        $cached = [
            'created_at' => time(),
            'posts' => $initial['posts'],
            'continuation' => $initial['continuation'],
            'continuation_available' => !empty($initial['continuation']),
            'exhausted' => empty($initial['continuation']),
            'owner_id' => $ownerId,
        ];
        writeVkPublicCache($cacheFile, $cached);
    }

    $debug = [];
    if (needsMoreVkPublicPosts($cached, $required)) {
        $hydrated = hydrateVkPublicCache($cached, $ownerId, $required);
        $cached = $hydrated['cache'];
        if (!$cached['posts']) {
            $result = slicePublicPosts([], $offset, $count, false);
            $result['fallback_reason'] = $hydrated['network_failed'] ? 'network_unavailable' : 'parser_unavailable';
            $result['debug'] = $hydrated['debug'];
            return $result;
        }
        $debug = $hydrated['debug'];
        writeVkPublicCache($cacheFile, $cached);
    }

    $result = slicePublicPosts(
        is_array($cached['posts'] ?? null) ? $cached['posts'] : [],
        $offset,
        $count,
        !empty($cached['continuation_available']) && empty($cached['exhausted'])
    );
    $result['fallback_reason'] = null;
    $result['debug'] = [];
    return $result;
}

function readVkPublicCache(string $cacheFile, int $ttl): ?array {
    if (!is_file($cacheFile) || time() - filemtime($cacheFile) >= $ttl) {
        return null;
    }

    $cached = json_decode((string)file_get_contents($cacheFile), true);
    if (!is_array($cached) || !isset($cached['posts']) || !is_array($cached['posts'])) {
        return null;
    }

    $cached['_legacy_schema'] = !array_key_exists('continuation_available', $cached) && !array_key_exists('continuation', $cached);
    $cached['continuation'] = is_array($cached['continuation'] ?? null) ? $cached['continuation'] : [];
    $cached['continuation_available'] = !empty($cached['continuation_available']) || !empty($cached['continuation']);
    $cached['exhausted'] = (bool)($cached['exhausted'] ?? false);
    return $cached;
}

function writeVkPublicCache(string $cacheFile, array $cache): void {
    $dir = dirname($cacheFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    unset($cache['_legacy_schema']);

    @file_put_contents($cacheFile, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function needsMoreVkPublicPosts(array $cache, int $required): bool {
    $posts = is_array($cache['posts'] ?? null) ? $cache['posts'] : [];
    return count($posts) < $required && !empty($cache['continuation_available']) && empty($cache['exhausted']);
}

function fetchInitialVkPublicFeed(int $ownerId): array {
    $sources = [
        'https://vk.com/widget_community.php?' . http_build_query([
            'app' => 0,
            'width' => '360px',
            '_ver' => 1,
            'gid' => abs($ownerId),
            'mode' => 4,
            'color1' => '101827',
            'color2' => 'E8F2FF',
            'color3' => '00D9FF',
            'class_name' => '',
            'height' => 760,
            'url' => (defined('APP_HOST') ? APP_HOST : 'https://swebrubir2.temp.swtest.ru') . '/',
        ]),
        'https://m.vk.com/bbplay__tmb',
        'https://vk.com/bbplay__tmb',
    ];

    $bestPosts = [];
    $bestContinuation = [];
    $debug = [
        'source_url' => '',
        'html_length' => 0,
        'posts_found' => 0,
        'http_status' => 0,
        'fetch_error' => '',
        'wall_refs' => 0,
        'attempts' => [],
    ];
    $networkFailed = true;

    foreach ($sources as $source) {
        $fetched = fetchVkPublicHtml($source);
        $posts = $fetched['html'] !== '' ? parseVkPublicPosts($fetched['html'], $ownerId) : [];
        $continuation = $fetched['html'] !== '' ? extractVkContinuation($fetched['html'], $source) : [];
        $attempt = [
            'source_url' => $source,
            'html_length' => strlen($fetched['html']),
            'posts_found' => count($posts),
            'http_status' => $fetched['http_status'],
            'fetch_error' => $fetched['error'],
            'wall_refs' => countVkWallRefs($fetched['html'], $ownerId),
            'continuation' => summarizeVkContinuation($continuation),
        ];
        $debug = $attempt + ['attempts' => $debug['attempts']];
        $debug['attempts'][] = $attempt;

        if ($fetched['html'] === '') {
            continue;
        }

        $networkFailed = false;
        if (count($posts) > count($bestPosts)) {
            $bestPosts = $posts;
            $bestContinuation = $continuation;
        }

        if ($posts && $continuation) {
            break;
        }
    }

    return [
        'posts' => $bestPosts,
        'continuation' => $bestContinuation,
        'debug' => $debug,
        'network_failed' => $networkFailed,
    ];
}

function hydrateVkPublicCache(array $cache, int $ownerId, int $required): array {
    $maxPosts = 50;
    $maxSteps = 5;
    $debug = ['attempts' => []];
    $networkFailed = true;

    for ($step = 0; $step < $maxSteps; $step++) {
        $currentPosts = is_array($cache['posts'] ?? null) ? $cache['posts'] : [];
        if (count($currentPosts) >= $required || count($currentPosts) >= $maxPosts) {
            break;
        }

        $continuation = is_array($cache['continuation'] ?? null) ? $cache['continuation'] : [];
        if (!$continuation) {
            $cache['continuation_available'] = false;
            $cache['exhausted'] = true;
            break;
        }

        $next = fetchMoreVkPublicFeed($continuation, $ownerId);
        $debug['attempts'][] = $next['debug'];
        if ($next['debug']['html_length'] > 0) {
            $networkFailed = false;
        }

        if (!$next['posts']) {
            $cache['continuation'] = [];
            $cache['continuation_available'] = false;
            $cache['exhausted'] = true;
            break;
        }

        $mergedPosts = mergeVkPublicPosts($currentPosts, $next['posts']);
        if (count($mergedPosts) <= count($currentPosts)) {
            $cache['continuation'] = [];
            $cache['continuation_available'] = false;
            $cache['exhausted'] = true;
            break;
        }

        $cache['posts'] = $mergedPosts;
        $cache['continuation'] = $next['continuation'];
        $cache['continuation_available'] = !empty($next['continuation']);
        $cache['exhausted'] = empty($next['continuation']);
    }

    return [
        'cache' => $cache,
        'debug' => $debug,
        'network_failed' => $networkFailed,
    ];
}

function fetchMoreVkPublicFeed(array $continuation, int $ownerId): array {
    $url = (string)($continuation['url'] ?? '');
    if ($url === '') {
        return [
            'posts' => [],
            'continuation' => [],
            'debug' => [
                'source_url' => '',
                'html_length' => 0,
                'posts_found' => 0,
                'http_status' => 0,
                'fetch_error' => 'missing continuation url',
                'wall_refs' => 0,
                'continuation' => [],
            ],
        ];
    }

    $fetched = fetchVkPublicHtml($url);
    $posts = $fetched['html'] !== '' ? parseVkPublicPosts($fetched['html'], $ownerId) : [];
    $nextContinuation = $fetched['html'] !== '' ? extractVkContinuation($fetched['html'], $url) : [];

    return [
        'posts' => $posts,
        'continuation' => isSameVkContinuation($continuation, $nextContinuation) ? [] : $nextContinuation,
        'debug' => [
            'source_url' => $url,
            'html_length' => strlen($fetched['html']),
            'posts_found' => count($posts),
            'http_status' => $fetched['http_status'],
            'fetch_error' => $fetched['error'],
            'wall_refs' => countVkWallRefs($fetched['html'], $ownerId),
            'continuation' => summarizeVkContinuation($nextContinuation),
        ],
    ];
}

function mergeVkPublicPosts(array $existing, array $incoming): array {
    $seen = [];
    $merged = [];

    foreach (array_merge($existing, $incoming) as $post) {
        $key = ((int)($post['owner_id'] ?? 0)) . '_' . ((int)($post['id'] ?? 0));
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $post;
    }

    usort($merged, fn($a, $b) => (int)($b['id'] ?? 0) <=> (int)($a['id'] ?? 0));
    return array_slice($merged, 0, 50);
}

function fetchVkPublicHtml(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,*/*;q=0.8',
            'Accept-Language: ru-RU,ru;q=0.9,en;q=0.6',
            'Referer: ' . (defined('APP_HOST') ? APP_HOST : 'https://swebrubir2.temp.swtest.ru') . '/',
            'User-Agent: Mozilla/5.0',
        ],
    ]);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($raw === false || $http < 200 || $http >= 300) {
        logMsg('VK_PUBLIC_FETCH_ERROR', json_encode(['url' => $url, 'http' => $http, 'error' => $error], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return fetchVkPublicHtmlWithBinary($url, $http, $error);
    }

    return [
        'html' => normalizeVkHtmlEncoding((string)$raw),
        'http_status' => $http,
        'error' => '',
    ];
}

function fetchVkPublicHtmlWithBinary(string $url, int $previousHttp = 0, string $previousError = ''): array {
    if (!function_exists('shell_exec')) {
        return [
            'html' => '',
            'http_status' => $previousHttp,
            'error' => $previousError ?: 'shell_exec is disabled',
        ];
    }

    $candidates = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN'
        ? ['C:\\Windows\\System32\\curl.exe', 'C:\\Windows\\SysWOW64\\curl.exe', 'curl.exe', 'curl']
        : ['/usr/bin/curl', '/bin/curl', 'curl'];
    $lastError = $previousError;

    foreach ($candidates as $binary) {
        $cmd = shellArgForOs($binary)
            . ' -sS -L --max-time 10'
            . ' -w ' . shellArgForOs('__BBPLAY_HTTP_CODE__:%{http_code}')
            . ' -A ' . shellArgForOs('Mozilla/5.0')
            . ' -e ' . shellArgForOs((defined('APP_HOST') ? APP_HOST : 'https://swebrubir2.temp.swtest.ru') . '/')
            . ' ' . shellArgForOs($url)
            . ' 2>&1';
        $raw = @shell_exec($cmd);
        if (!is_string($raw) || $raw === '') {
            $lastError = 'empty curl binary output: ' . $binary;
            continue;
        }

        $http = 0;
        if (preg_match('/__BBPLAY_HTTP_CODE__:(\d{3})\s*$/', $raw, $match)) {
            $http = (int)$match[1];
            $raw = preg_replace('/\s*__BBPLAY_HTTP_CODE__:\d{3}\s*$/', '', $raw);
        }

        if ($http >= 200 && $http < 300 && strpos($raw, '<') !== false) {
            return [
                'html' => normalizeVkHtmlEncoding($raw),
                'http_status' => $http,
                'error' => '',
            ];
        }

        $lastError = trim(mb_substr($raw, 0, 500, 'UTF-8')) ?: 'curl binary failed: ' . $binary;
        logMsg('VK_PUBLIC_BINARY_FETCH_ERROR', json_encode([
            'binary' => $binary,
            'http' => $http,
            'error' => $lastError,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    return [
        'html' => '',
        'http_status' => $previousHttp,
        'error' => $lastError ?: 'curl binary fetch failed',
    ];
}

function normalizeVkHtmlEncoding(string $html): string {
    if ($html === '') {
        return '';
    }

    if (preg_match('/charset=["\']?windows-1251/i', $html)) {
        return mb_convert_encoding($html, 'UTF-8', 'Windows-1251');
    }

    return $html;
}

function shellArgForOs(string $value): string {
    if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
        return escapeshellarg($value);
    }

    return '"' . str_replace('"', '""', $value) . '"';
}

function parseVkPublicPosts(string $html, int $ownerId): array {
    $posts = [];
    $seen = [];
    $ownerAbsPattern = preg_quote((string)abs($ownerId), '/');
    $wallOwnerPattern = '(?:' . preg_quote((string)$ownerId, '/') . '|(?:-|&#45;|%2D)' . $ownerAbsPattern . ')';

    if (preg_match_all('/<div[^>]+class="[^"]*wcommunity_post[^"]*"[^>]*>.*?(?=<div[^>]+class="[^"]*wcommunity_post[^"]*"|<div[^>]+id="community_footer"|$)/isu', $html, $blocks)) {
        foreach ($blocks[0] as $block) {
            if (!preg_match('/wall(' . $wallOwnerPattern . ')_(\d+)/iu', $block, $match)) {
                continue;
            }
            $postId = (int)$match[2];
            if ($postId <= 0 || isset($seen[$postId])) {
                continue;
            }
            $seen[$postId] = true;
            $posts[] = normalizeVkPublicPost($ownerId, $postId, $block);
            if (count($posts) >= 50) {
                break;
            }
        }
    }

    if (!$posts) {
        if (!preg_match_all('/(?:href=|data-post-id=|data-post-click-type=|["\'])[^>]{0,180}wall(' . $wallOwnerPattern . ')_(\d+)/iu', $html, $matches, PREG_OFFSET_CAPTURE)) {
            preg_match_all('/wall(' . $wallOwnerPattern . ')_(\d+)/iu', $html, $matches, PREG_OFFSET_CAPTURE);
        }

        foreach (($matches[2] ?? []) as $index => $match) {
            $postId = (int)$match[0];
            if ($postId <= 0 || isset($seen[$postId])) {
                continue;
            }
            $seen[$postId] = true;
            $position = (int)($matches[0][$index][1] ?? 0);
            $chunk = substr($html, max(0, $position - 1800), 7200);
            $posts[] = normalizeVkPublicPost($ownerId, $postId, $chunk);
            if (count($posts) >= 50) {
                break;
            }
        }
    }

    usort($posts, fn($a, $b) => (int)$b['id'] <=> (int)$a['id']);
    return array_values($posts);
}

function extractVkContinuation(string $html, string $sourceUrl): array {
    if ($html === '') {
        return [];
    }

    $candidates = [];

    if (preg_match_all('/(?:href|data-more-href|data-url|data-load-more)=["\']([^"\']*(?:showMorePost|show_more|load_more|al_wall\.php)[^"\']*)["\']/iu', $html, $matches)) {
        foreach ($matches[1] as $value) {
            $url = absolutizeVkUrl(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'), $sourceUrl);
            if ($url !== '') {
                $candidates[] = ['url' => $url, 'type' => 'explicit_url'];
            }
        }
    }

    $from = '';
    foreach ([
        '/["\'](?:start_from|next_from|from_id|from)["\']\s*[:=]\s*["\']([^"\']+)["\']/iu',
        '/\b(?:start_from|next_from|from_id|from)=([^"&<>\']+)/iu',
    ] as $pattern) {
        if (preg_match($pattern, $html, $match)) {
            $from = trim((string)$match[1]);
            if ($from !== '') {
                break;
            }
        }
    }

    if ($from !== '') {
        $parsed = parse_url($sourceUrl);
        $path = $parsed['path'] ?? '';
        if (str_contains($path, 'widget_community.php')) {
            $query = [];
            parse_str((string)($parsed['query'] ?? ''), $query);
            $query['from'] = $from;
            $query['offset'] = (int)($query['offset'] ?? 0) + 10;
            $candidates[] = [
                'url' => 'https://vk.com/widget_community.php?' . http_build_query($query),
                'type' => 'widget_from',
                'cursor' => $from,
            ];
        }

        if (preg_match('~https://m\.vk\.com/~i', $sourceUrl)) {
            $candidates[] = [
                'url' => 'https://m.vk.com/bbplay__tmb?from=' . rawurlencode($from),
                'type' => 'mobile_from',
                'cursor' => $from,
            ];
        }

        $candidates[] = [
            'url' => 'https://vk.com/bbplay__tmb?from=' . rawurlencode($from),
            'type' => 'public_from',
            'cursor' => $from,
        ];
    }

    foreach ($candidates as $candidate) {
        if (!empty($candidate['url'])) {
            return $candidate;
        }
    }

    return [];
}

function absolutizeVkUrl(string $value, string $sourceUrl): string {
    $value = trim($value);
    if ($value === '' || str_starts_with($value, 'javascript:')) {
        return '';
    }

    if (str_starts_with($value, '//')) {
        return 'https:' . $value;
    }

    if (preg_match('~^https?://~i', $value)) {
        return $value;
    }

    if (str_starts_with($value, '/')) {
        return 'https://vk.com' . $value;
    }

    $base = preg_replace('~/[^/?#]*$~', '/', $sourceUrl);
    return $base . ltrim($value, '/');
}

function summarizeVkContinuation(array $continuation): array {
    if (!$continuation) {
        return [];
    }

    return [
        'type' => $continuation['type'] ?? '',
        'cursor' => $continuation['cursor'] ?? '',
        'url' => $continuation['url'] ?? '',
    ];
}

function isSameVkContinuation(array $left, array $right): bool {
    return (string)($left['url'] ?? '') !== '' && (string)($left['url'] ?? '') === (string)($right['url'] ?? '');
}

function countVkWallRefs(string $html, int $ownerId): int {
    if ($html === '') {
        return 0;
    }

    $ownerAbsPattern = preg_quote((string)abs($ownerId), '/');
    $ownerPattern = '(?:' . preg_quote((string)$ownerId, '/') . '|(?:-|&#45;|%2D)' . $ownerAbsPattern . ')';
    preg_match_all('/wall' . $ownerPattern . '_\d+/iu', $html, $matches);
    return count(array_unique($matches[0] ?? []));
}

function normalizeVkPublicPost(int $ownerId, int $postId, string $chunk): array {
    $text = extractVkPublicText($chunk);
    $dateLabel = extractVkPublicDate($chunk);
    $image = extractVkPublicImage($chunk);
    $attachments = [];

    if ($image !== '') {
        $attachments[] = [
            'type' => 'photo',
            'url' => $image,
            'width' => null,
            'height' => null,
        ];
    }

    return [
        'id' => $postId,
        'owner_id' => $ownerId,
        'date' => 0,
        'date_label' => $dateLabel,
        'text' => $text,
        'attachments' => $attachments,
        'url' => 'https://vk.com/wall' . $ownerId . '_' . $postId,
        'embed_hash' => null,
    ];
}

function extractVkPublicText(string $chunk): string {
    $patterns = [
        '/<div[^>]+class="[^"]*(?:wall_post_text|pi_text|wi_body|post__text)[^"]*"[^>]*>(.*?)<\/div>/isu',
        '/<div[^>]+class="[^"]*wall_text[^"]*"[^>]*>(.*?)<\/div>/isu',
        '/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/isu',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $chunk, $match)) {
            return cleanVkPublicText($match[1]);
        }
    }

    return '';
}

function extractVkPublicDate(string $chunk): string {
    $patterns = [
        '/<a[^>]+class="[^"]*(?:wi_date|rel_date)[^"]*"[^>]*>(.*?)<\/a>/isu',
        '/<span[^>]+class="[^"]*(?:wi_date|rel_date)[^"]*"[^>]*>(.*?)<\/span>/isu',
        '/<a[^>]+class="[^"]*wcommunity_post_date[^"]*"[^>]*>(.*?)<\/a>/isu',
        '/datetime="([^"]+)"/isu',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $chunk, $match)) {
            return cleanVkPublicText($match[1]);
        }
    }

    return '';
}

function extractVkPublicImage(string $chunk): string {
    $patterns = [
        '/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*>/isu',
        '/background-image:\s*url\(([^)]+\.(?:jpg|jpeg|png|webp)(?:\?[^)]*)?)\)/isu',
        '/https?:\\\\\/\\\\\/[^"\']+\.(?:jpg|jpeg|png|webp)(?:\?[^"\']*)?/isu',
        '/https?:\/\/[^"\']+\.(?:jpg|jpeg|png|webp)(?:\?[^"\']*)?/isu',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $chunk, $match)) {
            $url = trim($match[1] ?? $match[0], " \t\n\r\0\x0B'\"");
            $url = str_replace(['\\/', '&amp;'], ['/', '&'], $url);
            if (str_starts_with($url, '//')) {
                $url = 'https:' . $url;
            }
            if (str_starts_with($url, 'http')) {
                return $url;
            }
        }
    }

    return '';
}

function cleanVkPublicText(string $value): string {
    $value = preg_replace('/<br\s*\/?>/iu', "\n", $value);
    $value = strip_tags($value);
    $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = preg_replace('/\s+\n/u', "\n", $value);
    $value = preg_replace('/[ \t]{2,}/u', ' ', $value);
    $value = trim((string)$value);

    if (mb_strlen($value, 'UTF-8') > 900) {
        $value = mb_substr($value, 0, 897, 'UTF-8') . '...';
    }

    return $value;
}

function slicePublicPosts(array $posts, int $offset, int $count, bool $continuationAvailable = false): array {
    $slice = array_slice($posts, $offset, $count);
    $nextOffset = $offset + count($slice);
    $total = count($posts);

    return [
        'posts' => $slice,
        'next_offset' => $nextOffset,
        'has_more' => $nextOffset < $total || ($continuationAvailable && $nextOffset >= $total),
    ];
}
