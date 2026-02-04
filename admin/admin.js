import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy, limit, startAfter, where, serverTimestamp, onSnapshot, addDoc, writeBatch } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// --- CONFIGURATION ---
// Matches src/app.js to ensure connection to the same DB
const firebaseConfig = {
    apiKey: "AIzaSyCPRWLcB9BODRYcZBkfCTBA7N78OQDhaKo",
    authDomain: "bim-collab.firebaseapp.com",
    projectId: "bim-collab",
    storageBucket: "bim-collab.appspot.com",
    messagingSenderId: "20536267192",
    appId: "1:20536267192:web:58510a149f6d36975bbf4d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- AUTHENTICATION ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('admin-app');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        initializeAppState();
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const errorMsg = document.getElementById('login-error');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            errorMsg.style.display = 'none';
        } catch (error) {
            console.error(error);
            errorMsg.textContent = "Invalid credentials or permission denied.";
            errorMsg.style.display = 'block';
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut(auth));
}

// --- NAVIGATION ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = item.getAttribute('data-tab');
        switchToTab(tabId);
    });
});

async function initializeAppState() {
    try {
        const uiConfigSnap = await getDoc(doc(db, "system_settings", "ui_config"));
        let defaultTabId = 'dashboard'; // fallback
        if (uiConfigSnap.exists() && uiConfigSnap.data().defaultPage) {
            defaultTabId = uiConfigSnap.data().defaultPage;
        }
        switchToTab(defaultTabId);
    } catch (e) {
        console.error("Could not load UI config, defaulting to dashboard.", e);
        switchToTab('dashboard'); // fallback on error
    }
}

function switchToTab(tabId) {
    // Deactivate all
    if (unsubscribeChats) { unsubscribeChats(); unsubscribeChats = null; }
    activeSessionId = null;

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    // Activate the target
    const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const tabContent = document.getElementById(`tab-${tabId}`);

    if (navItem) navItem.classList.add('active');
    if (tabContent) tabContent.classList.add('active');

    // Load data for the activated tab
    switch (tabId) {
        case 'dashboard':
            loadStats();
            loadUserGrowthChart();
            break;
        case 'users': loadUsers(); break;
        case 'projects': loadProjects(); break;
        case 'messages': loadMessages(); break;
        case 'settings': loadSettings(); break;
        case 'live-chat': loadLiveChats(); break;
    }
}

async function loadStats() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const projectsSnap = await getDocs(collection(db, "projects"));
        
        const userCountEl = document.getElementById('stat-users');
        const projectCountEl = document.getElementById('stat-projects');
        const msgCountEl = document.getElementById('stat-msgs');

        if (userCountEl) userCountEl.textContent = usersSnap.size;
        if (projectCountEl) projectCountEl.textContent = projectsSnap.size;
        if (msgCountEl) msgCountEl.textContent = "Active";
    } catch (e) {
        console.error("Error loading stats:", e);
    }
}

let userGrowthChartInstance = null;

