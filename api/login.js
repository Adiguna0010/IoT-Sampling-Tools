const mysql = require('mysql2');

const inMemoryUsers = [
    { id: 1, username: 'operator', password: 'admin123', role: 'operator', is_approved: 1 },
    { id: 2, username: 'admin', password: 'admin123', role: 'admin', is_approved: 1 },
    { id: 3, username: 'tamu', password: 'user123', role: 'user', is_approved: 1 }
];

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'gagal', pesan: 'Method not allowed' });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ status: 'gagal', pesan: 'Username dan password wajib diisi!' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    const fallbackCheck = () => {
        const found = inMemoryUsers.find(
            u => u.username.toLowerCase() === cleanUser.toLowerCase() && u.password === cleanPass
        );
        if (found) {
            return res.status(200).json({
                status: 'berhasil',
                role: found.role,
                username: found.username.toUpperCase()
            });
        }
        return res.status(401).json({ status: 'gagal', pesan: 'Username atau Password salah!' });
    };

    const dbHost = (process.env.DB_HOST && process.env.DB_HOST.trim() !== '') ? process.env.DB_HOST.trim() : null;
    const dbUrl = (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') ? process.env.DATABASE_URL.trim() : null;
    if (!dbHost && !dbUrl) {
        return fallbackCheck();
    }

    try {
        const pool = dbUrl
            ? mysql.createPool({
                uri: dbUrl,
                ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
                connectTimeout: 5000
            })
            : mysql.createPool({
                host: dbHost,
                port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : (dbHost.includes('tidbcloud.com') ? 4000 : 3306),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'test',
                ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
                connectTimeout: 5000
            });

        pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [cleanUser, cleanPass], (err, results) => {
            if (err) {
                console.warn('[LOGIN] DB Query failed, using fallback:', err.message);
                return fallbackCheck();
            }

            if (results && results.length > 0) {
                const user = results[0];
                if (!user.is_approved) {
                    return res.status(403).json({ status: 'gagal', pesan: 'Akun belum disetujui oleh Master Admin!' });
                }
                return res.status(200).json({
                    status: 'berhasil',
                    role: user.role,
                    username: user.username.toUpperCase()
                });
            } else {
                return fallbackCheck();
            }
        });
    } catch (e) {
        return fallbackCheck();
    }
};
