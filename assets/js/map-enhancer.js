/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/map-enhancer.js
 * Description: Enhances qgis2web Leaflet Map with Basemap Switcher,
 *              Labeled Attribute Popups, Village/Facility Search,
 *              Polygon Opacity Slider, Coordinate Bar, & Dashboard Mini-Map.
 * ============================================================================
 */

(function () {
    'use strict';

    var SITUBONDO_BOUNDS = [
        [-8.026516436294546, 113.54513681883124],
        [-7.490798897883642, 114.48547485453135]
    ];

    var ATTRIBUTE_LABELS = (window.WEBGIS_CONFIG && window.WEBGIS_CONFIG.attributeLabels) || {
        NAMOBJ: 'Nama Objek / Wilayah',
        REMARK: 'Keterangan / Jenis',
        WADMKD: 'Desa / Kelurahan',
        WADMKC: 'Kecamatan',
        WADMKK: 'Kabupaten / Kota',
        WADMPR: 'Provinsi',
        LUASWH: 'Luas Wilayah (Ha)',
        LUAS: 'Luas',
        SHAPE_Leng: 'Panjang Geometri',
        SHAPE_Area: 'Luas Geometri',
        LCODE: 'Kode Unsur (LCODE)',
        JNSSWH: 'Jenis Sawah',
        NAMRJL: 'Nama Ruas Jalan',
        FGSGOV: 'Kode Pemerintahan',
        FGSIBD: 'Kode Sarana Ibadah',
        KATPDK: 'Kategori Pendidikan',
        JLPDDK: 'Jalur Pendidikan',
        NAMWS: 'Wilayah Sungai',
        NAMDAS: 'Daerah Aliran Sungai'
    };

    /**
     * Global helper to build a clean, labeled HTML popup table for any feature
     * while preserving qgis2web compatibility.
     */
    window.buildEnhancedPopupHtml = function (layerTitle, feature, autolinkerInstance) {
        if (!feature || !feature.properties) return '';
        var props = feature.properties;
        var primaryName = props.NAMOBJ || props.NAMRJL || props.REMARK || layerTitle;

        var rowsHtml = '';
        var keys = Object.keys(props);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = props[key];
            if (val === null || val === undefined || String(val).trim() === '') {
                continue;
            }
            var label = ATTRIBUTE_LABELS[key] || key;
            var formattedVal = String(val);
            if (autolinkerInstance && typeof autolinkerInstance.link === 'function') {
                formattedVal = autolinkerInstance.link(formattedVal);
            }
            rowsHtml +=
                '<tr>' +
                    '<th scope="row">' + label + '</th>' +
                    '<td>' + formattedVal + '</td>' +
                '</tr>';
        }

        if (!rowsHtml) {
            rowsHtml = '<tr><td colspan="2">Tidak ada atribut tambahan.</td></tr>';
        }

        return (
            '<div class="webgis-popup-wrapper">' +
                '<div class="webgis-popup-header">' +
                    '<span><i class="fas fa-map-pin" style="margin-right:6px;color:#34d399;"></i>' + String(primaryName) + '</span>' +
                    '<span class="webgis-popup-badge">' + String(layerTitle) + '</span>' +
                '</div>' +
                '<table>' + rowsHtml + '</table>' +
            '</div>'
        );
    };

    var WebGISMapEnhancer = {
        basemaps: {},
        activeBasemap: null,
        searchIndex: [],
        highlightedLayer: null,

        /**
         * Initialize enhancements on main WebGIS page (peta.html)
         */
        initMainMap: function () {
            if (!window.map || typeof L === 'undefined') return;

            this.initBasemaps();
            this.initToolbarControls();
            this.initCoordinateTracker();
            this.buildSearchIndex();
            this.initSearchBox();
            this.initLayerCounter();
            this.hideLoadingOverlay();
        },

        /**
         * Configure and attach Basemap Tile Layers
         */
        initBasemaps: function () {
            var map = window.map;

            // Create lower pane for basemap tiles so all 8 BIG layers (zIndex 400-407) stay above
            if (!map.getPane('pane_basemap')) {
                map.createPane('pane_basemap');
                map.getPane('pane_basemap').style.zIndex = 200;
            }

            this.basemaps = {
                osm: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                    pane: 'pane_basemap',
                    maxZoom: 19,
                    attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors'
                }),
                satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    pane: 'pane_basemap',
                    maxZoom: 19,
                    attribution: 'Tiles &copy; Esri &mdash; World Imagery'
                }),
                light: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                    pane: 'pane_basemap',
                    maxZoom: 19,
                    attribution: 'Tiles &copy; Esri &mdash; World Topographic Map'
                }),
                blank: null
            };

            // Add default OpenStreetMap basemap
            this.setBasemap('osm');

            var selectEl = document.getElementById('mapBasemapSelect');
            var self = this;
            if (selectEl) {
                selectEl.addEventListener('change', function () {
                    self.setBasemap(selectEl.value);
                });
            }
        },

        /**
         * Switch active basemap layer
         */
        setBasemap: function (key) {
            var map = window.map;
            if (!map) return;

            if (this.activeBasemap && map.hasLayer(this.activeBasemap)) {
                map.removeLayer(this.activeBasemap);
            }

            var nextLayer = this.basemaps[key];
            if (nextLayer) {
                nextLayer.addTo(map);
                this.activeBasemap = nextLayer;
                document.getElementById('map').style.backgroundColor = '#e2e8f0';
            } else {
                this.activeBasemap = null;
                document.getElementById('map').style.backgroundColor = '#ffffff';
            }
        },

        /**
         * Wire Reset Bounds, Opacity Slider, & Fullscreen Toggle
         */
        initToolbarControls: function () {
            var map = window.map;

            // Reset Bounds Button
            var resetBtn = document.getElementById('mapResetBoundsBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    map.fitBounds(SITUBONDO_BOUNDS);
                    if (window.WebGISApp) {
                        window.WebGISApp.showToast('Tampilan peta dikembalikan ke cakupan Kabupaten Situbondo.', 'info', 2200);
                    }
                });
            }

            // Polygon Fill Opacity Slider
            var opacityInput = document.getElementById('mapOpacityRange');
            var opacityLabel = document.getElementById('mapOpacityValue');
            if (opacityInput) {
                opacityInput.addEventListener('input', function () {
                    var val = parseFloat(opacityInput.value);
                    if (opacityLabel) {
                        opacityLabel.textContent = Math.round(val * 100) + '%';
                    }
                    var areaLayers = [
                        window.layer_ADMINISTRASIDESA_AR_25K_0,
                        window.layer_AGRISAWAH_AR_25K_1,
                        window.layer_PEMUKIMAN_AR_25K_2
                    ];
                    areaLayers.forEach(function (lyr) {
                        if (lyr && typeof lyr.setStyle === 'function') {
                            lyr.setStyle({ fillOpacity: val });
                        }
                    });
                });
            }

            // Fullscreen Workspace Toggle
            var fullscreenBtn = document.getElementById('mapFullscreenBtn');
            var workspaceCard = document.getElementById('mapWorkspaceCard');
            if (fullscreenBtn && workspaceCard) {
                fullscreenBtn.addEventListener('click', function () {
                    workspaceCard.classList.toggle('is-fullscreen');
                    var isFull = workspaceCard.classList.contains('is-fullscreen');
                    fullscreenBtn.innerHTML = isFull
                        ? '<i class="fas fa-compress"></i><span>Keluar Penuh</span>'
                        : '<i class="fas fa-expand"></i><span>Layar Penuh</span>';
                    setTimeout(function () {
                        map.invalidateSize();
                    }, 200);
                });
            }
        },

        /**
         * Live Cursor Coordinate & Zoom Level Display
         */
        initCoordinateTracker: function () {
            var map = window.map;
            var coordEl = document.getElementById('mapCoordDisplay');
            var zoomEl = document.getElementById('mapZoomDisplay');

            if (coordEl) {
                map.on('mousemove', function (e) {
                    var lat = e.latlng.lat.toFixed(5);
                    var lng = e.latlng.lng.toFixed(5);
                    coordEl.textContent = 'Lat: ' + lat + ' | Lng: ' + lng;
                });
            }

            if (zoomEl) {
                var updateZoom = function () {
                    zoomEl.textContent = 'Zoom: ' + map.getZoom();
                };
                map.on('zoomend', updateZoom);
                updateZoom();
            }
        },

        /**
         * Build searchable index from Desa Polygons & Point Facilities
         */
        buildSearchIndex: function () {
            var index = [];

            var collectFromGeoJsonLayer = function (leafletGeoJsonLayer, categoryLabel) {
                if (!leafletGeoJsonLayer || typeof leafletGeoJsonLayer.eachLayer !== 'function') return;
                leafletGeoJsonLayer.eachLayer(function (layer) {
                    if (!layer.feature || !layer.feature.properties) return;
                    var p = layer.feature.properties;
                    var name = p.NAMOBJ || p.NAMRJL || '';
                    if (!name) return;
                    var kec = p.WADMKC || '';
                    var remark = p.REMARK || categoryLabel;
                    index.push({
                        name: String(name).trim(),
                        kecamatan: String(kec).trim(),
                        remark: String(remark).trim(),
                        category: categoryLabel,
                        layer: layer
                    });
                });
            };

            collectFromGeoJsonLayer(window.layer_ADMINISTRASIDESA_AR_25K_0, 'Batas Desa');
            collectFromGeoJsonLayer(window.layer_PEMERINTAHAN_PT_25K_5, 'Pemerintahan');
            collectFromGeoJsonLayer(window.layer_PENDIDIKAN_PT_25K_6, 'Pendidikan');
            collectFromGeoJsonLayer(window.layer_SARANAIBADAH_PT_25K_7, 'Sarana Ibadah');

            this.searchIndex = index;
        },

        /**
         * Wire instant search input and dropdown for villages & facilities
         */
        initSearchBox: function () {
            var self = this;
            var input = document.getElementById('mapSearchVillageInput');
            var resultsBox = document.getElementById('mapSearchResults');
            if (!input || !resultsBox) return;

            input.addEventListener('input', function () {
                var q = input.value.trim().toLowerCase();
                if (q.length < 2) {
                    resultsBox.classList.remove('is-open');
                    resultsBox.innerHTML = '';
                    return;
                }

                var matches = [];
                for (var i = 0; i < self.searchIndex.length; i++) {
                    var item = self.searchIndex[i];
                    var haystack = (item.name + ' ' + item.kecamatan + ' ' + item.remark).toLowerCase();
                    if (haystack.indexOf(q) !== -1) {
                        matches.push(item);
                        if (matches.length >= 12) break;
                    }
                }

                if (matches.length === 0) {
                    resultsBox.innerHTML =
                        '<div class="map-search-item">' +
                            '<div class="map-search-item-meta">Tidak ditemukan desa/objek untuk "' +
                            (window.WebGISApp ? window.WebGISApp.escapeHtml(input.value) : input.value) + '"</div>' +
                        '</div>';
                    resultsBox.classList.add('is-open');
                    return;
                }

                var html = '';
                matches.forEach(function (m, idx) {
                    var sub = m.kecamatan ? ('Kec. ' + m.kecamatan + ' &bull; ' + m.remark) : m.remark;
                    html +=
                        '<div class="map-search-item" data-match-idx="' + idx + '">' +
                            '<div class="map-search-item-title">' +
                                '<span>' + m.name + '</span>' +
                                '<span class="badge badge-info" style="font-size:0.65rem;">' + m.category + '</span>' +
                            '</div>' +
                            '<div class="map-search-item-meta">' + sub + '</div>' +
                        '</div>';
                });

                resultsBox.innerHTML = html;
                resultsBox.classList.add('is-open');

                var itemEls = resultsBox.querySelectorAll('.map-search-item');
                itemEls.forEach(function (el) {
                    el.addEventListener('click', function () {
                        var idx = parseInt(el.getAttribute('data-match-idx'), 10);
                        var chosen = matches[idx];
                        if (chosen) {
                            self.focusOnFeatureLayer(chosen.layer);
                            resultsBox.classList.remove('is-open');
                            input.value = chosen.name;
                        }
                    });
                });
            });

            document.addEventListener('click', function (ev) {
                if (!input.contains(ev.target) && !resultsBox.contains(ev.target)) {
                    resultsBox.classList.remove('is-open');
                }
            });
        },

        /**
         * Zoom to feature and open its popup
         */
        focusOnFeatureLayer: function (layer) {
            var map = window.map;
            if (!map || !layer) return;

            if (typeof layer.getBounds === 'function') {
                map.fitBounds(layer.getBounds(), { maxZoom: 15, padding: [30, 30] });
            } else if (typeof layer.getLatLng === 'function') {
                map.setView(layer.getLatLng(), 17);
            }

            setTimeout(function () {
                if (typeof layer.openPopup === 'function') {
                    layer.openPopup();
                }
            }, 300);
        },

        /**
         * Track active overlay layers count
         */
        initLayerCounter: function () {
            var map = window.map;
            var badgeEl = document.getElementById('mapActiveLayerBadge');
            if (!map || !badgeEl) return;

            var allEightLayers = [
                window.layer_ADMINISTRASIDESA_AR_25K_0,
                window.layer_AGRISAWAH_AR_25K_1,
                window.layer_PEMUKIMAN_AR_25K_2,
                window.layer_SUNGAI_LN_25K_3,
                window.layer_JALAN_LN_25K_4,
                window.cluster_PEMERINTAHAN_PT_25K_5,
                window.cluster_PENDIDIKAN_PT_25K_6,
                window.cluster_SARANAIBADAH_PT_25K_7
            ];

            var updateCount = function () {
                var activeCount = 0;
                allEightLayers.forEach(function (lyr) {
                    if (lyr && map.hasLayer(lyr)) activeCount++;
                });
                badgeEl.innerHTML = '<i class="fas fa-layer-group"></i> ' + activeCount + ' / 8 Layer BIG Aktif';
            };

            map.on('layeradd layerremove', updateCount);
            updateCount();
        },

        /**
         * Hide loading overlay once all 8 layers are initialized
         */
        hideLoadingOverlay: function () {
            var overlay = document.getElementById('mapLoadingOverlay');
            if (overlay) {
                setTimeout(function () {
                    overlay.classList.add('is-hidden');
                }, 250);
            }
        },

        /**
         * Initialize lightweight interactive preview map on Dashboard (index.html)
         */
        initDashboardPreviewMap: function () {
            var container = document.getElementById('dashboardMiniMapCanvas');
            if (!container || typeof L === 'undefined') return;

            var miniMap = L.map('dashboardMiniMapCanvas', {
                zoomControl: true,
                attributionControl: false
            }).fitBounds(SITUBONDO_BOUNDS);

            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri'
            }).addTo(miniMap);

            // Key Kecamatan Survey Points in Kabupaten Situbondo (from Spreadsheet 1 tabs)
            var surveyLocations = [
                { name: 'Kec. Situbondo (Utama)', desa: 'Dawuhan, Patokan, Kotakan, Kalibagor, Talkandang, Olean', coords: [-7.7062, 114.0095] },
                { name: 'Kec. Panji', desa: 'Battal, Curah Jeru, Juglangan, Kayu Putih, Mimbaan', coords: [-7.7195, 114.0410] },
                { name: 'Kec. Mangaran', desa: 'Area Survei Kecamatan Mangaran', coords: [-7.6650, 114.0450] },
                { name: 'Kec. Kapongan', desa: 'Area Survei Kecamatan Kapongan', coords: [-7.6940, 114.0860] },
                { name: 'Kec. Arjasa', desa: 'Area Survei Kecamatan Arjasa', coords: [-7.7350, 114.1150] },
                { name: 'Kec. Kendit', desa: 'Area Survei Kecamatan Kendit', coords: [-7.7320, 113.9410] },
                { name: 'Kec. Panarukan', desa: 'Area Survei Kecamatan Panarukan', coords: [-7.7010, 113.9380] },
                { name: 'Kec. Bungatan', desa: 'Area Survei Kecamatan Bungatan', coords: [-7.7310, 113.8450] }
            ];

            surveyLocations.forEach(function (loc) {
                L.circleMarker(loc.coords, {
                    radius: 7,
                    color: '#0f172a',
                    weight: 2,
                    fillColor: '#10b981',
                    fillOpacity: 0.9
                })
                .bindPopup(
                    '<strong>' + loc.name + '</strong><br>' +
                    '<span style="font-size:0.76rem;color:#475569;">' + loc.desa + '</span><br>' +
                    '<a href="peta.html" style="font-size:0.75rem;font-weight:700;color:#2563eb;">Buka di Peta Lengkap &rarr;</a>'
                )
                .addTo(miniMap);
            });

            window.dashboardMiniMap = miniMap;
        }
    };

    window.WebGISMapEnhancer = WebGISMapEnhancer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (document.getElementById('map') && window.map) {
                WebGISMapEnhancer.initMainMap();
            }
            if (document.getElementById('dashboardMiniMapCanvas')) {
                WebGISMapEnhancer.initDashboardPreviewMap();
            }
        });
    } else {
        if (document.getElementById('map') && window.map) {
            WebGISMapEnhancer.initMainMap();
        }
        if (document.getElementById('dashboardMiniMapCanvas')) {
            WebGISMapEnhancer.initDashboardPreviewMap();
        }
    }
})();

