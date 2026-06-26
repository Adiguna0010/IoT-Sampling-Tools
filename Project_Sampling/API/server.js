const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

app.use(express.json());

// ==========================================
// 1. KONEKSI KE DATABASE MYSQL
// ==========================================
// Catatan: Kredensial disesuaikan dengan Database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'iot_padi' 
});

db.connect((err) => {
    if (err) {
        console.error('Gagal terkoneksi ke MySQL ❌', err.message);
    } else {
        console.log('Berhasil terhubung ke database MySQL! ✅');
    }
});

// ==========================================
// 2. POST /api/data (Menyimpan Data & Error Handling)
// ==========================================
app.post('/api/data', (req, res) => {
    const { suhu, kelembaban, gas_metana } = req.body;

    // ERROR HANDLING 1: Validasi kelengkapan data dari sensor
    if (!suhu || !kelembaban || !gas_metana) {
        return res.status(400).json({ 
            status: "gagal",
            pesan: "Data tidak lengkap! Pastikan suhu, kelembaban, dan gas_metana terisi." 
        });
    }

    // Perintah memasukkan data ke tabel
    const query = 'INSERT INTO sensor_data (suhu, kelembaban, gas_metana) VALUES (?, ?, ?)';
    
    db.query(query, [suhu, kelembaban, gas_metana], (err, results) => {
        // ERROR HANDLING 2: Jika MySQL gagal menyimpan
        if (err) {
            console.error("Gagal menyimpan ke database:", err);
            return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan di server database." });
        }
        
        console.log("Data disimpan ke MySQL:", { id: results.insertId, suhu, kelembaban, gas_metana });
        res.json({ status: "berhasil", pesan: "Data berhasil disimpan di MySQL", id_data: results.insertId });
    });
});

// ==========================================
// 3. GET /api/latest (Mengambil Data Terbaru untuk Dashboard)
// ==========================================
app.get('/api/latest', (req, res) => {
    // Perintah mengambil 1 data paling akhir (ID terbesar)
    const query = 'SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Gagal mengambil data:", err);
            return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan saat mengambil data." });
        }
        
        // Kirim datanya kembali ke klien
        res.json({ status: "sukses", data: results[0] || null });
    });
});

// Menyalakan server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});