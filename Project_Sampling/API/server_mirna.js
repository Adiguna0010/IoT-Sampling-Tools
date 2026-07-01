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
    }
});

// ==========================================
// 2. POST /api/data (Sensor Data)
// ==========================================
app.post('/api/data', (req, res) => {
    const { device, suhu, kelembaban, tekanan, gas_metana } = req.body;
    
    if (!device || suhu === undefined) {
        return res.status(400).json({ status: "gagal", pesan: "Format data tidak valid" });
    }

    const query = 'INSERT INTO sensor_data (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(query, [device, 'sensor_rata_rata', suhu, kelembaban, tekanan, gas_metana], (err, results) => {
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
// 3. GET /api/data/latest (Ambil Data Terbaru)
// ==========================================
app.get('/api/data/latest', (req, res) => {
    const query = 'SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1';
    
    db.query(query, (err, results) => {
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