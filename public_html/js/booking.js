/**
 * BlackBears Play — Модуль бронирования (объединённый квест)
 * Полный путь: клуб → единый экран (дата + время + тарифы) → выбор ПК → оплата
 */
const Booking = {
    _icon(name, className = '') {
        const classes = ['booking-ui-icon', className].filter(Boolean).join(' ');
        return `<img src="./ui%20kit/icon/bulk/${name}.svg" alt="" class="${classes}" aria-hidden="true">`;
    },

    // ==========================================
    // Начать квест бронирования (MODERN — сразу единый экран)
    // ==========================================
    async start(preselectedCafe = null) {
        AppState.resetBookingCtx();
        AppState.bookingCtx.bookingFor = 'self';
        AppState.bookingCtx.selectedFriend = null;
        AppState.bookingCtx.selectedFriends = [];
        AppState.bookingCtx.tariffType = 'hourly';

        // Сразу на единый экран — клуб выберется автоматически (первый)
        await this._stepUnified(preselectedCafe);
    },

    // ==========================================
    // Начать бронирование для друга
    // ==========================================
    async startForFriend(friend) {
        AppState.resetBookingCtx();
        AppState.bookingCtx.bookingFor = 'friend';
        AppState.bookingCtx.selectedFriend = friend;
        AppState.bookingCtx.selectedFriends = [];
        AppState.bookingCtx.tariffType = 'hourly';

        await this._stepCafe();
    },

    // ==========================================
    // Начать групповое бронирование
    // ==========================================
    async startForGroup(friends) {
        AppState.resetBookingCtx();
        AppState.bookingCtx.bookingFor = 'group';
        AppState.bookingCtx.selectedFriend = null;
        AppState.bookingCtx.selectedFriends = friends || [];
        AppState.bookingCtx.tariffType = 'hourly';

        await this._stepCafe();
    },

    // ==========================================
    // Шаг 1: Выбор клуба
    // ==========================================
    async _stepCafe() {
        AppState.bookingCtx.step = 1;
        UI.clearDialog();

        // Загружаем клубы если нужно
        if (!AppState.cafes || AppState.cafes.length === 0) {
            AppState.cafes = await API.getCafes();
        }

        await UI.sayBarney('Отлично! Сначала выбери локацию для битвы. В каком клубе будем играть?');

        let html = '<ul class="club-list">';
        AppState.cafes.forEach(cafe => {
            html += `
                <li class="club-item" data-cafe-id="${cafe.icafe_id}">
                    <div class="club-icon">${this._icon('building-3')}</div>
                    <div class="club-info">
                        <div class="club-address">${cafe.address}</div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';

        UI.appendContent(html);

        // Клик по клубу
        document.querySelectorAll('.club-item').forEach(item => {
            item.addEventListener('click', async () => {
                UI._stopTTS(); // Обрываем TTS при клике
                const cafeId = item.dataset.cafeId;
                const cafe = AppState.cafes.find(c => c.icafe_id == cafeId);
                if (cafe) {
                    AppState.bookingCtx.selectedCafe = cafe;
                    await Booking._stepUnified();
                }
            });
        });

        UI.setActions([
            { label: 'Назад', description: 'Вернуться на предыдущий шаг', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // Шаг 1 (MODERN): Единый экран — всё сразу (bbp style)
    // ==========================================
    async _stepUnified(preselectedCafe = null) {
        AppState.bookingCtx.step = 1;
        UI.clearDialog();

        // Включаем booking mode
        document.body.classList.add('booking-mode');

        const ctx = AppState.bookingCtx;

        // Если клуб не выбран — используем первый из списка
        if (preselectedCafe) {
            ctx.selectedCafe = preselectedCafe;
        } else if (!ctx.selectedCafe) {
            if (!AppState.cafes || AppState.cafes.length === 0) {
                AppState.cafes = await API.getCafes();
            }
            ctx.selectedCafe = AppState.cafes[0] || null;
        }

        const cafe = ctx.selectedCafe;
        if (!cafe || !cafe.icafe_id) {
            await UI.sayBarney('Не удалось загрузить список клубов для бронирования.\n\nПопробуй снова через пару секунд.');
            UI.setActions([
                {
                    label: 'Повторить',
                    description: 'Снова загрузить бронирование',
                    iconPath: './ui%20kit/icon/bulk/refresh.svg',
                    primary: true,
                    action: () => this.start(preselectedCafe)
                },
                {
                    label: 'Главное меню',
                    description: 'Вернуться к основным разделам',
                    iconPath: './ui%20kit/icon/bulk/home.svg',
                    action: () => Dialogs.mainMenu()
                }
            ]);
            return;
        }

        // Значения по умолчанию
        ctx.selectedDate = ctx.selectedDate || CONFIG.getDefaultDate();
        ctx.selectedTime = ctx.selectedTime || CONFIG.getDefaultTime();
        if (!ctx.selectedDuration) ctx.selectedDuration = 60;

        // Загружаем базовые данные клуба один раз, затем отдельным запросом доступность ПК
        try {
            const [roomsResult, prices] = await Promise.allSettled([
                API.getStructRooms(cafe.icafe_id),
                API.getAllPrices(cafe.icafe_id, AppState.currentUser.memberId, null, ctx.selectedDate)
            ]);

            ctx.rooms = (roomsResult.status === 'fulfilled' && roomsResult.value) ? (roomsResult.value.rooms || []) : [];
            ctx.prices = prices.status === 'fulfilled' ? this._normalizePrices(prices.value) : this._normalizePrices(this._getDefaultPrices(60));
            ctx.packageGroups = this._buildPackageGroups(ctx.prices.products || []);
            this._syncTariffState();
            await this._loadAvailablePCs();

        } catch (e) {
            console.warn('Ошибка загрузки данных:', e);
            ctx.rooms = [];
            ctx.prices = this._normalizePrices(this._getDefaultPrices(60));
            ctx.packageGroups = this._buildPackageGroups(ctx.prices.products || []);
            this._syncTariffState();
            ctx.availablePCs = [];
        }

        // Рендерим полный экран (клуб + тарифы + ПК)
        this._renderModernBooking();

        UI.setActions([
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // Рендер современного экрана бронирования (всё на одном экране)
    // ==========================================
    _renderModernBooking() {
        const ctx = AppState.bookingCtx;
        const cafe = ctx.selectedCafe;

        const existingContainer = document.querySelector('.booking-modern-container');

        // Форматируем дату для subtab
        const dateObj = new Date(ctx.selectedDate);
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const dayName = days[dateObj.getDay()];
        const dateStr = `${dayName}, ${dateObj.getDate().toString().padStart(2, '0')}.${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        const cafeAddressShort = this._shortCafeName(cafe.address);
        const tariffLabel = ctx.tariffType === 'package'
            ? (ctx.selectedPackageName || ctx.selectedPackageInfo?.name || 'Пакет')
            : `${ctx.selectedDuration} мин`;

        let html = '<div class="booking-modern-container bb-booking">';

        // --- Summary: клуб, дата, время, тариф ---
        html += `
            <div class="bb-booking-summary">
                <div class="bb-summary-item ${ctx.activeInlinePicker === 'cafe' ? 'bb-summary-item--open' : ''}">
                <button class="bb-summary-tile ${ctx.activeInlinePicker === 'cafe' ? 'is-active' : ''}" type="button" onclick="Booking.toggleInlinePicker('cafe')">
                    <span>Клуб</span>
                    <strong>${cafeAddressShort}</strong>
                </button>
                ${this._renderCafePicker()}
                </div>
                <div class="bb-summary-item ${ctx.activeInlinePicker === 'date' ? 'bb-summary-item--open' : ''}">
                <button class="bb-summary-tile ${ctx.activeInlinePicker === 'date' ? 'is-active' : ''}" type="button" onclick="Booking.openDatePicker()">
                    <span>Дата</span>
                    <strong>${dateStr}</strong>
                </button>
                </div>
                <div class="bb-summary-item ${ctx.activeInlinePicker === 'time' ? 'bb-summary-item--open' : ''}">
                <button class="bb-summary-tile ${ctx.activeInlinePicker === 'time' ? 'is-active' : ''}" type="button" onclick="Booking.openTimePicker()">
                    <span>Старт</span>
                    <strong>${ctx.selectedTime}</strong>
                </button>
                </div>
                <div class="bb-summary-item ${ctx.activeInlinePicker === 'tariff' ? 'bb-summary-item--open' : ''}">
                <button class="bb-summary-tile ${ctx.activeInlinePicker === 'tariff' ? 'is-active' : ''}" type="button" onclick="Booking.toggleInlinePicker('tariff')">
                    <span>Тариф</span>
                    <strong>${tariffLabel}</strong>
                </button>
                ${this._renderTariffPicker()}
                </div>
            </div>
        `;

        html += `
            <div class="bb-booking-content">
                <div class="bb-booking-map-wrap">
                    ${this._renderPCGrid()}
                </div>
                ${this._renderBookingFooter()}
            </div>
        `;

        html += `</div>`; // booking-modern-container

        if (existingContainer) {
            existingContainer.outerHTML = html;
        } else {
            UI.appendContent(html);
        }
        this._ensurePickerModals();
        this._bindInlinePickerCloser();
    },

    // ==========================================
    // Рендер сетки ПК (modern style)
    // ==========================================
    _renderPCGrid() {
        const ctx = AppState.bookingCtx;
        const rooms = this._bookingDisplayRooms();
        const loadingClass = ctx.isMapLoading ? ' is-loading' : '';
        const loadingText = ctx.mapLoadingText || window.BBText?.t('booking.loadingPcs', {}, 'Загружаем ПК...');
        const ownOverlap = ctx.ownBookingOverlap || null;
        const blockByOwnBooking = Boolean(ownOverlap);

        if (rooms.length === 0) {
            return `<div class="bb-club-map${loadingClass}" data-loading-text="${loadingText}"><p class="bb-empty">${window.BBText?.t('booking.noPcs', {}, 'Нет данных о ПК')}</p></div>`;
        }

        const zoneClasses = ['bb-zone-card--vertical', 'bb-zone-card--horizontal', 'bb-zone-card--vertical', 'bb-zone-card--horizontal'];
        const availableMap = new Map((ctx.availablePCs || []).map(pc => [pc.pc_name, pc]));

        return `
            <div class="bb-club-map${loadingClass}" data-loading-text="${loadingText}">
                <span class="bb-map-label bb-map-label--reception">${window.BBText?.t('booking.mapReception', {}, 'Ресепшен')}</span>
                <span class="bb-map-label bb-map-label--bar">${window.BBText?.t('booking.mapBar', {}, 'Бар / кофе')}</span>
                <div class="bb-map-zones">
                    ${rooms.map((room, roomIndex) => {
                        const zoneName = room.area_name || `Зона ${roomIndex + 1}`;
                        const pcs = Array.isArray(room.pcs_list) ? room.pcs_list : [];
                        const borderByZone = {
                            GameZone: 'rgba(205, 242, 54, .78)',
                            BootCamp: 'rgba(148, 163, 184, .62)',
                            VIP: 'rgba(205, 242, 54, .78)'
                        };
                        const border = borderByZone[zoneName] || room.color_border || 'rgba(37,231,255,.24)';
                        const isVertical = zoneClasses[roomIndex % zoneClasses.length] === 'bb-zone-card--vertical';
                        const pcRows = isVertical ? pcs.length : Math.ceil(pcs.length / 2);

                        return `
                            <div class="bb-zone-card ${zoneClasses[roomIndex % zoneClasses.length]}" style="border-color:${border}; --pc-count:${Math.max(pcs.length, 1)}; --pc-rows:${Math.max(pcRows, 1)};">
                                <div class="bb-zone-card__header">
                                    <span>${zoneName}</span>
                                </div>
                                <div class="bb-pc-grid">
                                    ${pcs.map(pc => {
                                        const available = availableMap.get(pc.pc_name);
                                        const pcData = available || { ...pc, pc_group_name: zoneName, pc_area_name: zoneName };
                                        const priceInfo = this._getPriceForBooking(pcData);
                                        const isBusy = !available;
                                        const isDisabled = blockByOwnBooking || (ctx.tariffType === 'package' && !priceInfo);
                                        const isActive = ctx.selectedPC?.pc_name === pc.pc_name;
                                        const classes = ['bb-desk'];
                                        if (isBusy) classes.push('is-busy');
                                        if (isDisabled) classes.push('is-disabled');
                                        if (isActive && !isBusy && !isDisabled) classes.push('is-active');
                                        const onclick = (!isBusy && !isDisabled) ? `onclick="Booking.selectPC('${pc.pc_name}','${zoneName}')"` : '';
                                        return `<button class="${classes.join(' ')}" type="button" data-pc="${pc.pc_name}" ${onclick}><span>${pc.pc_name}</span></button>`;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="bb-legend">
                    <span class="picked"><i></i>${window.BBText?.t('booking.legendPicked', {}, 'Выбрано')}</span>
                    <span><i></i>${window.BBText?.t('booking.legendFree', {}, 'Свободно')}</span>
                    <span class="busy"><i></i>${window.BBText?.t('booking.legendBusy', {}, 'Занято')}</span>
                </div>
            </div>
            ${ownOverlap ? this._renderOwnBookingNotice(ownOverlap) : ''}
            ${ctx.allPcsBusy ? this._renderAllBusyNotice() : ''}
        `;
    },

    _renderOwnBookingNotice(overlap) {
        const text = overlap.conflictsCount > 1
            ? (window.BBText?.t('booking.overlapInlineMultiple', {
                end: overlap.endTime,
            }) || `У тебя уже есть другие активные брони рядом с этим временем. Ближайший свободный старт — после ${overlap.endTime}.`)
            : (window.BBText?.t('booking.overlapInline', {
                pc: this._formatPcName(overlap.pcName),
                start: overlap.startTime,
                end: overlap.endTime,
            }) || `У тебя уже есть активная бронь на этот промежуток времени. Попробуй после ${overlap.endTime}.`);

        return `<div class="bb-booking-warning" role="status"><span>${text}</span><button class="bb-warning-action" type="button" onclick="Booking.applyRecommendedTime()">Подобрать</button></div>`;
    },

    _renderAllBusyNotice() {
        return `<div class="bb-booking-warning" role="status"><span>Все ПК забронированы, попробуй другое время.</span><button class="bb-warning-action" type="button" onclick="Booking.applyRecommendedTime()">Подобрать</button></div>`;
    },

    // ==========================================
    // Вспомогательные методы для современного бронирования
    // ==========================================

    _shortCafeName(address = '') {
        const parts = String(address || '').split(',');
        return (parts[1] || parts[0] || 'Клуб').trim();
    },

    _bookingDisplayRooms() {
        const ctx = AppState.bookingCtx;
        let rooms = Array.isArray(ctx.rooms) ? [...ctx.rooms] : [];

        if (!rooms.length && Array.isArray(ctx.availablePCs) && ctx.availablePCs.length) {
            const grouped = new Map();
            ctx.availablePCs.forEach(pc => {
                const zone = pc.pc_group_name || pc.pc_area_name || 'Зона';
                if (!grouped.has(zone)) grouped.set(zone, []);
                grouped.get(zone).push(pc);
            });
            rooms = [...grouped.entries()].map(([area_name, pcs_list]) => ({ area_name, pcs_list }));
        }

        const bootCampIndex = rooms.findIndex(room => room.area_name === 'BootCamp');
        const gameZoneIndex = rooms.findIndex(room => room.area_name === 'GameZone');
        if (bootCampIndex >= 0 && gameZoneIndex >= 0) {
            [rooms[bootCampIndex], rooms[gameZoneIndex]] = [rooms[gameZoneIndex], rooms[bootCampIndex]];
        }

        return rooms;
    },

    // Форматировать длительность (мин → "1ч", "2ч", "30м")
    _formatDuration(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0 && m === 0) return `${h}ч`;
        if (h > 0) return `${h}ч ${m}м`;
        return `${m}м`;
    },

    _formatPcName(pcName = '') {
        return String(pcName || 'ПК').replace(/^pc/i, 'ПК');
    },

    toggleInlinePicker(key) {
        const ctx = AppState.bookingCtx;
        ctx.activeInlinePicker = ctx.activeInlinePicker === key ? null : key;
        this._renderModernBooking();
    },

    _renderCafePicker() {
        if (AppState.bookingCtx.activeInlinePicker !== 'cafe') return '';
        const cafes = Array.isArray(AppState.cafes) ? AppState.cafes : [];
        return `
            <div class="bb-summary-dropdown">
                <div class="bb-summary-dropdown__title">Выбор клуба</div>
                <div class="bb-summary-dropdown__grid">
                    ${cafes.map(cafe => `
                        <button class="bb-summary-option ${String(cafe.icafe_id) === String(AppState.bookingCtx.selectedCafe?.icafe_id) ? 'is-active' : ''}" type="button" onclick="Booking.selectCafe('${cafe.icafe_id}')">
                            <strong>${this._shortCafeName(cafe.address)}</strong>
                            <span>${cafe.address}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    },

    _ensurePickerModals() {
        if (!document.getElementById('bb-date-picker-modal')) {
            const dateModal = document.createElement('div');
            dateModal.id = 'bb-date-picker-modal';
            dateModal.className = 'bb-picker-backdrop';
            dateModal.setAttribute('aria-hidden', 'true');
            document.body.appendChild(dateModal);
        }
        if (!document.getElementById('bb-time-picker-modal')) {
            const timeModal = document.createElement('div');
            timeModal.id = 'bb-time-picker-modal';
            timeModal.className = 'bb-picker-backdrop';
            timeModal.setAttribute('aria-hidden', 'true');
            document.body.appendChild(timeModal);
        }
    },

    closePickers() {
        const ctx = AppState.bookingCtx;
        ctx.activeInlinePicker = null;
        const dateModal = document.getElementById('bb-date-picker-modal');
        const timeModal = document.getElementById('bb-time-picker-modal');
        if (dateModal) {
            dateModal.classList.remove('is-open');
            dateModal.setAttribute('aria-hidden', 'true');
            dateModal.innerHTML = '';
        }
        if (timeModal) {
            timeModal.classList.remove('is-open');
            timeModal.setAttribute('aria-hidden', 'true');
            timeModal.innerHTML = '';
        }
        if (document.querySelector('.booking-modern-container')) {
            this._renderModernBooking();
        }
    },

    openDatePicker() {
        const ctx = AppState.bookingCtx;
        this._ensurePickerModals();
        ctx.pendingDate = ctx.selectedDate;
        ctx.pickerMonth = `${ctx.selectedDate.slice(0, 8)}01`;
        ctx.activeInlinePicker = 'date';
        this._renderDatePickerModal();
        const modal = document.getElementById('bb-date-picker-modal');
        if (modal) {
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
        }
        this._renderModernBooking();
    },

    openTimePicker() {
        const ctx = AppState.bookingCtx;
        this._ensurePickerModals();
        const minimumMinutes = this._minimumSelectableMinutes(ctx.selectedDate, 10);
        const selectedMinutes = this._timeToMinutes(ctx.selectedTime);
        if (selectedMinutes !== null && selectedMinutes < minimumMinutes) {
            const nextHour = String(Math.floor(minimumMinutes / 60)).padStart(2, '0');
            const nextMinute = String(minimumMinutes % 60).padStart(2, '0');
            ctx.selectedTime = `${nextHour}:${nextMinute}`;
        }
        ctx.pendingTime = ctx.selectedTime;
        ctx.pendingTimeMode = 'hour';
        ctx.activeInlinePicker = 'time';
        this._renderTimePickerModal();
        const modal = document.getElementById('bb-time-picker-modal');
        if (modal) {
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
        }
        this._renderModernBooking();
    },

    // Перезагрузить тарифы и ПК, перерендерить
    async _reloadDataAndRender() {
        this._setMapLoading(true, window.BBText?.t('booking.loadingPcsRefresh', {}, 'Обновляем ПК...'));
        try {
            this._syncTariffState();
            await this._loadAvailablePCs();
        } catch (e) {
            console.warn('Ошибка перезагрузки данных:', e);
        } finally {
            this._setMapLoading(false);
        }

        this._renderModernBooking();
    },

    async _loadAvailablePCs() {
        const ctx = AppState.bookingCtx;
        const mins = ctx.tariffType === 'package'
            ? Number(this._packageOfferForZone('default')?.duration || (ctx.packageGroups || []).find(group => group.name === ctx.selectedPackageName)?.duration || ctx.selectedDuration || 60)
            : Number(ctx.selectedDuration || 60);

        const [pcsResult, ownOverlap] = await Promise.all([
            API.getAvailablePCs(
                ctx.selectedCafe.icafe_id,
                ctx.selectedDate,
                ctx.selectedTime,
                mins
            ),
            this._findOwnBookingOverlap(mins)
        ]);

        ctx.availablePCs = pcsResult?.pc_list || [];
        ctx.ownBookingOverlap = ownOverlap;
        ctx.allPcsBusy = !ownOverlap && Array.isArray(ctx.availablePCs) && ctx.availablePCs.length === 0;
        if (ownOverlap) {
            ctx.selectedPC = null;
            ctx.selectedPrice = null;
        }
    },

    _setMapLoading(isLoading, text = 'Загружаем ПК...') {
        const ctx = AppState.bookingCtx;
        ctx.isMapLoading = isLoading;
        ctx.mapLoadingText = text;
        const mapNode = document.querySelector('.bb-club-map');
        if (mapNode) {
            mapNode.classList.toggle('is-loading', isLoading);
            mapNode.setAttribute('data-loading-text', text);
        }
    },

    // Установить тариф
    async setTariff(type) {
        const ctx = AppState.bookingCtx;
        ctx.tariffType = type;
        ctx.activeInlinePicker = null;
        ctx.selectedPrice = null;
        ctx.selectedPC = null;
        ctx.ownBookingOverlap = null;

        if (type === 'hourly') {
            if (!ctx.selectedDuration) ctx.selectedDuration = 60;
            ctx.selectedPackageId = null;
            ctx.selectedPackageInfo = null;
            ctx.selectedPackageName = null;
        } else {
            const groups = ctx.packageGroups || [];
            if (groups.length > 0) {
                const pkg = groups[0];
                ctx.selectedPackageName = pkg.name;
                ctx.selectedDuration = pkg.duration || ctx.selectedDuration;
                ctx.selectedPackageId = null;
                ctx.selectedPackageInfo = {
                    name: pkg.name,
                    duration: ctx.selectedDuration
                };
            }
        }
        await this._reloadDataAndRender();
    },

    // Установить длительность
    async setDuration(mins) {
        AppState.bookingCtx.selectedDuration = mins;
        AppState.bookingCtx.tariffType = 'hourly';
        AppState.bookingCtx.activeInlinePicker = null;
        AppState.bookingCtx.selectedPrice = null;
        AppState.bookingCtx.selectedPC = null;
        AppState.bookingCtx.ownBookingOverlap = null;
        this._renderModernBooking();
        this._setMapLoading(true, window.BBText?.t('booking.loadingPcsRefresh', {}, 'Обновляем ПК...'));
        await this._reloadDataAndRender();
    },

    _renderTariffPicker() {
        const ctx = AppState.bookingCtx;
        if (ctx.activeInlinePicker !== 'tariff') {
            return '';
        }

        const hourlyOptions = this._getHourlyDurationOptions();
        const packageOptions = ctx.packageGroups || [];

        return `
            <div class="bb-summary-dropdown">
                <div class="bb-summary-dropdown__heading">Выбор тарифа</div>
                <div class="bb-summary-dropdown__section">
                    <div class="bb-summary-dropdown__title">Почасовые тарифы</div>
                    <div class="bb-summary-dropdown__chips">
                        ${hourlyOptions.map(option => `
                            <button class="bb-summary-chip ${ctx.tariffType === 'hourly' && ctx.selectedDuration === option.duration ? 'is-active' : ''}" type="button" onclick="Booking.setDuration(${option.duration})">
                                ${option.duration} мин
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="bb-summary-dropdown__section">
                    <div class="bb-summary-dropdown__title">Пакеты</div>
                    <div class="bb-summary-dropdown__chips">
                        ${packageOptions.length > 0 ? packageOptions.map(pkg => `
                            <button class="bb-summary-chip ${ctx.tariffType === 'package' && ctx.selectedPackageName === pkg.name ? 'is-active' : ''}" type="button" onclick="Booking.selectPackageByName('${String(pkg.name).replace(/'/g, "\\'")}')">
                                ${pkg.name || 'Пакет'}
                            </button>
                        `).join('') : '<div class="bb-summary-empty">Нет пакетов</div>'}
                    </div>
                </div>
            </div>
        `;
    },

    _getHourlyDurationOptions() {
        const prices = AppState.bookingCtx.prices?.prices || [];
        const durationMap = new Map();
        prices.forEach(p => {
            const duration = parseInt(p.duration_min || p.duration || 60);
            const price = parseFloat(p.total_price || p.price_price1 || 0);
            if (!durationMap.has(duration) || durationMap.get(duration) > price) {
                durationMap.set(duration, price);
            }
        });
        return [...durationMap.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([duration, price]) => ({ duration, price }));
    },

    async selectPackageByName(packageName) {
        const ctx = AppState.bookingCtx;
        const pkg = (ctx.packageGroups || []).find(item => item.name === packageName);
        if (!pkg) return;

        ctx.tariffType = 'package';
        ctx.selectedPackageName = pkg.name;
        ctx.selectedPackageId = null;
        ctx.selectedDuration = pkg.duration || ctx.selectedDuration;
        ctx.selectedPrice = null;
        ctx.selectedPC = null;
        ctx.ownBookingOverlap = null;
        ctx.selectedPackageInfo = {
            name: pkg.name,
            duration: ctx.selectedDuration
        };
        ctx.activeInlinePicker = null;
        this._renderModernBooking();
        this._setMapLoading(true, 'Обновляем ПК...');
        await this._reloadDataAndRender();
    },

    async selectCafe(cafeId) {
        const cafe = (AppState.cafes || []).find(item => String(item.icafe_id) === String(cafeId));
        if (!cafe) return;
        AppState.bookingCtx.selectedCafe = cafe;
        AppState.bookingCtx.selectedPC = null;
        AppState.bookingCtx.selectedPrice = null;
        AppState.bookingCtx.activeInlinePicker = null;
        AppState.bookingCtx.ownBookingOverlap = null;
        await this._reloadDataAndRender();
    },

    async selectDate(date) {
        AppState.bookingCtx.selectedDate = date;
        AppState.bookingCtx.selectedPC = null;
        AppState.bookingCtx.selectedPrice = null;
        AppState.bookingCtx.activeInlinePicker = null;
        AppState.bookingCtx.ownBookingOverlap = null;
        await this._reloadDataAndRender();
    },

    async selectTime(time) {
        if (this._isPastBookingTime(AppState.bookingCtx.selectedDate, time)) {
            return;
        }
        AppState.bookingCtx.selectedTime = time;
        AppState.bookingCtx.selectedPC = null;
        AppState.bookingCtx.selectedPrice = null;
        AppState.bookingCtx.activeInlinePicker = null;
        AppState.bookingCtx.ownBookingOverlap = null;
        await this._reloadDataAndRender();
    },

    _buildTimeSlots() {
        const times = [];
        const ctx = AppState.bookingCtx || {};
        const step = 10;
        const minMinutes = this._minimumSelectableMinutes(ctx.selectedDate, step);

        for (let minutes = minMinutes; minutes <= 23 * 60 + 50; minutes += step) {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
        return times;
    },

    _timeToMinutes(time) {
        const [hours, minutes] = String(time || '').split(':').map(Number);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        return hours * 60 + minutes;
    },

    _minimumSelectableMinutes(date, step = 10) {
        const selectedDate = String(date || '');
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        if (selectedDate !== today) {
            return 10 * 60;
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const roundedMinutes = Math.ceil(currentMinutes / step) * step;
        return Math.max(10 * 60, roundedMinutes);
    },

    _isPastBookingTime(date, time) {
        const bookingDateTime = new Date(`${date}T${time}`);
        if (Number.isNaN(bookingDateTime.getTime())) return false;
        return bookingDateTime.getTime() < Date.now();
    },

    _dateTimeToMinutes(date, time) {
        const [year, month, day] = String(date || '').split('-').map(Number);
        const [hours, minutes] = String(time || '00:00').split(':').map(Number);

        if (
            !Number.isFinite(year)
            || !Number.isFinite(month)
            || !Number.isFinite(day)
            || !Number.isFinite(hours)
            || !Number.isFinite(minutes)
        ) {
            return null;
        }

        return Date.UTC(year, month - 1, day, hours, minutes) / 60000;
    },

    _absoluteMinutesToTime(totalMinutes) {
        if (!Number.isFinite(totalMinutes)) return '';
        const normalized = ((Math.round(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
        return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
    },

    _flattenBookingsByCafe(bookingsByCafe = {}) {
        const result = [];
        Object.entries(bookingsByCafe || {}).forEach(([cafeId, bookings]) => {
            if (!Array.isArray(bookings)) return;
            bookings.forEach(booking => result.push({ ...booking, cafeId }));
        });
        return result;
    },

    async _findOwnBookingOverlap(durationOverride = null) {
        const ctx = AppState.bookingCtx;
        const user = AppState.currentUser;
        if (!user?.login) return null;

        const requestedDuration = Number(durationOverride || ctx.selectedDuration || 60);
        const start = this._dateTimeToMinutes(ctx.selectedDate, ctx.selectedTime);
        const end = start === null ? null : start + requestedDuration;
        if (start === null || end === null) return null;

        let bookingsByCafe = null;
        try {
            bookingsByCafe = await API.getUserBookings(user.login);
        } catch (e) {
            console.warn('[Booking] overlap check skipped:', e.message);
            return null;
        }

        const activeBookings = this._flattenBookingsByCafe(bookingsByCafe)
            .filter(booking => booking.status === 'active')
            .map((booking) => {
                const from = String(booking.product_available_date_local_from || '').split(' ');
                const to = String(booking.product_available_date_local_to || '').split(' ');
                const bookingStart = this._dateTimeToMinutes(from[0], from[1]);
                const bookingEnd = this._dateTimeToMinutes(to[0], to[1]);

                if (bookingStart === null || bookingEnd === null) {
                    return null;
                }

                return {
                    pcName: booking.product_pc_name || 'ПК',
                    date: from[0] || '',
                    startTime: (from[1] || '').substring(0, 5),
                    bookedUntil: (to[1] || '').substring(0, 5),
                    start: bookingStart,
                    end: bookingEnd
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);

        let proposedStart = start;
        let proposedEnd = end;
        let firstConflict = null;
        const conflicts = [];

        for (const booking of activeBookings) {
            if (proposedStart < booking.end && proposedEnd > booking.start) {
                if (!firstConflict) {
                    firstConflict = booking;
                }
                conflicts.push(booking);
                proposedStart = Math.max(proposedStart, booking.end);
                proposedEnd = proposedStart + requestedDuration;
            }
        }

        if (!firstConflict) {
            return null;
        }

        return {
            pcName: firstConflict.pcName,
            date: firstConflict.date,
            startTime: firstConflict.startTime,
            bookedUntil: firstConflict.bookedUntil,
            endTime: this._absoluteMinutesToTime(proposedStart),
            conflictsCount: conflicts.length
        };
    },

    async applyRecommendedTime() {
        const ctx = AppState.bookingCtx;
        const button = document.querySelector('.bb-warning-action');
        if (button) {
            button.disabled = true;
            button.textContent = 'Ищу...';
        }

        const slot = await this._findRecommendedSlot();
        if (!slot) {
            await UI.sayBarney('Свободный слот в пределах рабочего дня не нашелся. Попробуй другую дату или длительность.');
            this._renderModernBooking();
            return;
        }

        ctx.selectedDate = slot.date;
        ctx.selectedTime = slot.time;
        ctx.selectedPC = null;
        ctx.selectedPrice = null;
        ctx.ownBookingOverlap = null;
        ctx.allPcsBusy = false;
        await this._reloadDataAndRender();
    },

    async _findRecommendedSlot() {
        const ctx = AppState.bookingCtx;
        const mins = ctx.tariffType === 'package'
            ? Number(this._packageOfferForZone('default')?.duration || (ctx.packageGroups || []).find(group => group.name === ctx.selectedPackageName)?.duration || ctx.selectedDuration || 60)
            : Number(ctx.selectedDuration || 60);
        const selectedStart = this._timeToMinutes(ctx.selectedTime) ?? this._minimumSelectableMinutes(ctx.selectedDate, 30);
        const conflictEnd = ctx.ownBookingOverlap?.endTime ? this._timeToMinutes(ctx.ownBookingOverlap.endTime) : null;
        let probe = Math.max(conflictEnd ?? (selectedStart + mins), this._minimumSelectableMinutes(ctx.selectedDate, 30));
        probe = Math.ceil(probe / 30) * 30;

        for (let minutes = probe; minutes + mins <= 24 * 60; minutes += 30) {
            const time = this._minutesToTime(minutes);
            if (!time) continue;
            try {
                const [pcsResult, overlap] = await Promise.all([
                    API.getAvailablePCs(ctx.selectedCafe.icafe_id, ctx.selectedDate, time, mins),
                    this._findOwnBookingOverlapFor(ctx.selectedDate, time, mins)
                ]);
                if (!overlap && Array.isArray(pcsResult?.pc_list) && pcsResult.pc_list.length > 0) {
                    return { date: ctx.selectedDate, time };
                }
            } catch (e) {
                console.warn('[Booking] recommendation probe failed:', e.message);
            }
        }
        return null;
    },

    async _findOwnBookingOverlapFor(date, time, mins) {
        const ctx = AppState.bookingCtx;
        const prev = { date: ctx.selectedDate, time: ctx.selectedTime, duration: ctx.selectedDuration };
        ctx.selectedDate = date;
        ctx.selectedTime = time;
        ctx.selectedDuration = mins;
        try {
            return await this._findOwnBookingOverlap(mins);
        } finally {
            ctx.selectedDate = prev.date;
            ctx.selectedTime = prev.time;
            ctx.selectedDuration = prev.duration;
        }
    },

    _minutesToTime(minutes) {
        if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) return null;
        return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    },

    _renderDatePickerModal() {
        const ctx = AppState.bookingCtx;
        const modal = document.getElementById('bb-date-picker-modal');
        if (!modal) return;

        const calendar = this._buildCalendarDays(ctx.pendingDate, ctx.pickerMonth);
        const weekdays = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'];

        modal.innerHTML = `
            <div class="bb-picker-dialog" role="dialog" aria-modal="true">
                <div class="bb-picker-dialog__body">
                    <p class="bb-picker-dialog__eyebrow">Выбор даты</p>
                    <h2 class="bb-picker-dialog__headline">${this._formatDateHeadline(ctx.pendingDate)}</h2>
                    <div class="bb-picker-dialog__bar">
                        <span class="bb-picker-dialog__month">${calendar.title}</span>
                        <div class="bb-picker-dialog__nav">
                            <button class="bb-picker-icon-btn" type="button" data-month="-1">‹</button>
                            <button class="bb-picker-icon-btn" type="button" data-month="1">›</button>
                        </div>
                    </div>
                    <div class="bb-material-calendar-weekdays">
                        ${weekdays.map(day => `<span>${day}</span>`).join('')}
                    </div>
                    <div class="bb-material-calendar-grid">
                        ${calendar.days.map(day => day ? `
                            <button class="bb-material-calendar-day${day.isSelected ? ' is-active' : ''}${day.isToday ? ' is-today' : ''}" type="button" data-date="${day.date}">
                                ${day.day}
                            </button>
                        ` : '<button class="bb-material-calendar-day is-empty" type="button" tabindex="-1"></button>').join('')}
                    </div>
                </div>
                <div class="bb-picker-actions">
                    <button class="bb-picker-action" type="button" data-cancel>Cancel</button>
                    <button class="bb-picker-action" type="button" data-ok>OK</button>
                </div>
            </div>
        `;

        modal.onclick = (event) => {
            if (event.target === modal) this.closePickers();
        };

        modal.querySelectorAll('[data-month]').forEach(button => {
            button.addEventListener('click', () => {
                ctx.pickerMonth = this._shiftMonth(ctx.pickerMonth, Number(button.dataset.month));
                this._renderDatePickerModal();
            });
        });

        modal.querySelectorAll('[data-date]').forEach(button => {
            button.addEventListener('click', async () => {
                ctx.pendingDate = button.dataset.date;
                ctx.pickerMonth = `${ctx.pendingDate.slice(0, 8)}01`;
                ctx.selectedDate = ctx.pendingDate;
                ctx.selectedPC = null;
                this._renderDatePickerModal();
                await this._reloadDataAndRender();
            });
        });

        const cancel = modal.querySelector('[data-cancel]');
        const ok = modal.querySelector('[data-ok]');
        if (cancel) cancel.addEventListener('click', () => this.closePickers());
        if (ok) ok.addEventListener('click', async () => {
            ctx.selectedDate = ctx.pendingDate;
            ctx.selectedPC = null;
            this.closePickers();
            await this._reloadDataAndRender();
        });
    },

    _renderTimePickerModal() {
        const ctx = AppState.bookingCtx;
        const modal = document.getElementById('bb-time-picker-modal');
        if (!modal) return;
        const minSelectableMinutes = this._minimumSelectableMinutes(ctx.selectedDate, 10);

        const [hour, minute] = ctx.pendingTime.split(':');
        const activeValue = ctx.pendingTimeMode === 'hour'
            ? hour
            : minute;
        const activeNumber = Number(activeValue);
        const angle = ctx.pendingTimeMode === 'hour'
            ? (activeNumber % 12) * 30
            : (activeNumber % 60) * 6;
        const handClass = ctx.pendingTimeMode === 'hour' && activeNumber >= 12
            ? ' bb-time-dial-hand--inner'
            : '';
        const items = this._dialItems(ctx.pendingTimeMode);
        const dialClass = ctx.pendingTimeMode === 'hour' ? ' bb-time-dial--hours24' : '';

        modal.innerHTML = `
            <div class="bb-picker-dialog" role="dialog" aria-modal="true">
                <div class="bb-picker-dialog__body">
                    <p class="bb-picker-dialog__eyebrow">Выбор времени</p>
                    <div class="bb-material-time-display">
                        <button class="bb-material-time-number${ctx.pendingTimeMode === 'hour' ? ' is-active' : ''}" type="button" data-mode="hour">${hour}</button>
                        <span class="bb-material-time-separator">:</span>
                        <button class="bb-material-time-number${ctx.pendingTimeMode === 'minute' ? ' is-active' : ''}" type="button" data-mode="minute">${minute}</button>
                    </div>
                    <div class="bb-time-dial${dialClass}">
                        <i class="bb-time-dial-hand${handClass}" style="transform: rotate(${angle}deg);"></i>
                        ${items.map((item, index) => {
                            const itemNumber = Number(item);
                            const itemAngle = ctx.pendingTimeMode === 'hour'
                                ? ((itemNumber % 12) * 30) - 90
                                : ((itemNumber % 60) * 6) - 90;
                            const isInnerHour = ctx.pendingTimeMode === 'hour' && itemNumber >= 12;
                            const radius = ctx.pendingTimeMode === 'hour'
                                ? (isInnerHour ? 44 : 76)
                                : 64;
                            const x = Math.cos(itemAngle * Math.PI / 180) * radius;
                            const y = Math.sin(itemAngle * Math.PI / 180) * radius;
                            let isDisabled = false;
                            if (ctx.selectedDate) {
                                const nextTime = ctx.pendingTimeMode === 'hour'
                                    ? `${item}:${minute}`
                                    : `${hour}:${item}`;
                                const nextMinutes = this._timeToMinutes(nextTime);
                                isDisabled = nextMinutes !== null && nextMinutes < minSelectableMinutes && String(ctx.selectedDate) === CONFIG.getDefaultDate();
                            }
                            return `
                                <button class="bb-time-dial-option${ctx.pendingTimeMode === 'hour' && isInnerHour ? ' bb-time-dial-option--inner' : ''}${item === activeValue ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}" type="button" data-value="${item}" ${isDisabled ? 'disabled' : ''} style="transform: translate(-50%, -50%) translate(${x}px, ${y}px);">
                                    ${item}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="bb-picker-actions">
                    <button class="bb-picker-action" type="button" data-cancel>Cancel</button>
                    <button class="bb-picker-action" type="button" data-ok>OK</button>
                </div>
            </div>
        `;

        modal.onclick = (event) => {
            if (event.target === modal) this.closePickers();
        };

        modal.querySelectorAll('[data-mode]').forEach(button => {
            button.addEventListener('click', () => {
                ctx.pendingTimeMode = button.dataset.mode;
                this._renderTimePickerModal();
            });
        });

        modal.querySelectorAll('[data-value]').forEach(button => {
            button.addEventListener('click', async () => {
                const [currentHour, currentMinute] = ctx.pendingTime.split(':');
                if (ctx.pendingTimeMode === 'hour') {
                    const nextHour = button.dataset.value;
                    ctx.pendingTime = `${nextHour}:${currentMinute}`;
                    if (this._isPastBookingTime(ctx.selectedDate, ctx.pendingTime)) {
                        const minimumMinutes = this._minimumSelectableMinutes(ctx.selectedDate, 10);
                        const adjustedHour = String(Math.floor(minimumMinutes / 60)).padStart(2, '0');
                        const adjustedMinute = String(minimumMinutes % 60).padStart(2, '0');
                        ctx.pendingTime = `${adjustedHour}:${adjustedMinute}`;
                    }
                    ctx.pendingTimeMode = 'minute';
                    this._renderTimePickerModal();
                    return;
                } else {
                    ctx.pendingTime = `${currentHour}:${button.dataset.value}`;
                    if (this._isPastBookingTime(ctx.selectedDate, ctx.pendingTime)) {
                        return;
                    }
                }
                ctx.selectedTime = ctx.pendingTime;
                ctx.selectedPC = null;
                this._renderTimePickerModal();
                await this._reloadDataAndRender();
            });
        });

        const cancel = modal.querySelector('[data-cancel]');
        const ok = modal.querySelector('[data-ok]');
        if (cancel) cancel.addEventListener('click', () => this.closePickers());
        if (ok) ok.addEventListener('click', async () => {
            ctx.selectedTime = ctx.pendingTime;
            ctx.selectedPC = null;
            this.closePickers();
            await this._reloadDataAndRender();
        });
    },

    _addDays(dateStr, days) {
        const date = new Date(`${dateStr}T00:00:00`);
        date.setDate(date.getDate() + days);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    _buildCalendarDays(value, monthValue = null) {
        const visible = new Date(`${(monthValue || value).slice(0, 7)}-01T00:00:00`);
        const firstDay = new Date(visible);
        const offset = (firstDay.getDay() + 6) % 7;
        const days = [];
        for (let i = 0; i < offset; i++) {
            days.push(null);
        }
        const totalDays = new Date(visible.getFullYear(), visible.getMonth() + 1, 0).getDate();
        const today = CONFIG.getDefaultDate();
        for (let day = 1; day <= totalDays; day++) {
            const date = `${visible.getFullYear()}-${String(visible.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            days.push({
                day,
                date,
                isSelected: date === value,
                isToday: date === today
            });
        }
        return {
            title: visible.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
            days
        };
    },

    _formatDateHeadline(value) {
        return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    },

    _shiftMonth(value, delta) {
        const date = new Date(`${value}T00:00:00`);
        date.setMonth(date.getMonth() + delta, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    },

    _dialItems(mode) {
        if (mode === 'minute') {
            return Array.from({ length: 6 }, (_, index) => String(index * 10).padStart(2, '0'));
        }
        return Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
    },

    _normalizePrices(rawPrices = {}) {
        const products = Array.isArray(rawPrices.products) ? rawPrices.products : [];
        return {
            ...rawPrices,
            products: products
                .map(product => {
                    const rawName = product.raw_product_name || product.product_name || '';
                    const cleanName = String(rawName).split('<<<')[0].trim() || product.product_name || 'Пакет';
                    const zoneName = product.group_name || product.product_group_name || 'Default';
                    let duration = Number(product.duration_min || product.duration || product.product_mins || 0);
                    if (!duration) {
                        const hours = cleanName.match(/(\d+)\s*(?:ч|час|часа|часов|hour|h)/i);
                        const minutes = cleanName.match(/(\d+)\s*(?:м|мин|минут|min)/i);
                        if (hours) duration = Number(hours[1]) * 60;
                        else if (minutes) duration = Number(minutes[1]);
                    }
                    return {
                        ...product,
                        product_name: cleanName,
                        group_name: zoneName,
                        duration_min: duration,
                        total_price: Number(product.total_price || product.product_price || 0)
                    };
                })
                .filter(product => product.product_name && product.total_price > 0)
        };
    },

    _buildPackageGroups(products = []) {
        const groups = new Map();
        products.forEach(product => {
            const key = product.product_name;
            if (!groups.has(key)) {
                groups.set(key, {
                    name: key,
                    duration: Number(product.duration_min || 0),
                    offers: []
                });
            }
            groups.get(key).offers.push({
                zone: product.group_name,
                price: Number(product.total_price || 0),
                product_id: product.product_id,
                duration: Number(product.duration_min || product.duration || 0)
            });
        });
        return [...groups.values()];
    },

    _syncTariffState() {
        const ctx = AppState.bookingCtx;
        const durations = this._getHourlyDurationOptions();
        if (!durations.find(item => item.duration === ctx.selectedDuration)) {
            ctx.selectedDuration = durations[0]?.duration || 60;
        }

        const groups = ctx.packageGroups || [];
        if (!groups.find(group => group.name === ctx.selectedPackageName)) {
            ctx.selectedPackageName = groups[0]?.name || null;
        }

        if (ctx.tariffType === 'package' && ctx.selectedPackageName) {
            const selectedGroup = groups.find(group => group.name === ctx.selectedPackageName);
            if (selectedGroup?.duration) {
                ctx.selectedDuration = selectedGroup.duration;
            }
            ctx.selectedPackageInfo = selectedGroup
                ? { name: selectedGroup.name, duration: selectedGroup.duration }
                : null;
        }
    },

    _packageOfferForZone(zoneName) {
        const ctx = AppState.bookingCtx;
        const group = (ctx.packageGroups || []).find(item => item.name === ctx.selectedPackageName);
        if (!group) return null;

        const direct = group.offers.find(offer =>
            String(offer.zone || '').toLowerCase() === String(zoneName || '').toLowerCase()
        );
        if (direct) return direct;

        const fallbackDefault = group.offers.find(offer =>
            String(offer.zone || '').toLowerCase() === 'default'
        );
        if (fallbackDefault) return fallbackDefault;

        return group.offers[0] || null;
    },

    // Выбрать ПК
    selectPC(pcName, zone) {
        const ctx = AppState.bookingCtx;
        const available = (ctx.availablePCs || []).find(pc => pc.pc_name === pcName);
        const pc = available || { pc_name: pcName, pc_group_name: zone, pc_area_name: zone };
        ctx.selectedPC = pc;

        // Визуально выделяем
        document.querySelectorAll('.bb-desk').forEach(card => {
            card.classList.remove('is-active');
        });
        const selectedCard = document.querySelector(`.bb-desk[data-pc="${pcName}"]`);
        if (selectedCard) {
            selectedCard.classList.add('is-active');
        }

        const priceInfo = this._getPriceForBooking(pc);
        if (priceInfo) ctx.selectedPrice = priceInfo;

        const confirmRow = document.querySelector('.bb-selection');
        if (confirmRow) confirmRow.classList.add('is-visible');
        this._updateBookingFooter();
    },

    async confirmSelectedPC() {
        const ctx = AppState.bookingCtx;
        if (!ctx.selectedPC) return;
        const priceInfo = ctx.selectedPrice || this._getPriceForBooking(ctx.selectedPC);
        ctx.selectedPrice = priceInfo;
        await this._confirmBooking();
    },

    _renderBookingFooter() {
        const ctx = AppState.bookingCtx;
        const amountLabel = this._getSelectedBookingAmountLabel();

        return `
            <div class="bb-selection ${ctx.selectedPC ? 'is-visible' : ''}">
                <div class="bb-confirm-amount">${amountLabel}</div>
                <button class="bb-confirm-btn" type="button" onclick="Booking.confirmSelectedPC()">\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c</button>
            </div>
        `;
    },

    _updateBookingFooter() {
        const amountNode = document.querySelector('.bb-confirm-amount');
        if (amountNode) {
            amountNode.textContent = this._getSelectedBookingAmountLabel();
        }
    },

    _returnToModernBooking(resetSelection = false) {
        const ctx = AppState.bookingCtx;
        if (resetSelection) {
            ctx.selectedPC = null;
            ctx.selectedPrice = null;
        }
        this._renderModernBooking();
    },

    _bindInlinePickerCloser() {
        if (this._inlinePickerCloserBound) return;
        this._inlinePickerCloserBound = true;
        document.addEventListener('click', (event) => {
            const ctx = AppState.bookingCtx;
            if (!ctx || !ctx.activeInlinePicker) return;
            const insideSummary = event.target.closest('.bb-summary-item');
            const insidePicker = event.target.closest('.bb-picker-backdrop');
            if (insidePicker) return;
            if (insideSummary) return;
            ctx.activeInlinePicker = null;
            if (document.querySelector('.booking-modern-container')) {
                this._renderModernBooking();
            }
        });
    },

    // ==========================================
    // Перерисовать контент тарифов
    // ==========================================
    _renderTariffContent() {
        const ctx = AppState.bookingCtx;
        const container = document.getElementById('tariff-content');
        if (!container) return;

        // Обновляем табы
        const tabHourly = document.getElementById('tab-hourly');
        const tabPackage = document.getElementById('tab-package');
        if (tabHourly) tabHourly.classList.toggle('active', ctx.tariffType === 'hourly');
        if (tabPackage) tabPackage.classList.toggle('active', ctx.tariffType === 'package');

        // Контент
        container.innerHTML = ctx.tariffType === 'hourly'
            ? this._renderHourlyOptions()
            : this._renderPackageOptions();

        this._attachTariffHandlers();
    },

    // ==========================================
    // Рендер почасовых опций
    // ==========================================
    _renderHourlyOptions() {
        const ctx = AppState.bookingCtx;
        const prices = ctx.prices?.prices || [];

        if (prices.length === 0) {
            return '<p style="color:var(--text-muted);font-size:0.85rem;padding:10px 0;">Нет почасовых тарифов</p>';
        }

        // Берём уникальные длительности (минимальная цена среди зон)
        const durationMap = new Map();
        prices.forEach(p => {
            const dur = parseInt(p.duration_min || p.duration || 60);
            const price = parseFloat(p.total_price || 0);
            if (!durationMap.has(dur) || durationMap.get(dur) > price) {
                durationMap.set(dur, price);
            }
        });

        const durations = [...durationMap.entries()].sort((a, b) => a[0] - b[0]);

        // Выбираем первый по умолчанию
        if (!ctx.selectedDuration && durations.length > 0) {
            ctx.selectedDuration = durations[0][0];
            ctx.selectedPriceInfo = null;
        }

        let html = '<div class="hourly-options">';
        durations.forEach(([duration, price]) => {
            const isSelected = ctx.selectedDuration === duration;

            html += `
                <div class="hourly-option ${isSelected ? 'selected' : ''}" data-duration="${duration}">
                    <div class="hourly-duration">${duration} мин</div>
                    <div class="hourly-price">от ${price}₽</div>
                </div>
            `;
        });
        html += '</div>';

        return html;
    },

    // ==========================================
    // Рендер пакетных опций
    // ==========================================
    _renderPackageOptions() {
        const ctx = AppState.bookingCtx;
        const products = ctx.prices?.products || [];

        // Удаляем дубликаты
        const seen = new Set();
        const uniqueProducts = [];
        products.forEach(p => {
            const key = `${p.product_id}-${p.product_name}-${p.group_name}-${p.total_price}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueProducts.push(p);
            }
        });

        if (uniqueProducts.length === 0) {
            return '<p style="color:var(--text-muted);font-size:0.85rem;padding:10px 0;">Нет пакетных тарифов</p>';
        }

        // Выбираем первый по умолчанию
        if (!ctx.selectedPackageId && uniqueProducts.length > 0) {
            const first = uniqueProducts[0];
            ctx.selectedPackageId = first.product_id;
            ctx.selectedDuration = this._parseDurationFromProduct(first);
            ctx.selectedPriceInfo = null;
        }

        let html = '<div class="package-options">';
        uniqueProducts.forEach(p => {
            // Парсим длительность из названия
            const dur = this._parseDurationFromProduct(p);
            const hours = Math.floor(dur / 60);
            const minsLeft = dur % 60;
            const durStr = hours > 0 ? `${hours}ч${minsLeft > 0 ? ' ' + minsLeft + 'м' : ''}` : `${dur}м`;
            const price = parseFloat(p.total_price || p.product_price || 0);
            const isSelected = ctx.selectedPackageId === p.product_id;

            html += `
                <div class="package-option ${isSelected ? 'selected' : ''}" data-product-id="${p.product_id}" data-duration="${dur}" data-price="${price}" data-group="${p.group_name || ''}">
                    <div class="package-name">${p.product_name || 'Пакет'}</div>
                    <div class="package-duration">${durStr}</div>
                    <div class="package-price">${this._formatPrice(price)}</div>
                </div>
            `;
        });
        html += '</div>';

        return html;
    },

    // ==========================================
    // Навесить обработчики на тарифы
    // ==========================================
    _attachTariffHandlers() {
        const ctx = AppState.bookingCtx;

        // Почасовые
        document.querySelectorAll('.hourly-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                document.querySelectorAll('.hourly-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                ctx.selectedDuration = parseInt(opt.dataset.duration);
                ctx.selectedPackageId = null;
                ctx.selectedPriceInfo = {
                    type: 'hourly',
                    duration: ctx.selectedDuration
                };
                await this._reloadDataAndRender();
            });
        });

        // Пакетные
        document.querySelectorAll('.package-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                document.querySelectorAll('.package-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                ctx.selectedPackageId = opt.dataset.productId;
                ctx.selectedDuration = parseInt(opt.dataset.duration);
                ctx.selectedPriceInfo = {
                    type: 'package',
                    product_id: opt.dataset.productId,
                    duration: parseInt(opt.dataset.duration),
                    price: parseFloat(opt.dataset.price),
                    group_name: opt.dataset.group
                };
                await this._reloadDataAndRender();
            });
        });
    },

    // ==========================================
    // Обновить тарифы при смене даты
    // ==========================================
    async _refreshPrices() {
        const ctx = AppState.bookingCtx;
        try {
            const prices = await API.getAllPrices(
                ctx.selectedCafe.icafe_id,
                AppState.currentUser.memberId,
                null,
                ctx.selectedDate
            );
            ctx.prices = prices;
            this._renderTariffContent();
        } catch (e) {
            console.warn('Не удалось обновить тарифы:', e);
        }
    },

    // ==========================================
    // Шаг 5: Проверка доступных ПК
    // ==========================================
    async _stepCheckPCs() {
        AppState.bookingCtx.step = 5;
        UI.clearDialog();

        const ctx = AppState.bookingCtx;
        const cafe = ctx.selectedCafe;

        await UI.sayBarney(
            `Длительность: ${ctx.selectedDuration} мин\n\n` +
            `Проверяю свободные терминалы в ${cafe.address} на ${this._formatDateRu(ctx.selectedDate)} в ${ctx.selectedTime}...`
        );

        try {
            const result = await API.getAvailablePCs(
                cafe.icafe_id,
                ctx.selectedDate,
                ctx.selectedTime,
                ctx.selectedDuration
            );

            ctx.availablePCs = result.pc_list || [];

            // Цены уже получены в _stepUnified — не запрашиваем снова
            if (!ctx.prices || (!ctx.prices.prices?.length && !ctx.prices.products?.length)) {
                ctx.prices = this._getDefaultPrices(ctx.selectedDuration);
            }

            // Получаем брони друзей для подсветки на сетке
            ctx.friendBookings = {}; // { pc_name: friend_name }
            try {
                const friendsList = await API.getFriendsList(AppState.currentUser.login);
                for (const friend of (friendsList || [])) {
                    try {
                        const bookings = await API.getFriendBookingsGrid(
                            AppState.currentUser.login,
                            friend.login,
                            ctx.selectedCafe.icafe_id,
                            ctx.selectedDate
                        );
                        // Проверяем пересечение по времени
                        for (const b of (bookings || [])) {
                            if (b.start_date !== ctx.selectedDate) continue;
                            
                            const bookTime = b.start_time?.substring(0, 5);
                            if (!bookTime) continue;
                            
                            // Моё время
                            const [myH, myM] = ctx.selectedTime.split(':').map(Number);
                            const myStartMin = myH * 60 + myM;
                            const myEndMin = myStartMin + ctx.selectedDuration;
                            
                            // Время друга
                            const [fh, fm] = bookTime.split(':').map(Number);
                            const friendStartMin = fh * 60 + fm;
                            const friendDuration = b.duration_min || 60;
                            const friendEndTotalMin = friendStartMin + friendDuration;
                            
                            // Пересечение: моё начало < конец друга и мой конец > начало друга
                            const overlaps = myStartMin < friendEndTotalMin && myEndMin > friendStartMin;
                            
                            if (overlaps) {
                                ctx.friendBookings[b.pc_name] = friend.name || friend.login;
                            }
                        }
                    } catch (fe) {
                        // Игнорируем ошибки для отдельных друзей
                    }
                }
            } catch (e) {
                console.warn('Не удалось загрузить брони друзей:', e);
            }

            await this._showPCGrid();

        } catch (e) {
            await UI.sayBarney(
                `Ошибка при проверке ПК: ${e.message}\n\n` +
                `Попробуй другое время или дату.`
            );

            UI.setActions([
                { label: 'Попробовать снова', description: 'Повторить поиск доступных мест', iconPath: './ui%20kit/icon/bulk/refresh.svg', primary: true, action: () => this._stepCheckPCs() },
                { label: 'Назад', description: 'Вернуться без продолжения брони', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', action: () => this._stepUnified() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
        }
    },

    // ==========================================
    // Показать сетку ПК
    // ==========================================
    async _showPCGrid() {
        const ctx = AppState.bookingCtx;
        const pcs = ctx.availablePCs;

        if (!pcs || pcs.length === 0) {
            await UI.sayBarney('К сожалению, все терминалы заняты на это время. Попробуй другое время или дату.');

            UI.setActions([
                { label: 'Назад', description: 'Вернуться без продолжения брони', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', primary: true, action: () => this._stepUnified() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
            return;
        }

        // Группируем ПК по зонам
        const zones = {};
        pcs.forEach(pc => {
            const zoneName = pc.pc_group_name || pc.pc_area_name || 'Другое';
            if (!zones[zoneName]) {
                zones[zoneName] = [];
            }
            zones[zoneName].push(pc);
        });

        // Получаем цены из API для каждой зоны
        const zonePrices = {};
        if (ctx.prices) {
            // Почасовые тарифы
            (ctx.prices.prices || []).forEach(p => {
                const zone = p.group_name || 'Другое';
                zonePrices[zone] = zonePrices[zone] || {};
                zonePrices[zone].hourly = p.total_price || p.price_price1 || '?';
            });
            // Пакеты
            (ctx.prices.products || []).forEach(p => {
                const zone = p.group_name || 'Другое';
                zonePrices[zone] = zonePrices[zone] || {};
                zonePrices[zone].packages = zonePrices[zone].packages || [];
                zonePrices[zone].packages.push({
                    name: p.product_name,
                    price: p.total_price || p.product_price,
                    duration: p.duration || p.duration_min
                });
            });
        }

        // Проверяем есть ли брони друзей
        const friendBookedPCs = Object.keys(ctx.friendBookings || {});
        const hasFriendBookings = friendBookedPCs.length > 0;

        let barneyMsg = `Нашёл ${pcs.length} терминалов! Зелёные — свободны, тёмные — заняты.`;
        if (hasFriendBookings) {
            const friendNames = [...new Set(Object.values(ctx.friendBookings))];
            barneyMsg += `\nСиние места уже заняты твоими друзьями: ${friendNames.join(', ')}.`;
        }
        barneyMsg += `\nНажми на свободный ПК, чтобы забронировать:`;

        // Не-блокирующая озвучка — сетка показывается сразу
        UI.sayBarney(barneyMsg, {nonBlocking: true});

        let html = '';
        Object.entries(zones).forEach(([zoneName, zonePCs]) => {
            html += `<div class="pc-zone-group">`;

            // Карточка зоны с ценами
            const zp = zonePrices[zoneName] || zonePrices[zoneName.split('/')[0]?.trim()] || {};
            if (zp.hourly || zp.packages?.length) {
                html += `<div class="zone-info-card">`;
                if (zp.hourly) html += `<span class="zone-price-hourly">${zp.hourly}₽/час</span>`;
                if (zp.packages?.length) {
                    zp.packages.slice(0, 2).forEach(pkg => {
                        html += `<span class="zone-price-pkg">${pkg.name}: ${pkg.price}₽</span>`;
                    });
                }
                html += `</div>`;
            }

            html += `<div class="pc-zone-title">${zoneName}</div>`;
            html += `<div class="pc-grid">`;

            zonePCs.forEach(pc => {
                const isFree = !pc.is_using;
                const isFriendBooked = ctx.friendBookings?.[pc.pc_name];
                const priceInfo = this._getPCPrice(pc);

                let cellClass = 'occupied';
                if (isFriendBooked) {
                    cellClass = 'friend-booked';
                } else if (isFree) {
                    cellClass = 'free';
                }

                html += `
                    <div class="pc-cell ${cellClass}" 
                         data-pc-name="${pc.pc_name}" 
                         data-pc-free="${isFree}">
                        ${pc.pc_name.replace('pc', 'ПК').replace('PC', 'ПК')}
                        ${isFree && priceInfo ? `<span class="pc-price">${priceInfo}</span>` : ''}
                        ${isFriendBooked ? `<span class="pc-friend-name">${this._icon('profile-circle')} ${isFriendBooked}</span>` : ''}
                        ${!isFree && !isFriendBooked ? '<span class="pc-price">Занят</span>' : ''}
                    </div>
                `;
            });

            html += `</div></div>`;
        });

        // Легенда
        if (hasFriendBookings) {
            html += `<div style="display:flex;gap:12px;margin-top:10px;font-size:0.75rem;flex-wrap:wrap;">
                <span><span class="pcgrid-legend__dot pcgrid-legend__dot--free"></span> Свободен</span>
                <span><span class="pcgrid-legend__dot pcgrid-legend__dot--busy"></span> Занят</span>
                <span style="color:var(--neon-blue)"><span class="pc-zone-label__dot" style="background:var(--neon-blue)"></span> Друг</span>
            </div>`;
        }

        UI.appendContent(html);

        // Клик по ПК (только свободные)
        document.querySelectorAll('.pc-cell.free').forEach(cell => {
            cell.addEventListener('click', () => {
                UI._stopTTS(); // Обрываем TTS при клике
                const pcName = cell.dataset.pcName;
                const pc = pcs.find(p => p.pc_name === pcName);
                if (pc) {
                    this._selectPC(pc);
                }
            });
        });

        UI.setActions([
            { label: 'Назад', description: 'Вернуться без продолжения брони', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', action: () => this._stepUnified() },
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // Выбрать ПК
    // ==========================================
    async _selectPC(pc) {
        const ctx = AppState.bookingCtx;

        // Если бронь для друга и ещё не выбран ПК для друга
        if (ctx.bookingFor === 'friend' && ctx.selectedFriend && !ctx.selectedFriendPC) {
            ctx.selectedPC = pc; // Сохраняем свой ПК

            const priceInfo = this._getPriceForBooking(pc);
            if (priceInfo) ctx.selectedPrice = priceInfo;

            // Подсвечиваем выбранный
            document.querySelectorAll('.pc-cell').forEach(c => c.classList.remove('selected'));
            const cell = document.querySelector(`.pc-cell[data-pc-name="${pc.pc_name}"]`);
            if (cell) cell.classList.add('selected');

            // Теперь просим выбрать ПК для друга
            await this._showFriendPCSelect(pc);
            return;
        }

        ctx.selectedPC = pc;

        // Подсвечиваем выбранный
        document.querySelectorAll('.pc-cell').forEach(c => c.classList.remove('selected'));
        const cell = document.querySelector(`.pc-cell[data-pc-name="${pc.pc_name}"]`);
        if (cell) cell.classList.add('selected');

        // Получаем цену
        const priceInfo = this._getPriceForBooking(pc);

        if (priceInfo) {
            ctx.selectedPrice = priceInfo;
        }

        // Показываем подтверждение
        await this._showConfirmModal(pc, priceInfo);
    },

    // ==========================================
    // Шаг: Выбор ПК для друга
    // ==========================================
    async _showFriendPCSelect(selfPC) {
        const ctx = AppState.bookingCtx;
        const friendName = ctx.selectedFriend.name || ctx.selectedFriend.login;

        let barneyMsg = CONFIG.randomPhrase('friendBookingPCSelect');
        barneyMsg = barneyMsg.replace('{friend_name}', friendName);

        await UI.sayBarney(barneyMsg);

        // Перерисовываем сетку с отмеченным своим ПК (НЕ вызываем clearDialog — сообщение Барни остаётся)
        let html = `<div style="margin-bottom:8px;">
            <span><span class="pcgrid-legend__dot pcgrid-legend__dot--free"></span> Твой ПК: <b>${selfPC.pc_name.replace('pc','ПК')}</b></span>
            <span style="margin-left:12px;color:var(--neon-blue)"><span class="pc-zone-label__dot" style="background:var(--neon-blue)"></span> Выбери ПК для друга</span>
        </div>`;

        html += `<div class="pc-grid">`;
        ctx.availablePCs.forEach(pc => {
            const isSelf = pc.pc_name === selfPC.pc_name;
            const isFree = !pc.is_using && !isSelf;
            const cellClass = isSelf ? 'selected' : (isFree ? 'free' : 'occupied');

            html += `<div class="pc-cell ${cellClass}" data-pc-name="${pc.pc_name}" data-pc-free="${isFree}">
                ${pc.pc_name.replace('pc', 'ПК').replace('PC', 'ПК')}
                ${isFree ? '<span class="pc-price">Свободен</span>' : ''}
                ${isSelf ? '<span class="pc-price">Твой</span>' : ''}
                ${!isFree && !isSelf ? '<span class="pc-price">Занят</span>' : ''}
            </div>`;
        });
        html += `</div>`;

        // НЕ вызываем clearDialog — сообщение Барни остаётся сверху
        UI.appendContent(html);

        // Клик по свободному ПК — выбираем для друга
        document.querySelectorAll('.pc-cell.free').forEach(cell => {
            cell.addEventListener('click', async () => {
                const friendPcName = cell.dataset.pcName;
                const friendPC = ctx.availablePCs.find(p => p.pc_name === friendPcName);
                if (friendPC) {
                    ctx.selectedFriendPC = friendPC;

                    // Подсвечиваем
                    cell.classList.add('selected-friend');

                    // Показываем подтверждение
                    await this._showConfirmModal(selfPC, ctx.selectedPrice);
                }
            });
        });

        UI.setActions([
            { label: 'Выбрать другой ПК', description: 'Вернуться к списку доступных мест', iconPath: './ui%20kit/icon/bulk/monitor.svg', action: () => this._showPCGrid() },
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
        ]);
    },

    // ==========================================
    // Модалка подтверждения бронирования
    // ==========================================
    async _showConfirmModal(pc, priceInfo) {
        const ctx = AppState.bookingCtx;
        const user = AppState.currentUser;
        const balanceVal = user.balance || 0;
        const totalPriceNum = parseFloat(priceInfo?.total_price || 0);
        // Для друга — примерная общая стоимость (x2)
        const estimatedTotal = ctx.bookingFor === 'friend' ? totalPriceNum * 2 : totalPriceNum;
        const balanceStyle = balanceVal >= totalPriceNum ? '' : ' style="color:var(--red)"';

        const dateRu = this._formatDateRu(ctx.selectedDate);
        const priceStr = priceInfo ? `${priceInfo.total_price}₽` : '—';
        const priceName = priceInfo ? (priceInfo.product_name || priceInfo.price_name) : 'Почасовой';

        // Определяем для кого
        let forWhomLabel = `${user.name || user.login} (ты)`;
        if (ctx.bookingFor === 'friend' && ctx.selectedFriend) {
            forWhomLabel = ctx.selectedFriend.name || ctx.selectedFriend.login;
        }

        // Если для друга — показываем оба ПК
        let extraRows = '';
        if (ctx.bookingFor === 'friend' && ctx.selectedFriendPC) {
            extraRows = `
            <div class="detail-row" style="border-top:1px solid var(--gold-dim);padding-top:8px;margin-top:4px;">
                <span class="detail-label">ПК друга</span>
                <span class="detail-value">${ctx.selectedFriendPC.pc_name.replace('pc', 'ПК').replace('PC', 'ПК')} (${ctx.selectedFriendPC.pc_group_name || ctx.selectedFriendPC.pc_area_name})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Итого (2 ПК)</span>
                <span class="detail-value total">~${estimatedTotal}₽</span>
            </div>`;
        }

        const detailsHtml = `
            <div class="detail-row">
                <span class="detail-label">Клуб</span>
                <span class="detail-value">${ctx.selectedCafe.address}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Терминал</span>
                <span class="detail-value">${pc.pc_name.replace('pc', 'ПК').replace('PC', 'ПК')} (${pc.pc_group_name || pc.pc_area_name})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Для кого</span>
                <span class="detail-value" style="color:var(--neon-blue)">${forWhomLabel}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Дата</span>
                <span class="detail-value">${dateRu}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Время</span>
                <span class="detail-value">${ctx.selectedTime}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Длительность</span>
                <span class="detail-value">${ctx.selectedDuration} мин</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Тариф</span>
                <span class="detail-value">${priceName}</span>
            </div>
            ${extraRows}
            <div class="detail-row" style="border-top:1px solid var(--gold-dim);padding-top:10px;margin-top:6px;">
                <span class="detail-label">Итого</span>
                <span class="detail-value total">${priceStr}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Баланс</span>
                <span class="detail-value"${balanceStyle}>${balanceVal}₽</span>
            </div>
        `;

        UI.showModalBookingConfirm(detailsHtml);

        // Получаем элементы каждый раз напрямую из DOM (в обход кэша UI)
        const modal = UI.elements.modalConfirmBooking || document.getElementById('modal-confirm-booking');
        const confirmBtn = document.getElementById('btn-booking-confirm');
        const cancelBtn = document.getElementById('btn-booking-cancel');
        const closeBtn = document.getElementById('btn-close-booking-confirm');

        const modalHeader = modal ? modal.querySelector('.modal-header h3') : null;

        // Сброс стилей
        if (confirmBtn) { confirmBtn.textContent = 'Оплатить и забронировать'; confirmBtn.style.cssText = ''; }
        if (cancelBtn) { cancelBtn.textContent = 'Отмена'; cancelBtn.style.cssText = ''; }
        if (modalHeader) { modalHeader.textContent = 'Подтверждение брони'; }

        // Навешиваем обработчики
        if (confirmBtn) {
            const newConfirm = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
            newConfirm.addEventListener('click', () => Booking._confirmBooking(), { once: false });
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
    },

    // ==========================================
    // Подтверждение бронирования (оплата)
    // ==========================================
    async _confirmBooking() {
        const ctx = AppState.bookingCtx;
        const user = AppState.currentUser;
        const priceInfo = ctx.selectedPrice || (ctx.selectedPC ? this._getPriceForBooking(ctx.selectedPC) : null);

        UI.hideModalBookingConfirm();

        // Проверяем баланс
        const totalPrice = parseFloat(priceInfo?.total_price || 0);

        if (user.balance < totalPrice) {
            UI.clearDialog();
            await UI.sayBarney(CONFIG.randomPhrase('noBalance') + `\n\nНеобходимо: ${totalPrice}₽, у тебя: ${user.balance}₽.`);

            UI.setActions([
                { label: 'Пополнить баланс', description: 'Добавить средства для оплаты брони', iconPath: './ui%20kit/icon/bulk/wallet-add.svg', primary: true, action: () => Profile._handleTopupModal() },
                { label: 'Выбрать другой ПК', description: 'Вернуться к списку доступных мест', iconPath: './ui%20kit/icon/bulk/monitor.svg', action: () => this._returnToModernBooking(true) },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);
            return;
        }

        UI.clearDialog();
        await UI.sayBarney('Оформляю бронь...');

        try {
            // Создаём бронирование через API
            const bookingData = {
                icafe_id: ctx.selectedCafe.icafe_id,
                pc_name: ctx.selectedPC.pc_name,
                member_account: user.login,
                member_id: user.memberId,
                start_date: ctx.selectedDate,
                start_time: ctx.selectedTime,
                mins: Number(priceInfo?.duration || ctx.selectedDuration || 60)
            };

            // Если выбран пакет — передаём product_id
            if (ctx.selectedPrice && ctx.selectedPrice.type === 'product') {
                bookingData.product_id = ctx.selectedPrice.product_id;
            }

            // Валидация: нельзя бронировать на прошедшее время
            const bookingDateTime = new Date(ctx.selectedDate + 'T' + ctx.selectedTime);
            const now = new Date();
            if (bookingDateTime < now) {
                await UI.sayBarney(CONFIG.randomPhrase('bookingFail') + `\n\nНельзя забронировать на прошедшее время. Выбери дату и время в будущем!`);
                UI.setActions([
                    { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
                ]);
                return;
            }

            const ownOverlap = await this._findOwnBookingOverlap();
            if (ownOverlap) {
                const overlapText = ownOverlap.conflictsCount > 1
                    ? (window.BBText?.t('booking.overlapBarneyMultiple', {
                        end: ownOverlap.endTime,
                    }) || `У тебя уже есть другие активные брони рядом с этим временем.\n\nБлижайший свободный старт — после ${ownOverlap.endTime}.`)
                    : (window.BBText?.t('booking.overlapBarney', {
                        pc: this._formatPcName(ownOverlap.pcName),
                        end: ownOverlap.endTime,
                    }) || `У тебя на этот промежуток времени уже забронирован ${this._formatPcName(ownOverlap.pcName)}.\n\nПопробуй после ${ownOverlap.endTime}.`);

                await UI.sayBarney(overlapText);
                UI.setActions([
                    { label: 'Выбрать другое время', description: 'Вернуться к выбору времени брони', iconPath: './ui%20kit/icon/bulk/clock.svg', primary: true, action: () => this._returnToModernBooking(false) },
                    { label: 'Мои брони', description: 'Посмотреть активные бронирования', iconPath: './ui%20kit/icon/bulk/calendar-tick.svg', action: () => Profile.showBookings() },
                    { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
                ]);
                return;
            }

            // Если для друга — добавляем friend_id и friend_pc_name
            if (ctx.bookingFor === 'friend' && ctx.selectedFriend) {
                bookingData.for_friend_id = ctx.selectedFriend.id;
                bookingData.friend_pc_name = ctx.selectedFriendPC ? ctx.selectedFriendPC.pc_name : null;
                console.log('[Booking] Friend booking data:', {
                    login: user.login,
                    memberId: user.memberId,
                    friendId: ctx.selectedFriend.id,
                    friendLogin: ctx.selectedFriend.login,
                    selfPC: ctx.selectedPC?.pc_name,
                    friendPC: ctx.selectedFriendPC?.pc_name,
                });
            }

            console.log('[Booking] Sending to API:', bookingData);

            const result = await API.createBooking(bookingData);

            // Баланс обновится из ответа внешнего API

            // Бронь сохранена во внешнем API — не нужно сохранять локально
            // При следующем запросе она загрузится из API

            // Сохраняем сумму доп. списания за пакет (для отмены)
            ctx.packageDeducted = parseFloat(result.package_deducted || 0);

            // Обновляем баланс из ответа booking.php
            if (result.balance !== undefined) {
                user.balance = API.applyDemoBalance(user, result.balance);
            }
            // Обновляем бонус и очки из vibe
            try {
                const vibeData = await API.getVibeProfile(user.login, user.icafeId);
                if (vibeData) {
                    user.bonusBalance = vibeData.bonusBalance;
                    user.points = vibeData.points;
                }
            } catch (e) {}

            AppState.saveSession();
            UI.updateStatusBar();

            // Формируем сообщение об успехе
            const vibeCost = parseFloat(result.price || result.booking_cost || 0);
            const packageCost = totalPrice;
            const isPackage = ctx.tariffType === 'package';

            let successMsg = CONFIG.randomPhrase('bookingSuccess') + `\n\n` +
                `Клуб: ${ctx.selectedCafe.address}\n` +
                `Тебе: ${ctx.selectedPC.pc_name.replace('pc', 'ПК')} (${ctx.selectedPC.pc_group_name || ctx.selectedPC.pc_area_name})\n` +
                `Дата: ${this._formatDateRu(ctx.selectedDate)} в ${ctx.selectedTime}\n` +
                `Длительность: ${ctx.selectedDuration} мин\n`;

            if (isPackage) {
                successMsg += `Пакет: ${packageCost}₽`;
            } else {
                successMsg += `Стоимость: ${totalPrice}₽`;
            }

            // Если для друга — показываем оба ПК и оба пароля
            if (ctx.bookingFor === 'friend' && ctx.selectedFriend && ctx.selectedFriendPC) {
                successMsg += `Другу: ${ctx.selectedFriendPC.pc_name.replace('pc', 'ПК')} (${ctx.selectedFriendPC.pc_group_name || ctx.selectedFriendPC.pc_area_name})\n`;
                successMsg += `Стоимость: ~${totalPrice * 2}₽ (2 ПК)\n`;

                if (result.booking_password) {
                    successMsg += `\nТвой пароль: ${result.booking_password}`;
                }
                if (result.for_friend && result.for_friend.booking_password) {
                    successMsg += `\nПароль друга: ${result.for_friend.booking_password}`;
                }
                successMsg += `\n\nСообщите пароли администратору при входе!`;

                let successFriendMsg = CONFIG.randomPhrase('friendBookingSuccess');
                successFriendMsg = successFriendMsg.replace('{friend_name}', ctx.selectedFriend.name || ctx.selectedFriend.login);
                await UI.sayBarney(successMsg + '\n\n' + successFriendMsg);
            } else {
                if (result.booking_password) {
                    successMsg += `\n\nПароль для активации: ${result.booking_password}\n` +
                        `Сообщи его администратору при входе!`;
                }
            }

            await UI.sayBarney(successMsg);

            UI.setActions([
                { label: 'Ещё бронь', description: 'Запустить новый сценарий бронирования', iconPath: './ui%20kit/icon/bulk/ticket.svg', primary: true, action: () => this.start() },
                { label: 'Мои брони', description: 'Посмотреть активные и прошлые бронирования', iconPath: './ui%20kit/icon/bulk/calendar-tick.svg', action: () => Profile.showBookings() },
                { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
            ]);

        } catch (e) {
            console.error('Booking error:', e);

            const errMsg = e.message || '';
            if (errMsg.includes('600') || errMsg.includes('occupied')) {
                await UI.sayBarney(
                    `Не получилось забронировать этот терминал.\n\n` +
                    `Попробуй соседний свободный ПК или другое время.`
                );

                UI.setActions([
                    { label: 'Выбрать другой ПК', description: 'Вернуться к списку доступных мест', iconPath: './ui%20kit/icon/bulk/monitor.svg', primary: true, action: () => this._returnToModernBooking(true) },
                    { label: 'Назад', description: 'Вернуться без продолжения брони', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', action: () => this._returnToModernBooking(false) },
                    { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
                ]);
            } else {
                await UI.sayBarney(
                    CONFIG.randomPhrase('bookingFail') + '\n\n' +
                    `Ошибка: ${e.message}`
                );

                UI.setActions([
                    { label: 'Попробовать снова', description: 'Повторить подтверждение выбранной брони', iconPath: './ui%20kit/icon/bulk/refresh.svg', primary: true, action: () => this.confirmSelectedPC() },
                    { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() },
                ]);
            }
        }
    },

    // ==========================================
    // Вспомогательные функции
    // ==========================================

    // Получить цену для отображения в сетке ПК
    _formatPrice(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '—';
        const rounded = Math.round(num);
        const diff = Math.abs(num - rounded);
        // Если есть копейки — показываем с точностью, иначе целое
        return diff > 0.001 ? num.toFixed(2) + '₽' : rounded + '₽';
    },

    _getSelectedBookingAmountLabel() {
        const ctx = AppState.bookingCtx;
        const priceInfo = ctx.selectedPrice || (ctx.selectedPC ? this._getPriceForBooking(ctx.selectedPC) : null);
        const amount = priceInfo?.total_price;

        if (amount === undefined || amount === null || amount === '') {
            return '\u0421\u0443\u043c\u043c\u0430: \u2014';
        }

        return `\u0421\u0443\u043c\u043c\u0430: ${this._formatPrice(amount)}`;
    },

    _getPCPrice(pc) {
        const ctx = AppState.bookingCtx;
        if (!ctx.prices) return null;

        const pcGroup = (pc.pc_group_name || pc.pc_area_name || 'Default').trim();
        const selectedDur = ctx.selectedDuration;

        // Почасовой — ищем по зоне + длительности
        const price = ctx.prices.prices?.find(p => {
            const pgn = (p.group_name || '').trim();
            const dur = parseInt(p.duration || 60);
            return dur === selectedDur && pgn.toLowerCase() === pcGroup.toLowerCase();
        });

        if (price) {
            return this._formatPrice(price.total_price || 0);
        }

        // Fallback: Default
        const fallback = ctx.prices.prices?.find(p => {
            const pgn = (p.group_name || '').trim();
            const dur = parseInt(p.duration || 60);
            return dur === selectedDur && pgn.toLowerCase() === 'default';
        });

        if (fallback) {
            return this._formatPrice(fallback.total_price || 0);
        }

        return null;
    },

    // Получить цену для бронирования
    _getPriceForBooking(pc) {
        const ctx = AppState.bookingCtx;
        if (!ctx.prices) return null;

        const groupName = pc.pc_group_name || pc.pc_area_name || 'Default';

        // Если выбран пакет — ищем без привязки к зоне ПК
        // Пакеты с group_name="Booking" — глобальные, работают для любой зоны
        if (ctx.tariffType === 'package' && ctx.selectedPackageName) {
            const offer = this._packageOfferForZone(groupName);

            if (offer) {
                return {
                    type: 'product',
                    product_id: offer.product_id,
                    product_name: ctx.selectedPackageName,
                    total_price: Number(offer.price || 0),
                    duration: Number(offer.duration || ctx.selectedDuration || 60)
                };
            }
        }

        // Почасовой тариф — сначала ищем по зоне ПК, потом fallback на Default
        const targetZone = groupName.toLowerCase();

        // 1. Ищем по зоне ПК
        const zonePrice = ctx.prices.prices?.find(p => {
            const pgn = (p.group_name || '').toLowerCase();
            const dur = parseInt(p.duration || 60);
            return dur === ctx.selectedDuration && pgn === targetZone;
        });

        if (zonePrice) {
            return {
                type: 'price',
                price_id: zonePrice.price_id,
                price_name: zonePrice.price_name,
                total_price: parseFloat(zonePrice.total_price || 0),
                duration: ctx.selectedDuration
            };
        }

        // 2. Fallback: Default
        const defaultPrice = ctx.prices.prices?.find(p => {
            const pgn = (p.group_name || '').toLowerCase();
            const dur = parseInt(p.duration || 60);
            return dur === ctx.selectedDuration && pgn === 'default';
        });

        if (defaultPrice) {
            return {
                type: 'price',
                price_id: defaultPrice.price_id,
                price_name: defaultPrice.price_name,
                total_price: parseFloat(defaultPrice.total_price || 0),
                duration: ctx.selectedDuration
            };
        }

        // Fallback: считаем по 120₽/час со скидкой
        const hours = ctx.selectedDuration / 60;
        const basePrice = 120 * hours;
        const discount = AppState.currentUser.discount || 0;
        const total = basePrice * (1 - discount);

        return {
            type: ctx.tariffType === 'package' ? 'product' : 'price',
            price_name: ctx.tariffType === 'package' ? 'Пакет' : `${groupName} почасовой`,
            total_price: Math.round(total),
            duration: ctx.selectedDuration
        };
    },

    // ==========================================
    // Парсинг длительности из названия пакета
    // (если duration_min в API неверен)
    // ==========================================
    _parseDurationFromProduct(product) {
        // Если duration_min есть и он > 0 — используем его
        const apiDur = parseInt(product.duration_min || product.duration || 0);

        // Пытаемся извлечь из названия: "3 часа/пакет" → 180, "5 часов/пакет" → 300
        const name = product.product_name || '';
        const match = name.match(/(\d+)\s*ч/);

        if (match) {
            const hoursFromName = parseInt(match[1]);
            const minsFromName = hoursFromName * 60;

            // Если API вернул duration и он совпадает с названием — используем
            if (apiDur > 0 && apiDur === minsFromName) return apiDur;

            // Если API вернул подозрительный результат — берём из названия
            // (например, "5 часов/пакет" с duration_min=180 → 300)
            if (apiDur > 0 && apiDur !== minsFromName) {
                // Проверяем: если duration_min совпадает с другим продуктом
                // значит это баг API — используем название
                return minsFromName;
            }

            return minsFromName;
        }

        // Fallback: используем API duration или выбранный
        return apiDur || AppState.bookingCtx.selectedDuration;
    },

    // ==========================================
    // Дефолтные цены (когда API возвращает пустые тарифы)
    // ==========================================
    _getDefaultPrices(duration) {
        const discount = AppState.currentUser?.discount || 0;
        const hours = duration / 60;
        const basePerHour = 120; // 120₽/час
        const totalPrice = Math.round(basePerHour * hours * (1 - discount));

        return {
            prices: [
                {
                    price_id: 0,
                    price_name: 'Почасовой',
                    price_price1: String(basePerHour),
                    duration: '60',
                    total_price: String(totalPrice),
                    group_name: 'Default'
                }
            ],
            products: [
                {
                    product_id: 0,
                    product_name: `${duration} минут`,
                    product_price: String(basePerHour * hours),
                    duration: String(duration),
                    duration_min: String(duration),
                    is_calc_duration: false,
                    total_price: String(totalPrice),
                    group_name: 'Default'
                }
            ]
        };
    },

    // Форматировать дату в русский формат
    _formatDateRu(dateStr) {
        if (!dateStr) return '—';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        return dateStr;
    }
};
