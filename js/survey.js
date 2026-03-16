import { db } from "./firebase-config.js";
import { showToast } from "./auth.js";

// State
let photoBase64 = null;
let audioBlob = null;
let mediaRecorder = null;
let audioChunks = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Geolocation
    const getLocationBtn = document.getElementById('get-location-btn');
    if (getLocationBtn) {
        getLocationBtn.addEventListener('click', () => {
            if ("geolocation" in navigator) {
                getLocationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting...';
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        document.getElementById('latitude').value = lat;
                        document.getElementById('longitude').value = lng;
                        document.getElementById('location-status').innerHTML = `<span style="color: var(--success-color);"><i class="fa-solid fa-check"></i> Captured: ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`;
                        getLocationBtn.innerHTML = '<i class="fa-solid fa-location-dot"></i> Update Location';
                        
                        // Reverse Geocode
                        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
                            .then(res => res.json())
                            .then(data => {
                                if(data && data.address) {
                                    const addr = data.address;
                                    if(addr.state) {
                                        const stateSelect = document.getElementById('state');
                                        Array.from(stateSelect.options).forEach(opt => {
                                            if(opt.value.toLowerCase() === addr.state.toLowerCase()) stateSelect.value = opt.value;
                                        });
                                    }
                                    if(addr.state_district || addr.county) document.getElementById('district').value = addr.state_district || addr.county;
                                    if(addr.county || addr.suburb || addr.region) document.getElementById('mandal').value = addr.county || addr.suburb || addr.region;
                                    if(addr.village || addr.town || addr.city) document.getElementById('village').value = addr.village || addr.town || addr.city;
                                    showToast('Location auto-filled from GPS.', 'success');
                                }
                            }).catch(err => console.log('Reverse geocoding failed:', err));
                    },
                    (error) => {
                        getLocationBtn.innerHTML = '<i class="fa-solid fa-location-dot"></i> Get Current Location';
                        showToast(`Location error: ${error.message}`, 'error');
                    },
                    { enableHighAccuracy: true }
                );
            } else {
                showToast("Geolocation is not supported by this browser.", "error");
            }
        });
    }

    // 2. Photo Capture
    const triggerPhotoBtn = document.getElementById('trigger-photo-btn');
    const photoInput = document.getElementById('photo-input');
    const photoPreview = document.getElementById('photo-preview');

    if (triggerPhotoBtn) {
        triggerPhotoBtn.addEventListener('click', () => photoInput.click());
        
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Ensure we have GPS first for the watermark
                const lat = document.getElementById('latitude').value;
                const lng = document.getElementById('longitude').value;
                
                if(!lat || !lng) {
                    showToast('Please capture GPS Location before taking a photo to enable watermarking.', 'error');
                    photoInput.value = ''; // Reset input
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        // Create a canvas to draw the image and watermark
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Set canvas dimensions to image dimensions
                        canvas.width = img.width;
                        canvas.height = img.height;
                        
                        // Draw original image
                        ctx.drawImage(img, 0, 0);
                        
                        // Prepare Watermark Styling
                        // Scale font size based on image size (e.g., 5% of height)
                        const fontSize = Math.max(24, Math.floor(img.height * 0.05));
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        
                        // Grab location data
                        const state = document.getElementById('state').value || 'Unknown State';
                        const district = document.getElementById('district').value || 'Unknown District';
                        const mandal = document.getElementById('mandal').value || 'Unknown Mandal';
                        const village = document.getElementById('village').value || 'Unknown Village';

                        // Add a semi-transparent dark background for text readability
                        const padding = fontSize * 0.5;
                        const textHeight = (fontSize * 1.5) + (fontSize * 0.7 * 1.2 * 3); // 1 main line + 3 sub lines
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                        ctx.fillRect(0, img.height - textHeight - (padding * 2), img.width, textHeight + (padding * 2));

                        // Draw Watermark Text
                        ctx.fillStyle = '#fdd835'; // Kisaan Krushi Golden Yellow
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        let currentY = img.height - textHeight - padding;
                        
                        ctx.fillText('Kisaan Krushi', padding, currentY);
                        currentY += fontSize * 1.3;
                        
                        ctx.fillStyle = '#ffffff'; // White for coordinates
                        ctx.font = `${fontSize * 0.7}px sans-serif`;
                        
                        ctx.fillText(`Loc: ${village}, ${mandal}, ${district}, ${state}`, padding, currentY);
                        currentY += fontSize * 0.8;
                        
                        ctx.fillText(`GPS: ${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`, padding, currentY);
                        currentY += fontSize * 0.8;
                        
                        const dateStr = new Date().toLocaleString();
                        ctx.fillText(`Date: ${dateStr}`, padding, currentY);

                        // Extract watermarked image
                        // Use JPEG to save space, quality 0.8
                        photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
                        
                        // Update UI Preview
                        photoPreview.src = photoBase64;
                        photoPreview.classList.remove('hidden');
                        triggerPhotoBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Retake Photo';
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 3. Audio Recording
    const startRecordBtn = document.getElementById('start-record-btn');
    const stopRecordBtn = document.getElementById('stop-record-btn');
    const audioPlaybackContainer = document.getElementById('audio-playback-container');
    const audioPreview = document.getElementById('audio-preview');

    if (startRecordBtn) {
        startRecordBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    audioPreview.src = audioUrl;
                    audioPlaybackContainer.classList.remove('hidden');
                    
                    // Stop tracks
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                startRecordBtn.classList.add('hidden');
                stopRecordBtn.classList.remove('hidden');
                
            } catch (err) {
                showToast(`Microphone access denied: ${err.message}`, 'error');
            }
        });

        stopRecordBtn.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                stopRecordBtn.classList.add('hidden');
                startRecordBtn.classList.remove('hidden');
                startRecordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Rerecord Audio';
            }
        });
    }

    // 4. Form Submission
    const surveyForm = document.getElementById('survey-form');
    if (surveyForm) {
        surveyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Validate Geolocation & Photo
            if (!document.getElementById('latitude').value || !document.getElementById('longitude').value) {
                return showToast('Please capture GPS location first.', 'error');
            }
            if (!photoBase64) {
                return showToast('Please capture a photo with the farmer.', 'error');
            }

            const submitBtn = document.getElementById('submit-survey-btn');
            const submitText = document.getElementById('submit-text');
            const submitSpinner = document.getElementById('submit-spinner');
            
            submitBtn.disabled = true;
            submitText.classList.add('hidden');
            submitSpinner.classList.remove('hidden');

            const userData = JSON.parse(localStorage.getItem('userData'));
            const surveyorID = userData.uid || userData.surveyorID;
            
            try {
                // Prepare Survey Data Document
                const surveyID = `SRV_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                let finalPhotoURL = null;
                let finalAudioURL = null;

                // Upload Media to Google Drive via Apps Script
                const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxF9f1Dm_AlufYqNEctWyGrVSLpA4oSwbm_e9xhmkMpm-j1Hm7ZLQ6yWPQELFzd0-kQ/exec';

                if (photoBase64) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Photo to Drive...';
                    const photoPayload = {
                        action: 'upload_file',
                        mimeType: 'image/jpeg',
                        fileName: `Photo_${surveyID}.jpg`,
                        base64: photoBase64
                    };
                    
                    try {
                        const response = await fetch(GOOGLE_SCRIPT_URL, {
                            method: 'POST',
                            body: JSON.stringify(photoPayload),
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // text/plain prevents CORS preflight issues sometimes
                        });
                        const rawText = await response.text();
                        console.log("Photo Upload Raw Response:", rawText);
                        
                        let result;
                        try {
                            result = JSON.parse(rawText);
                        } catch(jsonErr) {
                            console.error("Failed to parse JSON for Photo Upload:", jsonErr);
                            throw new Error('Server returned invalid data format for photo: ' + rawText.substring(0, 50));
                        }

                        if (result.status === 'success') {
                            finalPhotoURL = result.url;
                        } else {
                            throw new Error('Photo upload failed: ' + result.message);
                        }
                    } catch (err) {
                        console.error('Drive Upload Error (Photo):', err);
                        throw new Error('Failed to upload photo to Google Drive. Check console for details: ' + err.message);
                    }
                }

                if (audioBlob) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading Audio to Drive...';
                    const audioBase64 = await convertBlobToBase64(audioBlob);
                    const audioPayload = {
                        action: 'upload_file',
                        mimeType: 'audio/webm',
                        fileName: `Audio_${surveyID}.webm`,
                        base64: audioBase64
                    };
                    
                    try {
                        const response = await fetch(GOOGLE_SCRIPT_URL, {
                            method: 'POST',
                            body: JSON.stringify(audioPayload),
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                        });
                        
                        const rawText = await response.text();
                        console.log("Audio Upload Raw Response:", rawText);
                        
                        let result;
                        try {
                            result = JSON.parse(rawText);
                        } catch(jsonErr) {
                            console.error("Failed to parse JSON for Audio Upload:", jsonErr);
                             throw new Error('Server returned invalid data format for audio: ' + rawText.substring(0, 50));
                        }

                        if (result.status === 'success') {
                            finalAudioURL = result.url;
                        } else {
                            throw new Error('Audio upload failed: ' + result.message);
                        }
                    } catch (err) {
                        console.error('Drive Upload Error (Audio):', err);
                        throw new Error('Failed to upload audio to Google Drive. Check console for details: ' + err.message);
                    }
                }

                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Data to Google Sheets...';
                
                const dateIso = new Date().toISOString();
                const surveyData = {
                    surveyID: surveyID,
                    farmerName: document.getElementById('farmer-name').value,
                    phone: document.getElementById('phone').value,
                    state: document.getElementById('state').value,
                    district: document.getElementById('district').value,
                    mandal: document.getElementById('mandal').value,
                    village: document.getElementById('village').value,
                    latitude: parseFloat(document.getElementById('latitude').value),
                    longitude: parseFloat(document.getElementById('longitude').value),
                    crop: document.getElementById('crop').value,
                    landSize: parseFloat(document.getElementById('land-size').value),
                    suggestion: document.getElementById('suggestion').value,
                    photoURL: finalPhotoURL,
                    audioURL: finalAudioURL,
                    surveyorID: surveyorID,
                    surveyDate: dateIso
                };

                // Create the Array format exactly matching the Sheet Headers
                // Headers: SurveyID, Date, FarmerName, Phone, State, District, Mandal, Village, Latitude, Longitude, Crop, LandSize, Suggestion, PhotoURL, AudioURL, SurveyorID
                const rowData = [
                    surveyData.surveyID,
                    surveyData.surveyDate,
                    surveyData.farmerName,
                    surveyData.phone,
                    surveyData.state,
                    surveyData.district,
                    surveyData.mandal,
                    surveyData.village,
                    surveyData.latitude,
                    surveyData.longitude,
                    surveyData.crop,
                    surveyData.landSize,
                    surveyData.suggestion,
                    surveyData.photoURL || '',
                    surveyData.audioURL || '',
                    surveyData.surveyorID
                ];

                // Check Network Status
                if (navigator.onLine) {
                    await submitSurveyOnline(rowData, GOOGLE_SCRIPT_URL);
                    showToast('Survey saved to Google Sheets successfully!', 'success');
                } else {
                    saveSurveyOffline(surveyData);
                    showToast('Saved offline. Sync when connected to internet.', 'warning');
                }

                // Reset Form
                surveyForm.reset();
                photoBase64 = null;
                audioBlob = null;
                document.getElementById('photo-preview').classList.add('hidden');
                document.getElementById('audio-playback-container').classList.add('hidden');
                document.getElementById('location-status').innerText = 'Not captured';
                triggerPhotoBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Capture Photo';
                startRecordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Recording';
                
                // Allow sync UI to update state
                window.dispatchEvent(new Event('storage'));

            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitText.classList.remove('hidden');
                submitSpinner.classList.add('hidden');
            }
        });
    }
});

// Submit Online Helper (Google Sheets API)
async function submitSurveyOnline(rowData, scriptUrl) {
    try {
        const payload = {
            action: 'append_row',
            sheetName: 'Surveys',
            rowData: rowData
        };

        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch(e) {
             throw new Error("Invalid response from Google Sheets API: " + rawText.substring(0, 50));
        }

        if (result.status !== 'success') {
            throw new Error(result.message);
        }
        
        return true;
    } catch (error) {
        throw new Error(`Failed to save to Google Sheets: ${error.message}`);
    }
}

// Convert Blob to Base64
async function convertBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        if(!blob) return resolve(null);
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

const base64ToBlob = async (base64) => {
    if(!base64) return null;
    const res = await fetch(base64);
    return await res.blob();
};

// Save Offline
async function saveSurveyOffline(surveyData, photoDataUrl, audioBlobObj) {
    const offlineSurveys = JSON.parse(localStorage.getItem('offlineSurveys') || '[]');
    
    // Convert audio blob to base64 for storage if it exists
    let audioBase64 = null;
    if (audioBlobObj) {
        audioBase64 = await convertBlobToBase64(audioBlobObj);
    }
    
    const pendingRecord = {
        tempId: surveyData.surveyID,
        data: surveyData,
        photoBase64: photoDataUrl,
        audioBase64: audioBase64,
        savedAt: new Date().toISOString()
    };
    
    offlineSurveys.push(pendingRecord);
    localStorage.setItem('offlineSurveys', JSON.stringify(offlineSurveys));
}

// Sync Offline Data
export async function syncOfflineData() {
    if (!navigator.onLine) {
        return showToast('Still offline. Cannot sync.', 'error');
    }

    const offlineSurveys = JSON.parse(localStorage.getItem('offlineSurveys') || '[]');
    
    if (offlineSurveys.length === 0) {
        return showToast('No data to sync', 'success');
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
    }

    let successCount = 0;
    let newOfflineSurveys = [];

    for (const record of offlineSurveys) {
        try {
            // Since offline surveys already store base64 directly, we can just upload them to drive now during sync
            const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxF9f1Dm_AlufYqNEctWyGrVSLpA4oSwbm_e9xhmkMpm-j1Hm7ZLQ6yWPQELFzd0-kQ/exec';
            let finalPhotoURL = record.data.photoURL; // Might already be a URL if logic changed, but usually base64 here
            let finalAudioURL = record.data.audioURL;

            // Upload Photo if exists in pending record
            if (record.photoBase64) {
                 const photoPayload = {
                    action: 'upload_file',
                    mimeType: 'image/jpeg',
                    fileName: `Photo_Sync_${record.tempId}.jpg`,
                    base64: record.photoBase64
                };
                const photoRes = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(photoPayload),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const photoResult = await photoRes.json();
                if(photoResult.status === 'success') finalPhotoURL = photoResult.url;
            }

            // Upload Audio if exists in pending record
            if (record.audioBase64) {
                 const audioPayload = {
                    action: 'upload_file',
                    mimeType: 'audio/webm',
                    fileName: `Audio_Sync_${record.tempId}.webm`,
                    base64: record.audioBase64
                };
                const audioRes = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(audioPayload),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const audioResult = await audioRes.json();
                if(audioResult.status === 'success') finalAudioURL = audioResult.url;
            }

            // Update record data with actual URLs
            record.data.photoURL = finalPhotoURL;
            record.data.audioURL = finalAudioURL;

            // Create array format
            const rowData = [
                record.data.surveyID,
                record.data.surveyDate,
                record.data.farmerName,
                record.data.phone,
                record.data.state,
                record.data.district,
                record.data.mandal,
                record.data.village,
                record.data.latitude,
                record.data.longitude,
                record.data.crop,
                record.data.landSize,
                record.data.suggestion,
                record.data.photoURL || '',
                record.data.audioURL || '',
                record.data.surveyorID
            ];

            // Save to Google Sheets
            await submitSurveyOnline(rowData, GOOGLE_SCRIPT_URL);
            successCount++;
        } catch (error) {
            console.error('Sync failed for record', record.tempId, error);
            newOfflineSurveys.push(record); // Keep failed ones
        }
    }

    localStorage.setItem('offlineSurveys', JSON.stringify(newOfflineSurveys));
    window.dispatchEvent(new Event('storage')); // Update UI

    if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Sync Data';
    }

    if (successCount > 0) {
        showToast(`Successfully synced ${successCount} surveys`, 'success');
        // Refresh the surveyor dashboard view if we're on there
        const userData = JSON.parse(localStorage.getItem('userData'));
        if(window.fetchMySurveys && userData) window.fetchMySurveys(userData.uid || userData.surveyorID);
    } else if (newOfflineSurveys.length > 0) {
        showToast(`Failed to sync ${newOfflineSurveys.length} surveys`, 'error');
    }
}

// Listen for online event to trigger auto-sync
window.addEventListener('online', () => {
    const offlineSurveys = JSON.parse(localStorage.getItem('offlineSurveys') || '[]');
    if (offlineSurveys.length > 0) {
        showToast('Back online! Auto-syncing data...', 'success');
        syncOfflineData();
    }
});