// --- DASHBOARD LOGIC ---
async function loadUserGrowthChart(startDateInput = null, endDateInput = null) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const dates = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Assuming 'createdAt' field exists on user documents
            if (data.createdAt) {
                dates.push(data.createdAt.toDate());
            }
        });

        if (startDateInput) {
            const start = new Date(startDateInput);
            dates = dates.filter(d => d >= start);
        }
        
        if (endDateInput) {
            const end = new Date(endDateInput);
            // Set to end of day
            end.setHours(23, 59, 59, 999);
            dates = dates.filter(d => d <= end);
        }

        dates.sort((a, b) => a - b);

        const counts = {};
        dates.forEach(date => {
            const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            counts[key] = (counts[key] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const dataPoints = [];
        let total = 0;
        
        labels.forEach(label => {
            total += counts[label];
            dataPoints.push(total);
        });

        if (userGrowthChartInstance) userGrowthChartInstance.destroy();

        userGrowthChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Users',
                    data: dataPoints,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } catch (e) {
        console.error("Error loading chart:", e);
    }
}

const filterChartBtn = document.getElementById('filter-chart-btn');
if (filterChartBtn) {
    filterChartBtn.addEventListener('click', () => {
        const start = document.getElementById('chart-start').value;
        const end = document.getElementById('chart-end').value;
        loadUserGrowthChart(start, end);
    });
}

const resetChartBtn = document.getElementById('reset-chart-btn');
if (resetChartBtn) {
    resetChartBtn.addEventListener('click', () => {
        document.getElementById('chart-start').value = '';
        document.getElementById('chart-end').value = '';
        loadUserGrowthChart();
    });
}

let showDeletedProjects = false;
let projectSearchTerm = '';

let projPageSize = 50;
let projPageStack = [];
let projLastVisible = null;
let projCurrentPage = 1;

// --- USER MANAGEMENT ---
async function loadUsers() {
    const list = document.getElementById('users-list');
    if (!list) return;
    list.innerHTML = 'Loading...';
    
    try {
        const snapshot = await getDocs(collection(db, "users"));
        list.innerHTML = '';
        
        if (snapshot.empty) {
            list.innerHTML = '<div style="padding:1rem; color:#666;">No users found.</div>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            
            // Avatar & Plan Logic
            let avatarHtml = `<i class="fas ${data.isBanned ? 'fa-user-slash' : 'fa-user'}" style="font-size:1.5rem; color:${data.isBanned ? '#ef4444' : '#666'};"></i>`;
            if (data.photoURL) {
                avatarHtml = `<img src="${data.photoURL}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid var(--border);">`;
            }

            const plan = data.plan || 'free';
            let planBadge = '';
            if (plan === 'pro' || plan === 'business') {
                planBadge = `<span style="font-size:0.7rem; background: linear-gradient(135deg, #FFD700, #FFA500); color: white; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight:bold;">${plan.toUpperCase()}</span>`;
            } else if (plan === 'flex') {
                planBadge = `<span style="font-size:0.7rem; background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight:bold;">FLEX</span>`;
            }

            div.className = 'data-list-item';
            div.innerHTML = `
                <div class="item-info" style="display:flex; align-items:center; gap:1rem;">
                    ${avatarHtml}
                    <div>
                        <h4>${data.email || data.name || 'No Name'} ${planBadge} ${data.isBanned ? '<span style="color:#ef4444; font-size:0.8rem; font-weight:bold;">(Banned)</span>' : ''}</h4>
                        <p>Role: <strong>${data.role || 'N/A'}</strong> | ID: ${doc.id}</p>
                    </div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-sm" onclick="window.openUserEditModal('${doc.id}', '${data.email}', '${data.role}', '${plan}', ${data.isBanned || false})">Edit</button>
                    <button class="btn-sm btn-danger" onclick="window.deleteUser('${doc.id}', '${data.email || 'this user'}')">Delete</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = 'Error loading users.';
        console.error(e);
    }
}

window.openUserEditModal = function(userId, email, role, plan, isBanned) {
    const modalId = 'user-edit-modal';
    if (document.getElementById(modalId)) document.getElementById(modalId).remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card" style="max-width:450px;">
            <div class="modal-header">
                <span class="card-title">Edit User: ${email}</span>
                <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
            </div>
            <div class="modal-body">
                <div class="form-group" style="margin-bottom:1rem;">
                    <label>Role</label>
                    <select id="user-role-select" class="form-input">
                        <option value="architect" ${role === 'architect' ? 'selected' : ''}>Architect</option>
                        <option value="engineer" ${role === 'engineer' ? 'selected' : ''}>Engineer</option>
                        <option value="contractor" ${role === 'contractor' ? 'selected' : ''}>Contractor</option>
                        <option value="quantity" ${role === 'quantity' ? 'selected' : ''}>Quantity Surveyor</option>
                        <option value="owner" ${role === 'owner' ? 'selected' : ''}>Owner</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:1rem;">
                    <label>Plan Tier</label>
                    <select id="user-plan-select" class="form-input">
                        <option value="free" ${plan === 'free' ? 'selected' : ''}>Starter (Free)</option>
                        <option value="flex" ${plan === 'flex' ? 'selected' : ''}>Flex (Pay-as-you-go)</option>
                        <option value="pro" ${plan === 'pro' ? 'selected' : ''}>Professional</option>
                        <option value="business" ${plan === 'business' ? 'selected' : ''}>Business</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:1.5rem;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="user-ban-toggle" ${isBanned ? 'checked' : ''}>
                        <span class="slider"></span> <span style="margin-left:10px; font-size:0.9rem; color:#ef4444; font-weight:bold;">Ban User</span>
                    </label>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-sm" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
                    <button class="btn-primary" onclick="window.saveUserChanges('${userId}')">Save Changes</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.saveUserChanges = async function(userId) {
    const newRole = document.getElementById('user-role-select').value;
    const newPlan = document.getElementById('user-plan-select').value;
    const isBanned = document.getElementById('user-ban-toggle').checked;
    const btn = document.querySelector(`#${'user-edit-modal'} .btn-primary`);
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "users", userId), {
            role: newRole,
            plan: newPlan,
            isBanned: isBanned
        });
        document.getElementById('user-edit-modal').remove();
        loadUsers();
    } catch (e) {
        alert('Failed to save user changes: ' + e.message);
        btn.textContent = 'Save Changes';
        btn.disabled = false;
    }
}

