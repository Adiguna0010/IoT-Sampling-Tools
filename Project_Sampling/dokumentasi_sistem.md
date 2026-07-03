# Dokumentasi Sistem: IoT Sampling Tools (Smart Chamber)
**Tanggal Pembaruan Terakhir:** 3 Juli 2026

Dokumen ini adalah **Panduan Serah Terima (Handover Document)** untuk pengembang selanjutnya. Dokumen ini merangkum arsitektur, skema *database*, daftar *API Endpoint*, serta panduan *deployment* (hosting) agar programmer selanjutnya dapat memahami seluruh ekosistem tanpa kebingungan.

---

## 🏛️ 1. Arsitektur Aplikasi (3-Tier)

Aplikasi ini menggunakan standar industri *3-Tier Architecture* (Klien, Server, Database):

1. **Frontend (Klien):** Berupa file statis (HTML, CSS, Vanilla JS). Berfungsi sebagai wajah (*dashboard*) yang dapat merender pembaruan grafik dan angka secara real-time setiap 3 detik.
2. **Backend (Server):** Berbasis **Node.js** dengan *framework* **Express.js**. Berfungsi sebagai *otak* yang menangani otentikasi, menarik data dari ESP, dan mengeksekusi otomatisasi jadwal setiap 30 detik.
3. **Database:** Berbasis **MySQL** yang menyimpan log sensor, jadwal, dan akun pengguna.

```text
Project_Sampling/
│
├── API/                        # 🔙 BACKEND
│   └── server_mirna.js         # Inti server Node.js (API REST & Webhook)
│
├── Website/                    # 🖥️ FRONTEND
│   ├── index.html              # Halaman Login
│   ├── dashboard.html          # Dashboard Utama (Cards, Settings, Modals)
│   ├── style.css               # Desain UI (Responsive & Glassmorphism)
│   └── script.js               # Logika Klien (Real-time Fetch, Promise.all, Chart.js)
│
├── Database/                   # 💾 DATABASE
│   └── (File SQL jika ada)
│
├── dokumentasi_sistem.md       # Dokumentasi Utama
├── resume.md                   # Catatan histori progres
├── to-do.md                    # Daftar tugas ESP
└── UDAHMALAM.ino               # Source code C++ untuk ESP32
```

---

## 🗄️ 2. Skema Database MySQL (`iot_padi`)

Backend memiliki kemampuan **Self-Healing / Auto-Migrate**. Artinya, jika tabel tertentu (seperti `users` atau kolom baru) belum ada, `server_mirna.js` akan otomatis membuatnya saat pertama kali dijalankan (cek blok *Patch/Migration* di awal kode server).

### 1. `sensor_data` (Data Log Sensor)
*   **Fungsi:** Menyimpan riwayat masif bacaan dari tiap ESP.
*   **Struktur Utama:** `id`, `nama_device` (Chamber 1), `suhu`, `kelembaban`, `tekanan`, `gas_metana`, `syringe_present` (0/1), `created_at`.

### 2. `commands` (Antrean Perintah Hardware)
*   **Fungsi:** Antrean instruksi. Web memasukkan perintah ke sini, lalu ESP menarik dan menghapusnya setelah dieksekusi.
*   **Struktur Utama:** `id`, `chamber_id`, `command_name` (Kipas/Syringe), `command_value` (ON/OFF/UP/D), `created_at`.

### 3. `daftar_device` (Registry Konektivitas)
*   **Fungsi:** Mencatat alat yang pernah terhubung dan status koneksinya (Batas toleransi offline = 5 menit).
*   **Struktur Utama:** `chamber_id` (PK), `status` (Online/Offline), `last_seen`.

### 4. `schedules` (Penjadwalan Waktu Otomatis)
*   **Fungsi:** Penyimpanan alarm. `server_mirna.js` melakukan *polling* ke tabel ini setiap 30 detik untuk mengeksekusi alat jika jam saat ini cocok dengan `scheduled_time`.
*   **Struktur Utama:** `id`, `chamber_id`, `command_name`, `command_value`, `scheduled_time` (HH:MM), `last_executed`.

### 5. `users` (Otentikasi Akun)
*   **Fungsi:** Menyimpan akun dengan level otorisasi yang berbeda. Sandi saat ini masih disimpan secara statis/plaintext (disarankan migrasi ke Bcrypt jika rilis ke publik).
*   **Struktur Utama:** `id`, `username`, `password`, `role` ('master_admin', 'operator', 'user'), `is_approved` (0/1).

---

