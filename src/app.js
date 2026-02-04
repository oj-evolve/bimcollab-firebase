import { collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, writeBatch, getDocs, getDoc, arrayUnion, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from "firebase/storage";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { createModal, showCustomModal, showAlert, showConfirm, showToast, togglePassword, escapeHtml } from "./ui-utils.js";
import { app, db, storageService, analytics, auth } from "./firebase-init.js";
import { handleLogin, handleSignup, handleGoogleSignIn, handleGoogleSignUp, openForgotPasswordModal, handlePasswordReset, promptRoleSelection, logout, openLogoutConfirmationModal, performLogout } from "./auth.js";
import { initEncryption, encryptData, decryptData, resetEncryptionState } from "./encrypt.js";
import { initViewerState, setViewer, zoom, rotate, resetViewer, setVolume, toggleOrbit, toggleFullscreen } from "./viewer.js";
import { initServiceCenter, openServiceCenter, openContactModal, submitContactForm, startLiveChat } from "./service-center.js";
import { initChat, initChatStorage, resetChatData, addChatMessage, renderChat, chatNode, toggleSearch, checkSearchBlur, handleSearchInput, clearSearch, showMessageToolbar, closeMessageToolbar, send, handleDragOver, highlight, unhighlight, handleDrop, getMessage } from "./chat.js";
import { initializeAds, setupSponsoredBannerListener, updateSponsoredBannerUI } from "./adsense.js";

// Expose UI utilities globally
window.createModal = createModal;
window.showCustomModal = showCustomModal;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.showToast = showToast;
window.togglePassword = togglePassword;

// Expose Chat functions globally
window.chatNode = chatNode;
window.toggleSearch = toggleSearch;
window.checkSearchBlur = checkSearchBlur;
window.handleSearchInput = handleSearchInput;
window.clearSearch = clearSearch;
window.showMessageToolbar = showMessageToolbar;
window.closeMessageToolbar = closeMessageToolbar;
window.send = send;
window.handleDragOver = handleDragOver;
window.highlight = highlight;
window.unhighlight = unhighlight;
window.handleDrop = handleDrop;

const projectStages = [
    { id: 's1', title: 'Briefing', sub: 'Initial Drawings & Concepts' },
    { id: 's2', title: 'Design Development', sub: 'Detailed Architectural Plans' },
    { id: 's3', title: 'Structural Planning', sub: 'Engineering Specs & Calcs' },
    { id: 's4', title: 'Cost Estimation', sub: 'Budget & Quantity Take-off' },
    { id: 's5', title: 'Final Drawing', sub: 'Approved Construction Docs' },
    { id: 's6', title: 'Construction Phase', sub: 'Building Execution & Monitoring' },
    { id: 's7', title: 'Completion', sub: 'Inspection & Handover' }
];

let currentRole;
let currentUserName;
let currentUserPhotoURL;
let currentUserPlan = 'free';
let activeStageId = 's1';

const roleProfiles = {
    architect: { icon: "fa-pen-ruler" },
    engineer: { icon: "fa-hard-hat" },
    contractor: { icon: "fa-truck" },
    quantity: { icon: "fa-calculator" },
    owner: { icon: "fa-user-tie" }
};

const defaultRoleProfiles = {
    architect: { icon: "fa-pen-ruler" },
    engineer: { icon: "fa-hard-hat" },
    contractor: { icon: "fa-truck" },
    quantity: { icon: "fa-calculator" },
    owner: { icon: "fa-user-tie" }
};

const storage = {};
const archivedStorage = {};
const files = {};
const deletedFiles = {};
const activeUploads = {};
let unreadCountC2 = 0;
let unreadCountC1 = 0;
let activeToolbar = null;
let currentProjectName = "BIM COLLAB";
let currentProjectId = localStorage.getItem('bim_project_id') || 'default';
let showProjectOverview = false;

// Firebase Unsubscribe functions
let unsubscribeMessages = null;
let unsubscribeFiles = null;
let unsubscribeTyping = null;
let unsubscribeAllProfiles = null;
let unsubscribePinned = null;
let unsubscribeProjectSettings = null;
let unsubscribeProjectsList = null;
let unsubscribeFileConfig = null;

// Initialize Service Center with state getters
initServiceCenter(() => ({
    currentRole,
    currentProjectId,
    currentUserName,
    roleProfiles
}));

// Initialize Chat
initChat(
    () => ({ currentRole, currentProjectId, activeStageId, currentUserName, roleProfiles }),
    (stageId, viewId) => (files[stageId] && files[stageId][viewId] ? files[stageId][viewId].length : 0)
);

projectStages.forEach(s => {
    files[s.id] = { v1: [], v2: [] };
    deletedFiles[s.id] = [];
});

initChatStorage(projectStages);

window.initStages = function () {
    const list = document.getElementById('stageList');
    list.innerHTML = projectStages.map((s) => `
                <div class="stage ${s.id === activeStageId ? 'active' : ''}" id="nav-${s.id}" onclick="switchStage('${s.id}')">
                    <span class="stage-title">${s.title}</span>
                    <span class="stage-subtitle">${s.sub}</span>
                </div>
            `).join('');
}

window.switchStage = function (id) {
    activeStageId = id;
    document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${id}`);
    if (activeNav) activeNav.classList.add('active');

    setupFirebaseListeners(id);

    if (currentRole) renderWorkspace();
}

function setupFirebaseListeners(stageId) {
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeFiles) unsubscribeFiles();
    if (unsubscribeTyping) unsubscribeTyping();
    if (unsubscribePinned) unsubscribePinned();

    let isInitialLoad = true;
    let isFilesInitialLoad = true;

    // Listen for Messages
    const qMsg = query(collection(db, "messages"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(qMsg, (snapshot) => {
        if (!isInitialLoad && currentRole) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const d = change.doc.data();
                    if (d.user !== currentRole) {
                        if (!document.hasFocus()) playNotificationSound();
                        const grid = document.getElementById('dashboardGrid');

                        if (d.chatId === 'c2') {
                            const badge = document.getElementById('badge-group-2');
                            if (grid && !grid.classList.contains('view-secondary') && badge) {
                                unreadCountC2++;
                                badge.textContent = unreadCountC2 > 99 ? '99+' : unreadCountC2;
                                badge.classList.add('active');
                            }
                            if (grid && !grid.classList.contains('view-secondary')) {
                                const notif = document.getElementById('notif-right');
                                if (notif) notif.style.display = 'block';
                            }
                        }
                        if (d.chatId === 'c1') {
                            const badge = document.getElementById('badge-group-1');
                            if (grid && grid.classList.contains('view-secondary') && badge) {
                                unreadCountC1++;
                                badge.textContent = unreadCountC1 > 99 ? '99+' : unreadCountC1;
                                badge.classList.add('active');
                            }
                            if (grid && grid.classList.contains('view-secondary')) {
                                const notif = document.getElementById('notif-left');
                                if (notif) notif.style.display = 'block';
                            }
                        }
                    }
                }
            });
        }
        isInitialLoad = false;

        // Reset local cache for this stage
        resetChatData(stageId);
        snapshot.docs.forEach(doc => {
            addChatMessage(stageId, doc.data(), doc.id);
        });
        loadStageData();

        // Update archive modal if open
        const archiveModal = document.getElementById('archived-messages-modal');
        if (archiveModal && archiveModal.dataset.chatId) {
            renderArchivedMessagesList(archiveModal.dataset.chatId);
        }
    }, (error) => {
        console.error("Error listening to messages:", error);
        if (error.code === 'permission-denied') console.warn("Ensure Firestore Rules are deployed.");
    });

    // Listen for Files
    const qFiles = query(collection(db, "files"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
    unsubscribeFiles = onSnapshot(qFiles, (snapshot) => {
        if (!isFilesInitialLoad && currentRole) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    if (data.uploadedBy !== currentRole && !data.deleted) {
                        showToast(`New file shared: ${data.name}`);
                        playNotificationSound();
                    }
                }
            });
        }
        isFilesInitialLoad = false;
        files[stageId] = { v1: [], v2: [] };
        deletedFiles[stageId] = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.deleted) {
                deletedFiles[stageId].push({ id: doc.id, ...data });
                return;
            }
            if (files[stageId][data.viewId]) {
                files[stageId][data.viewId].push({
                    id: doc.id,
                    ...data,
                    date: data.timestamp ? data.timestamp.toDate() : new Date()
                });
            }
        });
        loadStageData();
        if (document.getElementById('recycle-bin-modal')) {
            renderRecycleBinList();
        }
    }, (error) => {
        console.error("Error listening to files:", error);
        if (error.code === 'permission-denied') console.warn("Ensure Firestore Rules are deployed.");
    });

    // Listen for Typing Status
    const qTyping = query(collection(db, "typing"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), where("isTyping", "==", true));
    unsubscribeTyping = onSnapshot(qTyping, (snapshot) => {
        const typingMap = {};
        const now = Date.now();
        snapshot.docs.forEach(doc => {
            const d = doc.data();

            // Filter out stale typing indicators (older than 20 seconds)
            if (d.timestamp) {
                const ts = d.timestamp.toMillis ? d.timestamp.toMillis() : (d.timestamp.seconds * 1000);
                if (now - ts > 20000) return;
            }

            if (d.user !== currentRole) {
                if (!typingMap[d.chatId]) typingMap[d.chatId] = [];
                const name = d.userName || (roleProfiles[d.user] ? roleProfiles[d.user].name : d.user);
                if (!typingMap[d.chatId].includes(name)) typingMap[d.chatId].push(name);
            }
        });

        ['c1', 'c2'].forEach(cid => {
            const el = document.getElementById(`typing-${cid}`);
            const statusEl = document.getElementById(`chat-status-${cid}`);
            if (el) {
                const names = typingMap[cid] || [];
                
                if (names.length > 0) {
                    el.textContent = `${names.join(', ')} is typing...`;
                    el.style.display = 'block';
                    if (statusEl) statusEl.style.display = 'none';
                } else {
                    el.textContent = '';
                    el.style.display = 'none';
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        updateOnlineStatusDisplay(cid);
                    }
                }
            }
        });
    });

    // Listen for Pinned Messages
    const qPinned = query(collection(db, "pinned_messages"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId));
    unsubscribePinned = onSnapshot(qPinned, (snapshot) => {
        ['c1', 'c2'].forEach(cid => {
             const el = document.getElementById(`pinned-message-${cid}`);
             if(el) el.style.display = 'none';
        });

        snapshot.docs.forEach(async doc => {
            const data = doc.data();
            const el = document.getElementById(`pinned-message-${data.chatId}`);
            const contentEl = document.getElementById(`pinned-content-${data.chatId}`);
            if (el && contentEl) {
                let text = data.text;
                if (data.isEncrypted) {
                    text = await decryptData(data.text);
                }
                contentEl.innerHTML = `<i class="fas fa-thumbtack" style="margin-right:6px; font-size:0.7rem; color:var(--primary)"></i> <span style="font-size:0.75rem; font-weight:500">${escapeHtml(text)}</span>`;
                el.style.display = 'flex';
            }
        });
    });
}

function setupGlobalProfileListener() {
    const q = collection(db, "projects", currentProjectId, "profiles");
    unsubscribeAllProfiles = onSnapshot(q, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const role = doc.id;
            const data = doc.data();
            if (roleProfiles[role]) {
                if (data.status) roleProfiles[role].status = data.status;
                if (data.statusMessage !== undefined) roleProfiles[role].statusMessage = data.statusMessage;
                if (data.muteNotifications !== undefined) roleProfiles[role].muteNotifications = data.muteNotifications;
                if (data.theme) roleProfiles[role].theme = data.theme;
                else if (data.darkMode !== undefined) roleProfiles[role].theme = data.darkMode ? 'dark' : 'light';
            }
            if (currentRole && role === currentRole) {
                updateDashboardTitleAndSidebar();
                // Apply dark mode setting immediately
                if (roleProfiles[role].theme) {
                    applyTheme(roleProfiles[role].theme);
                }
            }
        });
        loadStageData();
        ['c1', 'c2'].forEach(cid => updateOnlineStatusDisplay(cid));
    });
}

function setupProjectSettingsListener() {
    if (unsubscribeProjectSettings) unsubscribeProjectSettings();
    unsubscribeProjectSettings = onSnapshot(doc(db, "projects", currentProjectId), (docSnapshot) => {
        // Ensure App Name is fixed
        const logoText = document.querySelector('.logo span');
        if (logoText) logoText.textContent = "BIM COLLAB";

        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (data.name) {
                currentProjectName = data.name;
                const projectText = document.getElementById('headerProjectName');
                if (projectText) projectText.textContent = data.name;
                document.title = `BIM COLLAB - ${data.name}`;
            }
        } else if (currentProjectId === 'default') {
            currentProjectName = "Default Project";
            const projectText = document.getElementById('headerProjectName');
            if (projectText) projectText.textContent = currentProjectName;
            document.title = "BIM COLLAB";
        }
    });
}

function updateDashboardTitleAndSidebar() {
    const titleEl = document.getElementById('dashboardTitle');
    const headerEl = document.getElementById('dashboardHeader');
    const welcomeEl = document.getElementById('welcomeMsg');
    
    if (headerEl) headerEl.style.display = 'block';

    if (titleEl && currentRole && currentUserName) {
        const name = currentUserName;
        const firstName = name.split(' ')[0];
        
        const rolePrefixes = {
            architect: 'Arch',
            engineer: 'Eng',
            quantity: 'Svy',
            contractor: 'Contractor',
            owner: 'Owner'
        };
        
        const prefix = rolePrefixes[currentRole];
        const displayTitle = prefix ? `${prefix} ${firstName}` : firstName;
        
        titleEl.textContent = displayTitle;
        if (welcomeEl) {
            const hour = new Date().getHours();
            let greeting = "Welcome back,";
            if (hour < 12) greeting = "Good morning,";
            else if (hour < 18) greeting = "Good afternoon,";
            else greeting = "Good evening,";
            welcomeEl.textContent = greeting;
        }
    }

    const sidebarRole = document.getElementById('sidebarRoleDisplay');
    const sidebarName = document.getElementById('profileNameDisplay');

    if (sidebarRole) sidebarRole.textContent = currentRole;
    if (sidebarName && currentUserName) sidebarName.textContent = currentUserName;

    const avatarEl = document.getElementById('userAvatar');
    const initialsEl = document.getElementById('avatarInitials');
    const imageEl = document.getElementById('avatarImage');

    if (avatarEl && initialsEl && imageEl && currentUserName) {
        if (currentUserPhotoURL) {
            imageEl.src = currentUserPhotoURL;
            imageEl.style.display = 'block';
            initialsEl.style.display = 'none';
        } else {
            imageEl.style.display = 'none';
            initialsEl.style.display = 'block';
            const name = currentUserName;
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            initialsEl.textContent = initials;
        }
        avatarEl.style.display = 'flex';
        
        const statusEl = document.getElementById('statusIndicator');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.className = 'status-indicator ' + (roleProfiles[currentRole]?.status || 'online');
        }

        const proBadge = document.getElementById('proBadge');
        if (proBadge) {
            proBadge.style.display = currentUserPlan === 'pro' ? 'inline-block' : 'none';
        }
    }

    const projectText = document.getElementById('headerProjectName');
    if (projectText) {
        projectText.style.display = currentRole === 'owner' ? 'block' : 'none';
    }
}

window.renderWorkspace = function () {
    const panel = document.getElementById('workspaceContent') || document.getElementById('mainPanel');

    if (currentRole === 'owner' && showProjectOverview) {
        renderProjectOverview(panel);
        return;
    }

    unreadCountC2 = 0;
    unreadCountC1 = 0;

    const notifLeft = document.getElementById('notif-left');
    const notifRight = document.getElementById('notif-right');
    if (notifLeft) notifLeft.style.display = 'none';
    if (notifRight) notifRight.style.display = 'none';

    const toggle = document.getElementById('viewToggle');
    if (toggle) toggle.style.display = ''; // Reset to default (CSS handles mobile/desktop)

    // Engineer and Contractor see a restricted UI
    // const isRestricted = (currentRole === 'engineer' || currentRole === 'contractor');

    let projectsBtn = '';
    if (currentRole === 'owner') {
        projectsBtn = `<button onclick="toggleProjectOverview()" style="margin-bottom: 1rem; padding: 0.5rem 1rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; color: var(--primary); font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem;"><i class="fas fa-th-large"></i> View All Projects</button>`;
    }

    // --- MONETIZATION: Sponsored Banner ---
    const sponsoredBanner = `<div id="sponsored-banner-container" style="display:none;"></div>`;

    panel.innerHTML = `
                    ${projectsBtn}
                    ${sponsoredBanner}
                    <div class="dashboard-grid grid-workspace" id="dashboardGrid">
                        ${viewerNode('v1', 'Project View', 'mobile-group-1')}
                        ${chatNode('c1', 'Main Stream', 'v1', 'mobile-group-1')}
                        ${viewerNode('v2', 'Secondary View', 'mobile-group-2')}
                        ${chatNode('c2', 'Private Channel', 'v2', 'mobile-group-2')}
                    </div>
                `;
    updateSponsoredBannerUI();
    setupSwipeGestures();
    loadStageData();
}

function updateOnlineStatusDisplay(chatId) {
    const statusEl = document.getElementById(`chat-status-${chatId}`);
    if (!statusEl) return;
    
    // Don't update if typing is active
    const typingEl = document.getElementById(`typing-${chatId}`);
    if (typingEl && typingEl.style.display === 'block') return;

    const onlineUsers = [];
    for (const [role, profile] of Object.entries(roleProfiles)) {
        if (role.toLowerCase() !== (currentRole || '').toLowerCase() && profile.status === 'online') {
            let displayName = role.charAt(0).toUpperCase() + role.slice(1);
            if (profile.statusMessage) {
                displayName += ` (${profile.statusMessage})`;
            }
            onlineUsers.push(displayName);
        }
    }

    statusEl.textContent = onlineUsers.length > 0 ? `Online: ${onlineUsers.join(', ')}` : '';
}

window.viewerNode = function (id, title, extraClass = '') {
    initViewerState(id);

    let toolbarStyle = "";

    return `
                <div class="card ${extraClass}">
                    <div class="card-header">
                        <span class="card-title">${title}</span>
                        <span style="font-size:0.6rem; opacity:0.5">${activeStageId.toUpperCase()}</span>
                    </div>
                    <div class="viewer-container" id="viewer-container-${id}" style="position:relative; overflow:hidden;">
                        <div class="viewer-content-wrapper" id="wrapper-${id}">
                            <span style="color:rgba(255,255,255,0.2); font-size:0.7rem">No data for this stage</span>
                        </div>
                        <div class="viewer-toolbar" id="toolbar-${id}" style="${toolbarStyle}">
                            <button class="tool-btn" title="Zoom In" onclick="zoom('${id}', 0.2)"><i class="fas fa-plus"></i></button>
                            <button class="tool-btn" title="Zoom Out" onclick="zoom('${id}', -0.2)"><i class="fas fa-minus"></i></button>
                            <button class="tool-btn" title="Rotate" onclick="rotate('${id}')"><i class="fas fa-sync"></i></button>
                            <button class="tool-btn" title="Reset View" onclick="resetViewer('${id}')"><i class="fas fa-undo"></i></button>
                            <button class="tool-btn" id="orbit-btn-${id}" title="Toggle Orbit" onclick="toggleOrbit('${id}')" style="display:none"><i class="fas fa-cube"></i></button>
                            <input type="range" id="vol-${id}" title="Volume" min="0" max="1" step="0.1" value="1" style="width:50px; display:none; vertical-align:middle; cursor:pointer; margin: 0 2px;" oninput="setVolume('${id}', this.value)">
                            <button class="tool-btn" title="Download All" onclick="downloadAll('${id}')"><i class="fas fa-download"></i></button>
                            <button class="tool-btn" title="Toggle Fullscreen" onclick="toggleFullscreen('${id}')"><i class="fas fa-expand"></i></button>
                        </div>
                    </div>
                    <div class="viewer-thumbs" id="thumbs-${id}" style="display:flex; overflow-x:auto; gap:5px; padding:5px;"></div>
                </div>
            `;
}

window.chatNode = function (id, title, vId, extraClass = '') {
    const currentStageObj = projectStages.find(s => s.id === activeStageId);
    const stageName = currentStageObj ? currentStageObj.title : activeStageId;

    const emojis = ['👍', '👎', '😀', '😂', '😍', '🎉', '🔥', '❤️', '✅', '❌', '🤔', '😎', '😭', '👀', '🚀', '🏗️', '🏠', '👷'];
    const emojiHtml = emojis.map(e => `<span style="cursor:pointer; font-size:1.2rem; padding:4px; user-select:none;" onclick="insertEmoji('${id}', '${e}')">${e}</span>`).join('');

    let ownerControls = '';
    if (currentRole === 'owner') {
        ownerControls = `
            <button onclick="openArchivedMessagesModal('${id}')" title="View Archived" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-right:5px;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-muted)'"><i class="fas fa-history"></i></button>
            <button onclick="openArchiveChatModal('${id}')" title="Archive Chat" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'"><i class="fas fa-archive"></i></button>
        `;
    }

    return `
                <div class="card ${extraClass}" ondragover="handleDragOver(event)" ondragenter="highlight(event)" ondragleave="unhighlight(event)" ondrop="handleDrop(event, '${id}', '${vId}')">
                    <div class="card-header">
                        <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; margin-right:0.5rem;">
                            <div style="display:flex; align-items:center; overflow:hidden;">
                                <span class="card-title" style="flex:0 1 auto; margin-right:0;">${title}</span>
                                <span id="file-count-${id}" onclick="viewAllFiles('${id}', '${vId}')" style="cursor:pointer; font-size:0.6rem; background:var(--primary); color:white; padding:1px 6px; border-radius:10px; margin-left:6px; vertical-align:middle; display:none"></span>
                            </div>
                            <span id="chat-status-${id}" style="font-size:0.65rem; color:var(--text-muted); display: block; height: 14px; line-height: 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                            <span id="typing-${id}" style="font-size:0.65rem; color:var(--primary); font-style:italic; display: none; height: 14px; line-height: 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                        </div>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <div class="search-wrapper" id="search-wrapper-${id}">
                                <i class="fas fa-search search-toggle-icon" onclick="toggleSearch('${id}')" title="Search"></i>
                                <input type="text" id="search-${id}" placeholder="Search..." class="search-input" oninput="handleSearchInput('${id}')" onblur="checkSearchBlur('${id}')">
                                <i id="search-clear-${id}" class="fas fa-times search-clear-btn" onclick="clearSearch('${id}')"></i>
                            </div>
                            ${ownerControls}
                        </div>
                    </div>
                    <div id="pinned-message-${id}" class="pinned-message-banner" style="display:none">
                        <div id="pinned-content-${id}" class="pinned-message-content" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:1rem;"></div>
                        <i class="fas fa-times" style="cursor:pointer; opacity:0.6; font-size:0.8rem" onclick="unpinMessage('${id}')" title="Unpin"></i>
                    </div>
                    <div class="chat-container" id="chat-box-${id}"></div>
                    <div id="reply-preview-${id}" style="font-size: 0.7rem; color: var(--primary); padding-left: 10px; display:none; margin-bottom: 5px;"></div>
                    <div id="progress-container-${id}" style="display:none; padding: 0 10px; margin-bottom: 5px; align-items: center;">
                        <div style="flex: 1; height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
                            <div id="progress-bar-${id}" style="height: 100%; width: 0%; background: var(--primary); transition: width 0.1s;"></div>
                        </div>
                        <i class="fas fa-times-circle" style="margin-left: 8px; cursor: pointer; color: #dc3545; font-size: 0.9rem;" onclick="cancelUpload('${id}')" title="Cancel Upload"></i>
                    </div>
                    <div class="chat-input-area" style="position:relative">
                        <div id="emoji-picker-${id}" style="display:none; position:absolute; bottom:100%; left:0; background:#fff; border:1px solid #ccc; padding:8px; border-radius:4px; width:220px; flex-wrap:wrap; gap:4px; max-height:150px; overflow-y:auto; box-shadow: 0 -4px 12px rgba(0,0,0,0.15); z-index:100; margin-bottom: 8px;">
                            ${emojiHtml}
                        </div>
                        <label class="chat-icon-btn" title="Attach File">
                            <i class="fas fa-paperclip"></i>
                            <input type="file" multiple style="display:none" onchange="handleFile('${id}', '${vId}', this)">
                        </label>
                        <button class="chat-icon-btn" onclick="toggleEmojiPicker('${id}')" title="Add Emoji">
                            <i class="far fa-smile"></i>
                        </button>
                        <input type="text" id="input-${id}" placeholder="Type a message..." style="height: 36px; font-size: 0.85rem;" oninput="handleTyping('${id}')" onkeypress="if(event.key==='Enter') send('${id}')">
                        <button onclick="send('${id}')" class="chat-icon-btn send-btn" title="Send Message"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 0.25rem;"><i class="fas fa-lock" style="margin-right: 4px;"></i>End-to-End Encrypted</div>
                </div>
            `;
}

window.toggleSearch = function(chatId) {
    const wrapper = document.getElementById(`search-wrapper-${chatId}`);
    const input = document.getElementById(`search-${chatId}`);
    if (wrapper && input) {
        wrapper.classList.add('expanded');
        input.focus();
    }
}

window.checkSearchBlur = function(chatId) {
    setTimeout(() => {
        const wrapper = document.getElementById(`search-wrapper-${chatId}`);
        const input = document.getElementById(`search-${chatId}`);
        if (wrapper && input && !input.value && document.activeElement !== input) {
            wrapper.classList.remove('expanded');
        }
    }, 200);
}

window.handleSearchInput = function(chatId) {
    const input = document.getElementById(`search-${chatId}`);
    const clearBtn = document.getElementById(`search-clear-${chatId}`);
    if (clearBtn && input) {
        clearBtn.style.display = input.value ? 'block' : 'none';
    }
    loadStageData();
}

window.clearSearch = function(chatId) {
    const input = document.getElementById(`search-${chatId}`);
    if (input) {
        input.value = '';
        handleSearchInput(chatId);
        input.focus(); // Keep focus to prevent collapse
    }
}

window.loadStageData = async function () {
    await renderChat('c1');
    await renderChat('c2');

    ['v1', 'v2'].forEach(vId => {
        const thumbs = document.getElementById(`thumbs-${vId}`);
        const stageFiles = files[activeStageId][vId];
        if (stageFiles && thumbs && stageFiles.length > 0) {
            thumbs.innerHTML = stageFiles.map((f, i) => {
                const isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name);
                const isCad = /\.(dwg|dxf)$/i.test(f.name);
                const isDoc = /\.(doc|docx|xls|xlsx|ppt|pptx|csv)$/i.test(f.name);
                const icon = isCad ? 'fa-layer-group' : (isDoc ? 'fa-file-alt' : 'fa-file');
                const thumbContent = isImg ? `<img src="${f.url}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#888;"><i class="fas ${icon}"></i></div>`;
                const safeName = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="viewer-thumb" onclick="setViewer('${vId}', '${f.url}', '${safeName}')" style="flex:0 0 auto;">${thumbContent}</div>`;
            }).join('');
            const last = stageFiles[stageFiles.length - 1];
            setViewer(vId, last.url, last.name);
        }
    });
}


