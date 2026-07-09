const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log("\n=== 🚀 Render Auto Deployer for Vanguard Tools ===");
    console.log("Silakan masukkan detail berikut untuk mendeploy backend Anda secara otomatis.\n");

    const apiKey = await ask("1. Masukkan Render API Key Anda (dapat dicari di Render Dashboard > Account Settings > API Keys): ");
    if (!apiKey) {
        console.error("❌ API Key tidak boleh kosong.");
        process.exit(1);
    }

    const dbHost = await ask("2. Masukkan Host DB Aiven MySQL: ");
    const dbPort = await ask("3. Masukkan Port DB Aiven MySQL (default: 30000+ di Aiven): ");
    const dbUser = await ask("4. Masukkan User DB Aiven MySQL (default: avnadmin): ") || "avnadmin";
    const dbPass = await ask("5. Masukkan Password DB Aiven MySQL: ");
    const dbName = await ask("6. Masukkan Nama DB Aiven MySQL (default: defaultdb): ") || "defaultdb";

    rl.close();

    console.log("\n⏳ [1/2] Menghubungi Render API untuk mencari Workspace Owner ID...");
    
    const options = {
        hostname: 'api.render.com',
        path: '/v1/owners?limit=20',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        }
    };

    let ownerId = "";
    try {
        const ownersRes = await makeRequest(options);
        const owners = JSON.parse(ownersRes);
        if (!owners || owners.length === 0) {
            console.error("❌ Tidak ditemukan workspace Owner ID pada akun Render Anda.");
            process.exit(1);
        }
        ownerId = owners[0].owner.id;
        console.log(`✅ Berhasil mendapatkan Owner ID: ${ownerId}`);
    } catch (e) {
        console.error(`❌ Gagal mendapatkan Owner ID. Periksa apakah API Key Anda valid. Detail: ${e.message}`);
        process.exit(1);
    }

    console.log("\n⏳ [2/2] Mengirim perintah deploy ke Render untuk membuat Web Service...");

    const postData = JSON.stringify({
        type: "web_service",
        name: "iot-chamber-backend",
        ownerId: ownerId,
        repo: "https://github.com/Adiguna0010/IoT-Sampling-Tools.git",
        branch: "main",
        autoDeploy: "yes",
        envVars: [
            { key: "PORT", value: "3000" },
            { key: "DB_HOST", value: dbHost },
            { key: "DB_PORT", value: dbPort },
            { key: "DB_USER", value: dbUser },
            { key: "DB_PASSWORD", value: dbPass },
            { key: "DB_NAME", value: dbName }
        ],
        serviceDetails: {
            buildCommand: "npm install",
            startCommand: "node server_mirna.js",
            rootDir: "Vanguard_Tools_Online/API"
        }
    });

    const postOptions = {
        hostname: 'api.render.com',
        path: '/v1/services',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    try {
        const serviceRes = await makeRequest(postOptions, postData);
        const service = JSON.parse(serviceRes);
        console.log("\n🎉 CONGRATULATIONS! WEB SERVICE BERHASIL DIBUAT ONLINE!");
        console.log("--------------------------------------------------");
        console.log(`Nama Service     : ${service.name}`);
        console.log(`Render Dashboard : https://dashboard.render.com/web/${service.id}`);
        console.log(`URL Publik API   : ${service.url}`);
        console.log("--------------------------------------------------\n");
        console.log("Langkah Terakhir:");
        console.log("1. Buka 'Vanguard_Tools_Online/Website/script.js' baris ke-6.");
        console.log(`2. Ganti URL dummy dengan URL publik API Anda di atas: '${service.url}'`);
        console.log("3. Buka terminal di VS Code, masuk ke folder 'Vanguard_Tools_Online/Website', lalu jalankan 'npx vercel --prod' untuk memfinalisasi.");
    } catch (e) {
        console.error(`❌ Gagal membuat Web Service di Render. Detail: ${e.message}`);
    }
}

function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else {
                    reject(new Error(`Status Code ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

main();
