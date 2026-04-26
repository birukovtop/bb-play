/**
 * BlackBears Play — Модуль профиля, баланса и истории бронирований
 */
const Profile = {

    _normalizeRankingIdentity(value) {
        return String(value ?? '').trim().toLowerCase();
    },

    _normalizeRankingEntries(payload) {
        const source = Array.isArray(payload)
            ? payload
            : (payload?.rankings || payload?.data || payload?.items || payload?.list || payload?.rows || []);

        return (Array.isArray(source) ? source : []).map((entry, index) => {
            const rank = parseInt(
                entry.rank
                ?? entry.place
                ?? entry.position
                ?? entry.sort
                ?? entry.row_number
                ?? (index + 1),
                10
            );

            return {
                rank: Number.isFinite(rank) ? rank : (index + 1),
                memberId: String(entry.member_id ?? entry.memberId ?? entry.id ?? ''),
                account: String(entry.member_account ?? entry.account ?? entry.login ?? entry.member_name ?? entry.name ?? ''),
                name: String(entry.member_name ?? entry.name ?? entry.account ?? entry.login ?? '—'),
                score: parseFloat(entry.points ?? entry.score ?? entry.total_points ?? entry.member_points ?? 0),
                spent: parseFloat(entry.spent ?? entry.total_spent ?? entry.amount ?? 0),
                visits: parseFloat(entry.visits ?? entry.total_visits ?? entry.visit_count ?? 0),
                hours: parseFloat(entry.hours ?? entry.total_hours ?? entry.play_hours ?? 0),
            };
        }).filter((entry) => entry.rank > 0);
    },

    _dedupeRankingEntries(entries) {
        const seen = new Map();

        entries.forEach((entry) => {
            const memberKey = this._normalizeRankingIdentity(entry.memberId)
                ? `member:${this._normalizeRankingIdentity(entry.memberId)}`
                : '';
            const accountKey = this._normalizeRankingIdentity(entry.account)
                ? `account:${this._normalizeRankingIdentity(entry.account)}`
                : '';
            const fallbackNameKey = !memberKey && !accountKey && this._normalizeRankingIdentity(entry.name)
                ? `name:${this._normalizeRankingIdentity(entry.name)}`
                : '';
            const keys = [memberKey, accountKey, fallbackNameKey].filter(Boolean);

            if (!keys.length) {
                seen.set(Symbol('ranking-entry'), { ...entry });
                return;
            }

            const existingKey = keys.find((key) => seen.has(key));
            const existingEntry = existingKey ? seen.get(existingKey) : null;
            const shouldReplace = !existingEntry
                || entry.rank < existingEntry.rank
                || (entry.rank === existingEntry.rank && entry.score > existingEntry.score);

            if (!shouldReplace) {
                return;
            }

            if (existingEntry) {
                for (const [key, value] of seen.entries()) {
                    if (value === existingEntry) {
                        seen.delete(key);
                    }
                }
            }

            const storedEntry = { ...entry };
            keys.forEach((key) => seen.set(key, storedEntry));
        });

        return Array.from(new Set(seen.values())).sort((a, b) => {
            if (a.rank !== b.rank) {
                return a.rank - b.rank;
            }
            return b.score - a.score;
        });
    },

    _isCurrentRankingEntry(entry, user = AppState.currentUser) {
        if (!entry || !user) return false;

        const entryMemberId = this._normalizeRankingIdentity(entry.memberId);
        const userMemberId = this._normalizeRankingIdentity(user.memberId);
        const entryAccount = this._normalizeRankingIdentity(entry.account);
        const userAccount = this._normalizeRankingIdentity(user.login);

        return (entryMemberId && userMemberId && entryMemberId === userMemberId)
            || (entryAccount && userAccount && entryAccount === userAccount);
    },

    async resolveCurrentRank(user = AppState.currentUser) {
        if (!user || !user.memberId) {
            return { topEntries: [], myEntry: null };
        }

        const cafeId = user.icafeId || AppState.cafes?.[0]?.icafe_id || '87375';
        const query = {
            memberId: user.memberId,
            account: user.login,
        };

        const firstPage = await API.getMemberRanking(cafeId, 1, 10, query);
        const topEntries = this._dedupeRankingEntries(this._normalizeRankingEntries(firstPage)).slice(0, 10);
        const topUserEntry = topEntries.find((entry) => this._isCurrentRankingEntry(entry, user)) || null;

        let myEntry = topUserEntry
            || this._normalizeRankingEntries(firstPage?.currentMember ? [firstPage.currentMember] : [])[0]
            || null;

        if (!myEntry) {
            const extendedPage = await API.getMemberRanking(cafeId, 1, 100, query);
            myEntry = this._normalizeRankingEntries(extendedPage?.currentMember ? [extendedPage.currentMember] : [])[0]
                || this._dedupeRankingEntries(this._normalizeRankingEntries(extendedPage))
                    .find((entry) => this._isCurrentRankingEntry(entry, user))
                || null;
        }

        if (myEntry) {
            if (Number.isFinite(myEntry.rank) && myEntry.rank > 0) {
                user.rank = myEntry.rank;
            }
            if (Number.isFinite(myEntry.score)) {
                user.points = myEntry.score;
            }
        }

        return { topEntries, myEntry };
    },

    async hydrateCurrentUser(options = {}) {
        const user = AppState.currentUser;
        if (!user || !user.icafeId || !user.memberId) {
            return user;
        }

        const {
            includeDetails = true,
            includeRealtime = true,
            includeRank = true,
            updateStatusBar = true,
            saveSession = true,
        } = options || {};

        const requests = [];

        if (includeDetails) {
            requests.push(API.getMemberDetails(user.icafeId, user.memberId));
        } else {
            requests.push(Promise.resolve(null));
        }

        if (includeRealtime) {
            requests.push(API.getRealtimeBalance(user.icafeId, user.memberId));
        } else {
            requests.push(Promise.resolve(null));
        }

        const [detailsResult, realtimeResult] = await Promise.allSettled(requests);

        if (detailsResult.status === 'fulfilled') {
            const details = detailsResult.value;
            const member = details?.member || details?.data?.member || details || null;

            if (member) {
                user.name = member.member_name || member.name || user.name;
                user.phone = member.member_phone || member.phone || user.phone || '';
                user.email = member.member_email || member.email || user.email || '';

                const liveDiscount = API.normalizeDiscount(
                    member.member_group_discount_rate ?? member.discount ?? null,
                    Number.isFinite(user.discount) ? user.discount : 0
                );
                if (Number.isFinite(liveDiscount)) {
                    user.discount = liveDiscount;
                }
            }
        }

        if (realtimeResult.status === 'fulfilled') {
            const realtime = realtimeResult.value;
            if (realtime) {
                user.balance = API.applyDemoBalance(user, realtime.balance ?? realtime.member_balance ?? user.balance ?? 0);
                user.bonusBalance = parseFloat(realtime.bonus_balance ?? realtime.bonusBalance ?? user.bonusBalance ?? 0);
                user.points = parseFloat(realtime.points ?? realtime.member_points ?? user.points ?? 0);
            }
        }

        if (includeRank) {
            try {
                await this.resolveCurrentRank(user);
            } catch (e) {
                console.warn('[Profile] rank refresh failed:', e);
            }
        }

        if (saveSession) {
            AppState.saveSession();
        }
        if (updateStatusBar) {
            UI.updateStatusBar();
        }

        return user;
    },

    async _refreshLiveProfile() {
        try {
            return await this.hydrateCurrentUser({
                includeDetails: true,
                includeRealtime: true,
                includeRank: true,
                updateStatusBar: true,
                saveSession: true,
            });
        } catch (e) {
            console.warn('[Profile] live refresh failed:', e);
        }

        return AppState.currentUser;
    },

    // ==========================================
    // Показать профиль
    // ==========================================
    async show(options = {}) {
        AppState.dialogScreen = 'profile';
        UI.clearDialog();

        const user = AppState.currentUser;
        const {
            skipRefresh = false,
        } = options || {};
        const displayName = user.name || user.login;
        const discountValue = Math.round((user.discount || 0) * 100);
        const balanceText = API.formatMoney(user.balance || 0);
        const avatarHTML = Avatar.getAvatarHTML('large');

        await UI.sayBarney(
            `${window.BBText?.t('profile.title', { name: displayName }, 'Вот твоя карта воина, {name}:')}

` +
            `${window.BBText?.t('profile.callsign', { login: user.login }, 'Позывной: {login}')}
` +
            `${window.BBText?.t('profile.displayName', { name: user.name || '?' }, 'Имя: {name}')}
` +
            `${window.BBText?.t('profile.balance', { balance: balanceText }, 'Баланс: {balance}')}
` +
            `${window.BBText?.t('profile.discount', { discount: discountValue }, 'Скидка: {discount}%')}
` +
            `${window.BBText?.t('profile.memberId', { memberId: user.memberId }, 'ID в системе: {memberId}')}`
        );

        UI.appendContent(`
            <div class="profile-card" style="margin-top:16px;cursor:pointer;" id="profile-avatar-card" title="${window.BBText?.t('profile.avatarHint', {}, 'Нажми чтобы сменить аватарку')}">
                <div style="display:flex;align-items:center;gap:12px;">
                    ${avatarHTML}
                    <div>
                        <div style="font-weight:700;font-size:1rem;">${displayName}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${window.BBText?.t('profile.avatarHint', {}, 'Нажми чтобы сменить аватарку')}</div>
                    </div>
                </div>
            </div>
        `);

        document.getElementById('profile-avatar-card')?.addEventListener('click', () => {
            UI.beginFlowTransition();
            Avatar.show();
        });

        const activeBookings = (user.bookings || []).filter((b) => b.status === 'active');
        if (activeBookings.length > 0) {
            UI.appendContent(`
                <div class="profile-card" style="margin-top:16px;">
                    <div style="font-weight:700;color:var(--gold);margin-bottom:8px;">${window.BBText?.t('profile.activeBookings', { count: activeBookings.length }, 'Активные брони ({count})')}</div>
                </div>
            `);
        }

        const textMode = AppState.settings.textMode || 'typing';
        UI.appendContent(`
            <div class="profile-card" style="margin-top:16px;">
                <div style="font-weight:700;color:var(--gold);margin-bottom:8px;">${window.BBText?.t('profile.settings', {}, 'Настройки')}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
                    <span style="font-size:0.9rem;color:var(--text-secondary);">${window.BBText?.t('profile.textSpeed', {}, 'Скорость текста Барни')}</span>
                    <div style="display:flex;gap:4px;">
                        <button class="text-mode-btn ${textMode === 'typing' ? 'active' : ''}" data-mode="typing">${window.BBText?.t('profile.typing', {}, 'Печать')}</button>
                        <button class="text-mode-btn ${textMode === 'instant' ? 'active' : ''}" data-mode="instant">${window.BBText?.t('profile.instant', {}, 'Мгновенно')}</button>
                    </div>
                </div>
            </div>
        `);

        document.querySelectorAll('.text-mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                AppState.settings.textMode = btn.dataset.mode;
                AppState.saveSettings();

                document.querySelectorAll('.text-mode-btn').forEach((b) => {
                    b.classList.toggle('active', b.dataset.mode === btn.dataset.mode);
                });
            });
        });

        UI.setActions([
            {
                label: window.BBText?.t('profile.sessions', {}, 'История сессий'),
                description: window.BBText?.t('profile.sessionsDesc', {}, 'Недавние игровые визиты'),
                iconPath: './ui%20kit/icon/bulk/game.svg',
                action: () => this.showSessions()
            },
            {
                label: window.BBText?.t('profile.logout', {}, 'Выйти'),
                description: window.BBText?.t('profile.logoutDesc', {}, 'Завершить текущую сессию'),
                iconPath: './ui%20kit/icon/bulk/logout.svg',
                danger: true,
                action: () => Auth.handleLogout()
            },
            {
                label: window.BBText?.t('common.mainMenu'),
                description: window.BBText?.t('common.backToMainMenu'),
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => Dialogs.mainMenu()
            },
        ]);

        if (!skipRefresh) {
            this._refreshLiveProfile().then(() => {
                if (AppState.dialogScreen === 'profile') {
                    this.show({ skipRefresh: true });
                }
            }).catch((e) => {
                console.warn('[Profile] background refresh failed:', e);
            });
        }
    },

    // ==========================================
    // Модалка пополнения
    // ==========================================
    _handleTopupModal() {
        UI.showModalTopup();
        UI.elements.btnCloseTopup.onclick = () => UI.hideModalTopup();
        UI.elements.btnTopupConfirm.onclick = async () => {
            await this._processTopup();
        };
    },

    // ==========================================
    // Обработка пополнения через API
    // ==========================================
    async _processTopup() {
        const amount = parseInt(UI.elements.topupAmount.value);

        if (!amount || amount < 10) {
            UI.showTopupError('Минимальная сумма — 10₽');
            return;
        }

        if (amount > 100000) {
            UI.showTopupError('Максимальная сумма — 100 000₽');
            return;
        }

        UI.elements.btnTopupConfirm.disabled = true;
        UI.elements.btnTopupConfirm.textContent = '⏳ Обработка...';

        try {
            const user = AppState.currentUser;
            const paymentMethod = UI.getTopupMethod ? UI.getTopupMethod() : 'card';
            const result = await API.topupBalance(user.login, amount, paymentMethod, user.balance || 0);

            // Обновляем баланс
            user.balance = parseFloat(result.balance ?? user.balance ?? 0);
            user.localBalanceOverride = user.balance;
            AppState.saveSession();
            UI.updateStatusBar();

            UI.hideModalTopup();

            // Показываем сообщение
            UI.clearDialog();
            await UI.sayBarney(CONFIG.randomPhrase('topupSuccess') + `\n\n` +
                `Пополнено: ${amount}₽\n` +
                `Текущий баланс: 🪙 ${user.balance}₽`
            );

            this._restoreScreen();

        } catch (e) {
            UI.showTopupError(e.message || 'Ошибка пополнения');
        } finally {
            UI.elements.btnTopupConfirm.disabled = false;
            UI.elements.btnTopupConfirm.textContent = window.BBText?.t('topup.confirm', {}, 'Пополнить');
        }
    },

    // ==========================================
    // Показать историю бронирований
    // ==========================================
    async showBookings() {
        AppState.dialogScreen = 'bookings';
        UI.clearDialog();

        const user = AppState.currentUser;

        await UI.sayBarney('Загружаю историю твоих сражений... ⏳');

        // 1. Свои брони из iCafeCloud
        let serverBookings = {};
        try {
            serverBookings = await API.getUserBookings(user.login);
        } catch (e) {
            console.warn('Не удалось загрузить брони с сервера:', e);
        }

        // 2. Брони для друзей (которые я сделал)
        console.log('[Bookings] currentUser:', user);
        console.log('[Bookings] user.login:', user?.login);
        let friendBookings = [];
        try {
            friendBookings = await API.getFriendBookings(user.login);
            console.log('[Bookings] Friend bookings loaded:', friendBookings.length, friendBookings);
        } catch (e) {
            console.warn('Не удалось загрузить брони для друзей:', e);
        }

        // 3. Брони которые сделали ДЛЯ МЕНЯ (от друзей)
        let receivedBookings = [];
        try {
            receivedBookings = await API.getFriendBookings(user.login, true);
            console.log('[Bookings] Received bookings loaded:', receivedBookings.length, receivedBookings);
        } catch (e) {
            console.warn('Не удалось загрузить полученные брони:', e);
        }

        // Парсим серверные брони
        const allBookings = [];
        Object.entries(serverBookings).forEach(([cafeId, bookings]) => {
            if (Array.isArray(bookings)) {
                bookings.forEach(b => {
                    const fromParts = b.product_available_date_local_from?.split(' ') || [];
                    const toParts = b.product_available_date_local_to?.split(' ') || [];

                    let status = b.status || 'active';
                    if (toParts[0] && toParts[1]) {
                        const endTime = new Date(toParts[0] + 'T' + toParts[1]);
                        endTime.setMinutes(endTime.getMinutes() + 30);
                        if (endTime < new Date()) {
                            status = 'completed';
                        }
                    }

                    // Получаем адрес клуба
                    const cafe = AppState.cafes?.find(c => c.icafe_id == cafeId);

                    allBookings.push({
                        cafeId,
                        cafeAddress: cafe ? cafe.address : (b.cafe_address || cafeId),
                        pcName: b.product_pc_name || '—',
                        pcArea: '',
                        date: fromParts[0] || '—',
                        time: fromParts[1] || '—',
                        endTime: toParts[1] || '—',
                        duration: b.product_mins || '—',
                        price: b.price || 0,
                        status: status,
                        member_offer_id: b.member_offer_id || 0,
                        bookingPassword: '',
                        friendLogin: null,
                        source: 'server'
                    });
                });
            }
        });

        // Добавляем брони для друзей
        friendBookings.forEach(fb => {
            const dateStr = fb.start_date || '';
            const timeStr = fb.start_time || '';
            const [h, m, s] = (timeStr || '00:00:00').split(':');
            const endMinutes = parseInt(h) * 60 + parseInt(m) + (parseInt(fb.duration_min) || 60);
            const endH = Math.floor(endMinutes / 60) % 24;
            const endM = endMinutes % 60;
            const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

            const cafe = AppState.cafes?.find(c => c.icafe_id == fb.icafe_id);
            const pcArea = fb.pc_name?.includes('VIP') ? 'VIP' : '';

            allBookings.push({
                cafeId: fb.icafe_id || '',
                cafeAddress: cafe ? cafe.address : (fb.icafe_id || '—'),
                pcName: fb.pc_name || '—',
                pcArea: pcArea,
                date: dateStr,
                time: timeStr,
                endTime: endTime,
                duration: fb.duration_min || '—',
                price: fb.price || 0,
                status: fb.status === 'active' ? 'active' : 'completed',
                member_offer_id: fb.member_offer_id || fb.id || 0,
                bookingPassword: fb.booking_password || '',
                friendLogin: fb.friend_login || null,
                friendBookingId: fb.id,
                source: 'friend'
            });
        });

        // Добавляем брони которые сделали ДЛЯ МЕНЯ
        receivedBookings.forEach(rb => {
            const dateStr = rb.start_date || '';
            const timeStr = rb.start_time || '';
            const [h, m] = (timeStr || '00:00:00').split(':');
            const endMinutes = parseInt(h) * 60 + parseInt(m) + (parseInt(rb.duration_min) || 60);
            const endH = Math.floor(endMinutes / 60) % 24;
            const endM = endMinutes % 60;
            const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

            const cafe = AppState.cafes?.find(c => c.icafe_id == rb.icafe_id);
            const pcArea = rb.pc_name?.includes('VIP') ? 'VIP' : '';

            allBookings.push({
                cafeId: rb.icafe_id || '',
                cafeAddress: cafe ? cafe.address : (rb.icafe_id || '—'),
                pcName: rb.pc_name || '—',
                pcArea: pcArea,
                date: dateStr,
                time: timeStr,
                endTime: endTime,
                duration: rb.duration_min || '—',
                price: rb.price || 0,
                status: rb.status === 'active' ? 'active' : 'completed',
                member_offer_id: rb.member_offer_id || rb.id || 0,
                bookingPassword: rb.booking_password || '',
                bookerLogin: rb.booker_login || null, // Кто забронировал для меня
                friendBookingId: rb.id,
                source: 'received' // Полученная бронь
            });
        });

        // Сортировка: активные сверху
        allBookings.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return 0;
        });

        if (allBookings.length === 0) {
            await UI.sayBarney(
                `У тебя пока нет бронирований, воин.\n\n` +
                `Самое время оформить бронь ПК и начать сражение!`
            );

            UI.setActions([
                { label: 'Бронь ПК', description: 'Перейти к новой броне', iconPath: './ui%20kit/icon/bulk/ticket.svg', primary: true, action: () => Booking.start() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
            return;
        }

        await UI.sayBarney(window.BBText?.t('profile.localSessionsFound', { count: allBookings.length }));

        let html = '<div class="booking-history">';

        allBookings.forEach((b, idx) => {
            const dateRu = b.date ? b.date.split('-').reverse().join('.') : '—';
            const isActive = b.status === 'active';
            const isFriend = b.source === 'friend';
            const isReceived = b.source === 'received';

            html += `
                <div class="booking-item" data-booking-idx="${idx}">
                    <div class="booking-item-header">
                        <span class="booking-pc">${(b.pcName || '').replace('pc', 'ПК').replace('PC', 'ПК')}${b.pcArea ? ` (${b.pcArea})` : ''}</span>
                        <span class="booking-status">${isActive ? 'Активна' : 'Завершена'}</span>
                    </div>
                    <div class="booking-details-text">
                        ${isFriend ? `Забронировано для: <strong>${b.friendLogin}</strong><br>` : ''}
                        ${isReceived ? `Забронировано для тебя (от <strong>${b.bookerLogin}</strong>)<br>` : ''}
                        Клуб: ${b.cafeAddress || '—'}<br>
                        Дата: ${dateRu} в ${b.time || '—'} — ${(b.endTime || '00:00').substring(0, 5)}<br>
                        Длительность: ${b.duration} мин
                        ${b.price ? `<br>Цена: ${b.price}₽` : ''}
                        ${b.bookingPassword ? `<br>Пароль: <strong>${b.bookingPassword}</strong>` : ''}
                    </div>
                    ${isActive ? `<div style="margin-top:8px;">
                        <button class="btn btn-danger btn-cancel-booking"
                                data-member-offer-id="${b.member_offer_id}"
                                data-cafe-id="${b.cafeId}"
                                data-pc="${b.pcName}"
                                data-friend-booking-id="${b.friendBookingId || ''}"
                                style="padding:6px 14px;font-size:0.8rem;">
                            ❌ Отменить бронь
                        </button>
                    </div>` : ''}
                </div>
            `;
        });

        html += '</div>';
        UI.appendContent(html);

        // Обработчики кнопок отмены
        document.querySelectorAll('.btn-cancel-booking').forEach(btn => {
            btn.addEventListener('click', async () => {
                const friendBookingId = btn.dataset.friendBookingId;
                if (friendBookingId) {
                    // Отмена брони для друга (из БД)
                    await this._cancelFriendBooking(parseInt(friendBookingId));
                } else {
                    // Отмена обычной брони (через vibe)
                    await this._showCancelConfirmModal(
                        parseInt(btn.dataset.memberOfferId),
                        btn.dataset.cafeId,
                        btn.dataset.pc
                    );
                }
            });
        });

        UI.setActions([
            { label: 'Забронировать ещё', description: 'Открыть новый сценарий брони', iconPath: './ui%20kit/icon/bulk/ticket.svg', primary: true, action: () => Booking.start() },
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // Модалка подтверждения отмены брони
    // ==========================================
    _showCancelConfirmModal(memberOfferId, cafeId, pcName) {
        const pcDisplay = (pcName || '').replace('pc', 'ПК').replace('PC', 'ПК');
        const self = this;

        // Сброс
        UI.hideModalBookingConfirm();

        // Получаем элементы напрямую из DOM
        const modal = document.getElementById('modal-confirm-booking');
        const confirmBtn = document.getElementById('btn-booking-confirm');
        const cancelBtn = document.getElementById('btn-booking-cancel');
        const closeBtn = document.getElementById('btn-close-booking-confirm');
        
        const h3 = modal ? modal.querySelector('.modal-header h3') : null;
        if (h3) h3.textContent = 'Отмена бронирования';

        if (UI.elements.bookingDetails) {
            UI.elements.bookingDetails.innerHTML = `
                <div class="cancel-confirm-modal">
                    <div class="cancel-icon">BB</div>
                    <div class="cancel-pc-name">${pcDisplay}</div>
                    <div class="cancel-info"><p>Средства будут возвращены на ваш баланс</p></div>
                </div>`;
        }
        if (UI.elements.bookingConfirmError) UI.elements.bookingConfirmError.textContent = '';

        // Настраиваем стили
        if (confirmBtn) {
            confirmBtn.textContent = 'Отменить';
            confirmBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
            confirmBtn.style.border = '1px solid #991b1b';
            confirmBtn.style.color = '#fff';
        }
        if (cancelBtn) {
            cancelBtn.textContent = 'Назад';
            cancelBtn.style.background = 'rgba(255,255,255,0.1)';
            cancelBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            cancelBtn.style.color = '#ccc';
        }

        // Навешиваем обработчики — cloneNode + addEventListener
        if (confirmBtn) {
            const newConfirm = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
            newConfirm.addEventListener('click', async () => {
                UI.hideModalBookingConfirm();
                await self._performCancel(memberOfferId, cafeId, pcName);
            }, { once: false });
        }
        if (cancelBtn) {
            const newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            newCancel.addEventListener('click', () => UI.hideModalBookingConfirm(), { once: false });
        }
        if (closeBtn) {
            const newClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);
            newClose.addEventListener('click', () => UI.hideModalBookingConfirm(), { once: false });
        }

        // Показываем
        UI.elements.modalConfirmBooking.classList.remove('hidden');
    },

    // Выполнение отмены бронирования
    // ==========================================
    async _performCancel(memberOfferId, cafeId, pcName) {
        UI.clearDialog();
        await UI.sayBarney('Отменяю бронирование... ⏳');

        try {
            const user = AppState.currentUser;
            const pkgDeducted = AppState.bookingCtx?.packageDeducted || 0;
            const result = await API.cancelBooking(user.login, memberOfferId, cafeId, pcName, pkgDeducted);

            // Обновляем данные из vibe
            try {
                const vibeData = await API.getVibeProfile(user.login, user.icafeId);
                if (vibeData) {
                    user.balance = API.applyDemoBalance(user, vibeData.balance);
                    user.bonusBalance = vibeData.bonusBalance;
                    user.points = vibeData.points;
                    if (Number.isFinite(vibeData.discount)) {
                        user.discount = vibeData.discount;
                    }
                }
            } catch (e) {}

            AppState.saveSession();
            UI.updateStatusBar();

            await UI.sayBarney(
                `Бронь отменена! ❌\n\n` +
                `Баланс: ${user.balance}₽` +
                (result.icafe_cancelled ? `\n✅ Бронь отменена в системе клуба` : '')
            );

            // Перезагружаем список броней
            await this.showBookings();

        } catch (e) {
            await UI.sayBarney(
                `Не удалось отменить бронь.\n\n` +
                `Ошибка: ${e.message}`
            );

            UI.setActions([
                { label: 'Попробовать снова', description: 'Повторить загрузку списка', iconPath: './ui%20kit/icon/bulk/refresh.svg', primary: true, action: () => this.showBookings() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
        }
    },

    // ==========================================
    // Отмена брони для друга (из БД)
    // ==========================================
    async _cancelFriendBooking(bookingId) {
        if (!confirm('Отменить эту бронь?')) return;

        UI.clearDialog();
        await UI.sayBarney('Отменяю бронирование... ⏳');

        try {
            const user = AppState.currentUser;
            const friendBookings = await API.getFriendBookings(user.login);
            const receivedBookings = await API.getFriendBookings(user.login, true);
            const allFriendBookings = [...friendBookings, ...receivedBookings];
            const booking = allFriendBookings.find(fb => fb.id == bookingId);

            if (!booking) throw new Error('Бронь не найдена');

            // Сначала отменяем в vibe (деньги вернутся на баланс test1)
            const pcName = booking.pc_name || '';
            const cafeId = booking.icafe_id || '87375';

            try {
                await API.cancelBooking(user.login, booking.member_offer_id, cafeId, pcName);
            } catch (e) {
                console.warn('Не удалось отменить в vibe (возможно бронь уже удалена):', e.message);
                // Продолжаем — отменяем хотя бы в нашей БД
            }

            // Отменяем в БД
            await API.cancelFriendBooking(user.login, bookingId);

            // Обновляем баланс
            const cafes = AppState.cafes || [];
            const cId = booking.icafe_id || cafes[0]?.icafe_id || '87375';
            try {
                const membersData = await API._viaProxy('GET', '/api/v2/cafe/' + cId + '/members', {});
                const member = membersData?.members?.find(m => String(m.member_id) === String(user.memberId));
                if (member) {
                    user.balance = API.applyDemoBalance(user, member.member_balance || 0);
                }
            } catch (e) {
                console.warn('Не удалось обновить баланс:', e);
            }

            AppState.saveSession();
            UI.updateStatusBar();

            await UI.sayBarney(
                `Бронь отменена! ❌\n\n` +
                `Баланс: ${user.balance}₽`
            );

            await this.showBookings();

        } catch (e) {
            await UI.sayBarney(
                `Не удалось отменить бронь.\n\n` +
                `Ошибка: ${e.message}`
            );

            UI.setActions([
                { label: 'Попробовать снова', description: 'Повторить загрузку списка', iconPath: './ui%20kit/icon/bulk/refresh.svg', primary: true, action: () => this.showBookings() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
        }
    },

    // ==========================================
    // Восстановить экран после пополнения
    // ==========================================
    async _restoreScreen() {
        const screen = AppState.dialogScreen;
        switch (screen) {
            case 'profile': await this.show(); break;
            case 'bookings': await this.showBookings(); break;
            case 'sessions': await this.showSessions(); break;
            default: await Dialogs.mainMenu();
        }
    },

    // ==========================================
    // История сессий (из внешнего API клуба)
    // ==========================================
    async showSessions() {
        AppState.dialogScreen = 'sessions';
        UI.clearDialog();

        const user = AppState.currentUser;
        await UI.sayBarney(window.BBText?.t('profile.localSessionsLoading'));


        try {
            const allBookings = await API.getLocalSessionHistory(user.login);

            if (!allBookings.length) {
                await UI.sayBarney(window.BBText?.t('profile.localSessionsEmpty'));

                UI.setActions([
                    { label: window.BBText?.t('common.bookingPc'), description: window.BBText?.t('profile.bookPcDesc'), iconPath: './ui%20kit/icon/bulk/ticket.svg', primary: true, action: () => Booking.start() },
                    { label: window.BBText?.t('common.mainMenu'), description: window.BBText?.t('common.backToMainMenu'), iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
                ]);
                return;
            }

            let html = '<div class="booking-history">';
            allBookings.slice(0, 20).forEach((item) => {
                const dateValue = item.start_date || '';
                const timeValue = String(item.start_time || '').substring(0, 5);
                const dateLabel = dateValue ? dateValue.split('-').reverse().join('.') : '—';
                const from = [dateLabel, timeValue].filter(Boolean).join(' в ');
                const mins = parseInt(item.duration_min || 0, 10) || 0;
                const hours = Math.floor(mins / 60);
                const minsLeft = mins % 60;
                const durStr = hours > 0 ? `${hours}ч ${minsLeft > 0 ? minsLeft + 'м' : ''}` : `${mins}м`;
                const statusLabel = item.status === 'active' ? 'Активна' : (item.status === 'cancelled' ? 'Отменена' : 'Завершена');
                const pcName = String(item.pc_name || '').replace(/pc/ig, 'ПК') || '—';
                const subtitleText = item.subtitle ? `<br>${item.subtitle}` : '';
                const descriptionText = item.description ? `<br>${item.description}` : '';
                const priceText = item.price ? `<br>${window.BBText?.t('profile.sessionPrice')}: ${API.formatMoney(item.price)}` : '';
                const passwordText = item.booking_password ? `<br>${window.BBText?.t('profile.sessionPassword')}: <strong>${item.booking_password}</strong>` : '';

                html += `
                    <div class="booking-item">
                        <div class="booking-item-header">
                            <span class="booking-pc">${pcName}</span>
                            <span style="color:var(--neon-blue);font-size:0.8rem;">${statusLabel}</span>
                        </div>
                        <div class="booking-details-text">
                            ${item.title ? `<strong>${item.title}</strong><br>` : ''}
                            Дата: ${from || '—'}<br>
                            Длительность: ${durStr}${subtitleText}${descriptionText}${priceText}${passwordText}
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            await UI.sayBarney(window.BBText?.t('profile.localSessionsFound', { count: allBookings.length }));
            UI.appendContent(html);
        } catch (e) {
            await UI.sayBarney(window.BBText?.t('profile.localSessionsLoadError', { error: e.message }));
        }

        UI.setActions([
            { label: window.BBText?.t('common.mainMenu'), description: window.BBText?.t('common.backToMainMenu'), iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    async showAnalytics() {
        return this.showSessions();
    },

    async showWallet() {
        AppState.dialogScreen = 'wallet';
        UI.clearDialog();

        const user = AppState.currentUser;
        const balanceText = API.formatMoney(user.balance || 0);

        await UI.sayBarney(
            `${window.BBText?.t('wallet.title')}\n\n` +
            `${window.BBText?.t('wallet.balance', { balance: balanceText })}\n\n` +
            `${window.BBText?.t('wallet.question')}`
        );

        UI.setActions([
            {
                label: window.BBText?.t('wallet.topup'),
                description: window.BBText?.t('common.topupBalance'),
                iconPath: './ui%20kit/icon/bulk/wallet-add.svg',
                primary: true,
                action: () => this._handleTopupModal()
            },
            {
                label: window.BBText?.t('wallet.history'),
                description: window.BBText?.t('wallet.historyDesc'),
                iconPath: './ui%20kit/icon/bulk/receipt-1.svg',
                action: () => this.showBalanceHistory()
            },
            {
                label: window.BBText?.t('common.mainMenu'),
                description: window.BBText?.t('common.backToMainMenu'),
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => Dialogs.mainMenu()
            },
        ]);
    },


    // ==========================================
    // История баланса (из vibe API)
    // ==========================================
    async showBalanceHistory() {
        AppState.dialogScreen = 'balance_history';
        UI.clearDialog();

        const user = AppState.currentUser;

        await UI.sayBarney(window.BBText?.t('wallet.loadingHistory'));

        try {
            const history = await API.getBalanceHistory(user.icafeId, user.memberId, 1);
            const items = Array.isArray(history)
                ? history
                : (history?.items || history?.data || history?.list || []);

            if (!items || items.length === 0) {
                await UI.sayBarney(
                    window.BBText?.t(
                        'wallet.historyUnavailable',
                        { balance: API.formatMoney(user.balance || 0) },
                        ''
                    )
                );
            } else {
                let html = '<div class="history-table" style="max-height:300px;overflow-y:auto;margin-top:12px;">';
                html += '<table style="width:100%;font-size:0.8rem;"><thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Баланс</th></tr></thead><tbody>';

                for (const item of items.slice(0, 20)) {
                    const date = (item.created_at || item.date || '').substring(0, 16).replace('T', ' ');
                    const type = item.type || item.operation || item.description || '—';
                    const amount = parseFloat(item.amount || item.balance_change || 0);
                    const balance = parseFloat(item.balance || item.balance_after || 0);
                    const sign = amount >= 0 ? '+' : '';
                    const color = amount >= 0 ? 'var(--green)' : 'var(--red)';

                    html += `<tr><td>${date || '—'}</td><td>${type}</td><td style="color:${color}">${sign}${API.formatMoney(amount)}</td><td>${API.formatMoney(balance)}</td></tr>`;
                }

                html += '</tbody></table></div>';

                await UI.sayBarney(window.BBText?.t('wallet.latestOperations'));
                UI.appendContent(html);
            }
        } catch (e) {
            await UI.sayBarney(
                window.BBText?.t(
                    'wallet.historyUnavailable',
                    { balance: API.formatMoney(user.balance || 0) },
                    ''
                )
            );
        }

        UI.setActions([
            {
                label: window.BBText?.t('common.mainMenu'),
                description: window.BBText?.t('common.backToMainMenu'),
                iconPath: './ui%20kit/icon/bulk/home.svg',
                action: () => Dialogs.mainMenu()
            },
            {
                label: window.BBText?.t('wallet.backToWallet'),
                description: window.BBText?.t('wallet.backToWalletDesc'),
                iconPath: './ui%20kit/icon/bulk/wallet-3.svg',
                action: () => this.showWallet()
            },
        ]);
    },


    // ==========================================
    // История бонусов
    // ==========================================
    async showBonusHistory() {
        AppState.dialogScreen = 'bonus_history';
        UI.clearDialog();

        const user = AppState.currentUser;

        await UI.sayBarney(
            `Твои бонусы:\n\n` +
            `⭐ Баланс бонусов: ${user.bonusBalance || 0}₽\n\n` +
            `Бонусы начисляются при пополнении баланса.`
        );

        UI.setActions([
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // История очков
    // ==========================================
    async showPointsHistory() {
        AppState.dialogScreen = 'points_history';
        UI.clearDialog();

        const user = AppState.currentUser;

        await UI.sayBarney(
            `Твои очки опыта:\n\n` +
            `Очки: ${user.points || 0}\n\n` +
            `Очки начисляются за каждое бронирование.`
        );

        UI.setActions([
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },
};
