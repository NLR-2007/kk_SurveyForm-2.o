// =========================================================
// auth.js — Firebase-free Authentication via Google Sheets
// =========================================================

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-aBhSAfN3-8Vk-1LAYCkhpKBHkflLofPDVS2rI8sXXeQGQu3JxgvMpJYQ2giubccYnQ/exec';

// ---- Utility: SHA-256 Hash ----
export async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Utility: Show Toast Notification ----
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- Core Login via Google Sheets ----
async function loginWithSheets(email, password) {
    const hashedPassword = await hashPassword(password);

    // Try Admins first
    const adminRes = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', email, password: hashedPassword, userType: 'admin' }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const adminResult = await adminRes.json();

    if (adminResult.status === 'success') {
        const admin = adminResult.data;
        const isActive = admin.IsActive;
        const activeNormalized = isActive === undefined || isActive === true || String(isActive).toUpperCase() === 'TRUE';
        if (!activeNormalized) throw new Error('Your Admin account is inactive. Please contact the CEO.');

        localStorage.setItem('userRole', 'admin');
        localStorage.setItem('userData', JSON.stringify({
            adminID: admin.AdminID || admin.adminID,
            name: admin.Name || admin.name,
            email: admin.Email || admin.email,
            role: String(admin.Role || admin.role || 'admin').toLowerCase(),
            isActive: true
        }));
        return 'admin';
    }

    // Try Surveyors
    const survRes = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', email, password: hashedPassword, userType: 'surveyor' }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const survResult = await survRes.json();

    if (survResult.status === 'success') {
        const surveyor = survResult.data;
        const isActive = surveyor.IsActive;
        const activeNormalized = isActive === undefined || isActive === true || String(isActive).toUpperCase() === 'TRUE';
        if (!activeNormalized) throw new Error('Your account has been deactivated. Please contact Administrators.');

        localStorage.setItem('userRole', 'surveyor');
        localStorage.setItem('userData', JSON.stringify({
            surveyorID: surveyor.SurveyorID || surveyor.surveyorID,
            uid: surveyor.SurveyorID || surveyor.surveyorID,
            name: surveyor.Name || surveyor.name,
            email: surveyor.Email || surveyor.email,
            district: surveyor.District || surveyor.district,
            phone: surveyor.Phone || surveyor.phone,
            role: 'surveyor',
            isActive: true
        }));
        return 'surveyor';
    }

    // Neither admin nor surveyor recognized
    throw new Error('Invalid email or password.');
}

// ---- Login Form (login.html) ----
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btnText = document.getElementById('login-text');
        const spinner = document.getElementById('login-spinner');
        const errorMsg = document.getElementById('error-message');

        errorMsg.classList.add('hidden');
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');

        try {
            const role = await loginWithSheets(email, password);
            if (role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else {
                window.location.href = 'surveyor-dashboard.html';
            }
        } catch (error) {
            errorMsg.textContent = error.message;
            errorMsg.classList.remove('hidden');
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    });
}

// ---- Route Protection & Global Setup ----
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['login.html', 'index.html', '', 'setup-admin.html'];
    const protectedPages = ['admin-dashboard.html', 'surveyor-dashboard.html', 'survey-form.html'];

    const userRole = localStorage.getItem('userRole');

    // Setup Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeToggle.innerHTML = savedTheme === 'dark'
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';

        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggle.innerHTML = newTheme === 'dark'
                ? '<i class="fa-solid fa-sun"></i>'
                : '<i class="fa-solid fa-moon"></i>';
        });
    }

    // If on a protected page and not logged in → redirect to login
    if (protectedPages.includes(currentPage) && !userRole) {
        localStorage.removeItem('userRole');
        localStorage.removeItem('userData');
        window.location.href = 'login.html';
        return;
    }

    // If already logged in and trying to access login/index → redirect to dashboard
    if (publicPages.includes(currentPage) && currentPage !== 'setup-admin.html' && userRole) {
        if (userRole === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else if (userRole === 'surveyor') {
            window.location.href = 'surveyor-dashboard.html';
        }
        return;
    }

    // Role-based page guards
    if (currentPage === 'admin-dashboard.html' && userRole !== 'admin') {
        window.location.href = 'surveyor-dashboard.html';
        return;
    }
    if ((currentPage === 'surveyor-dashboard.html' || currentPage === 'survey-form.html') && userRole !== 'surveyor') {
        window.location.href = 'admin-dashboard.html';
        return;
    }

    // Global Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('userRole');
            localStorage.removeItem('userData');
            window.location.href = 'login.html';
        });
    }
});
