/* -------------------------------------------------------------
 * VANGUARD LABS TEAM TOOLS - CORE LOGIC & WEB SOCKETS
 * ------------------------------------------------------------- */

// 1. CONFIGURASI API URL (LOCAL & ONLINE)
// Ganti URL online di bawah setelah Anda mendeploy backend ke Render
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://vanguard-backend.onrender.com';

// 2. STATE MANAGEMENT GLOBAL
let tasksState = [];
let notesState = [];
let activeNoteId = null;
let currentUsername = localStorage.getItem('vanguard_username') || '';
let telemetryChart = null;
const maxChartPoints = 15;
let telemetryDataPoints = {
    labels: [],
    suhu: [],
    gas: [],
    kelembaban: []
};

// Hubungkan ke Socket.io Backend
const socket = io(API_URL);

// 3. INITIALIZATION
window.onload = function() {
    initClock();
    checkUsername();
    
    // Switch to default tab
    switchTab('dashboard');
    
    // Init Modules
    initTelemetryChart();
    loadIoTData();
    loadWeather();
    loadTasks();
    loadNotes();
    loadChatHistory();
    
    // Set Interval for checking telemetry & weather periodically (in case socket drops)
    setInterval(loadIoTData, 5000);
    setInterval(loadWeather, 60000);
};

// 4. CLOCK & NAVIGATION
function initClock() {
    const clockEl = document.getElementById('live-clock');
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('id-ID');
    }, 1000);
}

function switchTab(tabId) {
    // Hide all panes
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active-pane'));
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(el => el.classList.remove('active'));
    
    // Show selected pane
    const targetPane = document.getElementById(`tab-content-${tabId}`);
    if (targetPane) targetPane.classList.add('active-pane');
    
    // Set sidebar button active
    const btn = Array.from(document.querySelectorAll('.sidebar-nav .nav-link')).find(b => b.getAttribute('onclick').includes(tabId));
    if (btn) btn.classList.add('active');
    
    // Update headers
    const titleEl = document.getElementById('tab-title');
    const subtitleEl = document.getElementById('tab-subtitle');
    
    if (tabId === 'dashboard') {
        titleEl.innerText = 'Dashboard & IoT Status';
        subtitleEl.innerText = 'Monitoring and control hub for Vanguard Labs.';
    } else if (tabId === 'kanban') {
        titleEl.innerText = 'Kanban Board';
        subtitleEl.innerText = 'Manage team tasks and operational workflows.';
    } else if (tabId === 'wiki') {
        titleEl.innerText = 'Team Notes & Wiki';
        subtitleEl.innerText = 'Knowledge base, procedures, and notes.';
    } else if (tabId === 'chat') {
        titleEl.innerText = 'Live Team Chat';
        subtitleEl.innerText = 'Real-time coordination room for laboratory staff.';
        // Auto-scroll chat to bottom
        setTimeout(scrollChatToBottom, 100);
    }
}

// 5. USER MANAGEMENT
function checkUsername() {
    if (!currentUsername) {
        promptChangeUsername();
    } else {
        updateUserDisplay();
    }
}

function promptChangeUsername() {
    let name = prompt("Masukkan nama Anda untuk diidentifikasi di tim Vanguard:", currentUsername || "Operator");
    if (name) {
        name = name.trim();
        if (name.length > 0) {
            currentUsername = name;
            localStorage.setItem('vanguard_username', currentUsername);
            updateUserDisplay();
        }
    }
}

// 6. TELEMETRY CHART & IOT (REAL-TIME SENSOR DATA)
function initTelemetryChart() {
    const ctx = document.getElementById('iotLiveChart').getContext('2d');
    
    // Styling Gradients
    const purpleGrad = ctx.createLinearGradient(0, 0, 0, 200);
    purpleGrad.addColorStop(0, 'rgba(157, 78, 221, 0.4)');
    purpleGrad.addColorStop(1, 'rgba(157, 78, 221, 0.0)');

    const blueGrad = ctx.createLinearGradient(0, 0, 0, 200);
    blueGrad.addColorStop(0, 'rgba(0, 210, 255, 0.4)');
    blueGrad.addColorStop(1, 'rgba(0, 210, 255, 0.0)');

    telemetryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: telemetryDataPoints.labels,
            datasets: [
                {
                    label: 'Suhu (°C)',
                    data: telemetryDataPoints.suhu,
                    borderColor: '#00d2ff',
                    backgroundColor: blueGrad,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Gas Metana (PPM)',
                    data: telemetryDataPoints.gas,
                    borderColor: '#9d4edd',
                    backgroundColor: purpleGrad,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#8b92b6' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#00d2ff' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9d4edd' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f1f3fa' } }
            }
        }
    });
}

