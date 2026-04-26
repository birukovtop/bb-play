/**
 * BlackBears Play - модуль диалогов главного экрана.
 */
const Dialogs = {
    vkFeed: {
        offset: 0,
        count: 15,
        isLoading: false,
        hasMore: true,
        seenPostIds: new Set(),
        observer: null,
        posts: []
    },
    _mainMenuHydrationPromise: null,
    _mainMenuHydrationLogin: null,
    _mainMenuHasFutureBookings: null,

    _buildMainMenuActions(hasFutureBookings = false) {
        const actions = [
            {
                label: window.BBText?.t('dialogs.mainMenu.bookPcLabel', {}, 'Бронь ПК'),
                description: window.BBText?.t('dialogs.mainMenu.bookPcDesc', {}, 'Выбрать клуб, время и место'),
                iconPath: './ui%20kit/icon/bulk/ticket.svg',
                primary: true,
                action: () => Booking.start()
            },
            {
                label: window.BBText?.t('dialogs.mainMenu.friendsLabel', {}, 'Друзья'),
                description: window.BBText?.t('dialogs.mainMenu.friendsDesc', {}, 'Заявки и приглашения'),
                iconPath: './ui%20kit/icon/bulk/profile-2user.svg',
                action: () => Friends.showScreen()
            },
            {
                label: window.BBText?.t('dialogs.mainMenu.newsLabel', {}, 'Новости'),
                description: window.BBText?.t('dialogs.mainMenu.newsDesc', {}, 'Обновления клуба'),
                iconPath: './ui%20kit/icon/bulk/document-text.svg',
                action: () => this.showNews()
            },
            {
                label: window.BBText?.t('dialogs.mainMenu.foodLabel', {}, 'Еда'),
                description: window.BBText?.t('dialogs.mainMenu.foodDesc', {}, 'Напитки и перекусы'),
                iconPath: './ui%20kit/icon/bulk/cup.svg',
                action: () => this.showFoodMenu()
            },
            {
                label: window.BBText?.t('dialogs.mainMenu.gamesLabel', {}, 'Игры'),
                description: window.BBText?.t('dialogs.mainMenu.gamesDesc', {}, 'Доступные игровые тайтлы'),
                iconPath: './ui%20kit/icon/bulk/game.svg',
                action: () => this.showGames()
            }
        ];

        if (hasFutureBookings) {
            actions.push({
                label: window.BBText?.t('dialogs.mainMenu.bookingsLabel', {}, 'Мои брони'),
                description: window.BBText?.t('dialogs.mainMenu.bookingsDesc', {}, 'Активные брони'),
                iconPath: './ui%20kit/icon/bulk/calendar-tick.svg',
                action: () => Profile.showBookings()
            });
        }

        actions.push({
            label: window.BBText?.t('dialogs.mainMenu.promosLabel', {}, 'Акции'),
            description: window.BBText?.t('dialogs.mainMenu.promosDesc', {}, 'Скидки и бонусы'),
            iconPath: './ui%20kit/icon/bulk/ticket-star.svg',
            action: () => this.showPromos()
        });
        actions.push({
            label: window.BBText?.t('dialogs.mainMenu.supportLabel', {}, 'Поддержка'),
            description: window.BBText?.t('dialogs.mainMenu.supportDesc', {}, 'Связь и помощь'),
            iconPath: './ui%20kit/icon/bulk/message-question.svg',
            action: () => Support.show()
        });

        return actions;
    },

    _getBookingEndDate(booking) {
        if (!booking) return null;

        if (booking.date && booking.endTime) {
            const explicitEnd = new Date(`${booking.date}T${booking.endTime}`);
            if (!Number.isNaN(explicitEnd.getTime())) {
                return explicitEnd;
            }
        }

        if (!booking.date || !booking.time) {
            return null;
        }

        const start = new Date(`${booking.date}T${booking.time}`);
        if (Number.isNaN(start.getTime())) {
            return null;
        }

        const duration = parseInt(booking.duration ?? 60, 10);
        start.setMinutes(start.getMinutes() + (Number.isFinite(duration) ? duration : 60));
        return start;
    },

    _isFutureBooking(booking, now = new Date()) {
        if (!booking) return false;
        if (booking.status && booking.status !== 'active') return false;

        const endDate = this._getBookingEndDate(booking);
        if (!endDate) {
            return true;
        }

        endDate.setMinutes(endDate.getMinutes() + 30);
        return endDate > now;
    },

    _hasFutureBookings(bookings = []) {
        if (!Array.isArray(bookings) || bookings.length === 0) {
            return false;
        }

        const now = new Date();
        return bookings.some((booking) => this._isFutureBooking(booking, now));
    },

    _normalizeServerBookings(serverBookings) {
        const normalized = [];

        Object.entries(serverBookings || {}).forEach(([cafeId, bookings]) => {
            if (!Array.isArray(bookings)) {
                return;
            }

            bookings.forEach((booking) => {
                const fromParts = booking.product_available_date_local_from?.split(' ') || [];
                const toParts = booking.product_available_date_local_to?.split(' ') || [];
                const duration = parseInt(booking.product_mins ?? booking.duration_min ?? 60, 10);
                const endDate = toParts[0] && toParts[1] ? new Date(`${toParts[0]}T${toParts[1]}`) : null;

                let status = booking.status || 'active';
                if (endDate && !Number.isNaN(endDate.getTime())) {
                    const withGrace = new Date(endDate.getTime());
                    withGrace.setMinutes(withGrace.getMinutes() + 30);
                    if (withGrace <= new Date()) {
                        status = 'completed';
                    }
                }

                const cafe = AppState.cafes?.find((item) => String(item.icafe_id) === String(cafeId));

                normalized.push({
                    cafeId,
                    cafeAddress: cafe?.address || booking.cafe_address || String(cafeId || '—'),
                    pcName: booking.product_pc_name || '—',
                    pcArea: '',
                    date: fromParts[0] || '',
                    time: fromParts[1] || '',
                    endTime: toParts[1] || '',
                    duration: Number.isFinite(duration) ? duration : 60,
                    price: parseFloat(booking.price || 0),
                    status,
                    member_offer_id: booking.member_offer_id || 0,
                    bookingPassword: '',
                    source: 'server'
                });
            });
        });

        return normalized.sort((a, b) => {
            const aEnd = this._getBookingEndDate(a)?.getTime() || 0;
            const bEnd = this._getBookingEndDate(b)?.getTime() || 0;
            return bEnd - aEnd;
        });
    },

    async _hydrateMainMenuBookings() {
        const user = AppState.currentUser;
        if (!user?.login) {
            return null;
        }

        const login = user.login;
        if (this._mainMenuHydrationPromise && this._mainMenuHydrationLogin === login) {
            return this._mainMenuHydrationPromise;
        }

        const previousHasFutureBookings = this._hasFutureBookings(user.bookings);
        this._mainMenuHydrationLogin = login;
        this._mainMenuHydrationPromise = API.getUserBookings(login)
            .then((serverBookings) => {
                if (!AppState.currentUser || AppState.currentUser.login !== login) {
                    return null;
                }

                const normalizedBookings = this._normalizeServerBookings(serverBookings);
                AppState.currentUser.bookings = normalizedBookings;
                AppState.saveSession();

                const nextHasFutureBookings = this._hasFutureBookings(normalizedBookings);
                this._mainMenuHasFutureBookings = nextHasFutureBookings;

                if (AppState.dialogScreen === 'main' && previousHasFutureBookings !== nextHasFutureBookings) {
                    UI.setActions(this._buildMainMenuActions(nextHasFutureBookings));
                }

                return normalizedBookings;
            })
            .catch(() => null)
            .finally(() => {
                if (this._mainMenuHydrationLogin === login) {
                    this._mainMenuHydrationPromise = null;
                    this._mainMenuHydrationLogin = null;
                }
            });

        return this._mainMenuHydrationPromise;
    },

    // ==========================================
    // Главное меню
    // ==========================================
    async mainMenu() {
        document.body.classList.remove('booking-mode');

        AppState.dialogScreen = 'main';
        UI.clearDialog();

        const user = AppState.currentUser;
        const greeting = CONFIG.randomPhrase('greeting');
        const hasFutureBookings = this._hasFutureBookings(user?.bookings);
        this._mainMenuHasFutureBookings = hasFutureBookings;

        await UI.sayBarney(greeting);
        UI.setActions(this._buildMainMenuActions(hasFutureBookings));
        this._hydrateMainMenuBookings();
    },

    // ==========================================
    // Пополнение баланса
    // ==========================================
    openTopupModal() {
        UI.showModalTopup();
        UI.elements.btnTopupConfirm.onclick = async () => {
            const amount = parseInt(UI.elements.topupAmount.value, 10);
            if (!amount || amount < 10) {
                UI.showTopupError(window.BBText?.t('topup.minAmount', {}, 'Минимальная сумма — 10₽'));
                return;
            }
            if (amount > 100000) {
                UI.showTopupError(window.BBText?.t('topup.maxAmount', {}, 'Максимальная сумма — 100 000₽'));
                return;
            }

            UI.elements.btnTopupConfirm.disabled = true;
            UI.elements.btnTopupConfirm.textContent = window.BBText?.t('topup.processing', {}, 'Обработка...');

            try {
                const user = AppState.currentUser;
                const paymentMethod = UI.getTopupMethod ? UI.getTopupMethod() : 'card';
                const result = await API.topupBalance(user.login, amount, paymentMethod, user.balance || 0);
                user.balance = parseFloat(result.balance ?? user.balance ?? 0);
                user.localBalanceOverride = user.balance;

                AppState.saveSession();
                UI.updateStatusBar();
                UI.hideModalTopup();

                UI.clearDialog();
                await UI.sayBarney(
                    CONFIG.randomPhrase('topupSuccess') +
                    `\n\nПополнено: ${amount}₽\nБаланс: ${user.balance}₽`
                );
                await Dialogs.mainMenu();
            } catch (e) {
                UI.showTopupError(e.message || window.BBText?.t('topup.error', {}, 'Ошибка пополнения'));
            } finally {
                UI.elements.btnTopupConfirm.disabled = false;
                UI.elements.btnTopupConfirm.textContent = window.BBText?.t('topup.confirm', {}, 'Пополнить');
            }
        };
    },

    // ==========================================
    // Приветствие нового пользователя
    // ==========================================
    async welcomeNewUser() {
        AppState.dialogScreen = 'main';
        UI.clearDialog();

        const user = AppState.currentUser;
        const balance = Math.floor(user.balance || 0);
        const bonusText = balance > 0 ? `\n\n${window.BBText?.t('dialogs.welcome.withBonus', { balance }, 'Бонус за приглашение: +{balance}₽ уже на счету.')}` : '';

        await UI.sayBarney(
            `${window.BBText?.t('dialogs.welcome.title', { name: user.name || user.login }, 'Добро пожаловать в ряды BlackBears, {name}.')}\n\n` +
            `${window.BBText?.t('dialogs.welcome.accountCreated', { balance }, 'Твой аккаунт создан. Баланс: {balance}₽.')}${bonusText}\n\n` +
            `${balance < 10
                ? window.BBText?.t('dialogs.welcome.topupAdvice', {}, 'Рекомендую сначала пополнить баланс, а потом уже идти в бой.')
                : window.BBText?.t('dialogs.welcome.readyToBook', {}, 'Можно сразу переходить к бронированию.')}`
        );

        UI.setActions([
            {
                label: window.BBText?.t('dialogs.welcome.topupActionLabel', {}, 'Пополнить баланс'),
                description: window.BBText?.t('dialogs.welcome.topupActionDesc', {}, 'Добавить средства перед бронью'),
                iconPath: './ui%20kit/icon/bulk/wallet-add.svg',
                primary: true,
                action: () => this.openTopupModal()
            },
            {
                label: window.BBText?.t('dialogs.welcome.bookingActionLabel', {}, 'Бронь ПК'),
                description: window.BBText?.t('dialogs.welcome.bookingActionDesc', {}, 'Сразу перейти к выбору клуба'),
                iconPath: './ui%20kit/icon/bulk/ticket.svg',
                action: () => Booking.start()
            },
            {
                label: window.BBText?.t('dialogs.welcome.newsActionLabel', {}, 'Новости'),
                description: window.BBText?.t('dialogs.welcome.newsActionDesc', {}, 'Посмотреть обновления и анонсы'),
                iconPath: './ui%20kit/icon/bulk/document-text.svg',
                action: () => this.showNews()
            },
            {
                label: window.BBText?.t('dialogs.welcome.supportActionLabel', {}, 'Поддержка'),
                description: window.BBText?.t('dialogs.welcome.supportActionDesc', {}, 'Помощь и связь с клубом'),
                iconPath: './ui%20kit/icon/bulk/message-question.svg',
                action: () => Support.show()
            }
        ]);
    },

    // ==========================================
    // Клубы
    // ==========================================
    async showClubs() {
        if (AppState.dialogScreen === 'clubs_loading') return;
        AppState.dialogScreen = 'clubs_loading';

        if (!AppState.cafes || AppState.cafes.length === 0) {
            AppState.cafes = await API.getCafes();
        }

        if (AppState.dialogScreen !== 'clubs_loading') return;
        AppState.dialogScreen = 'clubs';

        UI.clearDialog();
        await UI.sayBarney(window.BBText?.t('dialogs.clubs.intro', {}, 'Вот наши локации для игры. Выбери клуб, чтобы посмотреть подробности:'));

        let html = '<ul class="club-list">';
        AppState.cafes.forEach(cafe => {
            const address = cafe.address || window.BBText?.t('common.notSpecified', {}, 'Не указано');
            const details = this._getCafeDetails(cafe.icafe_id);
            html += `
                <li class="club-item" data-cafe-id="${cafe.icafe_id}">
                    <div class="club-icon">BB</div>
                    <div class="club-info">
                        <div class="club-address">${address}</div>
                        <div class="club-details">${details}</div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';

        UI.appendContent(html);

        document.querySelectorAll('.club-item').forEach(item => {
            item.addEventListener('click', () => {
                const cafeId = item.dataset.cafeId;
                const cafe = AppState.cafes.find(c => c.icafe_id == cafeId);
                if (cafe) this._showCafeDetail(cafe);
            });
        });

        UI.setActions([
            {
                label: window.BBText?.t('dialogs.clubs.backLabel', {}, 'Назад'),
                description: window.BBText?.t('dialogs.clubs.backDesc', {}, 'Вернуться в главное меню'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    // ==========================================
    // Детали клуба
    // ==========================================
    async _showCafeDetail(cafe) {
        UI.clearDialog();

        const details = this._getCafeDetails(cafe.icafe_id);

        let onlineInfo = '';
        try {
            const onlineData = await API.getOnlinePcList(cafe.icafe_id);
            if (onlineData) {
                const total = onlineData.total || onlineData.count || 0;
                const online = onlineData.online || onlineData.online_count || 0;
                const offline = total - online;
                onlineInfo = `\n\n${window.BBText?.t('dialogs.clubs.onlinePc', { count: online }, 'Онлайн: {count} ПК')}\n${window.BBText?.t('dialogs.clubs.offlinePc', { count: offline }, 'Оффлайн: {count} ПК')}`;
            }
        } catch (e) {
            // Дополнительный блок, не критичен.
        }

        await UI.sayBarney(
            `${cafe.address}\n\n${details}${onlineInfo}\n\n` +
            window.BBText?.t('dialogs.clubs.bookQuestion', {}, 'Хочешь забронировать ПК в этом клубе?')
        );

        UI.setActions([
            {
                label: window.BBText?.t('dialogs.clubs.bookHereLabel', {}, 'Забронировать здесь'),
                description: window.BBText?.t('dialogs.clubs.bookHereDesc', {}, 'Начать бронь для этого клуба'),
                iconPath: './ui%20kit/icon/bulk/ticket.svg',
                primary: true,
                action: () => Booking.start(cafe)
            },
            {
                label: window.BBText?.t('dialogs.clubs.toClubListLabel', {}, 'К списку клубов'),
                description: window.BBText?.t('dialogs.clubs.toClubListDesc', {}, 'Вернуться к выбору локации'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.showClubs()
            },
            {
                label: window.BBText?.t('common.mainMenu', {}, 'Главное меню'),
                description: window.BBText?.t('common.backToMainMenu', {}, 'Вернуться к основным разделам'),
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    _getCafeDetails(icafeId) {
        const details = {
            74922: '3 игровых зала • 30 ПК • Мониторы 250-280 Гц • Logitech, Dark Project, HyperX • DXRACER',
            76301: '6 игровых залов • 36 ПК • Мониторы 250-280 Гц • Logitech, Dark Project, HyperX • Knight, Zone 51, DXRACER',
        };
        return details[icafeId] || window.BBText?.t('dialogs.clubs.defaultCafeDetails', {}, 'Игровые ПК • Комфортные кресла • Быстрый интернет');
    },

    // ==========================================
    // Новости
    // ==========================================
    async showNews() {
        AppState.dialogScreen = 'news';
        UI.clearDialog();

        await UI.sayBarney(window.BBText?.t('dialogs.news.intro', {}, 'Секунду, читаю последние новости нашего VK-паблика...'));
        const groupSlug = CONFIG.vkGroupSlug || 'bbplay__tmb';
        this.vkFeed = {
            offset: 0,
            count: 10,
            isLoading: false,
            hasMore: true,
            seenPostIds: new Set(),
            observer: null,
            posts: []
        };
        UI.appendContent(`
            <div class="vk-news-shell">
                <div class="vk-post-list" id="vk-post-list"></div>
                <div class="vk-news-status" id="vk-news-status">${window.BBText?.t('dialogs.news.loading', {}, 'Загружаем новости...')}</div>
                <div class="vk-news-end hidden" id="vk-news-end">
                    <a class="btn btn-secondary" href="https://vk.com/${groupSlug}" target="_blank" rel="noopener">${window.BBText?.t('dialogs.news.openGroup', {}, 'Открыть группу ВКонтакте')}</a>
                </div>
                <div class="vk-news-fallback hidden" id="vk-news-fallback">
                    <p id="vk-news-fallback-text">${window.BBText?.t('dialogs.news.fallback', {}, 'Новости можно открыть прямо в VK-паблике.')}</p>
                    <a class="btn btn-secondary" href="https://vk.com/${groupSlug}" target="_blank" rel="noopener">${window.BBText?.t('dialogs.news.openPublic', {}, 'Открыть VK-паблик')}</a>
                </div>
            </div>
        `);
        await this._loadVkPosts();
        UI.setActions([
            {
                label: window.BBText?.t('dialogs.news.backLabel', {}, 'Назад'),
                description: window.BBText?.t('dialogs.news.backDesc', {}, 'Вернуться на предыдущий экран'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                className: 'news-back-action',
                action: () => this.mainMenu()
            }
        ]);
    },

    // ==========================================
    // Еда
    // ==========================================
    async _loadVkPosts() {
        const state = this.vkFeed;
        if (state.isLoading || !state.hasMore) return;
        state.isLoading = true;
        const status = document.getElementById('vk-news-status');
        const endLink = document.getElementById('vk-news-end');
        if (status) status.textContent = state.offset === 0
            ? window.BBText?.t('dialogs.news.loading', {}, 'Загружаем новости...')
            : window.BBText?.t('dialogs.news.loadingMore', {}, 'Загружаем еще...');
        endLink?.classList.add('hidden');

        try {
            const data = await API.getVkPosts(state.offset, state.count);
            const posts = Array.isArray(data.posts) ? data.posts : [];
            const fresh = posts.filter(post => {
                const key = `${post.owner_id}_${post.id}`;
                if (state.seenPostIds.has(key)) return false;
                state.seenPostIds.add(key);
                return true;
            });
            state.posts.push(...fresh);
            state.offset = Number.isFinite(parseInt(data.next_offset, 10)) ? parseInt(data.next_offset, 10) : state.offset + posts.length;
            state.hasMore = Boolean(data.has_more) && posts.length > 0;
            this._renderVkPosts();
            if (!state.posts.length) {
                this._showVkFallback(data.fallback_reason);
            } else if (!fresh.length && state.hasMore) {
                setTimeout(() => this._loadVkPosts(), 0);
            } else if (status) {
                status.textContent = '';
                if (!state.hasMore) endLink?.classList.remove('hidden');
            }
        } catch (e) {
            console.warn('VK feed error:', e);
            this._showVkFallback();
        } finally {
            state.isLoading = false;
        }
    },

    _renderVkPosts() {
        const list = document.getElementById('vk-post-list');
        if (!list) return;
        list.innerHTML = this.vkFeed.posts.map(post => this._renderVkPost(post)).join('');
        this._bindVkObserver();
    },

    _renderVkPost(post) {
        const date = post.date
            ? new Date(post.date * 1000).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
            : (post.date_label || '');
        const text = this._escape(post.text || '').replace(/\n/g, '<br>');
        const photos = (post.attachments || []).filter(item => item.type === 'photo').slice(0, 6);
        const links = (post.attachments || []).filter(item => item.type === 'link');
        return `
            <article class="vk-post-card" data-vk-post="${post.owner_id}_${post.id}">
                <a class="vk-post-card-link" href="${this._escapeAttr(post.url)}" target="_blank" rel="noopener" aria-label="${this._escapeAttr(window.BBText?.t('dialogs.news.openPostAria', {}, 'Открыть пост ВКонтакте'))}">
                <div class="vk-post-date">${date}</div>
                ${text ? `<div class="vk-post-text">${text}</div>` : ''}
                ${photos.length ? `<div class="vk-post-media">${photos.map(photo => `<img src="${this._escapeAttr(photo.url)}" alt="" loading="lazy">`).join('')}</div>` : ''}
                ${links.length ? `<div class="vk-post-links">${links.map(link => `<div class="vk-post-link-row">${this._escape(link.title || link.caption || link.url)}</div>`).join('')}</div>` : ''}
                </a>
            </article>
        `;
    },

    _bindVkObserver() {
        const state = this.vkFeed;
        if (state.observer) state.observer.disconnect();
        if (!state.hasMore) return;
        const cards = Array.from(document.querySelectorAll('.vk-post-card'));
        const target = cards[Math.max(0, cards.length - 2)];
        if (!target) return;
        state.observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                this._loadVkPosts();
            }
        }, { root: null, rootMargin: '180px 0px', threshold: 0.1 });
        state.observer.observe(target);
    },

    _showVkFallback(reason = '') {
        const status = document.getElementById('vk-news-status');
        const fallback = document.getElementById('vk-news-fallback');
        const text = document.getElementById('vk-news-fallback-text');
        document.getElementById('vk-news-end')?.classList.add('hidden');
        if (status) status.textContent = '';
        if (text) {
            const messages = {
                network_unavailable: window.BBText?.t('dialogs.news.networkUnavailable', {}, 'Сервер не может подключиться к VK. Открой паблик напрямую.'),
                parser_unavailable: window.BBText?.t('dialogs.news.parserUnavailable', {}, 'VK изменил разметку ленты. Открой паблик напрямую.'),
            };
            text.textContent = messages[reason] || window.BBText?.t('dialogs.news.genericFallback', {}, 'Не получилось загрузить посты автоматически. Открой новости прямо в паблике.');
        }
        fallback?.classList.remove('hidden');
    },

    _escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },

    _escapeAttr(value) {
        return this._escape(value).replace(/`/g, '&#96;');
    },

    async showFoodMenu() {
        if (typeof Orders !== 'undefined') {
            return Orders.showFoodMenu();
        }
        AppState.dialogScreen = 'food';
        UI.clearDialog();

        await UI.sayBarney(window.BBText?.t('dialogs.food.intro', {}, 'Вот наше меню. Выбирай, что взять во время игры:'));

        let html = '';
        for (const [category, items] of Object.entries(CATALOG.food)) {
            html += `<div class="catalog-section"><h4 class="catalog-section-title">${category}</h4>`;
            html += `<table class="catalog-table"><thead><tr><th>${window.BBText?.t('dialogs.food.tableName', {}, 'Название')}</th><th>${window.BBText?.t('dialogs.food.tableSize', {}, 'Объём')}</th><th>${window.BBText?.t('dialogs.food.tablePrice', {}, 'Цена')}</th></tr></thead><tbody>`;
            items.forEach(item => {
                html += `<tr><td>${item.name}</td><td>${item.size}</td><td class="catalog-price">${item.price}₽</td></tr>`;
            });
            html += '</tbody></table></div>';
        }

        UI.appendContent(html);
        UI.setActions([
            {
                label: window.BBText?.t('dialogs.food.backLabel', {}, 'Назад'),
                description: window.BBText?.t('dialogs.food.backDesc', {}, 'Вернуться на предыдущий экран'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    // ==========================================
    // Игры
    // ==========================================
    async showGames() {
        AppState.dialogScreen = 'games';
        UI.clearDialog();

        await UI.sayBarney(window.BBText?.t('dialogs.games.intro', { count: CATALOG.games.length }, 'У нас установлено {count} игр. Все доступны на любом ПК:'));
        const gamesHtml = `
            <div class="games-grid">
                ${CATALOG.games.map((game) => {
                    const name = typeof game === 'string' ? game : game.name;
                    const icon = typeof game === 'string' ? './ui%20kit/icon/bulk/game.svg' : game.icon;
                    return `
                        <div class="game-card">
                            <img class="game-icon" src="${icon}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./ui%20kit/icon/bulk/game.svg';">
                            <span class="game-name">${name}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        UI.appendContent(gamesHtml);
        UI.setActions([
            {
                label: window.BBText?.t('dialogs.games.backLabel', {}, 'Назад'),
                description: window.BBText?.t('dialogs.games.backDesc', {}, 'Вернуться на предыдущий экран'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
        return;

        await UI.sayBarney(`У нас установлено ${CATALOG.games.length} игр. Все доступны на любом ПК:`);

        let html = '<div class="games-grid">';
        CATALOG.games.forEach(game => {
            html += `<div class="game-card"><span class="game-emoji">BB</span><span class="game-name">${game}</span></div>`;
        });
        html += '</div>';

        UI.appendContent(html);
        UI.setActions([
            {
                label: 'Назад',
                description: 'Вернуться на предыдущий экран',
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    // ==========================================
    // Акции
    // ==========================================
    async showPromos() {
        AppState.dialogScreen = 'promos';
        UI.clearDialog();

        await UI.sayBarney(window.BBText?.t('dialogs.promos.intro', {}, 'У нас есть несколько акций. Выбирай подходящую:'));

        let html = '<div class="promos-list">';
        CATALOG.promos.forEach(promo => {
            html += `
                <div class="promo-card">
                    <div class="promo-icon">
                        <img src="${promo.iconPath}" alt="" class="promo-icon-image">
                    </div>
                    <div class="promo-content">
                        <h4>${promo.title}</h4>
                        <p class="promo-desc">${promo.description}</p>
                        <p class="promo-details">${promo.details}</p>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        UI.appendContent(html);
        UI.setActions([
            {
                label: window.BBText?.t('dialogs.promos.backLabel', {}, 'Назад'),
                description: window.BBText?.t('dialogs.promos.backDesc', {}, 'Вернуться в главное меню'),
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    _getDemoNews() {
        return [
            {
                date: '5 апреля 2026',
                text: 'Конкурс ВАЙБКОД. Участвуй и выиграй бесплатные часы игры. Подробности в нашем VK-паблике.'
            },
            {
                date: '3 апреля 2026',
                text: 'Обновление в GameZone. Новые мониторы 280 Гц уже установлены на Советской 121.'
            },
            {
                date: '1 апреля 2026',
                text: 'Ночной тариф действует с 23:00 до 08:00 — скидка 20% на все зоны.'
            },
            {
                date: '28 марта 2026',
                text: 'Барни напоминает: бронируй ПК заранее, чтобы не ждать в очереди в выходные.'
            }
        ];
    },

    // ==========================================
    // Рейтинг
    // ==========================================
    async showRanking() {
        AppState.dialogScreen = 'ranking';
        UI.clearDialog();

        const user = AppState.currentUser;
        await UI.sayBarney(window.BBText?.t('ranking.loading'));

        try {
            const rankingState = await Profile.resolveCurrentRank(user);
            const topEntries = rankingState?.topEntries || [];
            let myEntry = rankingState?.myEntry || null;

            if (myEntry) {
                AppState.saveSession();
                UI.updateStatusBar();
            } else {
                myEntry = {
                    rank: null,
                    memberId: String(user.memberId || ''),
                    account: String(user.login || ''),
                    name: String(user.name || user.login || 'Ты'),
                    score: parseFloat(user.points || 0),
                    spent: 0,
                    visits: Array.isArray(user.bookings) ? user.bookings.length : 0,
                    hours: 0,
                    isFallbackSelf: true
                };
            }
            const userInTop = topEntries.some((entry) => Profile._isCurrentRankingEntry(entry, user));

            if (!topEntries.length) {
                const bookings = user.bookings || [];
                if (!bookings.length) {
                    await UI.sayBarney(window.BBText?.t('ranking.empty'));
                    UI.appendContent(`
                        <div class="booking-history">
                            <div class="booking-item" style="border-color:var(--gold);background:var(--gold-glow);">
                                <div class="booking-item-header">
                                    <span class="booking-pc">Ты: ${myEntry.name}</span>
                                    <span style="color:var(--gold);">место уточняется</span>
                                </div>
                                <div class="booking-details-text">${myEntry.score || 0} очков • 0 визитов</div>
                            </div>
                        </div>
                    `);
                    UI.setActions([
                        {
                            label: window.BBText?.t('common.booking'),
                            description: 'Перейти к новому бронированию',
                            iconPath: './ui%20kit/icon/bulk/ticket.svg',
                            primary: true,
                            action: () => Booking.start()
                        },
                        {
                            label: 'Назад',
                            description: 'Вернуться на предыдущий экран',
                            iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                            action: () => this.mainMenu()
                        }
                    ]);
                    return;
                }

                const sorted = [...bookings].sort((a, b) => (b.price || 0) - (a.price || 0));
                let fallbackHtml = '<div class="booking-history">';
                sorted.slice(0, 5).forEach((booking, index) => {
                    fallbackHtml += `
                        <div class="booking-item" style="${index === 0 ? 'border-color:var(--gold);' : ''}">
                            <div class="booking-item-header">
                                <span class="booking-pc">#${index + 1} ${(booking.pcName || '').replace('pc', 'ПК').replace('PC', 'ПК')}</span>
                                <span style="color:var(--gold);">${booking.duration || 0} мин</span>
                            </div>
                            <div class="booking-details-text">${booking.date || '—'} ${booking.time || ''}</div>
                        </div>
                    `;
                });
                fallbackHtml += '</div>';
                await UI.sayBarney(window.BBText?.t('ranking.fallbackTop'));
                UI.appendContent(fallbackHtml);
            } else {
                let html = '<div class="booking-history">';
                topEntries.forEach((entry) => {
                    const isMe = Profile._isCurrentRankingEntry(entry, user);
                    html += `
                        <div class="booking-item" style="${isMe ? 'border-color:var(--gold);background:var(--gold-glow);' : ''}">
                            <div class="booking-item-header">
                                <span class="booking-pc">#${entry.rank} ${entry.name}</span>
                                <span style="color:var(--gold);">${entry.visits || 0} визитов</span>
                            </div>
                            <div class="booking-details-text">
                                ${entry.score || 0} очков
                            </div>
                        </div>
                    `;
                });

                if (myEntry && !userInTop) {
                    html += `
                        <div class="booking-item" style="border-color:var(--gold);background:var(--gold-glow);margin-top:10px;">
                            <div class="booking-item-header">
                                <span class="booking-pc">Ты: ${myEntry.name}</span>
                                <span style="color:var(--gold);">${myEntry.rank ? `#${myEntry.rank}` : 'место уточняется'}</span>
                            </div>
                            <div class="booking-details-text">${myEntry.score || 0} очков • ${myEntry.visits || 0} визитов</div>
                        </div>
                    `;
                }

                html += '</div>';
                await UI.sayBarney(window.BBText?.t('ranking.top10'));
                UI.appendContent(html);
            }
        } catch (e) {
            await UI.sayBarney(window.BBText?.t('ranking.loadError'));
        }

        UI.setActions([
            {
                label: 'Назад',
                description: 'Вернуться на предыдущий экран',
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => this.mainMenu()
            }
        ]);
    },

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

