import { db, secondaryAuth } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, onValue, set, remove, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { showToast } from "./auth.js";

// Global data to hold state
let surveyorsData = {};
let surveysData = {};
let adminsData = {};
let isCEO = false;

let cropChartInstance = null;
let districtChartInstance = null;
let surveyorChartInstance = null;

let surveyMap = null;
let mapMarkers = [];

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const adminName = document.getElementById('admin-name');
    const adminAvatar = document.getElementById('admin-avatar');
    
    // Set user info
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
        if (userData.name) {
            adminName.textContent = userData.name + (userData.role === 'ceo' ? ' (CEO)' : '');
            adminAvatar.textContent = userData.name.charAt(0).toUpperCase();
        }
        if (userData.role === 'ceo') {
            isCEO = true;
            document.getElementById('nav-admins').classList.remove('hidden');
        }
    }
    
    // Sidebar Navigation
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const pages = document.querySelectorAll('.page-section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = e.currentTarget.getAttribute('data-page');
            
            navLinks.forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            pages.forEach(p => p.classList.add('hidden'));
            document.getElementById(`page-${targetPage}`).classList.remove('hidden');

            // If switching to dashboard, invalidate map size to fix Leaflet rendering glitch
            if(targetPage === 'dashboard' && surveyMap) {
                setTimeout(() => surveyMap.invalidateSize(), 100);
            }
        });
    });

    // Initialize Map
    initMap();

    // Fetch Data
    fetchSurveyors();
    fetchSurveys();
    if (isCEO) fetchAdmins();

    // Setup ADD Surveyor form
    const addSurveyorBtn = document.getElementById('open-add-surveyor-btn');
    const addSurveyorModal = document.getElementById('add-surveyor-modal');
    const closeSurveyorModal = document.getElementById('close-surveyor-modal');
    const addSurveyorForm = document.getElementById('add-surveyor-form');

    addSurveyorBtn.addEventListener('click', () => addSurveyorModal.classList.add('active'));
    closeSurveyorModal.addEventListener('click', () => {
        addSurveyorModal.classList.remove('active');
        addSurveyorForm.reset();
    });

    addSurveyorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-surveyor-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

        const name = document.getElementById('surveyor-name').value;
        const email = document.getElementById('surveyor-email').value;
        const phone = document.getElementById('surveyor-phone').value;
        const district = document.getElementById('surveyor-district').value;
        const password = document.getElementById('surveyor-password').value;

        try {
            // Create user in Auth (using secondary app to NOT logout admin)
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCredential.user.uid;

            // Save to Database
            await set(ref(db, `surveyors/${newUid}`), {
                surveyorID: newUid,
                name, email, phone, district,
                isActive: true,
                createdAt: new Date().toISOString()
            });

            showToast('Surveyor created successfully!', 'success');
            addSurveyorModal.classList.remove('active');
            addSurveyorForm.reset();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Create Surveyor Account';
        }
    });

    // Setup ADD Admin form (CEO Only)
    const addAdminBtn = document.getElementById('open-add-admin-btn');
    if (addAdminBtn) {
        const addAdminModal = document.getElementById('add-admin-modal');
        const closeAdminModal = document.getElementById('close-admin-modal');
        const addAdminForm = document.getElementById('add-admin-form');

        addAdminBtn.addEventListener('click', () => addAdminModal.classList.add('active'));
        closeAdminModal.addEventListener('click', () => {
            addAdminModal.classList.remove('active');
            addAdminForm.reset();
        });

        addAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-admin-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

            const name = document.getElementById('new-admin-name').value;
            const email = document.getElementById('new-admin-email').value;
            const password = document.getElementById('new-admin-password').value;

            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const newUid = userCredential.user.uid;

                await set(ref(db, `admins/${newUid}`), {
                    adminID: newUid,
                    name, email,
                    role: 'admin',
                    isActive: true,
                    createdAt: new Date().toISOString()
                });

                showToast('Admin created successfully!', 'success');
                addAdminModal.classList.remove('active');
                addAdminForm.reset();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Create Admin Account';
            }
        });
    }

    // Filtering Surveys
    const filters = ['filter-surveyor', 'filter-district', 'filter-village', 'filter-crop'];
    filters.forEach(f => {
        document.getElementById(f).addEventListener('input', updateSurveyTable);
    });

    // Setup Survey Modal
    document.getElementById('close-survey-modal').addEventListener('click', () => {
        document.getElementById('survey-details-modal').classList.remove('active');
        
        // Stop audio if playing
        const audioEl = document.getElementById('preview-audio-player');
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
    });

    // Setup Export
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
});