window.deleteUser = async function(userId, email) {
    if (confirm(`Are you sure you want to delete the user record for "${email}"?\n\nThis will remove their data from the 'users' collection but will NOT delete their authentication account or associated project data.\n\nThis action cannot be undone.`)) {
        try {
            await deleteDoc(doc(db, "users", userId));
            alert('User record deleted successfully.');
            loadUsers(); // Refresh the list
        } catch (e) {
            console.error("Error deleting user:", e);
            alert('Failed to delete user record: ' + e.message);
        }
    }
}

// --- PROJECT MANAGEMENT ---
async function loadProjects(action = 'first') {
    const list = document.getElementById('projects-list');
    if (!list) return;
    list.innerHTML = 'Loading...';
    
    try {
        let snapshot;
        
        // If searching by ID, try to fetch that specific document
        if (projectSearchTerm) {
            const docRef = doc(db, "projects", projectSearchTerm.trim());
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                // Create a fake snapshot array with one item
                snapshot = { empty: false, forEach: (cb) => cb(docSnap) };
            } else {
                snapshot = { empty: true, forEach: () => {} };
            }
            // Reset pagination state during search
            projCurrentPage = 1;
            projPageStack = [];
            projLastVisible = null;
        } else {
            // Pagination Logic
            let q = query(collection(db, "projects"), orderBy("createdAt", "desc"), limit(projPageSize));

            if (action === 'next' && projLastVisible) {
                projPageStack.push(projLastVisible);
                projCurrentPage++;
                q = query(collection(db, "projects"), orderBy("createdAt", "desc"), startAfter(projLastVisible), limit(projPageSize));
            } else if (action === 'prev') {
                if (projPageStack.length > 0) {
                    projPageStack.pop();
                    projCurrentPage--;
                }
                const startDoc = projPageStack.length > 0 ? projPageStack[projPageStack.length - 1] : null;
                if (startDoc) {
                    q = query(collection(db, "projects"), orderBy("createdAt", "desc"), startAfter(startDoc), limit(projPageSize));
                }
            } else if (action === 'current') {
                const startDoc = projPageStack.length > 0 ? projPageStack[projPageStack.length - 1] : null;
                if (startDoc) {
                    q = query(collection(db, "projects"), orderBy("createdAt", "desc"), startAfter(startDoc), limit(projPageSize));
                }
            } else {
                // 'first' or reset
                projPageStack = [];
                projCurrentPage = 1;
            }

            snapshot = await getDocs(q);
            if (!snapshot.empty) {
                projLastVisible = snapshot.docs[snapshot.docs.length - 1];
            }
        }

        list.innerHTML = '';
        
        if (snapshot.empty) {
            list.innerHTML = '<div style="padding:1rem; color:#666;">No projects found. Try searching by exact Project ID.</div>';
            if (projCurrentPage > 1 && !projectSearchTerm) renderProjectPaginationControls(list, true, false);
            return;
        }

        let serial = (projCurrentPage - 1) * projPageSize + 1;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isDeleted = data.isDeleted || false;

            // Client-side filtering to avoid Firestore Index requirement
            if (!showDeletedProjects && isDeleted) return;
            if (showDeletedProjects && !isDeleted) return;

            const div = document.createElement('div');
            div.className = 'data-list-item';
            const statusColor = isDeleted ? '#ef4444' : '#10b981';
            const statusText = isDeleted ? 'Deleted' : 'Active';
            const safeName = (data.name || 'Project').replace(/'/g, "\\'");
            const storageMB = data.storageUsage ? (data.storageUsage / (1024 * 1024)).toFixed(2) : '0.00';

            div.innerHTML = `
                <div class="item-info" style="display:flex; gap:1rem; align-items:center;">
                    <span style="font-weight:bold; color:#888; min-width:30px;">#${serial++}</span>
                    <div>
                        <h4>
                            ${data.name || 'Unnamed Project'} 
                            <span style="font-size:0.75rem; background:${statusColor}; color:white; padding:2px 6px; border-radius:4px; margin-left:8px;">${statusText}</span>
                        </h4>
                        <p>Owner: ${data.owner || 'Unknown'} | Storage: <strong>${storageMB} MB</strong> | Created: ${data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
                        <p style="font-family:monospace; font-size:0.8rem; color:#555; margin-top:4px;">ID: ${docSnap.id}</p>
                    </div>
                </div>
                <div style="display:flex; gap:5px; flex-direction:column; align-items:flex-end;">
                    <button class="btn-sm" onclick="window.viewProjectFiles('${docSnap.id}', '${safeName}')">
                        <i class="fas fa-folder-open"></i> Files
                    </button>
                    <button class="btn-sm" style="border-color:var(--primary); color:var(--primary);" onclick="window.copyRecoveryKey('${docSnap.id}')">
                        <i class="fas fa-key"></i> Copy Key
                    </button>
                    ${isDeleted 
                        ? `<button class="btn-sm" onclick="window.restoreProject('${docSnap.id}')">Restore</button>`
                        : `<button class="btn-sm btn-danger" onclick="window.deleteProject('${docSnap.id}')">Delete</button>`}
                </div>
            `;
            list.appendChild(div);
        });

        if (!projectSearchTerm) {
            renderProjectPaginationControls(list, projCurrentPage > 1, snapshot.docs.length === projPageSize);
        }
    } catch (e) {
        list.innerHTML = 'Error loading projects.';
        console.error(e);
    }
}

