/**
 * BlackBears Play — Управление состоянием приложения
 */
const AppState = {
    // Текущий пользователь
    currentUser: null,

    // Настройки
    settings: {
        textMode: 'typing',  // 'typing' | 'instant'
    },
    /*
    currentUser = {
        login: 'test1',
        memberId: '312077721789',   // ID в iCafe
        icafeId: '74922',           // ID клуба по умолчанию
        balance: 500,               // Баланс (демо)
        name: 'Тестовый воин',
        phone: '+79991234567',
        email: 'test@test.com',
        discount: 0.15,             // Скидка
        bookings: []                // История бронирований
    }
    */

    // Контекст бронирования
    bookingCtx: null,
    /*
    bookingCtx = {
        step: 0,                    // Текущий шаг
        selectedCafe: null,         // { icafe_id, address }
        selectedDate: '2026-04-08',
        selectedTime: '18:00',
        selectedDuration: 60,
        selectedPC: null,           // { pc_name, pc_area_name, ... }
        selectedPrice: null,        // Информация о тарифе/пакете
        availablePCs: [],           // Список ПК от API
        prices: null,               // { prices: [], products: [] }
        pendingBooking: null        // Данные для подтверждения
    }
    */

    // Список клубов (кэшируется)
    cafes: [],

    // Текущий экран диалога
    dialogScreen: 'main',  // 'main' | 'booking' | 'profile' | 'clubs' | 'news' | 'support'

    // Инициализация
    init() {
        // Загружаем настройки
        const savedSettings = localStorage.getItem('bbplay_settings');
        if (savedSettings) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            } catch (e) {}
        }

        // Пробуем восстановить сессию из localStorage
        const saved = localStorage.getItem('bbplay_session');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.currentUser) {
                    this.currentUser = this.normalizeUser({
                        ...data.currentUser,
                        bonusBalance: data.currentUser.bonusBalance ?? data.bonusBalance ?? 0,
                        points: data.currentUser.points ?? data.points ?? 0,
                    });
                    this.currentUser._bonusLoaded = true; // Бонус баланс и очки уже есть
                    this.bookingCtx = this._createBookingCtx();
                    this.cafes = data.cafes || [];
                }
            } catch (e) {
                console.warn('Не удалось восстановить сессию:', e);
            }
        }

        if (!this.currentUser) {
            this.bookingCtx = this._createBookingCtx();
        }
    },

    // Сохранить сессию
    saveSession() {
        if (this.currentUser) {
            localStorage.setItem('bbplay_session', JSON.stringify({
                currentUser: this.currentUser,
                cafes: this.cafes,
                bonusBalance: this.currentUser.bonusBalance || 0,
                points: this.currentUser.points || 0,
            }));
        }
    },

    // Сохранить настройки
    saveSettings() {
        localStorage.setItem('bbplay_settings', JSON.stringify(this.settings));
    },

    // Очистить сессию
    clearSession() {
        this.currentUser = null;
        this.bookingCtx = this._createBookingCtx();
        this.cafes = [];
        this.dialogScreen = 'main';
        localStorage.removeItem('bbplay_session');
    },

    // Установить пользователя
    setUser(user) {
        this.currentUser = this.normalizeUser(user);
        this.bookingCtx = this._createBookingCtx();
        // Не сохраняем брони в localStorage — они из внешнего API
        this.saveSession();
    },

    normalizeUser(user) {
        if (!user || typeof user !== 'object') {
            return null;
        }

        const normalizedRank = parseInt(user.rank, 10);
        const normalizedDiscount = parseFloat(user.discount);
        const normalizedBalance = parseFloat(user.balance);
        const normalizedBonusBalance = parseFloat(user.bonusBalance ?? user.bonus_balance ?? 0);
        const normalizedPoints = parseFloat(user.points ?? 0);

        return {
            ...user,
            balance: Number.isFinite(normalizedBalance) ? normalizedBalance : 0,
            bonusBalance: Number.isFinite(normalizedBonusBalance) ? normalizedBonusBalance : 0,
            points: Number.isFinite(normalizedPoints) ? normalizedPoints : 0,
            discount: Number.isFinite(normalizedDiscount) ? normalizedDiscount : 0,
            bookings: Array.isArray(user.bookings) ? user.bookings : [],
            rank: Number.isFinite(normalizedRank) && normalizedRank > 0 ? normalizedRank : null,
        };
    },

    // Обновить баланс
    updateBalance(amount) {
        if (this.currentUser) {
            this.currentUser.balance = (this.currentUser.balance || 0) + amount;
            this.saveSession();
        }
    },

    // Создать чистый контекст бронирования
    _createBookingCtx() {
        return {
            step: 0,
            bookingFor: 'self',
            selectedFriend: null,
            selectedFriends: [],
            selectedCafe: null,
            selectedDate: CONFIG.getDefaultDate(),
            selectedTime: CONFIG.getDefaultTime(),
            selectedDuration: 60,
            selectedPC: null,
            selectedFriendPC: null,
            selectedPrice: null,
            selectedPriceInfo: null,
            selectedPackageId: null,
            tariffType: 'hourly', // 'hourly' | 'package'
            availablePCs: [],
            prices: null,
            pendingBooking: null
        };
    },

    // Сбросить контекст бронирования
    resetBookingCtx() {
        this.bookingCtx = this._createBookingCtx();
    }
};
