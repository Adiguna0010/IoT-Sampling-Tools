// ==========================================
// 1. OTORISASI (CEK LOGIN)
// ==========================================
const userRole = sessionStorage.getItem("role");
const username = sessionStorage.getItem("username") || "Pengguna";

if (!userRole) window.location.href = "index.html";

function logout() {
    sessionStorage.clear();
    window.location.href = "index.html"; 
}

let myChart;
let historyChartInstance;
let activeChambers = ['Chamber 1']; // Default 1 chamber terpasang

window.onload = function() {
    document.getElementById("display-username").innerText = username;
    const roleBadge = document.getElementById("display-role");
    
    if(userRole === "operator") {
        roleBadge.innerText = "Operator";
        roleBadge.className = "badge bg-primary ms-2";
    } else {
        roleBadge.innerText = "User";
        roleBadge.className = "badge bg-secondary ms-2";
    }

    document.getElementById("active-users-count").innerText = Math.floor(Math.random() * 3) + 1;

    if (userRole === "user") {
        const opControls = document.getElementById("operator-controls");
        if (opControls) opControls.style.display = "none";
    }

    initChart();
    load();
}

// ==========================================
// 2. LOGIKA WORKSPACE & KARTU CHAMBER
// ==========================================

function buatCard(id) {
    // Buat id yang valid untuk HTML attributes (hilangkan spasi)
    const safeId = id.replace(/\s+/g, '-');
    
    const controlPanelHTML = (userRole === "operator") ? `
        <div class="control-section">
            <div class="ctrl-row">
                <span><i class="bi bi-fan text-secondary"></i> Kipas</span>
                <label class="switch-mini">
                    <input type="checkbox" id="kipas-${safeId}" onchange="toggleKipas('${id}', '${safeId}')">
                    <span class="slider-mini"></span>
                </label>
            </div>
            <div class="ctrl-row">
                <span><i class="bi bi-syringe text-secondary"></i> Syringe <span id="syringe-presence-${safeId}" class="badge bg-secondary" style="font-size:9px;">Cek</span></span>
                <div class="btn-group-tiny">
                    <button id="btn-up-${safeId}" onclick="moveSyringe('${id}', '${safeId}', 'UP')" disabled>UP</button>
                    <button id="btn-down-${safeId}" onclick="moveSyringe('${id}', '${safeId}', 'DOWN')" disabled>DWN</button>
                </div>
            </div>
        </div>
    ` : `
        <div class="control-section text-center text-muted" style="font-size:11px;">
            <i class="bi bi-lock-fill"></i> Kontrol Terkunci
        </div>
    `;

    return `
    <div class="chamber-node">
        <div class="node-header">
            <div class="node-icon"><i class="bi bi-cpu-fill"></i></div>
            <div class="node-title">${id}</div>
            <div><span class="badge bg-success" id="status-koneksi-${safeId}" style="font-size:9px;">Online</span></div>
        </div>
        <div class="node-body">
            <div class="sensor-row"><span>Suhu</span><b id="suhu-${safeId}">-- °C</b></div>
            <div class="sensor-row"><span>Kelembapan</span><b id="kelembapan-${safeId}">-- %</b></div>
            <div class="sensor-row"><span>Tekanan</span><b id="tekanan-${safeId}">-- hPa</b></div>
            <div class="sensor-row"><span>Gas Metana</span><b id="metana-${safeId}">-- ppm</b></div>
            
            ${controlPanelHTML}
            
            <button class="btn btn-detail mt-2 w-100 btn-primary btn-sm" onclick="bukaDetail('${id}')" style="background:#004A8F; border:none; font-weight:bold;">
                <i class="bi bi-info-circle"></i> Detail
            </button>
        </div>
    </div>
    `;
}

function load() {
    let html = "";
    activeChambers.forEach(chamberId => {
        html += buatCard(chamberId);
    });
    document.getElementById("containerChamber").innerHTML = html;
    document.getElementById("jumlahChamber").innerHTML = activeChambers.length;
    updateOverviewTable();
    fetchData(); 
}

// Menampilkan Modal Tambah Chamber
function tambahChamber() {
    const modal = new bootstrap.Modal(document.getElementById('modalTambah'));
    document.getElementById('inputChamberId').value = "";
    modal.show();
}

// Proses Pengecekan Device saat Tambah Chamber
async function prosesTambahChamber() {
    const chamberId = document.getElementById("inputChamberId").value.trim();
    if(!chamberId) return alert("Silakan masukkan ID Chamber!");
    
    try {
        const res = await fetch('http://localhost:3000/api/devices');
        const json = await res.json();
        
        if (json.status === "berhasil") {
            const found = json.data.find(d => d.chamber_id === chamberId);
            if (found) {
                if (!activeChambers.includes(chamberId)) {
                    activeChambers.push(chamberId);
                    load();
                    // Tutup modal
                    bootstrap.Modal.getInstance(document.getElementById('modalTambah')).hide();
                } else {
                    alert("Chamber tersebut sudah tampil di Dashboard.");
                }
            } else {
                alert("Device tidak tersedia! Pastikan ESP perangkat tersebut sudah menyala dan pernah mengirimkan data.");
            }
        }
    } catch (e) {
        alert("Gagal terhubung ke server untuk verifikasi device.");
    }
}