function renderProjectPaginationControls(container, hasPrev, hasNext) {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; justify-content:center; align-items:center; gap:15px; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border);";
    div.innerHTML = `
        <button class="btn-sm" ${!hasPrev ? 'disabled style="opacity:0.5; cursor:default;"' : ''} onclick="window.changeProjectPage('prev')"><i class="fas fa-chevron-left"></i> Previous</button>
        <span style="font-size:0.9rem; color:#666;">Page ${projCurrentPage}</span>
        <button class="btn-sm" ${!hasNext ? 'disabled style="opacity:0.5; cursor:default;"' : ''} onclick="window.changeProjectPage('next')">Next <i class="fas fa-chevron-right"></i></button>
    `;
    container.appendChild(div);
}

window.changeProjectPage = function(dir) {
    loadProjects(dir);
}

window.viewProjectFiles = async function(projectId, projectName) {
    // Remove existing modal if any
    const existing = document.getElementById('files-modal');
    if (existing) existing.remove();

    // Create Modal
    const modal = document.createElement('div');
    modal.id = 'files-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card">
            <div class="modal-header">
                <h3 style="margin:0">Files: ${projectName}</h3>
                <i class="fas fa-times" style="cursor:pointer; font-size:1.2rem;" onclick="document.getElementById('files-modal').remove()"></i>
            </div>
            <div id="modal-file-list" style="display:flex; flex-direction:column; gap:10px;">
                <div style="text-align:center; padding:1rem; color:#666;">Loading files...</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const listContainer = document.getElementById('modal-file-list');

    try {
        // Fetch files from subcollection 'files'
        const snapshot = await getDocs(collection(db, "projects", projectId, "files"));

        listContainer.innerHTML = '';

        if (snapshot.empty) {
            listContainer.innerHTML = '<div style="text-align:center; padding:1rem; color:#666;">No files uploaded to this project.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const file = docSnap.data();
            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background:#f9fafb; border-radius:4px; border:1px solid #e5e7eb;";
            
            // Format size
            let sizeStr = 'N/A';
            if (file.size) {
                const sizeInMB = file.size / (1024 * 1024);
                sizeStr = sizeInMB < 1 ? Math.round(file.size/1024) + ' KB' : sizeInMB.toFixed(2) + ' MB';
            }

            const safeProjectName = projectName.replace(/'/g, "\\'");

            item.innerHTML = `
                <div style="overflow:hidden; text-overflow:ellipsis; max-width: 65%;">
                    <div style="font-weight:600; font-size:0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name || docSnap.id}</div>
                    <div style="font-size:0.75rem; color:#666;">${file.type || 'Unknown Type'} • ${sizeStr}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    ${file.url ? `<a href="${file.url}" target="_blank" class="btn-sm" style="text-decoration:none; color:var(--primary); border-color:var(--primary); display:inline-block;"><i class="fas fa-download"></i></a>` : ''}
                    <button class="btn-sm btn-danger" onclick="window.deleteProjectFile('${projectId}', '${docSnap.id}', '${safeProjectName}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            listContainer.appendChild(item);
        });
    } catch (e) {
        console.error(e);
        listContainer.innerHTML = `<div style="color:red; padding:1rem; text-align:center;">Error loading files.<br><small>${e.message}</small></div>`;
    }
}

window.deleteProjectFile = async function(projectId, fileId, projectName) {
    if (confirm(`Are you sure you want to permanently delete this file record?\n\nThis action cannot be undone.`)) {
        try {
            // Important: This deletes the file record from Firestore, but does NOT delete the actual file from Firebase Storage.
            // For a complete solution, you would need a Firebase Cloud Function that triggers on this document's deletion
            // to remove the corresponding file from the storage bucket.
            await deleteDoc(doc(db, "projects", projectId, "files", fileId));
            
            // Refresh the file list modal to show the change
            window.viewProjectFiles(projectId, projectName);
        } catch (e) {
            console.error("Error deleting file document:", e);
            alert("Failed to delete file record: " + e.message);
        }
    }
}

window.copyRecoveryKey = function(id) {
    navigator.clipboard.writeText(id).then(() => {
        alert(`Project Recovery Key (ID) copied:\n${id}\n\nProvide this to the user for session recovery.`);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        prompt("Copy this Project ID manually:", id);
    });
}

window.toggleShowDeletedProjects = function(isChecked) {
    showDeletedProjects = isChecked;
    loadProjects();
}

const projectSearchBtn = document.getElementById('project-search-btn');
if (projectSearchBtn) {
    projectSearchBtn.addEventListener('click', () => {
        projectSearchTerm = document.getElementById('project-search-input').value;
        loadProjects();
    });
}

const projectRefreshBtn = document.getElementById('project-refresh-btn');
if (projectRefreshBtn) {
    projectRefreshBtn.addEventListener('click', () => {
        document.getElementById('project-search-input').value = '';
        projectSearchTerm = '';
        loadProjects();
    });
}

window.deleteProject = async function(id) {
    if(confirm('Are you sure you want to delete this project?\n\nThis will mark the project as deleted. It can be restored later from the admin panel.')) {
        try {
            await updateDoc(doc(db, "projects", id), {
                isDeleted: true,
                deletedAt: serverTimestamp()
            });
            loadProjects('current'); // Refresh list keeping page
        } catch (e) {
            alert('Error deleting project: ' + e.message);
        }
    }
}

window.restoreProject = async function(id) {
    if(confirm('Are you sure you want to restore this project?')) {
        try {
            await updateDoc(doc(db, "projects", id), { isDeleted: false });
            loadProjects('current'); // Refresh list keeping page
        } catch (e) { alert('Error restoring project: ' + e.message); }
    }
}

// --- MESSAGE MANAGEMENT ---
let msgPageSize = 10;
let msgPageStack = [];
let msgLastVisible = null;
let msgCurrentPage = 1;
let showUnrepliedOnly = false;

async function loadMessages(action = 'first') {
    const list = document.getElementById('messages-list');
    if (!list) return;
    list.innerHTML = 'Loading...';
    
    try {
        let q = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"), limit(msgPageSize));

        if (action === 'next' && msgLastVisible) {
            msgPageStack.push(msgLastVisible);
            msgCurrentPage++;
            q = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"), startAfter(msgLastVisible), limit(msgPageSize));
        } else if (action === 'prev') {
            if (msgPageStack.length > 0) {
                msgPageStack.pop();
                msgCurrentPage--;
            }
            const startDoc = msgPageStack.length > 0 ? msgPageStack[msgPageStack.length - 1] : null;
            if (startDoc) {
                q = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"), startAfter(startDoc), limit(msgPageSize));
            }
        } else if (action === 'current') {
            const startDoc = msgPageStack.length > 0 ? msgPageStack[msgPageStack.length - 1] : null;
            if (startDoc) {
                q = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"), startAfter(startDoc), limit(msgPageSize));
            }
        } else {
            msgPageStack = [];
            msgCurrentPage = 1;
        }

        const snapshot = await getDocs(q);
        if (!snapshot.empty) msgLastVisible = snapshot.docs[snapshot.docs.length - 1];

        list.innerHTML = '';
        
        if (snapshot.empty) {
            list.innerHTML = '<div style="padding:1rem; color:#666;">No messages found.</div>';
            if (msgCurrentPage > 1) renderMsgControls(list, true, false);
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A';
            const div = document.createElement('div');
            
            const isReplied = !!data.reply || data.status === 'replied';

            if (showUnrepliedOnly && isReplied) return;

            const replyHtml = isReplied 
                ? `<div style="margin-top:0.5rem; padding:0.5rem; background:#f3f4f6; border-left:3px solid var(--primary); font-size:0.85rem; color:#555;">
                     <i class="fas fa-check-circle" style="color:var(--primary)"></i> <strong>Replied:</strong> ${data.reply}
                   </div>` 
                : '';
            
            const safeName = (data.name || '').replace(/'/g, "\\'");

            div.className = 'data-list-item';
            div.innerHTML = `
                <div class="item-info" style="width:100%">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <h4 style="margin:0">${data.name || 'Unknown'} <span style="font-weight:normal; font-size:0.85rem; color:#666;">&lt;${data.email}&gt;</span></h4>
                        <span style="font-size:0.75rem; color:#888;">${date}</span>
                    </div>
                    <p style="margin-bottom:8px; color:#333; white-space: pre-wrap;">${data.message}</p>
                    <p style="font-size:0.75rem; color:#888;">Project ID: ${data.projectId || 'N/A'} | Role: ${data.userRole || 'Guest'}</p>
                    ${replyHtml}
                </div>
                <div style="margin-left:10px; display:flex; flex-direction:column; gap:5px;">
                    <button class="btn-sm" onclick="window.openReplyModal('${docSnap.id}', '${data.email}', '${safeName}')"><i class="fas fa-reply"></i> Reply</button>
                    <button class="btn-sm btn-danger" onclick="window.deleteMessage('${docSnap.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            list.appendChild(div);
        });

        renderMsgControls(list, msgCurrentPage > 1, snapshot.docs.length === msgPageSize);
    } catch (e) {
        list.innerHTML = 'Error loading messages.';
        console.error(e);
    }
}

