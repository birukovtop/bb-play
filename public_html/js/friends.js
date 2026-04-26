/**
 * BlackBears Play — Модуль друзей (Friends)
 * Список, поиск, добавление, приглашения с QR
 */
const Friends = {

    // Кэш друзей
    cache: {
        list: [],
        pending: [],
        outgoing: [],
        invitations: [],
        activeTab: 'friends',
    },
    view: {
        mode: 'modal',
        refs: {},
    },

    // ==========================================
    // Инициализация
    // ==========================================
    init() {
        this._bindEvents();
    },

    // ==========================================
    // Привязка событий
    // ==========================================
    _bindEvents() {
        // Закрытие модалок — event delegation на оверлеях
        const overlayMap = {
            'modal-friends': () => this.hideFriendsModal(),
            'modal-add-friend': () => this.hideAddFriendModal(),
            'modal-invite': () => this.hideInviteModal(),
        };

        Object.entries(overlayMap).forEach(([overlayId, closeFn]) => {
            const overlay = document.getElementById(overlayId);
            if (!overlay) return;

            // Клик на × или кнопку «Закрыть»
            overlay.addEventListener('click', (e) => {
                // Клик на оверлей (фон)
                if (e.target === overlay) { closeFn(); return; }
                // Клик на кнопку с классом btn-close
                if (e.target.closest('.btn-close')) { closeFn(); return; }
                // Клик на кнопку «Закрыть»
                if (e.target.closest('[id*="close"][id*="ok"]')) { closeFn(); return; }
            });
        });

        // Переключение табов
        document.querySelectorAll('.friends-tab').forEach(tab => {
            tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
        });

        // Открытие модалок из футера
        document.getElementById('btn-add-friend')?.addEventListener('click', () => {
            this.hideFriendsModal();
            this.showAddFriendModal();
        });
        document.getElementById('btn-invite-friend')?.addEventListener('click', () => {
            this.hideFriendsModal();
            this._generateInvite();
        });

        // Шаги добавления друга
        document.getElementById('btn-search-by-login')?.addEventListener('click', () => this._showSearchStep());
        document.getElementById('btn-create-guest')?.addEventListener('click', () => this._showGuestStep());
        document.getElementById('btn-send-invite')?.addEventListener('click', () => {
            this.hideAddFriendModal();
            this._generateInvite();
        });

        // Поиск
        document.getElementById('btn-do-search')?.addEventListener('click', () => this._doSearch());
        document.getElementById('friend-search-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._doSearch();
        });

        // Создание гостя
        document.getElementById('btn-do-create-guest')?.addEventListener('click', () => this._createGuest());

        // Назад
        document.getElementById('btn-back-to-add-friend')?.addEventListener('click', () => this._showAddFriendStep1());

        // Копирование ссылки
        document.getElementById('btn-copy-invite-url')?.addEventListener('click', () => this._copyInviteUrl());

        // Шеринг
        document.getElementById('btn-share-vk')?.addEventListener('click', () => this._shareVK());
        document.getElementById('btn-share-tg')?.addEventListener('click', () => this._shareTG());
    },

    _setView(mode, refs = {}) {
        this.view = { mode, refs };
    },

    _el(key, fallbackId = null) {
        if (this.view?.refs?.[key]) {
            return this.view.refs[key];
        }
        return fallbackId ? document.getElementById(fallbackId) : null;
    },

    _renderScreenFrame() {
        return `
            <div class="friends-screen">
                <div class="friends-screen__header">
                    <div>
                        <h3 class="friends-screen__title">Отряд</h3>
                        <p class="friends-screen__subtitle">Друзья, заявки и приглашения</p>
                    </div>
                </div>
                <div class="friends-tabs">
                    <button class="friends-tab active" data-tab="friends">Друзья</button>
                    <button class="friends-tab" data-tab="outgoing">Заявки</button>
                    <button class="friends-tab" data-tab="invitations">Приглашения</button>
                </div>
                <div id="friends-screen-root">
                    <div id="tab-friends-screen" class="friends-tab-content active">
                        <div id="friends-pending-section-screen" class="hidden">
                            <h4 class="friends-screen__section-title">Входящие запросы</h4>
                            <div id="friends-pending-list-screen"></div>
                            <hr class="friends-screen__separator">
                        </div>
                        <div id="friends-list-screen"></div>
                        <div class="modal-error" id="friends-error-screen"></div>
                    </div>

                    <div id="tab-outgoing-screen" class="friends-tab-content">
                        <div id="outgoing-list-screen"></div>
                        <div class="modal-error" id="outgoing-error-screen"></div>
                    </div>

                    <div id="tab-invitations-screen" class="friends-tab-content">
                        <div id="invitations-list-screen"></div>
                        <div class="modal-error" id="invitations-error-screen"></div>
                    </div>
                </div>
            </div>
        `;
    },

    async showScreen() {
        AppState.dialogScreen = 'friends';
        UI.clearDialog();
        await UI.sayBarney('Собираю твой отряд: друзья, заявки и приглашения в одном месте.');
        UI.appendContent(this._renderScreenFrame());

        this._setView('screen', {
            root: document.getElementById('friends-screen-root'),
            friendsTab: document.getElementById('tab-friends-screen'),
            outgoingTab: document.getElementById('tab-outgoing-screen'),
            invitationsTab: document.getElementById('tab-invitations-screen'),
            pendingSection: document.getElementById('friends-pending-section-screen'),
            pendingList: document.getElementById('friends-pending-list-screen'),
            friendsList: document.getElementById('friends-list-screen'),
            friendsError: document.getElementById('friends-error-screen'),
            outgoingList: document.getElementById('outgoing-list-screen'),
            outgoingError: document.getElementById('outgoing-error-screen'),
            invitationsList: document.getElementById('invitations-list-screen'),
            invitationsError: document.getElementById('invitations-error-screen'),
        });

        document.querySelectorAll('.friends-screen .friends-tab').forEach(tab => {
            tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
        });

        UI.setActions([
            {
                label: 'Добавить',
                description: 'Найти или создать друга',
                iconPath: './ui%20kit/icon/bulk/user-add.svg',
                action: () => this.showAddFriendModal()
            },
            {
                label: 'Пригласить',
                description: 'Ссылка и QR для друга',
                iconPath: './ui%20kit/icon/bulk/send.svg',
                action: () => this._generateInvite()
            },
            {
                label: 'Главное меню',
                description: 'Вернуться к основным разделам',
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => Dialogs.mainMenu()
            }
        ]);

        this.cache.activeTab = '';
        this._switchTab('friends');
    },

    // ==========================================
    // Переключение табов
    // ==========================================
    _switchTab(tabName) {
        this.cache.activeTab = tabName;

        // Переключаем кнопки
        const tabSelector = this.view.mode === 'screen' ? '.friends-screen .friends-tab' : '.friends-tab';
        document.querySelectorAll(tabSelector).forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        // Переключаем контент
        const contents = this.view.mode === 'screen'
            ? [this._el('friendsTab'), this._el('outgoingTab'), this._el('invitationsTab')]
            : Array.from(document.querySelectorAll('.friends-tab-content'));
        contents.filter(Boolean).forEach(c => c.classList.remove('active'));

        const activeMap = {
            friends: this._el('friendsTab', 'tab-friends'),
            outgoing: this._el('outgoingTab', 'tab-outgoing'),
            invitations: this._el('invitationsTab', 'tab-invitations'),
        };
        activeMap[tabName]?.classList.add('active');

        // Загружаем контент таба
        if (tabName === 'friends') this._loadFriends();
        else if (tabName === 'outgoing') this._loadOutgoing();
        else if (tabName === 'invitations') this._loadInvitations();
    },

    // ==========================================
    // Показать модалку друзей
    // ==========================================
    async showFriendsModal() {
        return this.showScreen();
    },

    hideFriendsModal() {
        if (this.view.mode === 'screen') {
            Dialogs.mainMenu();
            return;
        }
        UI.elements.modalFriends.classList.add('hidden');
        UI.restoreActions();
    },

    // Показать модалку добавления друга
    showAddFriendModal() {
        UI.elements.modalAddFriend.classList.remove('hidden');
        this._showAddFriendStep1();
    },

    hideAddFriendModal() {
        const el = UI.elements.modalAddFriend;
        if (!el) { console.error('modalAddFriend is null'); return; }
        el.classList.add('hidden');
        this._showAddFriendStep1(); // Сброс
        UI.restoreActions();
    },

    hideInviteModal() {
        UI.elements.modalInvite.classList.add('hidden');
        UI.restoreActions();
    },

    // ==========================================
    // Загрузка списка друзей
    // ==========================================
    async _loadFriends() {
        const login = AppState.currentUser.login;
        const errorEl = this._el('friendsError', 'friends-error');
        if (errorEl) errorEl.textContent = '';

        try {
            // Загружаем друзей и входящие параллельно
            const [friendsData, pendingData] = await Promise.all([
                API.getFriendsList(login),
                API.getFriendsPending(login),
            ]);

            this.cache.list = friendsData || [];
            this.cache.pending = pendingData || [];

            this._renderPending();
            this._renderFriendsList();

        } catch (e) {
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    // ==========================================
    // Рендер входящих запросов
    // ==========================================
    _renderPending() {
        const section = this._el('pendingSection', 'friends-pending-section');
        const list = this._el('pendingList', 'friends-pending-list');

        if (!section || !list) {
            console.warn('_renderPending: элементы не найдены');
            return;
        }

        if (!this.cache.pending || this.cache.pending.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = '';

        this.cache.pending.forEach(p => {
            const el = document.createElement('div');
            el.className = 'pending-item';
            el.innerHTML = `
                <div class="friend-avatar">${this._getFriendAvatarHTML(p)}</div>
                <div class="pending-name">${p.name || p.login}</div>
                <div class="pending-actions">
                    <button class="btn btn-primary btn-accept btn-icon-only" data-login="${p.login}" title="Принять заявку" aria-label="Принять заявку"><img src="./ui%20kit/icon/bulk/user-tick.svg" alt="" class="inline-action-icon"></button>
                    <button class="btn btn-danger btn-reject btn-icon-only" data-login="${p.login}" title="Отклонить заявку" aria-label="Отклонить заявку"><img src="./ui%20kit/icon/bulk/user-remove.svg" alt="" class="inline-action-icon"></button>
                </div>
            `;
            list.appendChild(el);
        });

        // Обработчики
        list.querySelectorAll('.btn-accept').forEach(btn => {
            btn.addEventListener('click', () => this._acceptFriend(btn.dataset.login));
        });
        list.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', () => this._rejectFriend(btn.dataset.login));
        });
    },

    // ==========================================
    // Исходящие заявки
    // ==========================================
    async _loadOutgoing() {
        const login = AppState.currentUser.login;
        const errorEl = this._el('outgoingError', 'outgoing-error');
        if (errorEl) errorEl.textContent = '';

        try {
            const url = `${API.LOCAL_API}/friends.php?action=outgoing&login=${encodeURIComponent(login)}`;
            const r = await fetch(url);
            const json = await r.json();
            if (json.code !== 0) throw new Error(json.message);
            this.cache.outgoing = json.data || [];
            this._renderOutgoing();
        } catch (e) {
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    _renderOutgoing() {
        const list = this._el('outgoingList', 'outgoing-list');
        if (!list) {
            console.warn('_renderOutgoing: элемент не найден');
            return;
        }
        list.innerHTML = '';

        if (this.cache.outgoing.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Нет исходящих заявок</p>';
            return;
        }

        this.cache.outgoing.forEach(o => {
            const el = document.createElement('div');
            el.className = 'friend-item';
            el.innerHTML = `
                <div class="friend-avatar">${this._getFriendAvatarHTML(o)}</div>
                <div class="friend-info">
                    <div class="friend-name">${o.name || o.login}</div>
                    <div class="friend-details">Отправлено</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-danger btn-cancel-outgoing btn-icon-only" data-login="${o.login}" title="Отменить заявку" aria-label="Отменить заявку"><img src="./ui%20kit/icon/bulk/user-remove.svg" alt="" class="inline-action-icon"></button>
                </div>
            `;
            list.appendChild(el);
        });

        list.querySelectorAll('.btn-cancel-outgoing').forEach(btn => {
            btn.addEventListener('click', () => this._cancelOutgoing(btn.dataset.login));
        });
    },

    async _cancelOutgoing(friendLogin) {
        if (!confirm('Отменить заявку в друзья для ' + friendLogin + '?')) return;
        try {
            await API.cancelFriendRequest(AppState.currentUser.login, friendLogin);
            await this._loadOutgoing();
        } catch (e) {
            const errorEl = this._el('outgoingError', 'outgoing-error');
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    // ==========================================
    // Приглашения
    // ==========================================
    async _loadInvitations() {
        const login = AppState.currentUser.login;
        const errorEl = this._el('invitationsError', 'invitations-error');
        if (errorEl) errorEl.textContent = '';

        try {
            const url = `${API.LOCAL_API}/friends.php?action=invitations&login=${encodeURIComponent(login)}`;
            const r = await fetch(url);
            const json = await r.json();
            if (json.code !== 0) throw new Error(json.message);
            this.cache.invitations = json.data || [];
            this._renderInvitations();
        } catch (e) {
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    _renderInvitations() {
        const list = this._el('invitationsList', 'invitations-list');
        if (!list) {
            console.warn('_renderInvitations: элемент не найден');
            return;
        }
        list.innerHTML = '';

        if (this.cache.invitations.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Нет отправленных приглашений</p>';
            return;
        }

        this.cache.invitations.forEach(inv => {
            let statusClass = 'active';
            let statusText = 'Активно';
            if (inv.is_used) { statusClass = 'used'; statusText = 'Использовано'; }
            else if (inv.is_expired) { statusClass = 'expired'; statusText = 'Истекло'; }

            const el = document.createElement('div');
            el.className = 'invite-item';
            el.innerHTML = `
                <div class="friend-avatar">URL</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.85rem;">
                        ${inv.friend_login ? 'Гость: ' + inv.friend_login : 'Ссылка'}
                    </div>
                    <div class="invite-url">${inv.invite_url}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">
                        Действует до: ${new Date(inv.expires_at).toLocaleDateString('ru-RU')}
                    </div>
                </div>
                <span class="invite-status ${statusClass}">${statusText}</span>
                ${!inv.is_used && !inv.is_expired ? `<button class="btn btn-danger btn-revoke" style="padding:6px 10px;font-size:0.75rem;" title="Отозвать"><span class="icon-mask" style="--icon:url('./ui%20kit/icon/bulk/close-circle.svg')"></span></button>` : ''}
            `;
            list.appendChild(el);
        });

        list.querySelectorAll('.btn-revoke').forEach(btn => {
            btn.addEventListener('click', () => this._revokeInvite(btn.closest('.invite-item').querySelector('.invite-url').textContent.trim()));
        });
    },

    async _revokeInvite(url) {
        if (!confirm('Отозвать это приглашение?')) return;
        const token = url.split('token=')[1];
        if (!token) return;
        try {
            await API.revokeInvitation(token);
            await this._loadInvitations();
        } catch (e) {
            const errorEl = this._el('invitationsError', 'invitations-error');
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    // ==========================================
    // Рендер списка друзей
    // ==========================================
    _renderFriendsList() {
        const list = this._el('friendsList', 'friends-list');
        if (!list) {
            console.warn('_renderFriendsList: элемент не найден');
            return;
        }
        list.innerHTML = '';

        if (this.cache.list.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">У тебя пока нет друзей. Добавь первого товарища!</p>';
            return;
        }

        const now = new Date();
        const todayStr = CONFIG.formatDate(now);
        const currentTime = CONFIG.formatTime(now);

        this.cache.list.forEach(f => {
            const el = document.createElement('div');
            el.className = 'friend-item';

            const guestBadge = f.is_guest ? '<span class="badge-guest">гость</span>' : '';

            // Определяем статус игры (Играет / Не в сети)
            const playStatus = this._getFriendPlayStatus(f, todayStr, currentTime);

            // Аватарка друга
            const friendAvatarHTML = this._getFriendAvatarHTML(f);

            el.innerHTML = `
                <div class="friend-avatar" style="width:40px;height:40px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--gold-glow);border:1px solid var(--gold-dim);font-size:1.2rem;flex-shrink:0;">${friendAvatarHTML}</div>
                <div class="friend-info" data-friend-id="${f.id}">
                    <div class="friend-name">${f.name || f.login}${guestBadge}</div>
                    <div class="friend-details">
                        <span class="friend-status">${playStatus.icon} ${playStatus.text}</span>
                    </div>
                    ${playStatus.details ? `<div class="friend-details" style="margin-top:4px;font-size:0.75rem;color:var(--text-muted)">${playStatus.details}</div>` : ''}
                </div>
                <div class="friend-actions">
                    <button class="btn btn-secondary btn-book-for btn-icon-only" data-id="${f.id}" data-login="${f.login}" title="${window.BBText?.t('friends.bookForFriend', {}, 'Забронировать для друга')}" aria-label="${window.BBText?.t('friends.bookForFriend', {}, 'Забронировать для друга')}"><img src="./ui%20kit/icon/bulk/ticket.svg" alt="" class="inline-action-icon"></button>
                    <button class="btn btn-danger btn-remove-friend btn-icon-only" data-login="${f.login}" title="Удалить друга" aria-label="Удалить друга"><img src="./ui%20kit/icon/bulk/trash.svg" alt="" class="inline-action-icon"></button>
                </div>
            `;
            list.appendChild(el);
        });

        // Клик по другу — показать детали
        list.querySelectorAll('.friend-info').forEach(info => {
            info.addEventListener('click', () => {
                const friendId = parseInt(info.dataset.friendId);
                const friend = this.cache.list.find(f => f.id == friendId);
                if (friend) this._showFriendDetails(friend);
            });
        });

        // Обработчики кнопок действий
        list.querySelectorAll('.btn-book-for').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideFriendsModal();
                const friend = this.cache.list.find(f => f.login === btn.dataset.login);
                if (friend) {
                    Booking.startForFriend(friend);
                }
            });
        });
        list.querySelectorAll('.btn-remove-friend').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeFriend(btn.dataset.login);
            });
        });
    },

    // ==========================================
    // Получить HTML аватарки друга
    // ==========================================
    _getFriendAvatarHTML(friend) {
        if (friend.avatar_type === 'custom' && friend.avatar && friend.avatar.startsWith('/')) {
            return `<img src="${friend.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`;
        }

        if (friend.avatar_type === 'preset' && friend.avatar && friend.avatar !== 'BB') {
            return friend.avatar;
        }

        return '🐻';
    },

    // ==========================================
    // Определить статус игры друга
    // ==========================================
    _getFriendPlayStatus(friend, todayStr, currentTime) {
        const bookings = friend.active_bookings || [];
        
        if (bookings.length === 0) {
            return {
                icon: 'OFF',
                text: 'Не в сети',
                color: '#666',
                details: ''
            };
        }
        
        // Ищем бронь которая сейчас активна (время уже началось)
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        let playingNow = null;
        let upcoming = [];
        
        bookings.forEach(b => {
            const bookDate = b.start_date || b.date || '';
            const bookTime = (b.start_time || b.time || '').substring(0, 5);
            
            if (!bookDate || !bookTime) return;
            
            const [h, m] = bookTime.split(':').map(Number);
            const startMinutes = h * 60 + m;
            const endMinutes = startMinutes + (parseInt(b.duration_min) || b.duration || 60);
            const endH = Math.floor(endMinutes / 60) % 24;
            const endM = endMinutes % 60;
            const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            
            if (bookDate === todayStr) {
                // Сегодня — проверяет играет ли сейчас
                if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                    playingNow = { ...b, endTime };
                } else if (currentMinutes < startMinutes) {
                    upcoming.push({ ...b, endTime });
                }
            }
        });
        
        if (playingNow) {
            return {
                icon: 'LIVE',
                text: 'Играет',
                color: '#22c55e',
                details: `${(playingNow.pc_name || '').replace('pc', 'ПК').replace('PC', 'ПК')} → ${playingNow.endTime} • ${playingNow.cafe_address || ''}`
            };
        }

        if (upcoming.length > 0) {
            const next = upcoming.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
            const dateStr = next.start_date?.split('-').reverse().join('.');
            return {
                icon: 'TIME',
                text: `Забронировал ${dateStr} ${next.start_time?.substring(0, 5)}`,
                color: '#60a5fa',
                details: `${(next.pc_name || '').replace('pc', 'ПК').replace('PC', 'ПК')} • ${next.cafe_address || ''}`
            };
        }

        return {
            icon: 'OFF',
            text: 'Не в сети',
            color: '#666',
            details: ''
        };
    },

    // ==========================================
    // Показать детали друга
    // ==========================================
    async _showFriendDetails(friend) {
        const body = this.view.mode === 'screen'
            ? this._el('root')
            : document.getElementById('modal-friends')?.querySelector('.modal-body');
        if (!body) return;
        const bookings = friend.active_bookings || [];

        let bookingsHtml = '';
        if (bookings.length > 0) {
            bookingsHtml = '<h4 style="color:var(--gold);margin-bottom:8px;">Бронирования</h4>';
            bookings.forEach((b, i) => {
                const date = b.start_date?.split('-').reverse().join('.');
                const time = b.start_time?.substring(0, 5);
                const cafeId = b.icafe_id || '';
                bookingsHtml += `
                    <div class="booking-item" data-booking-index="${i}">
                        <div class="booking-item-header">
                            <span class="booking-pc">${b.pc_name}</span>
                            <span class="booking-status">Активна</span>
                        </div>
                        <div class="booking-details-text">
                            Клуб: ${b.cafe_address || '—'}<br>
                            Дата: ${date} в ${time} • ${b.duration_min} мин
                            ${b.price ? `<br>Цена: ${b.price}₽` : ''}
                        </div>
                        <div style="margin-top:8px;">
                            <button class="btn btn-primary btn-book-next-to" 
                                    data-cafe-id="${cafeId}"
                                    data-date="${b.start_date}"
                                    data-time="${time}"
                                    data-duration="${b.duration_min}"
                                    data-friend-login="${friend.login}"
                                    data-friend-pc="${b.pc_name}"
                                    style="width:100%;font-size:0.85rem;padding:10px;">
                                Забронировать рядом
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            bookingsHtml = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Активных броней нет</p>';
        }

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <div class="friend-avatar" style="width:50px;height:50px;font-size:1.5rem;">${this._getFriendAvatarHTML(friend)}</div>
                <div>
                    <div style="font-weight:700;font-size:1.1rem;">${friend.name || friend.login}</div>
                    <div style="color:var(--text-secondary);font-size:0.85rem;">${friend.balance}₽ • Скидка ${Math.round(friend.discount * 100)}%</div>
                </div>
            </div>
            ${bookingsHtml}
        `;

        if (this.view.mode === 'screen') {
            UI.setActions([
                {
                    label: 'Назад',
                    description: 'Вернуться к списку друзей',
                    iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                    action: () => this.showScreen()
                },
                {
                    label: 'Главное меню',
                    description: 'Вернуться к основным разделам',
                    iconPath: './ui%20kit/icon/bulk/home.svg',
                    action: () => Dialogs.mainMenu()
                }
            ]);
        } else {
            const modal = document.getElementById('modal-friends');
            const footer = modal?.querySelector('.modal-footer');
            if (footer) {
                footer.innerHTML = `
                    <button id="btn-friend-details-back" class="btn btn-secondary">Назад к списку</button>
                `;
                document.getElementById('btn-friend-details-back')?.addEventListener('click', () => this._loadFriends());
            }
        }

        // Кнопки «Забронировать рядом»
        body.querySelectorAll('.btn-book-next-to').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cafeId = btn.dataset.cafeId;
                if (!cafeId) {
                    // Попробуем найти клуб из данных друзей
                    const friend = this.cache.list?.find(f => f.login === btn.dataset.friendLogin);
                    // Если не нашли — покажем ошибку
                    console.error('Нет cafeId для бронирования');
                }

                if (this.view.mode === 'modal') {
                    this.hideFriendsModal();
                }

                // Сбрасываем контекст и заполняем данными
                AppState.resetBookingCtx();

                const cafe = AppState.cafes?.find(c => c.icafe_id == cafeId);
                if (!cafe) {
                    // Попробуем загрузить клубы
                    try {
                        AppState.cafes = await API.getCafes();
                        const cafeRetry = AppState.cafes?.find(c => c.icafe_id == cafeId);
                        if (cafeRetry) {
                            AppState.bookingCtx.selectedCafe = cafeRetry;
                        }
                    } catch (e) {
                        console.warn('Не удалось загрузить клубы:', e);
                    }
                } else {
                    AppState.bookingCtx.selectedCafe = cafe;
                }

                AppState.bookingCtx.selectedDate = btn.dataset.date;
                AppState.bookingCtx.selectedTime = btn.dataset.time;
                AppState.bookingCtx.selectedDuration = parseInt(btn.dataset.duration);
                AppState.bookingCtx.bookingFor = 'self';

                // Запускаем сразу на шаг проверки ПК — без лишних шагов
                Booking._stepCheckPCs();
            });
        });
    },

    // ==========================================
    // Форматирование броней друга
    // ==========================================
    _formatFriendBookings(friend) {
        if (!friend.active_bookings || friend.active_bookings.length === 0) return '';
        const b = friend.active_bookings[0];
        const date = b.start_date?.split('-').reverse().join('.');
        return `${b.pc_name} • ${date} ${b.start_time?.substring(0, 5)}`;
    },

    // ==========================================
    // Принять / отклонить запрос
    // ==========================================
    async _acceptFriend(friendLogin) {
        try {
            await API.acceptFriend(AppState.currentUser.login, friendLogin);
            await this._loadFriends();
        } catch (e) {
            const errorEl = this._el('friendsError', 'friends-error');
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    async _rejectFriend(friendLogin) {
        try {
            await API.rejectFriend(AppState.currentUser.login, friendLogin);
            await this._loadFriends();
        } catch (e) {
            const errorEl = this._el('friendsError', 'friends-error');
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    async _removeFriend(friendLogin) {
        if (!confirm(`Удалить ${friendLogin} из друзей?`)) return;
        try {
            await API.removeFriend(AppState.currentUser.login, friendLogin);
            await this._loadFriends();
        } catch (e) {
            const errorEl = this._el('friendsError', 'friends-error');
            if (errorEl) errorEl.textContent = e.message;
        }
    },

    // ==========================================
    // Добавление друга — шаги
    // ==========================================
    _showAddFriendStep1() {
        const step1 = document.getElementById('add-friend-step1');
        const search = document.getElementById('add-friend-search');
        const guest = document.getElementById('add-friend-guest');
        const backBtn = document.getElementById('btn-back-to-add-friend');
        const error = document.getElementById('add-friend-error');

        if (step1) step1.classList.remove('hidden');
        if (search) search.classList.add('hidden');
        if (guest) guest.classList.add('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        if (error) error.textContent = '';
    },

    _showSearchStep() {
        document.getElementById('add-friend-step1').classList.add('hidden');
        document.getElementById('add-friend-search').classList.remove('hidden');
        document.getElementById('btn-back-to-add-friend').classList.remove('hidden');
        document.getElementById('friend-search-input').value = '';
        document.getElementById('friend-search-results').innerHTML = '';
        document.getElementById('friend-search-input').focus();
    },

    _showGuestStep() {
        document.getElementById('add-friend-step1').classList.add('hidden');
        document.getElementById('add-friend-guest').classList.remove('hidden');
        document.getElementById('btn-back-to-add-friend').classList.remove('hidden');
        document.getElementById('guest-login').value = '';
        document.getElementById('guest-name').value = '';
        document.getElementById('guest-phone').value = '';
        document.getElementById('guest-email').value = '';
        document.getElementById('guest-password').value = '';
        document.getElementById('add-friend-error').textContent = '';
        UI._initPhoneMask(document.getElementById('guest-phone'));
    },

    // ==========================================
    // Поиск по логину
    // ==========================================
    async _doSearch() {
        const q = document.getElementById('friend-search-input').value.trim();
        if (!q) return;

        document.getElementById('add-friend-error').textContent = '';
        document.getElementById('friend-search-results').innerHTML = '<p style="color:var(--text-muted)">Поиск...</p>';

        try {
            const users = await API.searchUsers(q);
            const results = document.getElementById('friend-search-results');
            results.innerHTML = '';

            if (!users || users.length === 0) {
                results.innerHTML = '<p style="color:var(--text-muted)">Никого не найдено. Попробуй другое имя или создай гостя.</p>';
                return;
            }

            // Исключаем себя
            const filtered = users.filter(u => u.login !== AppState.currentUser.login);

            if (filtered.length === 0) {
                results.innerHTML = '<p style="color:var(--text-muted)">Это ты. Найди кого-нибудь другого.</p>';
                return;
            }

            filtered.forEach(u => {
                const el = document.createElement('div');
                el.className = 'search-result-item';
                el.innerHTML = `
                    <div class="friend-avatar">${this._getFriendAvatarHTML(u)}</div>
                    <div class="friend-info">
                        <div class="friend-name">${u.name || u.login}</div>
                        <div class="friend-details">${u.balance}₽</div>
                    </div>
                    <button class="btn btn-primary btn-add-from-search" data-login="${u.login}">Добавить</button>
                `;
                results.appendChild(el);
            });

            results.querySelectorAll('.btn-add-from-search').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await API.addFriend(AppState.currentUser.login, btn.dataset.login);
                        results.innerHTML = '<p style="color:var(--green)">Запрос отправлен.</p>';
                        await this._loadFriends();
                    } catch (e) {
                        document.getElementById('add-friend-error').textContent = e.message;
                    }
                });
            });

        } catch (e) {
            document.getElementById('add-friend-error').textContent = e.message;
        }
    },

    // ==========================================
    // Создать гостевой аккаунт
    // ==========================================
    async _createGuest() {
        const guestLogin = document.getElementById('guest-login').value.trim();
        const guestName = document.getElementById('guest-name').value.trim();
        const guestPhone = document.getElementById('guest-phone').value.trim();
        const guestEmail = document.getElementById('guest-email').value.trim();
        const guestPassword = document.getElementById('guest-password').value.trim();

        if (!guestLogin || guestLogin.length < 2) {
            document.getElementById('add-friend-error').textContent = 'Логин — минимум 2 символа';
            return;
        }
        if (!guestName) {
            document.getElementById('add-friend-error').textContent = 'Укажи имя друга';
            return;
        }
        const phone = '+' + guestPhone.replace(/\D/g, '');
        if (!phone || phone.length < 12) {
            document.getElementById('add-friend-error').textContent = 'Укажи телефон полностью: +7 (XXX) XXX-XX-XX';
            return;
        }
        if (!guestEmail || !guestEmail.includes('@')) {
            document.getElementById('add-friend-error').textContent = 'Нужна корректная почта друга';
            return;
        }
        if (!guestPassword || guestPassword.length < 6) {
            document.getElementById('add-friend-error').textContent = 'Пароль друга — минимум 6 символов';
            return;
        }
        try {
            await API.createGuestAccount(AppState.currentUser.login, guestLogin, guestName, phone, guestEmail, guestPassword);
            document.getElementById('add-friend-error').textContent = '';
            document.getElementById('add-friend-guest').innerHTML = '<p style="color:var(--green);text-align:center;padding:20px;">Гостевой аккаунт <strong>' + guestLogin + '</strong> создан во внешней системе и добавлен в друзья.</p>';
            await this._loadFriends();
        } catch (e) {
            document.getElementById('add-friend-error').textContent = e.message;
        }
    },

    // ==========================================
    // Генерация приглашения (ссылка + QR)
    // ==========================================
    async _generateInvite() {
        UI.elements.modalInvite.classList.remove('hidden');
        document.getElementById('invite-error').textContent = '';
        document.getElementById('invite-url-text').textContent = 'Генерация...';
        document.getElementById('invite-qr').innerHTML = '';

        try {
            const result = await API.createInvitation(AppState.currentUser.login);
            const url = result.invite_url;

            document.getElementById('invite-url-text').textContent = url;

            // QR-код
            if (typeof QRCode !== 'undefined') {
                new QRCode(document.getElementById('invite-qr'), {
                    text: url,
                    width: 200,
                    height: 200,
                    colorDark: '#0a0e1a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M,
                });
            } else {
                document.getElementById('invite-qr').innerHTML = '<p style="color:#333;font-size:12px;">QR: ' + url + '</p>';
            }

        } catch (e) {
            document.getElementById('invite-error').textContent = e.message;
        }
    },

    // ==========================================
    // Копирование ссылки
    // ==========================================
    _copyInviteUrl() {
        const url = document.getElementById('invite-url-text').textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('btn-copy-invite-url');
                const orig = btn.textContent;
                btn.textContent = 'Скопировано';
                setTimeout(() => btn.textContent = orig, 2000);
            });
        }
    },

    // ==========================================
    // Шеринг
    // ==========================================
    _shareVK() {
        const url = encodeURIComponent(document.getElementById('invite-url-text').textContent);
        const text = encodeURIComponent('Присоединяйся к BlackBears Play');
        window.open(`https://vk.com/share.php?url=${url}&title=${text}`, '_blank');
    },

    _shareTG() {
        const url = encodeURIComponent(document.getElementById('invite-url-text').textContent);
        const text = encodeURIComponent('Присоединяйся к BlackBears Play');
        window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
    }
};

