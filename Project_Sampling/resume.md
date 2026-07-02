# Resume Proyek: IoT Sampling Tools (Smart Chamber)
**Tanggal Pembaruan Terakhir:** 1 Juli 2026

Dokumen ini berisi rangkuman seluruh arsitektur, progres pengembangan, dan status fitur dari sistem IoT Sampling Tools untuk memudahkan pengerjaan lanjutan di sesi berikutnya.

---

## 1. Struktur Direktori Proyek (`D:\Apalah\Project_Sampling`)
Proyek telah dipisahkan menjadi dua pilar utama agar lebih rapi:
*   **`/API` (Backend):** Berisi `server_mirna.js` (Node.js/Express) yang bertindak sebagai jembatan komunikasi antara ESP, Database, dan Website.
*   **`/Website` (Frontend):** Berisi antarmuka pengguna (UI) HTML, CSS, dan JS murni yang berkomunikasi dengan backend via Fetch API.
*   **File Lain:** `to-do.md` (Catatan panduan modifikasi hardware ESP & MySQL).

---

## 2. Progres & Fitur yang Telah Selesai (Sesi Hari Ini)

### A. Sisi Frontend (Antarmuka Website)
1. **Sistem Login (`index.html`):**
   * Desain Glassmorphism bergradasi warna BRIN (Biru-Merah).
   * Hak akses dipisah menggunakan `sessionStorage`.
   * Kredensial *Hardcoded*: `operator/admin123` (Hak Penuh) & `tamu/user123` (Hanya melihat).
2. **Dashboard WebApp (`dashboard.html` & `style.css`):**
   * Dirombak total meniru referensi UI (*Glassmorphism*, panel transparan melayang, desain kartu elegan).
   * Tombol kontrol Kipas dan Syringe disembunyikan/dikunci jika pengguna login sebagai "Tamu".
   * **Bottom Panel:** Menampilkan *Service Overview* (tabel status koneksi alat) dan Grafik Sensor Global.
3. **Modals (Pop-up Terintegrasi):**
   * **Modal Tambah Chamber:** Meminta input ID secara spesifik, lalu memvalidasi ketersediaannya ke backend sebelum merender kartu.
   * **Modal Detail (Log Activity):** Menampilkan nilai sensor terkini di kiri, Grafik Histori (*Chart.js*) di kanan atas, dan Tabel Log Histori 30 data terakhir di kanan bawah berdasarkan ID alat yang dipilih.

### B. Sisi Backend & Database (`server_mirna.js`)
1. **Otomatisasi Database (Auto-Migration Ringan):**
   * `server_mirna.js` kini otomatis melakukan query `CREATE TABLE IF NOT EXISTS daftar_device`.
   * Otomatis mengecek dan menjalankan `ALTER TABLE sensor_data ADD COLUMN syringe_present` jika kolom tersebut belum ada.
2. **Registrasi Otomatis & Pemantauan Jaringan:**
   * Setiap kali ESP melakukan `POST /api/data`, ID-nya akan otomatis ditambahkan ke tabel `daftar_device`.
   * Terdapat rutin `setInterval` setiap 1 menit untuk melabeli alat menjadi **"Offline"** jika tidak mengirim data > 1 menit.
3. **Pembaruan Endpoint API:**
   * `GET /api/devices`: Menarik seluruh daftar alat dan status koneksinya.
   * `GET /api/data/latest`: Menarik 1 data sensor terbaru secara umum.
   * `GET /api/data/latest/:device`: Menarik 1 data sensor terbaru milik alat spesifik.
   * `GET /api/data/history/:device`: Menarik 30 baris data terakhir milik alat spesifik untuk keperluan grafik dan tabel Log Activity.

---

## 3. Pending Task & Fitur Selanjutnya (Next Action)

1. **Persistensi State Halaman (Status Tertunda):** 
   * **Masalah:** Saat ini, jika *browser* di-*refresh*, jumlah Chamber yang tampil kembali menjadi 1 (default).
   * **Tindakan Lanjutan:** Telah didiskusikan dua solusi. Opsi 1 (menggunakan `LocalStorage` untuk mengingat klik user) atau Opsi 2 (Auto-fetch dari tabel `daftar_device` agar semua alat yang online langsung tampil). **Menunggu konfirmasi dari pengguna** mau pakai sistem yang mana.
2. **Integrasi Hardware (Tugas Pengguna):**
   * Menyematkan pembacaan limit switch syringe ke payload JSON pengiriman ESP.
   * Membuat ESP mengonsumsi tabel `commands` dan mengeksekusi pin relay/motor.
   * Panduan lengkapnya ada di file `to-do.md`.

---
*Catatan untuk AI/Assistant: Jika membaca file ini di sesi berikutnya, silakan langsung tanyakan kepada pengguna mengenai poin 3.1 (Persistensi State) untuk melanjutkan pekerjaan.*