window.toggleFilterUnreplied = function(checked) {
    showUnrepliedOnly = checked;
    loadMessages('first');
}

function renderMsgControls(container, hasPrev, hasNext) {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; justify-content:center; align-items:center; gap:15px; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border);";
    div.innerHTML = `
        <button class="btn-sm" ${!hasPrev ? 'disabled style="opacity:0.5; cursor:default;"' : ''} onclick="window.changeMessagePage('prev')"><i class="fas fa-chevron-left"></i> Previous</button>
        <span style="font-size:0.9rem; color:#666;">Page ${msgCurrentPage}</span>
        <button class="btn-sm" ${!hasNext ? 'disabled style="opacity:0.5; cursor:default;"' : ''} onclick="window.changeMessagePage('next')">Next <i class="fas fa-chevron-right"></i></button>
    `;
    container.appendChild(div);
}

window.changeMessagePage = function(dir) {
    loadMessages(dir);
}

window.openReplyModal = function(id, email, name) {
    const modalId = 'reply-modal';
    if (document.getElementById(modalId)) document.getElementById(modalId).remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card" style="max-width:500px;">
            <div class="modal-header">
                <span class="card-title">Reply to ${name}</span>
                <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
            </div>
            <div class="modal-body">
                <div class="form-group" style="margin-bottom:1rem;">
                    <label style="display:block; margin-bottom:0.5rem; font-size:0.9rem; color:#666;">To: ${email}</label>
                    <textarea id="reply-message-text" class="form-input" rows="5" placeholder="Type your reply here..."></textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-sm" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
                    <button class="btn-primary" onclick="window.sendReply('${id}', '${email}')">Send & Log</button>
                </div>
                <p style="font-size:0.8rem; color:#888; margin-top:10px;">
                    <i class="fas fa-info-circle"></i> This will log the reply in the database and open your default email client.
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.sendReply = async function(id, email) {
    const text = document.getElementById('reply-message-text').value;
    if (!text) return alert('Please enter a message.');

    try {
        await updateDoc(doc(db, "contact_messages", id), {
            reply: text,
            repliedAt: serverTimestamp(),
            status: 'replied'
        });

        const subject = encodeURIComponent("Re: Inquiry from BIM Collab");
        const body = encodeURIComponent(text);
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;

        document.getElementById('reply-modal').remove();
        loadMessages('current');
    } catch (e) {
        console.error(e);
        alert('Error saving reply: ' + e.message);
    }
}

window.deleteMessage = async function(id) {
    if(confirm('Are you sure you want to delete this message?')) {
        try {
            await deleteDoc(doc(db, "contact_messages", id));
            loadMessages('current');
        } catch (e) {
            alert('Error deleting message: ' + e.message);
        }
    }
}

// --- LIVE CHAT SYSTEM ---
let unsubscribeChats = null;
let activeSessionId = null;
const sessions = {}; // Stores session data: { messages: [], userName: '', lastTimestamp: ... }
let audioCtx = null;

function playNotificationSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, audioCtx.currentTime); // Beep frequency
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio notification failed:", e);
    }
}

