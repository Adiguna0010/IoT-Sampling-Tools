const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

app.use(express.json());

// Tambahan CORS (Surat Izin) agar website (Frontend) bisa mengambil data
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// ==========================================
// 1. KONEKSI KE DATABASE MYSQL (LAPTOP MIRZA)
// ==========================================
const db = mysql.createConnection({
    host: '10.40.87.115', 
    user: 'root',      
    password: 'root123',      
    database: 'iot_padi' 
});

db.connect((err) => {
    if (err) {
        console.error('Gagal terkoneksi ke MySQL ❌', err.message);
    } else {
        console.log('Berhasil terhubung ke database MySQL! ✅');
        
        // Membuat tabel daftar_device otomatis jika belum ada
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS daftar_device (
                chamber_id VARCHAR(50) PRIMARY KEY,
                status VARCHAR(20) DEFAULT 'Offline',
                last_seen DATETIME
            )
        `;
        db.query(createTableQuery, (err) => {
            if (err) console.error("Gagal membuat tabel daftar_device:", err.message);
        });
        
        // Interval mengecek Offline (jika lebih dari 1 menit tidak kirim data)
        setInterval(() => {
            db.query("UPDATE daftar_device SET status='Offline' WHERE last_seen < NOW() - INTERVAL 1 MINUTE");
        }, 60000);
    }
});

// ==========================================
// 2. POST /api/data (Sensor Data)
// ==========================================
app.post('/api/data', (req, res) => {
    const { device, suhu, kelembaban, tekanan, gas_metana, syringe_present } = req.body;
    
    if (!device || suhu === undefined) {
        return res.status(400).json({ status: "gagal", pesan: "Format data tidak valid" });
    }

    // Registrasi/Update status device otomatis
    const upsertDevice = `INSERT INTO daftar_device (chamber_id, status, last_seen) VALUES (?, 'Online', NOW()) 
                          ON DUPLICATE KEY UPDATE status='Online', last_seen=NOW()`;
    db.query(upsertDevice, [device]);

    const query = 'INSERT INTO sensor_data (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana, syringe_present) VALUES (?, ?, ?, ?, ?, ?, ?)';
    
    db.query(query, [device, 'sensor_rata_rata', suhu, kelembaban, tekanan, gas_metana, syringe_present || 0], (err, results) => {
        if (err) {
            console.error('\n[❌] Gagal menyimpan ke MySQL:', err.message);
            return res.status(500).json({ status: "gagal", pesan: err.message });
        }
        
        console.log(`\n[✅] Data berhasil masuk dari device: ${device}`);
        console.log(`     - Suhu: ${suhu} | Kelembaban: ${kelembaban} | Tekanan: ${tekanan} | Gas: ${gas_metana}`);
        console.log('-'.repeat(60));
        
        res.json({ status: "berhasil", pesan: "Data tersimpan" });
    });
});

// ==========================================
// 3. GET /api/data/latest/:device (Ambil Data Terbaru Spesifik Device)
// ==========================================
app.get('/api/data/latest/:device', (req, res) => {
    const query = 'SELECT * FROM sensor_data WHERE nama_device = ? ORDER BY id DESC LIMIT 1';
    
    db.query(query, [req.params.device], (err, results) => {
        if (err) {
            console.error('\n[❌] Gagal mengambil data terbaru:', err.message);
            return res.status(500).json({ status: "gagal", pesan: err.message });
        }
        
        if (results.length > 0) {
            res.json({ status: "berhasil", data: results[0] });
        } else {
            res.json({ status: "berhasil", data: null, pesan: "Data masih kosong" });
        }
    });
});

// ==========================================
// API GET DEVICES (Untuk mengecek ketersediaan & status)
// ==========================================
app.get('/api/devices', (req, res) => {
    db.query('SELECT * FROM daftar_device', (err, results) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", data: results });
    });
});

// ==========================================
// API GET HISTORY (Untuk Log Activity)
// ==========================================
app.get('/api/data/history/:device', (req, res) => {
    const query = 'SELECT * FROM sensor_data WHERE nama_device = ? ORDER BY id DESC LIMIT 30';
    db.query(query, [req.params.device], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", data: results });
    });
});

// ==========================================
// 4. POST /api/commands (Data Array Mirza + Konversi Tanggal)
// ==========================================
app.post('/api/commands', (req, res) => {
    const dataCommands = req.body;
    if (!Array.isArray(dataCommands)) return res.status(400).json({ status: "gagal" });

    const promises = dataCommands.map(item => {
        // Konversi format tanggal menjadi YYYY-MM-DD HH:MM:SS dengan zona waktu lokal
        const dateValue = item.created_at ? new Date(item.created_at) : new Date();
        const tzoffset = dateValue.getTimezoneOffset() * 60000; // offset zona waktu dalam milidetik
        const formattedDate = new Date(dateValue.getTime() - tzoffset).toISOString().slice(0, 19).replace('T', ' ');

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
app.listen(port, '0.0.0.0', () => {
    console.log(`Server berjalan di http://0.0.0.0:${port} (Menerima koneksi dari semua IP)`);
});