window.switchMobileGroup = function(group) {
    const grid = document.getElementById('dashboardGrid');
    const toggle = document.getElementById('viewToggle');
    
    if (group === 'group-2') {
        grid.classList.add('view-secondary');
        if (toggle) toggle.classList.add('active');

        const badge = document.getElementById('badge-group-2');
        if (badge) badge.classList.remove('active');
        if (badge) {
            badge.classList.remove('active');
            badge.textContent = '';
        }
        unreadCountC2 = 0;
        const notif = document.getElementById('notif-right');
        if (notif) notif.style.display = 'none';
    } else {
        grid.classList.remove('view-secondary');
        if (toggle) toggle.classList.remove('active');

        const badge = document.getElementById('badge-group-1');
        if (badge) {
            badge.classList.remove('active');
            badge.textContent = '';
        }
        unreadCountC1 = 0;
        const notif = document.getElementById('notif-left');
        if (notif) notif.style.display = 'none';
    }
}

function setupSwipeGestures() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;

    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    grid.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    grid.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe(e);
    }, { passive: true });

    function handleSwipe(e) {
        if (window.innerWidth > 767) return;
        
        // Avoid conflict with viewer interactions (pan/zoom/rotate) and scrollable thumbs
        if (e.target.closest('.viewer-container') || e.target.closest('.viewer-thumbs')) return;

        const xDiff = touchStartX - touchEndX;
        const yDiff = touchStartY - touchEndY;

        // Ensure it's mostly horizontal swipe
        if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
            if (xDiff > 0) switchMobileGroup('group-2'); // Swipe Left
            else switchMobileGroup('group-1'); // Swipe Right
        }
    }
}


