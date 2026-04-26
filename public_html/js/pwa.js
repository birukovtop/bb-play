const PWAInstall = (() => {
    const DISMISS_KEY = 'bbplay_pwa_prompt_dismissed_v1';
    const UPDATE_DISMISS_KEY = 'bbplay_pwa_update_dismissed_v1';
    const IOS_MATCH = /iphone|ipad|ipod/i;
    const SAFARI_MATCH = /safari/i;
    const CHROME_MATCH = /crios|fxios|chrome|android/i;

    let deferredPrompt = null;
    let installMode = null;
    let registration = null;
    let promptEl = null;

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady, { once: true });
        } else {
            onReady();
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredPrompt = event;
            installMode = 'android';
            showPrompt();
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            localStorage.removeItem(DISMISS_KEY);
            hidePrompt();
        });
    }

    function onReady() {
        ensurePrompt();
        updateStandaloneClass();
        registerServiceWorker();

        if (shouldShowIosPrompt()) {
            installMode = 'ios';
            showPrompt();
        }
    }

    function ensurePrompt() {
        if (promptEl) return;

        promptEl = document.createElement('aside');
        promptEl.className = 'pwa-install';
        promptEl.setAttribute('aria-live', 'polite');
        promptEl.innerHTML = `
            <div class="pwa-install__top">
                <div class="pwa-install__badge">BB</div>
                <div>
                    <div class="pwa-install__eyebrow" data-pwa-eyebrow>Установка</div>
                    <div class="pwa-install__title" data-pwa-title>Установить BlackBears Play</div>
                    <div class="pwa-install__text" data-pwa-text>Откроется как отдельное приложение на домашнем экране.</div>
                    <ol class="pwa-install__steps hidden" data-pwa-steps>
                        <li>Открой меню Share в Safari.</li>
                        <li>Нажми “На экран Домой”.</li>
                        <li>Подтверди установку и запускай приложение как обычное.</li>
                    </ol>
                </div>
                <button type="button" class="pwa-install__close" data-pwa-close aria-label="Закрыть">✕</button>
            </div>
            <div class="pwa-install__actions">
                <button type="button" class="pwa-install__button pwa-install__button--primary" data-pwa-action>Установить</button>
                <button type="button" class="pwa-install__button pwa-install__button--ghost" data-pwa-later>Позже</button>
            </div>
        `;

        promptEl.querySelector('[data-pwa-close]').addEventListener('click', dismissPrompt);
        promptEl.querySelector('[data-pwa-later]').addEventListener('click', dismissPrompt);
        promptEl.querySelector('[data-pwa-action]').addEventListener('click', handleAction);
        document.body.appendChild(promptEl);
    }

    async function handleAction() {
        if (installMode === 'android' && deferredPrompt) {
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice.catch(() => null);
            if (result && result.outcome === 'accepted') {
                hidePrompt();
            } else {
                dismissPrompt();
            }
            deferredPrompt = null;
            return;
        }

        if (installMode === 'update' && registration?.waiting) {
            localStorage.removeItem(UPDATE_DISMISS_KEY);
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            hidePrompt();
            return;
        }

        dismissPrompt();
    }

    function dismissPrompt() {
        const key = installMode === 'update' ? UPDATE_DISMISS_KEY : DISMISS_KEY;
        localStorage.setItem(key, '1');
        hidePrompt();
    }

    function showPrompt() {
        if (!promptEl || !installMode || isStandalone()) return;

        const storageKey = installMode === 'update' ? UPDATE_DISMISS_KEY : DISMISS_KEY;
        if (localStorage.getItem(storageKey) === '1') return;

        const eyebrow = promptEl.querySelector('[data-pwa-eyebrow]');
        const title = promptEl.querySelector('[data-pwa-title]');
        const text = promptEl.querySelector('[data-pwa-text]');
        const steps = promptEl.querySelector('[data-pwa-steps]');
        const action = promptEl.querySelector('[data-pwa-action]');

        if (installMode === 'ios') {
            eyebrow.textContent = 'iPhone / iPad';
            title.textContent = 'Добавь BlackBears Play на экран Домой';
            text.textContent = 'На iPhone установка идёт через Safari и занимает пару касаний.';
            steps.classList.remove('hidden');
            action.textContent = 'Понятно';
        } else if (installMode === 'update') {
            eyebrow.textContent = 'Обновление';
            title.textContent = 'Доступна новая версия приложения';
            text.textContent = 'Обновим PWA-оболочку, чтобы открыть свежую версию без старого кэша.';
            steps.classList.add('hidden');
            action.textContent = 'Обновить';
        } else {
            eyebrow.textContent = 'Android';
            title.textContent = 'Установить BlackBears Play';
            text.textContent = 'Запускай приложение с домашнего экрана, без браузерной адресной строки.';
            steps.classList.add('hidden');
            action.textContent = 'Установить';
        }

        promptEl.classList.add('is-visible');
    }

    function hidePrompt() {
        if (promptEl) {
            promptEl.classList.remove('is-visible');
        }
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function updateStandaloneClass() {
        document.documentElement.classList.toggle('app-standalone', isStandalone());
    }

    function shouldShowIosPrompt() {
        const ua = window.navigator.userAgent || '';
        const isIos = IOS_MATCH.test(ua);
        const isSafari = SAFARI_MATCH.test(ua) && !CHROME_MATCH.test(ua);
        return isIos && isSafari && !isStandalone();
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (!window.isSecureContext && !isLocalhost()) return;

        try {
            registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });

            if (registration.waiting && navigator.serviceWorker.controller) {
                installMode = 'update';
                showPrompt();
            }

            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        installMode = 'update';
                        showPrompt();
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        } catch (error) {
            console.warn('[PWA] Service worker registration failed:', error);
        }
    }

    function isLocalhost() {
        return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    }

    return { init };
})();

PWAInstall.init();
