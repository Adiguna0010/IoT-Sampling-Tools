const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

app.use(express.json());

// ==========================================
// 1. KONEKSI KE DATABASE MYSQL (LAPTOP MIRZA)
// ==========================================
const db = mysql.createConnection({
    host: '10.5.24.253', 
    user: 'root',      
    password: 'root123',      
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
// 2. POST /api/data (Sensor Data)
// ==========================================
app.post('/api/data', (req, res) => {
    const { suhu, kelembaban, gas_metana } = req.body;
    if (!suhu || !kelembaban || !gas_metana) return res.status(400).json({ status: "gagal" });

    const query = 'INSERT INTO sensor_data (suhu, kelembaban, gas_metana) VALUES (?, ?, ?)';
    db.query(query, [suhu, kelembaban, gas_metana], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", id: results.insertId });
    });
});

// ==========================================
// 3. POST /api/commands (Data Array Mirza + Konversi Tanggal)
// ==========================================
app.post('/api/commands', (req, res) => {
    const dataCommands = req.body;
    if (!Array.isArray(dataCommands)) return res.status(400).json({ status: "gagal" });

    const promises = dataCommands.map(item => {
        // Konversi format tanggal menjadi YYYY-MM-DD HH:MM:SS
        const formattedDate = new Date(item.created_at).toISOString().slice(0, 19).replace('T', ' ');

        const query = 'INSERT INTO commands (chamber_id, command_name, command_value, created_at) VALUES (?, ?, ?, ?)';
        return new Promise((resolve, reject) => {
            db.query(query, [item.chamber_id, item.command_name, item.command_value, formattedDate], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    });

    Promise.all(promises)
        .then(() => res.json({ status: "berhasil", pesan: "Data tersimpan" }))
        .catch(err => res.status(500).json({ status: "gagal", pesan: err.message }));
});

// ==========================================
// 4. MENYALAKAN SERVER
// ==========================================
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});