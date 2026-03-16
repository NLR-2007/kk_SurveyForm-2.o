import { db } from "./firebase-config.js";
import { ref, get, child } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx3TnxHd-FktxaFVqhMpKypWkUh1Zzyz3x-uaxWQkECqzLilZVeP5u-HcGPOFqW3kpQKw/exec';

const logDiv = document.getElementById('log');
function logMessage(msg) {
    const p = document.createElement('div');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logDiv.prepend(p);
    console.log(msg);
}

async function appendToSheet(sheetName, rowData) {
    const payload = {
        action: 'append_row',
        sheetName: sheetName,
        rowData: rowData
    };
    const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const rawText = await res.text();
    let result;
    try {
        result = JSON.parse(rawText);
    } catch(e) {
        throw new Error("Invalid response from Google Sheets API: " + rawText.substring(0, 50));
    }
    if(result.status !== 'success') throw new Error(result.message);
    return true;
}

document.getElementById('btn-migrate-surveyors').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
        logMessage("Fetching surveyors from Firebase...");
        const snapshot = await get(ref(db, `surveyors`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data);
            logMessage(`Found ${keys.length} surveyors. Starting migration...`);
            
            for (let id of keys) {
                const s = data[id];
                logMessage(`Migrating surveyor: ${s.name || id}...`);
                const row = [
                    id,
                    s.name || '',
                    s.email || '',
                    s.phone || '',
                    s.district || '',
                    s.isActive !== false ? true : false,
                    s.createdAt || new Date().toISOString()
                ];
                await appendToSheet('Surveyors', row);
                logMessage(`Success: ${s.name || id}`);
            }
            logMessage(`✅ All Surveyors Migrated!`);
        } else {
            logMessage("No surveyors found in Firebase.");
        }
    } catch (err) {
        logMessage(`❌ Error: ${err.message}`);
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-migrate-admins').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
        logMessage("Fetching admins from Firebase...");
        const snapshot = await get(ref(db, `admins`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data);
            logMessage(`Found ${keys.length} admins. Starting migration...`);
            
            for (let id of keys) {
                const a = data[id];
                logMessage(`Migrating admin: ${a.name || id}...`);
                const row = [
                    id,
                    a.name || '',
                    a.email || '',
                    a.role || 'admin',
                    a.isActive !== false ? true : false,
                    a.createdAt || new Date().toISOString()
                ];
                await appendToSheet('Admins', row);
                logMessage(`Success: ${a.name || id}`);
            }
            logMessage(`✅ All Admins Migrated!`);
        } else {
            logMessage("No admins found in Firebase.");
        }
    } catch (err) {
        logMessage(`❌ Error: ${err.message}`);
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-migrate-surveys').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
        logMessage("Fetching surveys from Firebase...");
        const snapshot = await get(ref(db, `surveys`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data);
            logMessage(`Found ${keys.length} surveys. Starting migration...`);
            
            for (let id of keys) {
                const s = data[id];
                logMessage(`Migrating survey: ${s.farmerName || id}...`);
                // Headers: SurveyID, Date, FarmerName, Phone, State, District, Mandal, Village, Latitude, Longitude, Crop, LandSize, Suggestion, PhotoURL, AudioURL, SurveyorID
                const row = [
                    id,
                    s.surveyDate || s.timestamp || new Date().toISOString(),
                    s.farmerName || '',
                    s.phone || '',
                    s.state || '',
                    s.district || '',
                    s.mandal || '',
                    s.village || '',
                    s.latitude || '',
                    s.longitude || '',
                    s.crop || '',
                    s.landSize || '',
                    s.suggestion || '',
                    s.photoURL || '',
                    s.audioURL || '',
                    s.surveyorID || ''
                ];
                await appendToSheet('Surveys', row);
                logMessage(`Success: ${s.farmerName || id}`);
            }
            logMessage(`✅ All Surveys Migrated!`);
        } else {
            logMessage("No surveys found in Firebase.");
        }
    } catch (err) {
        logMessage(`❌ Error: ${err.message}`);
    } finally {
        btn.disabled = false;
    }
});
