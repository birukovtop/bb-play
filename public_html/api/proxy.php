<?php
/**
 * BlackBears Play — Прокси к внешнему API vibe.blackbearsplay.ru
 *
 * Все запросы к внешнему API идут через этот файл,
 * чтобы обойти CORS ограничения браузера.
 *
 * Короткие эндпоинты мапятся на полные прокси-пути vibe:
 *   member-topup → /api/v2/cafe/{cafeId}/members/action/topup
 *   client-register → /api/v2/cafe/{cafeId}/members
 *   realtime-balance → /api/v2/cafe/{cafeId}/members (GET)
 */

require_once __DIR__ . '/config.php';

$endpoint = trim($_GET['endpoint'] ?? '');
$endpoint = ltrim($endpoint, '/');

// Маппинг коротких эндпоинтов на полные пути vibe.blackbearsplay.ru
$endpointMap = [
    // Основные (кастомные, обрабатываются на vibe)
    'cafes'                   => '/cafes',
    'available-pcs-for-booking' => '/available-pcs-for-booking',
    'struct-rooms-icafe'      => '/struct-rooms-icafe',
    'all-prices-icafe'        => '/all-prices-icafe',
    'products'                => null, // Динамически: /api/v2/cafe/{cafeId}/products
    'booking'                 => '/booking',
    'all-books-cafes'         => '/all-books-cafes',
    'icafe-id-for-member'     => '/icafe-id-for-member',

    // P0 — Критично (прокси к iCafeCloud через vibe)
    'member-topup'            => null, // Динамически: /api/v2/cafe/{icafe_id}/members/action/topup
    'member-fetch-bonus'      => null, // Динамически: /api/v2/cafe/{icafe_id}/members/action/fetchBonus
    'push-client-status'      => '/push-client-status',
    'client-register'         => null, // Динамически: /api/v2/cafe/{icafe_id}/members

    // P1 — Важно
    'booking-cancel'          => '/booking-cancel',
    'online-pc-list'          => null, // Динамически: /api/v2/cafe/{cafeId}/pcs
    'usage-history'           => null, // Динамически: /api/v2/cafe/{cafeId}/pcSessions
    'members-list'            => null, // Динамически: /api/v2/cafe/{cafeId}/members

    // P2 — Полезно
    'booking-batch'           => '/booking-batch',
    'init-booking-session'    => '/init-booking-session',

    // P3 — Геймификация
    'member-ranking'          => null, // Динамически: /api/v2/cafe/{cafeId}/members/action/rankingUrl
    'customer-analysis'       => null, // GET /api/v2/cafe/{cafeId}/reports/customerAnalysis
    'member-info-by-account'  => null, // POST /api/v2/cafe/{cafeId}/members/action/memberInfo
    'member-details'          => null, // GET /api/v2/cafe/{cafeId}/members/{memberId}
    'member-balance-history'  => null, // Динамически: /api/v2/cafe/{cafeId}/memberBalanceHistory
    'member-balance-history-member' => null, // GET /api/v2/cafe/{cafeId}/members/{memberId}/balanceHistory
    'member-session-history'  => null, // GET /api/v2/cafe/{cafeId}/pcSessions/{memberId}/memberSessionHistory
    'realtime-balance'        => null, // Динамически: /api/v2/cafe/{cafeId}/members (GET)
    'bookings-list'           => null, // Динамически: /api/v2/cafe/{cafeId}/bookings
    'orders-list'             => null, // Динамически: /api/v2/cafe/{cafeId}/memberOrders
    'member-self'             => null, // Динамически: /api/v2/cafe/{cafeId}/memberSelf

    // Платёжные эндпоинты (Member Auth APIs)
    'get-realtime-balance'    => null, // POST /api/v2/cafe/{cafeId}/getRealTimeBalance
    'get-topup-url'           => null, // POST /api/v2/cafe/{cafeId}/getTopupUrl
    'get-topup-status'        => null, // POST /api/v2/cafe/{cafeId}/getTopupStatus
    'manual-pay'              => null, // POST /api/v2/cafe/{cafeId}/manual/pay
    'pay-order'               => null, // POST /api/v2/cafe/{cafeId}/payOrder
    'auto-checkout'           => null, // POST /api/v2/cafe/{cafeId}/autoCheckout
];

if (empty($endpoint) || !array_key_exists($endpoint, $endpointMap)) {
    $allowed = array_keys($endpointMap);
    jsonResponse(416, 'Invalid endpoint. Allowed: ' . implode(', ', $allowed));
}

function proxyIsList(array $value): bool {
    if ($value === []) return true;
    return array_keys($value) === range(0, count($value) - 1);
}

