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
let currentDetailChamber = ""; // Menyimpan chamber yang sedang dibuka detailnya
// Coba ambil dari LocalStorage, jika kosong gunakan default ['Chamber 1']
let activeChambers = JSON.parse(localStorage.getItem('savedChambers')) || ['Chamber 1'];

window.onload = function() {
    document.getElementById("display-username").innerText = username;
    const roleBadge = document.getElementById("display-role");
    
    if(userRole === "operator") {
        roleBadge.innerText = "Operator";
        roleBadge.className = "badge bg-primary ms-2";
    } else if (userRole === "master_admin") {
        roleBadge.innerText = "Master Admin";
        roleBadge.className = "badge bg-danger ms-2";
    } else {
        roleBadge.innerText = "User";
        roleBadge.className = "badge bg-secondary ms-2";
    }

    // Ambil Total Pengguna dari Database
    fetch('http://localhost:3000/api/system/health')
        .then(res => res.json())
        .then(data => {
            document.getElementById("active-users-count").innerText = data.total_users;
        })
        .catch(() => {
            document.getElementById("active-users-count").innerText = "-";
        });

    // Sembunyikan kontrol yang bukan hak User biasa
    if (userRole === "user") {
        const opControls = document.getElementById("operator-controls");
        if (opControls) opControls.style.display = "none";
        
        // Sembunyikan ikon settings dari sidebar
        const navSettings = document.getElementById("nav-settings");
        if (navSettings) navSettings.style.display = "none";
    }

    initChart();
    load();
    fetchWeather();

    // Inisialisasi SortableJS untuk Drag and Drop Chamber Cards
    const containerChamber = document.getElementById('containerChamber');
    if (containerChamber) {
        new Sortable(containerChamber, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                // Saat selesai digeser, perbarui susunan array activeChambers
                const newOrder = [];
                document.querySelectorAll('#containerChamber .chamber-node').forEach(node => {
                    newOrder.push(node.getAttribute('data-id'));
                });
                
                // Simpan susunan baru ke array dan localStorage
                activeChambers = newOrder;
                localStorage.setItem('savedChambers', JSON.stringify(activeChambers));
                
                // Perbarui tabel overview agar urutannya sama
                updateOverviewTable();
            }
        });
    }
}

// Fungsi Navigasi Sidebar
function switchView(viewName) {
    // Sembunyikan semua halaman (main)
    document.getElementById("view-dashboard").style.display = "none";
    document.getElementById("view-settings").style.display = "none";
    
    // Matikan efek aktif di semua ikon navigasi
    document.getElementById("nav-dashboard").classList.remove("active");
    if(document.getElementById("nav-settings")) document.getElementById("nav-settings").classList.remove("active");

    // Nyalakan yang dipilih
    if (viewName === 'dashboard') {
        document.getElementById("view-dashboard").style.display = "block";
        document.getElementById("nav-dashboard").classList.add("active");
    } else if (viewName === 'settings') {
        document.getElementById("view-settings").style.display = "block";
        document.getElementById("nav-settings").classList.add("active");
        
        // Populate export chambers
        const expChamber = document.getElementById("export-chamber");
        if(expChamber) {
            expChamber.innerHTML = '<option value="all">Semua Chamber</option>';
            activeChambers.forEach(ch => {
                expChamber.innerHTML += `<option value="${ch}">${ch}</option>`;
            });
        }
        
        // Fetch server health if master admin
        if(userRole === 'master_admin') {
            fetchServerHealth();
        }
    }
}

// ==========================================
// 2. LOGIKA WORKSPACE & KARTU CHAMBER
// ==========================================

