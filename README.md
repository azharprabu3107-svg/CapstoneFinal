# Kimia Farma Business Performance Analytics Dashboard

**Project Stone — Data Analytics | Periode 2020–2023**

Dashboard Business Intelligence untuk mengeksplorasi kinerja penjualan, performa cabang, kontribusi produk, rating transaksi, dan catatan inventaris berdasarkan empat dataset CSV Kimia Farma yang disediakan dalam proyek.

> **Catatan ruang lingkup:** IBM Bob digunakan sebagai AI coding assistant selama proses perencanaan, penulisan kode, debugging, dan penyempurnaan dashboard. Aplikasi dashboard ini sendiri belum memiliki chatbot atau AI Agent percakapan yang tertanam di dalamnya.

---

## Daftar Isi

- [Latar Belakang](#latar-belakang)
- [Tujuan Proyek](#tujuan-proyek)
- [Fitur Dashboard](#fitur-dashboard)
- [Dataset](#dataset)
- [Metodologi dan Proses Data](#metodologi-dan-proses-data)
- [KPI dan Rumus](#kpi-dan-rumus)
- [Visualisasi](#visualisasi)
- [Filter dan Interaksi](#filter-dan-interaksi)
- [Teknologi](#teknologi)
- [Struktur Folder](#struktur-folder)
- [Cara Menjalankan](#cara-menjalankan)
- [Validasi Dataset](#validasi-dataset)
- [Batasan Analisis](#batasan-analisis)
- [Arsitektur Prompt](#arsitektur-prompt)
- [Pengembangan Selanjutnya](#pengembangan-selanjutnya)
- [Privasi dan Penggunaan Dataset](#privasi-dan-penggunaan-dataset)

---

## Latar Belakang

Data penjualan dan operasional tersedia dalam beberapa file terpisah dengan ukuran yang cukup besar. Untuk memperoleh gambaran kinerja yang menyeluruh, data transaksi perlu dihubungkan dengan informasi produk dan kantor cabang. Tanpa proses integrasi dan agregasi yang tepat, analisis tren penjualan, kontribusi produk, performa wilayah, serta rating transaksi akan lebih sulit dilakukan secara konsisten.

Proyek ini mengolah data tersebut menjadi dashboard analitik yang menyajikan indikator dan visualisasi secara terstruktur. Dashboard ditujukan sebagai alat bantu eksplorasi dan evaluasi data bagi manajemen, supervisor cabang, dan analis bisnis.

## Tujuan Proyek

1. Mengintegrasikan data transaksi dengan data referensi produk dan cabang.
2. Menghitung indikator penjualan berdasarkan harga dan diskon yang tercatat.
3. Menganalisis tren penjualan menurut waktu, wilayah, cabang, dan kategori produk.
4. Menyajikan distribusi rating transaksi sebagai salah satu indikator pengalaman pelanggan.
5. Mengeksplorasi catatan inventaris tanpa menyimpulkan saldo stok terkini yang tidak didukung data.
6. Menyediakan filter interaktif dan ekspor ringkasan berdasarkan filter yang dipilih.

## Fitur Dashboard

Dashboard dibagi menjadi enam halaman analitik:

| Halaman | Isi utama |
|---|---|
| **Overview** | KPI utama, tren net sales bulanan, ringkasan tahunan, provinsi dengan penjualan tertinggi, komposisi kategori produk, dan insight ringkas. |
| **Sales Analytics** | Tren penjualan bulanan, perbandingan penjualan tahunan, serta hubungan diskon dengan rata-rata net sales transaksi. |
| **Regional Analytics** | Penjualan per provinsi, aktivitas transaksi provinsi, top cabang, komposisi tipe cabang, dan tabel perbandingan rating cabang dengan rating transaksi. |
| **Product Analytics** | Kontribusi penjualan kategori produk, jumlah transaksi per kategori, dan sepuluh produk dengan net sales tertinggi. |
| **Customer Experience** | Distribusi rating transaksi dan rata-rata rating transaksi per provinsi. |
| **Inventory Records** | Jumlah catatan inventaris, pasangan cabang-produk unik, catatan berulang, catatan stok bernilai nol, serta distribusi nilai `opname_stock`. |

Fitur pendukung:

- Filter global berdasarkan tahun, provinsi, tipe cabang, dan kategori produk.
- Pembaruan KPI dan visualisasi tanpa memuat ulang halaman.
- Tombol reset filter dan penanda filter aktif.
- Tampilan loading saat dataset dibaca.
- Pesan error apabila file CSV atau library yang diperlukan tidak tersedia.
- Empty state apabila filter tidak menghasilkan data.
- Ekspor ringkasan metrik ke CSV berdasarkan filter aktif.
- Layout responsif untuk desktop, tablet, dan perangkat mobile.

## Dataset

Aplikasi membaca empat file CSV berikut:

| File | Jumlah baris | Kolom utama | Peran |
|---|---:|---|---|
| `kf_final_transaction.csv` | 672.458 | `transaction_id`, `date`, `branch_id`, `product_id`, `price`, `discount_percentage`, `rating` | Tabel transaksi utama. Kolom `customer_name` tersedia pada sumber, tetapi tidak dipertahankan dalam model analitik aplikasi. |
| `kf_kantor_cabang.csv` | 1.725 | `branch_id`, `branch_category`, `branch_name`, `kota`, `provinsi`, `rating` | Referensi informasi cabang dan wilayah. |
| `kf_product.csv` | 150 | `product_id`, `product_name`, `product_category`, `price` | Referensi informasi produk dan kategori. |
| `kf_inventory.csv` | 1.035.000 | `Inventory_ID`, `branch_id`, `product_id`, `product_name`, `opname_stock` | Catatan stok opname per produk dan cabang. |

**Relasi data:**

- `kf_final_transaction.branch_id` dihubungkan ke `kf_kantor_cabang.branch_id`.
- `kf_final_transaction.product_id` dihubungkan ke `kf_product.product_id`.
- Data inventaris dianalisis terpisah dan dipetakan ke referensi cabang serta produk melalui `branch_id` dan `product_id`.

Dataset transaksi memiliki rentang tanggal **1 Januari 2020 sampai 30 Desember 2023**. Jumlah wilayah pada tabel cabang adalah 31 provinsi, dengan 3 tipe cabang dan 8 kategori produk pada tabel referensi.

## Metodologi dan Proses Data

Pengolahan dilakukan di sisi browser (*client-side processing*) menggunakan JavaScript.

1. **Data loading** — aplikasi memeriksa lokasi file dan membaca tabel referensi cabang serta produk.
2. **Data parsing** — PapaParse digunakan untuk membaca CSV. File transaksi dan inventaris dibaca secara bertahap menggunakan mekanisme *chunk* agar seluruh teks CSV tidak perlu disimpan sebagai satu salinan besar di memori.
3. **Data validation** — tanggal, harga, diskon, dan referensi `branch_id` serta `product_id` diperiksa sebelum transaksi dimasukkan ke model analitik.
4. **Data integration** — indeks referensi cabang dan produk digunakan untuk menghubungkan transaksi tanpa melakukan join yang menggandakan baris transaksi.
5. **Data minimization** — model transaksi hanya mempertahankan atribut yang diperlukan untuk agregasi dan visualisasi. Nama pelanggan dan ID transaksi tidak disimpan dalam model analitik.
6. **Feature engineering** — tanggal diubah menjadi indeks bulan dan tahun untuk analisis tren.
7. **Aggregation** — metrik dihitung berdasarkan filter aktif, antara lain total penjualan, jumlah transaksi, rata-rata diskon, rating, serta agregasi menurut provinsi, cabang, produk, dan bulan.
8. **Visualization** — hasil agregasi ditampilkan menggunakan Chart.js.

Data sumber tidak diubah oleh aplikasi. Pemrosesan dilakukan setiap kali dashboard dijalankan di browser.

## KPI dan Rumus

| KPI | Rumus / definisi |
|---|---|
| **Net Sales** | `SUM(price × (1 - discount_percentage))` |
| **Total Transactions** | Jumlah baris transaksi valid yang diproses. Pada dataset yang diperiksa, `transaction_id` unik untuk setiap baris. |
| **Average Transaction Value** | `Net Sales / Total Transactions` |
| **Average Discount** | `AVERAGE(discount_percentage) × 100%` |
| **Average Transaction Rating** | Rata-rata nilai `rating` yang tersedia. |
| **Branches with Transactions** | Jumlah `branch_id` unik yang memiliki transaksi setelah filter diterapkan. |

`discount_percentage` disimpan sebagai proporsi desimal. Contohnya, nilai `0,10` berarti diskon 10%.

## Visualisasi

Jenis grafik dipilih berdasarkan tujuan analisis, bukan menggunakan satu jenis grafik untuk semua metrik.

| Jenis visualisasi | Penggunaan |
|---|---|
| **Line chart** | Tren net sales bulanan dari waktu ke waktu. |
| **Vertical bar / column chart** | Perbandingan net sales tahunan dan jumlah transaksi per kategori produk. |
| **Horizontal bar chart** | Peringkat provinsi, cabang, produk, kategori produk, dan rata-rata rating per provinsi. |
| **Doughnut chart** | Komposisi net sales berdasarkan kategori produk dan tipe cabang. |
| **Bubble chart** | Perbandingan provinsi berdasarkan average transaction value (sumbu X), total net sales (sumbu Y), dan jumlah transaksi (ukuran gelembung). |
| **Scatter plot** | Hubungan tingkat diskon dengan rata-rata net sales transaksi pada setiap kelompok diskon. |
| **Column distribution chart** | Distribusi frekuensi rating transaksi dan kelompok nilai `opname_stock`. |
| **Tabel analitik** | Perbandingan rating cabang dengan rata-rata rating transaksi pada cabang yang sama. |

Grafik dan ringkasan dihitung ulang ketika filter berubah.

## Filter dan Interaksi

Empat filter utama tersedia di dashboard:

- **Year** — membatasi transaksi berdasarkan tahun.
- **Province** — membatasi transaksi dan catatan inventaris berdasarkan provinsi cabang.
- **Branch Type** — membatasi data berdasarkan kategori/tipe cabang.
- **Product Category** — membatasi data berdasarkan kategori produk.

Filter dapat digunakan secara bersamaan. Tombol **Reset filters** mengembalikan seluruh pilihan ke kondisi awal.

**Pengecualian filter inventaris:** dataset inventaris tidak memiliki kolom tanggal. Oleh karena itu, filter tahun tidak diterapkan pada halaman inventaris. Filter provinsi, tipe cabang, dan kategori produk tetap dapat diterapkan melalui tabel referensi.

## Teknologi

- **HTML5** — struktur halaman dan elemen semantik.
- **CSS3** — sistem desain, layout, dan responsivitas.
- **Tailwind CSS** — utilitas styling yang dimuat melalui CDN.
- **Vanilla JavaScript** — pemrosesan data, state filter, navigasi, dan ekspor.
- **Chart.js 4.4.3** — grafik interaktif.
- **PapaParse 5.4.1** — parsing file CSV.
- **IBM Plex Sans** — tipografi antarmuka.
- **IBM Bob** — AI coding assistant yang digunakan selama proses pengembangan.

Tidak ada backend atau database server pada implementasi saat ini.

## Struktur Folder

Susunan folder yang direkomendasikan:

```text
kimia-farma-business-performance/
│
├── index.html
├── script.js
├── style.css
├── README.md
│
└── data/
    └── raw/
        ├── kf_final_transaction.csv
        ├── kf_kantor_cabang.csv
        ├── kf_product.csv
        └── kf_inventory.csv
```

Aplikasi mencari dataset pada folder `data/raw/` terlebih dahulu. Jika tidak ditemukan, aplikasi juga mencoba mencari file CSV di direktori yang sama dengan `index.html`.

## Cara Menjalankan

### 1. Siapkan file proyek

Clone atau unduh repository, lalu pastikan tiga file aplikasi (`index.html`, `script.js`, dan `style.css`) berada pada direktori yang sama.

### 2. Siapkan dataset

Letakkan empat file CSV pada folder `data/raw/` sesuai nama file yang tercantum pada bagian [Dataset](#dataset).

Dataset tidak disertakan secara otomatis dalam source code. Pastikan kamu memiliki akses dan izin penggunaan dataset tersebut.

### 3. Buka menggunakan IBM Bob

Buka folder proyek melalui IBM Bob.

### 4. Jalankan Live Server

Buka `index.html`, kemudian pilih **Open with Live Server**. Dashboard harus dijalankan melalui server lokal, bukan dibuka langsung menggunakan protokol `file://`, agar browser dapat membaca file CSV.

### 5. Tunggu proses pemuatan data

Dashboard akan menampilkan indikator pemuatan selama tabel referensi, inventaris, dan transaksi dibaca serta diagregasi. Setelah selesai, halaman Overview akan ditampilkan.

**Koneksi internet diperlukan** untuk memuat Tailwind CSS, Chart.js, PapaParse, dan font IBM Plex Sans dari CDN.

## Validasi Dataset

Berikut ringkasan pemeriksaan pada dataset yang digunakan:

| Pemeriksaan | Hasil |
|---|---:|
| Baris transaksi | 672.458 |
| `transaction_id` unik | 672.458 |
| Cabang pada tabel referensi | 1.725 |
| Produk pada tabel referensi | 150 |
| Catatan inventaris | 1.035.000 |
| Pasangan cabang-produk unik pada inventaris | 254.004 |
| Pasangan cabang-produk dengan catatan berulang | 234.978 |
| Catatan tambahan di luar catatan pertama setiap pasangan | 780.996 |
| Catatan `opname_stock` bernilai nol | 10.254 |
| Rentang tanggal transaksi | 1 Jan 2020 – 30 Des 2023 |

Pada dataset transaksi yang diperiksa, seluruh `branch_id` dan `product_id` memiliki pasangan pada tabel referensi. `transaction_id` juga unik pada setiap baris.

### Contoh ringkasan perhitungan awal

Nilai berikut merupakan hasil agregasi atas seluruh transaksi sebelum filter diterapkan:

| Metrik | Nilai |
|---|---:|
| Gross sales sebelum diskon | Rp347.222.312.800 |
| Nilai diskon | Rp26.051.122.481 |
| Net sales setelah diskon | Rp321.171.190.319 |
| Average discount | 7,4992% |
| Average transaction rating | 4,0000 dari 5 |
| Average transaction value | Rp477.607,81 |

Angka tersebut berfungsi sebagai acuan pemeriksaan hasil agregasi. Nilai tampilan pada dashboard dapat dibulatkan.

## Batasan Analisis

1. **Tidak menghitung profit.** Dataset tidak menyediakan harga pokok penjualan (HPP/COGS), sehingga net profit dan net profit margin tidak dapat dihitung secara valid.
2. **Tidak menghitung quantity sold.** Dataset transaksi tidak menyediakan kolom kuantitas produk. Jumlah transaksi tidak boleh dianggap sebagai jumlah unit yang terjual.
3. **Inventaris tidak memiliki tanggal pencatatan.** Karena itu, aplikasi tidak dapat menentukan stok terkini atau perubahan stok dari waktu ke waktu.
4. **Catatan inventaris berulang.** Beberapa pasangan cabang-produk memiliki lebih dari satu catatan. Dashboard menyajikan jumlah catatan, pasangan unik, catatan bernilai nol, dan distribusi nilai opname; semua nilai opname tidak dijumlahkan sebagai saldo stok perusahaan.
5. **Analisis diskon bersifat deskriptif.** Scatter plot menunjukkan pola rata-rata net sales pada tingkat diskon yang berbeda, bukan bukti bahwa diskon menyebabkan perubahan penjualan.
6. **Rating bukan ukuran tunggal kepuasan pelanggan.** Rating transaksi dan rating cabang merupakan atribut berbeda. Perbandingannya perlu ditafsirkan secara hati-hati dan tidak menjelaskan penyebab perbedaan.
7. **Pemrosesan dilakukan di browser.** Kinerja dashboard dapat dipengaruhi kapasitas memori dan performa perangkat yang menjalankannya.

## Arsitektur Prompt

Selama pengembangan dengan IBM Bob, instruksi disusun menggunakan tiga layer:

1. **Role & Context** — menetapkan peran AI sebagai Senior Data Analyst, Business Intelligence Specialist, dan Frontend Engineer serta menjelaskan konteks proyek Kimia Farma.
2. **Task & Requirements** — menjelaskan pemeriksaan dataset, data processing, KPI, visualisasi, filter, struktur halaman, dan kebutuhan implementasi.
3. **Constraints & Output** — menetapkan batasan agar tidak menggunakan data dummy, tidak menghitung metrik yang tidak didukung dataset, menjaga validitas integrasi, dan membatasi source code aplikasi pada tiga file utama.

Prompt disempurnakan selama pengembangan untuk menyesuaikan metrik dengan variabel yang tersedia, mengubah struktur file menjadi aplikasi statis yang berjalan melalui Live Server, serta memperbaiki hierarki visual dan variasi grafik.

## Pengembangan Selanjutnya

Beberapa peluang pengembangan yang dapat dilakukan:

- Menambahkan chatbot AI Agent berbasis NLP agar pengguna dapat bertanya tentang data menggunakan bahasa alami.
- Menghasilkan ringkasan insight dan rekomendasi berdasarkan filter aktif.
- Mengembangkan analisis prediktif untuk tren penjualan jika data dan metodologi pendukung tersedia.
- Mengintegrasikan dashboard dengan database atau sumber data terjadwal.
- Menambahkan autentikasi dan pengaturan hak akses apabila dashboard digunakan dalam lingkungan perusahaan.

Fitur-fitur tersebut merupakan rencana pengembangan, bukan bagian dari implementasi saat ini.

## Privasi dan Penggunaan Dataset

File transaksi sumber memiliki kolom `customer_name`. Aplikasi tidak mempertahankan nama pelanggan dalam model analitik dan tidak menampilkannya pada dashboard. Meski demikian, file sumber tetap perlu diperlakukan sebagai data yang berpotensi mengandung informasi pribadi.

Untuk repository GitHub publik, **jangan mengunggah file CSV mentah sebelum memastikan izin penggunaan, lisensi, dan aspek privasinya**. Simpan dataset secara lokal atau gunakan mekanisme distribusi data yang disetujui oleh pemilik dataset. Source code tetap membutuhkan empat CSV tersebut agar dashboard dapat berjalan dengan data aktual.

---

**Project:** Kimia Farma — Business Performance Analytics  
**Program:** Project Stone / Data Analytics Training  
**Dashboard runtime:** Browser melalui Live Server  
**AI-assisted development:** IBM Bob