async function resetTypingStatus(chatId) {
    if (!currentRole) return;

    // Unique ID per project/stage/chat/user
    // Explicitly reset typing status in Firestore
    const typingRef = doc(db, "typing", `${currentProjectId}_${activeStageId}_${chatId}_${currentRole}`);
    setDoc(typingRef, { 
        projectId: currentProjectId, 
        stageId: activeStageId, 
        chatId, 
        user: currentRole, 
        userName: currentUserName, 
        isTyping: false, 
        timestamp: serverTimestamp() 
    }).catch(err => console.error("Failed to reset typing status", err));    
}

window.deleteMessage = function (chatId, msgId) {
    showConfirm('Are you sure you want to delete this message?', async () => {
        await deleteDoc(doc(db, "messages", msgId));
    }, 'Delete Message', 'Delete', '#ef4444');
}

window.archiveChat = async function (chatId) {
    if (!currentRole) return;

    const modal = document.getElementById('archive-chat-modal');
    if (modal) modal.remove();

    const msgs = storage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) return;

    const archivePromises = msgs.map(m => updateDoc(doc(db, "messages", m.id), { archived: true }));
    try {
        await Promise.all(archivePromises);
    } catch (e) {
        console.error("Error archiving chat:", e);
        showAlert("Failed to archive chat.", "Error");
    }
}