function updateUserDisplay() {
    document.getElementById('current-user-display').innerText = currentUsername;
    document.getElementById('current-user-role').innerText = 'Vanguard Staff';
    // Generate simple avatar
    const initials = currentUsername.substring(0, 2).toUpperCase();
    document.querySelector('.avatar').innerText = initials;
}

// Fetch weather from backend proxy
async function loadWeather() {
    try {
        const res = await fetch(`${API_URL}/api/weather`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data && data.current_weather) {
            document.getElementById('weather-temp').innerText = `${Math.round(data.current_weather.temperature)} °C`;
            // Simple mapping for weather code
            const code = data.current_weather.weathercode;
            let desc = 'Cerah';
            if (code > 0 && code <= 3) desc = 'Berawan';
            else if (code > 3 && code <= 48) desc = 'Kabut';
            else if (code > 48) desc = 'Hujan';
            document.getElementById('weather-desc').innerText = desc;
        }
    } catch (e) {
        document.getElementById('weather-desc').innerText = 'Gagal memuat cuaca';
    }
}

// REST fetch latest data
async function loadIoTData() {
    try {
        const res = await fetch(`${API_URL}/api/data/latest/Chamber 1`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        
        if (json.status === "berhasil" && json.data) {
            updateIoTUI(json.data);
        } else {
            setIoTStatusOffline();
        }
    } catch (e) {
        setIoTStatusOffline();
    }
}

function updateIoTUI(data) {
    const statusEl = document.getElementById('txt-chamber-status');
    statusEl.innerText = 'Online';
    statusEl.className = 'text-success fw-bold';
    
    document.getElementById('txt-chamber-temp').innerText = `${data.suhu.toFixed(1)} °C`;
    document.getElementById('txt-chamber-gas').innerText = `${data.gas_metana} PPM`;
    
    const syringeState = data.syringe_present === 1 ? 'Ada' : 'Kosong';
    // Kita anggap Fan state 0 / 1 didapat dari telemetry atau biarkan default
    document.getElementById('txt-actuators').innerText = `S: ${syringeState} | F: Active`;

    // Push into chart
    const nowStr = new Date(data.waktu_masuk || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Prevent duplicate entries
    if (telemetryDataPoints.labels.includes(nowStr)) return;

    telemetryDataPoints.labels.push(nowStr);
    telemetryDataPoints.suhu.push(data.suhu);
    telemetryDataPoints.gas.push(data.gas_metana);
    
    if (telemetryDataPoints.labels.length > maxChartPoints) {
        telemetryDataPoints.labels.shift();
        telemetryDataPoints.suhu.shift();
        telemetryDataPoints.gas.shift();
    }
    
    telemetryChart.update();
}

function setIoTStatusOffline() {
    const statusEl = document.getElementById('txt-chamber-status');
    statusEl.innerText = 'Offline';
    statusEl.className = 'text-danger fw-bold';
}

// Send command to ESP
async function sendActuatorCommand(name, value) {
    try {
        const payload = [{ chamber_id: "Chamber 1", command_name: name, command_value: value }];
        const res = await fetch(`${API_URL}/api/commands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "berhasil") {
            alert(`Perintah ${name} -> ${value} berhasil dikirim ke antrean ESP!`);
        } else {
            alert('Gagal mengirim perintah ke server.');
        }
    } catch (e) {
        alert('Tidak dapat menghubungi backend.');
    }
}

// Socket listener for real-time ESP updates
socket.on('newData', (payload) => {
    if (payload && payload.chamberId === 'Chamber 1') {
        const data = {
            suhu: payload.data.suhu,
            gas_metana: payload.data.gas_metana,
            syringe_present: payload.data.syringe_present,
            waktu_masuk: new Date().toISOString()
        };
        updateIoTUI(data);
    }
});

// 7. KANBAN BOARD (TASK MANAGEMENT)
async function loadTasks() {
    try {
        const res = await fetch(`${API_URL}/api/vanguard/tasks`);
        const json = await res.json();
        if (json.status === 'berhasil') {
            tasksState = json.data;
            renderTasks();
        }
    } catch (e) {
        console.error('Gagal mengambil data tugas:', e);
    }
}

function renderTasks() {
    const colTodo = document.getElementById('cards-todo');
    const colProgress = document.getElementById('cards-progress');
    const colReview = document.getElementById('cards-review');
    const colDone = document.getElementById('cards-done');
    
    // Clear columns
    colTodo.innerHTML = '';
    colProgress.innerHTML = '';
    colReview.innerHTML = '';
    colDone.innerHTML = '';
    
    let counts = { todo: 0, progress: 0, review: 0, done: 0 };
    
    tasksState.forEach(task => {
        counts[task.status]++;
        
        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.setAttribute('ondragstart', `dragTask(event, ${task.id})`);
        
        // Priority styling class
        const pClass = `priority-${task.priority}`;
        const dateStr = task.due_date ? new Date(task.due_date).toLocaleDateString('id-ID') : 'No Date';
        const assignee = task.assignee || 'Unassigned';

        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <h4>${task.title}</h4>
                <button class="btn btn-sm text-danger p-0 border-0" onclick="deleteTask(${task.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <p>${task.description || 'Tidak ada deskripsi'}</p>
            <div class="task-meta">
                <span class="priority-badge ${pClass}">${task.priority}</span>
                <span><i class="bi bi-person-fill me-1"></i>${assignee}</span>
                <span><i class="bi bi-calendar-event me-1"></i>${dateStr}</span>
            </div>
            <div class="d-flex gap-1 mt-2">
                ${task.status !== 'todo' ? `<button class="btn btn-outline-secondary btn-xs py-0 px-1 style="font-size:0.7rem;" onclick="moveTaskBtn(${task.id}, 'prev')"><i class="bi bi-chevron-left"></i></button>` : ''}
                <span class="flex-grow-1"></span>
                ${task.status !== 'done' ? `<button class="btn btn-outline-secondary btn-xs py-0 px-1 style="font-size:0.7rem;" onclick="moveTaskBtn(${task.id}, 'next')"><i class="bi bi-chevron-right"></i></button>` : ''}
            </div>
        `;
        
        if (task.status === 'todo') colTodo.appendChild(card);
        else if (task.status === 'progress') colProgress.appendChild(card);
        else if (task.status === 'review') colReview.appendChild(card);
        else if (task.status === 'done') colDone.appendChild(card);
    });
    
    // Update Counts badges
    document.getElementById('cnt-todo').innerText = counts.todo;
    document.getElementById('cnt-progress').innerText = counts.progress;
    document.getElementById('cnt-review').innerText = counts.review;
    document.getElementById('cnt-done').innerText = counts.done;
}

// Drag Handlers
function dragTask(e, id) {
    e.dataTransfer.setData('text/plain', id);
}

function allowDrop(e) {
    e.preventDefault();
}

async function dropTask(e, newStatus) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    const task = tasksState.find(t => t.id === id);
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        updateTaskOnServer(task);
    }
}

// Button-based task movement for convenience
function moveTaskBtn(id, direction) {
    const statuses = ['todo', 'progress', 'review', 'done'];
    const task = tasksState.find(t => t.id === id);
    if (task) {
        let index = statuses.indexOf(task.status);
        if (direction === 'next' && index < 3) {
            task.status = statuses[index + 1];
        } else if (direction === 'prev' && index > 0) {
            task.status = statuses[index - 1];
        }
        updateTaskOnServer(task);
    }
}

async function updateTaskOnServer(task) {
    try {
        const res = await fetch(`${API_URL}/api/vanguard/tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });
        const json = await res.json();
        if (json.status === 'berhasil') {
            loadTasks();
        }
    } catch (e) {
        console.error('Gagal memperbarui status tugas:', e);
    }
}

async function submitNewTask(e) {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    const priority = document.getElementById('task-priority').value;
    const due_date = document.getElementById('task-due').value;
    const assignee = document.getElementById('task-assignee').value.trim();
    
    try {
        const res = await fetch(`${API_URL}/api/vanguard/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, priority, due_date, assignee, status: 'todo' })
        });
        const json = await res.json();
        if (json.status === 'berhasil') {
            // Close modal
            const modalEl = document.getElementById('addTaskModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            // Clear form
            document.getElementById('addTaskForm').reset();
            loadTasks();
        }
    } catch (e) {
        alert('Gagal menambah tugas baru.');
    }
}

async function deleteTask(id) {
    if (!confirm('Hapus tugas ini?')) return;
    try {
        const res = await fetch(`${API_URL}/api/vanguard/tasks/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.status === 'berhasil') {
            loadTasks();
        }
    } catch (e) {
        console.error(e);
    }
}

// Socket real-time tasks listeners
socket.on('vanguardTaskCreated', (task) => {
    // If not already in array, push
    if (!tasksState.some(t => t.id === task.id)) {
        tasksState.push(task);
        renderTasks();
    }
});

socket.on('vanguardTaskUpdated', (task) => {
    const idx = tasksState.findIndex(t => t.id === task.id);
    if (idx !== -1) {
        tasksState[idx] = task;
        renderTasks();
    }
});

socket.on('vanguardTaskDeleted', (data) => {
    tasksState = tasksState.filter(t => t.id !== data.id);
    renderTasks();
});

// 8. TEAM NOTES / WIKI
async function loadNotes() {
    try {
        const res = await fetch(`${API_URL}/api/vanguard/notes`);
        const json = await res.json();
        if (json.status === 'berhasil') {
            notesState = json.data;
            renderNotesList();
        }
    } catch (e) {
        console.error(e);
    }
}

function renderNotesList() {
    const container = document.getElementById('notes-list-container');
    container.innerHTML = '';
    
    notesState.forEach(note => {
        const dateStr = new Date(note.updated_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const item = document.createElement('div');
        item.className = `list-group-item-vanguard ${activeNoteId === note.id ? 'active' : ''}`;
        item.onclick = () => selectNote(note.id);
        
        item.innerHTML = `
            <h5>${note.title}</h5>
            <p>Diupdate oleh ${note.created_by || 'Anonim'} • ${dateStr}</p>
        `;
        
        container.appendChild(item);
    });
}

function filterNotes() {
    const searchVal = document.getElementById('search-notes').value.toLowerCase();
    const container = document.getElementById('notes-list-container');
    container.innerHTML = '';
    
    const filtered = notesState.filter(note => 
        note.title.toLowerCase().includes(searchVal) || 
        note.content.toLowerCase().includes(searchVal)
    );
    
    filtered.forEach(note => {
        const dateStr = new Date(note.updated_at).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const item = document.createElement('div');
        item.className = `list-group-item-vanguard ${activeNoteId === note.id ? 'active' : ''}`;
        item.onclick = () => selectNote(note.id);
        
        item.innerHTML = `
            <h5>${note.title}</h5>
            <p>Diupdate oleh ${note.created_by || 'Anonim'} • ${dateStr}</p>
        `;
        
        container.appendChild(item);
    });
}

function selectNote(id) {
    activeNoteId = id;
    const note = notesState.find(n => n.id === id);
    if (note) {
        document.getElementById('edit-note-id').value = note.id;
        document.getElementById('edit-note-title').value = note.title;
        document.getElementById('edit-note-content').value = note.content;
        document.getElementById('btn-delete-note').disabled = false;
        
        // Highlight active item
        renderNotesList();
    }
}

function createNewNote() {
    activeNoteId = null;
    document.getElementById('edit-note-id').value = '';
    document.getElementById('edit-note-title').value = 'Catatan Baru';
    document.getElementById('edit-note-content').value = '';
    document.getElementById('btn-delete-note').disabled = true;
    
    // De-select list item
    document.querySelectorAll('.list-group-item-vanguard').forEach(el => el.classList.remove('active'));
}

async function saveCurrentNote() {
    const id = document.getElementById('edit-note-id').value;
    const title = document.getElementById('edit-note-title').value.trim();
    const content = document.getElementById('edit-note-content').value;
    const statusLabel = document.getElementById('note-save-status');

    if (!title) {
        alert('Judul catatan tidak boleh kosong!');
        return;
    }

    statusLabel.innerText = "Menyimpan...";
    
    try {
        let res, json;
        if (id) {
            // Update
            res = await fetch(`${API_URL}/api/vanguard/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content })
            });
        } else {
            // Create
            res = await fetch(`${API_URL}/api/vanguard/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, created_by: currentUsername })
            });
        }
        json = await res.json();
        
        if (json.status === 'berhasil') {
            statusLabel.innerText = "Tersimpan!";
            setTimeout(() => statusLabel.innerText = "", 2000);
            
            if (!id) {
                // If it was a new note, set active ID to the newly created one
                activeNoteId = json.data.id;
                document.getElementById('edit-note-id').value = activeNoteId;
                document.getElementById('btn-delete-note').disabled = false;
            }
            loadNotes();
        }
    } catch (e) {
        statusLabel.innerText = "Gagal menyimpan!";
        setTimeout(() => statusLabel.innerText = "", 2000);
    }
}

