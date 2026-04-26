/**
 * BlackBears Play - Конфигурация приложения
 */
const BB_RUNTIME_CONFIG = (() => {
    const existing = window.BB_APP_CONFIG || {};
    const basePath = existing.basePath ?? '';
    const normalizedBasePath = basePath === '/' ? '' : String(basePath).replace(/\/$/, '');

    return {
        basePath: normalizedBasePath,
        apiBase: existing.apiBase || `${normalizedBasePath}/api`,
        adminApi: existing.adminApi || `${normalizedBasePath}/admin/api/admin-api.php`,
    };
})();

window.BB_APP_CONFIG = BB_RUNTIME_CONFIG;

const CONFIG = {
    API_BASE: 'https://vibe.blackbearsplay.ru',
    vkGroupId: 221562447,
    vkGroupSlug: 'bbplay__tmb',

    TEST_ACCOUNTS: {
        test1: 'test1',
        test2: 'test2',
        test3: 'test3',
    },

    USER_DISCOUNT: 0.15,
    OVERTIME_MINUTES: 30,

    getDefaultDate() {
        return this.formatDate(new Date());
    },

    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    formatDateCurrent() {
        return this.formatDate(new Date());
    },

    getDefaultTime() {
        const now = new Date();
        let h = now.getHours();
        let m = now.getMinutes();

        if (m > 0 && m <= 30) m = 30;
        else if (m > 30) {
            m = 0;
            h = (h + 1) % 24;
        }

        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    formatTime(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    },

    DURATION_OPTIONS: [
        { label: '60 мин', value: 60 },
        { label: '90 мин', value: 90 },
        { label: '120 мин', value: 120 },
        { label: '180 мин', value: 180 },
    ],

    TOPUP_PRESETS: [100, 300, 500, 1000],

    ERROR_MESSAGES: window.BBText?.get('config.errors', {}) || {},

    getErrorMessage(code) {
        return this.ERROR_MESSAGES[code] || `Ошибка (${code})`;
    },

    BARNEY_PHRASES: window.BBText?.get('config.phrases', {}) || {},

    randomPhrase(key) {
        return window.BBText?.pick(`config.phrases.${key}`, '') || '';
    },
};