// Kurangi Chamber (menghapus yang paling akhir ditambahkan)
function kurangiChamber() {
    if (activeChambers.length > 1) {
        activeChambers.pop();
        load();
    } else {
        alert("Minimal 1 Chamber harus tampil!");
    }
}

// Membuka Modal Detail (Sensor Terkini + Log Activity)
async function bukaDetail(chamberId) {
    document.getElementById("detailChamberTitle").innerText = chamberId;
    
    // Set loading state untuk teks di kiri
    document.getElementById("detail-suhu").innerText = "-- °C";
    document.getElementById("detail-kelembapan").innerText = "-- %";
    document.getElementById("detail-tekanan").innerText = "-- hPa";
    document.getElementById("detail-metana").innerText = "-- ppm";
    document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5">Memuat data...</td></tr>`;

    const modal = new bootstrap.Modal(document.getElementById('modalDetail'));
    modal.show();
    
    try {
        // Ambil Data Terkini untuk Panel Kiri
        const resLatest = await fetch(`http://localhost:3000/api/data/latest/${chamberId}`);
        const jsonLatest = await resLatest.json();
        if (jsonLatest.status === "berhasil" && jsonLatest.data) {
            document.getElementById("detail-suhu").innerText = `${jsonLatest.data.suhu} °C`;
            document.getElementById("detail-kelembapan").innerText = `${jsonLatest.data.kelembaban} %`;
            document.getElementById("detail-tekanan").innerText = `${jsonLatest.data.tekanan} hPa`;
            document.getElementById("detail-metana").innerText = `${jsonLatest.data.gas_metana} ppm`;
        }

        // Ambil Data History untuk Chart dan Tabel
        const resHistory = await fetch(`http://localhost:3000/api/data/history/${chamberId}`);
        const jsonHistory = await resHistory.json();
        
        if (jsonHistory.status === "berhasil" && jsonHistory.data.length > 0) {
            let html = "";
            let labels = [];
            let suhuData = [];
            let humData = [];
            
            jsonHistory.data.forEach(d => {
                html += `<tr><td>${d.id}</td><td>${d.suhu}</td><td>${d.kelembaban}</td><td>${d.tekanan}</td><td>${d.gas_metana}</td></tr>`;
                labels.unshift(d.id); 
                suhuData.unshift(d.suhu);
                humData.unshift(d.kelembaban);
            });
            document.getElementById("logTableBody").innerHTML = html;
            
            const ctx = document.getElementById('historyChart').getContext('2d');
            if(historyChartInstance) historyChartInstance.destroy();
            historyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Suhu (°C)', data: suhuData, borderColor: '#EE2A24', tension: 0.3, fill: true, backgroundColor: 'rgba(238, 42, 36, 0.1)' },
                        { label: 'Kelembapan (%)', data: humData, borderColor: '#004A8F', tension: 0.3 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        } else {
            document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5">Tidak ada riwayat data ditemukan.</td></tr>`;
        }
    } catch(e) {
        document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5" class="text-danger">Gagal mengambil data dari server.</td></tr>`;
    }
}

// Memperbarui Overview Table di panel bawah
async function updateOverviewTable() {
    try {
        const res = await fetch('http://localhost:3000/api/devices');
        const json = await res.json();
        
        if (json.status === "berhasil") {
            let html = "";
            let countOnline = 0;
            
            activeChambers.forEach(chamberId => {
                const deviceData = json.data.find(d => d.chamber_id === chamberId);
                const safeId = chamberId.replace(/\s+/g, '-');
                const badgeStatusCard = document.getElementById(`status-koneksi-${safeId}`);
                
                if (deviceData) {
                    const statusText = deviceData.status; // 'Online' atau 'Offline'
                    const statusBadge = (statusText === 'Online') ? '<span class="badge bg-success">Online</span>' : '<span class="badge bg-danger">Offline</span>';
                    html += `<tr><td>${chamberId}</td><td>${statusBadge}</td><td>${new Date(deviceData.last_seen).toLocaleTimeString()}</td></tr>`;
                    
                    if (statusText === 'Online') countOnline++;
                    
                    // Update Badge di Kartu Chamber
                    if (badgeStatusCard) {
                        badgeStatusCard.innerText = statusText;
                        badgeStatusCard.className = (statusText === 'Online') ? 'badge bg-success' : 'badge bg-danger';
                    }
                } else {
                    html += `<tr><td>${chamberId}</td><td><span class="badge bg-secondary">Unknown</span></td><td>-</td></tr>`;
                    if (badgeStatusCard) badgeStatusCard.className = 'badge bg-secondary';
                }
            });
            document.getElementById("overview-table").innerHTML = html;
            
            // Coba perbarui angka chamber aktif (Online) di Top Info Card
            if(document.getElementById("online")) document.getElementById("online").innerHTML = countOnline;
        }
    } catch (e) {
        console.error("Gagal update overview table.");
    }
}

// Update Toolbar Clock
setInterval(() => {
    const now = new Date();
    const options = { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' };
    document.getElementById("clock").innerHTML = now.toLocaleDateString('id-ID', options);
}, 1000);

// API Cuaca
async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&current_weather=true');
        const result = await response.json();
        if(result.current_weather) {
            let icon = "☀️";
            const code = result.current_weather.weathercode;
            if (code >= 1 && code <= 3) icon = "⛅";
            else if (code >= 51 && code <= 67) icon = "🌧️";
            document.getElementById("cuaca").innerHTML = `${icon} ${result.current_weather.temperature}°C`;
        }
    } catch (e) {
        document.getElementById("cuaca").innerHTML = `Gagal`;
    }
}
fetchWeather();