async function deleteCurrentNote() {
    const id = document.getElementById('edit-note-id').value;
    if (!id || !confirm('Hapus catatan ini?')) return;
    
    try {
        const res = await fetch(`${API_URL}/api/vanguard/notes/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.status === 'berhasil') {
            createNewNote();
            loadNotes();
        }
    } catch (e) {
        console.error(e);
    }
}

// Socket wiki notes real-time listeners
socket.on('vanguardNoteCreated', (note) => {
    if (!notesState.some(n => n.id === note.id)) {
        notesState.unshift(note);
        renderNotesList();
    }
});

socket.on('vanguardNoteUpdated', (note) => {
    const idx = notesState.findIndex(n => n.id === note.id);
    if (idx !== -1) {
        notesState[idx] = note;
        renderNotesList();
        
        // If current viewing is updated by someone else, load it
        if (activeNoteId === note.id) {
            document.getElementById('edit-note-title').value = note.title;
            document.getElementById('edit-note-content').value = note.content;
        }
    }
});

socket.on('vanguardNoteDeleted', (data) => {
    notesState = notesState.filter(n => n.id !== data.id);
    renderNotesList();
    if (activeNoteId === data.id) {
        createNewNote();
    }
});

// 9. TEAM LIVE CHAT
async function loadChatHistory() {
    try {
        const res = await fetch(`${API_URL}/api/vanguard/chat`);
        const json = await res.json();
        if (json.status === 'berhasil') {
            const container = document.getElementById('chat-messages-container');
            container.innerHTML = '';
            json.data.forEach(msg => {
                appendChatMessage(msg);
            });
            scrollChatToBottom();
        }
    } catch (e) {
        console.error(e);
    }
}

function sendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-msg-input');
    const msg = input.value.trim();
    if (msg.length === 0) return;
    
    // Emit via WebSocket
    socket.emit('vanguardSendMessage', {
        username: currentUsername,
        message: msg
    });
    
    input.value = '';
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages-container');
    const isMe = msg.username.toLowerCase() === currentUsername.toLowerCase();
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMe ? 'bubble-sent' : 'bubble-received'}`;
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    bubble.innerHTML = `
        <div class="chat-sender">${msg.username}</div>
        <div class="chat-text">${msg.message}</div>
        <div class="chat-time">${timeStr}</div>
    `;
    
    container.appendChild(bubble);
}

function scrollChatToBottom() {
    const container = document.getElementById('chat-messages-container');
    container.scrollTop = container.scrollHeight;
}

// Socket chat events
socket.on('vanguardMessageReceived', (msg) => {
    appendChatMessage(msg);
    scrollChatToBottom();
});
