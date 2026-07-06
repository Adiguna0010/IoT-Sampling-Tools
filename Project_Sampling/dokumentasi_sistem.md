# 📖 Buku Panduan Sistem: IoT Smart Chamber

**Diperbarui pada:** 6 Juli 2026

Buku panduan ini disusun khusus untuk **semua kalangan**. Kami membagi dokumen ini menjadi 3 bagian agar dapat dipahami sesuai dengan latar belakang pembacanya: Orang Awam, Teknisi Lapangan/Jaringan, dan Programmer.

---

## 🟢 BAGIAN 1: UNTUK ORANG AWAM (PENGGUNA UMUM)
*Baca bagian ini jika Anda hanya ingin tahu apa fungsi alat ini dan bagaimana gambaran besar cara kerjanya.*

**Apa itu IoT Smart Chamber?**
Bayangkan Anda memiliki sebuah kotak kaca (Chamber) untuk penelitian tanaman atau gas. Anda ingin tahu suhu dan kadar gas di dalamnya setiap detik, dan Anda juga ingin bisa menyalakan kipas di dalamnya tanpa harus berjalan ke luar rumah. Sistem inilah solusinya!

**Bagaimana Cara Kerjanya?**
Sistem ini membagi tugasnya kepada 3 peran sederhana:
1. **Pekerja Lapangan (Alat Fisik / ESP32):** Alat yang dipasang di dalam kotak (Chamber). Tugasnya mencatat suhu dan gas, lalu melaporkannya ke komputer pusat setiap saat. Ia juga punya tangan mekanik (Motor Syringe dan Kipas) yang siap bergerak jika disuruh.
2. **Otak & Ingatan (Server Komputer):** Komputer pusat yang menerima laporan dari para "Pekerja Lapangan". Otak ini mengingat semua laporan di buku catatannya (Database) agar tidak hilang.
3. **Layar Remote Control (Website):** Ini adalah layar di HP atau laptop Anda. Layar ini menampilkan laporan dari "Otak" berupa grafik yang indah. Di sini juga terdapat tombol-tombol. Jika Anda menekan tombol "Nyalakan Kipas", layar akan memberitahu Otak, lalu Otak akan menyuruh Pekerja Lapangan untuk memutar kipas tersebut.

---

## 🟡 BAGIAN 2: UNTUK TEKNISI (HARDWARE & NETWORKING)
*Baca bagian ini jika Anda bertugas memasang alat fisik, merakit jaringan, atau menangani masalah konektivitas server.*

**1. Topologi Jaringan & Komunikasi**
*   **Alat ESP32** harus terhubung ke jaringan *WiFi* yang memiliki akses ke alamat IP Server.
*   Protokol yang digunakan oleh ESP32 untuk mengirim data sensor adalah **HTTP POST Request** (mengirim file JSON berisi data suhu, gas, dll).
*   Protokol ESP32 untuk menerima perintah bukanlah *real-time push*. Melainkan, setelah ESP32 sukses mengirim data HTTP POST, ia akan membaca balasan (Response) dari Server. Jika di dalam balasan itu ada selipan perintah (misal: `"command_value": "1"`), maka Relay/Motor akan langsung dieksekusi.

**2. Arsitektur Komponen Server**
*   **Database (MySQL):** Berjalan di atas aplikasi XAMPP (Port standar 3306). Menyimpan log ratusan ribu baris data.
*   **Backend (Node.js):** Harus dijalankan lewat terminal/CMD di komputer server. Berjalan pada port `3000`. Jika server ini mati, alat tidak akan bisa mengirim data dan Website akan menampilkan status *Offline*.

**3. Trouble-shooting Cepat:**
*   **Jika Website menampilkan "Offline":** Berarti ESP32 mati, atau WiFi ESP32 putus, atau IP Server berubah sehingga ESP32 salah alamat.
*   **Jika Kipas Ditekan tapi Tidak Menyala:** Pastikan Relay kipas tersambung dengan benar ke Pin ESP32. Pastikan perintah dari server tidak terhalang *Firewall* jaringan (Matikan Windows Defender Firewall di Komputer Server jika diperlukan).

---

## 🔴 BAGIAN 3: UNTUK PROGRAMMER (SOFTWARE DEVELOPER)
*Baca bagian ini jika Anda bertugas membaca, memodifikasi, atau mengembangkan kode aplikasi ini secara mendalam.*

Sistem ini menganut standar arsitektur *3-Tier* yang digabungkan dengan komunikasi *Real-Time* menggunakan *WebSocket*. Berikut adalah bedah sistem yang mendalam agar Anda dapat memahami alur *coding* secara penuh:

### 1. Struktur & Ekosistem Folder
```text
Project_Sampling/
├── API/
│   ├── server_mirna.js         # Entry point NodeJS (Logic API, Webhook ESP, & Socket.io)
│   ├── package.json            # Dependencies (express, mysql2, socket.io, cors)
├── Website/
│   ├── index.html              # Entry point UI (Login screen)
│   ├── dashboard.html          # View Dashboard utama (DOM dimanipulasi oleh script.js)
│   ├── style.css               # Styling Vanilla CSS (Glassmorphism, Variables)
│   ├── script.js               # Core logic Klien (Fetch, Chart.js, Socket Client)
├── sketch_jul4a.ino            # Kode sumber Firmware ESP32 (C/C++ Arduino)
```

### 2. Skema & Auto-Migration Database (MySQL)
Database yang digunakan bernama `iot_padi`. Kode Node.js memiliki fungsi *Self-Healing Schema*; ketika `server_mirna.js` dijalankan, ia mengeksekusi `CREATE TABLE IF NOT EXISTS` sehingga *database* akan membangun dirinya sendiri tanpa perlu *import* file SQL.

