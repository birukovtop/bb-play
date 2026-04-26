/**
 * BlackBears Play — Модуль аватарок
 */
const Avatar = {

    currentAvatar: '🐻',
    currentAvatarType: 'preset', // 'preset' | 'custom'

    init() {
        this._loadCurrent();
        this._bindEvents();
    },

    _bindEvents() {
        // Закрытие
        document.getElementById('btn-close-avatar')?.addEventListener('click', () => this.hide());
        document.getElementById('btn-avatar-close')?.addEventListener('click', () => this.hide());

        // Клик на оверлей
        const modal = document.getElementById('modal-avatar');
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hide();
        });

        // Пресеты
        document.querySelectorAll('.avatar-preset').forEach(btn => {
            btn.addEventListener('click', () => this._selectPreset(btn.dataset.emoji));
        });

        // Загрузка фото
        document.getElementById('btn-avatar-upload')?.addEventListener('click', () => {
            document.getElementById('avatar-file-input').click();
        });
        document.getElementById('avatar-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this._uploadCustom(file);
            e.target.value = ''; // Сброс
        });

        // Удалить
        document.getElementById('btn-avatar-delete')?.addEventListener('click', () => this._deleteCustom());
    },

    // ==========================================
    // Загрузить текущую аватарку
    // ==========================================
    async _loadCurrent() {
        try {
            const login = AppState.currentUser?.login;
            if (!login) return;
            const url = `${API.LOCAL_API}/avatar.php?action=get&login=${encodeURIComponent(login)}`;
            const r = await fetch(url);
            const json = await r.json();
            if (json.code === 0 && json.data) {
                this.currentAvatar = json.data.avatar || '🐻';
                this.currentAvatarType = json.data.avatar_type || 'preset';
            }
        } catch (e) {
            // Игнорируем, используем дефолт
        } finally {
            this._updateAllDisplays();
        }
    },

    // ==========================================
    // Показать модалку
    // ==========================================
    async show() {
        await this._loadCurrent();
        document.getElementById('modal-avatar').classList.remove('hidden');
        this._renderPreview();
        document.getElementById('avatar-error').textContent = '';

        // Подсветить текущий пресет
        document.querySelectorAll('.avatar-preset').forEach(btn => {
            btn.classList.toggle('selected', this.currentAvatarType === 'preset' && btn.dataset.emoji === this.currentAvatar);
        });
    },

    hide() {
        document.getElementById('modal-avatar').classList.add('hidden');
        UI.restoreActions();
    },

    // ==========================================
    // Рендер превью
    // ==========================================
    _renderPreview() {
        const iconEl = document.getElementById('avatar-preview-icon');
        const imgEl = document.getElementById('avatar-preview-img');

        if (this.currentAvatarType === 'custom' && this.currentAvatar.startsWith('/')) {
            iconEl.classList.add('hidden');
            imgEl.classList.remove('hidden');
            imgEl.src = this.currentAvatar;
        } else {
            iconEl.classList.remove('hidden');
            imgEl.classList.add('hidden');
            iconEl.textContent = this.currentAvatar;
        }

        // Обновить везде
        this._updateAllDisplays();
    },

    // ==========================================
    // Выбрать пресет
    // ==========================================
    async _selectPreset(emoji) {
        try {
            await API.saveAvatarPreset(AppState.currentUser.login, emoji);
            this.currentAvatar = emoji;
            this.currentAvatarType = 'preset';

            // Подсветить
            document.querySelectorAll('.avatar-preset').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.emoji === emoji);
            });

            this._renderPreview();
        } catch (e) {
            document.getElementById('avatar-error').textContent = e.message;
        }
    },

    // ==========================================
    // Загрузить кастомное фото (с сжатием на клиенте)
    // ==========================================
    async _uploadCustom(file) {
        const errorEl = document.getElementById('avatar-error');
        errorEl.textContent = '';

        // Проверяем тип
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            errorEl.textContent = 'Неподдерживаемый формат. Используй JPG, PNG, GIF или WebP';
            return;
        }

        try {
            // Сжатие через canvas
            const compressedBase64 = await this._compressImage(file, 200, 0.8);

            document.getElementById('btn-avatar-upload').disabled = true;
            document.getElementById('btn-avatar-upload').textContent = 'Загрузка...';

            const result = await API.uploadAvatar(AppState.currentUser.login, compressedBase64);

            this.currentAvatar = result.avatar;
            this.currentAvatarType = 'custom';
            this._renderPreview();

            document.getElementById('btn-avatar-upload').disabled = false;
            document.getElementById('btn-avatar-upload').textContent = 'Загрузить фото';

        } catch (e) {
            errorEl.textContent = e.message;
            document.getElementById('btn-avatar-upload').disabled = false;
            document.getElementById('btn-avatar-upload').textContent = 'Загрузить фото';
        }
    },

    // ==========================================
    // Сжатие изображения через Canvas
    // ==========================================
    _compressImage(file, maxSize, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');

                    // Вычисляем размер
                    let w = img.width;
                    let h = img.height;
                    if (w > maxSize || h > maxSize) {
                        const ratio = Math.min(maxSize / w, maxSize / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }

                    canvas.width = w;
                    canvas.height = h;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    // Конвертируем в base64 JPEG
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(base64);
                };
                img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsDataURL(file);
        });
    },

    // ==========================================
    // Удалить кастомную аватарку
    // ==========================================
    async _deleteCustom() {
        if (this.currentAvatarType === 'preset') {
            document.getElementById('avatar-error').textContent = 'У тебя уже пресет. Выбери другой!';
            return;
        }

        if (!confirm('Удалить свою аватарку и вернуть стандартную?')) return;

        try {
            await API.deleteAvatar(AppState.currentUser.login);
            this.currentAvatar = '🐻';
            this.currentAvatarType = 'preset';
            this._renderPreview();
            document.getElementById('avatar-error').textContent = '';

            // Сброс подсветки пресетов
            document.querySelectorAll('.avatar-preset').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.emoji === '🐻');
            });
        } catch (e) {
            document.getElementById('avatar-error').textContent = e.message;
        }
    },

    // ==========================================
    // Обновить все отображения аватарки
    // ==========================================
    _updateAllDisplays() {
        // Статус-бар
        const statusBarIcon = document.querySelector('.status-icon');
        if (statusBarIcon) {
            statusBarIcon.innerHTML = this.renderStatusIcon();
        }
    },

    renderStatusIcon() {
        if (this.currentAvatarType === 'custom' && this.currentAvatar && this.currentAvatar.startsWith('/')) {
            return `<img src="${this.currentAvatar}" alt="avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">`;
        }

        return this.currentAvatar || '🐻';
    },

    // ==========================================
    // Получить HTML аватарки
    // ==========================================
    getAvatarHTML(sizeClass = '') {
        if (this.currentAvatarType === 'custom' && this.currentAvatar.startsWith('/')) {
            return `<div class="avatar-display ${sizeClass}"><img src="${this.currentAvatar}" alt="avatar"></div>`;
        }
        return `<div class="avatar-display ${sizeClass}">${this.currentAvatar}</div>`;
    }
};
