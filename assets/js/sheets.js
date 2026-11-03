/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/sheets.js
 * Description: Live Google Sheets Data Service (JSONP + Fetch), Schema Parser,
 *              Forward-Fill Merged Group Handler, Tabulator Table Controller,
 *              & 6-Month Visual Calendar Matrix Renderer.
 * ============================================================================
 */

(function () {
    'use strict';

    var CONFIG = window.WEBGIS_CONFIG;
    var jsonpCounter = 0;

    var WebGISSheets = {
        cache: {},
        kalenderTable: null,
        monitoringTable: null,
        currentKalenderGid: (CONFIG && CONFIG.spreadsheets && CONFIG.spreadsheets.kalender && CONFIG.spreadsheets.kalender.defaultGid) || '368658062',
        currentKalenderTabType: 'task_table',
        currentKalenderRecords: [],
        currentMonitoringGid: '0',
        currentMonitoringRecords: [],
        kalenderMinimalToolbar: true,
        monitoringMinimalToolbar: true,
        lastKalenderSignature: '',
        lastMonitoringSignature: '',
        realtimeIntervalId: null,

        /**
         * Initialize automatic page controllers based on DOM elements present
         */
        init: function () {
            var self = this;

            if (document.getElementById('kalenderTableContainer')) {
                this.initKalenderPage();
                this.initNativeSheetControls('kalender');
            }

            if (document.getElementById('monitoringTableContainer')) {
                this.initMonitoringPage();
                this.initNativeSheetControls('monitoring');
            }

            if (document.getElementById('dashboardSchedulePreview')) {
                this.initDashboardLiveSummary();
            }

            // Start 2-Way Real-Time Background Auto-Sync (every 3 seconds)
            this.startRealtimeAutoSync();

            // Hook global Refresh button in Top Header
            window.onAppRefreshRequested = function () {
                self.refreshCurrentPageData(true);
                self.reloadNativeSheetIframe();
            };
        },

        /**
         * Build a compact string signature of parsed records to detect live Google Sheets edits
         */
        computeRecordsSignature: function (records) {
            try {
                return JSON.stringify((records || []).map(function (r) {
                    return r._raw || r;
                }));
            } catch (e) {
                return String(Date.now());
            }
        },

        /**
         * Build the live interactive Google Sheets URL for a given spreadsheetId & gid
         */
        buildNativeSheetUrl: function (spreadsheetId, gid, minimalToolbar) {
            var url = 'https://docs.google.com/spreadsheets/d/' +
                encodeURIComponent(spreadsheetId) +
                '/edit?gid=' + encodeURIComponent(gid) +
                '#gid=' + encodeURIComponent(gid);
            if (minimalToolbar) {
                url = 'https://docs.google.com/spreadsheets/d/' +
                    encodeURIComponent(spreadsheetId) +
                    '/edit?gid=' + encodeURIComponent(gid) +
                    '&rm=minimal#gid=' + encodeURIComponent(gid);
            }
            return url;
        },

        /**
         * Update the embedded Google Sheets iframe when switching tabs or toggling toolbar mode
         */
        updateNativeSheetIframe: function (pageType, gid) {
            if (pageType === 'kalender') {
                var kIframe = document.getElementById('kalenderNativeSheetIframe');
                if (kIframe && CONFIG && CONFIG.spreadsheets && CONFIG.spreadsheets.kalender) {
                    var nextKUrl = this.buildNativeSheetUrl(CONFIG.spreadsheets.kalender.id, gid, this.kalenderMinimalToolbar);
                    if (kIframe.getAttribute('src') !== nextKUrl) {
                        kIframe.setAttribute('src', nextKUrl);
                    }
                }
            } else if (pageType === 'monitoring') {
                var mIframe = document.getElementById('monitoringNativeSheetIframe');
                if (mIframe && CONFIG && CONFIG.spreadsheets && CONFIG.spreadsheets.monitoring) {
                    var nextMUrl = this.buildNativeSheetUrl(CONFIG.spreadsheets.monitoring.id, gid, this.monitoringMinimalToolbar);
                    if (mIframe.getAttribute('src') !== nextMUrl) {
                        mIframe.setAttribute('src', nextMUrl);
                    }
                }
            }
        },

        /**
         * Reload active native Google Sheets iframe (e.g., after saving from web table)
         */
        reloadNativeSheetIframe: function () {
            var kIframe = document.getElementById('kalenderNativeSheetIframe');
            if (kIframe) {
                var kUrl = this.buildNativeSheetUrl(CONFIG.spreadsheets.kalender.id, this.currentKalenderGid, this.kalenderMinimalToolbar);
                kIframe.setAttribute('src', kUrl);
            }
            var mIframe = document.getElementById('monitoringNativeSheetIframe');
            if (mIframe) {
                var mUrl = this.buildNativeSheetUrl(CONFIG.spreadsheets.monitoring.id, this.currentMonitoringGid, this.monitoringMinimalToolbar);
                mIframe.setAttribute('src', mUrl);
            }
        },

        /**
         * Initialize View Mode Switcher (Native Sheet / Split / Web Table),
         * Toolbar Mode Toggle, Force Sync button, and Fullscreen toggle.
         */
        initNativeSheetControls: function (pageType) {
            var self = this;
            var isKalender = pageType === 'kalender';
            var switcher = document.getElementById(isKalender ? 'kalenderViewModeSwitcher' : 'monitoringViewModeSwitcher');
            var nativeWrap = document.getElementById(isKalender ? 'kalenderNativeSheetContainer' : 'monitoringNativeSheetContainer');
            var tableWrap = document.getElementById(isKalender ? 'kalenderDashboardTableWrap' : 'monitoringDashboardTableWrap');
            var forceSyncBtn = document.getElementById(isKalender ? 'kalenderForceSyncBtn' : 'monitoringForceSyncBtn');
            var toggleToolbarBtn = document.getElementById(isKalender ? 'kalenderToggleToolbarBtn' : 'monitoringToggleToolbarBtn');
            var fullscreenBtn = document.getElementById(isKalender ? 'kalenderFullscreenSheetBtn' : 'monitoringFullscreenSheetBtn');
            var cardEl = document.getElementById(isKalender ? 'kalenderSheetCard' : 'monitoringSheetCard');

            var applyViewMode = function (mode) {
                if (!nativeWrap || !tableWrap) return;
                if (switcher) {
                    switcher.querySelectorAll('.view-mode-btn').forEach(function (b) {
                        b.classList.toggle('active', b.getAttribute('data-view-mode') === mode);
                    });
                }
                if (mode === 'native') {
                    nativeWrap.style.display = 'block';
                    tableWrap.style.display = 'none';
                } else if (mode === 'split') {
                    nativeWrap.style.display = 'block';
                    tableWrap.style.display = 'block';
                } else if (mode === 'table') {
                    nativeWrap.style.display = 'none';
                    tableWrap.style.display = 'block';
                }
                // Redraw Tabulator when table becomes visible
                setTimeout(function () {
                    if (isKalender && self.kalenderTable && typeof self.kalenderTable.redraw === 'function') {
                        self.kalenderTable.redraw(true);
                    }
                    if (!isKalender && self.monitoringTable && typeof self.monitoringTable.redraw === 'function') {
                        self.monitoringTable.redraw(true);
                    }
                }, 80);
            };

            if (switcher) {
                switcher.querySelectorAll('.view-mode-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        applyViewMode(btn.getAttribute('data-view-mode'));
                    });
                });
            }

            if (forceSyncBtn) {
                forceSyncBtn.addEventListener('click', function () {
                    self.pollRealtimeChanges(true);
                });
            }

            if (toggleToolbarBtn) {
                toggleToolbarBtn.addEventListener('click', function () {
                    if (isKalender) {
                        self.kalenderMinimalToolbar = !self.kalenderMinimalToolbar;
                        toggleToolbarBtn.innerHTML = '<i class="fas fa-sliders-h"></i><span>' +
                            (self.kalenderMinimalToolbar ? 'Toolbar' : 'Toolbar: ON') + '</span>';
                        self.updateNativeSheetIframe('kalender', self.currentKalenderGid);
                    } else {
                        self.monitoringMinimalToolbar = !self.monitoringMinimalToolbar;
                        toggleToolbarBtn.innerHTML = '<i class="fas fa-sliders-h"></i><span>' +
                            (self.monitoringMinimalToolbar ? 'Toolbar' : 'Toolbar: ON') + '</span>';
                        self.updateNativeSheetIframe('monitoring', self.currentMonitoringGid);
                    }
                });
            }

            if (fullscreenBtn && cardEl) {
                fullscreenBtn.addEventListener('click', function () {
                    var isFull = cardEl.classList.toggle('native-sheet-fullscreen');
                    fullscreenBtn.innerHTML = isFull
                        ? '<i class="fas fa-compress"></i><span>Keluar</span>'
                        : '<i class="fas fa-expand"></i><span>Penuh</span>';
                });
            }

            // Expose helper to auto-reveal web table when user types in search or changes filters
            if (isKalender) {
                this.ensureKalenderTableVisible = function () {
                    if (tableWrap && tableWrap.style.display === 'none') {
                        applyViewMode('split');
                    }
                };
            } else {
                this.ensureMonitoringTableVisible = function () {
                    if (tableWrap && tableWrap.style.display === 'none') {
                        applyViewMode('split');
                    }
                };
            }
        },

        /**
         * Accurately check if a Status string means achieved ("Tercapai" / "Selesai")
         * and NEVER false-matches "Belum Tercapai" or "Tidak Tercapai".
         */
        isStatusTercapai: function (statusStr) {
            var s = String(statusStr || '').trim().toLowerCase();
            if (!s) return false;
            if (/belum|tidak|bukan|proses|sedang|kurang|gagal|tunda|pending|0%/i.test(s)) {
                return false;
            }
            return /tercapai|selesai|tuntas|100%|done|complete|sudah/i.test(s);
        },

        /**
         * Parse numeric integer/float from cell string (e.g. "18" or "18 Bidang" -> 18)
         */
        parseNumericCell: function (rawVal) {
            if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return null;
            var cleaned = String(rawVal).replace(',', '.').replace(/[^0-9.\-]/g, '').trim();
            if (!cleaned) return null;
            var num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        },

        /**
         * Evaluate Status, Capaian %, Jumlah Bidang, and Jumlah Bidang Yang Dikerjakan together.
         * Supports automatic Capaian (%) calculation from (Jumlah Bidang Dikerjakan / Jumlah Bidang)
         * and ensures changing Status to "Belum Tercapai" immediately updates achievement status.
         */
        evaluateMonitoringRow: function (rawStatus, rawCapaian, rawJumlahBidang, rawJumlahDikerjakan) {
            var s = String(rawStatus || '').trim().toLowerCase();
            var parsedPersen = null;

            if (rawCapaian !== undefined && rawCapaian !== null && String(rawCapaian).trim() !== '') {
                var numStr = String(rawCapaian).replace('%', '').replace(',', '.').trim();
                var numVal = parseFloat(numStr);
                if (!isNaN(numVal)) {
                    // If raw value is a decimal ratio between 0 and 1 (e.g. 0.9444 without '%'), scale to 0..100
                    if (numVal > 0 && numVal <= 1 && String(rawCapaian).indexOf('%') === -1) {
                        numVal = Math.round(numVal * 100);
                    }
                    parsedPersen = Math.max(0, Math.min(100, Math.round(numVal)));
                }
            }

            var targetBidang = this.parseNumericCell(rawJumlahBidang);
            var dikerjakanBidang = this.parseNumericCell(rawJumlahDikerjakan);
            var calcBidangPersen = null;

            if (targetBidang !== null && targetBidang > 0 && dikerjakanBidang !== null && dikerjakanBidang >= 0) {
                calcBidangPersen = Math.max(0, Math.min(100, Math.round((dikerjakanBidang / targetBidang) * 100)));
            }

            // Prefer calculated bidang percentage if sheet formula is missing or inverted (>100% when dikerjakan < target)
            var basePersen = parsedPersen;
            if (calcBidangPersen !== null) {
                if (basePersen === null || (dikerjakanBidang < targetBidang && basePersen >= 100)) {
                    basePersen = calcBidangPersen;
                }
            }

            var isNegative = /belum|tidak|bukan|gagal|tunda|0%/i.test(s);
            var isProgress = !isNegative && /proses|sedang|jalan|progress|on\s*going/i.test(s);
            var isPositive = !isNegative && !isProgress && /tercapai|selesai|tuntas|100%|done|complete|sudah/i.test(s);

            var effectivePersen = 0;
            var isAchieved = false;

            if (isNegative) {
                isAchieved = false;
                effectivePersen = (basePersen !== null && basePersen < 100) ? basePersen : 0;
            } else if (isProgress) {
                isAchieved = false;
                effectivePersen = (basePersen !== null && basePersen < 100) ? basePersen : 50;
            } else if (isPositive) {
                effectivePersen = basePersen !== null ? basePersen : 100;
                isAchieved = true;
            } else {
                effectivePersen = basePersen !== null ? basePersen : 0;
                isAchieved = effectivePersen >= 100;
            }

            return {
                capaianNilai: effectivePersen,
                jumlahBidang: targetBidang !== null ? targetBidang : 0,
                jumlahDikerjakan: dikerjakanBidang !== null ? dikerjakanBidang : 0,
                hasBidangData: (targetBidang !== null && targetBidang > 0) || (dikerjakanBidang !== null && dikerjakanBidang > 0),
                isAchieved: isAchieved,
                isNegative: isNegative,
                isProgress: isProgress
            };
        },

        /**
         * Determine if a monitoring row represents an active/started task row
         * (Ignores unstarted future week rows that only have "0%" from =IFERROR(H/G,0))
         */
        isMonitoringRowActive: function (r) {
            if (!r) return false;
            var hasKegiatan = !!(r.kegiatan && r.kegiatan !== '-');
            var hasTargetIni = !!(r.targetMingguIni && r.targetMingguIni !== '-');
            var hasStatus = !!(r.status && r.status !== 'Belum Diisi');
            var hasBidang = (Number(r.jumlahBidang) > 0) || (Number(r.jumlahDikerjakan) > 0);
            var hasPositiveCapaian = Number(r.capaianNilai) > 0;
            return hasKegiatan || hasTargetIni || hasStatus || hasBidang || hasPositiveCapaian;
        },

        /**
         * Start 2-Way Real-Time Auto-Sync Polling (Every 3 Seconds + MouseLeave / Focus)
         * Pulls latest edits made inside Google Sheets and updates Web Charts, KPIs, & Tables automatically.
         */
        startRealtimeAutoSync: function () {
            var self = this;
            if (this.realtimeIntervalId) {
                clearInterval(this.realtimeIntervalId);
            }

            this.realtimeIntervalId = setInterval(function () {
                if (typeof document !== 'undefined' && document.hidden) return;
                self.pollRealtimeChanges(false);
            }, 3000);

            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('focus', function () {
                    self.pollRealtimeChanges(false);
                });
            }

            // Trigger instant sync when user moves cursor out of the embedded Google Sheet after editing
            ['monitoringNativeSheetContainer', 'kalenderNativeSheetContainer'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el && typeof el.addEventListener === 'function') {
                    el.addEventListener('mouseleave', function () {
                        self.pollRealtimeChanges(false);
                        setTimeout(function () {
                            self.pollRealtimeChanges(false);
                        }, 2000);
                    });
                }
            });
        },

        /**
         * Silently poll Google Sheets for changes without showing disruptive loading skeletons
         */
        pollRealtimeChanges: function (isManualTrigger) {
            var self = this;

            if (isManualTrigger && window.WebGISApp) {
                window.WebGISApp.setSyncStatus('syncing', 'Sinkronisasi Real-Time...');
            }

            // 1. Kalender Page Silent Poll
            if (document.getElementById('kalenderTableContainer')) {
                var kGid = this.currentKalenderGid;
                var kType = this.currentKalenderTabType;
                this.fetchGvizTable(CONFIG.spreadsheets.kalender.id, kGid, true)
                    .then(function (gvizTable) {
                        var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        var syncLabel = document.getElementById('kalenderLastSyncLabel');
                        if (syncLabel) {
                            syncLabel.textContent = 'Live Sync Real-Time Aktif • Terakhir dicek: ' + nowStr;
                        }
                        if (window.WebGISApp) {
                            window.WebGISApp.setSyncStatus('synced', 'Live Sync ' + nowStr);
                        }

                        if (kType !== 'calendar_matrix') {
                            var records = self.parseTaskTableData(gvizTable, kGid);
                            var newSig = self.computeRecordsSignature(records);
                            if (self.lastKalenderSignature && self.lastKalenderSignature !== newSig) {
                                self.currentKalenderRecords = records;
                                self.lastKalenderSignature = newSig;
                                self.populateKalenderDateFilter(records);
                                self.applyKalenderFilters();
                                if (window.WebGISApp) {
                                    window.WebGISApp.showToast('Perubahan baru dari Google Sheets berhasil disinkronkan secara real-time!', 'success', 3200);
                                }
                            } else {
                                self.lastKalenderSignature = newSig;
                                if (isManualTrigger && window.WebGISApp) {
                                    window.WebGISApp.showToast('Data sudah sinkron 100% dengan Google Sheets terbaru (' + nowStr + ').', 'info', 2500);
                                }
                            }
                        }
                    })
                    .catch(function () {});
            }

            // 2. Monitoring Page Silent Poll
            if (document.getElementById('monitoringTableContainer')) {
                var mGid = this.currentMonitoringGid;
                this.fetchGvizTable(CONFIG.spreadsheets.monitoring.id, mGid, true)
                    .then(function (gvizTable) {
                        var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        var syncLabel = document.getElementById('monitoringLastSyncLabel');
                        if (syncLabel) {
                            syncLabel.textContent = 'Live Sync Real-Time Aktif • Terakhir dicek: ' + nowStr;
                        }
                        if (window.WebGISApp) {
                            window.WebGISApp.setSyncStatus('synced', 'Live Sync ' + nowStr);
                        }

                        var records = self.parseMonitoringTableData(gvizTable, mGid);
                        var newSig = self.computeRecordsSignature(records);
                        if (self.lastMonitoringSignature && self.lastMonitoringSignature !== newSig) {
                            self.currentMonitoringRecords = records;
                            self.lastMonitoringSignature = newSig;
                            self.updateMonitoringKpiCards(records);
                            self.applyMonitoringFilters();

                            // Immediately update Bar Chart!
                            window.dispatchEvent(new CustomEvent('webgis:monitoring-data-loaded', {
                                detail: { gid: mGid, records: records }
                            }));

                            if (window.WebGISApp) {
                                window.WebGISApp.showToast('Perubahan di Google Sheets terdeteksi! Grafik Bar Chart & KPI telah diperbarui otomatis.', 'success', 3500);
                            }
                        } else {
                            self.lastMonitoringSignature = newSig;
                            if (isManualTrigger) {
                                self.currentMonitoringRecords = records;
                                self.updateMonitoringKpiCards(records);
                                self.applyMonitoringFilters();
                                window.dispatchEvent(new CustomEvent('webgis:monitoring-data-loaded', {
                                    detail: { gid: mGid, records: records }
                                }));
                                if (window.WebGISApp) {
                                    window.WebGISApp.showToast('Grafik Bar Chart & Kartu KPI berhasil disinkronkan dengan Google Sheets terbaru (' + nowStr + ').', 'success', 2800);
                                }
                            }
                        }
                    })
                    .catch(function () {});
            }

            // 3. Dashboard Page Silent Poll (index.html)
            if (document.getElementById('dashboardSchedulePreview')) {
                var monthSelect = document.getElementById('dashboardMonthFilter');
                var dGid = monthSelect ? monthSelect.value : '0';
                this.fetchGvizTable(CONFIG.spreadsheets.monitoring.id, dGid, true)
                    .then(function (gvizTable) {
                        var records = self.parseMonitoringTableData(gvizTable, dGid);
                        var newSig = self.computeRecordsSignature(records);
                        if (self.lastMonitoringSignature && self.lastMonitoringSignature !== newSig) {
                            self.lastMonitoringSignature = newSig;
                            self.loadDashboardMonitoringSummary(dGid, true);
                        } else {
                            self.lastMonitoringSignature = newSig;
                        }
                    })
                    .catch(function () {});
            }
        },

        /**
         * Refresh active page data with cache-busting
         */
        refreshCurrentPageData: function (forceRefresh) {
            if (window.WebGISApp) {
                window.WebGISApp.setSyncStatus('syncing', 'Memuat dari Google Sheets...');
            }

            if (document.getElementById('kalenderTableContainer')) {
                this.loadKalenderSheet(this.currentKalenderGid, this.currentKalenderTabType, forceRefresh);
            } else if (document.getElementById('monitoringTableContainer')) {
                this.loadMonitoringSheet(this.currentMonitoringGid, forceRefresh);
            } else if (document.getElementById('dashboardSchedulePreview')) {
                this.initDashboardLiveSummary(forceRefresh);
            }
        },

        /**
         * Fetch Google Sheets gviz data via JSONP (works on https://, http://, and file://)
         * @param {string} spreadsheetId
         * @param {string} gid
         * @param {boolean} [forceRefresh=false]
         * @returns {Promise<Object>}
         */
        fetchGvizTable: function (spreadsheetId, gid, forceRefresh) {
            var self = this;
            var cacheKey = spreadsheetId + '_' + gid;

            if (!forceRefresh && this.cache[cacheKey]) {
                return Promise.resolve(this.cache[cacheKey]);
            }

            return new Promise(function (resolve, reject) {
                var cbName = '__webgisGvizCb_' + Date.now() + '_' + (++jsonpCounter);
                var scriptEl = document.createElement('script');
                var timeoutId = null;

                var cleanup = function () {
                    if (timeoutId) clearTimeout(timeoutId);
                    try {
                        delete window[cbName];
                    } catch (e) {
                        window[cbName] = undefined;
                    }
                    if (scriptEl && scriptEl.parentNode) {
                        scriptEl.parentNode.removeChild(scriptEl);
                    }
                };

                window[cbName] = function (response) {
                    cleanup();
                    if (response && response.status === 'ok' && response.table) {
                        self.cache[cacheKey] = response.table;
                        resolve(response.table);
                    } else {
                        reject(new Error('Respons Google Sheets tidak valid.'));
                    }
                };

                timeoutId = setTimeout(function () {
                    cleanup();
                    reject(new Error('Waktu koneksi ke Google Sheets habis (Timeout).'));
                }, 12000);

                var reqToken = Date.now() + '_' + jsonpCounter;
                var url =
                    'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(spreadsheetId) +
                    '/gviz/tq?tqx=out:json;responseHandler:' + cbName + ';reqId:' + reqToken +
                    '&headers=1&gid=' + encodeURIComponent(gid) +
                    '&_t=' + reqToken;

                scriptEl.src = url;
                scriptEl.async = true;
                scriptEl.onerror = function () {
                    cleanup();
                    reject(new Error('Gagal memuat data dari Google Sheets. Periksa koneksi internet Anda.'));
                };

                document.head.appendChild(scriptEl);
            });
        },

        /**
         * Extract cell string value safely from gviz row cell
         */
        getCellValue: function (rowObj, colIdx) {
            if (!rowObj || !rowObj.c || colIdx < 0 || !rowObj.c[colIdx]) return '';
            var cell = rowObj.c[colIdx];
            if (cell.f !== undefined && cell.f !== null && String(cell.f).trim() !== '') {
                return String(cell.f).trim();
            }
            if (cell.v !== undefined && cell.v !== null) {
                return String(cell.v).trim();
            }
            return '';
        },

        /**
         * Parse Spreadsheet 1 Kecamatan Task Table (e.g., Kec.Situbondo gid=368658062)
         * Dynamically detects column positions including the new "Jumlah Bidang Peranggota"
         * column placed after "Pembagian", while preserving 8-member merged blocks per 'No'.
         */
        parseTaskTableData: function (gvizTable, gid) {
            var rows = (gvizTable && gvizTable.rows) || [];
            var cols = (gvizTable && gvizTable.cols) || [];
            var numHeaders = (typeof gvizTable.parsedNumHeaders === 'number' && gvizTable.parsedNumHeaders > 0)
                ? gvizTable.parsedNumHeaders
                : 4;

            // Default column mapping for 12-column schema (with Jumlah Bidang Peranggota at Col K / index 10)
            var hasExtraCols = cols.length >= 12;
            var colMap = {
                no: 1,                  // Col B
                pic: 2,                 // Col C
                nama: 3,                // Col D
                kegiatan: 4,            // Col E
                tanggal: 5,             // Col F
                kecamatan: 6,           // Col G
                desa: 7,                // Col H
                totalBidang: 8,         // Col I
                pembagian: 9,           // Col J
                jumlahBidangAnggota: hasExtraCols ? 10 : -1, // Col K (after Pembagian)
                link: hasExtraCols ? 11 : 10                 // Col L (or Col K if 11 cols)
            };

            // Inspect header row (rows[0]) if present to dynamically adjust column indices
            if (rows.length > 0 && rows[0] && Array.isArray(rows[0].c)) {
                var hCells = rows[0].c;
                for (var cIdx = 1; cIdx < hCells.length; cIdx++) {
                    var hText = this.getCellValue(rows[0], cIdx).toLowerCase();
                    if (!hText) continue;
                    if (hText === 'no') colMap.no = cIdx;
                    else if (hText === 'pic') colMap.pic = cIdx;
                    else if (/nama\s*anggota/i.test(hText)) colMap.nama = cIdx;
                    else if (/kegiatan/i.test(hText)) colMap.kegiatan = cIdx;
                    else if (/tanggal/i.test(hText)) colMap.tanggal = cIdx;
                    else if (/kecamatan/i.test(hText)) colMap.kecamatan = cIdx;
                    else if (/desa|kelurahan/i.test(hText)) colMap.desa = cIdx;
                    else if (/total\s*bidang/i.test(hText)) colMap.totalBidang = cIdx;
                    else if (/pembagian/i.test(hText)) colMap.pembagian = cIdx;
                    else if (/jumlah\s*bidang/i.test(hText)) colMap.jumlahBidangAnggota = cIdx;
                    else if (/link/i.test(hText)) colMap.link = cIdx;
                }
                // If link shifted right of pembagian + 1, ensure jumlahBidangAnggota is the column right after pembagian
                if (colMap.link > colMap.pembagian + 1 && colMap.jumlahBidangAnggota === -1) {
                    colMap.jumlahBidangAnggota = colMap.pembagian + 1;
                }
            }

            var records = [];
            var currentGroup = {
                no: '',
                pic: '',
                kegiatan: '',
                tanggal: '',
                kecamatan: '',
                desa: '',
                totalBidang: '',
                link: '',
                groupAnchorRow: numHeaders + 1,
                picAnchorRow: numHeaders + 1
            };

            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var sheetRowNumber = numHeaders + 1 + i;

                var rawNo = this.getCellValue(r, colMap.no);
                var rawPic = this.getCellValue(r, colMap.pic);
                var rawNama = this.getCellValue(r, colMap.nama);
                var rawKegiatan = this.getCellValue(r, colMap.kegiatan);
                var rawTanggal = this.getCellValue(r, colMap.tanggal);
                var rawKecamatan = this.getCellValue(r, colMap.kecamatan);
                var rawDesa = this.getCellValue(r, colMap.desa);
                var rawBidang = this.getCellValue(r, colMap.totalBidang);
                var rawPembagian = this.getCellValue(r, colMap.pembagian);
                var rawJumlahAnggota = colMap.jumlahBidangAnggota >= 0 ? this.getCellValue(r, colMap.jumlahBidangAnggota) : '';
                var rawLink = this.getCellValue(r, colMap.link);

                // Skip completely blank spacer rows or repeated header rows
                if (!rawNama && !rawNo && !rawKegiatan && !rawPembagian && !rawJumlahAnggota) {
                    continue;
                }
                if (/^(nama\s*anggota|no|pic)$/i.test(rawNama.trim()) || rawNo.toLowerCase() === 'no') {
                    continue;
                }

                var isGroupStart = false;
                if (rawNo !== '') {
                    isGroupStart = true;
                    currentGroup.no = rawNo;
                    currentGroup.groupAnchorRow = sheetRowNumber;
                    if (rawKegiatan) currentGroup.kegiatan = rawKegiatan;
                    if (rawTanggal) currentGroup.tanggal = rawTanggal;
                    if (rawKecamatan) currentGroup.kecamatan = rawKecamatan;
                    if (rawDesa) currentGroup.desa = rawDesa;
                    currentGroup.totalBidang = rawBidang || '';
                    currentGroup.link = rawLink || '';
                } else {
                    if (rawKegiatan) currentGroup.kegiatan = rawKegiatan;
                    if (rawTanggal) currentGroup.tanggal = rawTanggal;
                    if (rawKecamatan) currentGroup.kecamatan = rawKecamatan;
                    if (rawDesa) currentGroup.desa = rawDesa;
                    if (rawBidang) currentGroup.totalBidang = rawBidang;
                    if (rawLink) currentGroup.link = rawLink;
                }

                if (rawPic !== '') {
                    currentGroup.pic = rawPic;
                    currentGroup.picAnchorRow = sheetRowNumber;
                }

                var normalizedName = CONFIG && CONFIG.normalizeMemberName
                    ? CONFIG.normalizeMemberName(rawNama)
                    : rawNama;

                var parsedJumlahAnggotaNum = this.parseNumericCell(rawJumlahAnggota);

                records.push({
                    id: gid + '_row_' + sheetRowNumber,
                    _gid: gid,
                    _sheetRowIndex: sheetRowNumber,
                    _groupAnchorRowIndex: currentGroup.groupAnchorRow,
                    _picAnchorRowIndex: currentGroup.picAnchorRow,
                    _isGroupStart: isGroupStart,
                    no: currentGroup.no,
                    pic: currentGroup.pic,
                    namaAnggota: normalizedName || rawNama,
                    kegiatan: currentGroup.kegiatan,
                    tanggal: currentGroup.tanggal,
                    kecamatan: currentGroup.kecamatan,
                    desa: currentGroup.desa,
                    totalBidang: rawBidang || currentGroup.totalBidang || '-',
                    pembagian: rawPembagian || '-',
                    jumlahBidangAnggota: rawJumlahAnggota !== '' ? rawJumlahAnggota : '-',
                    jumlahBidangAnggotaNum: parsedJumlahAnggotaNum !== null ? parsedJumlahAnggotaNum : 0,
                    link: rawLink || currentGroup.link || '',
                    _raw: {
                        no: rawNo,
                        pic: rawPic,
                        namaAnggota: rawNama,
                        kegiatan: rawKegiatan,
                        tanggal: rawTanggal,
                        kecamatan: rawKecamatan,
                        desa: rawDesa,
                        totalBidang: rawBidang,
                        pembagian: rawPembagian,
                        jumlahBidangAnggota: rawJumlahAnggota,
                        link: rawLink
                    }
                });
            }

            return this.applyLocalSavedEdits('kalender', gid, records);
        },

        /**
         * Overlay any locally saved edits from Instant Editor Mode (localStorage)
         */
        applyLocalSavedEdits: function (sheetType, gid, records) {
            var self = this;
            try {
                var saved = JSON.parse(localStorage.getItem('webgis_situbondo_local_edits') || '{}');
                var keys = Object.keys(saved);
                if (!keys.length) return records;

                records.forEach(function (rec) {
                    keys.forEach(function (k) {
                        var edit = saved[k];
                        if (!edit || edit.sheetType !== sheetType || String(edit.gid) !== String(gid)) return;
                        if (String(edit.rowId) === String(rec.id)) {
                            rec[edit.field] = edit.newValue;
                            if (sheetType === 'monitoring') {
                                var evalRes = self.evaluateMonitoringRow(
                                    rec.status,
                                    rec.capaianPersenRaw,
                                    rec.jumlahBidangRaw,
                                    rec.jumlahDikerjakanRaw
                                );
                                rec.capaianNilai = evalRes.capaianNilai;
                                rec.jumlahBidang = evalRes.jumlahBidang;
                                rec.jumlahDikerjakan = evalRes.jumlahDikerjakan;
                                rec._isAchieved = evalRes.isAchieved;
                            }
                        }
                    });
                });
            } catch (e) {}
            return records;
        },

        /**
         * Parse Spreadsheet 1 "Kalender Survei" (gid=0) 6-Month Visual Matrix
         * Extracts events for Okt 2026, Nov 2026, Des 2026, Jan 2027, Feb 2027, Mar 2027
         */
        parseCalendarMatrixData: function (gvizTable) {
            var rows = (gvizTable && gvizTable.rows) || [];
            var grid = [];
            for (var r = 0; r < rows.length; r++) {
                var rowArr = [];
                var cList = (rows[r] && rows[r].c) || [];
                for (var c = 0; c < 26; c++) {
                    var cell = cList[c];
                    var val = '';
                    if (cell) {
                        val = (cell.f !== undefined && cell.f !== null) ? String(cell.f).trim() : (cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '');
                    }
                    rowArr.push(val);
                }
                grid.push(rowArr);
            }

            var monthsConfig = [
                { title: 'Oktober 2026', startCol: 2, startRow: 2, endRow: 14 },
                { title: 'November 2026', startCol: 10, startRow: 2, endRow: 14 },
                { title: 'Desember 2026', startCol: 18, startRow: 2, endRow: 14 },
                { title: 'Januari 2027', startCol: 2, startRow: 16, endRow: 26 },
                { title: 'Februari 2027', startCol: 10, startRow: 16, endRow: 26 },
                { title: 'Maret 2027', startCol: 18, startRow: 16, endRow: 26 }
            ];

            var dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
            var parsedMonths = [];

            monthsConfig.forEach(function (mCfg) {
                var events = [];
                for (var rIdx = mCfg.startRow; rIdx <= mCfg.endRow && rIdx < grid.length; rIdx++) {
                    for (var offset = 0; offset < 7; offset++) {
                        var colIdx = mCfg.startCol + offset;
                        var cellText = (grid[rIdx] && grid[rIdx][colIdx]) || '';
                        if (
                            cellText &&
                            !/^\d+$/.test(cellText) &&
                            !/^(2026|2027|oktober|november|desember|januari|februari|maret|senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/i.test(cellText)
                        ) {
                            var dateNum = (rIdx > 0 && grid[rIdx - 1] && grid[rIdx - 1][colIdx]) || '';
                            var isHoliday = /cuti|hari raya|tahun baru|nyepi|idul fitri|wafat|ramadhan|imlek/i.test(cellText);
                            events.push({
                                month: mCfg.title,
                                dateNumber: dateNum,
                                dayName: dayNames[offset],
                                dateLabel: (dateNum ? ('Tgl ' + dateNum + ' ') : '') + '(' + dayNames[offset] + ')',
                                title: cellText,
                                isHoliday: isHoliday
                            });
                        }
                    }
                }
                parsedMonths.push({
                    title: mCfg.title,
                    events: events
                });
            });

            return parsedMonths;
        },

        /**
         * Parse Spreadsheet 2 Monitoring Table (Bulan 1 - Bulan 4)
         * Dynamically detects columns including "Jumlah Bidang" (Col G) and
         * "Jumlah Bidang Yang Di Kerjakan" (Col H), normalizes member names,
         * and computes Capaian (%) & Status.
         */
        parseMonitoringTableData: function (gvizTable, gid) {
            var rows = (gvizTable && gvizTable.rows) || [];
            var cols = (gvizTable && gvizTable.cols) || [];
            var numHeaders = (typeof gvizTable.parsedNumHeaders === 'number' && gvizTable.parsedNumHeaders > 0)
                ? gvizTable.parsedNumHeaders
                : 1;

            // Default schema detection (12 columns in Bulan 1 vs 9/10 columns in Bulan 2-4)
            var is12Cols = cols.length >= 11;
            var colMap = {
                mingguKe: 0,
                tanggalMulai: 1,
                nama: 2,
                kegiatan: 3,
                targetMingguIni: 4,
                targetMingguDepan: 5,
                jumlahBidang: is12Cols ? 6 : -1,
                jumlahDikerjakan: is12Cols ? 7 : -1,
                capaianPersen: is12Cols ? 8 : 6,
                status: is12Cols ? 9 : 7,
                catatanAnggota: is12Cols ? 10 : -1,
                catatanMentor: is12Cols ? 11 : (cols.length >= 10 ? 9 : 8)
            };

            // Dynamic header label matching from gvizTable.cols
            for (var cIdx = 0; cIdx < cols.length; cIdx++) {
                var lbl = String((cols[cIdx] && cols[cIdx].label) || '').trim().toLowerCase();
                if (!lbl) continue;
                if (/minggu\s*ke/i.test(lbl)) colMap.mingguKe = cIdx;
                else if (/tanggal\s*mulai/i.test(lbl)) colMap.tanggalMulai = cIdx;
                else if (/^nama$/i.test(lbl)) colMap.nama = cIdx;
                else if (/^kegiatan$/i.test(lbl)) colMap.kegiatan = cIdx;
                else if (/target.*minggu\s*ini/i.test(lbl)) colMap.targetMingguIni = cIdx;
                else if (/target.*minggu\s*depan/i.test(lbl)) colMap.targetMingguDepan = cIdx;
                else if (/jumlah\s*bidang.*(kerjakan|dikerjakan)/i.test(lbl)) colMap.jumlahDikerjakan = cIdx;
                else if (/^jumlah\s*bidang/i.test(lbl)) colMap.jumlahBidang = cIdx;
                else if (/capaian/i.test(lbl)) colMap.capaianPersen = cIdx;
                else if (/^status$/i.test(lbl)) colMap.status = cIdx;
                else if (/catatan\s*anggota/i.test(lbl)) colMap.catatanAnggota = cIdx;
                else if (/catatan\s*mentor/i.test(lbl)) colMap.catatanMentor = cIdx;
            }

            var records = [];
            var currentMinggu = '1';
            var currentTanggal = '';
            var currentGroupAnchorRow = numHeaders + 1;

            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var sheetRowNumber = numHeaders + 1 + i;

                var rawMinggu = this.getCellValue(r, colMap.mingguKe);
                var rawTanggal = this.getCellValue(r, colMap.tanggalMulai);
                var rawNama = this.getCellValue(r, colMap.nama);
                var rawKegiatan = this.getCellValue(r, colMap.kegiatan);
                var rawTargetIni = this.getCellValue(r, colMap.targetMingguIni);
                var rawTargetDepan = this.getCellValue(r, colMap.targetMingguDepan);
                var rawJumlahBidang = colMap.jumlahBidang >= 0 ? this.getCellValue(r, colMap.jumlahBidang) : '';
                var rawJumlahDikerjakan = colMap.jumlahDikerjakan >= 0 ? this.getCellValue(r, colMap.jumlahDikerjakan) : '';
                var rawCapaian = this.getCellValue(r, colMap.capaianPersen);
                var rawStatus = this.getCellValue(r, colMap.status);
                var rawCatatanAnggota = colMap.catatanAnggota >= 0 ? this.getCellValue(r, colMap.catatanAnggota) : '';
                var rawCatatanMentor = this.getCellValue(r, colMap.catatanMentor);

                if (!rawNama && !rawMinggu && !rawKegiatan) {
                    continue;
                }
                if (/^(total|jumlah|rata-rata|subtotal)$/i.test(rawNama.trim())) {
                    continue;
                }

                var isWeekStart = false;
                if (rawMinggu !== '') {
                    isWeekStart = true;
                    currentGroupAnchorRow = sheetRowNumber;
                    currentMinggu = rawMinggu.replace(/[^0-9]/g, '') || rawMinggu;
                    currentTanggal = rawTanggal || '';
                } else if (rawTanggal !== '') {
                    currentTanggal = rawTanggal;
                }

                var normalizedName = CONFIG && CONFIG.normalizeMemberName
                    ? CONFIG.normalizeMemberName(rawNama)
                    : rawNama.trim();

                var evalRes = this.evaluateMonitoringRow(rawStatus, rawCapaian, rawJumlahBidang, rawJumlahDikerjakan);

                var recObj = {
                    id: gid + '_mon_' + sheetRowNumber,
                    _gid: gid,
                    _sheetRowIndex: sheetRowNumber,
                    _groupAnchorRowIndex: currentGroupAnchorRow,
                    _isGroupStart: isWeekStart,
                    _colCount: cols.length,
                    _isAchieved: evalRes.isAchieved,
                    mingguKe: String(currentMinggu),
                    tanggalMulai: rawTanggal || currentTanggal || '-',
                    nama: normalizedName,
                    kegiatan: rawKegiatan || '-',
                    targetMingguIni: rawTargetIni || '-',
                    targetMingguDepan: rawTargetDepan || '-',
                    jumlahBidangRaw: rawJumlahBidang,
                    jumlahDikerjakanRaw: rawJumlahDikerjakan,
                    jumlahBidang: evalRes.jumlahBidang,
                    jumlahDikerjakan: evalRes.jumlahDikerjakan,
                    hasBidangData: evalRes.hasBidangData,
                    capaianPersenRaw: rawCapaian,
                    capaianNilai: evalRes.capaianNilai,
                    status: rawStatus || 'Belum Diisi',
                    catatanAnggota: rawCatatanAnggota || '-',
                    catatanMentor: rawCatatanMentor || '-',
                    _raw: {
                        mingguKe: rawMinggu,
                        tanggalMulai: rawTanggal,
                        nama: rawNama,
                        kegiatan: rawKegiatan,
                        targetMingguIni: rawTargetIni,
                        targetMingguDepan: rawTargetDepan,
                        jumlahBidang: rawJumlahBidang,
                        jumlahDikerjakan: rawJumlahDikerjakan,
                        capaianPersen: rawCapaian,
                        status: rawStatus,
                        catatanAnggota: rawCatatanAnggota,
                        catatanMentor: rawCatatanMentor
                    }
                };

                recObj._isActiveRow = this.isMonitoringRowActive(recObj);
                records.push(recObj);
            }

            return this.applyLocalSavedEdits('monitoring', gid, records);
        },

        /* ======================================================================
           PAGE 3 CONTROLLER: KALENDER DAN PEMBAGIAN TUGAS (kalender.html)
           ====================================================================== */
        initKalenderPage: function () {
            var self = this;
            var tabsBar = document.getElementById('kalenderTabsBar');
            var searchInput = document.getElementById('kalenderSearchInput');
            var memberSelect = document.getElementById('kalenderMemberFilter');
            var dateSelect = document.getElementById('kalenderDateFilter');

            if (tabsBar) {
                var buttons = tabsBar.querySelectorAll('.sheet-tab-btn');
                buttons.forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        buttons.forEach(function (b) {
                            b.classList.remove('active');
                            b.setAttribute('aria-selected', 'false');
                        });
                        btn.classList.add('active');
                        btn.setAttribute('aria-selected', 'true');

                        var gid = btn.getAttribute('data-gid');
                        var tabType = btn.getAttribute('data-type') || 'task_table';
                        var tabTitle = btn.textContent.trim();

                        var titleEl = document.getElementById('kalenderActiveSheetTitle');
                        if (titleEl) {
                            titleEl.innerHTML = '<i class="fas fa-file-excel" style="color:#059669;"></i><span>' +
                                window.WebGISApp.escapeHtml(tabTitle) + '</span>';
                        }

                        self.updateNativeSheetIframe('kalender', gid);
                        self.loadKalenderSheet(gid, tabType, false);
                    });
                });
            }

            var triggerFilter = function () {
                if (typeof self.ensureKalenderTableVisible === 'function') {
                    self.ensureKalenderTableVisible();
                }
                self.applyKalenderFilters();
            };

            if (searchInput) searchInput.addEventListener('input', triggerFilter);
            if (memberSelect) memberSelect.addEventListener('change', triggerFilter);
            if (dateSelect) dateSelect.addEventListener('change', triggerFilter);

            this.loadKalenderSheet(this.currentKalenderGid, this.currentKalenderTabType, false);
        },

        /**
         * Load and render worksheet on kalender.html
         */
        loadKalenderSheet: function (gid, tabType, forceRefresh) {
            var self = this;
            this.currentKalenderGid = gid;
            this.currentKalenderTabType = tabType || 'task_table';
            this.updateNativeSheetIframe('kalender', gid);

            var container = document.getElementById('kalenderTableContainer');
            var countBadge = document.getElementById('kalenderRowCountBadge');
            var syncLabel = document.getElementById('kalenderLastSyncLabel');

            if (window.WebGISApp) {
                window.WebGISApp.setSyncStatus('syncing', 'Memuat Spreadsheet 1...');
            }

            if (container) {
                container.innerHTML = (window.WebGISApp && typeof window.WebGISApp.getTableSkeletonHtml === 'function')
                    ? window.WebGISApp.getTableSkeletonHtml(8)
                    : '<div class="state-placeholder">' +
                        '<div class="map-spinner" style="border-color:#cbd5e1;border-top-color:var(--primary-600);"></div>' +
                        '<div style="font-weight:700;color:var(--text-primary);">Mengambil Data Langsung dari Google Sheets...</div>' +
                      '</div>';
            }

            var sheetId = CONFIG.spreadsheets.kalender.id;
            this.fetchGvizTable(sheetId, gid, forceRefresh)
                .then(function (gvizTable) {
                    var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('synced', 'Live Sync ' + nowStr);
                    }
                    if (syncLabel) {
                        syncLabel.textContent = 'Terakhir diperbarui dari Google Sheets: ' + nowStr;
                    }

                    if (tabType === 'calendar_matrix') {
                        var monthsData = self.parseCalendarMatrixData(gvizTable);
                        self.renderCalendarMatrixView(container, monthsData, countBadge);
                    } else {
                        var records = self.parseTaskTableData(gvizTable, gid);
                        self.currentKalenderRecords = records;
                        self.lastKalenderSignature = self.computeRecordsSignature(records);
                        self.populateKalenderDateFilter(records);
                        self.renderKalenderTaskTable(container, records, countBadge);

                        window.dispatchEvent(new CustomEvent('webgis:kalender-data-loaded', {
                            detail: { gid: gid, records: records }
                        }));
                    }
                })
                .catch(function (err) {
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('offline', 'Gagal Memuat');
                        window.WebGISApp.showToast(err.message, 'error', 4500);
                    }
                    if (container) {
                        container.innerHTML =
                            '<div class="state-placeholder">' +
                                '<div class="state-placeholder-icon" style="color:var(--danger-600);background:var(--danger-50);">' +
                                    '<i class="fas fa-exclamation-triangle"></i>' +
                                '</div>' +
                                '<div style="font-weight:700;color:var(--text-primary);">Gagal Memuat Data Google Spreadsheet</div>' +
                                '<p style="font-size:0.82rem;max-width:440px;">' + window.WebGISApp.escapeHtml(err.message) + '</p>' +
                                '<button type="button" class="btn btn-primary btn-sm" onclick="window.onAppRefreshRequested()">' +
                                    '<i class="fas fa-redo"></i><span>Coba Lagi</span>' +
                                '</button>' +
                            '</div>';
                    }
                });
        },

        /**
         * Populate date/desa dropdown dynamically from current worksheet records
         */
        populateKalenderDateFilter: function (records) {
            var dateSelect = document.getElementById('kalenderDateFilter');
            if (!dateSelect) return;

            var seen = {};
            var html = '<option value="">Semua Hari / Desa Survei</option>';
            records.forEach(function (r) {
                var key = (r.tanggal ? r.tanggal : '') + (r.desa ? (' - ' + r.desa) : '');
                if (key && !seen[key]) {
                    seen[key] = true;
                    html += '<option value="' + window.WebGISApp.escapeHtml(r.desa || r.tanggal) + '">' +
                        window.WebGISApp.escapeHtml(key) + '</option>';
                }
            });
            dateSelect.innerHTML = html;
        },

        /**
         * Render 6-Month Visual Calendar Matrix (Oktober 2026 - Maret 2027)
         */
        renderCalendarMatrixView: function (container, monthsData, countBadge) {
            if (!container) return;
            var totalEvents = 0;
            var html = '<div class="calendar-months-grid">';

            monthsData.forEach(function (m) {
                totalEvents += m.events.length;
                html +=
                    '<div class="calendar-month-card">' +
                        '<div class="calendar-month-header">' +
                            '<span><i class="fas fa-calendar-alt" style="margin-right:6px;color:#34d399;"></i>' + window.WebGISApp.escapeHtml(m.title) + '</span>' +
                            '<span class="badge badge-info" style="background:rgba(255,255,255,0.18);color:#fff;">' + m.events.length + ' Agenda</span>' +
                        '</div>' +
                        '<div class="calendar-events-list">';

                if (m.events.length === 0) {
                    html += '<div style="font-size:0.78rem;color:var(--text-muted);padding:0.5rem 0;">Belum ada agenda tercatat pada bulan ini.</div>';
                } else {
                    m.events.forEach(function (ev) {
                        html +=
                            '<div class="calendar-event-item' + (ev.isHoliday ? ' event-holiday' : '') + '">' +
                                '<div class="calendar-event-date">' + window.WebGISApp.escapeHtml(ev.dateLabel) + '</div>' +
                                '<div class="calendar-event-title">' + window.WebGISApp.escapeHtml(ev.title) + '</div>' +
                            '</div>';
                    });
                }

                html += '</div></div>';
            });

            html += '</div>';
            container.innerHTML = html;
            if (countBadge) {
                countBadge.textContent = totalEvents + ' Agenda Kalender';
            }
        },

        /**
         * Render Kecamatan Task Table using Tabulator (including Jumlah Bidang Peranggota after Pembagian)
         */
        renderKalenderTaskTable: function (container, records, countBadge) {
            if (!container) return;
            if (countBadge) {
                var totalBidangSum = 0;
                records.forEach(function (r) {
                    totalBidangSum += (Number(r.jumlahBidangAnggotaNum) || 0);
                });
                countBadge.textContent = totalBidangSum > 0
                    ? (records.length + ' Baris • ' + totalBidangSum + ' Bidang')
                    : (records.length + ' Baris Tugas');
            }

            if (typeof Tabulator !== 'undefined') {
                container.innerHTML = '';
                var canEditKalender = function (cell) {
                    return !!(window.WebGISEditor && window.WebGISEditor.canEditCell('kalender', cell));
                };

                this.kalenderTable = new Tabulator(container, {
                    data: records,
                    layout: 'fitColumns',
                    responsiveLayout: false,
                    placeholder: 'Tidak ada data tugas yang cocok dengan filter pencarian.',
                    rowFormatter: function (row) {
                        var data = row.getData();
                        if (data._isGroupStart) {
                            row.getElement().classList.add('row-group-start');
                        }
                    },
                    columns: [
                        { title: 'No', field: 'no', width: 58, hozAlign: 'center', headerHozAlign: 'center', frozen: true },
                        { title: 'Tanggal Survei', field: 'tanggal', minWidth: 130, editor: 'input', editable: canEditKalender },
                        {
                            title: 'Desa / Kelurahan',
                            field: 'desa',
                            minWidth: 135,
                            editor: 'input',
                            editable: canEditKalender,
                            formatter: function (cell) {
                                var val = cell.getValue() || '-';
                                return '<strong style="color:var(--navy-700);">' + window.WebGISApp.escapeHtml(val) + '</strong>';
                            }
                        },
                        {
                            title: 'Nama Anggota',
                            field: 'namaAnggota',
                            minWidth: 200,
                            formatter: function (cell) {
                                return '<span style="font-weight:600;">' + window.WebGISApp.escapeHtml(cell.getValue()) + '</span>';
                            }
                        },
                        {
                            title: 'Pembagian Bidang / Tugas',
                            field: 'pembagian',
                            minWidth: 220,
                            editor: 'input',
                            editable: canEditKalender,
                            formatter: function (cell) {
                                var v = cell.getValue();
                                if (!v || v === '-') {
                                    return '<span style="color:var(--text-light);font-style:italic;">Belum diisi</span>';
                                }
                                return '<span class="badge badge-info" style="font-weight:600;white-space:normal;text-align:left;">' +
                                    window.WebGISApp.escapeHtml(v) + '</span>';
                            }
                        },
                        {
                            title: 'Jml Bidang / Anggota',
                            field: 'jumlahBidangAnggota',
                            minWidth: 145,
                            hozAlign: 'center',
                            headerHozAlign: 'center',
                            editor: 'input',
                            editable: canEditKalender,
                            formatter: function (cell) {
                                var v = cell.getValue();
                                if (!v || v === '-') {
                                    return '<span style="color:var(--text-light);">-</span>';
                                }
                                return '<span class="badge badge-success" style="font-weight:700;">' +
                                    window.WebGISApp.escapeHtml(v) + ' Bidang</span>';
                            }
                        },
                        { title: 'Total Bidang Desa', field: 'totalBidang', minWidth: 155, editor: 'input', editable: canEditKalender },
                        { title: 'PIC Kecamatan', field: 'pic', minWidth: 145, editor: 'input', editable: canEditKalender },
                        {
                            title: 'Peta Kerja (My Maps)',
                            field: 'link',
                            minWidth: 145,
                            hozAlign: 'center',
                            editor: 'input',
                            editable: canEditKalender,
                            formatter: function (cell) {
                                var raw = cell.getValue() || '';
                                var urlMatch = raw.match(/https?:\/\/[^\s]+/);
                                if (!urlMatch) {
                                    return raw && raw !== '-'
                                        ? '<span style="font-size:0.73rem;color:var(--text-secondary);">' + window.WebGISApp.escapeHtml(raw) + '</span>'
                                        : '<span style="color:var(--text-light);">-</span>';
                                }
                                return '<a href="' + window.WebGISApp.escapeHtml(urlMatch[0]) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="padding:0.22rem 0.55rem;font-size:0.73rem;">' +
                                    '<i class="fas fa-map-marked-alt" style="color:var(--accent-600);"></i><span>Buka Peta</span></a>';
                            }
                        }
                    ]
                });

                this.kalenderTable.on('cellEdited', function (cell) {
                    if (window.WebGISEditor && typeof window.WebGISEditor.onKalenderCellEdited === 'function') {
                        window.WebGISEditor.onKalenderCellEdited(cell);
                    }
                });
            } else {
                this.renderCleanHtmlTaskTable(container, records);
            }
        },

        /**
         * Apply search, member, and date/desa filters on kalender.html
         */
        applyKalenderFilters: function () {
            if (this.currentKalenderTabType === 'calendar_matrix') return;

            var q = (document.getElementById('kalenderSearchInput') ? document.getElementById('kalenderSearchInput').value : '').trim().toLowerCase();
            var memberVal = document.getElementById('kalenderMemberFilter') ? document.getElementById('kalenderMemberFilter').value : '';
            var dateVal = document.getElementById('kalenderDateFilter') ? document.getElementById('kalenderDateFilter').value.toLowerCase() : '';

            var filtered = this.currentKalenderRecords.filter(function (item) {
                if (memberVal && item.namaAnggota !== memberVal) return false;
                if (dateVal && (item.desa.toLowerCase().indexOf(dateVal) === -1 && item.tanggal.toLowerCase().indexOf(dateVal) === -1)) {
                    return false;
                }
                if (q) {
                    var hay = (item.no + ' ' + item.pic + ' ' + item.namaAnggota + ' ' + item.kegiatan + ' ' + item.tanggal + ' ' + item.desa + ' ' + item.totalBidang + ' ' + item.pembagian + ' ' + item.jumlahBidangAnggota).toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                return true;
            });

            var countBadge = document.getElementById('kalenderRowCountBadge');
            if (countBadge) {
                var sumFilteredBidang = 0;
                filtered.forEach(function (r) {
                    sumFilteredBidang += (Number(r.jumlahBidangAnggotaNum) || 0);
                });
                countBadge.textContent = sumFilteredBidang > 0
                    ? (filtered.length + ' Baris • ' + sumFilteredBidang + ' Bidang')
                    : (filtered.length + ' / ' + this.currentKalenderRecords.length + ' Baris');
            }

            if (this.kalenderTable && typeof this.kalenderTable.replaceData === 'function') {
                this.kalenderTable.replaceData(filtered);
            } else {
                this.renderCleanHtmlTaskTable(document.getElementById('kalenderTableContainer'), filtered);
            }
        },

        /**
         * Clean HTML table renderer (used for Dashboard preview & offline fallback)
         */
        renderCleanHtmlTaskTable: function (container, records, maxRows) {
            if (!container) return;
            var list = maxRows ? records.slice(0, maxRows) : records;

            if (list.length === 0) {
                container.innerHTML = '<div class="state-placeholder"><div>Tidak ada data yang sesuai dengan filter.</div></div>';
                return;
            }

            var html =
                '<table class="data-table-clean">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>No</th>' +
                            '<th>Tanggal</th>' +
                            '<th>Desa / Kelurahan</th>' +
                            '<th>Nama Anggota</th>' +
                            '<th>Pembagian Bidang</th>' +
                            '<th>Jml Bidang / Anggota</th>' +
                            '<th>Total Bidang Desa</th>' +
                            '<th>PIC</th>' +
                            '<th>Peta Kerja</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';

            list.forEach(function (r) {
                var urlMatch = (r.link || '').match(/https?:\/\/[^\s]+/);
                var linkHtml = urlMatch
                    ? '<a href="' + window.WebGISApp.escapeHtml(urlMatch[0]) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="padding:0.2rem 0.5rem;font-size:0.72rem;"><i class="fas fa-map-pin"></i> Peta</a>'
                    : (r.link && r.link !== '-' ? '<span style="font-size:0.72rem;color:var(--text-secondary);">' + window.WebGISApp.escapeHtml(r.link) + '</span>' : '-');

                var jmlBadge = (r.jumlahBidangAnggota && r.jumlahBidangAnggota !== '-')
                    ? '<span class="badge badge-success" style="font-weight:700;">' + window.WebGISApp.escapeHtml(r.jumlahBidangAnggota) + ' Bidang</span>'
                    : '-';

                html +=
                    '<tr class="' + (r._isGroupStart ? 'row-group-divider' : '') + '">' +
                        '<td><strong>' + window.WebGISApp.escapeHtml(r.no) + '</strong></td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.tanggal) + '</td>' +
                        '<td><strong style="color:var(--navy-700);">' + window.WebGISApp.escapeHtml(r.desa) + '</strong></td>' +
                        '<td style="font-weight:600;">' + window.WebGISApp.escapeHtml(r.namaAnggota) + '</td>' +
                        '<td><span class="badge badge-info">' + window.WebGISApp.escapeHtml(r.pembagian) + '</span></td>' +
                        '<td style="text-align:center;">' + jmlBadge + '</td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.totalBidang) + '</td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.pic) + '</td>' +
                        '<td>' + linkHtml + '</td>' +
                    '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        },

        /* ======================================================================
           PAGE 4 CONTROLLER: MONITORING & BAR CHART (monitoring.html)
           ====================================================================== */
        initMonitoringPage: function () {
            var self = this;
            var tabsBar = document.getElementById('monitoringTabsBar');
            var searchInput = document.getElementById('monitoringSearchInput');
            var weekSelect = document.getElementById('monitoringWeekFilter');
            var memberSelect = document.getElementById('monitoringMemberFilter');
            var statusSelect = document.getElementById('monitoringStatusFilter');

            if (tabsBar) {
                var buttons = tabsBar.querySelectorAll('.sheet-tab-btn');
                buttons.forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        buttons.forEach(function (b) {
                            b.classList.remove('active');
                            b.setAttribute('aria-selected', 'false');
                        });
                        btn.classList.add('active');
                        btn.setAttribute('aria-selected', 'true');

                        var gid = btn.getAttribute('data-gid');
                        var tabLabel = btn.textContent.trim();
                        var titleEl = document.getElementById('monitoringActiveSheetTitle');
                        if (titleEl) {
                            titleEl.innerHTML = '<i class="fas fa-file-excel" style="color:#059669;"></i><span>' +
                                window.WebGISApp.escapeHtml(tabLabel) + '</span>';
                        }

                        self.updateNativeSheetIframe('monitoring', gid);
                        self.loadMonitoringSheet(gid, false);
                    });
                });
            }

            var triggerFilter = function () {
                if (typeof self.ensureMonitoringTableVisible === 'function') {
                    self.ensureMonitoringTableVisible();
                }
                self.applyMonitoringFilters();
            };

            if (searchInput) searchInput.addEventListener('input', triggerFilter);
            if (weekSelect) weekSelect.addEventListener('change', triggerFilter);
            if (memberSelect) memberSelect.addEventListener('change', triggerFilter);
            if (statusSelect) statusSelect.addEventListener('change', triggerFilter);

            this.loadMonitoringSheet(this.currentMonitoringGid, false);
        },

        /**
         * Load and render Monitoring sheet on monitoring.html
         */
        loadMonitoringSheet: function (gid, forceRefresh) {
            var self = this;
            this.currentMonitoringGid = gid;
            this.updateNativeSheetIframe('monitoring', gid);

            var container = document.getElementById('monitoringTableContainer');
            var countBadge = document.getElementById('monitoringRowCountBadge');
            var syncLabel = document.getElementById('monitoringLastSyncLabel');

            if (window.WebGISApp) {
                window.WebGISApp.setSyncStatus('syncing', 'Memuat Spreadsheet 2...');
            }

            if (container) {
                container.innerHTML = (window.WebGISApp && typeof window.WebGISApp.getTableSkeletonHtml === 'function')
                    ? window.WebGISApp.getTableSkeletonHtml(8)
                    : '<div class="state-placeholder"><div style="font-weight:700;">Memuat Data Monitoring...</div></div>';
            }

            var sheetId = CONFIG.spreadsheets.monitoring.id;
            this.fetchGvizTable(sheetId, gid, forceRefresh)
                .then(function (gvizTable) {
                    var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('synced', 'Live Sync ' + nowStr);
                    }
                    if (syncLabel) {
                        syncLabel.textContent = 'Terakhir diperbarui dari Google Sheets: ' + nowStr;
                    }

                    var records = self.parseMonitoringTableData(gvizTable, gid);
                    self.currentMonitoringRecords = records;
                    self.lastMonitoringSignature = self.computeRecordsSignature(records);

                    self.updateMonitoringKpiCards(records);
                    self.renderMonitoringTable(container, records, countBadge);

                    // Notify Chart module & Editor module
                    window.dispatchEvent(new CustomEvent('webgis:monitoring-data-loaded', {
                        detail: { gid: gid, records: records }
                    }));
                })
                .catch(function (err) {
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('offline', 'Gagal Memuat');
                        window.WebGISApp.showToast(err.message, 'error', 4500);
                    }
                    if (container) {
                        container.innerHTML =
                            '<div class="state-placeholder">' +
                                '<div style="font-weight:700;color:var(--danger-600);">' + window.WebGISApp.escapeHtml(err.message) + '</div>' +
                            '</div>';
                    }
                });
        },

        /**
         * Calculate and update the 4 KPI summary cards on monitoring.html
         * Incorporates Jumlah Bidang & Jumlah Bidang Yang Dikerjakan
         */
        updateMonitoringKpiCards: function (records) {
            var self = this;
            var activeRows = (records || []).filter(function (r) {
                return self.isMonitoringRowActive(r);
            });
            var evalRows = activeRows.length > 0 ? activeRows : (records || []);

            var tercapaiCount = evalRows.filter(function (r) {
                return r._isAchieved !== undefined ? r._isAchieved : self.isStatusTercapai(r.status);
            }).length;

            var totalBidangTarget = 0;
            var totalBidangDikerjakan = 0;
            var sumPersen = 0;

            evalRows.forEach(function (r) {
                totalBidangTarget += (Number(r.jumlahBidang) || 0);
                totalBidangDikerjakan += (Number(r.jumlahDikerjakan) || 0);
                sumPersen += (Number(r.capaianNilai) || 0);
            });

            var avgPersen = totalBidangTarget > 0
                ? Math.round((totalBidangDikerjakan / totalBidangTarget) * 1000) / 10
                : (evalRows.length > 0 ? Math.round((sumPersen / evalRows.length) * 10) / 10 : 0);

            var uniqueMembers = {};
            (records || []).forEach(function (r) {
                if (r.nama) uniqueMembers[r.nama] = true;
            });
            var memberCount = Object.keys(uniqueMembers).length || 8;

            var elTarget = document.getElementById('monKpiTotalTarget');
            var elTargetSub = document.getElementById('monKpiTargetSub');
            var elRealisasi = document.getElementById('monKpiTotalRealisasi');
            var elRealisasiSub = document.getElementById('monKpiRealisasiSub');
            var elRata = document.getElementById('monKpiRataCapaian');
            var elFill = document.getElementById('monKpiProgressFill');
            var elAnggota = document.getElementById('monKpiJumlahAnggota');

            if (totalBidangTarget > 0) {
                if (elTarget) elTarget.textContent = totalBidangTarget + ' Bidang';
                if (elTargetSub) elTargetSub.textContent = evalRows.length + ' Target Tugas Anggota';
                if (elRealisasi) elRealisasi.textContent = totalBidangDikerjakan + ' / ' + totalBidangTarget + ' Bidang';
                if (elRealisasiSub) elRealisasiSub.textContent = tercapaiCount + ' / ' + evalRows.length + ' Anggota Tercapai';
            } else {
                if (elTarget) elTarget.textContent = evalRows.length + ' Target Tugas';
                if (elRealisasi) elRealisasi.textContent = tercapaiCount + ' / ' + evalRows.length + ' Tercapai';
            }

            if (elRata) elRata.textContent = avgPersen + '%';
            if (elFill) elFill.style.width = Math.min(100, avgPersen) + '%';
            if (elAnggota) elAnggota.textContent = memberCount + ' Anggota';
        },

        /**
         * Render Monitoring interactive table via Tabulator
         * Includes Jumlah Bidang, Jumlah Bidang Yang Dikerjakan, Capaian (%), Status, Catatan Anggota, & Catatan Mentor
         */
        renderMonitoringTable: function (container, records, countBadge) {
            if (!container) return;
            if (countBadge) {
                countBadge.textContent = records.length + ' Baris Monitoring';
            }

            if (typeof Tabulator !== 'undefined') {
                container.innerHTML = '';
                var canEditMonitoring = function (cell) {
                    return !!(window.WebGISEditor && window.WebGISEditor.canEditCell('monitoring', cell));
                };

                this.monitoringTable = new Tabulator(container, {
                    data: records,
                    layout: 'fitColumns',
                    responsiveLayout: false,
                    placeholder: 'Tidak ada data monitoring yang sesuai dengan filter.',
                    rowFormatter: function (row) {
                        var data = row.getData();
                        if (data._isGroupStart) {
                            row.getElement().classList.add('row-group-start');
                        }
                    },
                    columns: [
                        {
                            title: 'Minggu',
                            field: 'mingguKe',
                            width: 88,
                            hozAlign: 'center',
                            headerHozAlign: 'center',
                            frozen: true,
                            formatter: function (cell) {
                                return '<span class="badge badge-info">Minggu ' + window.WebGISApp.escapeHtml(cell.getValue()) + '</span>';
                            }
                        },
                        { title: 'Tanggal Mulai', field: 'tanggalMulai', minWidth: 155, editor: 'input', editable: canEditMonitoring },
                        {
                            title: 'Nama Anggota',
                            field: 'nama',
                            minWidth: 200,
                            formatter: function (cell) {
                                return '<strong style="color:var(--text-primary);">' + window.WebGISApp.escapeHtml(cell.getValue()) + '</strong>';
                            }
                        },
                        { title: 'Kegiatan Survei / Monitoring', field: 'kegiatan', minWidth: 210, editor: 'input', editable: canEditMonitoring },
                        { title: 'Target Dicapai Minggu Ini', field: 'targetMingguIni', minWidth: 175, editor: 'input', editable: canEditMonitoring },
                        { title: 'Target Minggu Depan', field: 'targetMingguDepan', minWidth: 165, editor: 'input', editable: canEditMonitoring },
                        {
                            title: 'Jumlah Bidang',
                            field: 'jumlahBidang',
                            minWidth: 125,
                            hozAlign: 'center',
                            headerHozAlign: 'center',
                            editor: 'number',
                            editable: canEditMonitoring,
                            formatter: function (cell) {
                                var val = Number(cell.getValue()) || 0;
                                return val > 0
                                    ? '<strong>' + val + ' Bidang</strong>'
                                    : '<span style="color:var(--text-light);">-</span>';
                            }
                        },
                        {
                            title: 'Bidang Dikerjakan',
                            field: 'jumlahDikerjakan',
                            minWidth: 140,
                            hozAlign: 'center',
                            headerHozAlign: 'center',
                            editor: 'number',
                            editable: canEditMonitoring,
                            formatter: function (cell) {
                                var rowData = cell.getRow().getData();
                                var targetVal = Number(rowData.jumlahBidang) || 0;
                                var doneVal = Number(cell.getValue()) || 0;
                                if (targetVal === 0 && doneVal === 0 && !rowData.jumlahDikerjakanRaw) {
                                    return '<span style="color:var(--text-light);">-</span>';
                                }
                                var badgeClass = doneVal >= targetVal && targetVal > 0 ? 'badge-success' : (doneVal > 0 ? 'badge-warning' : 'badge-danger');
                                return '<span class="badge ' + badgeClass + '" style="font-weight:700;">' + doneVal + (targetVal > 0 ? (' / ' + targetVal) : '') + ' Bidang</span>';
                            }
                        },
                        {
                            title: 'Capaian (%)',
                            field: 'capaianNilai',
                            minWidth: 145,
                            hozAlign: 'left',
                            formatter: function (cell) {
                                var val = Number(cell.getValue()) || 0;
                                return (
                                    '<div class="cell-progress-wrap">' +
                                        '<div class="cell-progress-track">' +
                                            '<div class="cell-progress-bar" style="width:' + Math.min(100, val) + '%;"></div>' +
                                        '</div>' +
                                        '<strong style="font-size:0.76rem;min-width:36px;text-align:right;">' + val + '%</strong>' +
                                    '</div>'
                                );
                            }
                        },
                        {
                            title: 'Status',
                            field: 'status',
                            minWidth: 125,
                            hozAlign: 'center',
                            editor: 'list',
                            editable: canEditMonitoring,
                            editorParams: { values: ['Tercapai', 'Proses', 'Belum Tercapai'] },
                            formatter: function (cell) {
                                var v = cell.getValue() || 'Belum Diisi';
                                if (WebGISSheets.isStatusTercapai(v)) {
                                    return '<span class="badge badge-success"><i class="fas fa-check"></i> ' + window.WebGISApp.escapeHtml(v) + '</span>';
                                }
                                if (/proses|sedang/i.test(v)) {
                                    return '<span class="badge badge-warning">' + window.WebGISApp.escapeHtml(v) + '</span>';
                                }
                                if (/belum|tidak/i.test(v)) {
                                    return '<span class="badge badge-danger">' + window.WebGISApp.escapeHtml(v) + '</span>';
                                }
                                return '<span class="badge badge-neutral">' + window.WebGISApp.escapeHtml(v) + '</span>';
                            }
                        },
                        { title: 'Catatan Anggota', field: 'catatanAnggota', minWidth: 200, editor: 'input', editable: canEditMonitoring },
                        { title: 'Catatan Mentor', field: 'catatanMentor', minWidth: 170, editor: 'input', editable: canEditMonitoring }
                    ]
                });

                this.monitoringTable.on('cellEdited', function (cell) {
                    if (window.WebGISEditor && typeof window.WebGISEditor.onMonitoringCellEdited === 'function') {
                        window.WebGISEditor.onMonitoringCellEdited(cell);
                    }
                });
            } else {
                this.renderCleanHtmlMonitoringTable(container, records);
            }
        },

        /**
         * Fallback HTML table renderer for Monitoring when Tabulator CDN is unreachable
         */
        renderCleanHtmlMonitoringTable: function (container, records) {
            if (!container) return;
            if (!records || records.length === 0) {
                container.innerHTML = '<div class="state-placeholder"><div>Tidak ada data monitoring yang sesuai dengan filter.</div></div>';
                return;
            }
            var html =
                '<table class="data-table-clean">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Minggu</th>' +
                            '<th>Tanggal Mulai</th>' +
                            '<th>Nama Anggota</th>' +
                            '<th>Kegiatan</th>' +
                            '<th>Jumlah Bidang</th>' +
                            '<th>Bidang Dikerjakan</th>' +
                            '<th>Capaian (%)</th>' +
                            '<th>Status</th>' +
                            '<th>Catatan Anggota</th>' +
                            '<th>Catatan Mentor</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';

            var self = this;
            records.forEach(function (r) {
                var val = Number(r.capaianNilai) || 0;
                var statusBadge = self.isStatusTercapai(r.status)
                    ? '<span class="badge badge-success">' + window.WebGISApp.escapeHtml(r.status) + '</span>'
                    : (/belum|tidak/i.test(r.status)
                        ? '<span class="badge badge-danger">' + window.WebGISApp.escapeHtml(r.status) + '</span>'
                        : '<span class="badge badge-neutral">' + window.WebGISApp.escapeHtml(r.status) + '</span>');

                var jmlBidangTxt = r.jumlahBidang > 0 ? (r.jumlahBidang + ' Bidang') : '-';
                var dikerjakanTxt = (r.jumlahBidang > 0 || r.jumlahDikerjakan > 0)
                    ? (r.jumlahDikerjakan + ' / ' + r.jumlahBidang + ' Bidang')
                    : '-';

                html +=
                    '<tr class="' + (r._isGroupStart ? 'row-group-divider' : '') + '">' +
                        '<td><span class="badge badge-info">Minggu ' + window.WebGISApp.escapeHtml(r.mingguKe) + '</span></td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.tanggalMulai) + '</td>' +
                        '<td><strong>' + window.WebGISApp.escapeHtml(r.nama) + '</strong></td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.kegiatan) + '</td>' +
                        '<td style="text-align:center;font-weight:600;">' + jmlBidangTxt + '</td>' +
                        '<td style="text-align:center;font-weight:700;">' + dikerjakanTxt + '</td>' +
                        '<td>' +
                            '<div class="cell-progress-wrap">' +
                                '<div class="cell-progress-track"><div class="cell-progress-bar" style="width:' + Math.min(100, val) + '%;"></div></div>' +
                                '<strong style="font-size:0.76rem;">' + val + '%</strong>' +
                            '</div>' +
                        '</td>' +
                        '<td>' + statusBadge + '</td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.catatanAnggota || '-') + '</td>' +
                        '<td>' + window.WebGISApp.escapeHtml(r.catatanMentor || '-') + '</td>' +
                    '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        },

        /**
         * Apply filters on monitoring.html
         */
        applyMonitoringFilters: function () {
            var q = (document.getElementById('monitoringSearchInput') ? document.getElementById('monitoringSearchInput').value : '').trim().toLowerCase();
            var weekVal = document.getElementById('monitoringWeekFilter') ? document.getElementById('monitoringWeekFilter').value : '';
            var memberVal = document.getElementById('monitoringMemberFilter') ? document.getElementById('monitoringMemberFilter').value : '';
            var statusVal = document.getElementById('monitoringStatusFilter') ? document.getElementById('monitoringStatusFilter').value.toLowerCase() : '';

            var self = this;
            var filtered = this.currentMonitoringRecords.filter(function (item) {
                if (weekVal && String(item.mingguKe) !== String(weekVal)) return false;
                if (memberVal && item.nama !== memberVal) return false;
                if (statusVal) {
                    var isOk = item._isAchieved !== undefined ? item._isAchieved : self.isStatusTercapai(item.status);
                    if (statusVal === 'tercapai' && !isOk) return false;
                    if (statusVal === 'belum' && isOk) return false;
                }
                if (q) {
                    var hay = (item.mingguKe + ' ' + item.tanggalMulai + ' ' + item.nama + ' ' + item.kegiatan + ' ' + item.targetMingguIni + ' ' + item.status + ' ' + item.catatanAnggota + ' ' + item.catatanMentor).toLowerCase();
                    if (hay.indexOf(q) === -1) return false;
                }
                return true;
            });

            var countBadge = document.getElementById('monitoringRowCountBadge');
            if (countBadge) {
                countBadge.textContent = filtered.length + ' / ' + this.currentMonitoringRecords.length + ' Baris';
            }

            if (this.monitoringTable && typeof this.monitoringTable.replaceData === 'function') {
                this.monitoringTable.replaceData(filtered);
            } else {
                this.renderCleanHtmlMonitoringTable(document.getElementById('monitoringTableContainer'), filtered);
            }
        },

        /* ======================================================================
           PAGE 1 CONTROLLER: DASHBOARD LIVE SUMMARY (index.html)
           ====================================================================== */
        initDashboardLiveSummary: function (forceRefresh) {
            var self = this;
            var previewContainer = document.getElementById('dashboardSchedulePreview');
            var monthSelect = document.getElementById('dashboardMonthFilter');

            if (monthSelect && !monthSelect._bound) {
                monthSelect._bound = true;
                monthSelect.addEventListener('change', function () {
                    self.loadDashboardMonitoringSummary(monthSelect.value, false);
                });
            }

            // Load Spreadsheet 1 preview (Kec.Situbondo gid=368658062)
            this.fetchGvizTable(CONFIG.spreadsheets.kalender.id, CONFIG.spreadsheets.kalender.defaultGid, forceRefresh)
                .then(function (gvizTable) {
                    var records = self.parseTaskTableData(gvizTable, CONFIG.spreadsheets.kalender.defaultGid);
                    self.renderCleanHtmlTaskTable(previewContainer, records, 16);
                })
                .catch(function () {});

            // Load Spreadsheet 2 monitoring KPI & trigger chart event
            var targetGid = monthSelect ? monthSelect.value : '0';
            this.loadDashboardMonitoringSummary(targetGid, forceRefresh);
        },

        loadDashboardMonitoringSummary: function (gid, forceRefresh) {
            var self = this;
            this.fetchGvizTable(CONFIG.spreadsheets.monitoring.id, gid, forceRefresh)
                .then(function (gvizTable) {
                    var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('synced', 'Sinkron ' + nowStr);
                    }
                    var records = self.parseMonitoringTableData(gvizTable, gid);
                    self.currentMonitoringRecords = records;

                    // Update Dashboard KPI Cards
                    var activeRows = records.filter(function (r) {
                        return self.isMonitoringRowActive(r);
                    });
                    var evalRows = activeRows.length > 0 ? activeRows : records;
                    var tercapaiCount = evalRows.filter(function (r) {
                        return r._isAchieved !== undefined ? r._isAchieved : self.isStatusTercapai(r.status);
                    }).length;

                    var totalBidangTarget = 0;
                    var totalBidangDikerjakan = 0;
                    var sumP = 0;

                    evalRows.forEach(function (r) {
                        totalBidangTarget += (Number(r.jumlahBidang) || 0);
                        totalBidangDikerjakan += (Number(r.jumlahDikerjakan) || 0);
                        sumP += (Number(r.capaianNilai) || 0);
                    });

                    var avgP = totalBidangTarget > 0
                        ? Math.round((totalBidangDikerjakan / totalBidangTarget) * 1000) / 10
                        : (evalRows.length > 0 ? Math.round((sumP / evalRows.length) * 10) / 10 : 0);

                    var kpiTarget = document.getElementById('kpiTotalTarget');
                    var kpiTargetSub = document.getElementById('kpiTargetSubtext');
                    var kpiReal = document.getElementById('kpiTotalRealisasi');
                    var kpiRealSub = document.getElementById('kpiRealisasiSubtext');
                    var kpiPersen = document.getElementById('kpiPersentaseCapaian');
                    var kpiFill = document.getElementById('kpiProgressFill');

                    if (totalBidangTarget > 0) {
                        if (kpiTarget) kpiTarget.textContent = totalBidangTarget + ' Bidang';
                        if (kpiTargetSub) kpiTargetSub.textContent = evalRows.length + ' Target Anggota';
                        if (kpiReal) kpiReal.textContent = totalBidangDikerjakan + ' / ' + totalBidangTarget + ' Bidang';
                        if (kpiRealSub) kpiRealSub.textContent = tercapaiCount + ' / ' + evalRows.length + ' Tercapai';
                    } else {
                        if (kpiTarget) kpiTarget.textContent = evalRows.length + ' Target';
                        if (kpiReal) kpiReal.textContent = tercapaiCount + ' / ' + evalRows.length + ' Tercapai';
                    }

                    if (kpiPersen) kpiPersen.textContent = avgP + '%';
                    if (kpiFill) kpiFill.style.width = Math.min(100, avgP) + '%';

                    window.dispatchEvent(new CustomEvent('webgis:monitoring-data-loaded', {
                        detail: { gid: gid, records: records }
                    }));
                })
                .catch(function () {});
        }
    };

    window.WebGISSheets = WebGISSheets;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            WebGISSheets.init();
        });
    } else {
        WebGISSheets.init();
    }
})();