function buatCard(id) {
    // Buat id yang valid untuk HTML attributes (hilangkan spasi)
    const safeId = id.replace(/\s+/g, '-');
    
    const controlPanelHTML = (userRole === "operator" || userRole === "master_admin") ? `
        <div class="control-section">
            <div class="ctrl-row">
                <span><i class="bi bi-fan text-secondary"></i> Kipas</span>
                <label class="switch-mini">
                    <input type="checkbox" id="kipas-${safeId}" onchange="toggleKipas('${id}', '${safeId}', this.checked, this)">
                    <span class="slider-mini"></span>
                </label>
            </div>
            <div class="ctrl-row">
                <span><i class="bi bi-syringe text-secondary"></i> Syringe <span id="syringe-presence-${safeId}" class="badge bg-secondary" style="font-size:9px;">Cek</span></span>
                <div class="btn-group-tiny">
                    <button id="btn-up-${safeId}" onclick="moveSyringe('${id}', 'U')" disabled>UP</button>
                    <button id="btn-down-${safeId}" onclick="moveSyringe('${id}', 'D')" disabled>DWN</button>
                </div>
            </div>
        </div>
    ` : `
        <div class="control-section text-center text-muted" style="font-size:11px;">
            <i class="bi bi-lock-fill"></i> Kontrol Terkunci
        </div>
    `;

    return `
    <div class="chamber-node" data-id="${id}" style="cursor: grab;">
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
                    localStorage.setItem('savedChambers', JSON.stringify(activeChambers));
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

// Membuka Modal Kurangi Chamber
function kurangiChamber() {
    if (activeChambers.length <= 1) {
        alert("Minimal 1 Chamber harus tampil!");
        return;
    }
    
    const select = document.getElementById("inputKurangiChamber");
    select.innerHTML = "";
    activeChambers.forEach(ch => {
        const opt = document.createElement("option");
        opt.value = ch;
        opt.innerText = ch;
        select.appendChild(opt);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('modalKurangi'));
    modal.show();
}

// Proses Eksekusi Kurangi Chamber
function prosesKurangiChamber() {
    const selected = document.getElementById("inputKurangiChamber").value;
    if (selected) {
        activeChambers = activeChambers.filter(ch => ch !== selected);
        localStorage.setItem('savedChambers', JSON.stringify(activeChambers));
        load();
        
        bootstrap.Modal.getInstance(document.getElementById('modalKurangi')).hide();
    }
}

// Membuka Modal Detail (Sensor Terkini + Log Activity)
async function bukaDetail(chamberId) {
    currentDetailChamber = chamberId;
    document.getElementById("detailChamberTitle").innerText = chamberId;
    
    // Set loading state untuk teks di kiri
    document.getElementById("detail-suhu").innerText = "-- °C";
    document.getElementById("detail-kelembapan").innerText = "-- %";
    document.getElementById("detail-tekanan").innerText = "-- hPa";
    document.getElementById("detail-metana").innerText = "-- ppm";
    document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5">Memuat data...</td></tr>`;

    // Sembunyikan kontrol jika level User
    if (userRole === "user") {
        document.getElementById("ctrl-tabs").style.display = "none";
        document.getElementById("ctrl-tabContent").innerHTML = `<div class="text-center text-muted mt-3"><i class="bi bi-lock-fill"></i> Kontrol Terkunci</div>`;
    }

    // Sambungkan fungsi tombol manual
    const safeId = chamberId.replace(/\s+/g, '-');
    const kipasSwitch = document.getElementById("detail-kipas-switch");
    const btnUp = document.getElementById("detail-btn-up");
    const btnDown = document.getElementById("detail-btn-down");
        if (kipasSwitch) kipasSwitch.onchange = () => toggleKipas(chamberId, null, kipasSwitch.checked, kipasSwitch);
        if (btnUp) btnUp.onclick = () => moveSyringe(chamberId, 'U');
        if (btnDown) btnDown.onclick = () => moveSyringe(chamberId, 'D');

    const modal = new bootstrap.Modal(document.getElementById('modalDetail'));
    modal.show();
    
    // Load Jadwal
    loadJadwal();
    
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
        
        if(jsonHistory.status === "berhasil" && jsonHistory.data.length > 0) {
            let html = "";
            let labels = [];
            let suhuData = [];
            let humData = [];
            let tekData = [];
            let metanaData = [];
            
            // Render dari bawah agar grafik dari kiri ke kanan (Waktu terlama -> terbaru)
            const reversedData = [...jsonHistory.data].reverse();
            reversedData.forEach(d => {
                const time = new Date(d.created_at).toLocaleTimeString();
                labels.push(time);
                suhuData.push(d.suhu);
                humData.push(d.kelembaban);
                tekData.push(d.tekanan);
                metanaData.push(d.gas_metana);
            });
            
            jsonHistory.data.forEach(d => {
                html += `<tr>
                    <td>#${d.id}</td>
                    <td>${d.suhu}</td>
                    <td>${d.kelembaban}</td>
                    <td>${d.tekanan}</td>
                    <td>${d.gas_metana}</td>
                </tr>`;
            });
            document.getElementById("logTableBody").innerHTML = html;
            
            const ctx = document.getElementById('historyChart').getContext('2d');
            if(historyChartInstance) historyChartInstance.destroy();
            historyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Suhu (°C)', data: suhuData, borderColor: '#dc3545', tension: 0.3, fill: false },
                        { label: 'Kelembapan (%)', data: humData, borderColor: '#0d6efd', tension: 0.3, fill: false },
                        { label: 'Tekanan (hPa)', data: tekData, borderColor: '#198754', tension: 0.3, fill: false, hidden: false },
                        { label: 'Metana (ppm)', data: metanaData, borderColor: '#ffc107', tension: 0.3, fill: false, hidden: false }
                    ]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false } // Sembunyikan legend bawaan, pakai dropdown
                    }
                }
            });
            // Update checkbox visibility sesuai status grafik
            updateChartVisibility();
        } else {
            document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5">Tidak ada riwayat data ditemukan.</td></tr>`;
        }
    } catch(e) {
        document.getElementById("logTableBody").innerHTML = `<tr><td colspan="5" class="text-danger">Gagal mengambil data dari server.</td></tr>`;
    }
}

