/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/charts.js
 * Description: Real-Time Monitoring Analytics Engine & Chart.js Bar Chart
 *              Controller for Dashboard (index.html) & Monitoring (monitoring.html).
 *              100% Live Data from Spreadsheet Monitoring (Zero Dummy Data).
 * ============================================================================
 */

(function () {
    'use strict';

    var CONFIG = window.WEBGIS_CONFIG || {};

    var WebGISCharts = {
        monitoringChartInstance: null,
        dashboardChartInstance: null,
        latestRecords: [],
        latestGid: '0',

        /**
         * Initialize chart listeners and controls
         */
        init: function () {
            var self = this;

            this.bindChartControls();

            // Listen for live data load or inline cell edit updates from sheets.js / editor.js
            window.addEventListener('webgis:monitoring-data-loaded', function (ev) {
                var detail = (ev && ev.detail) || {};
                var records = detail.records || [];
                var gid = detail.gid || '0';
                self.latestRecords = records;
                self.latestGid = String(gid);
                self.onMonitoringDataReceived(records, String(gid));
            });

            // If sheets.js already loaded records before charts.js initialized, render immediately
            if (window.WebGISSheets && Array.isArray(window.WebGISSheets.currentMonitoringRecords) && window.WebGISSheets.currentMonitoringRecords.length > 0) {
                this.latestRecords = window.WebGISSheets.currentMonitoringRecords;
                this.latestGid = String(window.WebGISSheets.currentMonitoringGid || '0');
                this.onMonitoringDataReceived(this.latestRecords, this.latestGid);
            }
        },

        /**
         * Bind Week Filter & Sort Order selectors on monitoring.html
         */
        bindChartControls: function () {
            var self = this;
            var weekFilterEl = document.getElementById('monitoringChartWeekFilter');
            var sortSelectEl = document.getElementById('monitoringChartSortSelect');

            if (weekFilterEl) {
                weekFilterEl.addEventListener('change', function () {
                    self.refreshMonitoringPageChart();
                    // Also sync table week filter if user picked a specific week
                    var tblWeekFilter = document.getElementById('monitoringWeekFilter');
                    if (tblWeekFilter) {
                        tblWeekFilter.value = (weekFilterEl.value === 'all') ? '' : weekFilterEl.value;
                        if (window.WebGISSheets && typeof window.WebGISSheets.applyMonitoringFilters === 'function') {
                            window.WebGISSheets.applyMonitoringFilters();
                        }
                    }
                });
            }

            if (sortSelectEl) {
                sortSelectEl.addEventListener('change', function () {
                    self.refreshMonitoringPageChart();
                });
            }
        },

        /**
         * Check if a monitoring record is active (ignoring unstarted future rows that only have "0%" from =IFERROR)
         */
        isRecordActive: function (r) {
            if (!r) return false;
            if (r._isActiveRow !== undefined) return !!r._isActiveRow;
            var hasKegiatan = !!(r.kegiatan && r.kegiatan !== '-');
            var hasTargetIni = !!(r.targetMingguIni && r.targetMingguIni !== '-');
            var hasStatus = !!(r.status && r.status !== 'Belum Diisi');
            var hasBidang = (Number(r.jumlahBidang) > 0) || (Number(r.jumlahDikerjakan) > 0);
            var hasPositiveCapaian = Number(r.capaianNilai) > 0;
            return hasKegiatan || hasTargetIni || hasStatus || hasBidang || hasPositiveCapaian;
        },

        /**
         * Handle incoming monitoring dataset from Spreadsheet 2
         * @param {Array<Object>} records
         * @param {string} gid
         */
        onMonitoringDataReceived: function (records, gid) {
            this.updateWeekDropdownLabels(records);

            if (document.getElementById('monitoringBarChartCanvas')) {
                this.refreshMonitoringPageChart();
            }

            if (document.getElementById('dashboardBarChartCanvas')) {
                this.refreshDashboardPageChart(records, gid);
            }
        },

        /**
         * Update week filter dropdown labels with actual Tanggal Mulai from spreadsheet
         * @param {Array<Object>} records
         */
        updateWeekDropdownLabels: function (records) {
            var self = this;
            var weekSelect = document.getElementById('monitoringChartWeekFilter');
            if (!weekSelect || !Array.isArray(records)) return;

            var weekDates = {};
            var weekActiveCount = {};

            records.forEach(function (r) {
                var w = String(r.mingguKe || '');
                if (!w) return;
                if (r.tanggalMulai && r.tanggalMulai !== '-' && !weekDates[w]) {
                    weekDates[w] = r.tanggalMulai;
                }
                if (self.isRecordActive(r)) {
                    weekActiveCount[w] = (weekActiveCount[w] || 0) + 1;
                }
            });

            var currentVal = weekSelect.value || '1';
            var options = weekSelect.querySelectorAll('option');
            options.forEach(function (opt) {
                var val = opt.value;
                if (val === 'all') {
                    opt.textContent = 'Semua Minggu (Rata-rata Bulan Aktif)';
                } else {
                    var dateStr = weekDates[val] ? ' (' + weekDates[val] + ')' : '';
                    var statusTag = weekActiveCount[val] ? ' — Terisi' : ' — Belum Diisi';
                    opt.textContent = 'Minggu ke-' + val + dateStr + statusTag;
                }
            });
            weekSelect.value = currentVal;
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
         * Get short display name for X-axis label from full normalized member name
         * @param {string} fullName
         * @returns {string}
         */
        getShortMemberLabel: function (fullName) {
            if (!fullName) return '-';
            var members = (CONFIG && CONFIG.teamMembers) || [];
            for (var i = 0; i < members.length; i++) {
                if (members[i].fullName.toLowerCase() === fullName.toLowerCase()) {
                    return members[i].shortName;
                }
            }
            var parts = fullName.trim().split(/\s+/);
            return parts.length > 2 ? (parts[0] + ' ' + parts[1]) : fullName;
        },

        /**
         * Aggregate member performance metrics from real Spreadsheet 2 records
         * Includes Jumlah Bidang, Jumlah Bidang Yang Dikerjakan, Capaian (%), & Status.
         * @param {Array<Object>} records
         * @param {string} weekFilter - 'all' | '1' | '2' | '3' | '4'
         * @param {string} sortOrder - 'default' | 'desc' | 'asc'
         * @returns {{items: Array<Object>, summary: Object}}
         */
        aggregateMemberMetrics: function (records, weekFilter, sortOrder) {
            var self = this;
            var safeRecords = Array.isArray(records) ? records : [];

            // Filter out any accidental summary/total rows
            var cleanRecords = safeRecords.filter(function (r) {
                var n = String(r.nama || '').trim();
                return n !== '' && !/^(total|jumlah|rata-rata|subtotal)$/i.test(n);
            });

            // Determine which records to evaluate based on weekFilter
            var targetRecords = [];
            var activeLabel = '';

            if (weekFilter && weekFilter !== 'all') {
                targetRecords = cleanRecords.filter(function (r) {
                    return String(r.mingguKe) === String(weekFilter);
                });
                var sampleDate = (targetRecords[0] && targetRecords[0].tanggalMulai && targetRecords[0].tanggalMulai !== '-')
                    ? ' (' + targetRecords[0].tanggalMulai + ')'
                    : '';
                activeLabel = 'Minggu ke-' + weekFilter + sampleDate;
            } else {
                var filledRecords = cleanRecords.filter(function (r) {
                    return self.isRecordActive(r);
                });
                targetRecords = filledRecords.length > 0 ? filledRecords : cleanRecords;
                activeLabel = filledRecords.length > 0
                    ? 'Akumulasi Minggu Berjalan (' + Math.max(1, Math.round(filledRecords.length / 8)) + ' Minggu Aktif)'
                    : 'Semua Minggu (Bulan Ini)';
            }

            // Group by member preserving spreadsheet order
            var memberMap = {};
            var memberOrder = [];

            targetRecords.forEach(function (r) {
                var name = r.nama;
                if (!memberMap[name]) {
                    memberMap[name] = {
                        fullName: name,
                        shortLabel: self.getShortMemberLabel(name),
                        targetCount: 0,
                        realisasiCount: 0,
                        jumlahBidang: 0,
                        jumlahDikerjakan: 0,
                        sumPersen: 0,
                        kegiatanList: [],
                        targetMingguIniList: [],
                        targetMingguDepanList: [],
                        statusList: [],
                        catatanAnggotaList: [],
                        tanggalList: []
                    };
                    memberOrder.push(name);
                }

                var m = memberMap[name];
                m.targetCount += 1;
                m.jumlahBidang += (Number(r.jumlahBidang) || 0);
                m.jumlahDikerjakan += (Number(r.jumlahDikerjakan) || 0);

                var isNegativeStatus = /belum|tidak|bukan|proses|sedang|gagal|tunda|0%/i.test(String(r.status || ''));
                var isAchieved = r._isAchieved !== undefined
                    ? r._isAchieved
                    : (self.isStatusTercapai(r.status) || (!isNegativeStatus && Number(r.capaianNilai) >= 100));
                if (isAchieved) {
                    m.realisasiCount += 1;
                }

                m.sumPersen += (Number(r.capaianNilai) || 0);

                if (r.kegiatan && r.kegiatan !== '-' && m.kegiatanList.indexOf(r.kegiatan) === -1) {
                    m.kegiatanList.push(r.kegiatan);
                }
                if (r.targetMingguIni && r.targetMingguIni !== '-' && m.targetMingguIniList.indexOf(r.targetMingguIni) === -1) {
                    m.targetMingguIniList.push(r.targetMingguIni);
                }
                if (r.targetMingguDepan && r.targetMingguDepan !== '-' && m.targetMingguDepanList.indexOf(r.targetMingguDepan) === -1) {
                    m.targetMingguDepanList.push(r.targetMingguDepan);
                }
                if (r.status && m.statusList.indexOf(r.status) === -1) {
                    m.statusList.push(r.status);
                }
                if (r.catatanAnggota && r.catatanAnggota !== '-' && m.catatanAnggotaList.indexOf(r.catatanAnggota) === -1) {
                    m.catatanAnggotaList.push(r.catatanAnggota);
                }
                if (r.tanggalMulai && r.tanggalMulai !== '-' && m.tanggalList.indexOf(r.tanggalMulai) === -1) {
                    m.tanggalList.push(r.tanggalMulai);
                }
            });

            var items = memberOrder.map(function (name) {
                var m = memberMap[name];
                var avgPersen = m.targetCount > 0 ? Math.round((m.sumPersen / m.targetCount) * 10) / 10 : 0;
                return {
                    fullName: m.fullName,
                    shortLabel: m.shortLabel,
                    targetCount: m.targetCount,
                    realisasiCount: m.realisasiCount,
                    jumlahBidang: m.jumlahBidang,
                    jumlahDikerjakan: m.jumlahDikerjakan,
                    targetPersen: 100,
                    realisasiPersen: avgPersen,
                    kegiatan: m.kegiatanList.join('; ') || 'Belum ada kegiatan tercatat',
                    targetMingguIni: m.targetMingguIniList.join('; ') || '-',
                    targetMingguDepan: m.targetMingguDepanList.join('; ') || '-',
                    status: m.statusList.join(', ') || 'Belum Diisi',
                    catatanAnggota: m.catatanAnggotaList.join('; ') || '-',
                    tanggalRange: m.tanggalList.join(', ') || '-'
                };
            });

            if (sortOrder === 'desc') {
                items.sort(function (a, b) { return b.realisasiPersen - a.realisasiPersen; });
            } else if (sortOrder === 'asc') {
                items.sort(function (a, b) { return a.realisasiPersen - b.realisasiPersen; });
            }

            // Overall summary metrics (including Total Bidang & Bidang Dikerjakan)
            var totalTarget = 0;
            var totalRealisasi = 0;
            var totalBidangTarget = 0;
            var totalBidangDikerjakan = 0;
            var sumAllPersen = 0;

            items.forEach(function (it) {
                totalTarget += it.targetCount;
                totalRealisasi += it.realisasiCount;
                totalBidangTarget += it.jumlahBidang;
                totalBidangDikerjakan += it.jumlahDikerjakan;
                sumAllPersen += it.realisasiPersen;
            });

            var overallPersen = totalBidangTarget > 0
                ? Math.round((totalBidangDikerjakan / totalBidangTarget) * 1000) / 10
                : (items.length > 0 ? Math.round((sumAllPersen / items.length) * 10) / 10 : 0);

            return {
                items: items,
                summary: {
                    memberCount: items.length,
                    totalTarget: totalTarget,
                    totalRealisasi: totalRealisasi,
                    totalBidangTarget: totalBidangTarget,
                    totalBidangDikerjakan: totalBidangDikerjakan,
                    overallPersen: overallPersen,
                    activeLabel: activeLabel
                }
            };
        },

        /**
         * Refresh Bar Chart & KPI Cards on monitoring.html
         */
        refreshMonitoringPageChart: function () {
            var canvas = document.getElementById('monitoringBarChartCanvas');
            var placeholder = document.getElementById('monitoringChartPlaceholder');
            var container = document.getElementById('monitoringChartContainer');
            if (!canvas || !container) return;

            var weekFilterEl = document.getElementById('monitoringChartWeekFilter');
            var sortSelectEl = document.getElementById('monitoringChartSortSelect');
            var weekVal = weekFilterEl ? weekFilterEl.value : '1';
            var sortVal = sortSelectEl ? sortSelectEl.value : 'default';

            var aggregated = this.aggregateMemberMetrics(this.latestRecords, weekVal, sortVal);
            var s = aggregated.summary;

            // Sync KPI summary cards on monitoring.html with the selected week/period
            var elTarget = document.getElementById('monKpiTotalTarget');
            var elTargetSub = document.getElementById('monKpiTargetSub');
            var elRealisasi = document.getElementById('monKpiTotalRealisasi');
            var elRealisasiSub = document.getElementById('monKpiRealisasiSub');
            var elRata = document.getElementById('monKpiRataCapaian');
            var elFill = document.getElementById('monKpiProgressFill');
            var elMeta = document.getElementById('monKpiCapaianMeta');
            var elAnggota = document.getElementById('monKpiJumlahAnggota');

            if (s.totalBidangTarget > 0) {
                if (elTarget) elTarget.textContent = s.totalBidangTarget + ' Bidang';
                if (elTargetSub) elTargetSub.textContent = s.totalTarget + ' Target Tugas Anggota';
                if (elRealisasi) elRealisasi.textContent = s.totalBidangDikerjakan + ' / ' + s.totalBidangTarget + ' Bidang';
                if (elRealisasiSub) elRealisasiSub.textContent = s.totalRealisasi + ' / ' + s.totalTarget + ' Anggota Tercapai';
            } else {
                if (elTarget) elTarget.textContent = s.totalTarget + ' Target Tugas';
                if (elTargetSub) elTargetSub.textContent = s.activeLabel;
                if (elRealisasi) elRealisasi.textContent = s.totalRealisasi + ' / ' + s.totalTarget + ' Tercapai';
                if (elRealisasiSub) elRealisasiSub.textContent = s.activeLabel;
            }

            if (elRata) elRata.textContent = s.overallPersen + '%';
            if (elFill) elFill.style.width = Math.min(100, s.overallPersen) + '%';
            if (elMeta) elMeta.textContent = s.activeLabel;
            if (elAnggota) elAnggota.textContent = s.memberCount + ' Anggota';

            if (placeholder) {
                placeholder.style.display = 'none';
            }
            canvas.style.display = 'block';

            this.renderChartInstance('monitoring', canvas, container, aggregated);
        },

        /**
         * Refresh Bar Chart & KPI Cards on index.html (Dashboard Utama)
         * @param {Array<Object>} records
         * @param {string} gid
         */
        refreshDashboardPageChart: function (records, gid) {
            var canvas = document.getElementById('dashboardBarChartCanvas');
            var placeholder = document.getElementById('dashboardChartPlaceholder');
            var container = document.getElementById('dashboardChartContainer');
            if (!canvas || !container) return;

            var aggregated = this.aggregateMemberMetrics(records, 'all', 'default');
            var s = aggregated.summary;

            // Sync Dashboard KPI Cards
            var kpiTarget = document.getElementById('kpiTotalTarget');
            var kpiTargetSub = document.getElementById('kpiTargetSubtext');
            var kpiReal = document.getElementById('kpiTotalRealisasi');
            var kpiPersen = document.getElementById('kpiPersentaseCapaian');
            var kpiFill = document.getElementById('kpiProgressFill');
            var kpiRealSub = document.getElementById('kpiRealisasiSubtext');

            if (s.totalBidangTarget > 0) {
                if (kpiTarget) kpiTarget.textContent = s.totalBidangTarget + ' Bidang';
                if (kpiTargetSub) kpiTargetSub.textContent = s.totalTarget + ' Target Anggota';
                if (kpiReal) kpiReal.textContent = s.totalBidangDikerjakan + ' / ' + s.totalBidangTarget + ' Bidang';
                if (kpiRealSub) kpiRealSub.textContent = s.totalRealisasi + ' / ' + s.totalTarget + ' Anggota Tercapai';
            } else {
                if (kpiTarget) kpiTarget.textContent = s.totalTarget + ' Target Tugas';
                if (kpiReal) kpiReal.textContent = s.totalRealisasi + ' / ' + s.totalTarget + ' Tercapai';
                if (kpiRealSub) kpiRealSub.textContent = s.activeLabel;
            }

            if (kpiPersen) kpiPersen.textContent = s.overallPersen + '%';
            if (kpiFill) kpiFill.style.width = Math.min(100, s.overallPersen) + '%';

            if (placeholder) {
                placeholder.style.display = 'none';
            }
            canvas.style.display = 'block';

            this.renderChartInstance('dashboard', canvas, container, aggregated);
        },

        /**
         * Build or update Chart.js Bar Chart instance (with SVG fallback if Chart.js CDN is offline)
         * @param {'monitoring'|'dashboard'} targetKey
         * @param {HTMLCanvasElement} canvas
         * @param {HTMLElement} container
         * @param {{items: Array<Object>, summary: Object}} aggregated
         */
        renderChartInstance: function (targetKey, canvas, container, aggregated) {
            var self = this;
            var items = aggregated.items || [];

            if (typeof Chart === 'undefined') {
                this.renderFallbackSvgChart(container, items, aggregated.summary);
                return;
            }

            var labels = items.map(function (it) { return it.shortLabel; });
            var targetData = items.map(function (it) { return it.targetPersen; });
            var realisasiData = items.map(function (it) { return it.realisasiPersen; });

            var barColors = items.map(function (it) {
                if (it.realisasiPersen >= 100) return 'rgba(16, 185, 129, 0.88)'; // Emerald 500
                if (it.realisasiPersen >= 50) return 'rgba(37, 99, 235, 0.88)';   // Blue 600 (e.g. 94% / 17 dari 18 bidang)
                if (it.realisasiPersen > 0) return 'rgba(245, 158, 11, 0.85)';    // Amber 500
                return 'rgba(239, 68, 68, 0.85)';                                 // Red 500 (Belum Tercapai / 0%)
            });

            var barBorders = items.map(function (it) {
                if (it.realisasiPersen >= 100) return '#059669';
                if (it.realisasiPersen >= 50) return '#1d4ed8';
                if (it.realisasiPersen > 0) return '#d97706';
                return '#dc2626';
            });

            var existingChart = targetKey === 'monitoring' ? this.monitoringChartInstance : this.dashboardChartInstance;
            if (existingChart) {
                existingChart.destroy();
            }

            var barValueLabelsPlugin = {
                id: 'barValueLabelsPlugin',
                afterDatasetsDraw: function (chart) {
                    var ctx2 = chart.ctx;
                    var meta = chart.getDatasetMeta(0);
                    if (!meta || !meta.data) return;
                    ctx2.save();
                    ctx2.font = "700 10.5px 'Inter', sans-serif";
                    ctx2.textAlign = 'center';
                    ctx2.textBaseline = 'bottom';
                    meta.data.forEach(function (barEl, index) {
                        var item = items[index];
                        if (!item) return;
                        var val = item.realisasiPersen;
                        var labelText = '';
                        if (val <= 0 && /belum|tidak/i.test(item.status)) {
                            labelText = '0% (Belum)';
                        } else if (item.jumlahBidang > 0) {
                            labelText = val + '% (' + item.jumlahDikerjakan + '/' + item.jumlahBidang + ')';
                        } else {
                            labelText = val + '%';
                        }
                        ctx2.fillStyle = val >= 100 ? '#047857' : (val > 0 ? '#1d4ed8' : '#dc2626');
                        ctx2.fillText(labelText, barEl.x, barEl.y - 4);
                    });
                    ctx2.restore();
                }
            };

            var ctx = canvas.getContext('2d');
            var newChart = new Chart(ctx, {
                type: 'bar',
                plugins: [barValueLabelsPlugin],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Realisasi Capaian (%)',
                            data: realisasiData,
                            backgroundColor: barColors,
                            borderColor: barBorders,
                            borderWidth: 1.5,
                            borderRadius: 6,
                            minBarLength: 8,
                            barPercentage: 0.72,
                            categoryPercentage: 0.78,
                            order: 1
                        },
                        {
                            label: 'Target Standar (100%)',
                            data: targetData,
                            backgroundColor: 'rgba(30, 58, 138, 0.10)',
                            borderColor: 'rgba(30, 58, 138, 0.45)',
                            borderWidth: 1.5,
                            borderDash: [4, 4],
                            borderRadius: 6,
                            barPercentage: 0.72,
                            categoryPercentage: 0.78,
                            order: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    onClick: function (event, elements) {
                        if (targetKey !== 'monitoring' || !elements || elements.length === 0) return;
                        var idx = elements[0].index;
                        var clickedMember = items[idx];
                        if (!clickedMember) return;

                        var memberFilterEl = document.getElementById('monitoringMemberFilter');
                        if (memberFilterEl) {
                            if (memberFilterEl.value === clickedMember.fullName) {
                                memberFilterEl.value = '';
                                if (window.WebGISApp) {
                                    window.WebGISApp.showToast('Filter anggota direset: Menampilkan semua 8 anggota.', 'info', 2500);
                                }
                            } else {
                                memberFilterEl.value = clickedMember.fullName;
                                if (window.WebGISApp) {
                                    window.WebGISApp.showToast('Tabel difilter untuk anggota: ' + clickedMember.fullName, 'info', 2800);
                                }
                            }
                            if (window.WebGISSheets && typeof window.WebGISSheets.applyMonitoringFilters === 'function') {
                                window.WebGISSheets.applyMonitoringFilters();
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                usePointStyle: true,
                                pointStyle: 'rectRounded',
                                boxWidth: 12,
                                padding: 16,
                                font: {
                                    family: "'Inter', 'Plus Jakarta Sans', sans-serif",
                                    size: 12,
                                    weight: '600'
                                },
                                color: '#334155'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: '#ffffff',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255, 255, 255, 0.14)',
                            borderWidth: 1,
                            padding: 12,
                            cornerRadius: 8,
                            titleFont: {
                                family: "'Inter', sans-serif",
                                size: 13,
                                weight: '700'
                            },
                            bodyFont: {
                                family: "'Inter', sans-serif",
                                size: 12
                            },
                            callbacks: {
                                title: function (tooltipItems) {
                                    if (!tooltipItems || !tooltipItems.length) return '';
                                    var i = tooltipItems[0].dataIndex;
                                    return items[i] ? items[i].fullName : '';
                                },
                                label: function (context) {
                                    var i = context.dataIndex;
                                    var item = items[i];
                                    if (context.datasetIndex === 0 && item) {
                                        if (item.jumlahBidang > 0) {
                                            return ' Realisasi Capaian: ' + item.realisasiPersen + '% (' + item.jumlahDikerjakan + ' / ' + item.jumlahBidang + ' Bidang Dikerjakan)';
                                        }
                                        return ' Realisasi Capaian: ' + item.realisasiPersen + '% (' + item.realisasiCount + '/' + item.targetCount + ' Target Tercapai)';
                                    }
                                    return ' Target Standar: ' + context.parsed.y + '%';
                                },
                                afterBody: function (tooltipItems) {
                                    if (!tooltipItems || !tooltipItems.length) return [];
                                    var i = tooltipItems[0].dataIndex;
                                    var item = items[i];
                                    if (!item) return [];
                                    var lines = [''];
                                    if (item.jumlahBidang > 0) {
                                        lines.push('Bidang      : ' + item.jumlahDikerjakan + ' Dikerjakan dari ' + item.jumlahBidang + ' Bidang Target');
                                    }
                                    lines.push(
                                        'Status      : ' + item.status,
                                        'Periode     : ' + item.tanggalRange,
                                        'Kegiatan    : ' + item.kegiatan,
                                        'Hasil/Target: ' + item.targetMingguIni
                                    );
                                    if (item.catatanAnggota && item.catatanAnggota !== '-') {
                                        lines.push('Catatan     : ' + item.catatanAnggota);
                                    }
                                    if (targetKey === 'monitoring') {
                                        lines.push('', 'Tip: Klik batang grafik untuk memfilter tabel di bawah.');
                                    }
                                    return lines;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: '#334155',
                                font: {
                                    family: "'Inter', sans-serif",
                                    size: 11.5,
                                    weight: '600'
                                },
                                maxRotation: 25,
                                minRotation: 0
                            }
                        },
                        y: {
                            beginAtZero: true,
                            max: 115,
                            grid: {
                                color: '#f1f5f9',
                                drawBorder: false
                            },
                            ticks: {
                                stepSize: 20,
                                color: '#64748b',
                                font: {
                                    family: "'Inter', sans-serif",
                                    size: 11,
                                    weight: '600'
                                },
                                callback: function (value) {
                                    return value <= 100 ? (value + '%') : '';
                                }
                            },
                            title: {
                                display: true,
                                text: 'Persentase Capaian (%)',
                                color: '#475569',
                                font: {
                                    family: "'Inter', sans-serif",
                                    size: 11.5,
                                    weight: '700'
                                }
                            }
                        }
                    }
                }
            });

            if (targetKey === 'monitoring') {
                this.monitoringChartInstance = newChart;
            } else {
                this.dashboardChartInstance = newChart;
            }
        },

        /**
         * Fallback HTML/CSS Bar Chart renderer if Chart.js CDN is unreachable offline
         * @param {HTMLElement} container
         * @param {Array<Object>} items
         * @param {Object} summary
         */
        renderFallbackSvgChart: function (container, items, summary) {
            if (!container) return;
            var rightLabel = summary.totalBidangTarget > 0
                ? ('Rata-rata: <strong style="color:var(--accent-600);">' + summary.overallPersen + '%</strong> (' + summary.totalBidangDikerjakan + '/' + summary.totalBidangTarget + ' Bidang)')
                : ('Rata-rata: <strong style="color:var(--accent-600);">' + summary.overallPersen + '%</strong> (' + summary.totalRealisasi + '/' + summary.totalTarget + ' Tercapai)');

            var html =
                '<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:0.75rem 0.5rem;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;font-size:0.78rem;color:var(--text-secondary);">' +
                        '<span><strong>' + window.WebGISApp.escapeHtml(summary.activeLabel || 'Capaian Anggota') + '</strong></span>' +
                        '<span>' + rightLabel + '</span>' +
                    '</div>' +
                    '<div style="display:flex;flex-direction:column;gap:0.55rem;flex:1;justify-content:center;">';

            items.forEach(function (it) {
                var barColor = it.realisasiPersen >= 100 ? '#10b981' : (it.realisasiPersen > 0 ? '#2563eb' : '#94a3b8');
                var pctLabel = it.jumlahBidang > 0
                    ? (it.realisasiPersen + '% (' + it.jumlahDikerjakan + '/' + it.jumlahBidang + ')')
                    : (it.realisasiPersen + '%');

                html +=
                    '<div style="display:grid;grid-template-columns:155px 1fr 86px;align-items:center;gap:0.75rem;font-size:0.78rem;" title="' + window.WebGISApp.escapeHtml(it.fullName + ' - ' + it.kegiatan) + '">' +
                        '<div style="font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                            window.WebGISApp.escapeHtml(it.shortLabel) +
                        '</div>' +
                        '<div style="height:14px;background:#f1f5f9;border-radius:999px;overflow:hidden;border:1px solid #e2e8f0;">' +
                            '<div style="height:100%;width:' + Math.min(100, it.realisasiPersen) + '%;background:' + barColor + ';border-radius:999px;transition:width 300ms ease;"></div>' +
                        '</div>' +
                        '<div style="font-weight:700;text-align:right;color:var(--text-primary);">' +
                            pctLabel +
                        '</div>' +
                    '</div>';
            });

            html += '</div></div>';
            container.innerHTML = html;
        }
    };

    window.WebGISCharts = WebGISCharts;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            WebGISCharts.init();
        });
    } else {
        WebGISCharts.init();
    }
})();
