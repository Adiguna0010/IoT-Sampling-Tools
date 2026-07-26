const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

app.use(express.json());

// ==========================================
// 1. KONEKSI KE DATABASE MYSQL (XAMPP LOCALHOST)
// ==========================================
const db = mysql.createConnection({
    host: 'localhost', // Menggunakan database di laptop Yang Mulia
    user: 'root',      
    password: '',      
    database: 'iot_padi' 
});

db.connect((err) => {
    if (err) {
        console.error('❌ Gagal terkoneksi ke MySQL:', err.message);
    } else {
        console.log('✅ Berhasil terhubung ke database MySQL!');
    }
});

// ==========================================
// 2. GET / (Menampilkan Live Dashboard Web)
// ==========================================
app.get('/', (req, res) => {
    // Pastikan file index.html berada di folder yang sama dengan server.js
    res.sendFile(__dirname + '/index.html');
});

// ==========================================
// 3. POST /api/data (Menangani Multi-Sensor & Tekanan dari ESP)
// ==========================================
app.post('/api/data', (req, res) => {
    const payload = req.body;

    // ERROR HANDLING: Pastikan JSON memiliki sensor_1 dan sensor_2
    if (!payload.sensor_1 || !payload.sensor_2) {
        return res.status(400).json({ 
            status: "gagal",
            pesan: "Data ditolak! Format JSON harus memiliki sensor_1 dan sensor_2." 
        });
    }

    // Ekstrak data dari JSON
    const deviceName = payload.device || "Unknown-Device";
    const s1 = payload.sensor_1;
    const s2 = payload.sensor_2;

    // Siapkan perintah untuk memasukkan 2 baris data sekaligus
    const query = 'INSERT INTO sensor_data_multi (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana) VALUES ?';
    
    // Susun datanya
    const values = [
        [deviceName, 'sensor_1', s1.suhu, s1.kelembaban, s1.tekanan, s1.gas_metana],
        [deviceName, 'sensor_2', s2.suhu, s2.kelembaban, s2.tekanan, s2.gas_metana]
    ];

    // Eksekusi tembakan ke database
    db.query(query, [values], (err, results) => {
        if (err) {
            console.error("❌ Gagal menyimpan data sensor:", err);
            return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan di database." });
        }
        
        console.log(`✅ 2 Baris data sukses disimpan dari ${deviceName}`);
        res.json({ status: "berhasil", pesan: "Data sensor berhasil masuk database!" });
    });
});

// ==========================================
// 4. POST /api/commands (Data Array + Real-time Timestamp)
// ==========================================
app.post('/api/commands', (req, res) => {
    const dataCommands = req.body;
    if (!Array.isArray(dataCommands)) return res.status(400).json({ status: "gagal" });

    // Tambahkan pengaman timeout
    const timeout = setTimeout(() => {
        if (!res.headersSent) res.status(504).json({ status: "gagal", pesan: "Server timeout!" });
    }, 5000); 

    const promises = dataCommands.map(item => {
        // Waktu Real-time (Waktu server saat data diterima)
        const realTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const query = 'INSERT INTO commands (chamber_id, command_name, command_value, created_at) VALUES (?, ?, ?, ?)';
        return new Promise((resolve, reject) => {
            db.query(query, [item.chamber_id, item.command_name, item.command_value, realTime], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    });

    Promise.all(promises)
        .then(() => {
            clearTimeout(timeout);
            console.log("✅ Data commands berhasil disimpan dengan waktu real-time.");
            if (!res.headersSent) res.json({ status: "berhasil", pesan: "Data riwayat perintah tersimpan" });
        })
        .catch(err => {
            clearTimeout(timeout);
            console.error("❌ Gagal simpan commands:", err);
            if (!res.headersSent) res.status(500).json({ status: "gagal", pesan: err.message });
        });
});

// ==========================================
// 5. GET /api/latest (Mengambil Data Terbaru untuk Dashboard)
// ==========================================
app.get('/api/latest', (req, res) => {
    // Perintah mengambil 1 data paling akhir dari tabel sensor yang baru
    const query = 'SELECT * FROM sensor_data_multi ORDER BY id DESC LIMIT 1';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("❌ Gagal mengambil data latest:", err);
            return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan saat mengambil data." });
        }
        
        // Kirim datanya kembali ke klien (web browser / Node-RED)
        res.json({ status: "sukses", data: results[0] || null });
    });
});

// ==========================================
// 6. MENYALAKAN SERVER
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Server menyala dan bersiap di http://localhost:${port}`);
});