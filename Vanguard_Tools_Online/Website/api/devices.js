const mysql = require('mysql2');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const fallbackDevices = [
        { chamber_id: 'Chamber 1', status: 'Online', last_seen: new Date() },
        { chamber_id: 'Chamber 2', status: 'Online', last_seen: new Date() }
    ];

    const dbHost = process.env.DB_HOST && process.env.DB_HOST.trim() !== '' ? process.env.DB_HOST.trim() : null;
    if (!dbHost) {
        return res.status(200).json({ status: 'berhasil', data: fallbackDevices });
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

        pool.query('SELECT * FROM daftar_device', (err, results) => {
            if (err || !results || results.length === 0) {
                return res.status(200).json({ status: 'berhasil', data: fallbackDevices });
            }
            res.status(200).json({ status: 'berhasil', data: results });
        });
    } catch (e) {
        res.status(200).json({ status: 'berhasil', data: fallbackDevices });
    }
};