window.openArchiveChatModal = function(chatId) {
    const modalId = 'archive-chat-modal';
    const { card, close } = createModal(modalId, { maxWidth: '320px' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Archive Chat History</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1.5rem;">Are you sure you want to archive the chat history? Messages will be hidden but preserved.</p>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="cancel-${modalId}" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;">Cancel</button>
                <button onclick="archiveChat('${chatId}')" style="padding:0.5rem 1rem; border:none; background:#ef4444; color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Archive</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
}

window.openArchivedMessagesModal = function(chatId) {
    const modalId = 'archived-messages-modal';
    const { modal, card, close } = createModal(modalId, { maxWidth: '500px' });
    modal.dataset.chatId = chatId;
    card.style.height = '600px';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Archived Messages</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div style="padding: 0.5rem 1.5rem; border-bottom: 1px solid var(--border);">
            <input type="text" id="archived-search-input" placeholder="Search archived messages..." style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; font-size:0.85rem;" oninput="renderArchivedMessagesList('${chatId}')">
        </div>
        <div class="modal-body" id="archived-messages-list">
            <div style="text-align:center; padding:2rem; color:var(--text-muted);">Loading...</div>
        </div>
        <div style="padding:1rem; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:0.5rem;">
            <button onclick="deleteAllArchivedMessages('${chatId}')" style="padding:0.5rem 1rem; border:none; background:#ef4444; color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Delete All Permanently</button>
            <button onclick="restoreAllMessages('${chatId}')" style="padding:0.5rem 1rem; border:none; background:var(--primary); color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Restore All</button>
            <button id="btn-close-${modalId}" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;">Close</button>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`btn-close-${modalId}`).onclick = close;
    
    renderArchivedMessagesList(chatId);
}

window.renderArchivedMessagesList = async function(chatId) {
    const container = document.getElementById('archived-messages-list');
    if (!container) return;
    
    const searchInput = document.getElementById('archived-search-input');
    const term = searchInput ? searchInput.value.toLowerCase() : '';

    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem; display:flex; flex-direction:column; align-items:center; gap:0.5rem;"><i class="fas fa-box-open" style="font-size:2rem; opacity:0.5"></i><span>No archived messages found.</span></div>';
        return;
    }

    container.innerHTML = '';
    
    for (const m of msgs) {
        let text = m.text;
        if (m.isEncrypted) text = await decryptData(m.text);

        if (term && !text.toLowerCase().includes(term) && !m.user.toLowerCase().includes(term)) continue;
        
        const item = document.createElement('div');
        item.style.cssText = 'background:var(--bg-body); padding:0.75rem; margin-bottom:0.5rem; border-radius:0.5rem; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;';
        
        const content = document.createElement('div');
        content.style.flex = '1';
        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                <strong style="font-size:0.8rem; color:var(--primary);">${m.user}</strong>
                <span style="font-size:0.7rem; color:var(--text-muted);">${m.time}</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-main); word-break:break-word;">${escapeHtml(text)}</div>
        `;
        
        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fas fa-trash-restore"></i>';
        btn.title = "Restore Message";
        btn.style.cssText = "border:none; background:var(--bg-card); color:var(--primary); cursor:pointer; font-size:0.9rem; padding:0.5rem; border-radius:0.25rem; border:1px solid var(--border); transition:all 0.2s;";
        btn.onmouseover = () => { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; };
        btn.onmouseout = () => { btn.style.background = 'var(--bg-card)'; btn.style.color = 'var(--primary)'; };
        btn.onclick = () => restoreMessage(m.id);
        
        item.appendChild(content);
        item.appendChild(btn);
        container.appendChild(item);
    }

    if (container.children.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">No matching messages found.</div>';
    }
}

window.restoreMessage = async function(msgId) {
    try {
        await updateDoc(doc(db, "messages", msgId), { archived: false });
    } catch (e) {
        console.error("Error restoring message:", e);
        showAlert("Failed to restore message.", "Error");
    }
}

window.restoreAllMessages = function(chatId) {
    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        showAlert("No archived messages to restore.");
        return;
    }

    showConfirm(`Are you sure you want to restore ${msgs.length} archived messages?`, async () => {
        try {
            const promises = msgs.map(m => updateDoc(doc(db, "messages", m.id), { archived: false }));
            await Promise.all(promises);
        } catch (e) {
            console.error("Error restoring all messages:", e);
            showAlert("Failed to restore messages.", "Error");
        }
    }, 'Restore Messages');
}

window.deleteAllArchivedMessages = function(chatId) {
    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        showAlert("No archived messages to delete.");
        return;
    }

    showConfirm(`Are you sure you want to PERMANENTLY delete ${msgs.length} archived messages? This action cannot be undone.`, async () => {
        try {
            const promises = msgs.map(m => deleteDoc(doc(db, "messages", m.id)));
            await Promise.all(promises);
        } catch (e) {
            console.error("Error deleting all archived messages:", e);
            showAlert("Failed to delete messages.", "Error");
        }
    }, 'Delete Permanently', 'Delete', '#ef4444');
}

window.pinMessage = async function(chatId, msgId) {
    const msgs = getMessage(activeStageId, chatId); // This needs to be an array, so getMessage needs to return array or we use getter
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;

    await setDoc(doc(db, "pinned_messages", `${activeStageId}_${chatId}`), {
        stageId: activeStageId,
        projectId: currentProjectId,
        chatId: chatId,
        text: msg.text,
        isEncrypted: msg.isEncrypted,
        timestamp: serverTimestamp()
    });
}

window.unpinMessage = async function(chatId) {
    await deleteDoc(doc(db, "pinned_messages", `${activeStageId}_${chatId}`));
}

window.editMessage = async function (chatId, msgId, index) {
    const msg = getMessage(activeStageId, chatId, index);
    if (msg.user !== currentRole) return;
    let currentText = msg.isEncrypted ? await decryptData(msg.text) : msg.text;
    
    const modalId = 'edit-message-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px' });

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Edit Message</span><i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';

    const textarea = document.createElement('textarea');
    textarea.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main); resize:vertical; min-height:80px; font-family:inherit; margin-bottom:1rem;';
    textarea.value = currentText;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex; justify-content:flex-end; gap:10px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;';
    cancelBtn.onclick = close;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.5rem 1rem; border:none; background:var(--primary); color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;';
    saveBtn.onclick = async () => {
        const newText = textarea.value.trim();
        if (newText !== "") {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            const encrypted = await encryptData(newText);
            await updateDoc(doc(db, "messages", msgId), {
                text: encrypted,
                isEncrypted: true,
                edited: true
            });
            close();
        }
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    body.appendChild(textarea);
    body.appendChild(btnContainer);
    card.appendChild(header);
    card.appendChild(body);
    
    document.getElementById(`close-${modalId}`).onclick = close;
    textarea.focus();
}

window.toggleEmojiPicker = function(id) {
    const picker = document.getElementById(`emoji-picker-${id}`);
    if (picker) {
        picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    }
}

window.insertEmoji = function(id, emoji) {
    const input = document.getElementById(`input-${id}`);
    if (input) {
        input.value += emoji;
        input.focus();
        handleTyping(id);
    }
    const picker = document.getElementById(`emoji-picker-${id}`);
    if (picker) picker.style.display = 'none';
}

window.handleTyping = function (chatId) {
    if (!currentRole) return;
    
    const input = document.getElementById(`input-${chatId}`);
    const isTyping = input && input.value.trim().length > 0;

    const now = Date.now();
    const last = lastTypingUpdate[chatId] || 0;
    // Unique ID per project/stage/chat/user
    const typingRef = doc(db, "typing", `${currentProjectId}_${activeStageId}_${chatId}_${currentRole}`);

    if (typingTimers[chatId]) clearTimeout(typingTimers[chatId]);

    if (isTyping) {
        // Throttle updates to Firestore (max once every 2 seconds)
        if (now - last > 2000) {
            lastTypingUpdate[chatId] = now;
            setDoc(typingRef, { projectId: currentProjectId, stageId: activeStageId, chatId, user: currentRole, userName: currentUserName, isTyping: true, timestamp: serverTimestamp() });
        }
        
        typingTimers[chatId] = setTimeout(() => {
            // Mark as not typing after 3 seconds of inactivity
            resetTypingStatus(chatId);
        }, 3000);
    } else {
        // Immediately stop typing if input is empty
        setDoc(typingRef, { projectId: currentProjectId, stageId: activeStageId, chatId, user: currentRole, userName: currentUserName, isTyping: false, timestamp: serverTimestamp() });
    }
}


window.cancelUpload = function(chatId) {
    if (activeUploads[chatId]) {
        activeUploads[chatId].cancel();
    }
}


window.handleFile = async function (chatId, vId, input) {
    const filesList = input.files ? Array.from(input.files) : [input];
    if (filesList.length === 0) return;

    const maxSize = (fileConfig.maxSizeMb || 100) * 1024 * 1024;
    for (const file of filesList) {
        if (file.size > maxSize) {
            showAlert(`File "${file.name}" is too large. The maximum allowed size is ${fileConfig.maxSizeMb || 100} MB.`, "File Too Large");
            return;
        }
    }

    // Check Storage Quota for Free Plan
    if (currentUserPlan === 'free') {
        const FREE_LIMIT = 500 * 1024 * 1024; // 500 MB
        let uploadSize = filesList.reduce((acc, file) => acc + file.size, 0);

        try {
            const projectDoc = await getDoc(doc(db, "projects", currentProjectId));
            const currentUsage = projectDoc.data()?.storageUsage || 0;
            
            if (currentUsage + uploadSize > FREE_LIMIT) {
                showAlert(`Storage limit reached (500MB). Current usage: ${(currentUsage / (1024 * 1024)).toFixed(1)} MB. Please upgrade to upload more files.`, "Storage Full");
                openUpgradeModal();
                return;
            }
        } catch (e) {
            console.error("Error checking storage quota:", e);
        }
    }

    const pContainer = document.getElementById(`progress-container-${chatId}`);
    const pBar = document.getElementById(`progress-bar-${chatId}`);

    const uploadedNames = [];

    let i = 0;
    if (pContainer) pContainer.style.display = 'flex';

    for (const file of filesList) {
        try {
            const storageRef = ref(storageService, `files/${activeStageId}/${vId}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            activeUploads[chatId] = uploadTask;

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        if (pBar) pBar.style.width = `${progress}%`;
                    },
                    (error) => {
                        reject(error);
                    },
                    async () => {
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        
                        const batch = writeBatch(db);
                        const fileRef = doc(collection(db, "files"));
                        const projectRef = doc(db, "projects", currentProjectId);

                        batch.set(fileRef, {
                            stageId: activeStageId,
                            projectId: currentProjectId,
                            viewId: vId,
                            name: file.name,
                            size: file.size,
                            url: url,
                            storagePath: uploadTask.snapshot.ref.fullPath,
                            uploadedBy: currentRole,
                            timestamp: serverTimestamp()
                        });
                        batch.update(projectRef, { storageUsage: increment(file.size) });
                        await batch.commit();

                        uploadedNames.push(file.name);
                        resolve();
                    }
                );
            });
            delete activeUploads[chatId];
        } catch (error) {
            delete activeUploads[chatId];
            if (error.code === 'storage/canceled') {
                console.log("Upload canceled by user");
                break;
            }
            console.error("Error uploading file:", file.name, error);
            showAlert(`Failed to upload ${file.name}: ${error.message}`, "Upload Failed");
        }
    }

    if (pContainer) pContainer.style.display = 'none';
    if (pBar) pBar.style.width = '0%';

    if (uploadedNames.length > 0) {
        const text = uploadedNames.length === 1
            ? `Shared file: ${uploadedNames[0]}`
            : `Shared ${uploadedNames.length} files: ${uploadedNames.join(', ')}`;

        const encryptedText = await encryptData(text);

        await addDoc(collection(db, "messages"), {
            stageId: activeStageId,
            projectId: currentProjectId,
            chatId: chatId,
            user: currentRole,
            text: encryptedText,
            isEncrypted: true,
            timestamp: serverTimestamp()
        });
    }
}