// ==========================================
// LOGIKA JADWAL OTOMATIS
// ==========================================
async function loadJadwal() {
    if (!currentDetailChamber || userRole === "user") return;
    try {
        const res = await fetch(`http://localhost:3000/api/schedules/${currentDetailChamber}`);
        const json = await res.json();
        const tbody = document.getElementById("list-jadwal");
        
        if (json.status === "berhasil" && json.data.length > 0) {
            let html = "";
            json.data.forEach(item => {
                let displayValue = item.command_value;
                if (item.command_name.toLowerCase() === 'kipas') {
                    displayValue = item.command_value == '1' ? 'ON' : 'OFF';
                } else if (item.command_name.toLowerCase() === 'syringe') {
                    displayValue = item.command_value === 'U' ? 'UP' : 'DOWN';
                }

                html += `<tr>
                    <td class="text-start">${item.command_name.toUpperCase()} ${displayValue}</td>
                    <td class="fw-bold text-primary">${item.scheduled_time}</td>
                    <td><button class="btn btn-sm text-danger p-0" onclick="hapusJadwal(${item.id})"><i class="bi bi-trash"></i></button></td>
                </tr>`;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = `<tr><td colspan="3">Tidak ada jadwal</td></tr>`;
        }
    } catch(e) {
        console.error("Gagal meload jadwal", e);
    }
}

async function tambahJadwal(event) {
    event.preventDefault();
    if(userRole === "user") return;
    
    const alatVal = document.getElementById("jadwal-alat").value.split("-"); // kipas-ON -> ['kipas', 'ON']
    const timeVal = document.getElementById("jadwal-waktu").value;
    
    try {
        const res = await fetch('http://localhost:3000/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chamber_id: currentDetailChamber,
                command_name: alatVal[0],
                command_value: alatVal[1],
                scheduled_time: timeVal
            })
        });
        const json = await res.json();
        if(json.status === "berhasil") loadJadwal();
        else alert(json.pesan);
    } catch (error) {
        alert("Gagal menyimpan jadwal.");
    }
}

