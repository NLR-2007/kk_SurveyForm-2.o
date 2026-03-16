import { showToast, hashPassword } from "./auth.js";

// Global data to hold state
let surveyorsData = {};
let surveysData = {};
let adminsData = {};
let isCEO = false;

let cropChartInstance = null;
let districtChartInstance = null;
let surveyorChartInstance = null;

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-aBhSAfN3-8Vk-1LAYCkhpKBHkflLofPDVS2rI8sXXeQGQu3JxgvMpJYQ2giubccYnQ/exec';

let surveyMap = null;
let mapMarkers = [];

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const adminName = document.getElementById('admin-name');
    const adminAvatar = document.getElementById('admin-avatar');
    
    // Set user info
    const userData = JSON.parse(localStorage.getItem('userData')) || {};
    const role = String(userData.role || '').toLowerCase();
    
    if (userData.name) {
        adminName.textContent = userData.name + (role === 'ceo' ? ' (CEO)' : '');
        adminAvatar.textContent = String(userData.name).charAt(0).toUpperCase();
    }
    
    // Crucial: Show/Hide Admins nav based on role (case-insensitive)
    if (role === 'ceo') {
        isCEO = true;
        const navAdmins = document.getElementById('nav-admins');
        if (navAdmins) navAdmins.classList.remove('hidden');
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

    // Fetch Data from Google Sheets
    fetchAllData();

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

        const name = document.getElementById('surveyor-name').value.trim();
        const email = document.getElementById('surveyor-email').value.trim();
        const phone = document.getElementById('surveyor-phone').value.trim();
        const district = document.getElementById('surveyor-district').value.trim();
        const password = document.getElementById('surveyor-password').value;

        try {
            const hashedPassword = await hashPassword(password);
            const surveyorID = `SRV_${Date.now()}`;

            // Save to Google Sheets via create_user action
            const payload = {
                action: 'create_user',
                sheetName: 'Surveyors',
                rowData: [
                    surveyorID,
                    name,
                    email,
                    hashedPassword,
                    phone,
                    district,
                    true, // isActive
                    new Date().toISOString()
                ]
            };

            const res = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            const result = await res.json();
            if (result.status !== 'success') throw new Error(result.message || 'Failed to save surveyor.');

            fetchAllData();
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

            const name = document.getElementById('new-admin-name').value.trim();
            const email = document.getElementById('new-admin-email').value.trim();
            const password = document.getElementById('new-admin-password').value;

            try {
                const hashedPassword = await hashPassword(password);
                const adminID = `ADM_${Date.now()}`;
                const isAdminCEO = email.toLowerCase() === 'nlr@kk.com' || email.toLowerCase() === 'admin@kk.com';

                const payload = {
                    action: 'create_user',
                    sheetName: 'Admins',
                    rowData: [
                        adminID,
                        name,
                        email,
                        hashedPassword,
                        isAdminCEO ? 'ceo' : 'admin', // role
                        true, // isActive
                        new Date().toISOString()
                    ]
                };

                const res = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await res.json();
                if (result.status !== 'success') throw new Error(result.message || 'Failed to save admin.');

                fetchAllData();
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

// Master Fetch Function
async function fetchAllData() {
    try {
        await Promise.all([
            fetchSurveyors(),
            fetchSurveys(),
            isCEO ? fetchAdmins() : Promise.resolve()
        ]);
        
        // Update all UI elements once data is mapped
        updateSurveyorsTable();
        updateSurveyTable();
        updateDashboardStats();
        renderCharts();
        updateMapMarkers();
        if (isCEO) updateAdminsTable();
        
    } catch (err) {
        console.error("Error fetching data from Google Sheets:", err);
        showToast("Error loading dashboard data", "error");
    }
}

// Fetch Surveyors
async function fetchSurveyors() {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=Surveyors&_=${Date.now()}`);
    const rawText = await res.text();
    let result;
    try {
        result = JSON.parse(rawText);
    } catch(e) {
        console.error("Surveyors JSON Error:", rawText.substring(0, 100));
        return;
    }
    
    surveyorsData = {};
    if (result.status === 'success' && result.data) {
        result.data.forEach(s => {
            const surveyorID = s.SurveyorID || s.surveyorID || s.id;
            const name = s.Name || s.name;
            const email = s.Email || s.email;
            const phone = s.Phone || s.phone;
            const district = s.District || s.district;
            const isActive = s.IsActive !== undefined ? s.IsActive : s.isActive;
            const createdAt = s.CreatedAt || s.createdAt;

            if(surveyorID) {
                surveyorsData[surveyorID] = {
                    surveyorID: surveyorID,
                    name: name,
                    email: email,
                    phone: phone,
                    district: district,
                    isActive: isActive === true || isActive === 'TRUE' || isActive === 'true',
                    createdAt: createdAt
                };
            }
        });
    }
}

// Fetch Surveys
async function fetchSurveys() {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=Surveys&_=${Date.now()}`);
    const rawText = await res.text();
    let result;
    try {
        result = JSON.parse(rawText);
    } catch(e) {
        console.error("Surveys JSON Error:", rawText.substring(0, 100));
        return;
    }
    
    surveysData = {};
    if (result.status === 'success' && result.data) {
        result.data.forEach(survey => {
            const surveyID = survey.SurveyID || survey.surveyID || survey.id;
            const surveyDate = survey.Date || survey.date || survey.SurveyDate || survey.surveyDate;
            const farmerName = survey.FarmerName || survey.farmerName || survey.name;
            const phone = survey.Phone || survey.phone;
            const state = survey.State || survey.state;
            const district = survey.District || survey.district;
            const mandal = survey.Mandal || survey.mandal;
            const village = survey.Village || survey.village;
            const latitude = survey.Latitude || survey.latitude;
            const longitude = survey.Longitude || survey.longitude;
            const crop = survey.Crop || survey.crop;
            const landSize = survey.LandSize || survey.landSize;
            const suggestion = survey.Suggestion || survey.suggestion;
            const photoURL = survey.PhotoURL || survey.photoURL || survey.photoUrl;
            const audioURL = survey.AudioURL || survey.audioURL || survey.audioUrl;
            const surveyorID = survey.SurveyorID || survey.surveyorID;

            if (surveyID) {
                surveysData[surveyID] = {
                    surveyID: surveyID,
                    surveyDate: surveyDate,
                    farmerName: farmerName,
                    phone: phone,
                    state: state,
                    district: district,
                    mandal: mandal,
                    village: village,
                    latitude: latitude,
                    longitude: longitude,
                    crop: crop,
                    landSize: landSize,
                    suggestion: suggestion,
                    photoURL: photoURL,
                    audioURL: audioURL,
                    surveyorID: surveyorID
                };
            }
        });
    }
}

// Fetch Admins
async function fetchAdmins() {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=Admins&_=${Date.now()}`);
    const rawText = await res.text();
    let result;
    try {
        result = JSON.parse(rawText);
    } catch(e) {
        console.error("Admins JSON Error:", rawText.substring(0, 100));
        return;
    }
    
    adminsData = {};
    if (result.status === 'success' && result.data) {
        result.data.forEach(a => {
            const adminID = a.AdminID || a.adminID || a.id;
            const name = a.Name || a.name;
            const email = a.Email || a.email;
            const role = a.Role || a.role;
            const isActive = a.IsActive !== undefined ? a.IsActive : a.isActive;
            const createdAt = a.CreatedAt || a.createdAt;

            if(adminID) {
                adminsData[adminID] = {
                    adminID: adminID,
                    name: name,
                    email: email,
                    role: role,
                    isActive: isActive === true || isActive === 'TRUE' || isActive === 'true',
                    createdAt: createdAt
                };
            }
        });
    }
}

// Render Admins Table (CEO Only)
function updateAdminsTable() {
    const tbody = document.querySelector('#admins-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const currentUserData = JSON.parse(localStorage.getItem('userData'));
    const currentUserId = currentUserData ? (currentUserData.adminID || currentUserData.AdminID || currentUserData.uid || '') : '';

    Object.values(adminsData).forEach(admin => {
        const tr = document.createElement('tr');
        
        const adminID = admin.adminID;
        const adminName = admin.name || 'Unknown';
        const adminEmail = admin.email || 'No Email';
        const adminRole = String(admin.role || '').toLowerCase();
        const isActive = admin.isActive !== false;
        const createdAt = admin.createdAt;

        let statusBadge = `<span class="badge ${isActive ? 'badge-success' : 'badge-warning'}">${isActive ? 'Active' : 'Inactive'}</span>`;
        let toggleBtn = '';
        let actionBtn = '';

        const isSelf = String(adminID) === String(currentUserId);
        const isAdminCEO = adminRole === 'ceo';

        if (!isAdminCEO && !isSelf) {
            actionBtn = `
                <button class="btn btn-outline btn-sm delete-admin" data-id="${adminID}" data-email="${adminEmail}" style="padding: 6px 10px; border-color: var(--error-color); color: var(--error-color);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        }

        if (!isAdminCEO) {
            toggleBtn = `
                <button class="btn btn-outline btn-sm toggle-admin" data-id="${adminID}" data-email="${adminEmail}" data-active="${isActive}" style="padding: 6px 10px; margin-right: 5px;">
                    <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i> ${isActive ? 'Disable' : 'Enable'}
                </button>
            `;
        }

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="avatar" style="width: 32px; height: 32px; font-size: 0.875rem;">${adminName.charAt(0)}</div>
                    <div>
                        <div style="font-weight: 500;">${adminName} ${isAdminCEO ? '<span class="badge badge-primary" style="background:var(--gradient-primary);color:white">CEO</span>' : ''}</div>
                    </div>
                </div>
            </td>
            <td>${adminEmail}</td>
            <td>${createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A'}</td>
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

    // Delete Admin Event
    document.querySelectorAll('.delete-admin').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = btn;
            const id = btnEl.getAttribute('data-id');
            const email = btnEl.getAttribute('data-email');
            
            if (!confirm('Are you sure you want to permanently remove this admin? They will be deleted from Google Sheets AND Firebase.')) return;
            
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            try {
                // Delete from Google Sheets
                const sheetRes = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'delete_row',
                        sheetName: 'Admins',
                        keyColumn: 0,
                        keyValue: id
                    }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const sheetResult = await sheetRes.json();
                if (sheetResult.status === 'error' && !sheetResult.message.includes('Not found')) {
                    throw new Error('Sheet error: ' + sheetResult.message);
                }

                showToast('Admin permanently deleted!', 'success');
                fetchAllData();
            } catch(err) {
                showToast('Deletion failed: ' + err.message, 'error');
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fa-solid fa-trash"></i>';
            }
        });
    });

    // Toggle Admin Status Event
    document.querySelectorAll('.toggle-admin').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = btn;
            const id = btnEl.getAttribute('data-id');
            const email = btnEl.getAttribute('data-email');
            const isActive = btnEl.getAttribute('data-active') === 'true';
            btnEl.disabled = true;
            
            try {
                // Update Google Sheets
                const res = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'update_row',
                        sheetName: 'Admins',
                        keyColumn: 0,
                        keyValue: id,
                        updateData: { 5: !isActive } // IsActive is index 5 (col F: ID,Name,Email,Password,Role,IsActive)
                    }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await res.json();
                if (result.status === 'error') throw new Error('Sheet error: ' + result.message);

                showToast(`Admin account ${isActive ? 'disabled' : 'enabled'} successfully!`, 'success');
                fetchAllData();
            } catch(err) {
                showToast('Error updating status: ' + err.message, 'error');
                btnEl.disabled = false;
            }
        });
    });
}

