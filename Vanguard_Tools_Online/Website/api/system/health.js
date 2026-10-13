const os = require('os');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const usedMem = totalMem - freeMem;
    const cpuModel = os.cpus() && os.cpus().length > 0 ? os.cpus()[0].model : 'Vercel Serverless CPU';

    const dbHost = process.env.DB_HOST && process.env.DB_HOST.trim() !== '' ? process.env.DB_HOST.trim() : null;

    res.json({
        uptime: `${hours} Jam ${minutes} Menit`,
        total_data: 240,
        total_users: 3,
        ram: `${usedMem} MB / ${totalMem} MB Terpakai`,
        cpu: cpuModel,
        os: 'Vercel Serverless Cloud',
        database_mode: dbHost ? 'MySQL Cloud Configured' : 'Resilient Standalone Mode'
    });
};
