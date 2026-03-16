import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { showToast } from "./auth.js";
import { syncOfflineData } from "./survey.js";

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxF9f1Dm_AlufYqNEctWyGrVSLpA4oSwbm_e9xhmkMpm-j1Hm7ZLQ6yWPQELFzd0-kQ/exec';
let userSurveys = {};

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const surveyorName = document.getElementById('surveyor-name');
    const surveyorAvatar = document.getElementById('surveyor-avatar');
    
    // Set user info
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
        if(userData.name) {
            surveyorName.textContent = userData.name;
            surveyorAvatar.textContent = userData.name.charAt(0).toUpperCase();
        }
        fetchMySurveys(userData.uid || userData.surveyorID);
    }

    // Modal Close
    document.getElementById('close-survey-modal').addEventListener('click', () => {
        document.getElementById('survey-details-modal').classList.remove('active');
        const audioEl = document.getElementById('preview-audio-player');
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
    });

    // Sync button
    document.getElementById('sync-btn').addEventListener('click', () => {
        syncOfflineData();
    });
});

async function fetchMySurveys(surveyorID) {
    if(!surveyorID) return;
    
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=Surveys`);
        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch(e) {
            console.error("My Surveys JSON Error:", rawText.substring(0, 100));
            return;
        }

        if (result.status === 'success') {
            const data = result.data;
            userSurveys = {}; // Reset

            if (data && data.length > 0) {
                data.forEach(survey => {
                    if (survey.SurveyorID === surveyorID) {
                        // Map Sheet Headers to JS Object Keys
                        userSurveys[survey.SurveyID] = {
                            surveyID: survey.SurveyID,
                            surveyDate: survey.Date,
                            farmerName: survey.FarmerName,
                            phone: survey.Phone,
                            state: survey.State,
                            district: survey.District,
                            mandal: survey.Mandal,
                            village: survey.Village,
                            latitude: survey.Latitude,
                            longitude: survey.Longitude,
                            crop: survey.Crop,
                            landSize: survey.LandSize,
                            suggestion: survey.Suggestion,
                            photoURL: survey.PhotoURL,
                            audioURL: survey.AudioURL,
                            surveyorID: survey.SurveyorID
                        };
                    }
                });
            }
            
            updateMySurveysTable();
            
            // Update Stats
            document.getElementById('my-total-surveys').innerText = Object.keys(userSurveys).length;
        } else {
            console.error('Error fetching from Google Sheets:', result.message);
        }
    } catch (error) {
         console.error('Error fetching surveys:', error);
    }
}

function updateMySurveysTable() {
    const tbody = document.querySelector('#my-surveys-table tbody');
    tbody.innerHTML = '';

    // Also get pending from localStorage
    const pendingSurveys = JSON.parse(localStorage.getItem('offlineSurveys') || '[]');
    
    // Convert DB surveys to array and prepend pending ones
    let surveys = Object.values(userSurveys).map(s => ({...s, status: 'synced'}));
    let allSurveys = [...pendingSurveys.map(s => ({...s, status: 'pending'})), ...surveys];
    
    // Sort by date descend
    allSurveys.sort((a,b) => new Date(b.surveyDate) - new Date(a.surveyDate));

    allSurveys.forEach(survey => {
        const tr = document.createElement('tr');
        const d = new Date(survey.surveyDate);
        
        const statusBadge = survey.status === 'pending' 
            ? '<span class="badge" style="background-color: var(--secondary-color); color: #000;">Pending Sync</span>'
            : '<span class="badge badge-success">Synced</span>';
            
        tr.innerHTML = `
            <td>${d.toLocaleDateString()}</td>
            <td style="font-weight: 500;">${survey.farmerName}</td>
            <td>${survey.village}, ${survey.mandal}</td>
            <td><span class="badge badge-warning">${survey.crop}</span></td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary view-survey" data-id="${survey.surveyID || survey.tempId}" style="padding: 6px 12px; font-size: 0.875rem;">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add event listeners recursively
    document.querySelectorAll('.view-survey').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const survey = allSurveys.find(s => s.surveyID === id || s.tempId === id);
            if(survey) viewSurveyDetails(survey);
        });
    });
}

