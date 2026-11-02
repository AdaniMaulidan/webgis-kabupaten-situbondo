/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/app.js
 * Description: Core Application Shell, Sidebar Controller, Toast System,
 *              Sync Indicator, & Shared UI Utilities.
 * ============================================================================
 */

(function () {
    'use strict';

    var SIDEBAR_STORAGE_KEY = 'webgis_situbondo_sidebar_collapsed';

    var WebGISApp = {
        /**
         * Initialize shared shell behaviors across all 5 pages
         */
        init: function () {
            this.initSkipLink();
            this.initSidebar();
            this.highlightActiveNav();
            this.initToastContainer();
            this.initHeaderActions();
            this.renderLayerCatalogIfPresent();
        },

        /**
         * Inject accessible Skip-to-Content link for keyboard navigation
         */
        initSkipLink: function () {
            var mainEl = document.querySelector('main.page-content');
            if (mainEl && !mainEl.id) {
                mainEl.id = 'mainContent';
                mainEl.setAttribute('tabindex', '-1');
            }
            if (mainEl && !document.querySelector('.skip-to-content')) {
                var skipLink = document.createElement('a');
                skipLink.href = '#mainContent';
                skipLink.className = 'skip-to-content';
                skipLink.textContent = 'Lewati ke Konten Utama';
                document.body.insertBefore(skipLink, document.body.firstChild);
            }
        },

        /**
         * Generate shimmer skeleton HTML for tables while loading from Google Sheets
         * @param {number} [rowsCount=7]
         * @returns {string}
         */
        getTableSkeletonHtml: function (rowsCount) {
            var count = rowsCount || 7;
            var html =
                '<div class="skeleton-table-wrapper" role="status" aria-label="Sedang memuat data dari Google Sheets">' +
                    '<div class="skeleton-row">' +
                        '<div class="skeleton-cell skeleton-header"></div>' +
                        '<div class="skeleton-cell skeleton-header"></div>' +
                        '<div class="skeleton-cell skeleton-header"></div>' +
                        '<div class="skeleton-cell skeleton-header"></div>' +
                        '<div class="skeleton-cell skeleton-header"></div>' +
                    '</div>';
            for (var i = 0; i < count; i++) {
                html +=
                    '<div class="skeleton-row">' +
                        '<div class="skeleton-cell"></div>' +
                        '<div class="skeleton-cell"></div>' +
                        '<div class="skeleton-cell"></div>' +
                        '<div class="skeleton-cell"></div>' +
                        '<div class="skeleton-cell"></div>' +
                    '</div>';
            }
            html += '</div>';
            return html;
        },

        /**
         * Sidebar Desktop Collapse & Mobile Off-Canvas Drawer Controller
         */
        initSidebar: function () {
            var body = document.body;
            var toggleBtn = document.getElementById('sidebarToggleBtn');
            var backdrop = document.getElementById('sidebarBackdrop');

            // Restore desktop collapsed preference
            try {
                if (window.innerWidth > 992 && localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1') {
                    body.classList.add('sidebar-collapsed');
                }
            } catch (e) {
                // Ignore storage errors in restricted environments
            }

            if (toggleBtn) {
                toggleBtn.addEventListener('click', function () {
                    if (window.innerWidth <= 992) {
                        body.classList.toggle('sidebar-mobile-open');
                    } else {
                        body.classList.toggle('sidebar-collapsed');
                        try {
                            localStorage.setItem(
                                SIDEBAR_STORAGE_KEY,
                                body.classList.contains('sidebar-collapsed') ? '1' : '0'
                            );
                        } catch (e) {}
                    }

                    // Notify Leaflet map & Chart.js after CSS transition finishes
                    setTimeout(function () {
                        window.dispatchEvent(new Event('resize'));
                        if (window.map && typeof window.map.invalidateSize === 'function') {
                            window.map.invalidateSize();
                        }
                    }, 280);
                });
            }

            if (backdrop) {
                backdrop.addEventListener('click', function () {
                    body.classList.remove('sidebar-mobile-open');
                });
            }

            // Close mobile drawer on Escape key
            document.addEventListener('keydown', function (ev) {
                if (ev.key === 'Escape' && body.classList.contains('sidebar-mobile-open')) {
                    body.classList.remove('sidebar-mobile-open');
                }
            });
        },

        /**
         * Automatically mark current page link as active in sidebar
         */
        highlightActiveNav: function () {
            var path = window.location.pathname;
            var pageName = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
            var links = document.querySelectorAll('.sidebar-nav .nav-link');

            links.forEach(function (link) {
                var href = link.getAttribute('href');
                if (!href) return;
                if (href === pageName || (pageName === '' && href === 'index.html')) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.classList.remove('active');
                    link.removeAttribute('aria-current');
                }
            });
        },

        /**
         * Create floating toast container if not already in DOM
         */
        initToastContainer: function () {
            if (!document.getElementById('appToastContainer')) {
                var container = document.createElement('div');
                container.id = 'appToastContainer';
                container.className = 'toast-container';
                container.setAttribute('aria-live', 'polite');
                document.body.appendChild(container);
            }
        },

        /**
         * Show a non-intrusive toast message
         * @param {string} message
         * @param {'success'|'error'|'warning'|'info'} [type='info']
         * @param {number} [durationMs=4000]
         */
        showToast: function (message, type, durationMs) {
            this.initToastContainer();
            var container = document.getElementById('appToastContainer');
            if (!container) return;
            var toastType = type || 'info';
            var duration = durationMs || 4000;

            var iconHtml = '<i class="fas fa-info-circle"></i>';
            if (toastType === 'success') iconHtml = '<i class="fas fa-check-circle" style="color:#34d399;"></i>';
            if (toastType === 'error') iconHtml = '<i class="fas fa-exclamation-circle" style="color:#f87171;"></i>';
            if (toastType === 'warning') iconHtml = '<i class="fas fa-exclamation-triangle" style="color:#fbbf24;"></i>';

            var item = document.createElement('div');
            item.className = 'toast-item toast-' + toastType;
            item.innerHTML =
                '<span style="margin-top:2px;">' + iconHtml + '</span>' +
                '<div style="flex:1;line-height:1.4;">' + this.escapeHtml(message) + '</div>';

            container.appendChild(item);

            setTimeout(function () {
                item.style.opacity = '0';
                item.style.transform = 'translateY(8px)';
                item.style.transition = 'all 200ms ease';
                setTimeout(function () {
                    if (item.parentNode) item.parentNode.removeChild(item);
                }, 220);
            }, duration);
        },

        /**
         * Update header sync pill state
         * @param {'synced'|'syncing'|'offline'} state
         * @param {string} labelText
         */
        setSyncStatus: function (state, labelText) {
            var dot = document.getElementById('headerSyncDot');
            var text = document.getElementById('headerSyncText');
            if (dot) {
                dot.className = 'sync-dot' + (state === 'syncing' ? ' syncing' : '');
                if (state === 'offline') {
                    dot.style.backgroundColor = '#ef4444';
                } else if (state === 'synced') {
                    dot.style.backgroundColor = '#10b981';
                }
            }
            if (text && labelText) {
                text.textContent = labelText;
            }
        },

        /**
         * Update header access mode badge (Read-Only vs Authorized Editor)
         * @param {{isEditor: boolean, email?: string}} authState
         */
        updateAuthBadge: function (authState) {
            var badge = document.getElementById('headerAuthBadge');
            var loginBtn = document.getElementById('headerAuthBtn');
            if (!badge) return;

            if (authState && authState.isEditor) {
                badge.className = 'auth-mode-badge mode-editor';
                badge.innerHTML =
                    '<i class="fas fa-user-check"></i>' +
                    '<span>Mode Editor' + (authState.email ? ' (' + this.escapeHtml(authState.email) + ')' : '') + '</span>';
                if (loginBtn) {
                    loginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>Keluar Editor</span>';
                }
            } else {
                badge.className = 'auth-mode-badge';
                badge.innerHTML =
                    '<i class="fas fa-eye"></i>' +
                    '<span>Mode Lihat (Publik)</span>';
                if (loginBtn) {
                    loginBtn.innerHTML = '<i class="fas fa-user-shield"></i><span>Login Editor</span>';
                }
            }
        },

        /**
         * Wire up common header buttons
         */
        initHeaderActions: function () {
            var self = this;
            var authBtn = document.getElementById('headerAuthBtn');
            if (authBtn) {
                authBtn.addEventListener('click', function () {
                    if (window.WebGISAuth && typeof window.WebGISAuth.handleAuthButtonClick === 'function') {
                        window.WebGISAuth.handleAuthButtonClick();
                    } else {
                        self.showToast(
                            'Modul autentikasi OAuth 2.0 Editor akan diaktifkan pada Phase 05 sesuai roadmap pengembangan.',
                            'info',
                            4000
                        );
                    }
                });
            }

            var refreshBtn = document.getElementById('headerRefreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    if (typeof window.onAppRefreshRequested === 'function') {
                        window.onAppRefreshRequested();
                    } else {
                        self.setSyncStatus('syncing', 'Memperbarui...');
                        setTimeout(function () {
                            var now = new Date();
                            var timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                            self.setSyncStatus('synced', 'Sinkron ' + timeStr);
                            self.showToast('Status tampilan berhasil disegarkan.', 'success', 2500);
                        }, 450);
                    }
                });
            }
        },

        /**
         * Render 8 BIG GIS Layer cards dynamically if container exists on page
         */
        renderLayerCatalogIfPresent: function () {
            var container = document.getElementById('layerCatalogContainer');
            if (!container || !window.WEBGIS_CONFIG || !window.WEBGIS_CONFIG.gisLayers) return;

            var layers = window.WEBGIS_CONFIG.gisLayers;
            var html = '';
            for (var i = 0; i < layers.length; i++) {
                var lyr = layers[i];
                html +=
                    '<div class="layer-card">' +
                        '<div class="layer-card-top">' +
                            '<span class="layer-code">' + this.escapeHtml(lyr.code) + '</span>' +
                            '<span class="layer-swatch" style="background-color:' + lyr.color + ';" title="Warna Simbologi"></span>' +
                        '</div>' +
                        '<div style="font-weight:700;font-size:0.94rem;color:var(--text-primary);">' +
                            this.escapeHtml(lyr.name) +
                        '</div>' +
                        '<p style="font-size:0.8rem;color:var(--text-muted);flex:1;">' +
                            this.escapeHtml(lyr.description) +
                        '</p>' +
                        '<div style="display:flex;align-items:center;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);padding-top:0.45rem;border-top:1px dashed var(--border-color);">' +
                            '<span><i class="fas fa-draw-polygon" style="margin-right:4px;color:var(--primary-600);"></i>' + this.escapeHtml(lyr.geometryType) + '</span>' +
                            '<strong>' + lyr.featureCount.toLocaleString('id-ID') + ' Fitur</strong>' +
                        '</div>' +
                    '</div>';
            }
            container.innerHTML = html;
        },

        /**
         * Safe HTML escaping to prevent XSS
         * @param {any} str
         * @returns {string}
         */
        escapeHtml: function (str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };

    window.WebGISApp = WebGISApp;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            WebGISApp.init();
        });
    } else {
        WebGISApp.init();
    }
})();

