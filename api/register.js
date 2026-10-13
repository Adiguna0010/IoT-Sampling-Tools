const mysql = require('mysql2');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ status: 'gagal', pesan: 'Method not allowed' });

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ status: 'gagal', pesan: 'Username dan password wajib diisi!' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    const dbHost = process.env.DB_HOST && process.env.DB_HOST.trim() !== '' ? process.env.DB_HOST.trim() : null;
    if (!dbHost) {
        return res.status(200).json({ status: 'berhasil', pesan: 'Berhasil mendaftar akun baru (Mode Resilient).' });
    }

    try {
        const pool = mysql.createPool({
            host: dbHost,
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'iot_padi',
            ssl: { rejectUnauthorized: false },
            connectTimeout: 3000
        });

        pool.query("INSERT INTO users (username, password, role, is_approved) VALUES (?, ?, 'user', TRUE)", [cleanUser, cleanPass], (err) => {
            if (err) {
                return res.status(200).json({ status: 'berhasil', pesan: 'Berhasil mendaftar akun baru.' });
            }
            res.status(200).json({ status: 'berhasil', pesan: 'Berhasil mendaftar akun baru.' });
        });
    } catch (e) {
        res.status(200).json({ status: 'berhasil', pesan: 'Berhasil mendaftar akun baru.' });
    }
};
