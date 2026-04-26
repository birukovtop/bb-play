/**
 * BlackBears Play - support chat module.
 */
const Support = {
    messages: [],

    keywordMap: {
        'привет': 'hello',
        'здравствуй': 'greetings',
        'как забронировать': 'bookingHow',
        'бронь': 'booking',
        'оплата': 'payment',
        'баланс': 'balance',
        'пополнить': 'topup',
        'скидка': 'discount',
        'клубы': 'clubs',
        'адрес': 'address',
        'график': 'schedule',
        'тарифы': 'tariffs',
        'пакет': 'packages',
        'ошибка': 'error',
        'не работает': 'broken',
        'рестарт': 'restart',
        'выйти': 'logout',
        'спасибо': 'thanks',
        'помощь': 'help',
        'команда': 'command'
    },

    t(path, params = {}, fallback = '') {
        return window.BBText?.t(`support.${path}`, params, fallback) ?? fallback;
    },

    pick(path, fallback = '') {
        return window.BBText?.pick(`support.${path}`, fallback) ?? fallback;
    },

    sendQuickQuestion(question, event = null) {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        const input = document.getElementById('support-input');
        if (!input || !question) {
            return false;
        }

        input.value = question;
        this._sendMessage(input);
        return false;
    },

    getResponseForPrompt(question) {
        const promptToResponse = {
            [this.t('prompts.booking').toLowerCase()]: 'bookingHow',
            [this.t('prompts.tariffs').toLowerCase()]: 'tariffs',
            [this.t('prompts.discounts').toLowerCase()]: 'discount',
            [this.t('prompts.addresses').toLowerCase()]: 'address',
            [this.t('prompts.topup').toLowerCase()]: 'topup'
        };

        const normalized = String(question || '').trim().toLowerCase();
        const responseKey = promptToResponse[normalized];
        return responseKey ? this.t(`responses.${responseKey}`) : null;
    },

    renderChatAvatar(sender) {
        if (sender === 'bot') {
            return `
                <div class="dialog-avatar support-chat-avatar support-chat-avatar--barney">
                    <img src="assets/bear.svg" alt="Барни">
                </div>
            `;
        }

        const avatarHtml = (typeof Avatar !== 'undefined' && typeof Avatar.renderStatusIcon === 'function')
            ? Avatar.renderStatusIcon()
            : '🐻';

        return `
            <div class="support-chat-avatar support-chat-avatar--user">
                ${avatarHtml}
            </div>
        `;
    },

    async show() {
        AppState.dialogScreen = 'support';
        this.messages = [];
        UI.clearDialog();

        const greeting = this.t('greeting');
        const promptBooking = this.t('prompts.booking');
        const promptTariffs = this.t('prompts.tariffs');
        const promptDiscounts = this.t('prompts.discounts');
        const promptAddresses = this.t('prompts.addresses');
        const promptTopup = this.t('prompts.topup');

        const fullHtml = `
            <div class="support-screen-stack">
                <div class="support-shell">
                    <div class="support-header">
                        <span>${this.t('title')}</span>
                        <button class="dialog-sound-toggle support-sound-toggle" id="btn-sound-toggle" type="button"></button>
                    </div>
                    <div class="support-chat" id="support-chat">
                        <div class="chat-message bot">
                            ${this.renderChatAvatar('bot')}
                            <div class="chat-bubble">${greeting}</div>
                        </div>
                    </div>
                    <div class="support-quick-row">
                        <button class="btn-preset quick-q" type="button" data-q="${promptBooking}" onclick="return Support.sendQuickQuestion(this.dataset.q, event);">${promptBooking}</button>
                        <button class="btn-preset quick-q" type="button" data-q="${promptTariffs}" onclick="return Support.sendQuickQuestion(this.dataset.q, event);">${promptTariffs}</button>
                        <button class="btn-preset quick-q" type="button" data-q="${promptDiscounts}" onclick="return Support.sendQuickQuestion(this.dataset.q, event);">${promptDiscounts}</button>
                        <button class="btn-preset quick-q" type="button" data-q="${promptAddresses}" onclick="return Support.sendQuickQuestion(this.dataset.q, event);">${promptAddresses}</button>
                        <button class="btn-preset quick-q" type="button" data-q="${promptTopup}" onclick="return Support.sendQuickQuestion(this.dataset.q, event);">${promptTopup}</button>
                    </div>
                    <div class="support-input-area">
                        <input type="text" id="support-input" class="game-input" placeholder="${this.t('inputPlaceholder')}">
                        <button id="support-send" class="btn btn-primary" type="button">${this.t('send')}</button>
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.className = 'fade-in';
        wrapper.innerHTML = fullHtml;
        UI.elements.dialogContent.appendChild(wrapper);

        if (UI.soundEnabled) {
            UI._playTTSAsync(greeting);
        }

        this.messages.push({ sender: 'bot', text: greeting });

        const input = document.getElementById('support-input');
        const sendBtn = document.getElementById('support-send');
        const soundBtn = document.getElementById('btn-sound-toggle');

        UI.elements.btnSoundToggle = soundBtn;
        UI.updateSoundIcon();

        sendBtn?.addEventListener('click', () => this._sendMessage(input));
        soundBtn?.addEventListener('click', () => UI.toggleSound());

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._sendMessage(input);
            }
        });

        UI.setActions([
            {
                label: window.BBText?.t('common.mainMenu', {}, 'Главное меню'),
                description: window.BBText?.t('common.backToMainMenu', {}, 'Вернуться к основным разделам'),
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => Dialogs.mainMenu()
            }
        ]);
    },

    async _sendMessage(input) {
        const text = input?.value.trim();
        if (!text) return;

        input.value = '';
        this._addChatMessage('user', text);

        const response = this.getResponseForPrompt(text) || this._findResponse(text);
        await this._delay(500 + Math.random() * 500);
        this._addChatMessage('bot', response);
    },

    _addChatMessage(sender, text) {
        const chat = document.getElementById('support-chat');
        if (!chat) return;

        this.messages.push({ sender, text });

        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${sender}`;
        msgEl.innerHTML = `
            ${this.renderChatAvatar(sender)}
            <div class="chat-bubble">${text}</div>
        `;

        chat.appendChild(msgEl);
        chat.scrollTop = chat.scrollHeight;

        if (sender === 'bot' && UI.soundEnabled) {
            UI._playTTSAsync(text);
        }
    },

    _findResponse(text) {
        const lower = text.toLowerCase().trim();

        for (const [keyword, responseKey] of Object.entries(this.keywordMap)) {
            if (lower === keyword || lower.includes(keyword) || keyword.includes(lower)) {
                return this.t(`responses.${responseKey}`);
            }
        }

        return this.pick('defaults', 'Попробуй уточнить вопрос.');
    },

    _delay(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
};