// Render Surveyors Table
function updateSurveyorsTable() {
    const tbody = document.querySelector('#surveyors-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const counts = {};
    Object.values(surveysData).forEach(s => {
        counts[s.surveyorID] = (counts[s.surveyorID] || 0) + 1;
    });

    Object.values(surveyorsData).forEach(surveyor => {
        const tr = document.createElement('tr');
        const sID = surveyor.surveyorID;
        const sName = surveyor.name || 'Unknown Surveyor';
        const sEmail = surveyor.email || 'No Email';
        const sPhone = surveyor.phone || 'No Phone';
        const sDistrict = surveyor.district || 'All';
        const isActive = surveyor.isActive !== false;
        
        let statusBadge = `<span class="badge ${isActive ? 'badge-success' : 'badge-warning'}">${isActive ? 'Active' : 'Inactive'}</span>`;
        const sIDStr = String(sID || '');
        
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="avatar" style="width: 32px; height: 32px; font-size: 0.875rem;">${sName.charAt(0)}</div>
                    <div>
                        <div style="font-weight: 500;">${sName}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light);">${sIDStr ? sIDStr.slice(0, 8) + '...' : 'Unknown ID'}</div>
                    </div>
                </div>
            </td>
            <td>${sEmail}</td>
            <td>${sPhone}</td>
            <td><span class="badge badge-success">${sDistrict}</span></td>
            <td>${counts[sID] || 0}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-outline btn-sm toggle-surveyor" data-id="${sID}" data-email="${sEmail}" data-active="${isActive}" style="padding: 6px 10px;">
                        <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i> ${isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-outline btn-sm delete-surveyor" data-id="${sID}" data-email="${sEmail}" style="padding: 6px 10px; border-color: var(--error-color); color: var(--error-color);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Delete Surveyor Event (all admins can delete)
    document.querySelectorAll('.delete-surveyor').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = btn;
            const id = btnEl.getAttribute('data-id');
            const email = btnEl.getAttribute('data-email');
            
            if (!confirm('Are you sure you want to permanently remove this surveyor? They will be deleted from Google Sheets AND Firebase.')) return;
            
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            try {
                // Delete from Google Sheets
                const sheetRes = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'delete_row',
                        sheetName: 'Surveyors',
                        keyColumn: 0,
                        keyValue: id
                    }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const sheetResult = await sheetRes.json();
                if (sheetResult.status === 'error' && !sheetResult.message.includes('Not found')) {
                    throw new Error('Sheet error: ' + sheetResult.message);
                }

                showToast('Surveyor permanently deleted!', 'success');
                fetchAllData();
            } catch(err) {
                showToast('Deletion failed: ' + err.message, 'error');
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fa-solid fa-trash"></i>';
            }
        });
    });

    // Toggle Surveyor Status Event
    document.querySelectorAll('.toggle-surveyor').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = btn;
            const id = btnEl.getAttribute('data-id');
            const email = btnEl.getAttribute('data-email');
            const isActive = btnEl.getAttribute('data-active') === 'true';
            btnEl.disabled = true;
            
            try {
                // Update Google Sheets
                const res = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'update_row',
                        sheetName: 'Surveyors',
                        keyColumn: 0,
                        keyValue: id,
                        updateData: { 6: !isActive } // IsActive is index 6 (col G: ID,Name,Email,Password,Phone,District,IsActive)
                    }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await res.json();
                if (result.status === 'error') throw new Error('Sheet error: ' + result.message);

                showToast(`Surveyor account ${isActive ? 'disabled' : 'enabled'} successfully!`, 'success');
                fetchAllData();
            } catch(err) {
                showToast('Error updating status: ' + err.message, 'error');
                btnEl.disabled = false;
            }
        });
    });
}

