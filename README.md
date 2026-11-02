# WebGIS & Monitoring Dashboard Kabupaten Situbondo

Sistem Informasi Geospasial (WebGIS) berbasis data **Rupabumi Indonesia (RBI) Badan Informasi Geospasial (BIG) Skala 1:25.000** yang terintegrasi secara *real-time* 2 arah dengan **Google Spreadsheet Kalender & Pembagian Tugas** serta **Google Spreadsheet Monitoring Kinerja**.

- **Live Production URL (GitHub Pages):** [https://adanimaulidan.github.io/webgis-kabupaten-situbondo/](https://adanimaulidan.github.io/webgis-kabupaten-situbondo/)
- **GitHub Repository:** [https://github.com/AdaniMaulidan/webgis-kabupaten-situbondo](https://github.com/AdaniMaulidan/webgis-kabupaten-situbondo)

---

## Arsitektur Halaman Utama

| Halaman | File | Fungsi Utama |
| :--- | :--- | :--- |
| **1. Dashboard** | `index.html` | Ringkasan KPI Real-Time, Grafik Batang Capaian Kinerja Tim, Preview Peta Situbondo, & Jadwal Terkini. |
| **2. Peta WebGIS** | `peta.html` | Peta Interaktif Leaflet dengan 8 Layer Geospasial BIG (7.301 Fitur), Basemap Switcher (Esri Street, Satelit, Topografi), Pencarian Desa/Objek, Pengatur Opasitas, & Pengukuran Jarak/Luas. |
| **3. Kalender & Tugas** | `kalender.html` | Kanvas Google Spreadsheet Kalender & Pembagian Tugas Asli (*Live Edit 2 Arah*), Matriks Kalender Survei 6 Bulan, & Tabel Filter per Kecamatan/Anggota. |
| **4. Monitoring** | `monitoring.html` | Kartu KPI Monitoring, Grafik Batang Interaktif (`Chart.js`) per Minggu/Bulan, serta Kanvas Google Spreadsheet Monitoring Asli (*Live Edit 2 Arah* dengan Auto-Sync 3 Detik). |

---

## 8 Layer Geospasial BIG (Skala 1:25.000)

1. `ADMINISTRASIDESA_AR_25K` — Batas Administrasi Desa/Kelurahan (194 Poligon)
2. `AGRISAWAH_AR_25K` — Area Lahan Persawahan (177 Poligon)
3. `PEMUKIMAN_AR_25K` — Area Permukiman Penduduk (1.170 Poligon)
4. `SUNGAI_LN_25K` — Jaringan Sungai & Aliran Air (3.125 Garis)
5. `JALAN_LN_25K` — Jaringan Ruas Jalan (1.866 Garis)
6. `PEMERINTAHAN_PT_25K` — Titik Kantor Pemerintahan (163 Titik Cluster)
7. `PENDIDIKAN_PT_25K` — Titik Fasilitas Pendidikan (180 Titik Cluster)
8. `SARANAIBADAH_PT_25K` — Titik Sarana Ibadah / Masjid (426 Titik Cluster)

---

## Sumber Data Live Google Sheets

1. **Spreadsheet 1 — Kalender & Pembagian Tugas Survei:**
   - URL: [Buka Spreadsheet Kalender & Pembagian Tugas](https://docs.google.com/spreadsheets/d/1ZddBlRtj7OZyS3VmiisQtV7gJbekAxrq6YfxvD-liUY/edit?gid=670201195)
   - Mencakup 10 Worksheet: `Kalender Survei`, `Kec.Situbondo`, `Kec.Panji`, `Kec.Mangaran`, `Kec.Kapongan`, `Kec.Arjasa`, `Kec.Kendit`, `Kec.Panarukan`, `Kec.Bungatan`, dan `List Kecamatan`.
2. **Spreadsheet 2 — Monitoring Capaian Mingguan:**
   - URL: [Buka Spreadsheet Monitoring](https://docs.google.com/spreadsheets/d/1LDZiAVK8mDlRiLqayorNHAcwtu3H-msn970lYvicjzo/edit?usp=sharing)
   - Mencakup 4 Worksheet: `Bulan 1`, `Bulan 2`, `Bulan 3`, dan `Bulan 4`.

---

## Cara Menjalankan Secara Lokal

Cukup buka `index.html` di browser modern, atau jalankan server statis lokal:

```bash
npx serve .
# atau
python -m http.server 5500
```