window.downloadAll = function (vId) {
    const list = files[activeStageId][vId];
    if (!list || list.length === 0) {
        showAlert('No files to download for this view.');
        return;
    }

    list.forEach((f, i) => {
        setTimeout(() => {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, i * 500);
    });
}

window.softDeleteFile = function(fileId) {
    showConfirm(
        'Remove this file from view? It will remain in storage and count towards your quota.',
        async () => {
            try {
                // Only mark as deleted in DB, do not delete from Storage or decrement usage
                await updateDoc(doc(db, "files", fileId), { deleted: true, deletedAt: serverTimestamp() });
                showToast("File removed from view.");
            } catch (error) {
                console.error("Error removing file:", error);
                showAlert("Failed to remove file.", "Error");
            }
        }, 'Remove File', 'Remove', '#ef4444'
    );
}

window.restoreFile = async function(fileId) {
    try {
        await updateDoc(doc(db, "files", fileId), { deleted: false, deletedAt: null });
        showToast("File restored successfully.");
    } catch (error) {
        console.error("Error restoring file:", error);
        showAlert("Failed to restore file.", "Error");
    }
}

window.openRecycleBin = function() {
    const modalId = 'recycle-bin-modal';
    const { card, close } = createModal(modalId, { maxWidth: '600px' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-trash-restore" style="margin-right:8px; color:var(--primary)"></i>Recycle Bin</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
                Files are permanently deleted after 30 days. Restoring a file makes it visible in the viewer again.
            </p>
            <div id="recycle-bin-list" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 0.5rem; background: var(--bg-body);">
                <div style="text-align:center; padding:2rem; color:var(--text-muted);">Loading...</div>
            </div>
        </div>
        <div style="padding:1rem; border-top:1px solid var(--border); text-align:right;">
            <button id="btn-close-${modalId}" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; color:var(--text-main);">Close</button>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`btn-close-${modalId}`).onclick = close;

    renderRecycleBinList();
}

window.renderRecycleBinList = function() {
    const container = document.getElementById('recycle-bin-list');
    if (!container) return;

    const list = deletedFiles[activeStageId] || [];

    if (list.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">No deleted files found in this stage.</div>';
        return;
    }

    container.innerHTML = '';
    list.forEach(f => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.75rem; border-bottom:1px solid var(--border);';
        
        const deletedDate = f.deletedAt ? f.deletedAt.toDate() : (f.timestamp ? f.timestamp.toDate() : new Date());
        const dateStr = deletedDate.toLocaleDateString();

        // Calculate days left (30 days retention)
        const now = new Date();
        const expirationDate = new Date(deletedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
        const timeDiff = expirationDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        let daysLeftColor = 'var(--text-muted)';
        if (daysLeft <= 3) daysLeftColor = '#ef4444';
        else if (daysLeft <= 7) daysLeftColor = '#f59e0b';
        
        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `
            <div style="font-weight:500; font-size:0.9rem; color:var(--text-main); display:flex; align-items:center; gap:8px;">
                <i class="fas fa-file" style="color:var(--text-muted);"></i> ${escapeHtml(f.name)}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                Deleted: ${dateStr} • Size: ${(f.size / 1024 / 1024).toFixed(2)} MB
                <span style="margin-left: 8px; font-weight: 600; color: ${daysLeftColor}; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">
                    <i class="fas fa-hourglass-half" style="font-size: 0.7rem; margin-right: 4px;"></i>${daysLeft > 0 ? daysLeft + ' days left' : 'Deleting soon'}
                </span>
            </div>
        `;

        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fas fa-undo"></i> Restore';
        btn.style.cssText = 'padding:0.4rem 0.8rem; background:var(--bg-card); border:1px solid var(--primary); color:var(--primary); border-radius:4px; cursor:pointer; font-size:0.8rem; margin-left:10px; font-weight:500;';
        btn.onclick = () => restoreFile(f.id);

        item.appendChild(info);
        item.appendChild(btn);
        container.appendChild(item);
    });
}

window.viewAllFiles = function (chatId, vId) {
    const stageFiles = files[activeStageId][vId];
    if (!stageFiles || stageFiles.length === 0) return;

    const modalId = 'files-modal';
    const { card, close } = createModal(modalId);

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Files in ${activeStageId.toUpperCase()}</span><i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>`;

    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '0 1.5rem';
    searchContainer.style.display = 'flex';
    searchContainer.style.gap = '10px';

    const searchInput = document.createElement('input');
    searchInput.placeholder = 'Filter files...';
    searchInput.style.cssText = 'flex:1;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem';

    const sortSelect = document.createElement('select');
    sortSelect.style.cssText = 'padding:8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;background:var(--bg-body);cursor:pointer';
    sortSelect.innerHTML = `
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">Name (A-Z)</option>
                <option value="za">Name (Z-A)</option>
            `;

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(sortSelect);

    const list = document.createElement('div');
    list.className = 'modal-body';

    const renderList = () => {
        list.innerHTML = '';
        const term = searchInput.value.toLowerCase();
        const sort = sortSelect.value;

        let arr = [...stageFiles];

        arr.sort((a, b) => {
            if (sort === 'az') return a.name.localeCompare(b.name);
            if (sort === 'za') return b.name.localeCompare(a.name);
            const da = a.date || 0;
            const db = b.date || 0;
            if (sort === 'oldest') return da - db;
            return db - da;
        });

        arr.forEach(f => {
            if (term && !f.name.toLowerCase().includes(term)) return;

            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.5rem;background:var(--bg-body);border-radius:4px';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:10px;flex:1';
            nameSpan.textContent = f.name;

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '10px';

            const viewBtn = document.createElement('i');
            viewBtn.className = 'fas fa-eye';
            viewBtn.style.cursor = 'pointer';
            viewBtn.style.color = 'var(--primary)';
            viewBtn.title = 'View';
            viewBtn.onclick = () => {
                setViewer(vId, f.url, f.name);
                close();
            };

            const downBtn = document.createElement('a');
            downBtn.href = f.url;
            downBtn.download = f.name;
            downBtn.innerHTML = '<i class="fas fa-download"></i>';
            downBtn.style.color = 'var(--text-muted)';
            downBtn.title = 'Download';

            const delBtn = document.createElement('i');
            delBtn.className = 'fas fa-trash';
            delBtn.style.cursor = 'pointer';
            delBtn.style.color = '#ef4444';
            delBtn.title = 'Remove from view';
            delBtn.onclick = () => {
                softDeleteFile(f.id);
                close();
            };

            actions.appendChild(viewBtn);
            actions.appendChild(downBtn);
            
            if (currentRole === 'owner' || f.uploadedBy === currentRole) {
                actions.appendChild(delBtn);
            }

            item.appendChild(nameSpan);
            item.appendChild(actions);
            list.appendChild(item);
        });
    };

    searchInput.oninput = renderList;
    sortSelect.onchange = renderList;

    card.appendChild(header);
    card.appendChild(searchContainer);
    card.appendChild(list);
    document.getElementById(`close-${modalId}`).onclick = close;
    renderList();
}

window.toggleSettingsDropdown = function() {
    const dropdown = document.getElementById('settingsDropdown');
    const input = document.getElementById('settingsNameInput');
    const statusMsgInput = document.getElementById('settingsStatusMessageInput');
    const statusSelect = document.getElementById('settingsStatusSelect');
    const themeToggle = document.getElementById('settingsThemeToggle');
    const muteToggle = document.getElementById('settingsMuteToggle');
    const projectContainer = document.getElementById('ownerProjectNameContainer');
    const projectManagement = document.getElementById('projectManagementSection');
    const projectInput = document.getElementById('settingsProjectNameInput');
    
    if (!dropdown) return;
    
    if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    } else {
        dropdown.classList.add('active');
        if (currentRole && currentUserName) { 
            input.value = currentUserName;
            if (statusMsgInput) statusMsgInput.value = roleProfiles[currentRole].statusMessage || '';
            if (statusSelect) statusSelect.value = roleProfiles[currentRole].status || 'online';
            if (themeToggle) themeToggle.checked = roleProfiles[currentRole].theme === 'dark';
            if (muteToggle) muteToggle.checked = !!roleProfiles[currentRole].muteNotifications;
            
            // Populate settings avatar
            const settingsAvatarImage = document.getElementById('settingsAvatarImage');
            const settingsAvatarInitials = document.getElementById('settingsAvatarInitials');

            if (settingsAvatarImage && settingsAvatarInitials) {
                if (currentUserPhotoURL) {
                    settingsAvatarImage.src = currentUserPhotoURL;
                    settingsAvatarImage.style.display = 'block';
                    settingsAvatarInitials.style.display = 'none';
                } else {
                    settingsAvatarImage.style.display = 'none';
                    settingsAvatarInitials.style.display = 'block';
                    const initials = currentUserName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    settingsAvatarInitials.textContent = initials;
                }
            }

            // Attach listener for avatar upload
            const uploadInput = document.getElementById('avatarUploadInput');
            if (uploadInput) uploadInput.onchange = handleAvatarUpload;

            if (currentRole === 'owner' && projectContainer) {
                projectContainer.style.display = 'block';
                if (projectManagement) {
                    projectManagement.style.display = 'block';
                    const deleteBtn = projectManagement.querySelector('button[onclick="deleteProject()"]');
                    if (deleteBtn) {
                        deleteBtn.style.display = currentProjectId === 'default' ? 'none' : 'block';
                    }
                    renderStorageUsage(projectManagement);
                }
                if (projectInput) projectInput.value = currentProjectName;
            } else if (projectContainer) {
                projectContainer.style.display = 'none';
                if (projectManagement) projectManagement.style.display = 'none';
            }
        }
    }
}

async function renderStorageUsage(container) {
    let wrapper = document.getElementById('storage-usage-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'storage-usage-wrapper';
        wrapper.style.marginTop = '1rem';
        wrapper.style.padding = '0.75rem';
        wrapper.style.background = 'var(--bg-body)';
        wrapper.style.borderRadius = '0.5rem';
        wrapper.style.border = '1px solid var(--border)';
        container.appendChild(wrapper);
    }

    wrapper.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);"><i class="fas fa-circle-notch fa-spin"></i> Calculating storage usage...</div>';

    try {
        const projectRef = doc(db, "projects", currentProjectId);
        const projectSnap = await getDoc(projectRef);
        let usedBytes = projectSnap.data()?.storageUsage;

        // Fallback: If storageUsage doesn't exist (legacy projects), calculate it once and save it.
        if (usedBytes === undefined) {
            const q = query(collection(db, "files"), where("projectId", "==", currentProjectId));
            const snapshot = await getDocs(q);
            usedBytes = 0;
            snapshot.forEach(doc => usedBytes += (doc.data().size || 0));
            await updateDoc(projectRef, { storageUsage: usedBytes });
        }
        
        let limitBytes = 500 * 1024 * 1024; // Default Free 500MB
        let planName = 'Starter';
        
        if (currentUserPlan === 'pro') {
            limitBytes = 50 * 1024 * 1024 * 1024; // 50GB
            planName = 'Professional';
        } else if (currentUserPlan === 'business') {
            limitBytes = 500 * 1024 * 1024 * 1024; // 500GB
            planName = 'Business';
        }

        const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
        const limitMB = (limitBytes / (1024 * 1024)).toFixed(0);
        const percent = Math.min(100, (usedBytes / limitBytes) * 100).toFixed(1);
        
        let color = 'var(--primary)';
        if (percent > 80) color = '#f59e0b';
        if (percent > 95) color = '#ef4444';

        wrapper.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">Storage (${planName})</span>
                <span style="font-size:0.75rem; color:var(--text-muted);">${usedMB} MB / ${limitMB} MB</span>
            </div>
            <div style="width:100%; height:6px; background:var(--border); border-radius:3px; overflow:hidden;">
                <div style="width:${percent}%; height:100%; background:${color}; transition:width 0.5s ease;"></div>
            </div>
            <div style="margin-top:0.5rem; display:flex; justify-content:space-between; align-items:center;">
                <a href="#" onclick="openRecycleBin(); return false;" style="font-size:0.75rem; color:var(--text-muted); text-decoration:underline; cursor:pointer;"><i class="fas fa-trash-restore"></i> Recycle Bin</a>
                ${percent > 90 ? `<span style="font-size:0.75rem; color:#ef4444; margin:0 5px;"><i class="fas fa-exclamation-triangle"></i> Low storage</span>` : ''}
                <a href="#" onclick="openUpgradeModal(); return false;" style="font-size:0.75rem; color:var(--primary); text-decoration:underline; cursor:pointer;">Manage Plan</a>
            </div>
        `;
    } catch (e) {
        console.error("Error calculating storage:", e);
        wrapper.innerHTML = '<div style="font-size:0.8rem; color:#ef4444;">Failed to load storage usage.</div>';
    }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file || !auth.currentUser) return;

    if (!file.type.startsWith('image/')) {
        showAlert('Please select an image file.');
        return;
    }

    const compressImage = (file, maxWidth = 512, quality = 0.8) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxWidth) {
                            width *= maxWidth / height;
                            height = maxWidth;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas to Blob conversion failed.'));
                        }
                    }, 'image/jpeg', quality);
                };
                img.onerror = (error) => reject(error);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const settingsAvatar = document.getElementById('settingsAvatar');
    if (settingsAvatar) settingsAvatar.style.opacity = '0.5';

    try {
        const compressedBlob = await compressImage(file);
        const userId = auth.currentUser.uid;
        const storageRef = ref(storageService, `avatars/${userId}/profile.jpg`);
        const uploadTask = await uploadBytes(storageRef, compressedBlob);
        const downloadURL = await getDownloadURL(uploadTask.ref);

        // Update Auth profile and Firestore user document
        await updateProfile(auth.currentUser, { photoURL: downloadURL });
        await setDoc(doc(db, "users", userId), { photoURL: downloadURL }, { merge: true });

        // Update local state and UI
        currentUserPhotoURL = downloadURL;
        updateDashboardTitleAndSidebar(); // Updates header avatar
        
        // Update settings dropdown avatar immediately
        const settingsAvatarImage = document.getElementById('settingsAvatarImage');
        const settingsAvatarInitials = document.getElementById('settingsAvatarInitials');
        if (settingsAvatarImage && settingsAvatarInitials) {
            settingsAvatarImage.src = downloadURL;
            settingsAvatarImage.style.display = 'block';
            settingsAvatarInitials.style.display = 'none';
        }

    } catch (error) {
        console.error("Error uploading avatar:", error);
        showAlert("Failed to upload profile picture. Please try again.", "Error");
    } finally {
        if (settingsAvatar) settingsAvatar.style.opacity = '1';
        event.target.value = ''; // Reset file input
    }
}

