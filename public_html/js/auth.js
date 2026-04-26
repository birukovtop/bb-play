/**
 * BlackBears Play — Модуль авторизации и регистрации
 */
const Auth = {

    // Инициализация
    init() {
        UI.elements.btnAuthLogin.addEventListener('click', () => this.handleLogin());
        UI.elements.btnAuthRegister.addEventListener('click', () => UI.setAuthMode('register'));
        UI.elements.btnAuthBack?.addEventListener('click', () => UI.setAuthMode('login'));
        UI.elements.btnAuthConfirm.addEventListener('click', () => this.handleRegister());
    },

    // ==========================================
    // Обработка входа
    // ==========================================
    async handleLogin() {
        const login = UI.elements.authLogin.value.trim();
        const password = UI.elements.authPassword.value.trim();

        UI.clearErrorAuth();

        if (!login) {
            UI.showErrorAuth('Введи свой позывной, воин!');
            return;
        }

        if (!password) {
            UI.showErrorAuth('Пароль не может быть пустым!');
            return;
        }

        this._setLoading(true);

        try {
            const user = await API.login(login, password);

            // Проверяем нужна ли SMS-верификация
            if (user.needsVerify) {
                // Показываем модалку SMS
                await this._showSmsVerifyForLogin(login, user);
            } else {
                // Уже верифицирован — сразу в ЛК
                AppState.setUser(user);
                await App.enterAuthenticatedSession();
            }

        } catch (e) {
            UI.showErrorAuth(e.message || 'Не удалось войти. Проверь позывной и пароль.');
        } finally {
            this._setLoading(false);
        }
    },

    // SMS-верификация при входе
    async _showSmsVerifyForLogin(login, userData) {
        const password = userData.password || ''; // Сохраняем пароль

        return new Promise((resolve) => {
            UI.showSmsVerifyModal({
                login,
                phone: userData.phone || '',
                onConfirm: async (code) => {
                    try {
                        await this._completeSmsVerify(code, login);
                        UI.hideSmsVerifyModal();

                        // Повторный вход после верификации
                        const user = await API.login(login, password);
                        AppState.setUser(user);
                        await App.enterAuthenticatedSession();
                        resolve();
                    } catch (e) {
                        UI.showSmsVerifyError(e.message || 'Ошибка верификации');
                        UI.elements.btnSmsVerifyConfirm.disabled = false;
                        UI.elements.btnSmsVerifyConfirm.textContent = 'Подтвердить';
                    }
                }
            });
        });
    },

    // ==========================================
    // Обработка регистрации
    // ==========================================
    async handleRegister() {
        const login = UI.elements.authLogin.value.trim();
        const password = UI.elements.authPassword.value.trim();
        const phoneRaw = UI.elements.authPhone.value.trim();
        const email = UI.elements.authEmail.value.trim();
        const name = UI.elements.authName.value.trim();

        UI.clearErrorAuth();

        if (!login || login.length < 2) {
            UI.showErrorAuth('Логин — минимум 2 символа!');
            return;
        }

        if (!password || password.length < 6) {
            UI.showErrorAuth('Пароль — минимум 6 символов!');
            return;
        }

        // Извлекаем только цифры из маски телефона
        const phone = '+' + phoneRaw.replace(/\D/g, '');

        if (!phone || phone.length < 12) {
            UI.showErrorAuth('Укажи телефон полностью: +7 (XXX) XXX-XX-XX');
            return;
        }

        if (!email || !email.includes('@')) {
            UI.showErrorAuth('Нужен корректный email!');
            return;
        }

        this._setLoading(true);

        try {
            // Шаг 1: Создание аккаунта (+ invite_token если есть)
            const inviteToken = sessionStorage.getItem('invite_token');

            // Если есть invite_token — проверяем что он ещё валиден
            if (inviteToken) {
                try {
                    await API.validateInvitation(inviteToken);
                } catch (e) {
                    sessionStorage.removeItem('invite_token');
                    UI.showErrorAuth('Приглашение уже использовано или истекло. Зарегистрируйся обычным способом.');
                    this._setLoading(false);
                    return;
                }
            }

            const user = await API.register(login, phone, email, name, password, inviteToken);

            // Шаг 2: Запрос SMS
            await API.requestSms(user.memberId, phone);

            // Шаг 3: Показ SMS-модалки
            await this._showSmsVerifyForRegister(login, phone, user);

        } catch (e) {
            UI.showErrorAuth(e.message || 'Не удалось создать аккаунт. Попробуй снова.');
            // При ошибке регистрации — переключить на режим входа
            UI.setAuthMode('login');
        } finally {
            this._setLoading(false);
        }
    },

    // SMS-верификация при регистрации
    async _showSmsVerifyForRegister(login, phone, userData) {
        console.log('[Auth] _showSmsVerifyForRegister userData:', JSON.stringify(userData, null, 2));
        return new Promise((resolve) => {
            UI.showSmsVerifyModal({
                login,
                phone: phone || userData.phone || '',
                onConfirm: async (code) => {
                    try {
                        console.log('[Auth] Verifying SMS for memberId:', userData.memberId);
                        // Шаг 3: Верификация через внешний API
                        const verifyResult = await API.verifySms(userData.memberId);
                        console.log('[Auth] Verify result:', JSON.stringify(verifyResult, null, 2));
                        UI.hideSmsVerifyModal();

                        // Очищаем токен приглашения (если был)
                        sessionStorage.removeItem('invite_token');

                        // Переходим в ЛК
                        AppState.setUser(userData);
                        console.log('[Auth] AppState.currentUser after setUser:', JSON.stringify(AppState.currentUser, null, 2));
                        await App.enterAuthenticatedSession({ welcomeNewUser: true });
                        resolve();
                    } catch (e) {
                        console.error('[Auth] Verification error:', e);
                        UI.showSmsVerifyError(e.message || 'Ошибка верификации');
                        UI.elements.btnSmsVerifyConfirm.disabled = false;
                        UI.elements.btnSmsVerifyConfirm.textContent = 'Подтвердить';
                    }
                }
            });
        });
    },

    // Выполнить SMS-верификацию
    async _completeSmsVerify(code, login) {
        await API.smsVerify(login, code);
    },

    // ==========================================
    // Выход
    // ==========================================
    handleLogout() {
        AppState.clearSession();
        UI.showScreen('auth');
        UI.setAuthMode('login');
        UI.elements.authLogin.value = '';
        UI.elements.authPassword.value = '';
        UI.clearErrorAuth();
    },

    // ==========================================
    // Индикатор загрузки
    // ==========================================
    _setLoading(isLoading) {
        UI.elements.btnAuthLogin.disabled = isLoading;
        UI.elements.btnAuthRegister.disabled = isLoading;
        UI.elements.btnAuthConfirm.disabled = isLoading;

        if (isLoading) {
            UI.elements.authDialogText.innerHTML = 'Проверяю данные...';
        } else {
            UI.elements.authDialogText.textContent = UI.elements.authDialogText.textContent.replace('⏳ Проверяю данные...', '');
        }
    }
};


