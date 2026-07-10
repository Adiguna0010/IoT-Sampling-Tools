require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const port = process.env.PORT || 3000;

app.use(express.json());

// Tambahan CORS (Surat Izin) agar website (Frontend) bisa mengambil data
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// ==========================================
// 1. KONEKSI KE DATABASE MYSQL (LAPTOP MIRZA / CLOUD ONLINE)
// ==========================================
const isProduction = !!process.env.DB_HOST;
const db = isProduction 
    ? mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',      
        password: process.env.DB_PASSWORD || '',      
        database: process.env.DB_NAME || 'iot_padi',
        ssl: { rejectUnauthorized: false },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      })
    : mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'root',      
        password: '',      
        database: 'iot_padi' 
      });

function initializeDatabaseSchema(connectionOrPool) {
    console.log("Inisialisasi skema database... 🛠️");

    // 1. Membuat tabel daftar_device otomatis jika belum ada
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS daftar_device (
            chamber_id VARCHAR(50) PRIMARY KEY,
            status VARCHAR(20) DEFAULT 'Offline',
            last_seen DATETIME
        )
    `;
    connectionOrPool.query(createTableQuery, (err) => {
        if (err) console.error("[❌] Gagal membuat tabel daftar_device:", err.message);
    });

    // 2. Membuat/memastikan tabel commands ada (tidak menggunakan DROP TABLE di serverless/production startup)
    const createCmdQuery = `
        CREATE TABLE IF NOT EXISTS commands (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chamber_id VARCHAR(50),
            command_name VARCHAR(50),
            command_value VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    connectionOrPool.query(createCmdQuery, (err) => {
        if (err) console.error("[❌] Gagal membuat tabel commands:", err.message);
    });

    // 3. Membuat tabel schedules untuk fitur otomatis/terjadwal
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
    connectionOrPool.query(createScheduleQuery, (err) => {
        if (err) console.error("[❌] Gagal membuat tabel schedules:", err.message);
    });

    // 4. Membuat tabel users untuk sistem Login Profesional
    const createUsersQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE,
            password VARCHAR(255),
            role VARCHAR(20)
        )
    `;
    connectionOrPool.query(createUsersQuery, (err) => {
        if (!err) {
            // Memasukkan akun default jika tabel masih kosong
            connectionOrPool.query("SELECT COUNT(*) AS cnt FROM users", (errRows, rows) => {
                if (!errRows && rows && rows[0] && rows[0].cnt === 0) {
                    connectionOrPool.query("INSERT INTO users (username, password, role) VALUES ('operator', 'admin123', 'operator'), ('tamu', 'user123', 'user')", (errInsert) => {
                        if (errInsert) console.error("[❌] Gagal memasukkan user default:", errInsert.message);
                    });
                }
            });
        } else {
            console.error("[❌] Gagal membuat tabel users:", err.message);
        }
    });

    // 5. Patch: Update tabel users untuk mendukung Master Admin & Persetujuan Login
    connectionOrPool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50)", (err) => {
        if (err) console.log("Note: Gagal modify column role (mungkin sudah sesuai):", err.message);
        
        connectionOrPool.query("SHOW COLUMNS FROM users LIKE 'is_approved'", (errCol, results) => {
            if (!errCol && results && results.length === 0) {
                connectionOrPool.query("ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT FALSE", (errAdd) => {
                    if (!errAdd) {
                        connectionOrPool.query("UPDATE users SET is_approved = TRUE");
                        connectionOrPool.query("INSERT IGNORE INTO users (username, password, role, is_approved) VALUES ('master', 'master123', 'master_admin', TRUE)");
                    } else {
                        console.error("[❌] Gagal menambah kolom is_approved:", errAdd.message);
                    }
                });
            } else if (!errCol) {
                // Ensure master admin exists
                connectionOrPool.query("INSERT IGNORE INTO users (username, password, role, is_approved) VALUES ('master', 'master123', 'master_admin', TRUE)");
            }
        });
    });

    // 6. Membuat tabel sensor_data jika belum ada
    const createSensorDataQuery = `
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nama_device VARCHAR(100),
            nama_sensor VARCHAR(100),
            suhu FLOAT,
            kelembaban FLOAT,
            tekanan FLOAT,
            gas_metana INT,
            waktu_masuk DATETIME DEFAULT CURRENT_TIMESTAMP,
            syringe_status INT DEFAULT 0
        )
    `;
    connectionOrPool.query(createSensorDataQuery, (err) => {
        if (err) {
            console.error("[❌] Gagal membuat tabel sensor_data:", err.message);
        } else {
            // Menambahkan kolom syringe_present ke sensor_data secara otomatis (Jika belum ada)
            connectionOrPool.query("SHOW COLUMNS FROM sensor_data LIKE 'syringe_present'", (errCol, results) => {
                if (errCol) {
                    console.error("[❌] Gagal mengecek kolom syringe_present:", errCol.message);
                } else if (results && results.length === 0) {
                    connectionOrPool.query("ALTER TABLE sensor_data ADD COLUMN syringe_present INT DEFAULT 0", (errAdd) => {
                        if (errAdd) console.error("[❌] Gagal menambah kolom syringe_present:", errAdd.message);
                        else console.log("Kolom 'syringe_present' berhasil ditambahkan otomatis ke tabel sensor_data! ✅");
                    });
                }
            });
        }
    });
}

if (isProduction) {
    console.log('Menggunakan Pool Koneksi Database MySQL Aiven! ✅');
    // Jalankan inisialisasi skema di production pool
    initializeDatabaseSchema(db);

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
                const insertCmd = 'INSERT INTO commands (chamber_id, command_name, command_value) VALUES (?, ?, ?)';
                db.query(insertCmd, [schedule.chamber_id, schedule.command_name, schedule.command_value], (err2) => {
                    if (!err2) {
                        db.query("UPDATE schedules SET last_executed = ? WHERE id = ?", [currentDateStr, schedule.id]);
                        console.log(`[⏰ OTOMATIS] Menjalankan ${schedule.command_name} ${schedule.command_value} untuk ${schedule.chamber_id} pada ${currentHHMM}`);
                    }
                });
            });
        });
    }, 30000);
} else {
    db.connect((err) => {
        if (err) {
            console.error('Gagal terkoneksi ke MySQL ❌', err.message);
        } else {
            console.log('Berhasil terhubung ke database MySQL! ✅');
            // Jalankan inisialisasi skema di local connection
            initializeDatabaseSchema(db);
            
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
                        const insertCmd = 'INSERT INTO commands (chamber_id, command_name, command_value) VALUES (?, ?, ?)';
                        db.query(insertCmd, [schedule.chamber_id, schedule.command_name, schedule.command_value], (err2) => {
                            if (!err2) {
                                db.query("UPDATE schedules SET last_executed = ? WHERE id = ?", [currentDateStr, schedule.id]);
                                console.log(`[⏰ OTOMATIS] Menjalankan ${schedule.command_name} ${schedule.command_value} untuk ${schedule.chamber_id} pada ${currentHHMM}`);
                            }
                        });
                    });
                });
            }, 30000);
        }
    });
}

// ==========================================
// 2. POST /api/login (Autentikasi Profesional)
// ==========================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) {
            console.error("[❌] Gagal login ke database:", err.message);
            return res.status(500).json({ status: "gagal", pesan: "Terjadi kesalahan server" });
        }
        
        if (results.length > 0) {
            const user = results[0];
            if (!user.is_approved) {
                return res.status(403).json({ status: "gagal", pesan: "Akun belum disetujui oleh Master Admin!" });
            }
            res.json({ status: "berhasil", role: user.role, username: user.username });
        } else {
            res.status(401).json({ status: "gagal", pesan: "Username atau Password salah!" });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ status: "gagal", pesan: "Data tidak lengkap" });
    db.query("INSERT INTO users (username, password, role, is_approved) VALUES (?, ?, 'user', FALSE)", [username, password], (err) => {
        if (err) {
            console.error("[❌] Gagal register ke database:", err.message);
            return res.status(400).json({ status: "gagal", pesan: "Username mungkin sudah terdaftar." });
        }
        res.json({ status: "berhasil", pesan: "Berhasil mendaftar. Menunggu persetujuan Master Admin." });
    });
});

app.get('/api/data', (req, res) => {
    db.query("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 20", (err, results) => {
        if (err) {
            console.error("[❌] Gagal mengambil data sensor:", err.message);
            return res.status(500).json(err);
        }
        res.json(results);
    });
});

app.get('/api/export', (req, res) => {
    const { chamber, start, end } = req.query;
    let query = "SELECT * FROM sensor_data WHERE 1=1";
    let params = [];
    
    if (chamber && chamber !== 'all') {
        query += " AND nama_device = ?";
        params.push(chamber);
    }
    if (start) {
        query += " AND DATE(waktu_masuk) >= ?";
        params.push(start);
    }
    if (end) {
        query += " AND DATE(waktu_masuk) <= ?";
        params.push(end);
    }
    
    query += " ORDER BY id ASC";
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/users', (req, res) => {
    db.query("SELECT id, username, password, role, is_approved FROM users ORDER BY id DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.put('/api/users/:id/approve', (req, res) => {
    db.query("UPDATE users SET is_approved = TRUE WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", pesan: "Akun disetujui!" });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.query("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", pesan: "Akun dihapus!" });
    });
});

app.put('/api/users/:id/role', (req, res) => {
    const { role } = req.body;
    db.query("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id], (err) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", pesan: "Jabatan diubah!" });
    });
});

app.put('/api/users/:id/reset-password', (req, res) => {
    const newPass = "reset123";
    db.query("UPDATE users SET password = ? WHERE id = ?", [newPass, req.params.id], (err) => {
        if (err) return res.status(500).json({ status: "gagal" });
        res.json({ status: "berhasil", pesan: `Sandi di-reset menjadi: ${newPass}` });
    });
});

app.put('/api/users/change-password', (req, res) => {
    const { username, old_password, new_password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, old_password], (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: "Kesalahan server" });
        if (results.length === 0) return res.status(401).json({ status: "gagal", pesan: "Password lama salah!" });
        
        db.query("UPDATE users SET password = ? WHERE username = ?", [new_password, username], (err2) => {
            if (err2) return res.status(500).json({ status: "gagal", pesan: "Gagal menyimpan password baru" });
            res.json({ status: "berhasil", pesan: "Password berhasil diubah!" });
        });
    });
});

app.get('/api/system/health', (req, res) => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    db.query("SELECT COUNT(*) as total FROM sensor_data", (err, resData) => {
        db.query("SELECT COUNT(*) as total_users FROM users", (err2, resUser) => {
            const totalData = err ? 0 : resData[0].total;
            const totalUsers = err2 ? 0 : resUser[0].total_users;
            
            const freeMem = Math.round(os.freemem() / 1024 / 1024);
            const totalMem = Math.round(os.totalmem() / 1024 / 1024);
            const usedMem = totalMem - freeMem;
            const cpuModel = os.cpus()[0].model;
            
            res.json({
                uptime: `${hours} Jam ${minutes} Menit`,
                total_data: totalData,
                total_users: totalUsers,
                ram: `${usedMem} MB / ${totalMem} MB Terpakai`,
                cpu: cpuModel,
                os: os.platform() === 'win32' ? 'Windows OS' : os.type()
            });
        });
    });
});

app.delete('/api/database/clean', (req, res) => {
    const days = parseInt(req.query.days) || 30;
    db.query(`DELETE FROM sensor_data WHERE waktu_masuk < NOW() - INTERVAL ${days} DAY`, (err, results) => {
        if (err) return res.status(500).json({ status: "gagal", pesan: err.message });
        res.json({ status: "berhasil", pesan: `${results.affectedRows} baris data usang berhasil dihapus.` });
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
    const insertDataQuery = 'INSERT INTO sensor_data (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana, syringe_present, waktu_masuk) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())';
    
    db.query(insertDataQuery, [device, 'sensor_rata_rata', suhu, kelembaban, tekanan, gas_metana, syringe_present || 0], (err, results) => {
        if (err) {
            console.error('\n[❌] Gagal menyimpan ke MySQL:', err.message);
            return res.status(500).json({ status: "gagal", pesan: err.message });
        }
        
        console.log(`\n✅ Data berhasil masuk dari device: ${device} pada ${new Date().toLocaleTimeString('id-ID')}`);
        
        // --- WEBSOCKET BROADCAST ---
        io.emit('newData', {
            chamberId: device,
            data: {
                suhu: suhu,
                kelembaban: kelembaban,
                tekanan: tekanan,
                gas_metana: gas_metana,
                syringe_present: syringe_present
            }
        });
        
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
    // Jalankan pembaruan offline terlebih dahulu sebelum mengembalikan data (karena setInterval tidak jalan di serverless Vercel)
    db.query("UPDATE daftar_device SET status='Offline' WHERE last_seen < NOW() - INTERVAL 1 MINUTE", (err) => {
        if (err) console.error("Gagal update status offline:", err.message);
        
        db.query('SELECT * FROM daftar_device', (err2, results) => {
            if (err2) return res.status(500).json({ status: "gagal" });
            res.json({ status: "berhasil", data: results });
        });
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
// 8. API CUACA (Proxy)
// ==========================================
app.get('/api/weather', async (req, res) => {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-7.7956&longitude=110.3695&current_weather=true');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Gagal mengambil data cuaca:", error.message);
        res.status(500).json({ status: "gagal", pesan: error.message });
    }
});

// ==========================================
// 9. MENYALAKAN SERVER
// ==========================================
server.listen(port, '0.0.0.0', () => {
    console.log(`Server & WebSocket berjalan di http://0.0.0.0:${port} (Menerima koneksi dari semua IP)`);
});

module.exports = app;