window.saveSettingsFromDropdown = async function() {
    const input = document.getElementById('settingsNameInput');
    const statusSelect = document.getElementById('settingsStatusSelect');
    const statusMsgInput = document.getElementById('settingsStatusMessageInput');
    const themeToggle = document.getElementById('settingsThemeToggle');
    const muteToggle = document.getElementById('settingsMuteToggle');
    const projectInput = document.getElementById('settingsProjectNameInput');
    const saveBtn = document.querySelector('.dropdown-save-btn');

    if (input && input.value.trim() !== "" && currentRole) {
        const originalText = saveBtn ? saveBtn.textContent : 'Save Changes';
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }

        const newName = input.value.trim();
        const newStatus = statusSelect ? statusSelect.value : 'online';
        const newStatusMessage = statusMsgInput ? statusMsgInput.value.trim() : '';
        const newTheme = themeToggle && themeToggle.checked ? 'dark' : 'light';
        const isMuted = muteToggle ? muteToggle.checked : false;
        try {
            // Update the user's name in their own document
            if (auth.currentUser) {
                await setDoc(doc(db, "users", auth.currentUser.uid), { name: newName }, { merge: true });
                currentUserName = newName; // Update local state immediately
            }
            // Update other settings in the project-specific profiles (legacy structure)
            await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { status: newStatus, statusMessage: newStatusMessage, muteNotifications: isMuted, theme: newTheme }, { merge: true });
            
            if (currentRole === 'owner' && projectInput) {
                const newProjectName = projectInput.value.trim();
                if (newProjectName) {
                    await setDoc(doc(db, "projects", currentProjectId), { name: newProjectName }, { merge: true });
                }
            }
            toggleSettingsDropdown();
        } catch (e) {
            console.error("Error saving settings:", e);
            showAlert("Failed to save settings.", "Error");
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }
}

window.openResourcesModal = function(e) {
    if (e) e.preventDefault();
    const modalId = 'resources-modal';
    const { card, close } = createModal(modalId, { maxWidth: '600px' });
    card.style.maxHeight = '85vh';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title"><i class="fas fa-tools" style="margin-right:8px; color:var(--primary)"></i>Recommended Resources</span><i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>`;

    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '0 1.5rem 1rem 1.5rem';
    searchContainer.style.borderBottom = '1px solid var(--border)';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search tools...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '0.6rem';
    searchInput.style.border = '1px solid var(--border)';
    searchInput.style.borderRadius = '0.375rem';
    searchInput.style.background = 'var(--bg-body)';
    searchInput.style.color = 'var(--text-main)';
    searchInput.style.fontSize = '0.9rem';
    
    searchContainer.appendChild(searchInput);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.overflowY = 'auto';
    
    const resources = [
        {
            category: "AI Tools for Construction",
            items: [
                { name: "BuildAI", desc: "Automated construction scheduling and risk management.", link: "#", icon: "fa-robot" },
                { name: "PlanVision", desc: "Convert 2D PDFs to 3D BIM models instantly.", link: "#", icon: "fa-magic" }
            ]
        },
        {
            category: "BIM Courses & Certification",
            items: [
                { name: "BIM Manager Pro", desc: "Complete certification path for Revit and Navisworks.", link: "#", icon: "fa-graduation-cap" },
                { name: "Civil 3D Mastery", desc: "Advanced techniques for infrastructure projects.", link: "#", icon: "fa-road" }
            ]
        },
        {
            category: "Productivity Apps",
            items: [
                { name: "SiteTrack", desc: "Mobile field reporting and snagging tool.", link: "#", icon: "fa-clipboard-check" },
                { name: "CloudConnect", desc: "Seamless file synchronization for large CAD files.", link: "#", icon: "fa-cloud" }
            ]
        }
    ];

    const renderResources = (filterText = '') => {
        const term = filterText.toLowerCase();
        let html = '';
        let hasResults = false;

        resources.forEach(cat => {
            const filteredItems = cat.items.filter(item => 
                item.name.toLowerCase().includes(term) || 
                item.desc.toLowerCase().includes(term)
            );

            if (filteredItems.length > 0) {
                hasResults = true;
                html += `<h4 style="color:var(--primary); margin: 1rem 0 0.5rem 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">${cat.category}</h4>`;
                html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px;">`;
                filteredItems.forEach(item => {
                    html += `
                        <a href="${item.link}" target="_blank" style="text-decoration:none; color:inherit;">
                            <div class="resource-card" style="border:1px solid var(--border); border-radius:6px; padding:10px; height:100%; transition: transform 0.2s, box-shadow 0.2s; background:var(--bg-body); cursor:pointer;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
                                <div style="display:flex; align-items:center; margin-bottom:5px;">
                                    <div style="width:30px; height:30px; background:rgba(37, 99, 235, 0.1); border-radius:4px; display:flex; align-items:center; justify-content:center; margin-right:10px;">
                                        <i class="fas ${item.icon}" style="color:var(--primary)"></i>
                                    </div>
                                    <strong style="font-size:0.9rem;">${item.name}</strong>
                                </div>
                                <p style="font-size:0.8rem; color:var(--text-muted); margin:0; line-height:1.4;">${item.desc}</p>
                                <div style="margin-top:8px; font-size:0.75rem; color:var(--primary); font-weight:500;">Check it out <i class="fas fa-external-link-alt" style="font-size:0.65rem"></i></div>
                            </div>
                        </a>
                    `;
                });
                html += `</div>`;
            }
        });
        
        if (!hasResults) {
            html = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">No tools found matching "${escapeHtml(filterText)}"</div>`;
        } else {
            html += `<div style="margin-top: 2rem; font-size: 0.75rem; color: var(--text-muted); text-align: center; font-style: italic;">Disclosure: Some links above may be affiliate links. We may earn a commission if you make a purchase.</div>`;
        }

        body.innerHTML = html;
    };

    searchInput.addEventListener('input', (e) => {
        renderResources(e.target.value);
    });

    renderResources();

    card.appendChild(header);
    card.appendChild(searchContainer);
    card.appendChild(body);
    document.getElementById(`close-${modalId}`).onclick = close;
}

window.calculateFlexPlanCost = function(storageBytes) {
    const BASE_PRICE = 5.00;
    const INCLUDED_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
    const PRICE_PER_EXTRA_GB = 1.00;

    let storageOverageCost = 0;
    if (storageBytes > INCLUDED_STORAGE_BYTES) {
        const extraBytes = storageBytes - INCLUDED_STORAGE_BYTES;
        const extraGB = Math.ceil(extraBytes / (1024 * 1024 * 1024));
        storageOverageCost = extraGB * PRICE_PER_EXTRA_GB;
    }

    return {
        base: BASE_PRICE.toFixed(2),
        storageOverage: storageOverageCost.toFixed(2),
        total: (BASE_PRICE + storageOverageCost).toFixed(2)
    };
}

window.openUpgradeModal = function () {
    const modalId = 'upgrade-modal';
    const { card, close } = createModal(modalId, { maxWidth: '800px' });

    // --- Programmatic UI Creation for Maintainability ---

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.style.background = 'linear-gradient(135deg, #1e293b, #0f172a)';
    header.style.color = 'white';
    header.innerHTML = `<span class="card-title"><i class="fas fa-crown" style="color:#FFD700; margin-right:8px;"></i>Choose Your Plan</span>`;
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeIcon.style.cursor = 'pointer';
    closeIcon.onclick = close;
    header.appendChild(closeIcon);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '2rem';

    const intro = document.createElement('div');
    intro.style.textAlign = 'center';
    intro.style.marginBottom = '2rem';
    intro.innerHTML = `
        <h2 style="margin-bottom:0.5rem; color:var(--text-main);">Unlock the full potential of BIM Collab</h2>
        <p style="color:var(--text-muted);">Plans that scale with your projects.</p>
    `;
    body.appendChild(intro);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    grid.style.gap = '1.5rem';

    const plans = [
        {
            name: 'Starter',
            price: '$0',
            priceSub: '/mo',
            features: ['1 Project', '3 Collaborators', '500 MB Storage', 'Standard Support'],
            isCurrent: currentUserPlan === 'free',
            buttonText: 'Current Plan',
            action: () => close(),
            popular: false
        },
        {
            name: 'Flex',
            price: '$5',
            priceSub: '/mo',
            features: ['Pay-as-you-go', '5 Collaborators', '2 GB Storage', '$1 per extra GB', 'Email Support'],
            isCurrent: currentUserPlan === 'flex',
            buttonText: currentUserPlan === 'flex' ? 'Current Plan' : 'Get Flex',
            action: () => showAlert('Stripe integration required.', 'Coming Soon'),
            popular: false
        },
        {
            name: 'Professional',
            price: '$29',
            priceSub: '/mo',
            features: ['5 Projects', '10 Collaborators', '50 GB Storage', 'Priority Email Support', 'Usage-based overages'],
            isCurrent: currentUserPlan === 'pro',
            buttonText: 'Upgrade Now',
            action: () => showAlert('Stripe integration required for payment processing.', 'Coming Soon'),
            popular: true
        },
        {
            name: 'Business',
            price: '$99',
            priceSub: '/mo',
            features: ['Unlimited Projects', 'Unlimited Collaborators', '500 GB Storage', 'Advanced Analytics', 'Dedicated Support'],
            isCurrent: false,
            buttonText: 'Upgrade Now',
            action: () => showAlert('Stripe integration required for payment processing.', 'Coming Soon'),
            popular: false
        }
    ];

    plans.forEach(plan => {
        const planCard = document.createElement('div');
        planCard.style.border = `1px solid ${plan.popular ? 'var(--primary)' : 'var(--border)'}`;
        planCard.style.borderRadius = '0.5rem';
        planCard.style.padding = '1.5rem';
        planCard.style.textAlign = 'center';
        planCard.style.position = 'relative';
        planCard.style.display = 'flex';
        planCard.style.flexDirection = 'column';

        if (plan.popular) {
            planCard.innerHTML += `<div style="position:absolute; top:0; right:0; background:var(--primary); color:white; font-size:0.7rem; padding:0.25rem 0.75rem; border-bottom-left-radius:0.5rem;">POPULAR</div>`;
        }

        planCard.innerHTML += `
            <h3 style="margin-bottom:0.5rem; color:${plan.popular ? 'var(--primary)' : 'inherit'};">${plan.name}</h3>
            <div style="font-size:2rem; font-weight:700; margin-bottom:1rem;">${plan.price}<span style="font-size:0.9rem; font-weight:400; color:var(--text-muted);">${plan.priceSub}</span></div>
        `;

        const featureList = document.createElement('ul');
        featureList.style.cssText = 'list-style:none; padding:0; margin-bottom:1.5rem; text-align:left; font-size:0.85rem; color:var(--text-muted); flex-grow:1;';
        plan.features.forEach(feature => {
            featureList.innerHTML += `<li style="margin-bottom:0.5rem;"><i class="fas fa-check" style="color:var(--primary); margin-right:8px;"></i>${feature}</li>`;
        });
        planCard.appendChild(featureList);

        const button = document.createElement('button');
        button.textContent = plan.buttonText;
        button.style.width = '100%';
        button.style.padding = '0.75rem';
        button.style.borderRadius = '0.375rem';
        button.style.cursor = 'pointer';
        button.style.fontWeight = '600';
        button.disabled = plan.isCurrent;
        button.style.background = plan.isCurrent ? 'var(--bg-body)' : 'var(--primary)';
        button.style.color = plan.isCurrent ? 'var(--text-main)' : 'white';
        button.style.border = plan.isCurrent ? `1px solid var(--border)` : 'none';
        button.onclick = plan.action;
        planCard.appendChild(button);

        grid.appendChild(planCard);
    });

    body.appendChild(grid);
    card.appendChild(header);
    card.appendChild(body);

    document.getElementById(`close-${modalId}`).onclick = close;
}

