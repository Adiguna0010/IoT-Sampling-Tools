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

        // Patch: Re-create tabel commands agar strukturnya benar (VARCHAR 50)
        db.query("DROP TABLE IF EXISTS commands", () => {
            const createCmdQuery = `
                CREATE TABLE commands (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    chamber_id VARCHAR(50),
                    command_name VARCHAR(50),
                    command_value VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            db.query(createCmdQuery, (err) => {
                if (err) console.error("Gagal membuat ulang tabel commands:", err.message);
            });
        });

        // Membuat tabel schedules untuk fitur otomatis/terjadwal
        const createScheduleQuery = `
            CREATE TABLE IF NOT EXISTS schedules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chamber_id VARCHAR(50),
                command_name VARCHAR(50),
                command_value VARCHAR(50),
                scheduled_time VARCHAR(5),
                last_executed DATE
            )
        `;
        db.query(createScheduleQuery, (err) => {
            if (err) console.error("Gagal membuat tabel schedules:", err.message);
        });

        // Membuat tabel users untuk sistem Login Profesional
        const createUsersQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE,
                password VARCHAR(255),
                role VARCHAR(20)
            )
        `;
        db.query(createUsersQuery, (err) => {
            if (!err) {
                // Memasukkan akun default jika tabel masih kosong
                db.query("SELECT COUNT(*) AS cnt FROM users", (err, rows) => {
                    if (rows[0].cnt === 0) {
                        db.query("INSERT INTO users (username, password, role) VALUES ('operator', 'admin123', 'operator'), ('tamu', 'user123', 'user')");
                    }
                });
            }
        });

        // Menambahkan kolom syringe_present ke sensor_data secara otomatis (Jika belum ada)
        db.query("SHOW COLUMNS FROM sensor_data LIKE 'syringe_present'", (err, results) => {
            if (err) {
                console.error("Gagal mengecek kolom syringe_present:", err.message);
            } else if (results.length === 0) {
                // Kolom belum ada, mari kita tambahkan
                db.query("ALTER TABLE sensor_data ADD COLUMN syringe_present INT DEFAULT 0", (err2) => {
                    if (err2) console.error("Gagal menambah kolom syringe_present:", err2.message);
                    else console.log("Kolom 'syringe_present' berhasil ditambahkan otomatis ke tabel sensor_data! ✅");
                });
            }
        });
        
        // Interval mengecek Offline (jika lebih dari 1 menit tidak kirim data)
        setInterval(() => {
            db.query("UPDATE daftar_device SET status='Offline' WHERE last_seen < NOW() - INTERVAL 1 MINUTE");
        }, 60000);

        // Interval mengecek Jadwal Otomatis (Setiap 30 detik)
        setInterval(() => {
            const now = new Date();
            const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const currentDateStr = now.toISOString().split('T')[0]; // Format YYYY-MM-DD

            const checkQuery = `SELECT * FROM schedules WHERE scheduled_time = ? AND (last_executed != ? OR last_executed IS NULL)`;
            db.query(checkQuery, [currentHHMM, currentDateStr], (err, results) => {
                if (err) return;
                results.forEach(schedule => {
                    // Eksekusi perintah (Masukkan ke tabel commands)
                    const insertCmd = 'INSERT INTO commands (chamber_id, command_name, command_value) VALUES (?, ?, ?)';
                    db.query(insertCmd, [schedule.chamber_id, schedule.command_name, schedule.command_value], (err2) => {
                        if (!err2) {
                            // Update last_executed agar tidak dieksekusi berulang kali pada menit yang sama
                            db.query("UPDATE schedules SET last_executed = ? WHERE id = ?", [currentDateStr, schedule.id]);
                            console.log(`[⏰ OTOMATIS] Menjalankan ${schedule.command_name} ${schedule.command_value} untuk ${schedule.chamber_id} pada ${currentHHMM}`);
                        }
                    });
                });
            });
        }, 30000);
    }
});

// ==========================================
// 2. POST /api/login (Autentikasi Profesional)
// ==========================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan server" });
        
        if (results.length > 0) {
            res.json({ status: "berhasil", role: results[0].role, username: results[0].username });
        } else {
            res.status(401).json({ status: "gagal", pesan: "Username atau Password salah!" });
        }
    });
});

app.get('/api/debug-db', (req, res) => {
    db.query('DESCRIBE commands', (err, rows) => {
        if (err) return res.json(err);
        res.json(rows);
    });
});