async function hapusJadwal(id) {
    if(userRole === "user") return;
    if(!confirm("Hapus jadwal ini?")) return;
    try {
        await fetch(`http://localhost:3000/api/schedules/${id}`, { method: 'DELETE' });
        loadJadwal();
    } catch (error) {
        alert("Gagal menghapus jadwal.");
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Batas waktu 10 detik
    
    try {
        const response = await fetch('http://localhost:3000/api/weather', { signal: controller.signal });
        clearTimeout(timeoutId);
        const result = await response.json();
        if(result.current_weather) {
            let icon = "☀️";
            const code = result.current_weather.weathercode;
            if (code >= 1 && code <= 3) icon = "⛅";
            else if (code >= 51 && code <= 67) icon = "🌧️";
            document.getElementById("cuaca").innerHTML = `${icon} ${result.current_weather.temperature}°C`;
        }
    } catch (e) {
        document.getElementById("cuaca").innerHTML = `Gagal Memuat Cuaca`;
    }
}

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
                { label: 'Suhu (°C)', data: [], borderColor: '#dc3545', tension: 0.3, fill: false },
                { label: 'Kelembapan (%)', data: [], borderColor: '#0d6efd', tension: 0.3, fill: false },
                { label: 'Tekanan (hPa)', data: [], borderColor: '#198754', tension: 0.3, fill: false, hidden: true },
                { label: 'Metana (ppm)', data: [], borderColor: '#ffc107', tension: 0.3, fill: false, hidden: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

function updateGlobalChartVisibility() {
    if(!myChart) return;
    const checkboxes = document.querySelectorAll('.chart-checkbox');
    checkboxes.forEach((cb) => {
        const datasetIndex = cb.getAttribute('data-index');
        myChart.data.datasets[datasetIndex].hidden = !cb.checked;
    });
    myChart.update();
}

async function fetchData() {
    // Perbarui status koneksi device juga setiap cycle
    updateOverviewTable();

    let sumSuhu = 0, sumLembap = 0, sumTekanan = 0, sumMetana = 0;
    let countValidData = 0;

    // Ambil data untuk semua chamber aktif secara paralel
    const fetchPromises = activeChambers.map(async (chamberId) => {
        const safeId = chamberId.replace(/\s+/g, '-');
        try {
            const response = await fetch(`http://localhost:3000/api/data/latest/${chamberId}`);
            const result = await response.json();
            return { chamberId, safeId, result };
        } catch (error) {
            console.error(`Gagal mengambil data ${chamberId}:`, error);
            return { chamberId, safeId, result: null };
        }
    });

    const results = await Promise.all(fetchPromises);

    results.forEach(({ chamberId, safeId, result }) => {
        if (result && result.status === "berhasil" && result.data) {
            const data = result.data;
            
            // Tambahkan ke kalkulasi rata-rata global
            sumSuhu += parseFloat(data.suhu) || 0;
            sumLembap += parseFloat(data.kelembaban) || 0;
            sumTekanan += parseFloat(data.tekanan) || 0;
            sumMetana += parseFloat(data.gas_metana) || 0;
            countValidData++;
            
            if(document.getElementById(`suhu-${safeId}`)) {
                document.getElementById(`suhu-${safeId}`).innerText = `${data.suhu} °C`;
                document.getElementById(`kelembapan-${safeId}`).innerText = `${data.kelembaban} %`;
                document.getElementById(`tekanan-${safeId}`).innerText = `${data.tekanan} hPa`;
                document.getElementById(`metana-${safeId}`).innerText = `${data.gas_metana} ppm`;
                
                // Cek apakah melewati ambang batas
                checkThresholds(chamberId, data);
                
                if (userRole !== "user") {
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
                    
                    // Update status di Modal Detail (jika sedang terbuka)
                    if (currentDetailChamber === chamberId) {
                        if(document.getElementById('detail-suhu')) {
                            document.getElementById('detail-suhu').innerText = `${data.suhu} °C`;
                            document.getElementById('detail-kelembapan').innerText = `${data.kelembaban} %`;
                            document.getElementById('detail-tekanan').innerText = `${data.tekanan} hPa`;
                            document.getElementById('detail-metana').innerText = `${data.gas_metana} ppm`;
                            
                            // Update Grafik History secara real-time
                            if (historyChartInstance) {
                                const time = new Date().toLocaleTimeString();
                                historyChartInstance.data.labels.push(time);
                                historyChartInstance.data.datasets[0].data.push(data.suhu);
                                historyChartInstance.data.datasets[1].data.push(data.kelembaban);
                                historyChartInstance.data.datasets[2].data.push(data.tekanan);
                                historyChartInstance.data.datasets[3].data.push(data.gas_metana);
                                
                                // Geser grafik jika kepanjangan
                                if(historyChartInstance.data.labels.length > 50) {
                                    historyChartInstance.data.labels.shift();
                                    historyChartInstance.data.datasets.forEach(dataset => dataset.data.shift());
                                }
                                historyChartInstance.update('none');
                            }
                            
                            // Update Tabel Log secara real-time
                            const logTableBody = document.getElementById("logTableBody");
                            if (logTableBody) {
                                const newRow = document.createElement("tr");
                                newRow.innerHTML = `
                                    <td>#${data.id || '?'}</td>
                                    <td>${data.suhu}</td>
                                    <td>${data.kelembaban}</td>
                                    <td>${data.tekanan}</td>
                                    <td>${data.gas_metana}</td>
                                `;
                                logTableBody.insertBefore(newRow, logTableBody.firstChild);
                                if (logTableBody.children.length > 30) {
                                    logTableBody.removeChild(logTableBody.lastChild);
                                }
                            }
                        }
                        
                        // Auto-sync status saklar Kipas pada modal & kartu utama dari kipas_state
                        const detailKipasSwitch = document.getElementById("detail-kipas-switch");
                        const safeId = currentDetailChamber.replace(/\s+/g, '-');
                        const cardKipasSwitch = document.getElementById(`kipas-${safeId}`);
                        if (data.kipas_state !== undefined) {
                            const isFanOn = (data.kipas_state == 1);
                            if (detailKipasSwitch && document.activeElement !== detailKipasSwitch) {
                                detailKipasSwitch.checked = isFanOn;
                            }
                            if (cardKipasSwitch && document.activeElement !== cardKipasSwitch) {
                                cardKipasSwitch.checked = isFanOn;
                            }
                        }

                        const detailBadge = document.getElementById("detail-ctrl-badge");
                        const dBtnUp = document.getElementById("detail-btn-up");
                        const dBtnDown = document.getElementById("detail-btn-down");
                        if (detailBadge && dBtnUp && dBtnDown) {
                            if (isPresent == 1 || isPresent == "ada" || isPresent == "yes") {
                                detailBadge.innerText = "Syringe Siap";
                                detailBadge.className = "badge bg-success ms-1";
                                dBtnUp.disabled = false;
                                dBtnDown.disabled = false;
                            } else {
                                detailBadge.innerText = "Syringe Kosong";
                                detailBadge.className = "badge bg-danger ms-1";
                                dBtnUp.disabled = true;
                                dBtnDown.disabled = true;
                            }
                        }
                    }
                }
            }
        }
    });

    // Update Global Chart dengan rata-rata dari semua Chamber Aktif
    if (countValidData > 0 && myChart) {
        const avgSuhu = (sumSuhu / countValidData).toFixed(2);
        const avgLembap = (sumLembap / countValidData).toFixed(2);
        const avgTekanan = (sumTekanan / countValidData).toFixed(2);
        const avgMetana = (sumMetana / countValidData).toFixed(2);

        const time = new Date().toLocaleTimeString();
        myChart.data.labels.push(time);
        myChart.data.datasets[0].data.push(avgSuhu);
        myChart.data.datasets[1].data.push(avgLembap);
        myChart.data.datasets[2].data.push(avgTekanan);
        myChart.data.datasets[3].data.push(avgMetana);
        
        if (myChart.data.labels.length > 20) {
            myChart.data.labels.shift();
            myChart.data.datasets.forEach(dataset => dataset.data.shift());
        }
        myChart.update('none');
    }
}

// Inisialisasi WebSocket
const socket = io('http://localhost:3000');
socket.on('newData', (payload) => {
    // Saat mendapat sinyal data baru dari server, kita cukup memanggil fetchData
    // karena fetchData sudah menangani update UI dan update Global Chart dengan rata-rata.
    // Hal ini menyingkirkan interval 3 detik, sehingga request hanya terjadi saat benar-benar ada data baru.
    fetchData();
});

async function toggleKipas(chamberId, safeId, isChecked, toggleElement) {
    if(userRole === "user") return;
    try {
        const payload = [{ chamber_id: chamberId, command_name: "Kipas", command_value: isChecked ? "1" : "0" }];
        const res = await fetch('http://localhost:3000/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error("Server error");
        
        // Sinkronkan toggle lain jika berhasil
        if (safeId && toggleElement.id === `kipas-${safeId}`) {
            const detailSwitch = document.getElementById("detail-kipas-switch");
            if (detailSwitch && currentDetailChamber === chamberId) detailSwitch.checked = isChecked;
        } else if (toggleElement.id === "detail-kipas-switch") {
            const safe = chamberId.replace(/\s+/g, '-');
            const cardSwitch = document.getElementById(`kipas-${safe}`);
            if (cardSwitch) cardSwitch.checked = isChecked;
        }
    } catch (error) {
        alert("Gagal menyalakan/mematikan kipas. Pastikan koneksi server aktif.");
        if(toggleElement) toggleElement.checked = !isChecked;
    }
}

function showWarningBanner(msg) {
    alert(msg);
    let container = document.getElementById("toast-warning-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-warning-container";
        container.style.cssText = "position: fixed; top: 75px; right: 25px; z-index: 99999; max-width: 380px;";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = "alert alert-warning alert-dismissible fade show shadow-lg border-warning text-dark fw-bold mb-2 p-3";
    toast.style.cssText = "border-left: 6px solid #ffc107; font-size: 13px; background-color: #fff3cd;";
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-exclamation-triangle-fill text-warning fs-4 me-2"></i>
            <div>${msg}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

async function moveSyringe(chamberId, direction) {
    if(userRole === "user") return;
    const safeId = chamberId.replace(/\s+/g, '-');
    const presenceBadge = document.getElementById(`syringe-presence-${safeId}`) ? document.getElementById(`syringe-presence-${safeId}`).innerText : "Kosong";
    if (presenceBadge === "Kosong" || presenceBadge === "Cek") {
        showWarningBanner("⚠️ PERINGATAN: Tidak ada syringe terdeteksi di alat (LS3 Terlepas)!");
        return;
    }

    // Proteksi Limit Switch di Web UI: Ambil teks status posisi dari Modal & Card
    const detailPosEl = document.getElementById("detail-syringe-pos");
    const mainBadgeEl = document.getElementById(`syringe-badge-${safeId}`) || document.getElementById(`syringe-pos-${safeId}`);
    
    let posText = "";
    if (detailPosEl && detailPosEl.innerText.trim() !== "") {
        posText += detailPosEl.innerText.toLowerCase() + " ";
    }
    if (mainBadgeEl && mainBadgeEl.innerText.trim() !== "") {
        posText += mainBadgeEl.innerText.toLowerCase() + " ";
    }

    if (direction === 'D' && (posText.includes("bawah") || posText.includes("tutup"))) {
        showWarningBanner("⚠️ PERINGATAN: Syringe sudah berada di posisi paling BAWAH (Limit Bawah Aktif)! Perintah Turun Ditolak.");
        return;
    }
    if (direction === 'U' && (posText.includes("atas") || posText.includes("buka") || posText.includes("full"))) {
        showWarningBanner("⚠️ PERINGATAN: Syringe sudah berada di posisi paling ATAS (Limit Atas Aktif)! Perintah Naik Ditolak.");
        return;
    }

    try {
        const payload = [{ chamber_id: chamberId, command_name: "Syringe", command_value: direction }];
        const res = await fetch('http://localhost:3000/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error("Server error");
    } catch (error) {
        showWarningBanner("Gagal menggerakkan syringe. Pastikan koneksi server aktif.");
    }
}

// ==========================================
// MASTER ADMIN & EXTRA FEATURES
// ==========================================
if (document.getElementById('btnKelolaUser')) {
    document.getElementById('btnKelolaUser').addEventListener('click', loadUsers);
}

async function loadUsers() {
    if(userRole !== 'master_admin') return;
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    try {
        const res = await fetch('http://localhost:3000/api/users');
        const users = await res.json();
        tbody.innerHTML = '';
        users.forEach(u => {
            let statusBadge = u.is_approved ? '<span class="badge bg-success">Aktif</span>' : '<span class="badge bg-warning text-dark">Pending</span>';
            let actionBtn = '';
            let roleHtml = u.role;
            
            if(u.role !== 'master_admin') {
                roleHtml = `<select class="form-select form-select-sm d-inline-block w-auto py-0" onchange="changeRole(${u.id}, this.value)">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>Operator</option>
                </select>`;
            }
            if(!u.is_approved) {
                actionBtn += `<button class="btn btn-sm btn-success me-1" onclick="approveUser(${u.id})" title="Setujui"><i class="bi bi-check"></i></button>`;
            }
            if(u.role !== 'master_admin') {
                actionBtn += `<button class="btn btn-sm btn-warning me-1" onclick="resetPassword(${u.id})" title="Reset Password"><i class="bi bi-key"></i></button>`;
                actionBtn += `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})" title="Hapus"><i class="bi bi-trash"></i></button>`;
            }
            let passStr = `<span class="font-monospace text-muted" style="font-size:11px;">${u.password}</span>`;
            tbody.innerHTML += `<tr><td>${u.id}</td><td>${u.username}</td><td>${passStr}</td><td>${roleHtml}</td><td>${statusBadge}</td><td class="text-end">${actionBtn}</td></tr>`;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat data</td></tr>';
    }
}

async function approveUser(id) {
    if(!confirm('Setujui pendaftaran user ini?')) return;
    await fetch(`http://localhost:3000/api/users/${id}/approve`, { method: 'PUT' });
    loadUsers();
}

async function deleteUser(id) {
    if(!confirm('Yakin ingin menghapus user ini?')) return;
    await fetch(`http://localhost:3000/api/users/${id}`, { method: 'DELETE' });
    loadUsers();
}

async function changeRole(id, newRole) {
    if(!confirm('Ubah jabatan user ini?')) { loadUsers(); return; }
    try {
        const res = await fetch(`http://localhost:3000/api/users/${id}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        const json = await res.json();
        alert(json.pesan);
        loadUsers();
    } catch(e) { alert("Gagal mengubah jabatan"); }
}

async function resetPassword(id) {
    if(!confirm('Yakin ingin mereset password akun ini?')) return;
    try {
        const res = await fetch(`http://localhost:3000/api/users/${id}/reset-password`, { method: 'PUT' });
        const json = await res.json();
        alert(json.pesan);
    } catch(e) { alert("Gagal mereset password"); }
}

async function cleanDatabase() {
    const days = document.getElementById("clean-days").value;
    if(!confirm(`BAHAYA: Yakin ingin menghapus semua data sensor yang umurnya lebih dari ${days} hari?`)) return;
    try {
        const res = await fetch(`http://localhost:3000/api/database/clean?days=${days}`, { method: 'DELETE' });
        const json = await res.json();
        alert(json.pesan);
    } catch(e) { alert("Gagal membersihkan database"); }
}

async function exportDataCSV() {
    const btnExport = document.querySelector("#exportDataCard button");
    const originalText = btnExport.innerHTML;
    
    try {
        btnExport.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Menyiapkan Data...';
        btnExport.disabled = true;

        const chamber = document.getElementById("export-chamber").value;
        const start = document.getElementById("export-start").value;
        const end = document.getElementById("export-end").value;
        
        let url = `http://localhost:3000/api/export?chamber=${chamber}`;
        if(start) url += `&start=${start}`;
        if(end) url += `&end=${end}`;

        const res = await fetch(url);
        const data = await res.json();
        if(data.length === 0) { 
            alert('Tidak ada data pada periode/chamber tersebut.'); 
            btnExport.innerHTML = originalText;
            btnExport.disabled = false;
            return; 
        }
        
        const headers = ['ID', 'Nama Alat', 'Suhu (°C)', 'Kelembaban (%)', 'Tekanan (hPa)', 'Metana (ppm)', 'Status Syringe', 'Waktu'];
        let csvContent = '\uFEFF' + headers.join(';') + '\n';
        
        data.forEach(row => {
            // Format Waktu ke Lokal (YYYY-MM-DD HH:mm:ss)
            const dateObj = new Date(row.created_at);
            const formattedDate = dateObj.getFullYear() + "-" + 
                String(dateObj.getMonth() + 1).padStart(2, '0') + "-" + 
                String(dateObj.getDate()).padStart(2, '0') + " " + 
                String(dateObj.getHours()).padStart(2, '0') + ":" + 
                String(dateObj.getMinutes()).padStart(2, '0') + ":" + 
                String(dateObj.getSeconds()).padStart(2, '0');
            
            // Terjemahkan Status Syringe
            const syringeStr = (row.syringe_present == 1) ? "Siap" : "Kosong";

            let rowData = [
                row.id, row.nama_device, row.suhu, row.kelembaban, row.tekanan, row.gas_metana,
                syringeStr, `"${formattedDate}"`
            ];
            csvContent += rowData.join(';') + '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const urlBlob = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', urlBlob);
        link.setAttribute('download', `Data_Sensor_${chamber}_${start||'awal'}_${end||'akhir'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(urlBlob);
    } catch (e) {
        alert('Gagal mengambil data untuk export CSV');
    } finally {
        btnExport.innerHTML = originalText;
        btnExport.disabled = false;
    }
}

async function changeMyPassword() {
    const oldPass = document.getElementById("cp-old").value;
    const newPass = document.getElementById("cp-new").value;
    if(!oldPass || !newPass) { alert("Harap isi kedua kolom password!"); return; }
    
    try {
        const username = sessionStorage.getItem("username");
        const res = await fetch(`http://localhost:3000/api/users/change-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, old_password: oldPass, new_password: newPass })
        });
        const json = await res.json();
        alert(json.pesan);
        if(res.ok) {
            document.getElementById("cp-old").value = '';
            document.getElementById("cp-new").value = '';
        }
    } catch(e) { alert("Gagal mengubah password."); }
}

async function fetchServerHealth() {
    try {
        const res = await fetch('http://localhost:3000/api/system/health');
        const data = await res.json();
        document.getElementById("sh-cpu").innerText = data.cpu;
        document.getElementById("sh-os").innerText = data.os;
        document.getElementById("sh-ram").innerText = data.ram;
        document.getElementById("sh-uptime").innerText = data.uptime;
        document.getElementById("sh-data").innerText = data.total_data.toLocaleString('id-ID');
        document.getElementById("sh-users").innerText = data.total_users;
    } catch(e) {
        if(document.getElementById("sh-uptime")) document.getElementById("sh-uptime").innerText = "Server Error";
    }
}

function updateChartVisibility() {
    if(!historyChartInstance) return;
    const checkboxes = document.querySelectorAll('.chart-filter');
    checkboxes.forEach((cb) => {
        const datasetIndex = parseInt(cb.value);
        historyChartInstance.data.datasets[datasetIndex].hidden = !cb.checked;
    });
    historyChartInstance.update();
}

function updateGlobalChartVisibility() {
    if(!myChart) return;
    const checkboxes = document.querySelectorAll('.global-chart-filter');
    checkboxes.forEach((cb) => {
        const datasetIndex = parseInt(cb.value);
        myChart.data.datasets[datasetIndex].hidden = !cb.checked;
    });
    myChart.update();
}

if (userRole !== 'master_admin') {
    if(document.getElementById('accountManagementCard')) document.getElementById('accountManagementCard').style.display = 'none';
    if(document.getElementById('databaseMaintenanceCard')) document.getElementById('databaseMaintenanceCard').style.display = 'none';
    if(document.getElementById('serverHealthCard')) document.getElementById('serverHealthCard').style.display = 'none';
}
if (userRole === 'user') {
    if(document.getElementById('exportDataCard')) document.getElementById('exportDataCard').style.display = 'none';
}

// --- DARK MODE LOGIC ---
function toggleDarkMode() {
    const isDark = document.getElementById('darkModeSwitch').checked;
    if (isDark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'false');
    }
}

// Restore dark mode on load
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    window.addEventListener('DOMContentLoaded', () => {
        const darkModeSwitch = document.getElementById('darkModeSwitch');
        if(darkModeSwitch) darkModeSwitch.checked = true;
    });
}

// --- THRESHOLD LOGIC ---
let thresholds = JSON.parse(localStorage.getItem('sensorThresholds')) || {
    enabled: true,
    suhu: 35,
    kelembapan: 80,
    tekanan: 900,
    metana: 2000
};

// Restore UI values
window.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('enableThresholds')) document.getElementById('enableThresholds').checked = thresholds.enabled;
    if(document.getElementById('thresh-suhu')) document.getElementById('thresh-suhu').value = thresholds.suhu;
    if(document.getElementById('thresh-kelembapan')) document.getElementById('thresh-kelembapan').value = thresholds.kelembapan;
    if(document.getElementById('thresh-tekanan')) document.getElementById('thresh-tekanan').value = thresholds.tekanan;
    if(document.getElementById('thresh-metana')) document.getElementById('thresh-metana').value = thresholds.metana;
});

function saveThresholds(showPopup = true) {
    thresholds = {
        enabled: document.getElementById('enableThresholds') ? document.getElementById('enableThresholds').checked : true,
        suhu: parseFloat(document.getElementById('thresh-suhu').value) || 35,
        kelembapan: parseFloat(document.getElementById('thresh-kelembapan').value) || 80,
        tekanan: parseFloat(document.getElementById('thresh-tekanan').value) || 900,
        metana: parseFloat(document.getElementById('thresh-metana').value) || 2000
    };
    localStorage.setItem('sensorThresholds', JSON.stringify(thresholds));
    
    // Matikan alert seketika jika dinonaktifkan
    if(!thresholds.enabled) {
        document.querySelectorAll('.chamber-node.alert-glow').forEach(el => el.classList.remove('alert-glow'));
    }
    
    if (showPopup) {
        alert("Pengaturan Ambang Batas berhasil disimpan!");
    }
}

function checkThresholds(chamberId, data) {
    const card = document.querySelector(`.chamber-node[data-id="${chamberId}"]`);
    if (!card) return;
    
    if (!thresholds.enabled) {
        card.classList.remove('alert-glow');
        return;
    }
    
    let hasAlert = false;
    if (parseFloat(data.suhu) > thresholds.suhu) hasAlert = true;
    if (parseFloat(data.kelembaban) > thresholds.kelembapan) hasAlert = true;
    if (parseFloat(data.tekanan) < thresholds.tekanan) hasAlert = true; // Tekanan biasanya drop jika bahaya
    if (parseFloat(data.gas_metana) > thresholds.metana) hasAlert = true;
    
    if (hasAlert) {
        card.classList.add('alert-glow');
    } else {
        card.classList.remove('alert-glow');
    }
}