function loadLiveChats() {
    const sessionListEl = document.getElementById('session-list');
    if (!sessionListEl) return;
    
    // Listen to ALL support messages ordered by timestamp
    const q = query(collection(db, "support_messages"), orderBy("timestamp", "asc"));
    
    let isInitialLoad = true;

    unsubscribeChats = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const sid = data.sessionId;
            
            if (change.type === 'added' || change.type === 'modified') {
                // Initialize session object if new
                if (!sessions[sid]) {
                    sessions[sid] = { 
                        messages: [], 
                        userName: data.userName || 'Guest',
                        userRole: data.userRole || 'guest'
                    };
                }
                
                const existingIdx = sessions[sid].messages.findIndex(m => m.id === change.doc.id);
                if (existingIdx > -1) {
                    sessions[sid].messages[existingIdx] = { id: change.doc.id, ...data };
                } else {
                    sessions[sid].messages.push({ id: change.doc.id, ...data });
                    // Sort by timestamp to ensure correct order
                    sessions[sid].messages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

                    // Play sound for new user messages
                    if (!isInitialLoad && change.type === 'added' && data.sender === 'user') {
                        playNotificationSound();
                    }
                }
            } else if (change.type === 'removed') {
                if (sessions[sid]) {
                    sessions[sid].messages = sessions[sid].messages.filter(m => m.id !== change.doc.id);
                    if (sessions[sid].messages.length === 0) {
                        delete sessions[sid];
                        if (activeSessionId === sid) {
                            activeSessionId = null;
                            const chatHeaderEl = document.getElementById('chat-header');
                            const messagesContainerEl = document.getElementById('messages-container');
                            const replyInput = document.getElementById('reply-input');
                            const sendBtn = document.getElementById('send-btn');
                            
                            if (chatHeaderEl) chatHeaderEl.textContent = 'Select a conversation';
                            if (messagesContainerEl) messagesContainerEl.innerHTML = '';
                            if (replyInput) { replyInput.disabled = true; replyInput.value = ''; }
                            if (sendBtn) sendBtn.disabled = true;
                        }
                    }
                }
            }

            // Update the UI
            renderSessionList();

            // If this message belongs to the currently open chat, update the view (only if session still exists)
            if (activeSessionId === sid && sessions[sid]) {
                renderChat(sid);
            }
        });
        isInitialLoad = false;
    });
}