// ==========================================
// 3. POST /api/data (Menerima Data dari ESP & Mengirim Perintah)
// ==========================================
app.post('/api/data', (req, res) => {
    const { device, suhu, kelembaban, tekanan, gas_metana, syringe_present } = req.body;
    
    if (!device || suhu === undefined) {
        return res.status(400).json({ status: "gagal", pesan: "Format data tidak valid" });
    }

    // 1. Registrasi/Update status device jadi Online
    const upsertDevice = `INSERT INTO daftar_device (chamber_id, status, last_seen) VALUES (?, 'Online', NOW()) 
                          ON DUPLICATE KEY UPDATE status='Online', last_seen=NOW()`;
    db.query(upsertDevice, [device]);

    // 2. Simpan Data Sensor
    const insertDataQuery = 'INSERT INTO sensor_data (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana, syringe_present) VALUES (?, ?, ?, ?, ?, ?, ?)';
    
    db.query(insertDataQuery, [device, 'sensor_rata_rata', suhu, kelembaban, tekanan, gas_metana, syringe_present || 0], (err, results) => {
        if (err) {
            console.error('\n[❌] Gagal menyimpan ke MySQL:', err.message);
            return res.status(500).json({ status: "gagal", pesan: err.message });
        }
        
        console.log(`\n[✅] Data berhasil masuk dari device: ${device}`);
        
        // 3. Cek apakah ada antrean perintah untuk device ini
        const checkCmdQuery = 'SELECT id, command_name, command_value FROM commands WHERE chamber_id = ? ORDER BY id ASC';
        db.query(checkCmdQuery, [device], (err3, cmds) => {
            if (err3 || cmds.length === 0) {
                // Tidak ada perintah
                return res.json({ status: "berhasil", pesan: "Data tersimpan", commands: [] });
            }

            // Jika ada perintah, hapus dari tabel lalu kirim ke ESP
            const cmdIds = cmds.map(c => c.id);
            const deleteCmdQuery = 'DELETE FROM commands WHERE id IN (?)';
            db.query(deleteCmdQuery, [cmdIds], () => {
                console.log(`[🚀] Mengirim ${cmds.length} perintah ke ${device}`);
                return res.json({ 
                    status: "berhasil", 
                    pesan: "Data tersimpan, mengirim instruksi", 
                    commands: cmds 
                });
            });
        });
    });
});

// ==========================================
// 3A. GET /api/data/latest (Ambil Data Terbaru Secara Umum)
// ==========================================
app.get('/api/data/latest', (req, res) => {
    const query = 'SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        if (results.length > 0) res.json({ status: "berhasil", data: results[0] });
        else res.json({ status: "berhasil", data: null, pesan: "Data masih kosong" });
    });
});

// ==========================================
// 3B. GET /api/data/latest/:device (Ambil Data Terbaru Spesifik Device)
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
// 6. POST /api/commands (Menyimpan Perintah Manual dari Web)
// ==========================================
app.post('/api/commands', (req, res) => {
    const commands = req.body;
    
    if (!Array.isArray(commands) || commands.length === 0) {
        return res.status(400).json({ status: "gagal", pesan: "Format perintah tidak valid" });
    }

    const query = 'INSERT INTO commands (chamber_id, command_name, command_value) VALUES ?';
    const values = commands.map(c => [c.chamber_id, c.command_name, c.command_value]);

    db.query(query, [values], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        res.json({ status: "berhasil", pesan: "Perintah berhasil disimpan" });
    });
});

// ==========================================
// 7. API SCHEDULES (Otomasi Terjadwal)
// ==========================================
app.get('/api/schedules/:device', (req, res) => {
    db.query('SELECT * FROM schedules WHERE chamber_id = ? ORDER BY scheduled_time ASC', [req.params.device], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        res.json({ status: "berhasil", data: results });
    });
});

app.post('/api/schedules', (req, res) => {
    const { chamber_id, command_name, command_value, scheduled_time } = req.body;
    if (!chamber_id || !command_name || !scheduled_time) {
        return res.status(400).json({ status: "gagal", pesan: "Data jadwal tidak lengkap" });
    }
    const query = 'INSERT INTO schedules (chamber_id, command_name, command_value, scheduled_time) VALUES (?, ?, ?, ?)';
    db.query(query, [chamber_id, command_name, command_value, scheduled_time], (err) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        res.json({ status: "berhasil", pesan: "Jadwal berhasil ditambahkan" });
    });
});

app.delete('/api/schedules/:id', (req, res) => {
    db.query('DELETE FROM schedules WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        res.json({ status: "berhasil", pesan: "Jadwal berhasil dihapus" });
    });
});

// ==========================================
// 4. MENYALAKAN SERVER
// ==========================================
app.listen(port, '0.0.0.0', () => {
    console.log(`Server berjalan di http://0.0.0.0:${port} (Menerima koneksi dari semua IP)`);
});