import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'ru.blackbearsplay.app',
    appName: 'BBPlay',
    webDir: 'public_html',
    bundledWebRuntime: false,
    server: {
        url: 'https://taskcash.ru/',
        cleartext: false,
    },
};

export default config;
