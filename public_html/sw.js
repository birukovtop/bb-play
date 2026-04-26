const SHELL_CACHE = 'bbplay-shell-v20260426-5';
const RUNTIME_CACHE = 'bbplay-runtime-v20260426-5';
const EXCLUDED_PREFIXES = ['/api/', '/admin/api/', '/avatars/'];
const PRECACHE_URLS = [
    './',
    './index.html',
    './invite.html',
    './manifest.webmanifest',
    './css/style.css',
    './js/texts.ru.js',
    './js/config.js',
    './js/api.js',
    './js/state.js',
    './js/ui.js',
    './js/auth.js',
    './js/dialogs.js',
    './js/booking.js',
    './js/profile.js',
    './js/support.js',
    './js/catalog.js',
    './js/orders.js',
    './js/avatar.js',
    './js/friends.js',
    './js/pwa.js',
    './js/app.js',
    './vendor/qrcodejs/qrcode.min.js',
    './assets/bear.svg',
    './assets/pwa/icon-192.png',
    './assets/pwa/icon-512.png',
    './assets/pwa/icon-maskable-512.png',
    './assets/pwa/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (isExcluded(url.pathname)) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigation(event.request, url));
        return;
    }

    if (isCacheableAsset(url.pathname)) {
        event.respondWith(cacheFirst(event.request));
    }
});

function isExcluded(pathname) {
    return EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isCacheableAsset(pathname) {
    return /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|webmanifest)$/i.test(pathname);
}

async function handleNavigation(request, url) {
    try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        const fallbackKey = url.pathname.endsWith('/invite.html') ? './invite.html' : './index.html';
        await cache.put(fallbackKey, response.clone());
        return response;
    } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        const fallbackKey = url.pathname.endsWith('/invite.html') ? './invite.html' : './index.html';
        return (await cache.match(fallbackKey)) || Response.error();
    }
}

async function cacheFirst(request) {
    const shellCache = await caches.open(SHELL_CACHE);
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    const cached = await runtimeCache.match(request, { ignoreSearch: true })
        || await shellCache.match(request, { ignoreSearch: true });

    if (cached) {
        fetchAndUpdate(request, runtimeCache);
        return cached;
    }

    const response = await fetch(request);
    if (response && response.ok) {
        await runtimeCache.put(request, response.clone());
    }
    return response;
}

async function fetchAndUpdate(request, cache) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
    } catch (error) {
        return;
    }
}