Object.assign(Friends, {
    _renderInvitations() {
        const list = this._el('invitationsList', 'invitations-list');
        if (!list) return;

        const activeInvitations = (this.cache.invitations || []).filter(inv => !inv.is_used);
        list.innerHTML = '';

        if (activeInvitations.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Нет активных приглашений</p>';
            return;
        }

        activeInvitations.forEach(inv => {
            const statusClass = inv.is_expired ? 'expired' : 'active';
            const statusText = inv.is_expired ? 'Истекло' : 'Активно';
            const el = document.createElement('div');
            el.className = 'invite-item';
            el.innerHTML = `
                <div class="friend-avatar">${this._getInvitationAvatarHTML(inv)}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.85rem;">${inv.friend_login ? 'Гость: ' + inv.friend_login : 'Ссылка'}</div>
                    <div class="invite-url">${inv.invite_url}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">
                        Действует до: ${new Date(inv.expires_at).toLocaleDateString('ru-RU')}
                    </div>
                </div>
                <span class="invite-status ${statusClass}">${statusText}</span>
                ${!inv.is_expired ? `<button class="btn btn-danger btn-revoke btn-icon-only" title="Удалить приглашение" aria-label="Удалить приглашение"><img src="./ui%20kit/icon/bulk/trash.svg" alt="" class="inline-action-icon"></button>` : ''}
            `;
            list.appendChild(el);
        });

        list.querySelectorAll('.btn-revoke').forEach(btn => {
            btn.addEventListener('click', () => this._revokeInvite(btn.closest('.invite-item').querySelector('.invite-url').textContent.trim()));
        });
    },

    _getFriendAvatarHTML(friend) {
        if (friend.avatar_type === 'custom' && friend.avatar) {
            return `<img src="${friend.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`;
        }

        if (friend.avatar_type === 'preset' && friend.avatar && friend.avatar !== 'BB') {
            return friend.avatar;
        }

        return '🐻';
    },

    _getInvitationAvatarHTML(inv) {
        return inv.friend_login
            ? this._getFriendAvatarHTML(inv)
            : '<img src="./ui%20kit/icon/bulk/link.svg" alt="" class="inline-action-icon">';
    },

    _getFriendPlayStatus(friend) {
        const bookings = Array.isArray(friend.active_bookings) ? friend.active_bookings : [];
        const now = new Date();

        const isPlaying = bookings.some((booking) => {
            const startDate = booking.start_date || booking.date || '';
            const startTime = (booking.start_time || booking.time || '').substring(0, 5);
            if (!startDate || !startTime) return false;

            const start = new Date(`${startDate}T${startTime}:00`);
            if (Number.isNaN(start.getTime())) return false;

            let end;
            if (booking.end_time) {
                end = new Date(`${startDate}T${String(booking.end_time).substring(0, 5)}:00`);
                if (end < start) end.setDate(end.getDate() + 1);
            } else {
                end = new Date(start.getTime() + (parseInt(booking.duration_min || booking.duration || 60, 10) || 60) * 60000);
            }

            return now >= start && now < end;
        });

        return {
            icon: '',
            text: isPlaying ? 'Играет' : 'Не играет',
            color: isPlaying ? '#22c55e' : '#94a3b8',
            details: ''
        };
    }
});