// Render Surveys Table
function updateSurveyTable() {
    const tbody = document.querySelector('#surveys-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const surveyorFilter = document.getElementById('filter-surveyor').value.toLowerCase();
    const districtFilter = document.getElementById('filter-district').value.toLowerCase();
    const villageFilter = document.getElementById('filter-village').value.toLowerCase();
    const cropFilter = document.getElementById('filter-crop').value.toLowerCase();

    let surveys = Object.values(surveysData).sort((a,b) => new Date(b.surveyDate) - new Date(a.surveyDate));

    surveys.forEach(survey => {
        const sID = survey.surveyID;
        const sDate = survey.surveyDate ? new Date(survey.surveyDate).toLocaleDateString() : 'N/A';
        const farmerName = survey.farmerName || 'Unknown';
        const district = survey.district || 'N/A';
        const village = survey.village || 'N/A';
        const mandal = survey.mandal || 'N/A';
        const crop = survey.crop || 'N/A';
        
        const sInfo = surveyorsData[survey.surveyorID];
        const surveyorName = sInfo ? (sInfo.name || 'Unknown') : 'Unknown';
        
        if (surveyorFilter && !surveyorName.toLowerCase().includes(surveyorFilter)) return;
        if (districtFilter && !district.toLowerCase().includes(districtFilter)) return;
        if (villageFilter && !village.toLowerCase().includes(villageFilter)) return;
        if (cropFilter && !crop.toLowerCase().includes(cropFilter)) return;

        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${sDate}</td>
            <td>${farmerName}</td>
            <td>${village}, ${mandal}, ${district}</td>
            <td><span class="badge badge-warning">${crop}</span></td>
            <td>${surveyorName}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-secondary btn-sm view-survey" data-id="${sID}">View</button>
                    <button class="btn btn-outline btn-sm delete-survey" data-id="${sID}" style="border-color: var(--error-color); color: var(--error-color);"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // View Survey Events
    document.querySelectorAll('.view-survey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            viewSurveyDetails(id);
        });
    });

    // Delete Survey Events
    document.querySelectorAll('.delete-survey').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = btn;
            const id = btnEl.getAttribute('data-id');
            if (!confirm('Are you sure you want to PERMANENTLY delete this survey record?')) return;
            
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            try {
                await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'delete_row',
                        sheetName: 'Surveys',
                        keyColumn: 0,
                        keyValue: id
                    }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                showToast('Survey permanently deleted.', 'success');
                fetchAllData();
            } catch(err) {
                showToast('Error deleting survey: ' + err.message, 'error');
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fa-solid fa-trash"></i>';
            }
        });
    });
}