// Fetch Surveyors
function fetchSurveyors() {
    const surveyorsRef = ref(db, 'surveyors');
    onValue(surveyorsRef, (snapshot) => {
        surveyorsData = snapshot.val() || {};
        updateSurveyorsTable();
        updateDashboardStats();
    });
}

// Fetch Surveys
function fetchSurveys() {
    const surveysRef = ref(db, 'surveys');
    onValue(surveysRef, (snapshot) => {
        surveysData = snapshot.val() || {};
        updateSurveyTable();
        updateSurveyorsTable(); // Added to update counts live
        updateDashboardStats();
        renderCharts();
        updateMapMarkers();
    });
}

// Fetch Admins
function fetchAdmins() {
    const adminsRef = ref(db, 'admins');
    onValue(adminsRef, (snapshot) => {
        adminsData = snapshot.val() || {};
        updateAdminsTable();
    });
}

// Render Admins Table (CEO Only)
function updateAdminsTable() {
    const tbody = document.querySelector('#admins-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.values(adminsData).forEach(admin => {
        const tr = document.createElement('tr');
        const isCurrentCEO = admin.role === 'ceo';
        const isActive = admin.isActive !== false;
        
        let actionBtn = '';
        let statusBadge = `<span class="badge ${isActive ? 'badge-success' : 'badge-warning'}">${isActive ? 'Active' : 'Inactive'}</span>`;
        let toggleBtn = '';

        if (!isCurrentCEO) {
            actionBtn = `
                <button class="btn btn-outline btn-sm delete-admin" data-id="${admin.adminID}" style="padding: 6px 10px; border-color: var(--error-color); color: var(--error-color);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            
            toggleBtn = `
                <button class="btn btn-outline btn-sm toggle-admin" data-id="${admin.adminID}" data-active="${isActive}" style="padding: 6px 10px; margin-right: 5px;">
                    <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i> ${isActive ? 'Disable' : 'Enable'}
                </button>
            `;
        }

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="avatar" style="width: 32px; height: 32px; font-size: 0.875rem;">${admin.name.charAt(0)}</div>
                    <div>
                        <div style="font-weight: 500;">${admin.name} ${isCurrentCEO ? '<span class="badge badge-primary" style="background:var(--gradient-primary);color:white">CEO</span>' : ''}</div>
                    </div>
                </div>
            </td>
            <td>${admin.email}</td>
            <td>${new Date(admin.createdAt).toLocaleDateString()}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display: flex;">
                    ${toggleBtn}
                    ${actionBtn}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Delete Event
    document.querySelectorAll('.delete-admin').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(confirm('Are you sure you want to completely remove this admin from the system?')) {
                const id = e.currentTarget.getAttribute('data-id');
                try {
                    await remove(ref(db, `admins/${id}`));
                    showToast('Admin removed from database.', 'success');
                } catch(err) {
                    showToast('Error removing: ' + err.message, 'error');
                }
            }
        });
    });

    // Toggle Status Event
    document.querySelectorAll('.toggle-admin').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const isActive = e.currentTarget.getAttribute('data-active') === 'true';
            
            try {
                await set(ref(db, `admins/${id}/isActive`), !isActive);
                showToast(`Admin account ${isActive ? 'disabled' : 'enabled'}.`, 'success');
            } catch(err) {
                showToast('Error updating status: ' + err.message, 'error');
            }
        });
    });
}

// Render Surveyors Table
function updateSurveyorsTable() {
    const tbody = document.querySelector('#surveyors-table tbody');
    tbody.innerHTML = '';
    
    // Calculate survey count per surveyor
    const counts = {};
    Object.values(surveysData).forEach(s => {
        counts[s.surveyorID] = (counts[s.surveyorID] || 0) + 1;
    });

    Object.values(surveyorsData).forEach(surveyor => {
        const tr = document.createElement('tr');
        const isActive = surveyor.isActive !== false;
        let statusBadge = `<span class="badge ${isActive ? 'badge-success' : 'badge-warning'}">${isActive ? 'Active' : 'Inactive'}</span>`;

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="avatar" style="width: 32px; height: 32px; font-size: 0.875rem;">${surveyor.name.charAt(0)}</div>
                    <div>
                        <div style="font-weight: 500;">${surveyor.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light);">${surveyor.surveyorID.slice(0, 8)}...</div>
                    </div>
                </div>
            </td>
            <td>${surveyor.email}</td>
            <td>${surveyor.phone}</td>
            <td><span class="badge badge-success">${surveyor.district}</span></td>
            <td>${counts[surveyor.surveyorID] || 0}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display: flex;">
                    <button class="btn btn-outline btn-sm toggle-surveyor" data-id="${surveyor.surveyorID}" data-active="${isActive}" style="padding: 6px 10px; margin-right: 5px;">
                        <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i> ${isActive ? 'Disable' : 'Enable'}
                    </button>
                    ${isCEO ? `
                    <button class="btn btn-outline btn-sm delete-surveyor" data-id="${surveyor.surveyorID}" style="padding: 6px 10px; border-color: var(--error-color); color: var(--error-color);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Delete Event
    if (isCEO) {
        document.querySelectorAll('.delete-surveyor').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm('Are you sure you want to remove this surveyor from the database? (Note: Authentication deletion requires Firebase Admin SDK. This only removes DB access).')) {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        await remove(ref(db, `surveyors/${id}`));
                        showToast('Surveyor removed from database.', 'success');
                    } catch(err) {
                        showToast('Error removing: ' + err.message, 'error');
                    }
                }
            });
        });
    }

    // Toggle Status Event
    document.querySelectorAll('.toggle-surveyor').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const isActive = e.currentTarget.getAttribute('data-active') === 'true';
            
            try {
                await set(ref(db, `surveyors/${id}/isActive`), !isActive);
                showToast(`Surveyor account ${isActive ? 'disabled' : 'enabled'}.`, 'success');
            } catch(err) {
                showToast('Error updating status: ' + err.message, 'error');
            }
        });
    });
}