**Daftar Tabel Penting:**
1. **`sensor_data`**: Tabel log raksasa (*append-only*). Menyimpan aliran data suhu, kelembaban, tekanan, dan gas metana. Diberi indeks pada kolom `created_at` untuk mempercepat proses *query* grafik.
2. **`commands`**: Berperan sebagai **Message Broker / Queue Table** (Tabel Antrean). Saat *User* mengeklik tombol dari web, perintah (seperti Kipas=1) di-insert ke sini. Saat ESP32 melakukan *ping* POST, Node.js menarik baris dari tabel ini, mengirimkannya sebagai JSON `response` ke ESP32, lalu **menghapus baris tersebut (DELETE)** agar tidak dieksekusi berulang kali.
3. **`daftar_device`**: *Registry* alat (Chamber 1, Chamber 2, dst). Memiliki kolom `last_seen`. Kapanpun Node.js menerima data dari Chamber tersebut, `last_seen` diperbarui ke jam saat ini (NOW()). Website akan melabeli alat "Offline" jika `last_seen` tertinggal lebih dari 5 menit dari waktu saat ini.
4. **`schedules`**: Tabel penyimpanan baris penjadwalan otomatis (*CRON Job DB*).

### 3. Komunikasi Dua Arah (Socket.io vs HTTP REST)
Sistem ini menggunakan **Hybrid Communication**:
*   **ESP32 ke Server (Murni HTTP REST):**
    ESP32 *TIDAK* menggunakan MQTT atau WebSocket. ESP32 mengandalkan metode `HTTP POST /api/data` setiap beberapa detik. Hal ini dipilih agar manajemen memori di ESP32 ringan dan toleran terhadap koneksi internet yang putus-nyambung. Server Node.js menangkap *request* ini, mem-parsing datanya, dan menyimpannya ke MySQL.
*   **Server ke Klien / Website (Murni WebSocket):**
    Pada versi lama, website melakukan `setInterval` HTTP GET setiap 3 detik. Pendekatan usang ini membebani memori (*memory leak*) browser dan server. Saat ini, kita memakai **Socket.io**.
    Begitu *router* `/api/data` milik Node.js selesai menyimpan data ESP ke MySQL, ia langsung menembakkan instruksi `io.emit('newData', data)` ke seluruh Browser yang sedang membuka halaman dashboard. File `script.js` Klien memiliki *listener* `socket.on('newData')` yang langsung memperbarui teks suhu dan menggeser titik grafik (*Chart.js*) tanpa proses memuat ulang HTTP sama sekali.

### 4. Arsitektur Firmware ESP32 (FreeRTOS Dual-Core)
Kode `sketch_jul4a.ino` berjalan di ESP32 (Chip *Dual-Core*). Kita membagi tugas secara paksa (*pin-to-core*) menggunakan library *FreeRTOS*:
*   **Core 0 (Task Sensor & WiFi):** Bertugas membaca sensor BME dan MQ, menyusun paket JSON, dan melakukan HTTP POST ke Node.js secara rekursif (*looping* terus menerus tanpa blokade). Saat Core 0 menerima respon HTTP dari server, ia akan mem-*parsing* respon tersebut mencari *string* `"command_value":"1"`, dan mengeksekusi fungsi lokal `prosesPerintah()`.
*   **Core 1 (Task Hardware Controller):** Loop bawaan Arduino `loop()` berjalan di sini. Bertugas mengeksekusi instruksi motor *stepper* tinggi presisi (menarik *syringe*) menggunakan sinyal *Pulse* digital. Karena terpisah di Core 1, gerakan motor akan sangat mulus tanpa terinterupsi jeda *loading WiFi* di Core 0.

### 5. Detail Mekanisme Keamanan & Proxy Cuaca
*   **Proxy API Cuaca:** Frontend Website tidak dibolehkan menembak langsung URL *Open-Meteo* (`https://api.open-meteo.com/v1/...`). Hal ini dilakukan karena kebijakan *CORS* (Cross-Origin) browser, atau gangguan dari *Ad-Blocker/Firewall* perusahaan. Solusinya, JS Frontend hanya memanggil endpoint lokal `http://localhost:3000/api/weather`. Node.js di server akan bertindak sebagai agen perantara (Proxy) yang mengambil data asli dari Open-Meteo menggunakan `fetch()` lalu menampilkannya utuh kembali ke klien.
*   **Local Storage Threshold:** Fitur "Ambang Batas" (berkedip merah jika suhu tinggi) *tidak dievaluasi di sisi server*, melainkan dievaluasi di sisi *Browser (Klien)*. Ambang batas yang disetel pengguna akan disimpan dalam `localStorage` Browser. Keuntungannya: Tidak menambah beban komputasi server.

### 6. Panduan Merilis (Deploy) ke Server VPS
Jika Anda akan memindahkan kode Node.js ini ke *Cloud Server* (AWS, Niagahoster, dsb):
1. Ubah variabel `http://localhost:3000` pada seluruh *fetch request* di dalam `Website/script.js` menjadi *Public IP* atau *Domain Name* mesin VPS Anda (Contoh: `https://api.domain.com`).
2. Instal Node.js dan PM2 (`npm install -g pm2`) di server Linux.
3. Jalankan menggunakan perintah `pm2 start API/server_mirna.js --name "backend-chamber"`. PM2 menjamin *server backend* akan hidup otomatis jika OS VPS di-*restart*.
4. *Host* folder `Website/` menggunakan Nginx/Apache sebagai *Static Web Server*. Pastikan Anda menunjuk *Directory Root* ke letak folder website.
