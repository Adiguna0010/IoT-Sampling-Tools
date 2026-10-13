const mysql = require('mysql2');

let sampleData = [
    {
        id: 1,
        nama_device: 'Chamber 1',
        nama_sensor: 'sensor_rata_rata',
        suhu: 29.4,
        kelembaban: 78.2,
        tekanan: 1011.5,
        gas_metana: 24,
        syringe_present: 1,
        limit_atas: 0,
        limit_bawah: 1,
        kipas_state: 0,
        waktu_masuk: new Date(Date.now() - 60000).toISOString()
    },
    {
        id: 2,
        nama_device: 'Chamber 2',
        nama_sensor: 'sensor_rata_rata',
        suhu: 30.1,
        kelembaban: 81.0,
        tekanan: 1012.0,
        gas_metana: 32,
        syringe_present: 1,
        limit_atas: 0,
        limit_bawah: 1,
        kipas_state: 0,
        waktu_masuk: new Date().toISOString()
    }
];

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const dbHost = process.env.DB_HOST && process.env.DB_HOST.trim() !== '' ? process.env.DB_HOST.trim() : null;

    if (req.method === 'POST') {
        const { device, suhu, kelembaban, tekanan, gas_metana, syringe_present, limit_atas, limit_bawah, kipas_state } = req.body || {};
        if (!device || suhu === undefined) {
            return res.status(400).json({ status: 'gagal', pesan: 'Format data tidak valid' });
        }

        const newRec = {
            id: Date.now(),
            nama_device: device,
            nama_sensor: 'sensor_rata_rata',
            suhu: parseFloat(suhu),
            kelembaban: parseFloat(kelembaban || 0),
            tekanan: parseFloat(tekanan || 0),
            gas_metana: parseInt(gas_metana || 0),
            syringe_present: parseInt(syringe_present || 0),
            limit_atas: parseInt(limit_atas || 0),
            limit_bawah: parseInt(limit_bawah || 0),
            kipas_state: parseInt(kipas_state || 0),
            waktu_masuk: new Date().toISOString()
        };
        sampleData.push(newRec);

        if (dbHost) {
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
                pool.query('INSERT INTO sensor_data (nama_device, nama_sensor, suhu, kelembaban, tekanan, gas_metana, syringe_present, limit_atas, limit_bawah, kipas_state, waktu_masuk) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                    [device, 'sensor_rata_rata', suhu, kelembaban, tekanan, gas_metana, syringe_present || 0, limit_atas || 0, limit_bawah || 0, kipas_state || 0], () => {});
            } catch (e) {}
        }

        return res.json({ status: 'berhasil', pesan: 'Data tersimpan', commands: [] });
    }

    // GET requests
    if (dbHost) {
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
            return pool.query('SELECT * FROM sensor_data ORDER BY id DESC LIMIT 20', (err, results) => {
                if (err || !results) return res.json(sampleData);
                res.json(results);
            });
        } catch (e) {
            return res.json(sampleData);
        }
    }

    return res.json(sampleData);
};
