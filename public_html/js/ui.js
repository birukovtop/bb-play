/**
 * BlackBears Play — Модуль управления интерфейсом
 */
const UI = {

    // Ссылки на DOM-элементы
    elements: {},
    _handleActionPanelResize: null,

    _syncActionPanelMode() {
        const isNewsScreen = AppState?.dialogScreen === 'news';
        document.body.classList.toggle('news-sticky-actions', isNewsScreen);
    },

    // Инициализация
    init() {
        this.elements = {
            // Экраны
            authScreen: document.getElementById('auth-screen'),
            mainScreen: document.getElementById('main-screen'),

            // Авторизация
            authForm: document.getElementById('auth-form'),
            authDialogText: document.getElementById('auth-dialog-text'),
            authInputGroup: document.getElementById('auth-input-group'),
            authExtraGroup: document.getElementById('auth-extra-group'),
            authLogin: document.getElementById('auth-login'),
            authPassword: document.getElementById('auth-password'),
            authPhone: document.getElementById('auth-phone'),
            authEmail: document.getElementById('auth-email'),
            authName: document.getElementById('auth-name'),
            btnAuthLogin: document.getElementById('btn-auth-login'),
            btnAuthRegister: document.getElementById('btn-auth-register'),
            btnAuthBack: document.getElementById('btn-auth-back'),
            btnAuthConfirm: document.getElementById('btn-auth-confirm'),
            authError: document.getElementById('auth-error'),
            authModeLabel: document.getElementById('auth-mode-label'),

            // Главный экран
            statusIcon: document.querySelector('.status-icon'),
            statusUser: document.getElementById('status-user'),
            statusCoins: document.querySelector('.status-coins'),
            statusBalance: document.getElementById('status-balance'),
            statusBonus: document.querySelector('.status-bonus'),
            statusBonusBalance: document.getElementById('status-bonus-balance'),
            statusPoints: document.querySelector('.status-points'),
            statusPointsBalance: document.getElementById('status-points-balance'),
            btnSoundToggle: document.getElementById('btn-sound-toggle'),
            btnLogout: document.getElementById('btn-logout'),
            dialogContent: document.getElementById('dialog-content'),
            typingIndicator: document.getElementById('typing-indicator'),
            actionPanel: document.getElementById('action-panel'),

            // Модалки
            modalTopup: document.getElementById('modal-topup'),
            topupAmount: document.getElementById('topup-amount'),
            topupError: document.getElementById('topup-error'),
            btnTopupConfirm: document.getElementById('btn-topup-confirm'),
            btnCloseTopup: document.getElementById('btn-close-topup'),

            modalConfirmBooking: document.getElementById('modal-confirm-booking'),
            bookingDetails: document.getElementById('booking-details'),
            bookingConfirmError: document.getElementById('booking-confirm-error'),
            btnBookingConfirm: document.getElementById('btn-booking-confirm'),
            btnBookingCancel: document.getElementById('btn-booking-cancel'),
            btnCloseBookingConfirm: document.getElementById('btn-close-booking-confirm'),

            // Друзья
            modalFriends: document.getElementById('modal-friends'),
            modalAddFriend: document.getElementById('modal-add-friend'),
            modalInvite: document.getElementById('modal-invite'),
            btnCloseFriends: document.getElementById('btn-close-friends'),
            btnCloseAddFriend: document.getElementById('btn-close-add-friend'),
            btnCloseInvite: document.getElementById('btn-close-invite'),

            // SMS-верификация
            modalSmsVerify: document.getElementById('modal-sms-verify'),
            smsVerifyText: document.getElementById('sms-verify-text'),
            smsCodeInputs: document.getElementById('sms-code-inputs'),
            smsStatus: document.getElementById('sms-status'),
            smsVerifyError: document.getElementById('sms-verify-error'),
            btnSmsVerifyConfirm: document.getElementById('btn-sms-verify-confirm'),

            // Баннер приглашения
            inviteBanner: document.getElementById('invite-banner'),
            inviteBannerSender: document.getElementById('invite-banner-sender'),
            inviteBannerExpires: document.getElementById('invite-banner-expires'),
            btnCloseInvite: document.getElementById('btn-close-invite'),
        };

        // Проверка критических элементов
        const criticalElements = ['authScreen', 'mainScreen', 'dialogContent', 'actionPanel'];
        for (const key of criticalElements) {
            if (!this.elements[key]) {
                console.error(`UI.init: Критический элемент "${key}" не найден в DOM`);
                return;
            }
        }

        // Проверка элементов SMS-модалки (не критичны, но логируем если нет)
        const smsElements = ['modalSmsVerify', 'smsCodeInputs', 'btnSmsVerifyConfirm'];
        for (const key of smsElements) {
            if (!this.elements[key]) {
                console.warn(`UI.init: Элемент SMS "${key}" не найден — модалка не будет работать`);
            }
        }

        this.applyStaticTexts();
        this._bindGlobalEvents();
        this._bindActionPanelLayout();
    },

    // ==========================================
    // Переключение экранов
    // ==========================================
    showScreen(name) {
        if (this.elements.authScreen) {
            this.elements.authScreen.classList.toggle('active', name === 'auth');
        }
        if (this.elements.mainScreen) {
            this.elements.mainScreen.classList.toggle('active', name === 'main');
        }
    },

    // ==========================================
    // Обновление статус-бара
    // ==========================================
    async updateStatusBar() {
        const user = AppState.currentUser;
        if (user) {
            // Обновляем имя
            if (this.elements.statusUser) {
                this.elements.statusUser.textContent = user.name || user.login;
            }
            if (this.elements.statusBalance) {
                this.elements.statusBalance.textContent = Math.round(user.balance || 0);
            }
            if (this.elements.statusBonusBalance) {
                this.elements.statusBonusBalance.textContent = Math.round(user.bonusBalance || 0);
            }
            if (this.elements.statusPointsBalance) {
                const hasRank = Number.isFinite(parseInt(user.rank, 10)) && parseInt(user.rank, 10) > 0;
                this.elements.statusPointsBalance.textContent = hasRank
                    ? String(parseInt(user.rank, 10))
                    : window.BBText?.t('ranking.statusFallback', {}, '—');
                this.elements.statusPointsBalance.title = window.BBText?.t('statusBar.rankingPlaceTitle', {}, 'Место в рейтинге');
            }

            // Обновляем аватарку
            const iconEl = document.querySelector('.status-icon');
            if (iconEl && typeof Avatar !== 'undefined') {
                iconEl.innerHTML = Avatar.renderStatusIcon();
            }
        } else {
            if (this.elements.statusUser) {
                this.elements.statusUser.textContent = window.BBText?.t('statusBar.guest', {}, 'Гость');
            }
            if (this.elements.statusBalance) {
                this.elements.statusBalance.textContent = '0';
            }
            if (this.elements.statusPointsBalance) {
                this.elements.statusPointsBalance.textContent = window.BBText?.t('ranking.statusFallback', {}, '—');
                this.elements.statusPointsBalance.title = window.BBText?.t('statusBar.rankingPlaceTitle', {}, 'Место в рейтинге');
            }
        }
    },

    // ==========================================
    // Диалог — показать текст Барни (с эффектом печати или мгновенно)
    // ==========================================
    async sayBarney(text, options = {}) {
        const {
            typingDelay = 20,
            append = false,
            nonBlocking = false,
            keepActions = false,
            blocking = false
        } = options;

        const textMode = AppState?.settings?.textMode || 'typing';

        if (!append) {
            this.elements.dialogContent.innerHTML = '';
        }

        if (!keepActions) {
            this.hideActions();
        }

        const messageEl = document.createElement('div');
        messageEl.className = 'dialog-message dialog-message--barney fade-in';
        this.elements.dialogContent.querySelectorAll('#btn-sound-toggle').forEach(btn => btn.removeAttribute('id'));
        messageEl.innerHTML = `
            <div class="dialog-avatar">
                <img src="assets/bear.svg" alt="Барни">
            </div>
            <div class="dialog-bubble">
                <div class="dialog-bubble__head">
                    <div class="dialog-name">Барни</div>
                    <button id="btn-sound-toggle" class="dialog-sound-toggle" title="${this.soundEnabled ? window.BBText?.t('ui.soundOff', {}, 'Выключить звук') : window.BBText?.t('ui.soundOn', {}, 'Включить звук')}" type="button"></button>
                </div>
                <div class="dialog-message-text dialog-text"></div>
            </div>
        `;
        const textEl = messageEl.querySelector('.dialog-text');
        this.elements.dialogContent.appendChild(messageEl);
        const soundBtn = messageEl.querySelector('.dialog-sound-toggle');
        soundBtn.addEventListener('click', () => this.toggleSound());
        this.elements.btnSoundToggle = soundBtn;
        this.updateSoundIcon();

        // Разбиваем на предложения/абзацы
        const sentences = text
            .split(/\n+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const shouldType = blocking && textMode === 'typing' && !nonBlocking;

        if (!shouldType) {
            // Мгновенное отображение — весь текст сразу
            this.elements.typingIndicator.style.display = 'none';
            textEl.textContent = text;
            this.elements.dialogContent.scrollTop = this.elements.dialogContent.scrollHeight;
            
            // Озвучка текста (даже в мгновенном режиме)
            if (this.soundEnabled) {
                this._playTTSAsync(text);
            }
        } else {
            // Игровой стиль: быстрая печать + аудио параллельно
            if (this.elements.typingIndicator && !this.elements.typingIndicator.isConnected) {
                this.elements.dialogContent.appendChild(this.elements.typingIndicator);
            }
            this.elements.typingIndicator.style.display = 'flex';
            await this._delay(400 + Math.random() * 200);
            this.elements.typingIndicator.style.display = 'none';

            // Загружаем ВСЕ аудио параллельно (не блокирует печать)
            if (this.soundEnabled) {
                this._playTTSAsync(text);
                /*
                sentences.forEach(async (sentence, s) => {
                    const cleanSentence = sentence.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
                    if (!cleanSentence) return;
                    try {
                        const resp = await fetch(`${API.LOCAL_API}/tts.php`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: cleanSentence })
                        });
                        const data = await resp.json();
                        if (data.code === 0 && data.url) {
                            // Ждём пока дойдёт очередь этого предложения
                            const audio = new Audio(data.url);
                            // Сохраняем для последовательного воспроизведения
                            if (!this._audioQueue) this._audioQueue = [];
                            this._audioQueue.push({ audio, sentenceIndex: s });
                            this._processAudioQueue();
                        }
                    } catch (e) {}
                });
                */
            }

            // Печатаем текст посимвольно
            for (let s = 0; s < sentences.length; s++) {
                if (s > 0) textEl.textContent += '\n';

                for (let i = 0; i < sentences[s].length; i++) {
                    textEl.textContent += sentences[s][i];
                    this.elements.dialogContent.scrollTop = this.elements.dialogContent.scrollHeight;
                    await this._delay(typingDelay);
                }

                // Небольшая пауза между предложениями
                if (s < sentences.length - 1) await this._delay(100);
            }
        }

        return textEl;
    },

    // Очередь аудио (последовательное воспроизведение)
    _audioQueue: [],
    _audioPlaying: false,

    async _processAudioQueue() {
        if (this._audioPlaying || this._audioQueue.length === 0) return;
        this._audioPlaying = true;

        while (this._audioQueue.length > 0) {
            const item = this._audioQueue.shift();
            if (!this.soundEnabled) break;

            if (this._ttsAudio) this._ttsAudio.pause();
            this._ttsAudio = item.audio;

            await new Promise(resolve => {
                item.audio.onended = () => { if (this._ttsAudio === item.audio) this._ttsAudio = null; resolve(); };
                item.audio.onerror = () => { if (this._ttsAudio === item.audio) this._ttsAudio = null; resolve(); };
                item.audio.play().catch(() => { if (this._ttsAudio === item.audio) this._ttsAudio = null; resolve(); });
                setTimeout(resolve, 5000);
            });
        }

        this._audioPlaying = false;
    },

    // ==========================================
    // TTS — озвучка текста (воспроизводит и ждёт окончания)
    // ==========================================
    _ttsAudio: null,
    _ttsSeq: 0,

    async _playTTSAsync(text) {
        if (!text) return;

        const seq = ++this._ttsSeq;

        // Разбиваем на предложения/абзацы
        const sentences = text
            .split(/\n+/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => s.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim())
            .filter(s => s.length > 0);

        if (sentences.length === 0) return;

        // Запускаем ВСЕ fetch параллельно (кэш отвечает мгновенно, новые генерируются)
        const fetchPromises = sentences.map(async (cleanText) => {
            try {
                const resp = await fetch(`${API.LOCAL_API}/tts.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: cleanText })
                });
                const data = await resp.json();
                if (data.code === 0 && data.url) {
                    return new Audio(data.url);
                }
            } catch (e) {}
            return null;
        });

        const audioArray = await Promise.all(fetchPromises);

        // Проверяем что TTS ещё актуален
        if (seq !== this._ttsSeq) return;

        // Играем последовательно
        for (const audio of audioArray) {
            if (seq !== this._ttsSeq) break;
            if (!audio) continue;
            if (!this.soundEnabled) break;

            // Остановить предыдущее
            if (this._ttsAudio) {
                this._ttsAudio.pause();
            }

            this._ttsAudio = audio;

            await new Promise(resolve => {
                if (seq !== this._ttsSeq) { resolve(); return; }
                audio.onended = () => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); };
                audio.onerror = () => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); };
                audio.play().catch(() => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); });
                setTimeout(() => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); }, 5000);
            });

            // Пауза между предложениями
            if (seq !== this._ttsSeq) break;
            await this._delay(250);
        }
    },

    // Остановить текущий TTS
    _stopTTS() {
        if (this._ttsAudio) {
            this._ttsAudio.pause();
            this._ttsAudio = null;
        }
        this._ttsSeq++; // Инвалидируем все pending запросы
        // Очищаем очередь аудио
        this._audioQueue = [];
        this._audioPlaying = false;
    },

    // Озвучить одно предложение (для последовательного режима)
    async _playTTSSingle(text) {
        if (!text || !this.soundEnabled) return;
        try {
            const resp = await fetch(`${API.LOCAL_API}/tts.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await resp.json();
            if (data.code === 0 && data.url) {
                if (this._ttsAudio) this._ttsAudio.pause();
                const audio = new Audio(data.url);
                this._ttsAudio = audio;
                await new Promise(resolve => {
                    audio.onended = () => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); };
                    audio.onerror = () => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); };
                    audio.play().catch(() => { if (this._ttsAudio === audio) this._ttsAudio = null; resolve(); });
                    setTimeout(resolve, 5000);
                });
            }
        } catch (e) {}
    },

    // ==========================================
    // Инициализация звука
    // ==========================================
    initSound() {
        this.soundEnabled = localStorage.getItem('bbplay_sound') !== 'false';
        this.updateSoundIcon();
    },

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        localStorage.setItem('bbplay_sound', this.soundEnabled);
        this.updateSoundIcon();

        if (!this.soundEnabled && this._ttsAudio) {
            this._ttsAudio.pause();
        }
    },

    // ==========================================
    // Кликабельный статус-бар
    // ==========================================
    initStatusBarClicks() {
        if (this._statusBarClicksInitialized) {
            return;
        }
        this._statusBarClicksInitialized = true;
        // Профиль (иконка + имя)
        const openProfile = () => {
            this.beginFlowTransition();
            if (typeof Profile !== 'undefined') Profile.show();
        };
        if (this.elements.statusIcon) this.elements.statusIcon.addEventListener('click', openProfile);
        if (this.elements.statusUser) this.elements.statusUser.addEventListener('click', openProfile);
        if (this.elements.statusIcon) this.elements.statusIcon.style.cursor = 'pointer';
        if (this.elements.statusUser) this.elements.statusUser.style.cursor = 'pointer';

        // Кошелёк (монеты + баланс)
        const openWallet = () => {
            this.beginFlowTransition();
            if (typeof Profile !== 'undefined') Profile.showWallet();
        };
        if (this.elements.statusCoins) this.elements.statusCoins.addEventListener('click', openWallet);
        if (this.elements.statusBalance) this.elements.statusBalance.addEventListener('click', openWallet);
        if (this.elements.statusCoins) this.elements.statusCoins.style.cursor = 'pointer';
        if (this.elements.statusBalance) this.elements.statusBalance.style.cursor = 'pointer';

        // Бонусы
        const openBonus = () => {
            this.beginFlowTransition();
            if (typeof Profile !== 'undefined') Profile.showBonusHistory();
        };
        if (this.elements.statusBonus) this.elements.statusBonus.addEventListener('click', openBonus);
        if (this.elements.statusBonusBalance) this.elements.statusBonusBalance.addEventListener('click', openBonus);
        if (this.elements.statusBonus) this.elements.statusBonus.style.cursor = 'pointer';
        if (this.elements.statusBonusBalance) this.elements.statusBonusBalance.style.cursor = 'pointer';

        // Очки
        const openPoints = () => {
            this.beginFlowTransition();
            if (typeof Dialogs !== 'undefined') Dialogs.showRanking();
        };
        if (this.elements.statusPoints) this.elements.statusPoints.addEventListener('click', openPoints);
        if (this.elements.statusPointsBalance) this.elements.statusPointsBalance.addEventListener('click', openPoints);
        if (this.elements.statusPoints) this.elements.statusPoints.style.cursor = 'pointer';
        if (this.elements.statusPointsBalance) this.elements.statusPointsBalance.style.cursor = 'pointer';
    },

    // Разблокировать аудио в браузере (нужно после загрузки экрана)
    unlockAudio() {
        try {
            const silent = new Audio();
            silent.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            silent.volume = 0;
            silent.play().catch(() => {});
        } catch (e) {}
    },

    updateSoundIcon() {
        document.querySelectorAll('.dialog-sound-toggle').forEach(btn => {
            const iconPath = this.soundEnabled
                ? './ui%20kit/icon/bulk/volume-high.svg'
                : './ui%20kit/icon/bulk/volume-cross.svg';
            btn.innerHTML = `<img src="${iconPath}" alt="" class="dialog-sound-icon">`;
            btn.classList.toggle('dialog-sound-toggle--off', !this.soundEnabled);
            btn.title = this.soundEnabled
                ? window.BBText?.t('ui.soundOff', {}, 'Выключить звук')
                : window.BBText?.t('ui.soundOn', {}, 'Включить звук');
        });
    },

    // ==========================================
    // Диалог — добавить HTML-контент
    // ==========================================
    appendContent(html) {
        const wrapper = document.createElement('div');
        wrapper.className = 'fade-in';
        wrapper.innerHTML = html;
        this.elements.dialogContent.appendChild(wrapper);
        this.elements.dialogContent.scrollTop = this.elements.dialogContent.scrollHeight;
    },

    // ==========================================
    // Очистить диалог
    // ==========================================
    clearDialog() {
        this._stopTTS(); // Остановить текущий TTS
        this.elements.dialogContent.innerHTML = '';
        this.elements.typingIndicator.style.display = 'none';
    },

    beginFlowTransition() {
        this._stopTTS();
        this.hideActions();
        this.elements.typingIndicator.style.display = 'none';
    },

    // ==========================================
    // Панель действий — установить кнопки
    // ==========================================
    hideActions() {
        this.elements.actionPanel.innerHTML = '';
    },

    clearActions() {
        this.hideActions();
        this._lastActions = [];
        this._syncActionPanelMode();
    },

    setActions(actions) {
        this.clearActions();
        this._syncActionPanelMode();
        // Сохраняем для восстановления
        this._lastActions = actions;

        if (!actions || actions.length === 0) {
            return;
        }

        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `btn ${action.primary ? 'btn-primary' : 'btn-secondary'} ${action.fullWidth ? 'btn-full' : ''}`;
            btn.type = 'button';
            btn.disabled = action.disabled || false;
            if (action.className) {
                btn.classList.add(...String(action.className).split(/\s+/).filter(Boolean));
            }
            if (action.danger) {
                btn.classList.add('btn-danger');
            }

            const hasRichContent = Boolean(action.iconPath || action.description);
            if (hasRichContent) {
                btn.classList.add('btn-action');

                if (action.iconPath) {
                    const iconWrap = document.createElement('span');
                    iconWrap.className = 'btn-action__icon';

                    const iconImg = document.createElement('img');
                    iconImg.src = action.iconPath;
                    iconImg.alt = '';
                    iconImg.className = 'btn-action__icon-img';
                    iconImg.setAttribute('aria-hidden', 'true');
                    iconWrap.appendChild(iconImg);
                    btn.appendChild(iconWrap);
                }

                const textWrap = document.createElement('span');
                textWrap.className = 'btn-action__text';

                const labelWrap = document.createElement('span');
                labelWrap.className = 'btn-action__label';
                labelWrap.textContent = action.label;
                textWrap.appendChild(labelWrap);

                if (action.description) {
                    const descWrap = document.createElement('span');
                    descWrap.className = 'btn-action__description';
                    descWrap.textContent = action.description;
                    textWrap.appendChild(descWrap);
                }

                btn.appendChild(textWrap);
            } else {
                btn.textContent = action.label;
            }

            if (action.hidden) {
                btn.classList.add('hidden');
            }

            btn.addEventListener('click', async () => {
                // Останавливаем TTS при клике
                this._stopTTS();
                // Сразу прячем панель действий при клике, но сохраняем
                // последнее состояние для модалок и сценариев возврата.
                this.hideActions();
                if (action.action && typeof action.action === 'function') {
                    try {
                        await action.action();
                    } catch (error) {
                        console.error('[UI] Action button failed:', error);
                        await this.sayBarney(`Не удалось открыть раздел.\n\nОшибка: ${error?.message || 'Неизвестная ошибка'}`);
                        this.restoreActions();
                    }
                }
            });

            this.elements.actionPanel.appendChild(btn);
        });

        this._updateActionPanelLayout();

    },

    _bindActionPanelLayout() {
        if (this._handleActionPanelResize) {
            return;
        }

        this._handleActionPanelResize = () => this._updateActionPanelLayout();
        window.addEventListener('resize', this._handleActionPanelResize);
    },

    _updateActionPanelLayout() {
        const panel = this.elements.actionPanel;
        if (!panel) {
            return;
        }

        const buttons = Array.from(panel.querySelectorAll(':scope > .btn'));
        buttons.forEach(btn => btn.classList.remove('btn-orphan'));

        const columns = window.matchMedia('(max-width: 360px)').matches ? 1 : 2;
        if (columns === 1) {
            return;
        }

        let rowFill = 0;
        let orphanButton = null;

        buttons.forEach(btn => {
            if (btn.classList.contains('btn-full')) {
                rowFill = 0;
                orphanButton = null;
                return;
            }

            if (rowFill === 0) {
                rowFill = 1;
                orphanButton = btn;
                return;
            }

            rowFill = 0;
            orphanButton = null;
        });

        if (rowFill === 1 && orphanButton) {
            orphanButton.classList.add('btn-orphan');
        }
    },

    // Восстановить последнюю панель действий
    restoreActions() {
        if (this._lastActions && this._lastActions.length > 0) {
            this.setActions(this._lastActions);
        }
    },

    // ==========================================
    // Модалка — пополнение баланса
    // ==========================================
    showModalTopup() {
        this.elements.modalTopup.classList.remove('hidden');
        this.elements.topupAmount.value = '';
        this.elements.topupError.textContent = '';
        document.querySelectorAll('.topup-method').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.method === 'card');
        });
        this.elements.topupAmount.focus();
    },

    hideModalTopup() {
        this.elements.modalTopup.classList.add('hidden');
        this.restoreActions();
    },

    // ==========================================
    // Модалка — подтверждение бронирования
    // ==========================================
    showModalBookingConfirm(details) {
        this.elements.bookingDetails.innerHTML = details;
        this.elements.bookingConfirmError.textContent = '';
        this.elements.modalConfirmBooking.classList.remove('hidden');
    },

    hideModalBookingConfirm() {
        // Ищем элемент напрямую, если в кэше его нет
        const modal = this.elements.modalConfirmBooking || document.getElementById('modal-confirm-booking');
        if (modal) modal.classList.add('hidden');
        
        // Сбрасываем текст и стили кнопок
        const confirmBtn = this.elements.btnBookingConfirm || document.getElementById('btn-booking-confirm');
        if (confirmBtn) {
            confirmBtn.textContent = 'Оплатить и забронировать';
            confirmBtn.style.cssText = '';
        }
        const cancelBtn = this.elements.btnBookingCancel || document.getElementById('btn-booking-cancel');
        if (cancelBtn) {
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.cssText = '';
        }
        // Сбрасываем заголовок
        const h3 = modal ? modal.querySelector('.modal-header h3') : null;
        if (h3) h3.textContent = `${window.BBText?.t('common.confirm', {}, 'Подтвердить')} бронь`;
        // Очистить ошибку
        if (this.elements.bookingConfirmError) this.elements.bookingConfirmError.textContent = '';
        this.restoreActions();
    },

    // ==========================================
    // Утилиты
    // ==========================================
    showErrorAuth(msg) {
        this.elements.authError.textContent = msg;
    },

    clearErrorAuth() {
        this.elements.authError.textContent = '';
    },

    showTopupError(msg) {
        this.elements.topupError.textContent = msg;
    },

    showBookingConfirmError(msg) {
        this.elements.bookingConfirmError.textContent = msg;
    },

    setAuthMode(mode) {
        // 'login' или 'register'
        const isRegister = mode === 'register';

        this.elements.authInputGroup.classList.toggle('hidden', false);
        this.elements.authExtraGroup.classList.toggle('hidden', !isRegister);
        this.elements.btnAuthLogin.classList.toggle('hidden', isRegister);
        this.elements.btnAuthRegister.classList.toggle('hidden', isRegister);
        this.elements.btnAuthBack?.classList.toggle('hidden', !isRegister);

        // Инициализация маски телефона при регистрации
        if (isRegister && this.elements.authPhone) {
            this._initPhoneMask();
        }
        this.elements.btnAuthConfirm.classList.toggle('hidden', !isRegister);
        this.elements.authForm?.classList.toggle('auth-card--register', isRegister);

        if (this.elements.authModeLabel) {
            this.elements.authModeLabel.textContent = isRegister
                ? window.BBText?.t('auth.modeRegister', {}, 'Регистрация')
                : window.BBText?.t('auth.modeLogin', {}, 'Авторизация');
        }

        const titleEl = this.elements.authForm?.querySelector('.auth-card__title');
        if (titleEl) {
            titleEl.textContent = isRegister
                ? window.BBText?.t('auth.cardTitleRegister', {}, 'Регистрация')
                : window.BBText?.t('auth.cardTitleLogin', {}, 'Вход');
        }

        if (this.elements.btnAuthLogin) {
            this.elements.btnAuthLogin.textContent = window.BBText?.t('auth.login', {}, 'Войти');
        }
        if (this.elements.btnAuthRegister) {
            this.elements.btnAuthRegister.textContent = window.BBText?.t('auth.register', {}, 'Регистрация');
        }
        if (this.elements.btnAuthBack) {
            this.elements.btnAuthBack.textContent = window.BBText?.t('auth.back', {}, 'Назад');
        }
        if (this.elements.btnAuthConfirm) {
            this.elements.btnAuthConfirm.textContent = window.BBText?.t('auth.createAccount', {}, 'Создать аккаунт');
        }

        if (isRegister) {
            this.elements.authDialogText.textContent = window.BBText?.t(
                'auth.registerIntro',
                {},
                'Новый воин! Чтобы вступить в ряды BlackBears, заполни анкету.'
            );
        } else {
            const text = window.BBText?.t(
                'auth.loginIntro',
                {},
                'Привет, воин! Я Барни — мастер бронирования. Чтобы начать, представься. Введи свой позывной (логин) и пароль.'
            );
            this.elements.authDialogText.textContent = text;

            // Озвучка приветствия на экране авторизации
            if (this.soundEnabled) {
                this._playTTSAsync(text);
            }
        }

        this.clearErrorAuth();
    },

    applyStaticTexts() {
        const authBarneyName = document.querySelector('.auth-barney__name');
        const authSubtitle = document.querySelector('.game-subtitle');
        const topupTitle = document.querySelector('#modal-topup .modal-header h3');
        const topupDescription = document.querySelector('#modal-topup .modal-description');
        const bookingTitle = document.querySelector('#modal-confirm-booking .modal-header h3');
        const friendsTitle = document.querySelector('#modal-friends .modal-header h3');
        const addFriendTitle = document.querySelector('#modal-add-friend .modal-header h3');
        const inviteTitle = document.querySelector('#modal-invite .modal-header h3');
        const inviteDescription = document.querySelector('#modal-invite .modal-description');
        const avatarTitle = document.querySelector('#modal-avatar .modal-header h3');
        const avatarPresetLabel = document.querySelector('#modal-avatar .modal-body p:nth-of-type(1)');
        const avatarUploadLabel = document.querySelector('#modal-avatar .modal-body p:nth-of-type(2)');
        const avatarUploadHint = document.querySelector('#modal-avatar .modal-body p:nth-of-type(3)');
        const smsTitle = document.querySelector('#modal-sms-verify .modal-header h3');
        const addFriendStep1 = document.querySelector('#add-friend-step1 .modal-description');
        const addFriendSearch = document.querySelector('#add-friend-search .modal-description');
        const addFriendGuest = document.querySelector('#add-friend-guest .modal-description');
        const friendsPendingTitle = document.querySelector('#friends-pending-section h4');

        document.title = window.BBText?.t('common.appTitle', {}, 'BlackBears Play — Бронирование');

        if (authBarneyName) {
            authBarneyName.textContent = window.BBText?.t('auth.barneyName', {}, 'Барни Медведь');
        }
        if (authSubtitle) {
            authSubtitle.textContent = window.BBText?.t('auth.heroSubtitle', {}, 'Компьютерные клубы');
        }
        if (this.elements.authLogin) {
            this.elements.authLogin.placeholder = window.BBText?.t('auth.loginPlaceholder', {}, 'Введи логин...');
        }
        if (this.elements.authPassword) {
            this.elements.authPassword.placeholder = window.BBText?.t('auth.passwordPlaceholder', {}, 'Пароль...');
        }
        if (this.elements.authPhone) {
            this.elements.authPhone.placeholder = window.BBText?.t('auth.phonePlaceholder', {}, '+7 (___) ___-__-__');
        }
        if (this.elements.authEmail) {
            this.elements.authEmail.placeholder = window.BBText?.t('auth.emailPlaceholder', {}, 'Email');
        }
        if (this.elements.authName) {
            this.elements.authName.placeholder = window.BBText?.t('auth.namePlaceholder', {}, 'Твоё имя');
        }
        if (topupTitle) {
            topupTitle.textContent = window.BBText?.t('topup.title', {}, 'Пополнение баланса');
        }
        if (topupDescription) {
            topupDescription.textContent = window.BBText?.t('topup.description', {}, 'Укажи сумму для пополнения счёта');
        }
        if (this.elements.topupAmount) {
            this.elements.topupAmount.placeholder = window.BBText?.t('topup.amountPlaceholder', {}, 'Сумма (₽)');
        }
        if (this.elements.btnTopupConfirm) {
            this.elements.btnTopupConfirm.textContent = window.BBText?.t('topup.confirm', {}, 'Пополнить');
        }
        if (this.elements.statusUser) {
            this.elements.statusUser.textContent = window.BBText?.t('statusBar.guest', {}, 'Гость');
        }
        if (bookingTitle) {
            bookingTitle.textContent = window.BBText?.t('bookingConfirm.title', {}, 'Подтверждение брони');
        }
        if (this.elements.btnBookingCancel) {
            this.elements.btnBookingCancel.textContent = window.BBText?.t('bookingConfirm.cancel', {}, 'Отмена');
        }
        if (this.elements.btnBookingConfirm) {
            this.elements.btnBookingConfirm.textContent = window.BBText?.t('bookingConfirm.payAndBook', {}, 'Оплатить и забронировать');
        }
        if (friendsTitle) {
            friendsTitle.textContent = window.BBText?.t('friends.title', {}, 'Отряд');
        }
        document.querySelectorAll('.friends-tab[data-tab="friends"]').forEach((tab) => {
            tab.textContent = window.BBText?.t('friends.tabs.friends', {}, 'Друзья');
        });
        document.querySelectorAll('.friends-tab[data-tab="outgoing"]').forEach((tab) => {
            tab.textContent = window.BBText?.t('friends.tabs.outgoing', {}, 'Заявки');
        });
        document.querySelectorAll('.friends-tab[data-tab="invitations"]').forEach((tab) => {
            tab.textContent = window.BBText?.t('friends.tabs.invitations', {}, 'Приглашения');
        });
        if (friendsPendingTitle) {
            friendsPendingTitle.textContent = window.BBText?.t('friends.incomingRequests', {}, 'Входящие запросы');
        }
        const btnAddFriend = document.getElementById('btn-add-friend');
        const btnInviteFriend = document.getElementById('btn-invite-friend');
        const btnCloseFriendsOk = document.getElementById('btn-close-friends-ok');
        if (btnAddFriend) btnAddFriend.innerHTML = `<img src="./ui%20kit/icon/bulk/user-add.svg" alt="" class="inline-action-icon">${window.BBText?.t('friends.add', {}, 'Добавить')}`;
        if (btnInviteFriend) btnInviteFriend.innerHTML = `<img src="./ui%20kit/icon/bulk/send.svg" alt="" class="inline-action-icon">${window.BBText?.t('friends.invite', {}, 'Пригласить')}`;
        if (btnCloseFriendsOk) btnCloseFriendsOk.textContent = window.BBText?.t('common.close', {}, 'Закрыть');
        if (addFriendTitle) {
            addFriendTitle.innerHTML = `<img src="./ui%20kit/icon/bulk/user-add.svg" alt="" class="inline-action-icon">${window.BBText?.t('addFriend.title', {}, 'Добавить друга')}`;
        }
        if (addFriendStep1) addFriendStep1.textContent = window.BBText?.t('addFriend.chooseMode', {}, 'Как хочешь добавить товарища?');
        if (addFriendSearch) addFriendSearch.textContent = window.BBText?.t('addFriend.searchPrompt', {}, 'Введи позывной друга:');
        if (addFriendGuest) addFriendGuest.textContent = window.BBText?.t('addFriend.guestPrompt', {}, 'Создам гостевой аккаунт для друга:');
        const btnSearchByLogin = document.getElementById('btn-search-by-login');
        const btnCreateGuest = document.getElementById('btn-create-guest');
        const btnSendInvite = document.getElementById('btn-send-invite');
        const friendSearchInput = document.getElementById('friend-search-input');
        const btnDoSearch = document.getElementById('btn-do-search');
        const guestLogin = document.getElementById('guest-login');
        const guestName = document.getElementById('guest-name');
        const guestPhone = document.getElementById('guest-phone');
        const guestEmail = document.getElementById('guest-email');
        const guestPassword = document.getElementById('guest-password');
        const btnDoCreateGuest = document.getElementById('btn-do-create-guest');
        const btnBackToAddFriend = document.getElementById('btn-back-to-add-friend');
        const btnCloseAddFriendOk = document.getElementById('btn-close-add-friend-ok');
        if (btnSearchByLogin) btnSearchByLogin.textContent = window.BBText?.t('addFriend.byLogin', {}, 'Найти по логину');
        if (btnCreateGuest) btnCreateGuest.textContent = window.BBText?.t('addFriend.createGuest', {}, 'Создать гостевой аккаунт');
        if (btnSendInvite) btnSendInvite.textContent = window.BBText?.t('addFriend.sendInvite', {}, 'Отправить приглашение');
        if (friendSearchInput) friendSearchInput.placeholder = window.BBText?.t('addFriend.searchPlaceholder', {}, 'Логин друга...');
        if (btnDoSearch) btnDoSearch.textContent = window.BBText?.t('addFriend.search', {}, 'Найти');
        if (guestLogin) guestLogin.placeholder = window.BBText?.t('addFriend.guestLogin', {}, 'Позывной (логин)');
        if (guestName) guestName.placeholder = window.BBText?.t('addFriend.guestName', {}, 'Имя друга');
        if (guestPhone) guestPhone.placeholder = window.BBText?.t('addFriend.guestPhone', {}, 'Телефон друга');
        if (guestEmail) guestEmail.placeholder = window.BBText?.t('addFriend.guestEmail', {}, 'Почта друга');
        if (guestPassword) guestPassword.placeholder = window.BBText?.t('addFriend.guestPassword', {}, 'Пароль друга');
        if (btnDoCreateGuest) btnDoCreateGuest.textContent = window.BBText?.t('addFriend.createAndAdd', {}, 'Создать и добавить');
        if (btnBackToAddFriend) btnBackToAddFriend.textContent = window.BBText?.t('common.back', {}, 'Назад');
        if (btnCloseAddFriendOk) btnCloseAddFriendOk.textContent = window.BBText?.t('common.close', {}, 'Закрыть');
        if (inviteTitle) {
            inviteTitle.textContent = window.BBText?.t('invite.title', {}, 'Пригласить друга');
        }
        if (inviteDescription) {
            inviteDescription.textContent = window.BBText?.t('invite.description', {}, 'Друг перейдёт по ссылке или отсканирует QR — и сразу попадёт в твой отряд!');
        }
        const btnCopyInviteUrl = document.getElementById('btn-copy-invite-url');
        const btnShareVk = document.getElementById('btn-share-vk');
        const btnShareTg = document.getElementById('btn-share-tg');
        const btnCloseInviteOk = document.getElementById('btn-close-invite-ok');
        if (btnCopyInviteUrl) btnCopyInviteUrl.textContent = window.BBText?.t('invite.copyLink', {}, 'Копировать ссылку');
        if (btnShareVk) btnShareVk.textContent = window.BBText?.t('invite.viaVk', {}, 'VK');
        if (btnShareTg) btnShareTg.textContent = window.BBText?.t('invite.viaTelegram', {}, 'Telegram');
        if (btnCloseInviteOk) btnCloseInviteOk.textContent = window.BBText?.t('common.close', {}, 'Закрыть');
        if (avatarTitle) {
            avatarTitle.textContent = window.BBText?.t('avatar.title', {}, 'Выбрать аватарку');
        }
        if (avatarPresetLabel) avatarPresetLabel.textContent = window.BBText?.t('avatar.choosePreset', {}, 'Выбери из готовых:');
        if (avatarUploadLabel) avatarUploadLabel.textContent = window.BBText?.t('avatar.uploadOwn', {}, 'Или загрузи своё фото:');
        if (avatarUploadHint) avatarUploadHint.textContent = window.BBText?.t('avatar.uploadHint', {}, 'JPG, PNG, GIF, WebP • Авто-сжатие до 200×200');
        const btnAvatarUpload = document.getElementById('btn-avatar-upload');
        const btnAvatarDelete = document.getElementById('btn-avatar-delete');
        const btnAvatarClose = document.getElementById('btn-avatar-close');
        if (btnAvatarUpload) btnAvatarUpload.innerHTML = `<img src="./ui%20kit/icon/bulk/gallery-add.svg" alt="" class="inline-action-icon">${window.BBText?.t('avatar.upload', {}, 'Загрузить фото')}`;
        if (btnAvatarDelete) btnAvatarDelete.innerHTML = `<img src="./ui%20kit/icon/bulk/trash.svg" alt="" class="inline-action-icon">${window.BBText?.t('avatar.delete', {}, 'Удалить')}`;
        if (btnAvatarClose) btnAvatarClose.textContent = window.BBText?.t('avatar.done', {}, 'Готово');
        if (smsTitle) smsTitle.textContent = window.BBText?.t('sms.title', {}, 'Подтверждение SMS');
        if (this.elements.smsVerifyText) {
            this.elements.smsVerifyText.textContent = window.BBText?.t('sms.sentToYourPhone', {}, 'Код отправлен на твой телефон');
        }
        if (this.elements.smsStatus) {
            this.elements.smsStatus.innerHTML = `
                <div class="sms-spinner">
                    <span class="spinner-small"></span>
                    ${window.BBText?.t('sms.waiting', {}, 'Ожидание SMS-кода...')}
                </div>
            `;
        }
        if (this.elements.btnSmsVerifyConfirm) {
            this.elements.btnSmsVerifyConfirm.textContent = window.BBText?.t('sms.confirm', {}, 'Подтвердить');
        }
        if (this.elements.btnCloseInvite) {
            this.elements.btnCloseInvite.title = window.BBText?.t('inviteBanner.closeTitle', {}, 'Закрыть');
        }
    },

    // ==========================================
    // Глобальные события
    // ==========================================
    _bindGlobalEvents() {
        const {
            authPassword,
            authName,
            topupAmount,
            modalTopup,
            modalConfirmBooking,
            btnAuthLogin,
            btnAuthConfirm,
            btnTopupConfirm
        } = this.elements;

        // Enter в полях авторизации
        if (authPassword && btnAuthLogin) {
            authPassword.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    btnAuthLogin.click();
                }
            });
        }

        if (authName && btnAuthConfirm) {
            authName.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    btnAuthConfirm.click();
                }
            });
        }

        // Enter в поле пополнения
        if (topupAmount && btnTopupConfirm) {
            topupAmount.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    btnTopupConfirm.click();
                }
            });
        }

        // Закрытие модалок по клику на оверлей
        if (modalTopup) {
            modalTopup.addEventListener('click', (e) => {
                if (e.target === modalTopup) {
                    this.hideModalTopup();
                }
            });
        }

        if (modalConfirmBooking) {
            modalConfirmBooking.addEventListener('click', (e) => {
                if (e.target === modalConfirmBooking) {
                    this.hideModalBookingConfirm();
                }
            });
        }

        // Presets для пополнения
        document.querySelectorAll('.btn-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                if (topupAmount) {
                    topupAmount.value = btn.dataset.amount;
                }
            });
        });

        document.querySelectorAll('.topup-method').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.topup-method').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    },

    getTopupMethod() {
        return document.querySelector('.topup-method.active')?.dataset.method || 'card';
    },

    // Задержка (Promise) — публичный метод
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // ==========================================
    // Маска телефона +7 (XXX) XXX-XX-XX
    // ==========================================
    _initPhoneMask(inputOrElement = null) {
        const phoneInput = inputOrElement || this.elements.authPhone;
        if (!phoneInput) return;

        if (phoneInput.dataset.maskInitialized === '1') {
            return;
        }
        phoneInput.dataset.maskInitialized = '1';

        // Устанавливаем начальное значение
        if (!phoneInput.value || phoneInput.value === '+7') {
            phoneInput.value = '+7 ';
        }

        phoneInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, ''); // Только цифры

            // Если начинается с 7 или 8, убираем
            if (value.startsWith('7')) value = value.substring(1);
            if (value.startsWith('8')) value = value.substring(1);

            // Формируем маску +7 (XXX) XXX-XX-XX
            let formatted = '+7';
            if (value.length > 0) formatted += ' (' + value.substring(0, 3);
            if (value.length >= 3) formatted += ') ' + value.substring(3, 6);
            if (value.length >= 6) formatted += '-' + value.substring(6, 8);
            if (value.length >= 8) formatted += '-' + value.substring(8, 10);

            e.target.value = formatted;
        });

        // При фокусе — если пустое, ставим +7
        phoneInput.addEventListener('focus', (e) => {
            if (!e.target.value || e.target.value === '+7') {
                e.target.value = '+7 ';
            }
        });

        // При потере фокуса — если только +7, очищаем
        phoneInput.addEventListener('blur', (e) => {
            if (e.target.value === '+7 ' || e.target.value === '+7') {
                e.target.value = '';
            }
        });
    },

    // ==========================================
    // SMS-ВЕРИФИКАЦИЯ МОДАЛКА
    // ==========================================
    showSmsVerifyModal(options = {}) {
        const {
            login = '',
            phone = '',
            onConfirm = null,
            autoFillDelay = 3000,
            submitDelay = 1000
        } = options;

        // Сброс
        this.clearSmsVerifyError();
        this.elements.btnSmsVerifyConfirm.disabled = true;
        this.elements.btnSmsVerifyConfirm.textContent = window.BBText?.t('sms.confirm', {}, 'Подтвердить');

        // Текст
        const phoneDisplay = phone || window.BBText?.t('sms.phoneUnknown', {}, 'твой телефон');
        this.elements.smsVerifyText.textContent = window.BBText?.t('sms.sentTo', { phone: phoneDisplay }, `Код отправлен на ${phoneDisplay}`);

        // Очистка ячеек
        const digits = this.elements.smsCodeInputs.querySelectorAll('.sms-digit');
        digits.forEach(d => {
            d.value = '';
            d.classList.remove('filled');
        });

        // Статус — ожидание
        this.elements.smsStatus.innerHTML = `
            <div class="sms-spinner">
                <span class="spinner-small"></span>
                ${window.BBText?.t('sms.waiting', {}, 'Ожидание SMS-кода...')}
            </div>
        `;

        // Показать модалку
        this.elements.modalSmsVerify.classList.remove('hidden');

        // Привязываем кнопку к callback (один раз)
        if (!this._smsVerifyBtnBound) {
            this.elements.btnSmsVerifyConfirm.addEventListener('click', () => {
                const digits = this.elements.smsCodeInputs.querySelectorAll('.sms-digit');
                let code = '';
                digits.forEach(d => code += d.value);
                if (code.length === 6 && this._smsVerifyCallback) {
                    this.elements.btnSmsVerifyConfirm.disabled = true;
                    this.elements.btnSmsVerifyConfirm.textContent = window.BBText?.t('sms.checking', {}, 'Проверка...');
                    this._smsVerifyCallback(code);
                }
            });
            this._smsVerifyBtnBound = true;
        }

        // Автозаполнение через delay
        this._smsAutoFillTimeout = setTimeout(() => {
            this._autoFillSmsCode(digits);
        }, autoFillDelay);

        // Сохраняем callback
        this._smsVerifyCallback = onConfirm;
        this._smsSubmitTimeout = null;
    },

    _autoFillSmsCode(digits) {
        // Генерируем случайный 6-значный код
        const code = String(Math.floor(100000 + Math.random() * 900000));

        // Заполняем ячейки по одной с анимацией
        digits.forEach((digit, i) => {
            setTimeout(() => {
                digit.value = code[i];
                digit.classList.add('filled');

                // Когда последняя ячейка заполнена — включаем кнопку
                if (i === digits.length - 1) {
                    this.elements.btnSmsVerifyConfirm.disabled = false;
                    this.elements.smsStatus.innerHTML = `
                        <div class="sms-code-recognized">${window.BBText?.t('sms.received', { code }, `Код получен: <strong>${code}</strong>. Нажми «Подтвердить»`)}</div>
                    `;
                }
            }, i * 200);
        });

        // Больше НЕ отправляем автоматически — ждём кнопку
    },

    hideSmsVerifyModal() {
        this.elements.modalSmsVerify.classList.add('hidden');
        this.elements.btnSmsVerifyConfirm.disabled = true;
        this.elements.btnSmsVerifyConfirm.textContent = window.BBText?.t('sms.confirm', {}, 'Подтвердить');

        // Очищаем таймеры
        if (this._smsAutoFillTimeout) clearTimeout(this._smsAutoFillTimeout);
        if (this._smsSubmitTimeout) clearTimeout(this._smsSubmitTimeout);
        this._smsAutoFillTimeout = null;
        this._smsSubmitTimeout = null;
        this._smsVerifyCallback = null;
    },

    clearSmsVerifyError() {
        if (this.elements.smsVerifyError) {
            this.elements.smsVerifyError.textContent = '';
        }
    },

    showSmsVerifyError(msg) {
        if (this.elements.smsVerifyError) {
            this.elements.smsVerifyError.textContent = msg;
        }
    },

    // Задержка (Promise) — приватный метод
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================
// Баннер приглашения
// ============================================
UI.showInviteBanner = function(data) {
    if (!this.elements.inviteBanner) return;

    if (this.elements.inviteBannerSender) {
        this.elements.inviteBannerSender.textContent = data.sender || '—';
    }
    if (this.elements.inviteBannerExpires) {
        this.elements.inviteBannerExpires.textContent = window.BBText?.t('inviteBanner.expiresPrefix', {}, 'Действует до: ') + data.expires;
    }

    this.elements.inviteBanner.classList.remove('hidden');

    // Кнопка закрытия
    if (this.elements.btnCloseInvite) {
        this.elements.btnCloseInvite.onclick = () => {
            this.hideInviteBanner();
        };
    }
};

UI.hideInviteBanner = function() {
    if (!this.elements.inviteBanner) return;
    this.elements.inviteBanner.classList.add('hidden');
};

