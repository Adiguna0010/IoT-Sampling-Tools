# Dokumentasi Sistem: IoT Sampling Tools (Smart Chamber)
**Tanggal Pembaruan Terakhir:** 2 Juli 2026

Dokumen ini berisi panduan teknis yang merangkum struktur direktori, skema *database*, dan daftar *API Endpoint* untuk mempermudah pengembangan atau pemeliharaan sistem di masa mendatang.

---

## 📁 1. Struktur Proyek (`D:\Apalah\Project_Sampling`)

Proyek ini dipisahkan menjadi dua bagian utama (Frontend & Backend):

```text
Project_Sampling/
│
├── API/                        # 🔙 BACKEND (Node.js)
│   └── server_mirna.js         # Script utama server API & koneksi MySQL
│
├── Website/                    # 🖥️ FRONTEND (HTML, CSS, JS)
│   ├── index.html              # Halaman Login
│   ├── dashboard.html          # Halaman Utama (Dashboard & Modal)
│   ├── style.css               # Gaya tampilan (Glassmorphism & Layout)
│   └── script.js               # Logika klien (Fetch API, Chart.js, Kontrol Modal)
│
├── dokumentasi_sistem.md       # File dokumentasi yang sedang Anda baca
├── resume.md                   # Catatan histori progres pengembangan
├── to-do.md                    # Daftar tugas integrasi ESP (Hardware)
└── UDAHMALAM.ino               # Source code program Arduino/ESP32 (C++)
```

---

## 🗄️ 2. Struktur Database MySQL (`iot_padi`)

Terdapat 5 tabel utama yang menjalankan seluruh ekosistem ini. Tabel 3, 4, dan 5 akan dibuat **secara otomatis** oleh Node.js jika belum ada di database.

### 1. `sensor_data` (Histori Nilai Sensor)
*   **Fungsi:** Menyimpan riwayat bacaan sensor dari tiap alat.
*   **Kolom Utama:** `id`, `nama_device` (contoh: Chamber 1), `suhu`, `kelembaban`, `tekanan`, `gas_metana`, `syringe_present` (0 = Kosong, 1 = Ada), `created_at`.

### 2. `commands` (Antrean Perintah Manual/Otomatis)
*   **Fungsi:** Menampung tugas yang dikirim oleh pengguna dari web. ESP akan membaca tabel ini untuk menggerakkan kipas/motor.
*   **Kolom Utama:** `id`, `chamber_id`, `command_name` (Kipas/Syringe), `command_value` (ON/OFF/UP/DOWN), `created_at`.

### 3. `daftar_device` (Manajemen Konektivitas)
*   **Fungsi:** Menyimpan daftar ESP yang terdaftar dan melacak apakah alat tersebut sedang *Online* atau *Offline*.
*   **Kolom Utama:** `chamber_id` (Primary Key), `status` (Online/Offline), `last_seen` (Terakhir kali mengirim data).

### 4. `schedules` (Penjadwalan Otomatis)
*   **Fungsi:** Menyimpan alarm tugas. Server (`server_mirna.js`) akan membacanya setiap 30 detik untuk mengeksekusi perintah pada waktu yang ditentukan.
*   **Kolom Utama:** `id`, `chamber_id`, `command_name`, `command_value`, `scheduled_time` (Format HH:MM), `last_executed`.

### 5. `users` (Manajemen Pengguna)
*   **Fungsi:** Menampung akun yang diperbolehkan *login* ke website.
*   **Kolom Utama:** `id`, `username`, `password`, `role` ('operator' atau 'user').

---

## 🔌 3. Daftar Endpoint API (`http://localhost:3000`)

Server Node.js mengekspos 10 *Endpoint API* berikut untuk komunikasi antara ESP dan Website:

### A. Autentikasi & Keamanan
1. **`POST /api/login`**
   *   **Fungsi:** Memverifikasi *username* & *password* dari halaman Login. Mengembalikan JSON berisi *role* pengguna.

### B. Komunikasi Alat (Dari ESP ke Server)
2. **`POST /api/data`**
   *   **Fungsi:** Menerima data JSON dari ESP. Otomatis menyimpan data ke `sensor_data` dan memperbarui stempel `last_seen` perangkat di `daftar_device` menjadi "Online".

### C. Penarikan Data (Dari Server ke Website)
3. **`GET /api/devices`**
   *   **Fungsi:** Menarik seluruh daftar Chamber beserta status koneksinya (Untuk tabel *Overview*).
4. **`GET /api/data/latest`**
   *   **Fungsi:** Menarik 1 baris data sensor yang paling mutakhir secara *global* (Untuk grafik utama).
5. **`GET /api/data/latest/:device`** *(Contoh: /api/data/latest/Chamber 1)*
   *   **Fungsi:** Menarik data sensor terkini spesifik milik satu alat (Untuk angka di Kartu Chamber, diperbarui tiap 3 detik).
6. **`GET /api/data/history/:device`**
   *   **Fungsi:** Menarik 30 riwayat data log terakhir alat tertentu (Untuk Grafik dan Tabel di Popup Detail).

### D. Eksekusi Perintah (Dari Website ke Server)
7. **`POST /api/commands`**
   *   **Fungsi:** Menyimpan perintah klik tombol dari Website (misal: Kipas ON) ke dalam tabel `commands`.

### E. Penjadwalan Waktu (Otomasi)
8. **`GET /api/schedules/:device`**
   *   **Fungsi:** Menarik semua daftar jadwal alarm milik alat tertentu untuk dirender di tabel tab Otomatis.
9. **`POST /api/schedules`**
   *   **Fungsi:** Menyimpan alarm jadwal baru yang diketikkan pengguna di web ke dalam *database*.
10. **`DELETE /api/schedules/:id`** *(Contoh: /api/schedules/5)*
    *   **Fungsi:** Menghapus jadwal spesifik (berdasarkan ID) saat pengguna menekan tombol tong sampah.

---
*Catatan: Pastikan XAMPP (MySQL) dan Node.js sudah berjalan sebelum mencoba API melalui Postman/Thunder Client.*