function viewSurveyDetails(surveyID) {
    const survey = surveysData[surveyID];
    if (!survey) return;

    const sInfo = surveyorsData[survey.surveyorID];
    const surveyorName = sInfo ? (sInfo.name || 'Unknown') : 'Unknown';
    const content = document.getElementById('survey-details-content');
    const date = survey.surveyDate ? new Date(survey.surveyDate).toLocaleString() : 'N/A';

    let audioHtml = '<p class="mt-2" style="color: var(--text-light);">No audio recorded.</p>';
    if (survey.audioURL) {
        if (typeof survey.audioURL === 'string' && survey.audioURL.includes('drive.google.com') && survey.audioURL.includes('id=')) {
            const fileId = survey.audioURL.split('id=')[1].split('&')[0];
            audioHtml = `
            <div class="mt-3">
                <p style="margin-bottom: 8px; font-weight: 600;">Farmer Suggestion Audio</p>
                <div style="width: 100%; height: 60px; overflow: hidden; border-radius: var(--radius); border: 1px solid var(--border-color); background: #eee;">
                    <iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="60" style="border: none;"></iframe>
                </div>
                <div class="mt-1" style="text-align: right;">
                    <a href="${survey.audioURL}" target="_blank" style="font-size: 0.8rem; color: var(--primary-color);">Open in Drive <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                </div>
            </div>`;
        } else {
            audioHtml = `
            <div class="mt-3">
                <p style="margin-bottom: 8px; font-weight: 600;">Farmer Suggestion Audio</p>
                <audio controls style="width: 100%;">
                    <source src="${survey.audioURL}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
        }
    }

    let photoHtml = '<p class="mt-2" style="color: var(--text-light);">No photo available.</p>';
    if (survey.photoURL) {
        if (typeof survey.photoURL === 'string' && survey.photoURL.includes('drive.google.com') && survey.photoURL.includes('id=')) {
            const fileId = survey.photoURL.split('id=')[1].split('&')[0];
            photoHtml = `
            <div class="mt-2" style="position: relative; border-radius: var(--radius); overflow: hidden; height: 350px; background-color: #eee; border: 1px solid var(--border-color);">
                <iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="100%" style="border: none;"></iframe>
            </div>
            <div class="mt-2 text-center">
                <a href="${survey.photoURL}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View Full Photo</a>
            </div>`;
        } else {
            photoHtml = `
            <div class="mt-2" style="position: relative; border-radius: var(--radius); overflow: hidden; max-height: 400px; background-color: #eee; border: 1px solid var(--border-color);">
                <img src="${survey.photoURL}" alt="Farmer Photo" style="width: 100%; height: auto; display: block;">
            </div>
            <div class="mt-2 text-center">
                <a href="${survey.photoURL}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View Full Photo</a>
            </div>`;
        }
    }

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
            <div>
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Farmer Info</h4>
                <p><strong>Name:</strong> ${survey.farmerName}</p>
                <p><strong>Phone:</strong> ${survey.phone}</p>
                <p><strong>Crop:</strong> <span class="badge badge-warning">${survey.crop}</span></p>
                <p><strong>Land Size:</strong> ${survey.landSize} Acres</p>
                
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 25px;">Location</h4>
                <p><strong>State:</strong> ${survey.state}</p>
                <p><strong>District:</strong> ${survey.district}</p>
                <p><strong>Mandal:</strong> ${survey.mandal}</p>
                <p><strong>Village:</strong> ${survey.village}</p>
                ${survey.latitude ? `<p style="margin-top:10px;"><a href="https://www.google.com/maps?q=${survey.latitude},${survey.longitude}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-location-dot"></i> View on Google Maps</a></p>` : ''}
            </div>
            <div>
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Survey Info</h4>
                <p><strong>Surveyor:</strong> ${surveyorName}</p>
                <p><strong>Date:</strong> ${date}</p>
                
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 25px;">Surveyor Suggestions</h4>
                <p style="font-style: italic; color: var(--text-light);">"${survey.suggestion || 'No suggestion provided.'}"</p>
                
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 25px;">Media</h4>
                ${photoHtml}
                ${audioHtml}
            </div>
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

// End of Admin JS script