function proxyExtractProductList($payload): array {
    if (!is_array($payload)) return [];
    if (proxyIsList($payload)) return $payload;

    foreach (['products', 'items', 'list', 'rows', 'data'] as $key) {
        if (isset($payload[$key]) && is_array($payload[$key])) {
            $found = proxyExtractProductList($payload[$key]);
            if (!empty($found)) return $found;
        }
    }

    return [];
}

function proxyParseProductDuration(array $product): int {
    foreach (['duration_min', 'duration', 'product_mins', 'product_duration_min', 'mins'] as $key) {
        if (isset($product[$key]) && intval($product[$key]) > 0) {
            return intval($product[$key]);
        }
    }

    $name = strval($product['product_name'] ?? $product['name'] ?? $product['title'] ?? '');
    if (preg_match('/(\d+)\s*(ч|час|hour|h)/iu', $name, $m)) {
        return intval($m[1]) * 60;
    }
    if (preg_match('/(\d+)\s*(м|мин|min)/iu', $name, $m)) {
        return intval($m[1]);
    }

    return 0;
}

function proxyNormalizeProducts(array $products): array {
    $normalized = [];

    foreach ($products as $product) {
        if (!is_array($product)) continue;

        $duration = proxyParseProductDuration($product);
        $rawName = strval($product['product_name'] ?? $product['name'] ?? $product['productName'] ?? $product['title'] ?? '');
        $name = trim(explode('<<<', $rawName)[0]);
        $groupName = strval($product['group_name'] ?? $product['product_group_name'] ?? $product['groupName'] ?? '');
        $looksLikeBookingPackage = $duration > 0
            || preg_match('/пакет|брон|booking|tariff|тариф/iu', $rawName . ' ' . $groupName);

        if (!$looksLikeBookingPackage) continue;

        $price = $product['total_price']
            ?? $product['product_price']
            ?? $product['price']
            ?? $product['sale_price']
            ?? $product['productPrice']
            ?? 0;

        $normalized[] = array_merge($product, [
            'product_id' => $product['product_id'] ?? $product['id'] ?? $product['productId'] ?? null,
            'raw_product_name' => $rawName,
            'product_name' => $name,
            'product_price' => $product['product_price'] ?? $price,
            'total_price' => $product['total_price'] ?? $price,
            'duration' => $product['duration'] ?? $duration,
            'duration_min' => $product['duration_min'] ?? $duration,
            'group_name' => $groupName ?: ($product['group'] ?? 'Booking'),
        ]);
    }

    return $normalized;
}