let fileConfig = { maxSizeMb: 100 }; // Default
function setupFileConfigListener() {
    if (unsubscribeFileConfig) unsubscribeFileConfig();
    unsubscribeFileConfig = onSnapshot(doc(db, "system_settings", "file_config"), (docSnap) => {
        if (docSnap.exists()) {
            fileConfig = docSnap.data();
        } else {
            fileConfig = { maxSizeMb: 100 };
        }
    });
}

function setupConnectivityListeners() {
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.innerHTML = '<i class="fas fa-wifi-slash"></i> You are currently offline. Changes will sync when online.';
    document.body.appendChild(banner);

    const updateStatus = () => {
        banner.classList.toggle('visible', !navigator.onLine);
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

async function initializeUserApp(user, userData) {
    try {
        currentRole = (userData.role || 'architect').toLowerCase();
        currentUserName = user.displayName || userData.name || 'User';
        currentUserPhotoURL = user.photoURL || userData.photoURL || null;
        currentUserPlan = userData.plan || 'free';

        document.getElementById('auth-container').style.display = 'none';
        document.querySelector('.header').style.display = 'flex';
        document.querySelector('.app-container').style.display = 'grid';
        document.querySelector('.footer').style.display = 'flex';

        initializeAds();

        await initializeAppCore();
    } catch (error) {
        console.error("Error initializing user app:", error);
        showAlert("Failed to load application data. Please check your connection and try again.", "Initialization Error");
        // Revert to login state
        document.getElementById('auth-container').style.display = 'flex';
        document.querySelector('.header').style.display = 'none';
        document.querySelector('.app-container').style.display = 'none';
        document.querySelector('.footer').style.display = 'none';
    }
}

// Expose initializeUserApp to window so auth.js can call it
window.initializeUserApp = initializeUserApp;

onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('app-loader');

    if (user) {
        // Show loader and hide auth immediately to prevent "redirect back" glitch
        document.getElementById('auth-container').style.display = 'none';
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }

        // Optimization: Start encryption initialization and user profile fetch in parallel
        const encryptionInit = initEncryption();
        const userDocRef = doc(db, "users", user.uid);
        const userDocPromise = getDoc(userDocRef);

        const [_, userDoc] = await Promise.all([encryptionInit, userDocPromise]);

        if (userDoc.exists()) {
            await initializeUserApp(user, userDoc.data());
            // Hide loader AFTER app is initialized and visible
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 300);
            }
        } else {
            // New user from Google Sign-In, needs to select a role.
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => { loader.style.display = 'none'; }, 300);
            }
            promptRoleSelection(user);
            return;
        }
    } else {
        document.getElementById('auth-container').style.display = 'flex';
        document.querySelector('.header').style.display = 'none';
        document.querySelector('.app-container').style.display = 'none';
        document.querySelector('.footer').style.display = 'none';

        resetEncryptionState();
        currentRole = null;
        currentUserName = null;
        currentUserPlan = 'free';
        // Hide loader and show the auth container
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }
    }
});

async function initializeAppCore() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // Initialize Listeners and Render UI
    await initEncryption();
    setupFirebaseListeners(activeStageId);
    setupGlobalProfileListener();
    setupProjectSettingsListener();
    setupProjectsListListener();
    setupSponsoredBannerListener();
    setupFileConfigListener();
    updateDashboardTitleAndSidebar();
    renderWorkspace();

    window.addEventListener('scroll', () => {
        const dashboardHeader = document.getElementById('dashboardHeader');
        if (dashboardHeader) {
            if (window.scrollY > 10) {
                dashboardHeader.classList.add('scrolled');
            } else {
                dashboardHeader.classList.remove('scrolled');
            }
        }
    });

    // Mobile Sidebar Logic
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileSidebar = document.getElementById('mobileSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    function toggleSidebar() {
        mobileSidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // Header Toggle Logic
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            const grid = document.getElementById('dashboardGrid');
            if (!grid) return;
            const isSecondary = grid.classList.contains('view-secondary');
            switchMobileGroup(isSecondary ? 'group-1' : 'group-2');
        });
    }

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
        const dropdown = document.getElementById('settingsDropdown');
        const avatar = document.getElementById('userAvatar');
        if (dropdown && dropdown.classList.contains('active') && !dropdown.contains(e.target) && !avatar.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Settings Toggles - Immediate Effect
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', async (e) => {
            if (currentRole) {
                const newTheme = e.target.checked ? 'dark' : 'light';
                applyTheme(newTheme);
                if (roleProfiles[currentRole]) roleProfiles[currentRole].theme = newTheme;
                
                try {
                    await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { theme: newTheme }, { merge: true });
                } catch (err) {
                    console.error("Error saving theme:", err);
                }
            }
        });
    }

    const muteToggle = document.getElementById('settingsMuteToggle');
    if (muteToggle) {
        muteToggle.addEventListener('change', async (e) => {
            if (currentRole) {
                const isMuted = e.target.checked;
                if (roleProfiles[currentRole]) roleProfiles[currentRole].muteNotifications = isMuted;
                
                try {
                    await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { muteNotifications: isMuted }, { merge: true });
                } catch (err) {
                    console.error("Error saving mute setting:", err);
                }
            }
        });
    }

    // Keyboard shortcut for search (Ctrl+K)
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchC1 = document.getElementById('search-c1');
            const searchC2 = document.getElementById('search-c2');
            
            if (document.activeElement === searchC1 && searchC2) {
                searchC2.focus();
            } else if (searchC1) {
                searchC1.focus();
            }
        }

        if (e.key === 'Escape') {
            const active = document.activeElement;
            if (active && active.classList.contains('search-input')) {
                e.preventDefault();
                active.value = '';
                active.blur();
                const chatId = active.id.replace('search-', '');
                handleSearchInput(chatId);
            }
        }
    });

    await initEncryption();
    setupConnectivityListeners();
    // Auto-set status to Online on load
    if (currentRole && currentProjectId) {
        setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { status: 'online' }, { merge: true }).catch(console.error);
    }

    // Auto-set status to Away on close (Best effort)
    window.addEventListener('beforeunload', () => {
        if (currentRole && currentProjectId) {
            setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { status: 'away' }, { merge: true });
        }
    });
};
document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
    document.body.appendChild(script);

    // Customize Floating Service Button Icon
    const serviceBtn = document.querySelector('.floating-service-btn');
    if (serviceBtn) {
        serviceBtn.innerHTML = '<i class="fas fa-headset"></i>';
    }

    initStages();


    // Auth form toggling
    document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').style.display = 'none'; document.getElementById('signup-form').style.display = 'block'; });
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').style.display = 'block'; document.getElementById('signup-form').style.display = 'none'; });

    // Auth actions
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('signup-btn').addEventListener('click', handleSignup);
    document.getElementById('google-btn').addEventListener('click', handleGoogleSignIn);
    document.getElementById('google-signup-btn').addEventListener('click', handleGoogleSignUp);
    document.getElementById('login-password').addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('signup-password').addEventListener('keypress', e => { if (e.key === 'Enter') handleSignup(); });
    document.getElementById('signup-confirm-password').addEventListener('keypress', e => { if (e.key === 'Enter') handleSignup(); });
});

function applyTheme(theme) {
    if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', systemDark);
    } else {
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (currentRole && roleProfiles[currentRole]?.theme === 'system') {
        document.body.classList.toggle('dark-mode', e.matches);
    }
});

/* --- Multi-Project Management --- */

function setupProjectsListListener() {
    if (unsubscribeProjectsList) unsubscribeProjectsList();
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    unsubscribeProjectsList = onSnapshot(q, (snapshot) => {
        const select = document.getElementById('projectSelect');
        if (!select) return;
        
        select.innerHTML = '';
        
        let projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (!projects.find(p => p.id === 'default')) {
            projects.push({ id: 'default', name: 'Default Project' });
        }
        
        const sortedDocs = projects.sort((a, b) => {
            if (a.id === 'default') return -1;
            if (b.id === 'default') return 1;
            return 0;
        });

        sortedDocs.forEach(data => {
            const opt = document.createElement('option');
            opt.value = data.id;
            opt.textContent = data.name || "Default Project";
            if (data.id === currentProjectId) opt.selected = true;
            select.appendChild(opt);
        });
    });
}

window.switchProject = function(projectId) {
    if (projectId === currentProjectId) return;
    
    showProjectOverview = false;
    currentProjectId = projectId;
    localStorage.setItem('bim_project_id', projectId);
    
    // Reset state for new project
    activeStageId = 's1';
    sessionReadThresholds = {};
    initStages();    // Reset Role Profiles to defaults to avoid data leak from previous project
    Object.keys(defaultRoleProfiles).forEach(role => {
        roleProfiles[role] = { ...defaultRoleProfiles[role] };
    });

    // Unsubscribe existing listeners
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeFiles) unsubscribeFiles();
    if (unsubscribeTyping) unsubscribeTyping();
    if (unsubscribePinned) unsubscribePinned();
    if (unsubscribeAllProfiles) unsubscribeAllProfiles();
    if (unsubscribeProjectSettings) unsubscribeProjectSettings();

    // Clear local data caches
    projectStages.forEach(s => {
        resetChatData(s.id);
        files[s.id] = { v1: [], v2: [] };
        deletedFiles[s.id] = [];
    });

    // Re-initialize
    setupFirebaseListeners(activeStageId);
    setupGlobalProfileListener();
    setupProjectSettingsListener();
    
    // Refresh UI
    updateDashboardTitleAndSidebar();
    renderWorkspace();
    
    // Close settings
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

window.createProject = async function() {
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');

    // Check if user is on Pro plan
    let isPro = false;
    if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().plan === 'pro') {
            isPro = true;
        }
    }

    // Enforce 1-project limit for free users
    if (!isPro) {
        const projectsSnap = await getDocs(collection(db, "projects"));
        if (projectsSnap.size >= 1) {
            openUpgradeModal();
            return;
        }
    }

    openCreateProjectModal();
}

