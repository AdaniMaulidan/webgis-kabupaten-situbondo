/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/editor.js
 * Description: Two-Way Google Sheets Inline Editor Controller, Formula Cell
 *              Protection (valueRenderOption=FORMULA), Dirty Cell Queue,
 *              Input Validation, & BatchUpdate Synchronization (Phase 05).
 * ============================================================================
 */

(function () {
    'use strict';

    var CONFIG = window.WEBGIS_CONFIG || {};

    var WebGISEditor = {
        /**
         * Map of pending edited cells:
         * key: "{sheetType}:{gid}:{colLetter}{targetRow}"
         */
        dirtyCells: {},

        /**
         * Map of detected formula cells from Google Sheets API (valueRenderOption=FORMULA):
         * key: "{spreadsheetId}:{sheetName}:{colLetter}{row}" -> formula string (e.g. "=SUM(...)")
         */
        formulaCells: {},

        isSaving: false,

        /**
         * Initialize Editor listeners and toolbar buttons
         */
        init: function () {
            var self = this;

            this.bindToolbarButtons();

            // Listen for OAuth login/logout events
            window.addEventListener('webgis:auth-changed', function () {
                self.onAuthStateChanged();
            });

            // Listen for Kalender worksheet load events
            window.addEventListener('webgis:kalender-data-loaded', function (ev) {
                var detail = (ev && ev.detail) || {};
                self.syncEditorContainerClass();
                self.updateToolbarUI('kalender');
                if (window.WebGISAuth && window.WebGISAuth.isAuthorizedEditor() && detail.gid) {
                    self.fetchFormulaProtectionMap('kalender', detail.gid);
                }
            });

            // Listen for Monitoring worksheet load events
            window.addEventListener('webgis:monitoring-data-loaded', function (ev) {
                var detail = (ev && ev.detail) || {};
                self.syncEditorContainerClass();
                self.updateToolbarUI('monitoring');
                if (window.WebGISAuth && window.WebGISAuth.isAuthorizedEditor() && detail.gid) {
                    self.fetchFormulaProtectionMap('monitoring', detail.gid);
                }
            });

            this.syncEditorContainerClass();
            this.updateToolbarUI('kalender');
            this.updateToolbarUI('monitoring');
        },

        /**
         * Wire up Save & Discard buttons on kalender.html and monitoring.html
         */
        bindToolbarButtons: function () {
            var self = this;

            var kalSaveBtn = document.getElementById('kalenderSaveBtn');
            var kalDiscardBtn = document.getElementById('kalenderDiscardBtn');
            if (kalSaveBtn) {
                kalSaveBtn.addEventListener('click', function () {
                    self.saveChanges('kalender');
                });
            }
            if (kalDiscardBtn) {
                kalDiscardBtn.addEventListener('click', function () {
                    self.discardChanges('kalender');
                });
            }

            var monSaveBtn = document.getElementById('monitoringSaveBtn');
            var monDiscardBtn = document.getElementById('monitoringDiscardBtn');
            if (monSaveBtn) {
                monSaveBtn.addEventListener('click', function () {
                    self.saveChanges('monitoring');
                });
            }
            if (monDiscardBtn) {
                monDiscardBtn.addEventListener('click', function () {
                    self.discardChanges('monitoring');
                });
            }
        },

        /**
         * Handle OAuth login/logout state change
         */
        onAuthStateChanged: function () {
            this.syncEditorContainerClass();
            this.updateToolbarUI('kalender');
            this.updateToolbarUI('monitoring');

            if (window.WebGISAuth && window.WebGISAuth.isAuthorizedEditor()) {
                if (window.WebGISSheets) {
                    if (document.getElementById('kalenderTableContainer')) {
                        this.fetchFormulaProtectionMap('kalender', window.WebGISSheets.currentKalenderGid);
                    }
                    if (document.getElementById('monitoringTableContainer')) {
                        this.fetchFormulaProtectionMap('monitoring', window.WebGISSheets.currentMonitoringGid);
                    }
                }
            }
        },

        /**
         * Toggle .editor-active-table CSS class on table containers for visual hover cues
         */
        syncEditorContainerClass: function () {
            var isEditor = !!(window.WebGISAuth && window.WebGISAuth.isAuthorizedEditor());
            var kalContainer = document.getElementById('kalenderTableContainer');
            var monContainer = document.getElementById('monitoringTableContainer');

            if (kalContainer) {
                kalContainer.classList.toggle('editor-active-table', isEditor);
            }
            if (monContainer) {
                monContainer.classList.toggle('editor-active-table', isEditor);
            }
        },

        /**
         * Resolve exact worksheet tab name (e.g. 'Kec.Situbondo' or 'Bulan 1') from gid
         * @param {'kalender'|'monitoring'} sheetType
         * @param {string} gid
         * @returns {string}
         */
        getSheetNameByGid: function (sheetType, gid) {
            var cfg = CONFIG.spreadsheets && CONFIG.spreadsheets[sheetType];
            if (!cfg || !cfg.tabs) return sheetType === 'kalender' ? 'Kec.Situbondo' : 'Bulan 1';
            for (var i = 0; i < cfg.tabs.length; i++) {
                if (String(cfg.tabs[i].gid) === String(gid)) {
                    return cfg.tabs[i].name;
                }
            }
            return cfg.tabs[0].name;
        },

        /**
         * Resolve target column letter & target 1-based row index for a given field
         * Handles merged-group anchor rows so merged cells in Google Sheets are never corrupted.
         * @param {'kalender'|'monitoring'} sheetType
         * @param {string} field
         * @param {Object} rowData
         * @returns {{colLetter: string, targetRow: number, isMergedGroup: boolean}|null}
         */
        resolveCellCoordinate: function (sheetType, field, rowData) {
            if (!rowData || !rowData._sheetRowIndex) return null;

            if (sheetType === 'kalender') {
                var kalMap = {
                    pic: { col: 'C', anchor: rowData._picAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    kegiatan: { col: 'E', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    tanggal: { col: 'F', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    kecamatan: { col: 'G', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    desa: { col: 'H', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    totalBidang: { col: 'I', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    pembagian: { col: 'J', anchor: rowData._sheetRowIndex, merged: false },
                    link: { col: 'K', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true }
                };
                if (!kalMap[field]) return null;
                return {
                    colLetter: kalMap[field].col,
                    targetRow: kalMap[field].anchor,
                    isMergedGroup: kalMap[field].merged
                };
            }

            if (sheetType === 'monitoring') {
                var is10Cols = (rowData._colCount && rowData._colCount >= 10);
                var monMap = {
                    tanggalMulai: { col: 'B', anchor: rowData._groupAnchorRowIndex || rowData._sheetRowIndex, merged: true },
                    kegiatan: { col: 'D', anchor: rowData._sheetRowIndex, merged: false },
                    targetMingguIni: { col: 'E', anchor: rowData._sheetRowIndex, merged: false },
                    targetMingguDepan: { col: 'F', anchor: rowData._sheetRowIndex, merged: false },
                    capaianNilai: { col: 'G', anchor: rowData._sheetRowIndex, merged: false },
                    status: { col: 'H', anchor: rowData._sheetRowIndex, merged: false },
                    targetBerikutnya: { col: 'I', anchor: rowData._sheetRowIndex, merged: false },
                    catatanMentor: { col: is10Cols ? 'J' : 'I', anchor: rowData._sheetRowIndex, merged: false }
                };
                if (!monMap[field]) return null;
                return {
                    colLetter: monMap[field].col,
                    targetRow: monMap[field].anchor,
                    isMergedGroup: monMap[field].merged
                };
            }

            return null;
        },

        /**
         * Fetch formula metadata (valueRenderOption=FORMULA) from Google Sheets API v4
         * so any cell containing a formula ('=...') is automatically locked from editing.
         * @param {'kalender'|'monitoring'} sheetType
         * @param {string} gid
         */
        fetchFormulaProtectionMap: function (sheetType, gid) {
            var self = this;
            var token = window.WebGISAuth && window.WebGISAuth.getAccessToken();
            if (!token || token === 'LOCAL_EDITOR_MODE') return;

            var cfg = CONFIG.spreadsheets && CONFIG.spreadsheets[sheetType];
            if (!cfg || !cfg.id) return;

            var sheetName = this.getSheetNameByGid(sheetType, gid);
            var rangeA1 = "'" + sheetName.replace(/'/g, "''") + "'!A1:K100";
            var url =
                'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(cfg.id) +
                '/values/' + encodeURIComponent(rangeA1) +
                '?valueRenderOption=FORMULA';

            fetch(url, {
                headers: { Authorization: 'Bearer ' + token }
            })
                .then(function (res) {
                    if (!res.ok) return null;
                    return res.json();
                })
                .then(function (data) {
                    if (!data || !Array.isArray(data.values)) return;
                    var colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
                    for (var rIdx = 0; rIdx < data.values.length; rIdx++) {
                        var rowArr = data.values[rIdx] || [];
                        var rowNum = rIdx + 1;
                        for (var cIdx = 0; cIdx < rowArr.length && cIdx < colLetters.length; cIdx++) {
                            var cellVal = String(rowArr[cIdx] || '').trim();
                            var key = cfg.id + ':' + sheetName + ':' + colLetters[cIdx] + rowNum;
                            if (cellVal.indexOf('=') === 0) {
                                self.formulaCells[key] = cellVal;
                            } else {
                                delete self.formulaCells[key];
                            }
                        }
                    }
                })
                .catch(function () {
                    // Non-blocking fallback: local schema protection still enforced
                });
        },

        /**
         * Determine whether a Tabulator cell can be edited by the current user
         * @param {'kalender'|'monitoring'} sheetType
         * @param {Object} cell - Tabulator CellComponent
         * @returns {boolean}
         */
        canEditCell: function (sheetType, cell) {
            if (!window.WebGISAuth || !window.WebGISAuth.isAuthorizedEditor()) {
                return false;
            }
            if (!cell || typeof cell.getField !== 'function' || typeof cell.getRow !== 'function') {
                return false;
            }

            var field = cell.getField();
            var rowData = cell.getRow().getData();
            var coord = this.resolveCellCoordinate(sheetType, field, rowData);
            if (!coord) return false;

            var cfg = CONFIG.spreadsheets && CONFIG.spreadsheets[sheetType];
            var sheetName = this.getSheetNameByGid(sheetType, rowData._gid);
            var formulaKey = cfg.id + ':' + sheetName + ':' + coord.colLetter + coord.targetRow;

            if (this.formulaCells[formulaKey]) {
                if (window.WebGISApp) {
                    window.WebGISApp.showToast(
                        'Sel ' + coord.colLetter + coord.targetRow + ' berisi rumus (' + this.formulaCells[formulaKey] + ') dan dilindungi secara otomatis.',
                        'warning',
                        4000
                    );
                }
                return false;
            }

            return true;
        },

        /**
         * Validate edited value before queueing for Google Sheets batchUpdate
         * @param {'kalender'|'monitoring'} sheetType
         * @param {string} field
         * @param {*} newValue
         * @returns {{valid: boolean, normalizedValue: string, displayValue: *, message?: string}}
         */
        validateCellValue: function (sheetType, field, newValue) {
            var strVal = (newValue === null || newValue === undefined) ? '' : String(newValue).trim();

            if (sheetType === 'monitoring' && field === 'capaianNilai') {
                var cleanedNum = strVal.replace('%', '').replace(',', '.').trim();
                var num = parseFloat(cleanedNum);
                if (isNaN(num) || num < 0 || num > 100) {
                    return {
                        valid: false,
                        normalizedValue: '0%',
                        displayValue: 0,
                        message: 'Nilai Capaian (%) harus berupa angka antara 0 hingga 100.'
                    };
                }
                var rounded = Math.round(num * 100) / 100;
                return {
                    valid: true,
                    normalizedValue: rounded + '%',
                    displayValue: rounded
                };
            }

            if (sheetType === 'kalender' && field === 'totalBidang') {
                if (/^-\d+$/.test(strVal)) {
                    return {
                        valid: false,
                        normalizedValue: '',
                        displayValue: '-',
                        message: 'Total Bidang tidak boleh bernilai negatif.'
                    };
                }
            }

            return {
                valid: true,
                normalizedValue: strVal === '-' ? '' : strVal,
                displayValue: strVal || '-'
            };
        },

        /**
         * Handle cellEdited event from Kalender Tabulator table
         * @param {Object} cell - Tabulator CellComponent
         */
        onKalenderCellEdited: function (cell) {
            this.processEditedCell('kalender', cell);
        },

        /**
         * Handle cellEdited event from Monitoring Tabulator table
         * @param {Object} cell - Tabulator CellComponent
         */
        onMonitoringCellEdited: function (cell) {
            this.processEditedCell('monitoring', cell);
        },

        /**
         * Validate, highlight, and queue an edited cell
         * @param {'kalender'|'monitoring'} sheetType
         * @param {Object} cell
         */
        processEditedCell: function (sheetType, cell) {
            if (!cell) return;
            var field = cell.getField();
            var newValue = cell.getValue();
            var oldValue = cell.getOldValue();

            if (String(newValue) === String(oldValue)) return;

            var validation = this.validateCellEdit ? this.validateCellValue(sheetType, field, newValue) : this.validateCellValue(sheetType, field, newValue);
            if (!validation.valid) {
                cell.restoreOldValue();
                if (window.WebGISApp) {
                    window.WebGISApp.showToast(validation.message || 'Nilai input tidak valid.', 'error', 4000);
                }
                return;
            }

            var rowComponent = cell.getRow();
            var rowData = rowComponent.getData();
            var coord = this.resolveCellCoordinate(sheetType, field, rowData);
            if (!coord) return;

            var cfg = CONFIG.spreadsheets[sheetType];
            var gid = String(rowData._gid);
            var sheetName = this.getSheetNameByGid(sheetType, gid);
            var cellRef = coord.colLetter + coord.targetRow;
            var dirtyKey = sheetType + ':' + gid + ':' + cellRef;

            this.dirtyCells[dirtyKey] = {
                sheetType: sheetType,
                spreadsheetId: cfg.id,
                gid: gid,
                sheetName: sheetName,
                colLetter: coord.colLetter,
                targetRow: coord.targetRow,
                cellRef: cellRef,
                range: "'" + sheetName.replace(/'/g, "''") + "'!" + cellRef,
                field: field,
                oldValue: oldValue,
                newValue: validation.normalizedValue,
                memberName: rowData.namaAnggota || rowData.nama || ''
            };

            // Add dirty highlight to edited cell DOM element
            var cellEl = cell.getElement();
            if (cellEl) {
                cellEl.classList.add('cell-dirty-edited');
            }

            // If a merged-group field was edited (e.g., desa, tanggal, tanggalMulai), update sibling rows in memory
            if (coord.isMergedGroup) {
                var tableInstance = sheetType === 'kalender'
                    ? (window.WebGISSheets && window.WebGISSheets.kalenderTable)
                    : (window.WebGISSheets && window.WebGISSheets.monitoringTable);

                if (tableInstance && typeof tableInstance.getRows === 'function') {
                    tableInstance.getRows().forEach(function (rComp) {
                        var d = rComp.getData();
                        var sameAnchor = (field === 'pic')
                            ? (d._picAnchorRowIndex === coord.targetRow)
                            : (d._groupAnchorRowIndex === coord.targetRow);
                        if (sameAnchor && d.id !== rowData.id) {
                            var updateObj = {};
                            updateObj[field] = validation.displayValue;
                            rComp.update(updateObj);
                        }
                    });
                }
            }

            // If Monitoring table was edited, immediately recalculate KPI cards & notify Bar Chart (Phase 06)
            if (sheetType === 'monitoring' && window.WebGISSheets) {
                if (field === 'capaianNilai' && validation.displayValue >= 100 && rowData.status !== 'Tercapai') {
                    rowComponent.update({ status: 'Tercapai' });
                }
                var currentRecs = window.WebGISSheets.currentMonitoringRecords || [];
                window.WebGISSheets.updateMonitoringKpiCards(currentRecs);
                window.dispatchEvent(new CustomEvent('webgis:monitoring-data-loaded', {
                    detail: {
                        gid: gid,
                        records: currentRecs
                    }
                }));
            }

            this.updateToolbarUI(sheetType);
        },

        /**
         * Count pending unsaved changes for a given sheetType ('kalender' or 'monitoring')
         * @param {'kalender'|'monitoring'} sheetType
         * @returns {Array<Object>}
         */
        getDirtyListForSheet: function (sheetType) {
            var self = this;
            var list = [];
            Object.keys(this.dirtyCells).forEach(function (k) {
                var item = self.dirtyCells[k];
                if (item && item.sheetType === sheetType) {
                    list.push(item);
                }
            });
            return list;
        },

        /**
         * Update Pending Badge, Save Button, and Discard Button states
         * @param {'kalender'|'monitoring'} sheetType
         */
        updateToolbarUI: function (sheetType) {
            var badgeId = sheetType === 'kalender' ? 'kalenderPendingBadge' : 'monitoringPendingBadge';
            var saveBtnId = sheetType === 'kalender' ? 'kalenderSaveBtn' : 'monitoringSaveBtn';
            var discardBtnId = sheetType === 'kalender' ? 'kalenderDiscardBtn' : 'monitoringDiscardBtn';

            var badgeEl = document.getElementById(badgeId);
            var saveBtn = document.getElementById(saveBtnId);
            var discardBtn = document.getElementById(discardBtnId);

            if (!badgeEl) return;

            var isEditor = !!(window.WebGISAuth && window.WebGISAuth.isAuthorizedEditor());
            var dirtyList = this.getDirtyListForSheet(sheetType);
            var dirtyCount = dirtyList.length;

            if (!isEditor) {
                badgeEl.className = 'badge badge-neutral';
                badgeEl.innerHTML = '<i class="fas fa-lock"></i> Mode Baca Saja';
                if (saveBtn) saveBtn.disabled = true;
                if (discardBtn) discardBtn.disabled = true;
                return;
            }

            if (dirtyCount === 0) {
                badgeEl.className = 'badge badge-success';
                badgeEl.innerHTML = '<i class="fas fa-unlock-alt"></i> Mode Editor Aktif (Klik Sel untuk Edit)';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Simpan ke Google Sheets</span>';
                }
                if (discardBtn) discardBtn.disabled = true;
            } else {
                badgeEl.className = 'badge badge-warning';
                badgeEl.innerHTML = '<i class="fas fa-pen"></i> ' + dirtyCount + ' Perubahan Belum Disimpan';
                if (saveBtn) {
                    saveBtn.disabled = this.isSaving;
                    saveBtn.innerHTML = this.isSaving
                        ? '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>'
                        : '<i class="fas fa-save"></i><span>Simpan (' + dirtyCount + ') ke Google Sheets</span>';
                }
                if (discardBtn) {
                    discardBtn.disabled = this.isSaving;
                }
            }
        },

        /**
         * Discard unsaved changes and reload clean data from cache/sheet
         * @param {'kalender'|'monitoring'} sheetType
         */
        discardChanges: function (sheetType) {
            var self = this;
            Object.keys(this.dirtyCells).forEach(function (k) {
                if (self.dirtyCells[k] && self.dirtyCells[k].sheetType === sheetType) {
                    delete self.dirtyCells[k];
                }
            });

            this.updateToolbarUI(sheetType);

            if (window.WebGISSheets) {
                window.WebGISSheets.refreshCurrentPageData(false);
            }
            if (window.WebGISApp) {
                window.WebGISApp.showToast('Perubahan yang belum disimpan telah dibatalkan.', 'info', 3000);
            }
        },

        /**
         * Commit all queued dirty cells to the original Google Spreadsheet via
         * spreadsheets.values.batchUpdate (valueInputOption: USER_ENTERED), then re-fetch live data.
         * @param {'kalender'|'monitoring'} sheetType
         */
        saveChanges: function (sheetType) {
            var self = this;
            if (this.isSaving) return;

            if (!window.WebGISAuth || !window.WebGISAuth.isAuthorizedEditor()) {
                if (window.WebGISApp) {
                    window.WebGISApp.showToast('Sesi Editor tidak aktif atau telah berakhir. Silakan Login Editor terlebih dahulu.', 'warning', 4500);
                }
                if (window.WebGISAuth) {
                    window.WebGISAuth.openAuthModal();
                }
                return;
            }

            var dirtyList = this.getDirtyListForSheet(sheetType);
            if (dirtyList.length === 0) return;

            var accessToken = window.WebGISAuth.getAccessToken();
            var spreadsheetId = dirtyList[0].spreadsheetId;

            // Persist edits in localStorage so changes stay intact across page switches & refreshes
            try {
                var savedEdits = JSON.parse(localStorage.getItem('webgis_situbondo_local_edits') || '{}');
                dirtyList.forEach(function (item) {
                    var editKey = item.sheetType + ':' + item.gid + ':' + item.targetRow + ':' + item.field;
                    savedEdits[editKey] = {
                        value: item.newValue,
                        updatedAt: Date.now()
                    };
                });
                localStorage.setItem('webgis_situbondo_local_edits', JSON.stringify(savedEdits));
            } catch (e) {}

            // If in 1-Click Instant Editor Mode (without OAuth token), commit immediately & sync UI
            if (accessToken === 'LOCAL_EDITOR_MODE') {
                var count = dirtyList.length;
                Object.keys(self.dirtyCells).forEach(function (k) {
                    if (self.dirtyCells[k] && self.dirtyCells[k].sheetType === sheetType) {
                        delete self.dirtyCells[k];
                    }
                });

                document.querySelectorAll('.cell-dirty-edited').forEach(function (el) {
                    el.classList.remove('cell-dirty-edited');
                });

                this.isSaving = false;
                this.updateToolbarUI(sheetType);

                var nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                if (window.WebGISApp) {
                    window.WebGISApp.setSyncStatus('synced', 'Tersimpan ' + nowStr);
                    window.WebGISApp.showToast(
                        'Berhasil menyimpan ' + count + ' perubahan sel! Tabel dan Bar Chart telah diperbarui.',
                        'success',
                        4500
                    );
                }

                window.dispatchEvent(new CustomEvent('webgis:sheet-saved', {
                    detail: { sheetType: sheetType, updatedCells: count }
                }));
                return;
            }

            var batchData = dirtyList.map(function (item) {
                return {
                    range: item.range,
                    values: [[item.newValue]]
                };
            });

            this.isSaving = true;
            this.updateToolbarUI(sheetType);
            if (window.WebGISApp) {
                window.WebGISApp.setSyncStatus('syncing', 'Menyimpan ke Google Sheets...');
            }

            var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values:batchUpdate';

            fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    valueInputOption: 'USER_ENTERED',
                    data: batchData
                })
            })
                .then(function (res) {
                    if (res.status === 401) {
                        window.WebGISAuth.handleTokenExpired();
                        throw new Error('Token OAuth 2.0 telah kedaluwarsa (401). Silakan login ulang untuk menyimpan perubahan.');
                    }
                    if (res.status === 403) {
                        window.WebGISAuth.downgradeToViewer(
                            'Akses Ditolak (403): Akun Google Anda hanya memiliki izin Lihat (Viewer) pada Google Spreadsheet ini. Hanya akun dengan izin Editor yang dapat menyimpan perubahan.'
                        );
                        throw new Error('Akun Google Anda tidak memiliki izin Editor pada spreadsheet ini (403 Forbidden).');
                    }
                    if (!res.ok) {
                        return res.json().catch(function () { return {}; }).then(function (errJson) {
                            var msg = (errJson && errJson.error && errJson.error.message) || ('HTTP ' + res.status);
                            throw new Error('Gagal menyimpan ke Google Sheets: ' + msg);
                        });
                    }
                    return res.json();
                })
                .then(function (result) {
                    var updatedCount = (result && result.totalUpdatedCells) || dirtyList.length;

                    // Clear saved dirty cells for this sheetType
                    Object.keys(self.dirtyCells).forEach(function (k) {
                        if (self.dirtyCells[k] && self.dirtyCells[k].sheetType === sheetType) {
                            delete self.dirtyCells[k];
                        }
                    });

                    self.isSaving = false;
                    self.updateToolbarUI(sheetType);

                    if (window.WebGISApp) {
                        window.WebGISApp.showToast(
                            'Berhasil menyimpan ' + updatedCount + ' perubahan sel langsung ke Google Sheets asli! Memuat ulang data terbaru...',
                            'success',
                            4500
                        );
                    }

                    window.dispatchEvent(new CustomEvent('webgis:sheet-saved', {
                        detail: {
                            sheetType: sheetType,
                            updatedCells: updatedCount
                        }
                    }));

                    // Re-read data from Google Sheets after save so recalculated formulas & charts stay 100% synced
                    setTimeout(function () {
                        if (window.WebGISSheets) {
                            window.WebGISSheets.refreshCurrentPageData(true);
                        }
                    }, 650);
                })
                .catch(function (err) {
                    self.isSaving = false;
                    self.updateToolbarUI(sheetType);
                    if (window.WebGISApp) {
                        window.WebGISApp.setSyncStatus('offline', 'Gagal Simpan');
                        window.WebGISApp.showToast(err.message, 'error', 5500);
                    }
                });
        }
    };

    window.WebGISEditor = WebGISEditor;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            WebGISEditor.init();
        });
    } else {
        WebGISEditor.init();
    }
})();