function viewSurveyDetails(survey) {
    const content = document.getElementById('survey-details-content');
    const date = new Date(survey.surveyDate).toLocaleString();

    let audioHtml = '<p class="mt-2" style="color: var(--text-light);">No audio recorded.</p>';
    if (survey.audioURL) {
        if (typeof survey.audioURL === 'string' && survey.audioURL.includes('drive.google.com') && survey.audioURL.includes('id=')) {
            const fileId = survey.audioURL.split('id=')[1].split('&')[0];
            audioHtml = `
            <div class="mt-2" style="background-color: var(--bg-color); padding: 15px; border-radius: var(--radius);">
                <p style="margin-bottom: 8px; font-weight: 600;">Farmer Suggestion Audio</p>
                <div style="position: relative; width: 100%; height: 80px; overflow: hidden; border-radius: var(--radius); border: 1px solid var(--border-color);">
                   <iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="80" style="border: none;"></iframe>
                </div>
                <div class="mt-1" style="text-align: right;">
                    <a href="${survey.audioURL}" target="_blank" style="font-size: 0.8rem; color: var(--primary-color);">Open in Google Drive <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                </div>
            </div>`;
        } else {
             audioHtml = `
            <div class="mt-2" style="background-color: var(--bg-color); padding: 15px; border-radius: var(--radius);">
                <p style="margin-bottom: 8px; font-weight: 600;">Farmer Suggestion Audio</p>
                <audio id="preview-audio-player" controls src="${survey.audioURL}" style="width: 100%;"></audio>
            </div>`;
        }
    }

    let mapLink = (survey.latitude && survey.longitude) ? 
        `<a href="https://www.google.com/maps?q=${survey.latitude},${survey.longitude}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-map"></i> View on Maps</a>` : 'No GPS';

    const statusMsg = survey.status === 'pending' 
        ? '<div class="mb-2 p-2" style="background-color: var(--secondary-color); color: #000; border-radius: var(--radius);"><i class="fa-solid fa-triangle-exclamation"></i> This survey is saved offline. Connect to internet and click Sync Data. Media files cannot be previewed until synced.</div>'
        : '';

    let photoDisplay = '<p>No photo captured.</p>';
    if (survey.photoURL) {
        if (typeof survey.photoURL === 'string' && survey.photoURL.includes('drive.google.com') && survey.photoURL.includes('id=')) {
            const fileId = survey.photoURL.split('id=')[1].split('&')[0];
            photoDisplay = `
            <div style="position: relative; width: 100%; max-width: 400px; height: 350px; margin: 0 auto; overflow: hidden; border-radius: var(--radius); border: 1px solid var(--border-color);">
                <iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="100%" style="border: none;"></iframe>
            </div>
            <div class="mt-2 text-center">
                <a href="${survey.photoURL}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Full Image</a>
            </div>`;
        } else {
            photoDisplay = `<a href="${survey.photoURL}" target="_blank" title="Click to view full image"><img src="${survey.photoURL}" style="max-width: 100%; max-height: 300px; border-radius: var(--radius); border: 1px solid var(--border-color);"></a>`;
        }
    }

    content.innerHTML = `
        ${statusMsg}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Farmer Details</h4>
                <p><strong>Name:</strong> ${survey.farmerName}</p>
                <p><strong>Phone:</strong> ${survey.phone}</p>
                <p><strong>Date:</strong> ${date}</p>

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
                ${survey.status === 'synced' ? audioHtml : '<p class="mt-2" style="color: var(--text-light);">Audio will be available after sync.</p>'}
            </div>
        </div>
        
        <h4 style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; margin-top: 20px;">Enclosure</h4>
        <div style="text-align: center;">
            ${photoDisplay}
        </div>
    `;

    document.getElementById('survey-details-modal').classList.add('active');
}