window.openCreateProjectModal = function() {
    const modalId = 'create-project-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-plus-circle" style="color:var(--primary); margin-right:8px;"></i>New Project</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Enter a name for your new project workspace.</p>
            <input type="text" id="new-project-name" placeholder="Project Name (e.g. Sky Tower Phase 1)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-body); color:var(--text-main); margin-bottom:1rem; font-size:0.95rem;" onkeypress="if(event.key==='Enter') performProjectCreation()">
            <textarea id="new-project-desc" placeholder="Description (Optional)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-body); color:var(--text-main); margin-bottom:1.5rem; font-size:0.95rem; resize:vertical; min-height:80px; font-family:inherit;"></textarea>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectCreation()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3);">Create Project</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
    
    setTimeout(() => {
        const input = document.getElementById('new-project-name');
        if(input) input.focus();
    }, 50);
}

window.performProjectCreation = async function() {
    const input = document.getElementById('new-project-name');
    const descInput = document.getElementById('new-project-desc');
    if (!input || !input.value.trim()) return;
    
    const name = input.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const modal = document.getElementById('create-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectCreation"]') : null;
    
    if (btn) {
        btn.textContent = 'Creating...';
        btn.disabled = true;
    }

    try {
        const batch = writeBatch(db);
        const newProjectRef = doc(collection(db, "projects"));
        
        batch.set(newProjectRef, { name: name, description: description, createdAt: serverTimestamp(), owner: currentRole, storageUsage: 0 });
        
        // Initialize profiles for the new project
        Object.keys(defaultRoleProfiles).forEach(role => {
            const profileRef = doc(db, "projects", newProjectRef.id, "profiles", role);
            batch.set(profileRef, { ...defaultRoleProfiles[role] });
        });

        await batch.commit();
        
        if (modal) modal.remove();
        switchProject(newProjectRef.id);
    } catch (e) {
        console.error("Error creating project:", e);
        showAlert("Failed to create project.", "Error");
        if (btn) {
            btn.textContent = 'Create Project';
            btn.disabled = false;
        }
    }
}

window.deleteProject = function() {
    if (currentRole !== 'owner') return;
    
    if (currentProjectId === 'default') {
        showAlert("The default project cannot be deleted.");
        return;
    }

    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');

    openDeleteProjectModal(currentProjectId, currentProjectName);
}

window.toggleProjectOverview = function() {
    showProjectOverview = !showProjectOverview;
    renderWorkspace();
}

async function renderProjectOverview(panel) {
    panel.innerHTML = `
        <div style="margin-bottom:1rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                <button onclick="toggleProjectOverview()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;"><i class="fas fa-arrow-left"></i> Back to Dashboard</button>
                <button onclick="createProject()" style="padding:0.5rem 1rem; background:var(--primary); color:white; border:none; border-radius:0.5rem; cursor:pointer; font-weight:600;">+ New Project</button>
            </div>
            <div style="position:relative;">
                <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted);"></i>
                <input type="text" placeholder="Search projects..." style="width:100%; padding:0.75rem 0.75rem 0.75rem 2.5rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-card); color:var(--text-main); font-size:0.9rem;" oninput="filterProjectList(this.value)">
            </div>
        </div>
        <div id="project-list-container" class="dashboard-grid grid-2">
            <div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">Loading projects...</div>
        </div>
    `;
    
    const container = document.getElementById('project-list-container');
    
    try {
        const snapshot = await getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc")));
        
        if (snapshot.empty) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No projects found.</div>`;
            return;
        }
        
        container.innerHTML = '';
        
        let projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (!projects.find(p => p.id === 'default')) {
            projects.push({ id: 'default', name: 'Default Project', createdAt: null });
        }

        const sortedDocs = projects.sort((a, b) => {
            if (a.id === 'default') return -1;
            if (b.id === 'default') return 1;
            return 0;
        });

        sortedDocs.forEach(data => {
            const isCurrent = data.id === currentProjectId;
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = `position:relative; transition:transform 0.2s; ${isCurrent ? 'border:2px solid var(--primary);' : ''}`;
            if (!isCurrent) {
                card.onmouseover = () => card.style.transform = 'translateY(-2px)';
                card.onmouseout = () => card.style.transform = 'translateY(0)';
            }
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title" style="font-size:1rem;">${escapeHtml(data.name || 'Default Project')}</span>
                    ${isCurrent ? '<span style="font-size:0.6rem; background:var(--primary); color:white; padding:2px 6px; border-radius:4px;">ACTIVE</span>' : ''}
                </div>
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:1.5rem 0; opacity:0.8; cursor:pointer;" onclick="switchProject('${data.id}')">
                    <i class="fas fa-building" style="font-size:2.5rem; margin-bottom:0.75rem; color:var(--text-muted);"></i>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Created: ${date}</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">
                    <button onclick="switchProject('${data.id}')" style="flex:1; padding:0.5rem; background:var(--bg-body); color:var(--primary); border:1px solid var(--border); border-radius:0.25rem; cursor:pointer; font-weight:500;">${isCurrent ? 'Current' : 'Open'}</button>
                    ${data.id !== 'default' ? `<button onclick="deleteProjectById('${data.id}', '${escapeHtml(data.name || 'Project')}')" style="padding:0.5rem 0.75rem; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); border-radius:0.25rem; cursor:pointer;" title="Delete Project"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
        
    } catch (e) {
        console.error("Error loading projects:", e);
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#ef4444;">Failed to load projects.</div>`;
    }
}

window.deleteProjectById = function(id, name) {
    openDeleteProjectModal(id, name);
}

window.renameProject = function() {
    const input = document.getElementById('settingsProjectNameInput');
    if (!input || !input.value.trim()) return;
    
    const newName = input.value.trim();
    openRenameConfirmationModal(newName);
}

window.openRenameConfirmationModal = function(newName) {
    const modalId = 'rename-project-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Confirm Rename</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Are you sure you want to rename this project to <strong>"${escapeHtml(newName)}"</strong>?
            </p>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button id="cancel-${modalId}" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectRename()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">Rename</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
}

window.performProjectRename = async function() {
    const input = document.getElementById('settingsProjectNameInput');
    if (!input) return;
    const newName = input.value.trim();
    
    const modal = document.getElementById('rename-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectRename"]') : null;
    
    if (btn) {
        btn.textContent = 'Renaming...';
        btn.disabled = true;
    }

    const settingsBtn = input.nextElementSibling;
    const originalText = settingsBtn ? settingsBtn.textContent : 'Rename';
    if (settingsBtn) {
        settingsBtn.textContent = '...';
        settingsBtn.disabled = true;
    }

    try {
        await setDoc(doc(db, "projects", currentProjectId), { name: newName }, { merge: true });
        
        if (modal) modal.remove();
        
        if (settingsBtn) {
            settingsBtn.textContent = 'Done';
            setTimeout(() => {
                settingsBtn.textContent = 'Rename';
                settingsBtn.disabled = false;
            }, 1500);
        }
    } catch (e) {
        console.error("Error renaming project:", e);
        showAlert("Failed to rename project.", "Error");
        if (modal) modal.remove();
        if (settingsBtn) {
            settingsBtn.textContent = originalText;
            settingsBtn.disabled = false;
        }
    }
}

window.resetTeamStatus = function() {
    if (currentRole !== 'owner') return;
    
    showConfirm("Reset all users' status to 'Away'? This clears 'ghost' online indicators.", async () => {
        const batch = writeBatch(db);
        ['architect', 'engineer', 'contractor', 'quantity', 'owner'].forEach(role => {
            const ref = doc(db, "projects", currentProjectId, "profiles", role);
            batch.set(ref, { status: 'away' }, { merge: true });
        });
        try {
            await batch.commit();
            showToast("Team status reset.");
        } catch (e) {
            console.error("Error resetting status:", e);
            showAlert("Failed to reset status.", "Error");
        }
    }, "Fix Online Status");
}

window.resetProjectName = function() {
    openResetProjectNameModal();
}

window.openResetProjectNameModal = function() {
    const modalId = 'reset-project-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Confirm Reset</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Are you sure you want to revert the project name to <strong>'Default Project'</strong>?
            </p>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button id="cancel-${modalId}" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performResetProjectName()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">Reset</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
}

window.performResetProjectName = async function() {
    const modal = document.getElementById('reset-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performResetProjectName"]') : null;
    
    if (btn) {
        btn.textContent = 'Resetting...';
        btn.disabled = true;
    }
    
    const input = document.getElementById('settingsProjectNameInput');
    if (input) input.value = "Default Project";
    
    try {
        await setDoc(doc(db, "projects", currentProjectId), { name: "Default Project" }, { merge: true });
        if (modal) modal.remove();
    } catch (e) {
        console.error("Error resetting name:", e);
        showAlert("Failed to reset name.", "Error");
        if (modal) modal.remove();
    }
}

window.filterProjectList = function(term) {
    const container = document.getElementById('project-list-container');
    if (!container) return;
    const cards = container.querySelectorAll('.card');
    const lowerTerm = term.toLowerCase();
    
    cards.forEach(card => {
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            const title = titleEl.textContent.toLowerCase();
            card.style.display = title.includes(lowerTerm) ? 'flex' : 'none';
        }
    });
}

window.openDeleteProjectModal = function(projectId, projectName) {
    const modalId = 'delete-project-modal';
    const { card, close } = createModal(modalId, { maxWidth: '400px', zIndex: '3000' });

    card.innerHTML = `
        <div class="modal-header" style="border-bottom:none; padding-bottom:0;">
            <span class="card-title" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Delete Project</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body" style="text-align:center; padding-top:0;">
            <div style="font-size:3rem; color:#ef4444; margin:1rem 0; opacity:0.2"><i class="fas fa-trash-alt"></i></div>
            <h3 style="margin-bottom:0.5rem; color:var(--text-main);">Are you sure?</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem; line-height:1.5;">
                You are about to permanently delete <strong>"${escapeHtml(projectName)}"</strong>.<br>This action cannot be undone.
            </p>
            <div style="display:flex; gap:10px; justify-content:center; width:100%;">
                <button id="cancel-${modalId}" style="flex:1; padding:0.75rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectDeletion('${projectId}')" style="flex:1; padding:0.75rem; border:none; background:#ef4444; color:white; border-radius:0.5rem; cursor:pointer; font-weight:600; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);">Delete</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
}

window.performProjectDeletion = async function(projectId) {
    const modal = document.getElementById('delete-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectDeletion"]') : null;
    
    if (btn) {
        btn.textContent = 'Deleting...';
        btn.disabled = true;
    }

    if (projectId === currentProjectId) {
        switchProject('default');
    }

    try {
        await deleteDoc(doc(db, "projects", projectId));
        
        if (modal) modal.remove();

        if (showProjectOverview && projectId !== currentProjectId) {
             const panel = document.getElementById('workspaceContent') || document.getElementById('mainPanel');
             renderProjectOverview(panel);
        }
    } catch (e) {
        console.error("Error deleting project:", e);
        showAlert("Failed to delete project.", "Error");
        if (modal) modal.remove();
    }
}

function playNotificationSound() {
    if (currentRole && roleProfiles[currentRole] && roleProfiles[currentRole].muteNotifications) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio play failed", e);
    }
}