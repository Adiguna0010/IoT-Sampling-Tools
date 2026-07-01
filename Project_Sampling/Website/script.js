let jumlah = 1; 

function buatCard(id) {
    return `
    <div class="col-lg-4 col-md-6">
        <div class="chamber-card">
            <div class="title">
                <h4>Chamber ${id}</h4>
                <span class="badge-online">ONLINE</span>
            </div>
            
            <div class="sensor">
                <span><i class="bi bi-thermometer-half text-danger"></i> Suhu</span>
                <b id="suhu-${id}">-- °C</b>
            </div>
            <div class="sensor">
                <span><i class="bi bi-droplet-half text-primary"></i> Kelembapan</span>
                <b id="kelembapan-${id}">-- %</b>
            </div>
            <div class="sensor">
                <span><i class="bi bi-speedometer2 text-success"></i> Tekanan</span>
                <b id="tekanan-${id}">-- hPa</b>
            </div>
            <div class="sensor">
                <span><i class="bi bi-cloud-haze text-warning"></i> Gas Metana</span>
                <b id="metana-${id}">-- ppm</b>
            </div>
            
            <div class="chart"></div>
            
            <div class="switch">
                <label><i class="bi bi-fan"></i> Kipas</label>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="kipas-${id}" onchange="toggleKipas(${id})">
                </div>
            </div>
            
            <!-- PANEL KONTROL SYRINGE BARU -->
            <div class="mt-3 p-3 border rounded bg-light">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="fw-bold text-dark"><i class="bi bi-syringe"></i> Kontrol Syringe</label>
                    <!-- Status Limit Switch Keberadaan Syringe -->
                    <span class="badge bg-secondary" id="syringe-presence-${id}">Mengecek...</span>
                </div>
                
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary flex-fill fw-bold" id="btn-up-${id}" onclick="moveSyringe(${id}, 'UP')" disabled>
                        <i class="bi bi-arrow-up-circle"></i> UP
                    </button>
                    <button class="btn btn-outline-primary flex-fill fw-bold" id="btn-down-${id}" onclick="moveSyringe(${id}, 'DOWN')" disabled>
                        <i class="bi bi-arrow-down-circle"></i> DOWN
                    </button>
                </div>
            </div>
            
            <button class="btn btn-detail">
                <i class="bi bi-info-circle"></i> Detail
            </button>
        </div>
    </div>
    `;
}

function load() {
    let html = "";
    for (let i = 1; i <= jumlah; i++) {
        html += buatCard(i);
    }
    document.getElementById("containerChamber").innerHTML = html;
    fetchData(); 
}

function tambahChamber() {
    jumlah++;
    updateStatistik();
    load();
}

function kurangiChamber() {
    if (jumlah > 1) {
        jumlah--;
        updateStatistik();
        load();
    } else {
        alert("Minimal harus ada 1 Chamber yang dipantau!");
    }
}

function updateStatistik() {
    document.getElementById("jumlahChamber").innerHTML = jumlah;
    document.getElementById("online").innerHTML = jumlah;
}

setInterval(() => {
    const now = new Date();
    document.getElementById("clock").innerHTML = now.toLocaleTimeString();
}, 1000);

// ==========================================
// KONEKSI KE BACKEND SERVER (localhost:3000)
// ==========================================

async function fetchData() {
    try {
        const response = await fetch('http://localhost:3000/api/data/latest');
        const result = await response.json();

        if (result.status === "berhasil" && result.data) {
            const data = result.data;
            
            if(document.getElementById('suhu-1')) {
                document.getElementById('suhu-1').innerText = `${data.suhu} °C`;
                document.getElementById('kelembapan-1').innerText = `${data.kelembaban} %`;
                document.getElementById('tekanan-1').innerText = `${data.tekanan} hPa`;
                document.getElementById('metana-1').innerText = `${data.gas_metana} ppm`;
                
                // DETEKSI KEBERADAAN SYRINGE DARI DATABASE
                // Jika data API tidak memiliki 'syringe_present', kita anggap "tidak ada" (0)
                let isPresent = data.syringe_present || 0; 
                
                const presenceBadge = document.getElementById('syringe-presence-1');
                const btnUp = document.getElementById('btn-up-1');
                const btnDown = document.getElementById('btn-down-1');

                if (isPresent == 1 || isPresent == "ada" || isPresent == "yes") {
                    presenceBadge.innerText = "ADA (SIAP)";
                    presenceBadge.className = "badge bg-success";
                    btnUp.disabled = false;
                    btnDown.disabled = false;
                } else {
                    presenceBadge.innerText = "TIDAK ADA";
                    presenceBadge.className = "badge bg-danger";
                    btnUp.disabled = true;
                    btnDown.disabled = true;
                }
            }
        }
    } catch (error) {
        console.error("Gagal mengambil data dari server:", error);
    }
}

setInterval(fetchData, 3000);

// KONTROL KIPAS
async function toggleKipas(id) {
    const kipasToggle = document.getElementById(`kipas-${id}`);
    try {
        const payload = [{
            chamber_id: `Chamber ${id}`,
            command_name: "kipas",
            command_value: kipasToggle.checked ? "ON" : "OFF"
        }];
        await fetch('http://localhost:3000/api/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        alert("Gagal menyalakan/mematikan kipas. Cek koneksi server.");
        kipasToggle.checked = !kipasToggle.checked;
    }
}

// KONTROL SYRINGE (UP / DOWN)
async function moveSyringe(id, direction) {
    const presenceBadge = document.getElementById(`syringe-presence-${id}`).innerText;
    
    // Validasi Ekstra: Pastikan syringe benar-benar ada
    if (presenceBadge.includes("TIDAK ADA") || presenceBadge.includes("Mengecek")) {
        alert("ERROR: Tidak ada syringe terdeteksi. Silakan pasang syringe terlebih dahulu!");
        return;
    }

    try {
        const payload = [{
            chamber_id: `Chamber ${id}`,
            command_name: "syringe",
            command_value: direction // Akan bernilai "UP" atau "DOWN"
        }];

        await fetch('http://localhost:3000/api/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log(`Perintah syringe ${direction} untuk Chamber ${id} berhasil dikirim!`);
    } catch (error) {
        console.error("Gagal mengirim perintah syringe:", error);
        alert("Gagal menggerakkan syringe. Cek koneksi server.");
    }
}

load();
