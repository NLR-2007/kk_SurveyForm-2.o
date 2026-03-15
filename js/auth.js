import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Utility: Show Toast Notification
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Logic for login.html
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btnText = document.getElementById('login-text');
        const spinner = document.getElementById('login-spinner');
        const errorMsg = document.getElementById('error-message');
        
        // Reset state
        errorMsg.classList.add('hidden');
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Determine role and set in localStorage
            await routeUserByRole(user.uid);
            
        } catch (error) {
            errorMsg.textContent = error.message.replace('Firebase:', '').trim();
            errorMsg.classList.remove('hidden');
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    });
}

// Check role and route
export async function routeUserByRole(uid) {
    try {
        console.log("Routing user:", uid);
        
        // Check if admin
        const adminRef = ref(db, `admins/${uid}`);
        const adminSnap = await get(adminRef);
        
        console.log("Admin exists?", adminSnap.exists());
        
        if (adminSnap.exists()) {
            const adminData = adminSnap.val();
            
            if (adminData.isActive === false) {
                await signOut(auth);
                throw new Error("Your Admin account is inactive. Please contact the CEO.");
            }

            localStorage.setItem('userRole', 'admin');
            localStorage.setItem('userData', JSON.stringify(adminData));
            console.log("Routing to admin dashboard...");
            window.location.href = 'admin-dashboard.html';
            return;
        }
        
        // Check if surveyor
        const surveyorRef = ref(db, `surveyors/${uid}`);
        const surveyorSnap = await get(surveyorRef);
        
        console.log("Surveyor exists?", surveyorSnap.exists());
        
        if (surveyorSnap.exists()) {
            const surveyorData = surveyorSnap.val();

            if (surveyorData.isActive === false) {
                await signOut(auth);
                throw new Error("Your account has been deactivated. Please contact Administrators.");
            }

            localStorage.setItem('userRole', 'surveyor');
            localStorage.setItem('userData', JSON.stringify({
                ...surveyorData, uid: uid
            }));
            console.log("Routing to surveyor dashboard...");
            window.location.href = 'surveyor-dashboard.html';
            return;
        }
        
        // Unrecognized role
        console.warn("User has no role in database. Signing out.");
        await signOut(auth);
        throw new Error("Account has no assigned role.");
        
    } catch (error) {
        console.error("Error in routeUserByRole:", error);
        throw error;
    }
}

// Protect Routes & setup logout
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Setup Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggle.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        });
    }

    // Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        if (!user && currentPage !== 'login.html' && currentPage !== 'index.html' && currentPage !== '' && currentPage !== 'setup-admin.html') {
            // Not logged in, trying to access protected page
            localStorage.removeItem('userRole');
            localStorage.removeItem('userData');
            window.location.href = 'login.html';
        } else if (user && (currentPage === 'login.html' || currentPage === 'index.html' || currentPage === '')) {
            // Logged in, shouldn't be on login page
            let role = localStorage.getItem('userRole');
            if (!role) {
                // Wait for role to be fetched and routed
                try {
                    await routeUserByRole(user.uid);
                } catch (e) {
                    console.error("Routing error:", e);
                }
            } else if (role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else if (role === 'surveyor') {
                window.location.href = 'surveyor-dashboard.html';
            }
        } else if (user) {
            // Role verification for pages
            const role = localStorage.getItem('userRole');
            if (currentPage === 'admin-dashboard.html' && role !== 'admin') {
                window.location.href = 'surveyor-dashboard.html';
            } else if ((currentPage === 'surveyor-dashboard.html' || currentPage === 'survey-form.html') && role !== 'surveyor') {
                window.location.href = 'admin-dashboard.html';
            }
        }
    });
    
    // Global Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                localStorage.removeItem('userRole');
                localStorage.removeItem('userData');
                window.location.href = 'login.html';
            } catch (error) {
                showToast("Error logging out", "error");
            }
        });
    }
});
