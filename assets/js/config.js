/**
 * ============================================================================
 * WEBGIS & MONITORING DASHBOARD KABUPATEN SITUBONDO
 * File: assets/js/config.js
 * Description: Central Configuration, Verified Spreadsheet Schemas (Phase 01),
 *              Member Normalization Rules, & BIG Spatial Layer Catalog.
 * ============================================================================
 */

window.WEBGIS_CONFIG = {
    app: {
        name: 'WebGIS & Monitoring Kabupaten Situbondo',
        shortName: 'WebGIS Situbondo',
        subtitle: 'Sistem Informasi Geospasial & Monitoring Survei Tanah Wakaf',
        region: 'Kabupaten Situbondo, Jawa Timur',
        version: '2.0.0',
        repoUrl: 'https://github.com/AdaniMaulidan/webgis-kabupaten-situbondo',
        liveUrl: 'https://adanimaulidan.github.io/webgis-kabupaten-situbondo/',
        mapCenter: [-7.7586, 114.0153],
        mapBounds: [
            [-8.026516436294546, 113.54513681883124],
            [-7.490798897883642, 114.48547485453135]
        ]
    },

    /**
     * Google OAuth 2.0 Configuration (Public Client ID Only — Zero Secret in Repo)
     * Scope: Google Sheets Read/Write for Authorized Editors
     */
    oauth: {
        clientId: '', // Diisi pada Phase 05 (Google Cloud Console Web OAuth Client ID)
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        tokenStorageKey: 'webgis_situbondo_oauth_session'
    },

    /**
     * Verified Google Spreadsheets Configuration (Inspected in Phase 01 & Updated Schema)
     */
    spreadsheets: {
        kalender: {
            id: '1ZddBlRtj7OZyS3VmiisQtV7gJbekAxrq6YfxvD-liUY',
            title: 'Kalender dan Pembagian Tugas Survei Lapangan',
            url: 'https://docs.google.com/spreadsheets/d/1ZddBlRtj7OZyS3VmiisQtV7gJbekAxrq6YfxvD-liUY/edit?gid=368658062',
            defaultGid: '368658062',
            headerRowIndex: 4, // Baris ke-4 adalah header tabel pada tab Kecamatan
            dataStartRowIndex: 5,
            tabs: [
                { name: 'Copy of Kec.Situbondo', label: 'Kec. Situbondo (Utama)', gid: '368658062', type: 'task_table', isPrimary: true },
                { name: 'Kalender Survei', label: 'Kalender Survei (Okt 2026 - Mar 2027)', gid: '0', type: 'calendar_matrix' },
                { name: 'Kec.Panji', label: 'Kec. Panji', gid: '1079740225', type: 'task_table' },
                { name: 'Kec.Mangaran', label: 'Kec. Mangaran', gid: '1319029332', type: 'task_table' },
                { name: 'Kec.Kapongan', label: 'Kec. Kapongan', gid: '86010589', type: 'task_table' },
                { name: 'Kec.Arjasa', label: 'Kec. Arjasa', gid: '1378660540', type: 'task_table' },
                { name: 'Kec.Kendit', label: 'Kec. Kendit', gid: '642836605', type: 'task_table' },
                { name: 'Kec.Panarukan', label: 'Kec. Panarukan', gid: '523754395', type: 'task_table' },
                { name: 'Kec.Bungatan', label: 'Kec. Bungatan', gid: '1872022630', type: 'task_table' },
                { name: 'Kec.Situbondo', label: 'Arsip Kec. Situbondo', gid: '670201195', type: 'task_table' }
            ],
            columns: [
                { colLetter: 'B', colIndex: 1, key: 'no', label: 'No', editable: false, mergedGroup: true },
                { colLetter: 'C', colIndex: 2, key: 'pic', label: 'PIC', editable: true, mergedGroup: true },
                { colLetter: 'D', colIndex: 3, key: 'namaAnggota', label: 'Nama Anggota', editable: false },
                { colLetter: 'E', colIndex: 4, key: 'kegiatan', label: 'Kegiatan', editable: true, mergedGroup: true },
                { colLetter: 'F', colIndex: 5, key: 'tanggal', label: 'Tanggal', editable: true, mergedGroup: true },
                { colLetter: 'G', colIndex: 6, key: 'kecamatan', label: 'Kecamatan', editable: true, mergedGroup: true },
                { colLetter: 'H', colIndex: 7, key: 'desa', label: 'Desa/Kelurahan', editable: true, mergedGroup: true },
                { colLetter: 'I', colIndex: 8, key: 'totalBidang', label: 'Total Bidang', editable: true },
                { colLetter: 'J', colIndex: 9, key: 'pembagian', label: 'Pembagian Tugas', editable: true },
                { colLetter: 'K', colIndex: 10, key: 'jumlahBidangAnggota', label: 'Jumlah Bidang Peranggota', editable: true, numeric: true },
                { colLetter: 'L', colIndex: 11, key: 'link', label: 'Link Peta Kerja', editable: true }
            ]
        },

        monitoring: {
            id: '1LDZiAVK8mDlRiLqayorNHAcwtu3H-msn970lYvicjzo',
            title: 'Monitoring Capaian Mingguan Anggota',
            url: 'https://docs.google.com/spreadsheets/d/1LDZiAVK8mDlRiLqayorNHAcwtu3H-msn970lYvicjzo/edit?usp=sharing',
            defaultGid: '0',
            headerRowIndex: 1, // Baris ke-1 adalah header tabel pada tab Monitoring
            dataStartRowIndex: 2,
            tabs: [
                { name: 'Bulan 1', label: 'Bulan 1 (Okt - Nov 2026)', gid: '0', isPrimary: true },
                { name: 'Bulan 2', label: 'Bulan 2', gid: '1983116596' },
                { name: 'Bulan 3', label: 'Bulan 3', gid: '755707223' },
                { name: 'Bulan 4', label: 'Bulan 4', gid: '1304782040' }
            ],
            columns: [
                { colLetter: 'A', colIndex: 0, key: 'mingguKe', label: 'Minggu Ke-', editable: false, mergedGroup: true },
                { colLetter: 'B', colIndex: 1, key: 'tanggalMulai', label: 'Tanggal Mulai', editable: true },
                { colLetter: 'C', colIndex: 2, key: 'nama', label: 'Nama Anggota', editable: false },
                { colLetter: 'D', colIndex: 3, key: 'kegiatan', label: 'Kegiatan', editable: true },
                { colLetter: 'E', colIndex: 4, key: 'targetMingguIni', label: 'Target Dicapai Minggu Ini', editable: true },
                { colLetter: 'F', colIndex: 5, key: 'targetMingguDepan', label: 'Target Minggu Depan', editable: true },
                { colLetter: 'G', colIndex: 6, key: 'jumlahBidang', label: 'Jumlah Bidang', editable: true, numeric: true },
                { colLetter: 'H', colIndex: 7, key: 'jumlahDikerjakan', label: 'Jumlah Bidang Yang Dikerjakan', editable: true, numeric: true },
                { colLetter: 'I', colIndex: 8, key: 'capaianPersen', label: 'Capaian (%)', editable: false, numeric: true },
                { colLetter: 'J', colIndex: 9, key: 'status', label: 'Status', editable: true },
                { colLetter: 'K', colIndex: 10, key: 'catatanAnggota', label: 'Catatan Anggota', editable: true },
                { colLetter: 'L', colIndex: 11, key: 'catatanMentor', label: 'Catatan Mentor', editable: true }
            ]
        }
    },

    /**
     * Daftar 8 Anggota Tim Terverifikasi (Phase 01 Audit)
     */
    teamMembers: [
        { id: 'M01', fullName: 'Adinda Martha Putri Andristi', shortName: 'Adinda Martha', aliases: ['Adinda Martha Putri Andristi'] },
        { id: 'M02', fullName: 'Adinda Nike Febiyanti', shortName: 'Adinda Nike', aliases: ['Adinda Nike Febiyanti'] },
        { id: 'M03', fullName: 'Aji Dwi Jatmiko', shortName: 'Aji Dwi', aliases: ['Aji Dwi Jatmiko', 'Aji Dwi Jatmiκο'] },
        { id: 'M04', fullName: 'Tiara Puspita Sari', shortName: 'Tiara Puspita', aliases: ['Tiara Puspita Sari'] },
        { id: 'M05', fullName: 'Hafihud Thohir', shortName: 'Hafihud Thohir', aliases: ['Hafihud Thohir'] },
        { id: 'M06', fullName: 'Wildatul Fajariyah', shortName: 'Wildatul F.', aliases: ['Wildatul Fajariyah'] },
        { id: 'M07', fullName: 'Muhammad Adani Maulidan', shortName: 'M. Adani Maulidan', aliases: ['Muhammad Adani Maulidan'] },
        { id: 'M08', fullName: 'Nabiela Fadin Insani Jannah Putri Sinarwadi', shortName: 'Nabiela Fadin', aliases: ['Nabiela Fadin Insani Jannah Putri Sinarwadi', 'Nabiela Fadin Insani J P S'] }
    ],

    /**
     * Katalog 8 Layer Data Geospasial BIG Kabupaten Situbondo (Skala 1:25.000)
     */
    gisLayers: [
        {
            id: 'ADMINISTRASIDESA_AR_25K_0',
            code: 'ADMINISTRASIDESA_AR_25K',
            name: 'Batas Administrasi Desa',
            geometryType: 'Polygon (Area)',
            featureCount: 194,
            fileSizeKb: 2266.8,
            dataFile: 'data/ADMINISTRASIDESA_AR_25K_0.js',
            legendIcon: 'legend/ADMINISTRASIDESA_AR_25K_0.png',
            color: '#becf50',
            description: 'Batas wilayah administrasi desa/kelurahan dan kecamatan di Kabupaten Situbondo.'
        },
        {
            id: 'AGRISAWAH_AR_25K_1',
            code: 'AGRISAWAH_AR_25K',
            name: 'Area Persawahan',
            geometryType: 'Polygon (Area)',
            featureCount: 177,
            fileSizeKb: 1471.3,
            dataFile: 'data/AGRISAWAH_AR_25K_1.js',
            legendIcon: 'legend/AGRISAWAH_AR_25K_1.png',
            color: '#e77148',
            description: 'Sebaran lahan pertanian sawah irigasi dan sawah tadah hujan.'
        },
        {
            id: 'PEMUKIMAN_AR_25K_2',
            code: 'PEMUKIMAN_AR_25K',
            name: 'Area Permukiman',
            geometryType: 'Polygon (Area)',
            featureCount: 1170,
            fileSizeKb: 1528.4,
            dataFile: 'data/PEMUKIMAN_AR_25K_2.js',
            legendIcon: 'legend/PEMUKIMAN_AR_25K_2.png',
            color: '#f59e0b',
            description: 'Kawasan permukiman penduduk dan tempat kegiatan di Kabupaten Situbondo.'
        },
        {
            id: 'SUNGAI_LN_25K_3',
            code: 'SUNGAI_LN_25K',
            name: 'Jaringan Sungai',
            geometryType: 'LineString (Garis)',
            featureCount: 3125,
            fileSizeKb: 5582.4,
            dataFile: 'data/SUNGAI_LN_25K_3.js',
            legendIcon: 'legend/SUNGAI_LN_25K_3.png',
            color: '#38bdf8',
            description: 'Jaringan hidrologi dan alur sungai di wilayah Kabupaten Situbondo.'
        },
        {
            id: 'JALAN_LN_25K_4',
            code: 'JALAN_LN_25K',
            name: 'Jaringan Jalan',
            geometryType: 'LineString (Garis)',
            featureCount: 1866,
            fileSizeKb: 3554.1,
            dataFile: 'data/JALAN_LN_25K_4.js',
            legendIcon: 'legend/JALAN_LN_25K_4.png',
            color: '#e5b636',
            description: 'Jaringan infrastruktur jalan arteri, kolektor, lokal, dan jalan lain.'
        },
        {
            id: 'PEMERINTAHAN_PT_25K_5',
            code: 'PEMERINTAHAN_PT_25K',
            name: 'Fasilitas Pemerintahan',
            geometryType: 'Point (Titik Cluster)',
            featureCount: 163,
            fileSizeKb: 39.2,
            dataFile: 'data/PEMERINTAHAN_PT_25K_5.js',
            legendIcon: 'legend/PEMERINTAHAN_PT_25K_5.png',
            color: '#729b6f',
            description: 'Titik lokasi kantor pemerintahan (Kantor Bupati, Kantor Camat, Kantor Desa/Lurah).'
        },
        {
            id: 'PENDIDIKAN_PT_25K_6',
            code: 'PENDIDIKAN_PT_25K',
            name: 'Fasilitas Pendidikan',
            geometryType: 'Point (Titik Cluster)',
            featureCount: 180,
            fileSizeKb: 54.9,
            dataFile: 'data/PENDIDIKAN_PT_25K_6.js',
            legendIcon: 'legend/PENDIDIKAN_PT_25K_6.png',
            color: '#8d5a99',
            description: 'Titik lokasi sarana pendidikan formal dan non-formal.'
        },
        {
            id: 'SARANAIBADAH_PT_25K_7',
            code: 'SARANAIBADAH_PT_25K',
            name: 'Sarana Ibadah',
            geometryType: 'Point (Titik Cluster)',
            featureCount: 426,
            fileSizeKb: 97.5,
            dataFile: 'data/SARANAIBADAH_PT_25K_7.js',
            legendIcon: 'legend/SARANAIBADAH_PT_25K_7.png',
            color: '#ff9e17',
            description: 'Titik lokasi masjid, mushola, dan sarana peribadatan lainnya.'
        }
    ],

    /**
     * Kamus Label Atribut BIG untuk Popup Peta yang Lebih Informatif
     */
    attributeLabels: {
        NAMOBJ: 'Nama Objek / Wilayah',
        REMARK: 'Keterangan / Jenis',
        WADMKD: 'Desa / Kelurahan',
        WADMKC: 'Kecamatan',
        WADMKK: 'Kabupaten / Kota',
        WADMPR: 'Provinsi',
        LUASWH: 'Luas Wilayah (Ha)',
        SHAPE_Leng: 'Panjang Geometri',
        SHAPE_Area: 'Luas Geometri',
        LCODE: 'Kode Unsur (LCODE)',
        JNSSWH: 'Jenis Sawah',
        NAMRJL: 'Nama Ruas Jalan',
        FGSGOV: 'Fungsi Pemerintahan',
        FGSIBD: 'Fungsi Sarana Ibadah'
    },

    /**
     * Helper: Normalisasi nama anggota agar konsisten antara Spreadsheet 1 & 2
     * Menangani karakter Yunani Unicode (\u03ba\u03bf) pada "Aji Dwi Jatmiκο"
     * dan singkatan pada "Nabiela Fadin Insani J P S".
     */
    normalizeMemberName: function (rawName) {
        if (!rawName || typeof rawName !== 'string') return '';
        var cleaned = rawName
            .trim()
            .replace(/\u03ba/g, 'k')
            .replace(/\u03bf/g, 'o')
            .replace(/\s+/g, ' ');

        var lower = cleaned.toLowerCase();
        for (var i = 0; i < this.teamMembers.length; i++) {
            var member = this.teamMembers[i];
            if (member.fullName.toLowerCase() === lower || member.shortName.toLowerCase() === lower) {
                return member.fullName;
            }
            for (var j = 0; j < member.aliases.length; j++) {
                if (member.aliases[j].toLowerCase() === lower) {
                    return member.fullName;
                }
            }
            if (lower.indexOf('nabiela fadin') !== -1 && member.fullName.toLowerCase().indexOf('nabiela fadin') !== -1) {
                return member.fullName;
            }
            if (lower.indexOf('aji dwi') !== -1 && member.fullName.toLowerCase().indexOf('aji dwi') !== -1) {
                return member.fullName;
            }
        }
        return cleaned;
    }
};
