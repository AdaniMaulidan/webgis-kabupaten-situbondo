/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/auth.js
 * Description: Google Identity Services (OAuth 2.0 Token Model) Authentication,
 *              Client ID Configuration Modal, Session & Expiration Manager,
 *              and Editor Permission Verifier for GitHub Pages (Zero Secret).
 * ============================================================================
 */

(function () {
    'use strict';

    var CONFIG = window.WEBGIS_CONFIG || {};
    var CLIENT_ID_STORAGE_KEY = 'webgis_situbondo_oauth_client_id';
    var SESSION_STORAGE_KEY = (CONFIG.oauth && CONFIG.oauth.tokenStorageKey) || 'webgis_situbondo_oauth_session';
    var OAUTH_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

    var WebGISAuth = {
        tokenClient: null,
        gisScriptLoaded: false,
        gisScriptLoading: false,
        expiryTimerId: null,

        state: {
            isAuthenticated: false,
            isEditor: false,
            accessToken: null,
            expiresAt: 0,
            email: '',
            name: '',
            picture: ''
        },

        /**
         * Initialize authentication module & restore active session if valid
         */
        init: function () {
            this.restoreSession();
            this.injectAuthModal();
            this.syncHeaderUI();
            this.preloadGisSdk();
        },

        /**
         * Retrieve effective OAuth 2.0 Client ID (from config.js or localStorage)
         * @returns {string}
         */
        getClientId: function () {
            var cfgClientId = (CONFIG.oauth && CONFIG.oauth.clientId) ? String(CONFIG.oauth.clientId).trim() : '';
            if (cfgClientId) return cfgClientId;
            try {
                var saved = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
                return saved ? String(saved).trim() : '';
            } catch (e) {
                return '';
            }
        },

        /**
         * Save OAuth 2.0 Client ID to localStorage
         * @param {string} clientId
         */
        setClientId: function (clientId) {
            var cleaned = String(clientId || '').trim();
            try {
                if (cleaned) {
                    localStorage.setItem(CLIENT_ID_STORAGE_KEY, cleaned);
                } else {
                    localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
                }
            } catch (e) {}
            this.tokenClient = null;
        },

        /**
         * Check whether current OAuth access token is present and not expired
         * @returns {boolean}
         */
        isTokenValid: function () {
            if (!this.state.accessToken || !this.state.expiresAt) return false;
            // Buffer 15 seconds before hard expiry
            return Date.now() < (this.state.expiresAt - 15000);
        },

        /**
         * Check whether current visitor is an authenticated & authorized Editor
         * @returns {boolean}
         */
        isAuthorizedEditor: function () {
            return !!(this.state.isAuthenticated && this.state.isEditor && this.isTokenValid());
        },

        /**
         * Return valid Bearer access token or null
         * @returns {string|null}
         */
        getAccessToken: function () {
            if (!this.isTokenValid()) {
                if (this.state.isAuthenticated) {
                    this.handleTokenExpired();
                }
                return null;
            }
            return this.state.accessToken;
        },

        /**
         * Restore OAuth session from sessionStorage across page navigation
         */
        restoreSession: function () {
            try {
                var raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
                if (!raw) return;
                var parsed = JSON.parse(raw);
                if (parsed && parsed.accessToken && parsed.expiresAt && Date.now() < (parsed.expiresAt - 15000)) {
                    this.state = {
                        isAuthenticated: Boolean(parsed.isAuthenticated),
                        isEditor: Boolean(parsed.isEditor),
                        accessToken: parsed.accessToken,
                        expiresAt: Number(parsed.expiresAt),
                        email: parsed.email || '',
                        name: parsed.name || '',
                        picture: parsed.picture || ''
                    };
                    this.scheduleExpiryWatcher();
                } else {
                    sessionStorage.removeItem(SESSION_STORAGE_KEY);
                }
            } catch (e) {
                // Ignore storage errors
            }
        },

        /**
         * Persist current OAuth state to sessionStorage
         */
        saveSession: function () {
            try {
                if (this.state.isAuthenticated && this.state.accessToken) {
                    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.state));
                } else {
                    sessionStorage.removeItem(SESSION_STORAGE_KEY);
                }
            } catch (e) {}
        },

        /**
         * Schedule timer to warn user before OAuth token expires (3600s lifecycle)
         */
        scheduleExpiryWatcher: function () {
            var self = this;
            if (this.expiryTimerId) {
                clearTimeout(this.expiryTimerId);
                this.expiryTimerId = null;
            }
            if (!this.state.expiresAt) return;

            var remainingMs = this.state.expiresAt - Date.now();
            if (remainingMs <= 0) {
                this.handleTokenExpired();
                return;
            }

            this.expiryTimerId = setTimeout(function () {
                self.handleTokenExpired();
            }, remainingMs);
        },

        /**
         * Handle expired OAuth token gracefully
         */
        handleTokenExpired: function () {
            this.state.isAuthenticated = false;
            this.state.isEditor = false;
            this.state.accessToken = null;
            this.state.expiresAt = 0;
            this.saveSession();
            this.syncHeaderUI();
            this.notifyAuthChanged();

            if (window.WebGISApp) {
                window.WebGISApp.showToast(
                    'Sesi login OAuth 2.0 telah berakhir (batas 60 menit). Silakan klik Login Editor kembali sebelum menyimpan perubahan.',
                    'warning',
                    5500
                );
            }
        },

        /**
         * Downgrade account to Read-Only Viewer if Google Sheets API returns 403 Forbidden on write
         * @param {string} [reason]
         */
        downgradeToViewer: function (reason) {
            this.state.isEditor = false;
            this.saveSession();
            this.syncHeaderUI();
            this.notifyAuthChanged();

            if (window.WebGISApp) {
                window.WebGISApp.showToast(
                    reason || 'Akun Google (' + (this.state.email || 'Anda') + ') hanya memiliki akses Lihat (Viewer) pada Google Spreadsheet ini. Pengeditan dinonaktifkan.',
                    'error',
                    6000
                );
            }
        },

        /**
         * Update header badge and button text via WebGISApp
         */
        syncHeaderUI: function () {
            if (window.WebGISApp && typeof window.WebGISApp.updateAuthBadge === 'function') {
                window.WebGISApp.updateAuthBadge({
                    isEditor: this.isAuthorizedEditor(),
                    email: this.state.email || this.state.name || ''
                });
            }
        },

        /**
         * Broadcast auth state change to Editor and Table modules
         */
        notifyAuthChanged: function () {
            window.dispatchEvent(new CustomEvent('webgis:auth-changed', {
                detail: {
                    isAuthenticated: this.state.isAuthenticated,
                    isEditor: this.isAuthorizedEditor(),
                    email: this.state.email,
                    name: this.state.name
                }
            }));
        },

        /**
         * Preload Google Identity Services script asynchronously
         */
        preloadGisSdk: function () {
            var self = this;
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                this.gisScriptLoaded = true;
                return Promise.resolve();
            }
            if (this.gisScriptLoading) {
                return new Promise(function (resolve) {
                    var check = setInterval(function () {
                        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                            clearInterval(check);
                            self.gisScriptLoaded = true;
                            resolve();
                        }
                    }, 150);
                });
            }

            this.gisScriptLoading = true;
            return new Promise(function (resolve) {
                var script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = function () {
                    self.gisScriptLoaded = true;
                    self.gisScriptLoading = false;
                    resolve();
                };
                script.onerror = function () {
                    self.gisScriptLoading = false;
                    resolve();
                };
                document.head.appendChild(script);
            });
        },

        /**
         * Handle click on #headerAuthBtn in Top Navbar
         */
        handleAuthButtonClick: function () {
            if (this.isAuthorizedEditor()) {
                this.openAuthModal();
            } else {
                this.openAuthModal();
            }
        },

        /**
         * Start Google Identity Services OAuth 2.0 Popup Flow
         */
        startGoogleOAuthLogin: function () {
            var self = this;
            var clientId = this.getClientId();

            if (!clientId) {
                if (window.WebGISApp) {
                    window.WebGISApp.showToast(
                        'Masukkan Google Cloud OAuth 2.0 Client ID terlebih dahulu pada kolom konfigurasi di bawah, atau gunakan opsi Access Token.',
                        'warning',
                        4500
                    );
                }
                var inputEl = document.getElementById('authClientIdInput');
                if (inputEl) inputEl.focus();
                return;
            }

            this.preloadGisSdk().then(function () {
                if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
                    if (window.WebGISApp) {
                        window.WebGISApp.showToast(
                            'Gagal memuat Google Identity Services SDK. Periksa koneksi internet atau protokol halaman (gunakan http://localhost atau https://).',
                            'error',
                            5000
                        );
                    }
                    return;
                }

                try {
                    self.tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: OAUTH_SCOPES,
                        callback: function (tokenResponse) {
                            if (tokenResponse && tokenResponse.error) {
                                if (window.WebGISApp) {
                                    window.WebGISApp.showToast(
                                        'Login Google dibatalkan atau gagal: ' + (tokenResponse.error_description || tokenResponse.error),
                                        'error',
                                        5000
                                    );
                                }
                                return;
                            }
                            if (tokenResponse && tokenResponse.access_token) {
                                var expiresInSec = Number(tokenResponse.expires_in) || 3599;
                                self.verifyAndActivateToken(tokenResponse.access_token, expiresInSec);
                            }
                        }
                    });

                    self.tokenClient.requestAccessToken({ prompt: 'select_account' });
                } catch (err) {
                    if (window.WebGISApp) {
                        window.WebGISApp.showToast('Gagal menginisialisasi OAuth 2.0 Client: ' + err.message, 'error', 5000);
                    }
                }
            });
        },

        /**
         * Activate Instant 1-Click Editor Mode (Works immediately on file:// and localhost without token friction)
         */
        activateInstantEditorMode: function () {
            this.state = {
                isAuthenticated: true,
                isEditor: true,
                accessToken: 'LOCAL_EDITOR_MODE',
                expiresAt: Date.now() + (12 * 3600 * 1000), // 12 hours
                email: 'Editor WebGIS Situbondo',
                name: 'Editor WebGIS Situbondo',
                picture: ''
            };

            this.saveSession();
            this.scheduleExpiryWatcher();
            this.syncHeaderUI();
            this.notifyAuthChanged();
            this.closeAuthModal();

            if (window.WebGISApp) {
                window.WebGISApp.showToast(
                    'Mode Editor Aktif! Silakan buka halaman Kalender atau Monitoring, lalu klik sel tabel untuk mengedit data.',
                    'success',
                    5000
                );
            }
        },

        /**
         * Verify an OAuth 2.0 Bearer Access Token against Google UserInfo & Google Sheets API v4
         * Automatically extracts ya29... token even if user pasted JSON or quotes.
         * @param {string} rawInput
         * @param {number} [expiresInSec=3599]
         */
        verifyAndActivateToken: function (rawInput, expiresInSec) {
            var self = this;
            var rawStr = String(rawInput || '').trim();
            if (!rawStr) {
                if (window.WebGISApp) {
                    window.WebGISApp.showToast('Kotak Access Token masih kosong. Atau klik tombol "Masuk Mode Editor Cepat (1-Klik)" di atas.', 'warning', 4000);
                }
                return;
            }

            // Smart extraction: if user copied JSON or quotes around ya29..., extract the exact ya29... token
            var cleanedToken = rawStr.replace(/^["']+|["',]+$/g, '').trim();
            var ya29Match = rawStr.match(/ya29\.[A-Za-z0-9._\-]+/);
            if (ya29Match && ya29Match[0]) {
                cleanedToken = ya29Match[0];
            }

            var statusEl = document.getElementById('authModalVerifyStatus');

            // Detect common copy mistakes from OAuth Playground
            if (cleanedToken.indexOf('4/') === 0) {
                var codeMsg = 'Yang Anda tempel adalah "Authorization code" (diawali 4/), bukan Access Token. Klik dulu tombol biru "Exchange authorization code for tokens" di OAuth Playground, lalu salin kotak "Access token" (diawali ya29.), ATAU gunakan tombol "Masuk Mode Editor Cepat (1-Klik)" di atas.';
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.innerHTML = '<span style="color:var(--danger-600);font-weight:600;"><i class="fas fa-exclamation-circle"></i> ' + window.WebGISApp.escapeHtml(codeMsg) + '</span>';
                }
                return;
            }

            if (cleanedToken.indexOf('1//') === 0) {
                var refreshMsg = 'Yang Anda tempel adalah "Refresh token" (diawali 1//). Salin kotak di bawahnya yaitu "Access token" (diawali ya29.), ATAU gunakan tombol "Masuk Mode Editor Cepat (1-Klik)" di atas.';
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.innerHTML = '<span style="color:var(--danger-600);font-weight:600;"><i class="fas fa-exclamation-circle"></i> ' + window.WebGISApp.escapeHtml(refreshMsg) + '</span>';
                }
                return;
            }

            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memverifikasi kredensial OAuth 2.0 & izin akses Google Spreadsheet...';
            }

            var testSheetId = (CONFIG.spreadsheets && CONFIG.spreadsheets.monitoring && CONFIG.spreadsheets.monitoring.id)
                || '1LDZiAVK8mDlRiLqayorNHAcwtu3H-msn970lYvicjzo';

            // 1. Fetch User Profile (if scope included)
            var userPromise = fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: 'Bearer ' + cleanedToken }
            })
                .then(function (res) { return res.ok ? res.json() : {}; })
                .catch(function () { return {}; });

            // 2. Verify Google Sheets API v4 metadata access with Bearer token
            var sheetPromise = fetch(
                'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(testSheetId) + '?fields=spreadsheetId,properties.title',
                {
                    headers: { Authorization: 'Bearer ' + cleanedToken }
                }
            );

            Promise.all([userPromise, sheetPromise])
                .then(function (results) {
                    var userInfo = results[0] || {};
                    var sheetRes = results[1];

                    if (!sheetRes.ok) {
                        return sheetRes.json().catch(function () { return {}; }).then(function (errJson) {
                            var errMsg = (errJson && errJson.error && errJson.error.message) || ('HTTP ' + sheetRes.status);
                            throw new Error('Token OAuth kedaluwarsa atau belum memiliki scope spreadsheets (' + errMsg + '). Klik tombol "Refresh access token" di OAuth Playground untuk membuat token baru, atau klik tombol "Masuk Mode Editor Cepat (1-Klik)" di atas.');
                        });
                    }

                    var durationSec = Number(expiresInSec) || 3599;
                    self.state = {
                        isAuthenticated: true,
                        isEditor: true,
                        accessToken: cleanedToken,
                        expiresAt: Date.now() + (durationSec * 1000),
                        email: userInfo.email || 'Editor Google Sheets',
                        name: userInfo.name || userInfo.email || 'Editor WebGIS',
                        picture: userInfo.picture || ''
                    };

                    self.saveSession();
                    self.scheduleExpiryWatcher();
                    self.syncHeaderUI();
                    self.notifyAuthChanged();
                    self.closeAuthModal();

                    if (window.WebGISApp) {
                        window.WebGISApp.showToast(
                            'Login Editor Google Sheets Berhasil (' + self.state.email + '). Anda kini dapat mengedit sel tabel dan menyimpan ke Google Sheets.',
                            'success',
                            5000
                        );
                    }
                })
                .catch(function (err) {
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.innerHTML = '<span style="color:var(--danger-600);font-weight:600;"><i class="fas fa-times-circle"></i> ' +
                            window.WebGISApp.escapeHtml(err.message) + '</span>';
                    }
                    if (window.WebGISApp) {
                        window.WebGISApp.showToast(err.message, 'error', 5500);
                    }
                });
        },

        /**
         * Logout current Editor session and revoke token if desired
         */
        logout: function () {
            var token = this.state.accessToken;
            if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
                try {
                    window.google.accounts.oauth2.revoke(token, function () {});
                } catch (e) {}
            }

            if (this.expiryTimerId) {
                clearTimeout(this.expiryTimerId);
                this.expiryTimerId = null;
            }

            this.state = {
                isAuthenticated: false,
                isEditor: false,
                accessToken: null,
                expiresAt: 0,
                email: '',
                name: '',
                picture: ''
            };

            this.saveSession();
            this.syncHeaderUI();
            this.notifyAuthChanged();
            this.closeAuthModal();

            if (window.WebGISApp) {
                window.WebGISApp.showToast('Anda telah keluar dari Mode Editor. Halaman kembali ke Mode Lihat (Publik).', 'info', 3500);
            }
        },

        /**
         * Inject OAuth 2.0 Authentication & Setup Modal into DOM
         */
        injectAuthModal: function () {
            if (document.getElementById('webgisAuthModalBackdrop')) return;

            var self = this;
            var modalBackdrop = document.createElement('div');
            modalBackdrop.id = 'webgisAuthModalBackdrop';
            modalBackdrop.className = 'auth-modal-backdrop';
            modalBackdrop.setAttribute('role', 'dialog');
            modalBackdrop.setAttribute('aria-modal', 'true');
            modalBackdrop.setAttribute('aria-labelledby', 'webgisAuthModalTitle');

            modalBackdrop.innerHTML =
                '<div class="auth-modal-dialog">' +
                    '<div class="auth-modal-header">' +
                        '<div id="webgisAuthModalTitle" class="auth-modal-title">' +
                            '<i class="fas fa-user-shield" style="color:#34d399;"></i>' +
                            '<span>Autentikasi Editor Google Sheets (OAuth 2.0)</span>' +
                        '</div>' +
                        '<button type="button" id="authModalCloseBtn" class="auth-modal-close" aria-label="Tutup Modal">' +
                            '<i class="fas fa-times"></i>' +
                        '</button>' +
                    '</div>' +
                    '<div id="authModalBodyContent" class="auth-modal-body"></div>' +
                '</div>';

            document.body.appendChild(modalBackdrop);

            document.getElementById('authModalCloseBtn').addEventListener('click', function () {
                self.closeAuthModal();
            });

            modalBackdrop.addEventListener('click', function (ev) {
                if (ev.target === modalBackdrop) {
                    self.closeAuthModal();
                }
            });
        },

        /**
         * Render and open the OAuth 2.0 Modal
         */
        openAuthModal: function () {
            this.injectAuthModal();
            var self = this;
            var backdrop = document.getElementById('webgisAuthModalBackdrop');
            var bodyEl = document.getElementById('authModalBodyContent');
            if (!backdrop || !bodyEl) return;

            var currentClientId = this.getClientId();

            if (this.isAuthorizedEditor()) {
                var remainingMin = Math.max(1, Math.round((this.state.expiresAt - Date.now()) / 60000));
                bodyEl.innerHTML =
                    '<div class="auth-modal-section" style="border-color:#a7f3d0;background:#ecfdf5;">' +
                        '<div class="auth-modal-section-title" style="color:#065f46;">' +
                            '<i class="fas fa-check-circle" style="color:#10b981;"></i>' +
                            '<span>Sesi Editor Aktif & Terverifikasi</span>' +
                        '</div>' +
                        '<p style="font-size:0.83rem;color:#065f46;margin-bottom:0.55rem;">' +
                            'Akun: <strong>' + window.WebGISApp.escapeHtml(this.state.email) + '</strong><br>' +
                            'Sisa Waktu Token OAuth 2.0: <strong>~' + remainingMin + ' menit</strong>' +
                        '</p>' +
                        '<p style="font-size:0.78rem;color:#047857;">' +
                            'Anda dapat mengedit sel pada halaman <strong>Kalender &amp; Pembagian Tugas</strong> maupun <strong>Monitoring</strong> dengan melakukan klik 2x (double-click) atau klik langsung pada sel tabel, lalu menekan tombol <strong>Simpan ke Google Sheets</strong>.' +
                        '</p>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:flex-end;gap:0.65rem;">' +
                        '<button type="button" id="authModalStayBtn" class="btn btn-outline btn-sm">Tutup</button>' +
                        '<button type="button" id="authModalLogoutBtn" class="btn btn-primary btn-sm" style="background:var(--danger-600);">' +
                            '<i class="fas fa-sign-out-alt"></i><span>Keluar dari Mode Editor</span>' +
                        '</button>' +
                    '</div>';

                document.getElementById('authModalStayBtn').addEventListener('click', function () {
                    self.closeAuthModal();
                });
                document.getElementById('authModalLogoutBtn').addEventListener('click', function () {
                    self.logout();
                });
            } else {
                var playgroundDirectUrl = 'https://developers.google.com/oauthplayground/#step1&apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fspreadsheets&url=https%3A%2F%2F&content_type=application%2Fjson&http_method=GET&useDefaultOauthCred=checked&oauthEndpointSelect=Google&oauthAuthEndpointValue=https%3A%2F%2Faccounts.google.com%2Fo%2Foauth2%2Fv2%2Fauth&oauthTokenEndpointValue=https%3A%2F%2Foauth2.googleapis.com%2Ftoken&includeCredentials=unchecked&accessTokenType=bearer&autoRefreshToken=unchecked&accessType=offline&prompt=consent&response_type=code';

                bodyEl.innerHTML =
                    '<div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">' +
                        'Semua pengunjung dapat melihat data secara bebas (<strong>Mode Baca Publik</strong>). Pilih cara masuk ke <strong>Mode Editor</strong> di bawah ini:' +
                    '</div>' +

                    '<!-- Opsi 1: 1-Click Instant Editor Mode -->' +
                    '<div class="auth-modal-section" style="border-color:#a7f3d0;background:#ecfdf5;">' +
                        '<div class="auth-modal-section-title" style="color:#065f46;">' +
                            '<i class="fas fa-bolt" style="color:#10b981;"></i>' +
                            '<span>1. Masuk Mode Editor Cepat (1-Klik Tanpa Token — Paling Mudah)</span>' +
                        '</div>' +
                        '<p style="font-size:0.76rem;color:#047857;margin-bottom:0.65rem;">' +
                            'Langsung aktifkan fitur edit tabel di halaman <strong>Kalender &amp; Tugas</strong> serta <strong>Monitoring</strong>, lengkap dengan pembaruan otomatis grafik <strong>Bar Chart</strong> tanpa perlu menyalin kode token.' +
                        '</p>' +
                        '<button type="button" id="authInstantEditorBtn" class="btn btn-accent" style="width:100%;font-weight:700;padding:0.65rem 1rem;">' +
                            '<i class="fas fa-unlock-alt"></i>' +
                            '<span>Aktifkan Mode Editor Sekarang (1-Klik)</span>' +
                        '</button>' +
                    '</div>' +

                    '<!-- Opsi 2: Direct OAuth 2.0 Access Token (Sinkron Cloud Google Sheets) -->' +
                    '<div class="auth-modal-section">' +
                        '<div class="auth-modal-section-title">' +
                            '<i class="fas fa-key" style="color:var(--accent-600);"></i>' +
                            '<span>2. Sinkron Langsung ke Google Sheets (OAuth 2.0 Access Token)</span>' +
                        '</div>' +
                        '<p style="font-size:0.74rem;color:var(--text-muted);margin-bottom:0.45rem;">' +
                            'Klik <a href="' + playgroundDirectUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary-600);font-weight:700;text-decoration:underline;">Buka OAuth Playground (Otomatis Terisi Scope Spreadsheets)</a> &rarr; Klik <strong>Authorize APIs</strong> &rarr; Klik <strong>Exchange authorization code for tokens</strong> &rarr; Salin isi kotak <strong>Access token (ya29...)</strong>:' +
                        '</p>' +
                        '<div style="display:flex;gap:0.45rem;">' +
                            '<input id="authDirectTokenInput" type="text" class="form-input" style="flex:1;font-family:var(--font-mono);font-size:0.74rem;" ' +
                                'placeholder="Tempel kode Access token yang diawali ya29.a0..." autocomplete="off">' +
                            '<button type="button" id="authVerifyTokenBtn" class="btn btn-primary btn-sm">' +
                                '<i class="fas fa-shield-alt"></i><span>Verifikasi Token</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +

                    '<!-- Opsi 3: Google Identity Services OAuth 2.0 Popup (Domain GitHub Pages) -->' +
                    '<div class="auth-modal-section">' +
                        '<div class="auth-modal-section-title">' +
                            '<i class="fab fa-google" style="color:var(--primary-600);"></i>' +
                            '<span>3. Login Popup Google OAuth 2.0 (Untuk Domain GitHub Pages)</span>' +
                        '</div>' +
                        '<div style="margin-bottom:0.55rem;">' +
                            '<div style="display:flex;gap:0.45rem;">' +
                                '<input id="authClientIdInput" type="text" class="form-input" style="flex:1;font-family:var(--font-mono);font-size:0.74rem;" ' +
                                    'placeholder="Google Cloud OAuth Client ID (...apps.googleusercontent.com)" value="' + window.WebGISApp.escapeHtml(currentClientId) + '">' +
                                '<button type="button" id="authSaveClientIdBtn" class="btn btn-outline btn-sm" title="Simpan Client ID di Browser">' +
                                    '<i class="fas fa-check"></i><span>Simpan ID</span>' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<button type="button" id="authTriggerGoogleBtn" class="auth-google-btn">' +
                            '<i class="fab fa-google"></i>' +
                            '<span>Login Editor via Google OAuth 2.0</span>' +
                        '</button>' +
                    '</div>' +

                    '<div id="authModalVerifyStatus" style="display:none;font-size:0.8rem;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);background:var(--bg-subtle);"></div>';

                var instantBtn = document.getElementById('authInstantEditorBtn');
                var clientIdInput = document.getElementById('authClientIdInput');
                var saveClientIdBtn = document.getElementById('authSaveClientIdBtn');
                var googleBtn = document.getElementById('authTriggerGoogleBtn');
                var directTokenInput = document.getElementById('authDirectTokenInput');
                var verifyTokenBtn = document.getElementById('authVerifyTokenBtn');

                if (instantBtn) {
                    instantBtn.addEventListener('click', function () {
                        self.activateInstantEditorMode();
                    });
                }

                if (saveClientIdBtn && clientIdInput) {
                    saveClientIdBtn.addEventListener('click', function () {
                        self.setClientId(clientIdInput.value);
                        if (window.WebGISApp) {
                            window.WebGISApp.showToast('OAuth 2.0 Client ID berhasil disimpan di browser.', 'success', 3000);
                        }
                    });
                }

                if (googleBtn) {
                    googleBtn.addEventListener('click', function () {
                        if (clientIdInput && clientIdInput.value.trim()) {
                            self.setClientId(clientIdInput.value.trim());
                        }
                        self.startGoogleOAuthLogin();
                    });
                }

                if (verifyTokenBtn && directTokenInput) {
                    verifyTokenBtn.addEventListener('click', function () {
                        self.verifyAndActivateToken(directTokenInput.value, 3599);
                    });
                }
            }

            backdrop.classList.add('is-open');
        },

        /**
         * Close OAuth 2.0 Modal
         */
        closeAuthModal: function () {
            var backdrop = document.getElementById('webgisAuthModalBackdrop');
            if (backdrop) {
                backdrop.classList.remove('is-open');
            }
        }
    };

    window.WebGISAuth = WebGISAuth;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            WebGISAuth.init();
        });
    } else {
        WebGISAuth.init();
    }
})();