// Render Surveys Table
function updateSurveyTable() {
    const tbody = document.querySelector('#surveys-table tbody');
    tbody.innerHTML = '';

    const surveyorFilter = document.getElementById('filter-surveyor').value.toLowerCase();
    const districtFilter = document.getElementById('filter-district').value.toLowerCase();
    const villageFilter = document.getElementById('filter-village').value.toLowerCase();
    const cropFilter = document.getElementById('filter-crop').value.toLowerCase();

    // Convert object to array and sort by date descending
    let surveys = Object.values(surveysData).sort((a,b) => new Date(b.surveyDate) - new Date(a.surveyDate));

    surveys.forEach(survey => {
        const surveyorName = surveyorsData[survey.surveyorID] ? surveyorsData[survey.surveyorID].name : 'Unknown';
        
        // Filtering
        if (surveyorFilter && !surveyorName.toLowerCase().includes(surveyorFilter)) return;
        if (districtFilter && !survey.district.toLowerCase().includes(districtFilter)) return;
        if (villageFilter && !survey.village.toLowerCase().includes(villageFilter)) return;
        if (cropFilter && !survey.crop.toLowerCase().includes(cropFilter)) return;

        const tr = document.createElement('tr');
        const d = new Date(survey.surveyDate);
        
        tr.innerHTML = `
            <td>${d.toLocaleDateString()}</td>
            <td style="font-weight: 500;">${survey.farmerName}</td>
            <td>${survey.village}, ${survey.mandal}, ${survey.district}</td>
            <td><span class="badge badge-warning">${survey.crop}</span></td>
            <td>${surveyorName}</td>
            <td style="display: flex; gap: 5px;">
                <button class="btn btn-secondary view-survey" data-id="${survey.surveyID}" style="padding: 6px 12px; font-size: 0.875rem;">View</button>
                ${isCEO ? `<button class="btn btn-outline btn-sm delete-survey" data-id="${survey.surveyID}" style="padding: 6px 10px; border-color: var(--error-color); color: var(--error-color);"><i class="fa-solid fa-trash"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // View Survey Events
    document.querySelectorAll('.view-survey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            viewSurveyDetails(id);
        });
    });

    // Delete Survey Events
    if (isCEO) {
        document.querySelectorAll('.delete-survey').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm('Are you sure you want to PERMANENTLY delete this survey record?')) {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        await remove(ref(db, `surveys/${id}`));
                        showToast('Survey permanently deleted.', 'success');
                    } catch(err) {
                        showToast('Error deleting survey: ' + err.message, 'error');
                    }
                }
            });
        });
    }
}

