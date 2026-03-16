import { db } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxF9f1Dm_AlufYqNEctWyGrVSLpA4oSwbm_e9xhmkMpm-j1Hm7ZLQ6yWPQELFzd0-kQ/exec';

// -----------------------------------------------------------
// FIX HEADERS — reads all raw rows, clears sheet, re-inserts
// with proper header row first.
// -----------------------------------------------------------
const SHEET_HEADERS = {
    Surveyors: ['SurveyorID', 'Name', 'Email', 'Phone', 'District', 'IsActive', 'CreatedAt'],
    Admins:    ['AdminID', 'Name', 'Email', 'Role', 'IsActive', 'CreatedAt'],
    Surveys:   ['SurveyID', 'Date', 'FarmerName', 'Phone', 'State', 'District', 'Mandal', 'Village', 'Latitude', 'Longitude', 'Crop', 'LandSize', 'Suggestion', 'PhotoURL', 'AudioURL', 'SurveyorID']
};

async function postToSheet(payload) {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const rawText = await res.text();
    let result;
    try { result = JSON.parse(rawText); }
    catch(e) { throw new Error("Invalid response: " + rawText.substring(0, 50)); }
    if (result.status !== 'success') throw new Error(result.message || 'Unknown error');
    return result;
}

async function fixSheetHeaders(sheetName) {
    logMessage(`📋 Reading current data from ${sheetName}...`);

    // 1. Fetch existing raw data from the sheet
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=${sheetName}`);
    const rawText = await res.text();
    let result;
    try { result = JSON.parse(rawText); }
    catch(e) { throw new Error("Could not parse response from sheet."); }

    const rows = (result.data && Array.isArray(result.data)) ? result.data : [];
    logMessage(`Found ${rows.length} rows. Extracting and deduplicating...`);

    // 2. Extract raw values from each row object (skip _rowIndex key)
    const allDataRows = rows.map(row => {
        return Object.entries(row)
            .filter(([k]) => k !== '_rowIndex')
            .map(([, v]) => v);
    });

    // 3. Deduplicate by the first column (ID column) — keeps the LAST occurrence of each ID
    const seenIds = new Set();
    const uniqueRows = [];
    for (let i = allDataRows.length - 1; i >= 0; i--) {
        const id = String(allDataRows[i][0]).trim();
        // Skip rows where the first column looks like a header (e.g. "SurveyorID", "AdminID")
        if (!id || SHEET_HEADERS[sheetName].includes(id)) continue;
        if (!seenIds.has(id)) {
            seenIds.add(id);
            uniqueRows.unshift(allDataRows[i]); // re-add in original order
        }
    }

    const removed = allDataRows.length - uniqueRows.length;
    if (removed > 0) logMessage(`🔁 Removed ${removed} duplicate(s).`);

    // 4. Clear the sheet completely
    logMessage(`🗑️ Clearing ${sheetName} sheet...`);
    await postToSheet({ action: 'clear_sheet', sheetName });

    // 5. Insert the proper header row first
    logMessage(`✏️ Inserting header row...`);
    await postToSheet({ action: 'append_row', sheetName, rowData: SHEET_HEADERS[sheetName] });

    // 6. Re-insert unique data rows
    logMessage(`📥 Re-inserting ${uniqueRows.length} unique rows...`);
    for (const row of uniqueRows) {
        await postToSheet({ action: 'append_row', sheetName, rowData: row });
    }

    logMessage(`✅ ${sheetName} fixed! ${uniqueRows.length} unique rows preserved.`);
}


document.getElementById('btn-fix-surveyors').addEventListener('click', async (e) => {
    const btn = e.target; btn.disabled = true;
    try { await fixSheetHeaders('Surveyors'); }
    catch(err) { logMessage(`❌ Error: ${err.message}`); }
    finally { btn.disabled = false; }
});

document.getElementById('btn-fix-admins').addEventListener('click', async (e) => {
    const btn = e.target; btn.disabled = true;
    try { await fixSheetHeaders('Admins'); }
    catch(err) { logMessage(`❌ Error: ${err.message}`); }
    finally { btn.disabled = false; }
});

document.getElementById('btn-fix-surveys').addEventListener('click', async (e) => {
    const btn = e.target; btn.disabled = true;
    try { await fixSheetHeaders('Surveys'); }
    catch(err) { logMessage(`❌ Error: ${err.message}`); }
    finally { btn.disabled = false; }
});

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
