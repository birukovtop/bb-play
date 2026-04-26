/**
 * BlackBears Play вЂ” РњРѕРґСѓР»СЊ СЂР°Р±РѕС‚С‹ СЃ API
 * 
 * РђСЂС…РёС‚РµРєС‚СѓСЂР°:
 * - РђРІС‚РѕСЂРёР·Р°С†РёСЏ, СЂРµРіРёСЃС‚СЂР°С†РёСЏ, Р±Р°Р»Р°РЅСЃ, Р±СЂРѕРЅРё вЂ” Р»РѕРєР°Р»СЊРЅС‹Р№ PHP API (/api/*.php)
 * - Р”Р°РЅРЅС‹Рµ РєР»СѓР±РѕРІ, С‚Р°СЂРёС„С‹, РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ РџРљ вЂ” С‡РµСЂРµР· PHP-РїСЂРѕРєСЃРё (/api/proxy.php)
 *   (С‡С‚РѕР±С‹ РѕР±РѕР№С‚Рё CORS Р±СЂР°СѓР·РµСЂР°)
 */
const API = {

    // Р‘Р°Р·РѕРІС‹Р№ URL Р»РѕРєР°Р»СЊРЅРѕРіРѕ API
    LOCAL_API: window.BB_APP_CONFIG?.apiBase || '/api',

    formatMoney(amount, currency = null) {
        const resolvedCurrency = currency ?? window.BBText?.t('common.currencyRub', {}, '₽');
        const num = parseFloat(amount);
        if (!Number.isFinite(num)) return `0${resolvedCurrency}`;

        const rounded = Math.round(num);
        if (Math.abs(num - rounded) < 0.001) {
            return `${rounded}${resolvedCurrency}`;
        }

        return `${num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}${resolvedCurrency}`;
    },

    normalizeDiscount(value, fallback = 0) {
        const parsed = parseFloat(value);
        if (!Number.isFinite(parsed)) return fallback;
        if (parsed > 1) return parsed / 100;
        if (parsed < 0) return fallback;
        return parsed;
    },

    applyDemoBalance(user, realBalance) {
        const real = parseFloat(realBalance);
        const normalizedReal = Number.isFinite(real) ? real : parseFloat(user?.balance || 0) || 0;
        const localOverride = parseFloat(user?.localBalanceOverride);

        if (Number.isFinite(localOverride) && localOverride > normalizedReal) {
            return localOverride;
        }

        if (user && Number.isFinite(localOverride) && normalizedReal >= localOverride) {
            delete user.localBalanceOverride;
        }

        return normalizedReal;
    },

    // ==========================================
    // Р—Р°РїСЂРѕСЃ Рє РІРЅРµС€РЅРµРјСѓ API С‡РµСЂРµР· PHP-РїСЂРѕРєСЃРё
    // ==========================================
    async _viaProxy(method, endpoint, params = {}, body = null) {
        let url;

        if (method === 'GET') {
            const p = new URLSearchParams({ endpoint, ...params });
            url = `${this.LOCAL_API}/proxy.php?${p}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Proxy HTTP ${response.status}`);
            }

            const json = await response.json();

            if (json.code !== 0) {
                throw new Error(`${json.message || 'Proxy error'} (code ${json.code})`);
            }

            return json.data;

        } else {
            // POST
            url = `${this.LOCAL_API}/proxy.php?endpoint=${endpoint}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Proxy HTTP ${response.status}`);
            }

            const json = await response.json();

            if (json.code !== 0) {
                throw new Error(`${json.message || 'Proxy error'} (code ${json.code})`);
            }

            return json.data;
        }
    },

    // ==========================================
    // РџРѕР»СѓС‡РµРЅРёРµ РїСЂРѕС„РёР»СЏ РёР· vibe (Р±Р°Р»Р°РЅСЃ, Р±РѕРЅСѓСЃС‹, РѕС‡РєРё)
    async getVibeProfile(login, cafeId) {
        try {
            const resp = await this._localRequest('POST', 'login.php', {
                login,
                action: 'get_vibe_profile'
            });
            // _localRequest РІРѕР·РІСЂР°С‰Р°РµС‚ json.data
            return {
                balance: parseFloat(resp.balance || 0),
                bonusBalance: parseFloat(resp.bonus_balance || 0),
                points: parseFloat(resp.points || 0),
                discount: this.normalizeDiscount(resp.discount, 0),
            };
        } catch (e) {
            console.error('[API] getVibeProfile error:', e);
            return null;
        }
    },

    // ==========================================
    // РСЃС‚РѕСЂРёСЏ Р±Р°Р»Р°РЅСЃР° (СЃ РїР°РіРёРЅР°С†РёРµР№)
    async getBalanceHistory(icafeId, memberId, page = 1) {
        return await this._viaProxy('GET', 'member-balance-history-member', { cafeId: icafeId, memberId, page });
    },

    // РСЃС‚РѕСЂРёСЏ СЃРµСЃСЃРёР№
    async getMemberSessionHistory(icafeId, memberId) {
        return await this._viaProxy('GET', 'member-session-history', { cafeId: icafeId, memberId });
    },

    // РџРѕР»СѓС‡РµРЅРёРµ Р±РѕРЅСѓСЃ Р±Р°Р»Р°РЅСЃР° Рё РѕС‡РєРѕРІ РёР· vibe (С‡РµСЂРµР· login.php вЂ” С‚Р°Рј СѓР¶Рµ РµСЃС‚СЊ member_id)
    async getBonusBalance(login, cafeId) {
        try {
            // РСЃРїРѕР»СЊР·СѓРµРј Р»РѕРєР°Р»СЊРЅС‹Р№ API С‡С‚РѕР±С‹ РѕР±РѕР№С‚Рё CORS
            const resp = await fetch(`${this.LOCAL_API}/login.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, action: 'get_bonus' })
            });
            const data = await resp.json();
            return parseFloat(data.bonus_balance || 0);
        } catch (e) {
            return 0;
        }
    },

    // РџРѕР»СѓС‡РµРЅРёРµ РѕС‡РєРѕРІ РёР· vibe
    async getUserPoints(login, cafeId) {
        try {
            const resp = await fetch(`${this.LOCAL_API}/login.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, action: 'get_bonus' })
            });
            const data = await resp.json();
            return parseFloat(data.points || 0);
        } catch (e) {
            return 0;
        }
    },

    // РђР’РўРћР РР—РђР¦РРЇ
    // ==========================================
    async login(login, password) {
        const data = await this._localRequest('POST', 'login.php', { login, password });

        return {
            login: data.login,
            memberId: data.member_id,
            icafeId: data.icafe_id,
            balance: parseFloat(data.balance || 0),
            bonusBalance: 0, // Will be refreshed after loading bookings
            name: data.name || data.login,
            phone: data.phone || '',
            email: data.email || '',
            discount: this.normalizeDiscount(data.discount, 0.15),
            bookings: [],
            needsVerify: data.needs_verify || false,
            smsSent: data.sms_sent || false,
            isVerified: data.is_verified || false,
            source: data.source || 'unknown',
            password: password
        };
    },

    // ==========================================
    // Р Р•Р“РРЎРўР РђР¦РРЇ
    // ==========================================
    async register(login, phone, email, name, password = null, inviteToken = null) {
        // Р“РµРЅРµСЂРёСЂСѓРµРј СЃР»СѓС‡Р°Р№РЅС‹Р№ РїР°СЂРѕР»СЊ РµСЃР»Рё РЅРµ СѓРєР°Р·Р°РЅ
        const securePassword = password || this._generateSecurePassword();

        const data = await this._localRequest('POST', 'register.php', {
            step: 'register',
            login,
            password: securePassword,
            phone,
            email,
            name: name || login,
            invite_token: inviteToken || null,
        });

        return {
            login: data.login,
            memberId: data.member_id,
            icafeId: data.icafe_id,
            balance: parseFloat(data.balance || 0),
            name: data.name || data.login,
            phone: data.phone || '',
            email: data.email || '',
            discount: this.normalizeDiscount(data.discount, 0.15),
            bookings: [],
            generatedPassword: securePassword,
            needsVerify: data.needs_verify || false,
            smsSent: data.sms_sent || false,
            icafeRegistered: data.icafe_registered || false,
            dbRegistered: data.db_registered || false,
            source: data.source || 'unknown'
        };
    },

    // Р“РµРЅРµСЂР°С†РёСЏ Р±РµР·РѕРїР°СЃРЅРѕРіРѕ РїР°СЂРѕР»СЏ
    _generateSecurePassword(length = 12) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);
        
        for (let i = 0; i < length; i++) {
            password += charset[randomValues[i] % charset.length];
        }
        
        return password;
    },

    // ==========================================
    // РљР›РЈР‘Р« (С‚РѕР»СЊРєРѕ РёР· РІРЅРµС€РЅРµРіРѕ API)
    // ==========================================
    async getCafes() {
        try {
            const apiCafes = await this._viaProxy('GET', 'cafes');
            if (apiCafes && apiCafes.length > 0) {
                AppState.cafes = apiCafes;
                AppState.saveSession();
                return apiCafes;
            }
        } catch (e) {
            console.warn('Failed to load cafes via proxy:', e.message);
        }

        // Р•СЃР»Рё API РЅРµРґРѕСЃС‚СѓРїРµРЅ вЂ” РїСЂРѕР±СѓРµРј РІРµСЂРЅСѓС‚СЊ РёР· РєСЌС€Р° СЃРµСЃСЃРёРё
        if (AppState.cafes && AppState.cafes.length > 0) {
            return AppState.cafes;
        }

        return [];
    },

    // ==========================================
    // РЎС‚СЂСѓРєС‚СѓСЂР° Р·Р°Р»РѕРІ (С‡РµСЂРµР· РїСЂРѕРєСЃРё)
    // ==========================================
    async getStructRooms(cafeId) {
        return await this._viaProxy('GET', '/struct-rooms-icafe', { cafeId });
    },

    // ==========================================
    // Р”РѕСЃС‚СѓРїРЅРѕСЃС‚СЊ РџРљ (С‡РµСЂРµР· РїСЂРѕРєСЃРё)
    // ==========================================
    async getAvailablePCs(cafeId, dateStart, timeStart, mins, isFindWindow = false, priceName = null) {
        const params = { cafeId, dateStart, timeStart, mins };

        if (isFindWindow) params.isFindWindow = 'true';
        if (priceName) params.priceName = priceName;

        return await this._viaProxy('GET', '/available-pcs-for-booking', params);
    },

    // ==========================================
    // РўР°СЂРёС„С‹ Рё РїР°РєРµС‚С‹ (С‡РµСЂРµР· РїСЂРѕРєСЃРё)
    // ==========================================
    async getAllPrices(cafeId, memberId = null, mins = null, bookingDate = null) {
        const params = { cafeId };

        if (memberId) params.memberId = memberId;
        if (mins) params.mins = String(mins);
        if (bookingDate) params.bookingDate = bookingDate;

        const prices = await this._viaProxy('GET', '/all-prices-icafe', params);
        prices.prices = Array.isArray(prices.prices) ? prices.prices : [];
        prices.products = Array.isArray(prices.products) ? prices.products : [];
        const fallbackProducts = prices.products
            .map(p => this._normalizeProduct(p))
            .filter(Boolean);
        prices.products = fallbackProducts;
        prices.products_source = fallbackProducts.length > 0 ? 'all-prices-icafe' : 'none';

        try {
            const directProducts = await this.getProducts(cafeId);
            if (directProducts.length > 0) {
                prices.products = this._mergeProducts(directProducts, []);
                prices.products_source = 'products';
            }
        } catch (e) {
            console.warn('[API] products endpoint fallback to all-prices products:', e.message);
        }

        return prices;
    },

    async getProducts(cafeId) {
        const data = await this._viaProxy('GET', 'products', { cafeId, sort: 'desc', page: 1 });
        const products = Array.isArray(data?.products)
            ? data.products
            : (Array.isArray(data) ? data : []);

        return products
            .map(p => this._normalizeProduct(p))
            .filter(p => {
                if (!p) return false;
                if (p.duration_min > 0) return true;
                const haystack = `${p.product_name} ${p.group_name}`.toLowerCase();
                return haystack.includes('package')
                    || haystack.includes('пакет')
                    || haystack.includes('брон')
                    || haystack.includes('тариф')
                    || haystack.includes('booking')
                    || haystack.includes('tariff')
                    || haystack.includes('offer')
                    || /\d+\s*(?:hour|h|min|ч|час|м|мин)/i.test(haystack);
            });
    },

    _mergeProducts(primaryProducts = [], fallbackProducts = []) {
        const merged = [];
        const seen = new Set();

        [...primaryProducts, ...fallbackProducts.map(p => this._normalizeProduct(p)).filter(Boolean)].forEach(product => {
            const key = [
                product.product_id || '',
                product.product_name || '',
                product.duration_min || product.duration || '',
                product.total_price || product.product_price || ''
            ].join('|');

            if (seen.has(key)) return;
            seen.add(key);
            merged.push(product);
        });

        return merged;
    },

    _normalizeProduct(product) {
        if (!product || typeof product !== 'object') return null;

        const rawName = product.raw_product_name || product.product_name || product.name || product.productName || product.title || '';
        const name = String(rawName).split('<<<')[0].trim();
        const groupName = product.group_name || product.product_group_name || product.groupName || 'Booking';
        const duration = this._parseProductDuration(product, name);
        const price = product.total_price
            ?? product.product_price
            ?? product.price
            ?? product.sale_price
            ?? product.productPrice
            ?? 0;

        return {
            ...product,
            product_id: product.product_id ?? product.id ?? product.productId ?? null,
            raw_product_name: rawName,
            product_name: name,
            product_price: product.product_price ?? price,
            total_price: product.total_price ?? price,
            duration: product.duration ?? duration,
            duration_min: product.duration_min ?? duration,
            group_name: groupName
        };
    },

    _parseProductDuration(product, name = '') {
        const fromApi = parseInt(
            product.duration_min
            ?? product.duration
            ?? product.product_mins
            ?? product.product_duration_min
            ?? product.mins
            ?? 0,
            10
        );
        if (fromApi > 0) return fromApi;

        const hours = String(name).match(/(\d+)\s*(?:hour|hours|h|ч|час|часа|часов)/i);
        if (hours) return parseInt(hours[1], 10) * 60;

        const minutes = String(name).match(/(\d+)\s*(?:min|mins|м|мин|минут)/i);
        if (minutes) return parseInt(minutes[1], 10);

        return 0;
    },

    // ==========================================
    // РЎРѕР·РґР°РЅРёРµ Р±СЂРѕРЅРёСЂРѕРІР°РЅРёСЏ
    // booking.php СЃР°Рј РґРµР»Р°РµС‚ РІСЃС‘: MD5 РїРѕРґРїРёСЃСЊ, Р·Р°РїСЂРѕСЃ Рє vibe, РѕР±РЅРѕРІР»РµРЅРёРµ Р±Р°Р»Р°РЅСЃР°
    // ==========================================
    async createBooking({ icafe_id, pc_name, member_account, member_id, start_date, start_time, mins, product_id, for_friend_id, friend_pc_name }) {
        const priceInfo = AppState?.bookingCtx?.selectedPrice;
        const price = priceInfo?.total_price || 0;
        const productName = priceInfo?.product_name || '';

        const requestData = {
            login: member_account,
            member_id: member_id,
            icafe_id: String(icafe_id),
            pc_name,
            start_date,
            start_time,
            duration_min: mins,
            product_id: product_id || null,
            product_name: productName || null,
            product_price: parseFloat(price),
            price: parseFloat(price),
            skip_overlap_check: true,
            for_friend_id: for_friend_id || null,
            friend_pc_name: friend_pc_name || null
        };
        console.log('[API] createBooking FULL request:', JSON.stringify(requestData, null, 2));

        const localResult = await this._localRequest('POST', 'booking.php', requestData);

        console.log('[API] createBooking response:', localResult);
        return localResult;
    },

    // ==========================================
    // Р‘СЂРѕРЅРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (Р»РѕРєР°Р»СЊРЅС‹Р№ API)
    // ==========================================
    async getUserBookings(login) {
        return await this._localRequest('GET', 'bookings.php', { login });
    },

    async getLocalSessionHistory(login) {
        return await this._localRequest('GET', 'session_history_local.php', {
            login,
            _ts: Date.now()
        });
    },

    async createFoodOrder(payload) {
        return await this._localRequest('POST', 'orders.php?action=create', payload);
    },

    async getFoodOrders(login, statusGroup = null) {
        return await this._localRequest('GET', 'orders.php', { action: 'list', login, status_group: statusGroup });
    },

    async getFoodOrder(id, login) {
        return await this._localRequest('GET', 'orders.php', { action: 'get', id, login });
    },

    async simulateFoodPayment(orderId, paymentMethod = null, paymentPayload = {}) {
        return await this._localRequest('POST', 'orders.php?action=confirm_payment_simulated', {
            id: orderId,
            payment_method: paymentMethod,
            payment_payload: paymentPayload || {}
        });
    },

    async addOrderTip(orderId, login, amount) {
        return await this._localRequest('POST', 'orders.php?action=add_tip', { id: orderId, login, amount });
    },

    async getVkPosts(offset = 0, count = 15) {
        return await this._localRequest('GET', 'vk_posts.php', { offset, count });
    },

    // ==========================================
    // HTTP-Р·Р°РїСЂРѕСЃ Рє Р»РѕРєР°Р»СЊРЅРѕРјСѓ PHP API (РїРѕРґРґРµСЂР¶РєР° GET РїР°СЂР°РјРµС‚СЂРѕРІ)
    // ==========================================
    async _localRequest(method, file, bodyOrParams = null) {
        let url = `${this.LOCAL_API}/${file}`;

        if (method === 'GET' && bodyOrParams) {
            // Р”Р»СЏ GET вЂ” bodyOrParams СЌС‚Рѕ РѕР±СЉРµРєС‚ РїР°СЂР°РјРµС‚СЂРѕРІ
            const p = new URLSearchParams();
            if (typeof bodyOrParams === 'object') {
                // Р•СЃР»Рё СЌС‚Рѕ РѕР±СЉРµРєС‚ СЃ РїРѕР»СЏРјРё (РєР°Рє getUserBookings РїРµСЂРµРґР°С‘С‚ {login})
                Object.entries(bodyOrParams).forEach(([k, v]) => {
                    if (v !== null && v !== undefined) p.append(k, v);
                });
            } else if (typeof bodyOrParams === 'string') {
                // Р•СЃР»Рё СЌС‚Рѕ РїСЂРѕСЃС‚Рѕ СЃС‚СЂРѕРєР° (login)
                p.append('login', bodyOrParams);
            }
            url += `?${p}`;
        }

        const options = {
            method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        };

        if (bodyOrParams && method === 'POST') {
            options.body = JSON.stringify(bodyOrParams);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();

        if (json.code !== 0) {
            throw new Error(`${json.message || 'Ошибка'} (код ${json.code})`);
        }

        return json.data;
    },

    // ==========================================
    // РџРѕРїРѕР»РЅРµРЅРёРµ Р±Р°Р»Р°РЅСЃР°
    // ==========================================
    async topupBalance(login, amount, paymentMethod = 'card', currentBalance = null) {
        return await this._localRequest('POST', 'topup.php', {
            login,
            amount,
            payment_method: paymentMethod,
            current_balance: currentBalance,
        });
    },

    // ==========================================
    // ID iCafe РґР»СЏ РєР»РёРµРЅС‚РѕРІ (С‡РµСЂРµР· РїСЂРѕРєСЃРё)
    // ==========================================
    async getIcafeIdForMember() {
        try {
            return await this._viaProxy('GET', '/icafe-id-for-member');
        } catch (e) {
            return { icafe_id: '87375' }; // Active club
        }
    },

    // ==========================================
    // Р‘Р РћРќР Р”Р›РЇ Р”Р РЈР—Р•Р™
    // ==========================================
    async getFriendBookings(login, received = false) {
        const param = received ? `&received=1` : '';
        const url = `${this.LOCAL_API}/friend_bookings.php?login=${encodeURIComponent(login)}${param}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    async cancelFriendBooking(login, bookingId) {
        return await this._localRequest('POST', 'friend_bookings.php', {
            login,
            id: parseInt(bookingId),
        });
    },

    // ==========================================
    // Р”Р РЈР—Р¬РЇ
    // ==========================================
    async getFriendsList(login) {
        const url = `${this.LOCAL_API}/friends.php?action=list&login=${encodeURIComponent(login)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    async getFriendsPending(login) {
        const url = `${this.LOCAL_API}/friends.php?action=pending&login=${encodeURIComponent(login)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    async addFriend(login, friendLogin) {
        return await this._localRequest('POST', 'friends.php?action=add', { login, friend_login: friendLogin });
    },

    async acceptFriend(login, friendLogin) {
        return await this._localRequest('POST', 'friends.php?action=accept', { login, friend_login: friendLogin });
    },

    async rejectFriend(login, friendLogin) {
        return await this._localRequest('POST', 'friends.php?action=reject', { login, friend_login: friendLogin });
    },

    async removeFriend(login, friendLogin) {
        return await this._localRequest('POST', 'friends.php?action=remove', { login, friend_login: friendLogin });
    },

    async searchUsers(query) {
        const url = `${this.LOCAL_API}/friends.php?action=search&q=${encodeURIComponent(query)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    async createGuestAccount(login, guestLogin, guestName, guestPhone, guestEmail, guestPassword) {
        return await this._localRequest('POST', 'invite.php?action=guest_create', {
            login,
            guest_login: guestLogin,
            guest_name: guestName || guestLogin,
            guest_phone: guestPhone || '',
            guest_email: guestEmail || '',
            guest_password: guestPassword || '',
        });
    },

    // ==========================================
    // РџР РР“Р›РђРЁР•РќРРЇ
    // ==========================================
    async createInvitation(login) {
        return await this._localRequest('POST', 'invite.php?action=create', { login });
    },

    async validateInvitation(token) {
        const url = `${this.LOCAL_API}/invite.php?action=validate&token=${encodeURIComponent(token)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    async registerByInvitation(token, login, phone, email, name, password) {
        return await this._localRequest('POST', 'invite.php?action=register', {
            token, login, password, phone, email, name: name || login,
        });
    },

    // ==========================================
    // Р‘Р РћРќР Р”Р РЈР—Р•Р™ (РґР»СЏ РїРѕРґСЃРІРµС‚РєРё РЅР° СЃРµС‚РєРµ)
    // ==========================================
    // Р‘СЂРѕРЅРё РґСЂСѓР·РµР№ РґР»СЏ РїРѕРґСЃРІРµС‚РєРё РЅР° СЃРµС‚РєРµ РџРљ
    async getFriendBookingsGrid(login, friendLogin, cafeId, date) {
        const url = `${this.LOCAL_API}/friends.php?action=bookings&login=${encodeURIComponent(login)}&friend_login=${encodeURIComponent(friendLogin)}&cafe_id=${encodeURIComponent(cafeId)}&date=${encodeURIComponent(date)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    // РћС‚РјРµРЅРёС‚СЊ Р·Р°СЏРІРєСѓ РІ РґСЂСѓР·СЊСЏ
    async cancelFriendRequest(login, friendLogin) {
        return await this._localRequest('POST', 'friends.php?action=cancel', { login, friend_login: friendLogin });
    },

    // РћС‚РѕР·РІР°С‚СЊ РїСЂРёРіР»Р°С€РµРЅРёРµ
    async revokeInvitation(token) {
        return await this._localRequest('POST', 'friends.php?action=revoke-invite', { token });
    },

    // ==========================================
    // РђР’РђРўРђР РљР
    // ==========================================
    async saveAvatarPreset(login, emoji) {
        return await this._localRequest('POST', 'avatar.php?action=save_preset', { login, emoji });
    },

    async uploadAvatar(login, base64Image) {
        return await this._localRequest('POST', 'avatar.php?action=upload', { login, image: base64Image });
    },

    async deleteAvatar(login) {
        return await this._localRequest('POST', 'avatar.php?action=delete', { login });
    },

    async getAvatar(login) {
        const url = `${this.LOCAL_API}/avatar.php?action=get&login=${encodeURIComponent(login)}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.code !== 0) throw new Error(json.message || 'Ошибка');
        return json.data;
    },

    // РћС‚РјРµРЅР° Р±СЂРѕРЅРёСЂРѕРІР°РЅРёСЏ (С‡РµСЂРµР· Р»РѕРєР°Р»СЊРЅС‹Р№ API в†’ РІРЅРµС€РЅРёР№ API РєР»СѓР±Р°)
    async cancelBooking(login, memberOfferId, icafeId, pcName, packageDeducted = 0) {
        return await this._localRequest('POST', 'booking_cancel.php', {
            login,
            member_offer_id: memberOfferId,
            icafe_id: icafeId,
            pc_name: pcName || '',
            package_deducted: packageDeducted || 0,
        });
    },

    // ==========================================
    // РќРћР’Р«Р• РњР•РўРћР”Р« Р’РќР•РЁРќР•Р“Рћ API (С‡РµСЂРµР· РїСЂРѕРєСЃРё)
    // ==========================================

    // РџРѕРїРѕР»РЅРµРЅРёРµ Р±Р°Р»Р°РЅСЃР° С‡РµСЂРµР· РІРЅРµС€РЅРёР№ API
    async topupBalanceExternal(memberId, icafeId, amount) {
        return await this._viaProxy('POST', 'member-topup', {}, {
            icafe_id: icafeId,
            member_id: memberId,
            amount: amount,
        });
    },

    // РџРѕР»СѓС‡РёС‚СЊ Р±РѕРЅСѓСЃ РїРµСЂРµРґ РїРѕРїРѕР»РЅРµРЅРёРµРј
    async fetchBonus(memberId, icafeId) {
        try {
            return await this._viaProxy('POST', 'member-fetch-bonus', {}, {
                icafe_id: icafeId,
                member_id: memberId,
            });
        } catch (e) {
            return null; // Bonus is not critical
        }
    },

    // РЈРІРµРґРѕРјРёС‚СЊ РџРљ Рѕ Р±СЂРѕРЅРёСЂРѕРІР°РЅРёРё
    async pushClientStatus(icafeId, memberId) {
        try {
            return await this._viaProxy('POST', 'push-client-status', {}, {
                icafe_id: icafeId,
                member_id: memberId,
            });
        } catch (e) {
            console.warn('pushClientStatus error:', e.message);
            return null;
        }
    },

    // Р РµРіРёСЃС‚СЂР°С†РёСЏ РІРѕ РІРЅРµС€РЅРµРј API РєР»СѓР±Р°
    async registerExternal(icafeId, account, phone, email, name, password) {
        return await this._viaProxy('POST', 'client-register', {}, {
            icafe_id: icafeId,
            account,
            phone,
            email,
            name,
            password,
        });
    },

    // РћРЅР»Р°Р№РЅ СЃРїРёСЃРѕРє РџРљ
    async getOnlinePcList(icafeId) {
        return await this._viaProxy('GET', 'online-pc-list', { cafeId: icafeId });
    },

    // РСЃС‚РѕСЂРёСЏ СЃРµСЃСЃРёР№ РџРљ
    async getUsageHistory(icafeId, memberId, page = 1, pageSize = 20) {
        return await this._viaProxy('GET', 'usage-history', {
            cafeId: icafeId,
            memberId,
            page,
            pageSize,
        });
    },

    // РџР°РєРµС‚РЅРѕРµ Р±СЂРѕРЅРёСЂРѕРІР°РЅРёРµ
    async batchBooking(icafeId, bookings, date, time, duration) {
        return await this._viaProxy('POST', 'booking-batch', {}, {
            icafe_id: icafeId,
            bookings, // [{pc_name, member_account, member_id, for}]
            start_date: date,
            start_time: time,
            duration_min: duration,
        });
    },

    // РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ Р±СЂРѕРЅРёСЂРѕРІР°РЅРёСЏ (С‚РѕС‡РЅС‹Р№ СЂР°СЃС‡С‘С‚)
    async initBookingSession(icafeId, memberId, pcName, date, time, duration) {
        return await this._viaProxy('GET', 'init-booking-session', {
            cafeId: icafeId,
            memberId,
            pcName,
            date,
            time,
            duration,
        });
    },

    // Р РµР№С‚РёРЅРі РёРіСЂРѕРєРѕРІ
    async getMemberRanking(icafeId, page = 1, pageSize = 20, extra = {}) {
        try {
            return await this._viaProxy('GET', 'member-ranking', {
                cafeId: icafeId,
                page,
                pageSize,
                ...extra,
            });
        } catch (e) {
            return { rankings: [], total: 0 };
        }
    },

    // РђРЅР°Р»РёС‚РёРєР° РєР»РёРµРЅС‚Р°
    async getCustomerAnalysis(icafeId, memberId, options = {}) {
        try {
            const {
                dateStart = null,
                dateEnd = null,
            } = options || {};

            return await this._viaProxy('GET', 'customer-analysis', {
                cafeId: icafeId,
                memberId,
                ...(dateStart ? { dateStart } : {}),
                ...(dateEnd ? { dateEnd } : {}),
            });
        } catch (e) {
            return null;
        }
    },

    // РџРѕР»СѓС‡РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° РїРѕ Р°РєРєР°СѓРЅС‚Сѓ (РЅРёРєСѓ)
    async getMemberInfoByAccount(icafeId, account, password = null) {
        try {
            return await this._viaProxy('GET', 'member-info-by-account', {
                cafeId: icafeId,
                account,
                ...(password ? { password } : {}),
            });
        } catch (e) {
            return null;
        }
    },

    // РџРѕР»СѓС‡РёС‚СЊ РґРµС‚Р°Р»Рё СѓС‡Р°СЃС‚РЅРёРєР° РїРѕ memberId
    async getMemberDetails(icafeId, memberId) {
        try {
            return await this._viaProxy('GET', 'member-details', {
                cafeId: icafeId,
                memberId,
            });
        } catch (e) {
            return null;
        }
    },

    // Р‘Р°Р»Р°РЅСЃ РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё
    async getRealtimeBalance(icafeId, memberId) {
        try {
            return await this._viaProxy('GET', 'realtime-balance', {
                cafeId: icafeId,
                memberId,
            });
        } catch (e) {
            return null;
        }
    },

    // РџСЂСЏРјРѕР№ СЃРїРёСЃРѕРє Р±СЂРѕРЅРёСЂРѕРІР°РЅРёР№
    async getBookingsList(icafeId, memberAccount = null) {
        return await this._viaProxy('GET', 'bookings-list', {
            cafeId: icafeId,
            memberAccount: memberAccount || '',
        });
    },

    // РЎРІРѕСЏ РёРЅС„РѕСЂРјР°С†РёСЏ (С‡РµСЂРµР· Bearer token)
    async getMemberSelf(icafeId, token) {
        try {
            const url = `${this.LOCAL_API}/proxy.php?endpoint=member-self&cafeId=${icafeId}`;
            const r = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await r.json();
            if (json.code !== 0) throw new Error(json.message);
            return json.data;
        } catch (e) {
            console.warn('memberSelf error:', e.message);
            return null;
        }
    },

    // SMS-РІРµСЂРёС„РёРєР°С†РёСЏ
    async smsVerify(login, code) {
        return await this._localRequest('POST', 'sms_verify.php', { login, code });
    },

    // Р—Р°РїСЂРѕСЃ SMS (С€Р°Рі 2 РїРѕС€Р°РіРѕРІРѕР№ СЂРµРіРёСЃС‚СЂР°С†РёРё)
    async requestSms(memberId, phone = null) {
        const body = { step: 'request_sms', member_id: memberId };
        if (phone) body.phone = phone;
        return await this._localRequest('POST', 'register.php', body);
    },

    // РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ SMS (С€Р°Рі 3 РїРѕС€Р°РіРѕРІРѕР№ СЂРµРіРёСЃС‚СЂР°С†РёРё)
    async verifySms(memberId) {
        return await this._localRequest('POST', 'register.php', { step: 'verify', member_id: memberId });
    }
};