## 🔌 3. Endpoint API Lengkap (`http://localhost:3000`)

### A. Autentikasi & Akun
*   **`POST /api/login`**: Verifikasi login (menghasilkan *role*, *is_approved*).
*   **`POST /api/register`**: Mendaftar akun baru (otomatis berstatus Pending/`is_approved=0`).
*   **`PUT /api/users/change-password`**: Mengganti sandi mandiri (butuh sandi lama).
*   **`GET /api/users`**: Mengambil daftar seluruh user *(Master Admin Only)*.
*   **`PUT /api/users/:id/approve`**: Menyetujui user baru *(Master Admin)*.
*   **`PUT /api/users/:id/role`**: Mengubah pangkat/role user *(Master Admin)*.
*   **`PUT /api/users/:id/reset-password`**: Reset sandi paksa ke "12345" *(Master Admin)*.
*   **`DELETE /api/users/:id`**: Menghapus akun *(Master Admin)*.

### B. Lalu Lintas Sensor & Kontrol
*   **`POST /api/data`**: Menerima JSON dari ESP32, otomatis update `last_seen` ke Online, dan mengecek `commands`.
*   **`GET /api/data/latest/:device`**: Penarikan 1 data terbaru untuk satu Chamber (dipanggil web setiap 3 detik).
*   **`GET /api/data/history/:device`**: Menarik 30 baris terakhir untuk di-render di tabel Log dan Chart Modal Detail.
*   **`POST /api/commands`**: Mengirim (insert) tugas dari tombol web ke tabel antrean.

### C. Analitik, Export & Kesehatan Server
*   **`GET /api/system/health`**: Diagnostic API. Menarik RAM sisa, penggunaan CPU, OS, Uptime, Total User, dan Total Baris Data.
*   **`GET /api/export`**: (Query params: `chamber`, `start`, `end`). Mengambil JSON data mentah berkapasitas besar untuk di-convert menjadi CSV di *client-side*.
*   **`DELETE /api/database/clean`**: (Query params: `days`). Menghapus seluruh baris di `sensor_data` yang berumur di atas hari yang ditentukan.

### D. Penjadwalan (Automation)
*   **`GET /api/schedules/:device`**: Mengambil jadwal untuk di-*render* di Modal Jadwal.
*   **`POST /api/schedules`**: Menyimpan jadwal baru.
*   **`DELETE /api/schedules/:id`**: Menghapus jadwal.

---

## 🚀 4. Panduan *Hosting* / *Deployment* (Production)

Jika sistem ini hendak dinaikkan ke internet global (VPS), ikuti aturan berikut:

1. **Persiapan di Kode (Wajib):**
   * Buka `Website/script.js`.
   * Lakukan "Find and Replace" (Ctrl+H) untuk semua kata `http://localhost:3000`.
   * Ganti dengan nama domain atau IP VPS tempat *backend* berada (misal: `https://api.domainkamu.com`).
2. **Kebutuhan Server (VPS):**
   * **Node.js & PM2:** *Backend* (`server_mirna.js`) harus dijalankan menggunakan Process Manager seperti PM2 (`pm2 start server_mirna.js`). Jangan gunakan `node` biasa karena server akan mati saat terminal SSH ditutup.
   * **Nginx/Apache:** Folder `Website` harus dilayani oleh Web Server statis (Nginx) agar file `index.html` dapat diakses pengguna.
   * **MySQL:** Impor struktur *database* ke MySQL di VPS, lalu ubah username/password di dalam file `server_mirna.js` (baris 13-17) agar sesuai dengan konfigurasi VPS.

---

## 🛠️ 5. Catatan Logika *Frontend* (`script.js`)

Bagi programmer selanjutnya, perhatikan fitur unik di *Frontend*:
* **Asynchronous Polling (Promise.all):** Fungsi `fetchData()` dijalankan setiap 3 detik oleh `setInterval`. Untuk menghindari penumpukan request jaringan jika ada 10 Chamber, kode mengambil data secara paralel menggunakan `Promise.all`.
* **Global Aggregate Chart:** Grafik utama pada *Dashboard* **bukanlah** grafik 1 alat, melainkan kalkulasi **Rata-Rata (Average)** dari seluruh Chamber aktif yang terkoneksi.
* **Dynamic Table Insertion:** Tabel *Log Activity* di dalam Detail Chamber menggunakan logika penyisipan baris di posisi pertama (`insertBefore`) dan menghapus baris terbawah jika sudah > 30 baris. Ini menjaga performa *browser* agar tidak mem-parsing ulang tabel keseluruhan.