function viewSurveyDetails(surveyID) {
    const survey = surveysData[surveyID];
    if (!survey) return;

    const surveyorName = surveyorsData[survey.surveyorID] ? surveyorsData[survey.surveyorID].name : 'Unknown';
    const content = document.getElementById('survey-details-content');
    
    // Format timestamp
    const date = new Date(survey.surveyDate).toLocaleString();

    let audioHtml = survey.audioURL ? `
        <div class="mt-2" style="background-color: var(--bg-color); padding: 15px; border-radius: var(--radius);">
            <p style="margin-bottom: 8px; font-weight: 600;">Farmer Suggestion Audio</p>
            <audio id="preview-audio-player" controls src="${survey.audioURL}" style="width: 100%;"></audio>
        </div>
    ` : '<p class="mt-2" style="color: var(--text-light);">No audio recorded.</p>';

    let mapLink = survey.latitude && survey.longitude ? 
        `<a href="https://www.google.com/maps?q=${survey.latitude},${survey.longitude}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-map"></i> View on Maps</a>` : 'No GPS';

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Farmer Details</h4>
                <p><strong>Name:</strong> ${survey.farmerName}</p>
                <p><strong>Phone:</strong> ${survey.phone}</p>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Surveyor:</strong> ${surveyorName}</p>

                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 20px;">Location Details</h4>
                <p><strong>State:</strong> ${survey.state}</p>
                <p><strong>District:</strong> ${survey.district}</p>
                <p><strong>Mandal:</strong> ${survey.mandal}</p>
                <p><strong>Village:</strong> ${survey.village}</p>
                <div class="mt-1">${mapLink}</div>
            </div>
            
            <div>
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Agriculture Details</h4>
                <p><strong>Crop:</strong> <span class="badge badge-warning">${survey.crop}</span></p>
                <p><strong>Land Size:</strong> ${survey.landSize} Acres</p>
                
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 20px;">Feedback</h4>
                <p><em>"${survey.suggestion || 'No text suggestion provided.'}"</em></p>
                ${audioHtml}
            </div>
        </div>
        
        <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 20px;">Enclosure</h4>
        <div style="text-align: center;">
            ${survey.photoURL ? `<a href="${survey.photoURL}" target="_blank"><img src="${survey.photoURL}" style="max-width: 100%; max-height: 300px; border-radius: var(--radius);"></a>` : '<p>No photo captured.</p>'}
        </div>
    `;

    document.getElementById('survey-details-modal').classList.add('active');
}

// Map Initialization
function initMap() {
    const mapContainer = document.getElementById('survey-map');
    if(!mapContainer) return;

    // Centered initially on India with low zoom
    surveyMap = L.map('survey-map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(surveyMap);
}

// Update Map Markers
function updateMapMarkers() {
    if(!surveyMap) return;

    // Clear existing markers
    mapMarkers.forEach(marker => surveyMap.removeLayer(marker));
    mapMarkers = [];

    const surveys = Object.values(surveysData);
    if(surveys.length === 0) return;

    const bounds = [];

    surveys.forEach(survey => {
        if(survey.latitude && survey.longitude) {
            const lat = parseFloat(survey.latitude);
            const lng = parseFloat(survey.longitude);
            const surveyorName = surveyorsData[survey.surveyorID] ? surveyorsData[survey.surveyorID].name : 'Unknown Surveyor';

            const popupContent = `
                <div style="font-family: 'Inter', sans-serif;">
                    <strong>${survey.farmerName}</strong><br>
                    <span>Crop: ${survey.crop}</span><br>
                    <span>Village: ${survey.village}</span><br>
                    <span>By: ${surveyorName}</span><br>
                    <button onclick="document.dispatchEvent(new CustomEvent('map-view-survey', {detail: '${survey.surveyID}'}))" style="margin-top: 5px; padding: 2px 5px; font-size: 0.75rem; cursor: pointer;">View Details</button>
                </div>
            `;

            const marker = L.marker([lat, lng])
                .bindPopup(popupContent)
                .addTo(surveyMap);
            
            mapMarkers.push(marker);
            bounds.push([lat, lng]);
        }
    });

    // Adjust map to fit all pins if we have any
    if(bounds.length > 0) {
        surveyMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
}

// Listen for Custom Event triggered by Map Popup buttons
document.addEventListener('map-view-survey', (e) => {
    viewSurveyDetails(e.detail);
});

// Update Top level stats
function updateDashboardStats() {
    const surveyCount = Object.keys(surveysData).length;
    const surveyorCount = Object.keys(surveyorsData).length;
    
    document.getElementById('total-surveys').innerText = surveyCount;
    document.getElementById('total-surveyors').innerText = surveyorCount;

    if (surveyCount > 0) {
        const cropCounts = {};
        Object.values(surveysData).forEach(s => {
            cropCounts[s.crop] = (cropCounts[s.crop] || 0) + 1;
        });

        const topCrop = Object.keys(cropCounts).reduce((a, b) => cropCounts[a] > cropCounts[b] ? a : b);
        document.getElementById('top-crop').innerText = topCrop;
    }
}

// Analytics Charts setup
function renderCharts() {
    const surveys = Object.values(surveysData);
    if(surveys.length === 0) return;

    // Destroy old instances
    if(cropChartInstance) cropChartInstance.destroy();
    if(districtChartInstance) districtChartInstance.destroy();
    if(surveyorChartInstance) surveyorChartInstance.destroy();

    // Chart Options
    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'bottom' }
        }
    };
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e0e0e0' : '#333333';
    
    Chart.defaults.color = textColor;

    // 1. Crop Distribution
    const cropCounts = {};
    surveys.forEach(s => cropCounts[s.crop] = (cropCounts[s.crop] || 0) + 1);
    
    const cropCtx = document.getElementById('cropChart').getContext('2d');
    cropChartInstance = new Chart(cropCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(cropCounts),
            datasets: [{
                data: Object.values(cropCounts),
                backgroundColor: ['#4caf50', '#ff9800', '#2196f3', '#e91e63', '#9c27b0', '#795548', '#00bcd4']
            }]
        },
        options: chartOptions
    });

    // 2. District Distribution
    const districtCounts = {};
    surveys.forEach(s => districtCounts[s.district] = (districtCounts[s.district] || 0) + 1);
    
    const distCtx = document.getElementById('districtChart').getContext('2d');
    districtChartInstance = new Chart(distCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(districtCounts),
            datasets: [{
                label: 'Surveys',
                data: Object.values(districtCounts),
                backgroundColor: '#2e7d32'
            }]
        },
        options: { ...chartOptions, scales: { y: { beginAtZero: true } } }
    });

    // 3. Surveyor Performance
    const surveyorCounts = {};
    surveys.forEach(s => {
        const name = surveyorsData[s.surveyorID] ? surveyorsData[s.surveyorID].name : 'Unknown';
        surveyorCounts[name] = (surveyorCounts[name] || 0) + 1;
    });

    const survCtx = document.getElementById('surveyorChart').getContext('2d');
    surveyorChartInstance = new Chart(survCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(surveyorCounts),
            datasets: [{
                data: Object.values(surveyorCounts),
                backgroundColor: ['#3f51b5', '#009688', '#ffc107', '#ff5722', '#607d8b']
            }]
        },
        options: chartOptions
    });
}

// Export to CSV
function exportToCSV() {
    const surveys = Object.values(surveysData);
    if(surveys.length === 0) return showToast('No data to export', 'warning');

    const headers = ['Survey ID', 'Date', 'Farmer Name', 'Phone', 'State', 'District', 'Mandal', 'Village', 'Crop', 'Land Size (Acres)', 'Suggestion', 'Latitude', 'Longitude', 'Surveyor ID', 'Surveyor Name'];
    
    let csvContent = headers.join(',') + '\n';

    surveys.forEach(s => {
        const surveyorName = surveyorsData[s.surveyorID] ? surveyorsData[s.surveyorID].name : 'Unknown';
        
        let row = [
            `"${s.surveyID}"`,
            `"${s.surveyDate}"`,
            `"${s.farmerName}"`,
            `"${s.phone}"`,
            `"${s.state}"`,
            `"${s.district}"`,
            `"${s.mandal}"`,
            `"${s.village}"`,
            `"${s.crop}"`,
            s.landSize,
            `"${(s.suggestion || '').replace(/"/g, '""')}"`,
            s.latitude || '',
            s.longitude || '',
            `"${s.surveyorID}"`,
            `"${surveyorName}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `survey_data_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