function renderSessionList() {
    const sessionListEl = document.getElementById('session-list');
    if (!sessionListEl) return;

    sessionListEl.innerHTML = '';
    
    // Sort sessions by most recent message
    const sortedSessionIds = Object.keys(sessions).sort((a, b) => {
        const lastA = sessions[a].messages[sessions[a].messages.length - 1];
        const lastB = sessions[b].messages[sessions[b].messages.length - 1];
        const timeA = lastA?.timestamp?.seconds || 0;
        const timeB = lastB?.timestamp?.seconds || 0;
        return timeB - timeA; // Descending
    });

    sortedSessionIds.forEach(sid => {
        const session = sessions[sid];
        const lastMsg = session.messages[session.messages.length - 1];
        
        const div = document.createElement('div');
        div.className = `session-item ${activeSessionId === sid ? 'active' : ''}`;
        div.onclick = () => window.selectSession(sid);
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="session-user">${session.userName} <span style="font-size:0.7rem; color:#9ca3af">(${session.userRole})</span></div>
                <i class="fas fa-trash" style="color:#ef4444; cursor:pointer; font-size:0.8rem; padding:2px;" onclick="event.stopPropagation(); window.deleteSession('${sid}')" title="Delete Conversation"></i>
            </div>
            <div class="session-preview">${lastMsg ? lastMsg.text : 'No messages'}</div>
        `;
        sessionListEl.appendChild(div);
    });
}

window.selectSession = function(sid) {
    activeSessionId = sid;
    
    // Enable inputs
    const replyInput = document.getElementById('reply-input');
    const sendBtn = document.getElementById('send-btn');
    if (replyInput) {
        replyInput.disabled = false;
        replyInput.focus();
    }
    if (sendBtn) sendBtn.disabled = false;

    renderSessionList(); // Re-render to update 'active' class
    renderChat(sid);
}

function renderChat(sid) {
    const session = sessions[sid];
    const chatHeaderEl = document.getElementById('chat-header');
    const messagesContainerEl = document.getElementById('messages-container');
    
    if (chatHeaderEl) chatHeaderEl.textContent = `Chat with ${session.userName}`;
    if (messagesContainerEl) {
        messagesContainerEl.innerHTML = '';
        session.messages.forEach(msg => {
            const div = document.createElement('div');
            const isSupport = msg.sender === 'support' || msg.sender === 'admin';
            div.className = `message ${isSupport ? 'support' : 'user'}`;
            
            const textSpan = document.createElement('span');
            textSpan.textContent = msg.text;
            div.appendChild(textSpan);

            if (isSupport) {
                const delIcon = document.createElement('i');
                delIcon.className = 'fas fa-times';
                delIcon.style.cssText = 'margin-left:10px; cursor:pointer; opacity:0.6; font-size:0.8em;';
                delIcon.onclick = () => window.deleteSupportMessage(msg.id);
                div.appendChild(delIcon);
            }
            
            messagesContainerEl.appendChild(div);
        });
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }
}

window.sendAdminChat = async function() {
    const input = document.getElementById('reply-input');
    const text = input.value.trim();
    if (!text || !activeSessionId) return;
    
    input.value = '';
    
    try {
        await addDoc(collection(db, "support_messages"), {
            sessionId: activeSessionId,
            text: text,
            sender: 'support', // Identifies this as an admin reply
            timestamp: serverTimestamp(),
            read: false
        });
    } catch (e) {
        console.error("Error sending message:", e);
        alert("Failed to send message.");
    }
}

window.deleteSupportMessage = async function(msgId) {
    if(confirm("Are you sure you want to delete this message?")) {
        try {
            await deleteDoc(doc(db, "support_messages", msgId));
        } catch (e) {
            console.error("Error deleting message:", e);
        }
    }
}

window.deleteSession = async function(sid) {
    if (confirm("Are you sure you want to delete this entire conversation? This cannot be undone.")) {
        try {
            const q = query(collection(db, "support_messages"), where("sessionId", "==", sid));
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        } catch (e) {
            console.error("Error deleting session:", e);
            alert("Failed to delete session.");
        }
    }
}

window.handleQuickResponse = function(selectElement) {
    const input = document.getElementById('reply-input');
    if (selectElement.value && input) {
        input.value = selectElement.value;
        input.focus();
        selectElement.value = ""; // Reset dropdown
    }
}

window.handleAutoResponse = function(selectElement) {
    const input = document.getElementById('reply-input');
    if (selectElement.value && input) {
        input.value = selectElement.value;
        input.focus();
        selectElement.value = ""; // Reset dropdown
    }
}

// --- SYSTEM SETTINGS (Sponsored Banner) ---
async function loadSettings() {
    try {
        const docRef = doc(db, "system_settings", "sponsored_banner");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('banner-active').checked = data.isActive || false;
            document.getElementById('banner-title').value = data.title || '';
            document.getElementById('banner-desc').value = data.description || '';
            document.getElementById('banner-link').value = data.link || '';
        }

        const fileConfigSnap = await getDoc(doc(db, "system_settings", "file_config"));
        if (fileConfigSnap.exists()) {
            document.getElementById('max-file-size').value = fileConfigSnap.data().maxSizeMb || '';
        }

        const uiConfigSnap = await getDoc(doc(db, "system_settings", "ui_config"));
        if (uiConfigSnap.exists()) {
            const defaultPage = uiConfigSnap.data().defaultPage;
            if (defaultPage) document.getElementById('default-page-select').value = defaultPage;
        }
    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

const bannerForm = document.getElementById('banner-form');
if (bannerForm) {
    bannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const isActive = document.getElementById('banner-active').checked;
        const title = document.getElementById('banner-title').value;
        const description = document.getElementById('banner-desc').value;
        const link = document.getElementById('banner-link').value;

        try {
            await setDoc(doc(db, "system_settings", "sponsored_banner"), {
                isActive,
                title,
                description,
                link,
                updatedAt: new Date()
            });
            alert('Banner settings updated successfully!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Failed to save settings.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}

const uiConfigForm = document.getElementById('ui-config-form');
if (uiConfigForm) {
    uiConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const defaultPage = document.getElementById('default-page-select').value;

        try {
            await setDoc(doc(db, "system_settings", "ui_config"), {
                defaultPage: defaultPage
            });
            alert('UI settings updated successfully!');
        } catch (error) {
            console.error("Error saving UI settings:", error);
            alert("Failed to save UI settings.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}

const fileConfigForm = document.getElementById('file-config-form');
if (fileConfigForm) {
    fileConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const maxSizeMb = document.getElementById('max-file-size').value;

        try {
            await setDoc(doc(db, "system_settings", "file_config"), {
                maxSizeMb: Number(maxSizeMb) || 100 // Default to 100 if invalid
            });
            alert('File settings updated successfully!');
        } catch (error) {
            console.error("Error saving file settings:", error);
            alert("Failed to save file settings.");
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}