// ==========================================
// 3. API DATA & KONTROL (FETCH KE LOCALHOST)
// ==========================================

function initChart() {
    const ctx = document.getElementById('globalChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Suhu (°C)', borderColor: '#EE2A24', data: [], tension: 0.3 },
                { label: 'Lembap (%)', borderColor: '#0f62fe', data: [], tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { display: false }, y: { display: true } },
            plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: {size: 10} } } }
        }
    });
}

async function fetchData() {
    // Perbarui status koneksi device juga setiap cycle
    updateOverviewTable();

    // Loop semua chamber yang tampil di layar dan ambil data terbarunya masing-masing
    activeChambers.forEach(async (chamberId) => {
        const safeId = chamberId.replace(/\s+/g, '-');
        
        try {
            const response = await fetch(`http://localhost:3000/api/data/latest/${chamberId}`);
            const result = await response.json();

            if (result.status === "berhasil" && result.data) {
                const data = result.data;
                
                if(document.getElementById(`suhu-${safeId}`)) {
                    document.getElementById(`suhu-${safeId}`).innerText = `${data.suhu} °C`;
                    document.getElementById(`kelembapan-${safeId}`).innerText = `${data.kelembaban} %`;
                    document.getElementById(`tekanan-${safeId}`).innerText = `${data.tekanan} hPa`;
                    document.getElementById(`metana-${safeId}`).innerText = `${data.gas_metana} ppm`;
                    
                    // Update Grafik Global (Hanya mengambil data dari Chamber 1 sebagai sample global)
                    if(chamberId === activeChambers[0] && myChart) {
                        const time = new Date().toLocaleTimeString();
                        myChart.data.labels.push(time);
                        myChart.data.datasets[0].data.push(data.suhu);
                        myChart.data.datasets[1].data.push(data.kelembaban);
                        if(myChart.data.labels.length > 10) {
                            myChart.data.labels.shift();
                            myChart.data.datasets[0].data.shift();
                            myChart.data.datasets[1].data.shift();
                        }
                        myChart.update();
                    }
                    
                    if (userRole === "operator") {
                        let isPresent = data.syringe_present || 0; 
                        const presenceBadge = document.getElementById(`syringe-presence-${safeId}`);
                        const btnUp = document.getElementById(`btn-up-${safeId}`);
                        const btnDown = document.getElementById(`btn-down-${safeId}`);

                        if (presenceBadge && btnUp && btnDown) {
                            if (isPresent == 1 || isPresent == "ada" || isPresent == "yes") {
                                presenceBadge.innerText = "Siap";
                                presenceBadge.className = "badge bg-success";
                                btnUp.disabled = false;
                                btnDown.disabled = false;
                            } else {
                                presenceBadge.innerText = "Kosong";
                                presenceBadge.className = "badge bg-danger";
                                btnUp.disabled = true;
                                btnDown.disabled = true;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Gagal mengambil data ${chamberId}:`, error);
        }
    });
}

setInterval(fetchData, 3000);

async function toggleKipas(chamberId, safeId) {
    if(userRole !== "operator") return;
    const kipasToggle = document.getElementById(`kipas-${safeId}`);
    try {
        const payload = [{ chamber_id: chamberId, command_name: "kipas", command_value: kipasToggle.checked ? "ON" : "OFF" }];
        await fetch('http://localhost:3000/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (error) {
        alert("Gagal menyalakan/mematikan kipas.");
        kipasToggle.checked = !kipasToggle.checked;
    }
}

async function moveSyringe(chamberId, safeId, direction) {
    if(userRole !== "operator") return;
    const presenceBadge = document.getElementById(`syringe-presence-${safeId}`).innerText;
    if (presenceBadge === "Kosong" || presenceBadge === "Cek") {
        alert("ERROR: Tidak ada syringe terdeteksi di alat!");
        return;
    }
    try {
        const payload = [{ chamber_id: chamberId, command_name: "syringe", command_value: direction }];
        await fetch('http://localhost:3000/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (error) {
        alert("Gagal menggerakkan syringe.");
    }
}
