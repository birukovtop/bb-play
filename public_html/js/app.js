/**
 * BlackBears Play — Главный модуль приложения
 * Инициализация и связывание всех модулей
 */
const App = {
    _cafesLoadPromise: null,

    // ==========================================
    // Инициализация приложения
    // ==========================================
    async init() {
        console.log('🐻 BlackBears Play — Инициализация...');

        // Инициализируем UI
        UI.init();

        // Инициализируем состояние
        AppState.init();

        // Инициализируем модули заранее, чтобы интерфейс был интерактивным
        Auth.init();
        Friends.init();
        Avatar.init();
        this._bindGlobalButtons();

        // Проверяем: пришёл с приглашением
        const params = new URLSearchParams(window.location.search);
        const inviteToken = params.get('invite');
        if (inviteToken) {
            sessionStorage.setItem('invite_token', inviteToken);
            // Очищаем URL чтобы не было ?invite= при редиректах
            window.history.replaceState({}, '', 'index.html');
        }

        // Если пользователь уже авторизован — показываем главный экран
        if (AppState.currentUser) {
            await this.enterAuthenticatedSession();
        } else {
            UI.showScreen('auth');
            UI.initSound();
            UI.unlockAudio(); // Разблокируем аудио для экрана авторизации

            const token = sessionStorage.getItem('invite_token');
            if (token) {
                // Проверяем что токен ещё валиден и сразу используем данные
                try {
                    const data = await API.validateInvitation(token);
                    // Валиден — режим регистрации + баннер
                    UI.setAuthMode('register');
                    UI.showInviteBanner({
                        sender: data.sender_name || data.sender_login,
                        expires: data.expires_at,
                        bonus: 50,
                    });
                } catch (e) {
                    // Токен истёк или использован — молча удаляем, показываем вход
                    sessionStorage.removeItem('invite_token');
                    UI.setAuthMode('login');
                }
            } else {
                // Без приглашения — обычный режим входа
                UI.setAuthMode('login');
            }
        }

        console.log('✅ Приложение готово к работе');
    },

    async ensureCafesLoaded(force = false) {
        if (!force && Array.isArray(AppState.cafes) && AppState.cafes.length > 0) {
            return AppState.cafes;
        }

        if (this._cafesLoadPromise) {
            return this._cafesLoadPromise;
        }

        this._cafesLoadPromise = API.getCafes()
            .then((cafes) => {
                AppState.cafes = Array.isArray(cafes) ? cafes : [];
                AppState.saveSession();
                return AppState.cafes;
            })
            .catch((error) => {
                console.warn('[App] failed to load cafes:', error);
                return AppState.cafes || [];
            })
            .finally(() => {
                this._cafesLoadPromise = null;
            });

        return this._cafesLoadPromise;
    },

    async _bootstrapLiveUserState() {
        if (!AppState.currentUser) {
            return null;
        }

        const tasks = [
            Avatar._loadCurrent(),
            this.ensureCafesLoaded(),
            Profile.hydrateCurrentUser({
                includeDetails: true,
                includeRealtime: true,
                includeRank: true,
                updateStatusBar: false,
                saveSession: true,
            })
        ];

        await Promise.allSettled(tasks);
        UI.updateStatusBar();
        return AppState.currentUser;
    },

    async enterAuthenticatedSession(options = {}) {
        const {
            welcomeNewUser = false,
        } = options || {};

        if (!AppState.currentUser) {
            return;
        }

        UI.showScreen('main');
        UI.initSound();
        UI.initStatusBarClicks();
        UI.unlockAudio();
        UI.updateStatusBar();

        await this._bootstrapLiveUserState();

        if (welcomeNewUser) {
            await Dialogs.welcomeNewUser();
            return;
        }

        await Dialogs.mainMenu();
    },

    // ==========================================
    // Баннер приглашения на экране авторизации
    // ==========================================
    async _showInviteBanner(token) {
        try {
            const data = await API.validateInvitation(token);
            UI.showInviteBanner({
                sender: data.sender_name || data.sender_login,
                expires: data.expires_at,
                bonus: 50,
            });
        } catch (e) {
            console.warn('Не удалось загрузить приглашение:', e.message);
            sessionStorage.removeItem('invite_token');
        }
    },

    // ==========================================
    // Обновить баланс текущего пользователя с сервера
    // ==========================================
    async _refreshBalance() {
        if (!AppState.currentUser) {
            console.warn('💰 _refreshBalance: нет currentUser');
            return;
        }
        try {
            const icafeId = AppState.currentUser.icafeId || '87375';
            const memberId = AppState.currentUser.memberId;

            console.log('💰 Запрос баланса: cafeId=' + icafeId + ', memberId=' + memberId);

            const memberData = await API._viaProxy('GET', 'realtime-balance', {
                cafeId: icafeId,
                memberId: memberId,
            });

            console.log('💰 Ответ сервера:', JSON.stringify(memberData, null, 2));

            if (memberData) {
                const newBalance = parseFloat(memberData.member_balance ?? memberData.balance ?? 0);
                AppState.currentUser.balance = API.applyDemoBalance(AppState.currentUser, newBalance);
                AppState.saveSession();
                UI.updateStatusBar();
                console.log('✅ Баланс обновлён:', newBalance);
            } else {
                console.warn('💰 Пустой ответ от сервера');
            }
        } catch (e) {
            console.error('❌ Не удалось обновить баланс:', e.message);
        }
    },

    // ==========================================
    // Глобальные кнопки
    // ==========================================
    _bindGlobalButtons() {
        // Выход
        UI.elements.btnLogout?.addEventListener('click', () => {
            Auth.handleLogout();
        });

        // Закрытие модалки пополнения
        UI.elements.btnCloseTopup.addEventListener('click', () => {
            UI.hideModalTopup();
        });

        // Пополнение — теперь обрабатывается в Profile._handleTopupModal()
        // Кнопка привязывается там при открытии модалки
    }
};

// ==========================================
// Запуск при загрузке страницы
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
