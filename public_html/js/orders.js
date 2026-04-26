const Orders = {
    cart: {},
    fulfillment: 'pickup',
    payment: 'balance',
    comment: '',
    activeTab: 'catalog',
    ordersCache: [],
    orderClub: null,
    orderClubSource: 'default',
    orderTableName: '',
    activeFoodCategory: null,
    foodSearch: '',
    isCartOpen: false,
    ordersInnerTab: 'active',

    async showFoodMenu(tab = 'catalog') {
        AppState.dialogScreen = 'food';
        if (tab === 'orders') tab = this.ordersInnerTab || 'active';
        this.activeTab = tab;
        if (tab === 'catalog') {
            this.cart = {};
            this.fulfillment = 'pickup';
            this.payment = 'balance';
            this.comment = '';
            this.orderClub = null;
            this.orderClubSource = 'default';
            this.orderTableName = '';
            this.activeFoodCategory = Object.keys(CATALOG.food)[0] || null;
            this.foodSearch = '';
            this.isCartOpen = false;
            await this._resolveOrderClub(false);
        } else if (tab === 'active' || tab === 'history') {
            this.ordersInnerTab = tab;
        }
        UI.clearDialog();
        await UI.sayBarney(tab === 'catalog' ? 'Выбирай позиции, я соберу корзину и оформлю заказ.' : 'Сейчас покажу твои заказы.');
        this._renderShell();
        if (tab === 'catalog') this._renderCatalog();
        else await this._renderOrders(tab);
        this._bindStatic();
    },

    _items() {
        return Object.entries(CATALOG.food).flatMap(([category, items]) => items.map(item => ({ ...item, category })));
    },

    _selected() {
        const byId = new Map(this._items().map(item => [item.id, item]));
        return Object.entries(this.cart)
            .map(([id, qty]) => ({ ...byId.get(id), qty }))
            .filter(item => item.id && item.qty > 0);
    },

    _totals() {
        const subtotal = this._selected().reduce((sum, item) => sum + item.price * item.qty, 0);
        const deliveryFee = this.fulfillment === 'delivery' ? 100 : 0;
        return { subtotal, deliveryFee, total: subtotal + deliveryFee };
    },

    _renderShell() {
        UI.appendContent(`
            <div class="food-order">
                <div class="order-tabs" role="tablist">
                    <button class="${this.activeTab === 'catalog' ? 'active' : ''}" data-order-tab="catalog">Каталог</button>
                    <button class="${this.activeTab === 'active' || this.activeTab === 'history' ? 'active' : ''}" data-order-tab="orders">Заказы</button>
                </div>
                <div id="food-order-view"></div>
            </div>
        `);
        this._setNavActions();
    },

    _renderCatalog() {
        const categories = Object.keys(CATALOG.food);
        if (!this.activeFoodCategory || !CATALOG.food[this.activeFoodCategory]) {
            this.activeFoodCategory = categories[0] || null;
        }
        const visibleItems = this._visibleItems();
        const selectedCount = this._selected().reduce((sum, item) => sum + item.qty, 0);
        const totals = this._totals();

        document.getElementById('food-order-view').innerHTML = `
            <div class="food-shop">
                <div class="food-shop-toolbar">
                    <div class="food-category-scroll" role="tablist" aria-label="Категории меню">
                        ${categories.map(category => `
                            <button class="food-category-chip ${category === this.activeFoodCategory ? 'active' : ''}" data-food-category="${this._escapeAttr(category)}" type="button">${this._escape(this._categoryLabel(category))}</button>
                        `).join('')}
                    </div>
                    <input class="food-search" id="food-search" type="search" placeholder="Найти напиток или перекус" value="${this._escapeAttr(this.foodSearch)}">
                </div>
                <div class="food-product-grid">
                    ${visibleItems.length ? visibleItems.map(item => this._renderItem(item)).join('') : '<div class="food-cart-empty">Ничего не нашли. Попробуй другую категорию или запрос.</div>'}
                </div>
                <div class="food-mini-cart-bar ${selectedCount ? 'has-items' : ''}">
                    <button class="food-mini-cart" id="food-mini-cart" type="button" ${selectedCount ? '' : 'disabled'}>
                        <span>Корзина</span>
                        <strong>${selectedCount ? `${selectedCount} поз. • ${totals.total}₽` : 'Пусто'}</strong>
                    </button>
                    <button class="food-mini-checkout" id="food-mini-checkout" type="button" ${selectedCount ? '' : 'disabled'}>Оформить</button>
                </div>
                ${this.isCartOpen ? `<div class="food-cart-panel" id="food-cart-panel">${this._renderCart()}</div>` : ''}
            </div>
        `;
        this._bindCatalog();
    },

    _visibleItems() {
        const query = this.foodSearch.trim().toLowerCase();
        const source = query
            ? this._items()
            : (CATALOG.food[this.activeFoodCategory] || []).map(item => ({ ...item, category: this.activeFoodCategory }));
        return source.filter(item => {
            if (!query) return true;
            return `${item.name} ${item.size} ${item.category}`.toLowerCase().includes(query);
        });
    },

    _categoryLabel(category) {
        return String(category || '').replace(/\s*\([^)]*\)\s*$/u, '');
    },

    _renderItem(item) {
        const qty = this.cart[item.id] || 0;
        return `
            <div class="food-order-item" data-id="${this._escapeAttr(item.id)}">
                <div class="food-order-info">
                    <strong>${this._escape(item.name)}</strong>
                    <span>${this._escape(item.size)}</span>
                </div>
                <div class="food-order-price">${item.price}₽</div>
                <div class="qty-stepper">
                    <button class="qty-btn" data-action="dec" aria-label="Уменьшить">−</button>
                    <span class="qty-value">${qty}</span>
                    <button class="qty-btn" data-action="inc" aria-label="Добавить">+</button>
                </div>
            </div>
        `;
    },

    _renderCart() {
        const items = this._selected();
        const totals = this._totals();
        const rows = items.length
            ? items.map(item => `<div class="food-cart-row"><span>${this._escape(item.name)} × ${item.qty}</span><b>${item.price * item.qty}₽</b></div>`).join('')
            : '<div class="food-cart-empty">Корзина пустая</div>';
        const club = this.orderClub || {};
        const tableValue = this._escapeAttr(this.orderTableName || '');

        return `
            <div class="food-cart-title">Корзина</div>
            ${rows}
            <div class="food-order-summary">
                <div class="food-cart-row"><span>Товары</span><b>${totals.subtotal}₽</b></div>
                ${this.fulfillment === 'delivery' ? `<div class="food-cart-row"><span>Доставка за ПК</span><b>${totals.deliveryFee}₽</b></div>` : ''}
                <div class="food-cart-total"><span>Итого</span><strong>${totals.total}₽</strong></div>
            </div>
            <div class="food-cart-club">
                <label class="food-club-select-label" for="food-order-club-select">
                    <span>Клуб</span>
                    <select id="food-order-club-select">${this._clubOptions()}</select>
                </label>
                <div class="food-cart-club-actions ${this.orderClubSource === 'manual' ? '' : 'hidden'}">
                    <button class="btn btn-secondary btn-small" id="food-club-auto" type="button">Определить автоматически</button>
                </div>
            </div>
            <div class="order-segment" data-group="fulfillment">
                <button class="${this.fulfillment === 'pickup' ? 'active' : ''}" data-value="pickup">Самовывоз</button>
                <button class="${this.fulfillment === 'delivery' ? 'active' : ''}" data-value="delivery">Доставить за ПК +100₽</button>
            </div>
            <div class="order-segment order-payments" data-group="payment">
                ${[
                    ['balance', 'Баланс'],
                    ['card_app', 'Карта в приложении'],
                    ['sbp_app', 'СБП'],
                    ['cash', 'Наличка'],
                    ['terminal_card', 'Терминал'],
                    ['terminal_qr', 'QR на кассе']
                ].map(([value, label]) => `<button class="${this.payment === value ? 'active' : ''}" data-value="${value}">${label}</button>`).join('')}
            </div>
            <input class="order-comment" id="food-order-table" placeholder="${this.fulfillment === 'delivery' ? 'ПК для доставки, например PC09' : 'Стол или комментарий к выдаче'}" value="${tableValue}">
            <textarea class="order-comment" id="food-order-comment" placeholder="Комментарий к заказу">${this._escape(this.comment)}</textarea>
            <button class="btn btn-primary food-submit" ${items.length ? '' : 'disabled'}>Оформить заказ</button>
        `;
    },

    _clubOptions() {
        return this._clubList().map(cafe => {
            const id = String(cafe.icafe_id || cafe.id || '');
            const selected = String(this.orderClub?.id || '') === id ? 'selected' : '';
            return `<option value="${this._escapeAttr(id)}" ${selected}>${this._escape(cafe.name || cafe.address || `Клуб ${id}`)}</option>`;
        }).join('');
    },

    _refreshCartOnly() {
        this.comment = document.getElementById('food-order-comment')?.value || this.comment;
        this.orderTableName = document.getElementById('food-order-table')?.value || this.orderTableName;
        this._renderCatalog();
    },

    _bindStatic() {
        document.querySelectorAll('[data-order-tab]').forEach(btn => {
            btn.addEventListener('click', () => this.showFoodMenu(btn.dataset.orderTab));
        });
    },

    _bindCatalog() {
        document.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('.food-order-item').dataset.id;
                const next = (this.cart[id] || 0) + (btn.dataset.action === 'inc' ? 1 : -1);
                if (next <= 0) delete this.cart[id];
                else this.cart[id] = next;
                if (next > 0) this.isCartOpen = true;
                this._refreshCartOnly();
            });
        });
        document.querySelectorAll('[data-food-category]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeFoodCategory = btn.dataset.foodCategory;
                this.foodSearch = '';
                this._renderCatalog();
            });
        });
        document.getElementById('food-search')?.addEventListener('input', (event) => {
            this.foodSearch = event.target.value || '';
            this._renderCatalog();
            const nextSearch = document.getElementById('food-search');
            if (nextSearch) {
                nextSearch.focus();
                try {
                    nextSearch.setSelectionRange(this.foodSearch.length, this.foodSearch.length);
                } catch (e) {}
            }
        });
        document.getElementById('food-mini-cart')?.addEventListener('click', () => {
            this.isCartOpen = !this.isCartOpen;
            this._renderCatalog();
        });
        document.getElementById('food-mini-checkout')?.addEventListener('click', () => {
            this.isCartOpen = true;
            this._renderCatalog();
            document.getElementById('food-cart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        this._bindCartControls();
    },

    _bindCartControls() {
        document.querySelectorAll('.order-segment button').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.closest('.order-segment').dataset.group;
                this[group] = btn.dataset.value;
                if (group === 'fulfillment') this._handleFulfillmentChange();
                else this._refreshCartOnly();
            });
        });
        document.getElementById('food-club-auto')?.addEventListener('click', async () => {
            await this._resolveOrderClub(true);
            this._refreshCartOnly();
        });
        document.getElementById('food-order-club-select')?.addEventListener('change', (event) => {
            this._setManualClub(event.target.value);
            this._refreshCartOnly();
        });
        document.querySelector('.food-submit')?.addEventListener('click', () => this._submit());
    },

    async _handleFulfillmentChange() {
        if (this.fulfillment === 'pickup') {
            this.orderTableName = '';
            this._refreshCartOnly();
            return;
        }

        if (!this.orderTableName) {
            const session = await this._findSessionClub();
            if (session?.tableName) {
                this.orderTableName = session.tableName;
                if (session.club && this.orderClubSource !== 'manual') {
                    this.orderClub = session.club;
                    this.orderClubSource = session.source;
                }
            }
        }
        this._refreshCartOnly();
    },

    async _renderOrders(tab) {
        const view = document.getElementById('food-order-view');
        const group = tab === 'history' ? 'history' : 'active';
        this.ordersInnerTab = group;
        view.innerHTML = this._renderOrdersTabs(group) + '<div class="food-cart-empty">Загружаю заказы...</div>';
        this.ordersCache = await API.getFoodOrders(AppState.currentUser.login, group);

        if (!this.ordersCache.length) {
            view.innerHTML = this._renderOrdersTabs(group) + `<div class="food-cart-empty">${group === 'active' ? 'Активных заказов нет' : 'История заказов пустая'}</div>`;
            this._bindOrderInnerTabs(view);
            return;
        }

        view.innerHTML = `
            ${this._renderOrdersTabs(group)}
            <div class="food-orders-list">
                ${this.ordersCache.map(order => this._renderOrderCard(order)).join('')}
            </div>
        `;
        this._bindOrderInnerTabs(view);
        view.querySelectorAll('[data-order-id]').forEach(btn => {
            btn.addEventListener('click', () => this.showOrderDetails(parseInt(btn.dataset.orderId, 10)));
        });
    },

    _renderOrdersTabs(group) {
        return `
            <div class="order-inner-tabs" role="tablist">
                <button class="${group === 'active' ? 'active' : ''}" data-order-status-tab="active" type="button">Активные</button>
                <button class="${group === 'history' ? 'active' : ''}" data-order-status-tab="history" type="button">История</button>
            </div>
        `;
    },

    _bindOrderInnerTabs(root) {
        root.querySelectorAll('[data-order-status-tab]').forEach(btn => {
            btn.addEventListener('click', () => this.showFoodMenu(btn.dataset.orderStatusTab));
        });
    },

    _renderOrderCard(order) {
        const status = this._statusLabel(order.status);
        const items = (order.items || []).map(item => `${item.name} × ${item.qty}`).join(', ');
        return `
            <button class="order-card" data-order-id="${order.id}">
                <span class="order-card-title">Заказ #${order.id}</span>
                <span>${status} • ${order.total}₽</span>
                <small>${this._escape(items || 'Открыть детали')}</small>
            </button>
        `;
    },

    async showOrderDetails(id) {
        const order = await API.getFoodOrder(id, AppState.currentUser.login);
        UI.clearDialog();
        const isCompleted = order.status === 'completed';
        UI.appendContent(`
            <div class="order-details">
                <h3>Заказ #${order.id}</h3>
                <div class="order-status-line">${this._statusLabel(order.status)} • ${this._paymentLabel(order.payment_status)}</div>
                <div class="order-detail-list">
                    ${(order.items || []).map(item => `
                        <div class="food-cart-row"><span>${this._escape(item.name)} ${this._escape(item.size || '')} × ${item.qty}</span><b>${item.total}₽</b></div>
                    `).join('')}
                </div>
                <div class="food-cart-row"><span>Товары</span><b>${order.subtotal}₽</b></div>
                ${parseFloat(order.delivery_fee || 0) > 0 ? `<div class="food-cart-row"><span>Доставка</span><b>${order.delivery_fee}₽</b></div>` : ''}
                <div class="food-cart-total"><span>Итого</span><strong>${order.total}₽</strong></div>
                <p>Клуб: <b>${this._escape(order.cafe_name || order.cafe_address || 'не указан')}</b></p>
                ${order.cafe_address ? `<p class="order-muted">${this._escape(order.cafe_address)}</p>` : ''}
                <p>Получение: ${order.fulfillment_type === 'delivery' ? 'Доставка за ПК' : 'Самовывоз'} ${order.table_name ? `• ${this._escape(order.table_name)}` : ''}</p>
                <p>Оплата: ${this._paymentMethodLabel(order.payment_method)}</p>
                <p class="order-confirm-line">Код: <b>${order.confirmation_code}</b>${order.created_at ? `<span>Оформлен: ${this._formatOrderDate(order.created_at)}</span>` : ''}</p>
                <div class="order-qr-wrap">
                    <div class="order-qr" id="order-qr"></div>
                </div>
                ${order.client_comment ? `<p>Комментарий: ${this._escape(order.client_comment)}</p>` : ''}
                ${order.completed_at ? `<p class="order-muted">Завершен: ${this._formatOrderDate(order.completed_at)}</p>` : ''}
                ${isCompleted ? this._renderTipForm(order) : ''}
            </div>
        `);
        this._renderQr(order);
        this._bindTipForm(order.id);
        UI.setActions([
            { label: 'Назад', description: 'Вернуться к заказам', iconPath: './ui%20kit/icon/bulk/arrow-left.svg', action: () => this.showFoodMenu(isCompleted || order.status === 'cancelled' ? 'history' : 'active') },
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() }
        ]);
    },

    _renderQr(order) {
        const target = document.getElementById('order-qr');
        if (!target) return;
        target.innerHTML = '';
        const adminPath = (window.BB_APP_CONFIG?.adminApi || '/admin/api/admin-api.php')
            .replace(/\/api\/admin-api\.php$/, '/index.html');
        const value = order.qr_token || `${location.origin}${adminPath}?order=${order.id}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(target, {
                text: value,
                width: 132,
                height: 132,
                colorDark: '#061018',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M,
            });
        } else {
            target.textContent = value;
        }
    },

    _renderTipForm(order) {
        const tip = parseFloat(order.tip_amount || 0);
        if (tip > 0) {
            return `<p class="order-muted">Чаевые: ${tip}₽</p>`;
        }
        return `
            <div class="tip-box">
                <div class="food-cart-title">Оставить чаевые</div>
                <div class="order-segment tip-segment">
                    <button data-tip="50">50₽</button>
                    <button data-tip="100" class="active">100₽</button>
                    <button data-tip="150">150₽</button>
                </div>
                <input class="order-comment" id="tip-custom" type="number" min="1" step="1" placeholder="Другая сумма">
                <button class="btn btn-primary" id="btn-add-tip" data-tip="100">Оставить 100₽</button>
            </div>
        `;
    },

    _bindTipForm(orderId) {
        let selected = 100;
        document.querySelectorAll('.tip-segment button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tip-segment button').forEach(item => item.classList.remove('active'));
                btn.classList.add('active');
                selected = parseInt(btn.dataset.tip, 10);
                const submit = document.getElementById('btn-add-tip');
                if (submit) submit.textContent = `Оставить ${selected}₽`;
            });
        });
        document.getElementById('tip-custom')?.addEventListener('input', (event) => {
            const value = parseInt(event.target.value, 10);
            if (Number.isFinite(value) && value > 0) {
                selected = value;
                document.querySelectorAll('.tip-segment button').forEach(item => item.classList.remove('active'));
                const submit = document.getElementById('btn-add-tip');
                if (submit) submit.textContent = `Оставить ${selected}₽`;
            }
        });
        document.getElementById('btn-add-tip')?.addEventListener('click', async () => {
            await API.addOrderTip(orderId, AppState.currentUser.login, selected);
            await UI.sayBarney('Чаевые добавлены. Спасибо!');
            await this.showOrderDetails(orderId);
        });
    },

    async _submit() {
        const items = this._selected();
        if (!items.length) return;

        this.comment = document.getElementById('food-order-comment')?.value || '';
        this.orderTableName = document.getElementById('food-order-table')?.value || this.orderTableName || '';
        if (!this.orderClub) await this._resolveOrderClub(false);
        const club = this.orderClub || {};
        const payload = {
            login: AppState.currentUser.login,
            member_id: AppState.currentUser.memberId || AppState.currentUser.member_id || null,
            cafe_id: club.id || AppState.currentUser.icafeId || AppState.currentUser.icafe_id || null,
            cafe_name: club.name || club.address || '',
            cafe_address: club.address || '',
            session_source: this.orderClubSource || 'default',
            table_name: this.orderTableName,
            fulfillment_type: this.fulfillment,
            payment_method: this.payment,
            comment: this.comment,
            items: items.map(({ id, category, name, size, price, qty }) => ({ id, category, name, size, price, qty }))
        };

        try {
            const order = await API.createFoodOrder(payload);
            if (['balance', 'card_app', 'sbp_app'].includes(this.payment)) {
                return this._showPaymentFlow(order);
            }
            this.cart = {};
            await this.showOrderDetails(order.id);
        } catch (e) {
            await UI.sayBarney(e.message || 'Не получилось оформить заказ.');
        }
    },

    _showPaymentFlow(order) {
        UI.clearDialog();
        const total = parseFloat(order.total || 0);
        const content = {
            balance: `
                <h3>Оплата балансом</h3>
                <p>Списать ${total}₽ с баланса?</p>
                <button class="btn btn-primary food-pay-confirm" data-flow="balance">Подтвердить списание</button>
            `,
            card_app: `
                <h3>Карта в приложении</h3>
                <input class="order-comment" id="card-number" inputmode="numeric" placeholder="Номер карты">
                <div class="food-payment-grid">
                    <input class="order-comment" id="card-exp" placeholder="MM/YY">
                    <input class="order-comment" id="card-cvc" inputmode="numeric" placeholder="CVC">
                </div>
                <input class="order-comment" id="card-name" placeholder="Имя на карте">
                <button class="btn btn-primary food-pay-confirm" data-flow="card_app">Оплатить ${total}₽</button>
            `,
            sbp_app: `
                <h3>СБП</h3>
                <select class="order-comment" id="sbp-bank">
                    <option>СберБанк</option>
                    <option>Т-Банк</option>
                    <option>Альфа-Банк</option>
                </select>
                <div class="order-muted" id="sbp-state">Выбери банк и продолжи.</div>
                <button class="btn btn-primary food-pay-confirm" data-flow="sbp_app">Открыть банк</button>
            `
        }[this.payment];

        UI.appendContent(`<div class="order-details food-payment-flow">${content}<div class="modal-error" id="food-payment-error"></div></div>`);
        document.querySelector('.food-pay-confirm')?.addEventListener('click', async () => this._confirmPaymentFlow(order));
        UI.setActions([
            { label: 'К заказу', description: 'Открыть заказ без оплаты', iconPath: './ui%20kit/icon/bulk/receipt-text.svg', action: () => this.showOrderDetails(order.id) },
            { label: 'Главное меню', description: 'Вернуться к основным разделам', iconPath: './ui%20kit/icon/bulk/home.svg', action: () => Dialogs.mainMenu() }
        ]);
    },

    async _confirmPaymentFlow(order) {
        const error = document.getElementById('food-payment-error');
        const button = document.querySelector('.food-pay-confirm');
        const payload = {};
        if (this.payment === 'card_app') {
            const number = document.getElementById('card-number')?.value.replace(/\s+/g, '') || '';
            const exp = document.getElementById('card-exp')?.value || '';
            const cvc = document.getElementById('card-cvc')?.value || '';
            const name = document.getElementById('card-name')?.value || '';
            if (number.length < 12 || !/^\d{2}\/\d{2}$/.test(exp) || cvc.length < 3 || name.trim().length < 2) {
                if (error) error.textContent = 'Проверь номер карты, срок, CVC и имя.';
                return;
            }
            Object.assign(payload, { card_last4: number.slice(-4), exp, name });
        }
        if (this.payment === 'sbp_app') {
            const state = document.getElementById('sbp-state');
            if (state) state.textContent = 'Открываем банк...';
            await this._sleep(700);
            if (state) state.textContent = 'Оплата подтверждена, возвращаемся в приложение...';
            payload.bank = document.getElementById('sbp-bank')?.value || '';
        }
        if (button) {
            button.disabled = true;
            button.textContent = 'Обрабатываем...';
        }
        await this._sleep(800);
        const paid = await API.simulateFoodPayment(order.id, this.payment, payload);
        if (this.payment === 'balance' && Number.isFinite(parseFloat(paid.balance_after))) {
            AppState.currentUser.balance = parseFloat(paid.balance_after);
            AppState.saveSession();
            UI.updateStatusBar();
        }
        this.cart = {};
        await this.showOrderDetails(order.id);
    },

    async _resolveOrderClub(forceAuto = false) {
        if (this.orderClubSource === 'manual' && !forceAuto) return this.orderClub;
        if (!AppState.cafes || AppState.cafes.length === 0) {
            AppState.cafes = await API.getCafes();
        }
        const session = await this._findSessionClub();
        if (session) {
            this.orderClub = session.club;
            this.orderClubSource = session.source;
            if (this.fulfillment === 'delivery') {
                this.orderTableName = session.tableName || this.orderTableName;
            }
            return this.orderClub;
        }
        const currentCafeId = AppState.currentUser?.icafeId || AppState.currentUser?.icafe_id;
        const current = this._clubList().find(cafe => String(cafe.icafe_id || cafe.id) === String(currentCafeId));
        const fallback = current || this._clubList()[0] || null;
        this.orderClub = this._normalizeClub(fallback);
        this.orderClubSource = 'default';
        return this.orderClub;
    },

    async _findSessionClub() {
        const bookings = await this._loadUserBookingsSafe();
        const now = new Date();
        const normalized = bookings.map(b => this._normalizeBooking(b)).filter(Boolean).sort((a, b) => a.start - b.start);
        const active = normalized.find(item => item.start <= now && item.end > now);
        if (active) return { source: 'active_session', club: active.club, tableName: active.tableName };
        const future = normalized.find(item => item.start > now);
        if (future) return { source: 'nearest_booking', club: future.club, tableName: future.tableName };
        return null;
    },

    async _loadUserBookingsSafe() {
        const cached = Array.isArray(AppState.currentUser?.bookings) ? AppState.currentUser.bookings : [];
        try {
            const fresh = await API.getUserBookings(AppState.currentUser.login);
            return Object.values(fresh || {}).flat().concat(cached);
        } catch (e) {
            return cached;
        }
    },

    _normalizeBooking(booking) {
        const fromParts = String(booking.product_available_date_local_from || '').split(' ');
        const toParts = String(booking.product_available_date_local_to || '').split(' ');
        const date = booking.start_date || booking.date || booking.booking_date || fromParts[0];
        const time = String(booking.start_time || booking.time || fromParts[1] || '').substring(0, 5);
        if (!date || !time) return null;
        const start = new Date(`${date}T${time}:00`);
        if (Number.isNaN(start.getTime())) return null;
        const duration = parseInt(booking.duration_min || booking.duration || 60, 10) || 60;
        const endTime = booking.end_time || toParts[1] || '';
        const end = endTime
            ? new Date(`${date}T${String(endTime).substring(0, 5)}:00`)
            : new Date(start.getTime() + duration * 60000);
        const cafeId = booking.cafe_id || booking.icafe_id || AppState.currentUser?.icafeId || AppState.currentUser?.icafe_id;
        const cafe = this._clubList().find(item => String(item.icafe_id || item.id) === String(cafeId));
        return {
            start,
            end,
            club: this._normalizeClub(cafe || { icafe_id: cafeId, address: booking.cafe_name || booking.cafe_address || '' }),
            tableName: booking.pc_name || booking.product_pc_name || booking.table_name || ''
        };
    },

    _setManualClub(id) {
        const cafe = this._clubList().find(item => String(item.icafe_id || item.id) === String(id));
        if (cafe) {
            this.orderClub = this._normalizeClub(cafe);
            this.orderClubSource = 'manual';
        }
    },

    _clubList() {
        return AppState.cafes && AppState.cafes.length ? AppState.cafes : [
            { icafe_id: '74922', address: 'BlackBears Play, Астраханская' },
            { icafe_id: '76301', address: 'BlackBears Play, Советская' }
        ];
    },

    _normalizeClub(cafe) {
        if (!cafe) return null;
        return {
            id: cafe.icafe_id || cafe.id || cafe.cafe_id || '',
            name: cafe.name || cafe.title || cafe.address || '',
            address: cafe.address || cafe.name || ''
        };
    },

    _statusLabel(status) {
        return {
            new: 'Новый',
            awaiting_pickup: 'Ожидает выдачи',
            delivering: 'Доставляется',
            completed: 'Завершен',
            cancelled: 'Отменен'
        }[status] || status;
    },

    _paymentLabel(status) {
        return {
            pending: 'Оплата ожидается',
            paid: 'Оплачено',
            pay_on_pickup: 'Оплата на месте'
        }[status] || status;
    },

    _paymentMethodLabel(method) {
        return {
            balance: 'Баланс',
            card_app: 'Карта в приложении',
            sbp_app: 'СБП',
            cash: 'Наличными при выдаче',
            terminal_card: 'Картой на терминале',
            terminal_qr: 'QR на кассе'
        }[method] || method;
    },

    _formatOrderDate(value) {
        if (!value) return '—';
        const date = new Date(String(value).replace(' ', 'T'));
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    _setNavActions() {
        UI.setActions([
            {
                label: 'Назад',
                description: 'Вернуться на предыдущий экран',
                iconPath: './ui%20kit/icon/bulk/arrow-left.svg',
                action: () => Dialogs.mainMenu()
            }
        ]);
    },

    _escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },

    _escapeAttr(value) {
        return this._escape(value).replace(/`/g, '&#96;');
    },

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