// Определяем метод HTTP
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $params = $_GET;
    unset($params['endpoint']);

    $cafeId = $params['cafeId'] ?? $params['icafe_id'] ?? ICAFE_CLUB_ID;

    // Маппинг GET эндпоинтов
    $mappedEndpoint = $endpointMap[$endpoint];

    if ($endpoint === 'realtime-balance' || $endpoint === 'members-list') {
        // GET /api/v2/cafe/{cafeId}/members — получаем список, ищем по memberId
        $path = "/api/v2/cafe/{$cafeId}/members";
        $query = $params;
        unset($query['cafeId'], $query['icafe_id'], $query['memberId']);
        $result = remoteGet($path, $query);

        if ($result['code'] === 200 && !empty($result['data']['members'])) {
            $memberId = $params['memberId'] ?? null;
            $members = $result['data']['members'];

            if ($memberId) {
                // Ищем конкретного участника
                $found = null;
                foreach ($members as $m) {
                    if (strval($m['member_id']) === strval($memberId)) {
                        $found = $m;
                        break;
                    }
                }
                if ($found) {
                    jsonResponse(0, 'Success', [
                        'member_id' => $found['member_id'],
                        'account' => $found['member_account'],
                        'balance' => floatval($found['member_balance'] ?? 0),
                        'bonus_balance' => floatval($found['member_balance_bonus'] ?? 0),
                        'points' => floatval($found['member_points'] ?? 0),
                        'name' => $found['member_first_name'] ?? '',
                    ]);
                } else {
                    jsonResponse(1, 'Member not found');
                }
            } else {
                // Возвращаем всех с форматированием
                $formatted = [];
                foreach ($members as $m) {
                    $formatted[] = [
                        'member_id' => $m['member_id'],
                        'account' => $m['member_account'],
                        'balance' => floatval($m['member_balance'] ?? 0),
                        'name' => $m['member_first_name'] ?? '',
                    ];
                }
                jsonResponse(0, 'Success', $formatted);
            }
        } else {
            jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);
        }

    } elseif ($endpoint === 'member-details') {
        $memberId = trim(strval($params['memberId'] ?? ''));
        if ($memberId === '') {
            jsonResponse(422, 'memberId is required');
        }

        $path = "/api/v2/cafe/{$cafeId}/members/{$memberId}";
        $result = remoteGet($path, []);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-info-by-account') {
        $account = trim(strval($params['account'] ?? ''));
        if ($account === '') {
            jsonResponse(422, 'account is required');
        }

        $payload = ['member_account' => $account];
        $password = trim(strval($params['password'] ?? ''));
        if ($password !== '') {
            $payload['member_password'] = $password;
        }

        $path = "/api/v2/cafe/{$cafeId}/members/action/memberInfo";
        $result = remotePost($path, $payload);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'customer-analysis') {
        $dateStart = trim(strval($params['date_start'] ?? $params['dateStart'] ?? ''));
        $dateEnd = trim(strval($params['date_end'] ?? $params['dateEnd'] ?? ''));

        if ($dateEnd === '') {
            $dateEnd = date('Y-m-d');
        }
        if ($dateStart === '') {
            $dateStart = date('Y-m-d', strtotime('-365 days'));
        }

        $path = "/api/v2/cafe/{$cafeId}/reports/customerAnalysis";
        $result = remoteGet($path, [
            'date_start' => $dateStart,
            'date_end' => $dateEnd,
        ]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-balance-history') {
        $memberId = $params['memberId'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/memberBalanceHistory";
        $result = remoteGet($path, ['member_id' => $memberId]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'products') {
        unset($params['cafeId'], $params['icafe_id']);
        $params['sort'] = $params['sort'] ?? 'desc';
        $params['page'] = $params['page'] ?? 1;

        $path = "/api/v2/cafe/{$cafeId}/products";
        $result = remoteGet($path, $params);
        $code = intval($result['code'] ?? 1);

        if ($code !== 0 && $code !== 200) {
            jsonResponse($code, $result['message'] ?? 'Failed to get products');
        }

        $rawProducts = proxyExtractProductList($result['data'] ?? $result);
        $products = proxyNormalizeProducts($rawProducts);
        jsonResponse(0, 'Success', ['products' => $products]);

    } elseif ($endpoint === 'member-balance-history-member') {
        $memberId = $params['memberId'] ?? '';
        $page = $params['page'] ?? 1;
        $path = "/api/v2/cafe/{$cafeId}/members/{$memberId}/balanceHistory";
        $result = remoteGet($path, ['page' => $page]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-session-history') {
        $memberId = $params['memberId'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/pcSessions/{$memberId}/memberSessionHistory";
        $result = remoteGet($path, []);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-ranking') {
        $page = max(1, intval($params['page'] ?? 1));
        $pageSize = max(1, intval($params['pageSize'] ?? 10));
        $memberId = strval($params['memberId'] ?? '');
        $account = trim(strval($params['account'] ?? ''));

        $membersResult = remoteGet("/api/v2/cafe/{$cafeId}/members", [
            'sort_name' => 'member_points',
            'sort' => 'desc',
        ]);

        if (!in_array($membersResult['code'] ?? 1, [0, 200], true)) {
            jsonResponse($membersResult['code'] ?? 1, $membersResult['message'] ?? 'Error', $membersResult['data'] ?? null);
        }

        $members = $membersResult['data']['members'] ?? [];
        if (!is_array($members)) {
            $members = [];
        }

        usort($members, function ($a, $b) {
            $pointsA = floatval($a['member_points'] ?? 0);
            $pointsB = floatval($b['member_points'] ?? 0);
            if ($pointsA === $pointsB) {
                $spentA = floatval($a['member_balance'] ?? 0);
                $spentB = floatval($b['member_balance'] ?? 0);
                return $spentB <=> $spentA;
            }
            return $pointsB <=> $pointsA;
        });

        $rankings = [];
        $currentMember = null;

        foreach ($members as $index => $member) {
            $entry = [
                'rank' => $index + 1,
                'member_id' => $member['member_id'] ?? null,
                'member_account' => $member['member_account'] ?? '',
                'member_name' => $member['member_first_name'] ?? ($member['member_account'] ?? ''),
                'member_points' => floatval($member['member_points'] ?? 0),
                'total_points' => floatval($member['member_points'] ?? 0),
                'total_spent' => floatval($member['member_balance'] ?? 0),
                'total_hours' => floatval($member['member_total_hours'] ?? 0),
                'total_visits' => intval($member['member_total_visits'] ?? 0),
            ];

            $rankings[] = $entry;

            $matchesMemberId = $memberId !== '' && strval($member['member_id'] ?? '') === $memberId;
            $matchesAccount = $account !== '' && mb_strtolower(strval($member['member_account'] ?? '')) === mb_strtolower($account);
            if (($matchesMemberId || $matchesAccount) && $currentMember === null) {
                $currentMember = $entry;
            }
        }

        $offset = ($page - 1) * $pageSize;
        $pagedRankings = array_slice($rankings, $offset, $pageSize);

        jsonResponse(0, 'Success', [
            'rankings' => $pagedRankings,
            'total' => count($rankings),
            'page' => $page,
            'pageSize' => $pageSize,
            'currentMember' => $currentMember,
        ]);

    } elseif ($endpoint === 'bookings-list') {
        $path = "/api/v2/cafe/{$cafeId}/bookings";
        $result = remoteGet($path, $params);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'orders-list') {
        $memberId = $params['memberId'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/memberOrders";
        $result = remoteGet($path, ['member_id' => $memberId]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'online-pc-list') {
        $path = "/api/v2/cafe/{$cafeId}/pcs";
        $result = remoteGet($path, $params);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-self') {
        // Нужно передать Authorization header
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/memberSelf";
        $result = remoteGet($path, $params);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($mappedEndpoint !== null && strpos($mappedEndpoint, '/api/v2/') === 0) {
        // Прямой прокси-путь
        $result = remoteGet($mappedEndpoint, $params);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } else {
        // Обычный эндпоинт на vibe
        $result = remoteGet($mappedEndpoint, $params);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);
    }

} elseif ($method === 'POST') {
    $body = getJSONBody();
    $cafeId = $body['icafe_id'] ?? $body['cafeId'] ?? $_GET['cafeId'] ?? ICAFE_CLUB_ID;

    if ($endpoint === 'member-topup') {
        // POST /api/v2/cafe/{cafeId}/members/action/topup
        $memberId = $body['member_id'] ?? $body['memberId'] ?? '';
        $topupIds = $body['topup_ids'] ?? $memberId;
        $amount = $body['topup_value'] ?? $body['amount'] ?? 0;
        $bonus = $body['topup_balance_bonus'] ?? null;
        $path = "/api/v2/cafe/{$cafeId}/members/action/topup";
        $topupBody = [
            'topup_ids' => (string)$topupIds,
            'topup_value' => floatval($amount),
        ];
        if ($bonus !== null) {
            $topupBody['topup_balance_bonus'] = floatval($bonus);
        }
        $result = remotePost($path, $topupBody);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'get-realtime-balance') {
        // POST /api/v2/cafe/{cafeId}/getRealTimeBalance
        $memberId = $body['member_id'] ?? $body['memberId'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/getRealTimeBalance";
        $result = remotePost($path, ['member_id' => $memberId]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'get-topup-url') {
        // POST /api/v2/cafe/{cafeId}/getTopupUrl
        $path = "/api/v2/cafe/{$cafeId}/getTopupUrl";
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'get-topup-status') {
        // POST /api/v2/cafe/{cafeId}/getTopupStatus
        $path = "/api/v2/cafe/{$cafeId}/getTopupStatus";
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'manual-pay') {
        // POST /api/v2/cafe/{cafeId}/manual/pay
        $path = "/api/v2/cafe/{$cafeId}/manual/pay";
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'pay-order') {
        // POST /api/v2/cafe/{cafeId}/payOrder
        $path = "/api/v2/cafe/{$cafeId}/payOrder";
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'client-register') {
        // POST /api/v2/cafe/{cafeId}/members
        $path = "/api/v2/cafe/{$cafeId}/members";
        $registerBody = [
            'member_account' => $body['account'] ?? $body['member_account'] ?? '',
            'member_first_name' => $body['name'] ?? $body['member_first_name'] ?? '',
            'member_phone' => $body['phone'] ?? $body['member_phone'] ?? '',
            'member_email' => $body['email'] ?? $body['member_email'] ?? '',
            'member_password' => $body['password'] ?? $body['member_password'] ?? '',
        ];
        $result = remotePost($path, $registerBody);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'member-fetch-bonus') {
        $memberId = $body['member_id'] ?? $body['memberId'] ?? '';
        $path = "/api/v2/cafe/{$cafeId}/members/action/fetchBonus";
        $result = remotePost($path, ['member_id' => $memberId]);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'usage-history') {
        $path = "/api/v2/cafe/{$cafeId}/pcSessions";
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } elseif ($endpoint === 'booking-cancel') {
        $path = '/booking-cancel';
        $result = remotePost($path, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

    } else {
        $mappedEndpoint = $endpointMap[$endpoint] ?? '/' . $endpoint;
        $result = remotePost($mappedEndpoint, $body);
        jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);
    }

} elseif ($method === 'DELETE') {
    $body = getJSONBody();
    $cafeId = $body['icafe_id'] ?? $body['cafeId'] ?? ICAFE_CLUB_ID;
    $mappedEndpoint = $endpointMap[$endpoint] ?? '/' . $endpoint;
    $result = remoteDelete($mappedEndpoint, $body);
    jsonResponse($result['code'] ?? 1, $result['message'] ?? 'Error', $result['data'] ?? null);

} else {
    jsonResponse(1, 'Метод не поддерживается');
}
