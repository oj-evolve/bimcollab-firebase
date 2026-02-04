import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase-init.js";
import { createModal, showAlert } from "./ui-utils.js";

function showAuthError(form, message) {
    const errorEl = document.getElementById(`${form}-error`);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

export const handleLogin = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('login-remember').checked;
    const btn = document.getElementById('login-btn');
    showAuthError('login', '');

    if (!email || !password) {
        showAuthError('login', 'Please enter both email and password.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing In...';

    try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged in app.js will handle the UI transition
    } catch (error) {
        showAuthError('login', error.message);
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
};

export const handleSignup = async () => {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const role = document.getElementById('signup-role').value;
    const terms = document.getElementById('signup-terms').checked;
    const btn = document.getElementById('signup-btn');
    showAuthError('signup', '');

    if (!name || !email || !password || !confirmPassword || !role) {
        showAuthError('signup', 'Please fill out all fields.');
        return;
    }

    if (password !== confirmPassword) {
        showAuthError('signup', 'Passwords do not match.');
        return;
    }

    if (!terms) {
        showAuthError('signup', 'You must agree to the Terms and Conditions.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating Account...';

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email,
            role: role,
            createdAt: serverTimestamp()
        });
        // onAuthStateChanged in app.js will handle the UI transition
    } catch (error) {
        showAuthError('signup', error.message);
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
};

export const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged in app.js will handle the rest
    } catch (error) {
        showAuthError('login', error.message);
    }
};

export const handleGoogleSignUp = async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged in app.js will handle the rest (checking if user doc exists, prompting role if not)
    } catch (error) {
        showAuthError('signup', error.message);
    }
};

export const openForgotPasswordModal = function() {
    const modalId = 'forgot-password-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-key" style="color:var(--primary); margin-right:8px;"></i>Reset Password</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Enter your email address and we'll send you a link to reset your password.</p>
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="reset-email" placeholder="name@company.com" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-body); color:var(--text-main);">
            </div>
            <div id="reset-message" style="display:none; padding:0.75rem; border-radius:0.375rem; font-size:0.85rem; margin-bottom:1rem;"></div>
            <button id="btn-reset-pass" style="width:100%; padding:0.75rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">Send Reset Link</button>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById('btn-reset-pass').onclick = handlePasswordReset;
}

export const handlePasswordReset = async function() {
    const emailInput = document.getElementById('reset-email');
    const email = emailInput.value.trim();
    const msgDiv = document.getElementById('reset-message');
    const btn = document.getElementById('btn-reset-pass');

    if (!email) {
        msgDiv.textContent = "Please enter your email address.";
        msgDiv.style.color = "#ef4444";
        msgDiv.style.background = "rgba(239, 68, 68, 0.1)";
        msgDiv.style.display = "block";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Sending...";
    msgDiv.style.display = "none";

    try {
        await sendPasswordResetEmail(auth, email);
        msgDiv.textContent = "Password reset email sent! Check your inbox.";
        msgDiv.style.color = "#10b981";
        msgDiv.style.background = "rgba(16, 185, 129, 0.1)";
        msgDiv.style.display = "block";
        btn.textContent = "Sent";
    } catch (error) {
        console.error("Error sending reset email:", error);
        let errorMsg = "Failed to send reset email.";
        if (error.code === 'auth/user-not-found') errorMsg = "No user found with this email.";
        if (error.code === 'auth/invalid-email') errorMsg = "Invalid email address.";
        
        msgDiv.textContent = errorMsg;
        msgDiv.style.color = "#ef4444";
        msgDiv.style.background = "rgba(239, 68, 68, 0.1)";
        msgDiv.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Send Reset Link";
    }
}

export const completeGoogleSignUp = async (user) => {
    const role = document.getElementById('google-role-select').value;
    const btn = document.getElementById('complete-signup-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const userData = {
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            role: role,
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, "users", user.uid), userData, { merge: true });

        const modal = document.getElementById('role-selection-modal');
        if (modal) modal.remove();

        // Manually trigger app initialization for a smoother experience
        if (window.initializeUserApp) {
            await window.initializeUserApp(user, userData);
        } else {
            console.error("initializeUserApp not found on window");
            window.location.reload();
        }
    } catch (error) {
        console.error("Error completing sign up:", error);
        showAlert("Failed to save profile. Please try again.", "Error");
        btn.disabled = false;
        btn.textContent = 'Continue to Dashboard';
    }
};

export const promptRoleSelection = function(user) {
    const modalId = 'role-selection-modal';
    if (document.getElementById(modalId)) return;

    const { card } = createModal(modalId, { maxWidth: '400px', zIndex: '4000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">One Last Step</span>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Welcome, ${user.displayName}! To complete your profile, please select your professional role.</p>
            <div class="form-group">
                <label>Your Role</label>
                <select id="google-role-select" class="dropdown-input" style="cursor:pointer; margin-bottom:0;">
                    <option value="architect">Architect</option>
                    <option value="engineer">Engineer</option>
                    <option value="contractor">Contractor</option>
                    <option value="quantity">Quantity Surveyor</option>
                    <option value="owner">Owner</option>
                </select>
            </div>
            <button id="complete-signup-btn" class="auth-btn" style="margin-top:1rem;">Continue to Dashboard</button>
        </div>
    `;

    document.getElementById('complete-signup-btn').onclick = () => completeGoogleSignUp(user);
};

export const performLogout = async function() {
    const modal = document.getElementById('logout-confirm-modal');
    const btn = modal ? modal.querySelector('button[onclick="performLogout()"]') : null;
    if (btn) {
        btn.textContent = 'Logging Out...';
        btn.disabled = true;
    }
    try {
        await signOut(auth);
        window.location.reload();
    } catch (error) {
        console.error("Logout failed:", error);
        showAlert('Logout failed. Please try again.', "Error");
        if (btn) {
            btn.textContent = 'Log Out';
            btn.disabled = false;
        }
    }
}

export const openLogoutConfirmationModal = function() {
    const modalId = 'logout-confirm-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header" style="border-bottom:none; padding-bottom:0;">
            <span class="card-title" style="color:#ef4444;"><i class="fas fa-sign-out-alt"></i> Log Out</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body" style="text-align:center; padding-top:0;">
            <div style="font-size:3rem; color:#ef4444; margin:1rem 0; opacity:0.2"><i class="fas fa-door-open"></i></div>
            <h3 style="margin-bottom:0.5rem; color:var(--text-main);">Are you sure you want to log out?</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem; line-height:1.5;">
                Your session will be terminated.
            </p>
            <div style="display:flex; gap:10px; justify-content:center; width:100%;">
                <button id="cancel-${modalId}" style="flex:1; padding:0.75rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button id="confirm-logout-btn" style="flex:1; padding:0.75rem; border:none; background:#ef4444; color:white; border-radius:0.5rem; cursor:pointer; font-weight:600; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);">Log Out</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
    document.getElementById('confirm-logout-btn').onclick = performLogout;
}

export const logout = function() {
    // Close settings dropdown if open, then show confirmation
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');
    
    openLogoutConfirmationModal();
}

// Expose functions to window for HTML event handlers if necessary
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleGoogleSignUp = handleGoogleSignUp;
window.openForgotPasswordModal = openForgotPasswordModal;
window.handlePasswordReset = handlePasswordReset;
window.logout = logout;
window.performLogout = performLogout;