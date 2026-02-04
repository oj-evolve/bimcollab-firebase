// Enhanced admin.js - Complete Live Support System
import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    setDoc, 
    getDoc, 
    query, 
    orderBy, 
    limit, 
    startAfter, 
    where, 
    serverTimestamp, 
    onSnapshot, 
    addDoc, 
    writeBatch,
    increment 
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

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

// Global state
let currentAgentId = null;
let currentAgentName = null;
let activeSessionId = null;
let unsubscribeSessions = null;
let unsubscribeMessages = null;
let unsubscribeAgentStatus = null;
let sessions = {};

// --- AUTHENTICATION ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('admin-app');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        
        // Initialize agent profile
        await initializeAgentProfile(user);
        initializeAppState();
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        
        // Clean up agent status on logout
        if (currentAgentId) {
            await setAgentStatus(currentAgentId, 'offline');
        }
    }
});

async function initializeAgentProfile(user) {
    try {
        // Check if agent profile exists
        const agentRef = doc(db, "support_agents", user.uid);
        const agentSnap = await getDoc(agentRef);
        
        if (!agentSnap.exists()) {
            // Create new agent profile
            await setDoc(agentRef, {
                agentId: user.uid,
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                status: 'online',
                currentChats: 0,
                maxChats: 5,
                skills: ['general', 'technical', 'modeling'], // Default skills
                averageResponseTime: 0,
                totalChatsHandled: 0,
                satisfactionScore: 0,
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp()
            });
        } else {
            // Update existing agent to online
            await updateDoc(agentRef, {
                status: 'online',
                lastActive: serverTimestamp()
            });
        }
        
        currentAgentId = user.uid;
        currentAgentName = user.displayName || user.email.split('@')[0];
        
        // Set up heartbeat to keep agent online
        setInterval(() => updateAgentHeartbeat(), 30000); // Every 30 seconds
        
        // Handle page unload
        window.addEventListener('beforeunload', async () => {
            await setAgentStatus(currentAgentId, 'offline');
        });
        
    } catch (e) {
        console.error("Error initializing agent profile:", e);
    }
}

async function updateAgentHeartbeat() {
    if (currentAgentId && auth.currentUser) {
        try {
            await updateDoc(doc(db, "support_agents", currentAgentId), {
                lastActive: serverTimestamp()
            });
        } catch (e) {
            console.error("Error updating heartbeat:", e);
        }
    }
}

async function setAgentStatus(agentId, status) {
    try {
        await updateDoc(doc(db, "support_agents", agentId), {
            status: status,
            lastActive: serverTimestamp()
        });
    } catch (e) {
        console.error("Error setting agent status:", e);
    }
}

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
    logoutBtn.addEventListener('click', async () => {
        if (currentAgentId) {
            await setAgentStatus(currentAgentId, 'offline');
        }
        signOut(auth);
    });
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
        let defaultTabId = 'dashboard';
        if (uiConfigSnap.exists() && uiConfigSnap.data().defaultPage) {
            defaultTabId = uiConfigSnap.data().defaultPage;
        }
        switchToTab(defaultTabId);
    } catch (e) {
        console.error("Could not load UI config, defaulting to dashboard.", e);
        switchToTab('dashboard');
    }
}

function switchToTab(tabId) {
    // Clean up listeners
    if (unsubscribeSessions) { 
        unsubscribeSessions(); 
        unsubscribeSessions = null; 
    }
    if (unsubscribeMessages) { 
        unsubscribeMessages(); 
        unsubscribeMessages = null; 
    }
    activeSessionId = null;

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const tabContent = document.getElementById(`tab-${tabId}`);

    if (navItem) navItem.classList.add('active');
    if (tabContent) tabContent.classList.add('active');

    switch (tabId) {
        case 'dashboard':
            loadStats();
            loadAgentPerformance();
            break;
        case 'users': 
            loadUsers(); 
            break;
        case 'projects': 
            loadProjects(); 
            break;
        case 'messages': 
            loadContactSubmissions(); 
            break;
        case 'settings': 
            loadSettings(); 
            break;
        case 'live-chat': 
            loadLiveSupportSessions(); 
            break;
    }
}

// --- DASHBOARD STATS ---
async function loadStats() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const projectsSnap = await getDocs(collection(db, "projects"));
        const sessionsSnap = await getDocs(collection(db, "support_sessions"));
        
        document.getElementById('stat-users').textContent = usersSnap.size;
        document.getElementById('stat-projects').textContent = projectsSnap.size;
        document.getElementById('stat-msgs').textContent = sessionsSnap.size;
    } catch (e) {
        console.error("Error loading stats:", e);
    }
}

async function loadAgentPerformance() {
    try {
        const agentsSnapshot = await getDocs(collection(db, "support_agents"));
        
        console.log("Agent Performance:");
        agentsSnapshot.forEach(doc => {
            const agent = doc.data();
            console.log(`${agent.name}: ${agent.totalChatsHandled} chats, ${agent.satisfactionScore}% satisfaction`);
        });
    } catch (e) {
        console.error("Error loading agent performance:", e);
    }
}

// --- USERS MANAGEMENT ---
async function loadUsers() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading users...</div>';
    
    try {
        const snapshot = await getDocs(collection(db, "users"));
        
        if (snapshot.empty) {
            usersList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">No users found.</p>';
            return;
        }
        
        usersList.innerHTML = '';
        snapshot.forEach(doc => {
            const user = doc.data();
            const div = document.createElement('div');
            div.className = 'data-list-item';
            div.innerHTML = `
                <div class="item-info">
                    <h4>${user.displayName || user.email}</h4>
                    <p>${user.email} • Joined ${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}</p>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-sm" onclick="viewUserDetails('${doc.id}')">View</button>
                    <button class="btn-sm btn-danger" onclick="deleteUser('${doc.id}')">Delete</button>
                </div>
            `;
            usersList.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading users:", e);
        usersList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:2rem;">Error loading users.</p>';
    }
}

window.viewUserDetails = async function(userId) {
    alert(`View user details for: ${userId}`);
    // Implement modal with user details
}

window.deleteUser = async function(userId) {
    if (confirm("Are you sure you want to delete this user?")) {
        try {
            await deleteDoc(doc(db, "users", userId));
            loadUsers();
        } catch (e) {
            console.error("Error deleting user:", e);
            alert("Failed to delete user.");
        }
    }
}

// --- PROJECTS MANAGEMENT ---
async function loadProjects() {
    const projectsList = document.getElementById('projects-list');
    projectsList.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading projects...</div>';
    
    try {
        const snapshot = await getDocs(collection(db, "projects"));
        
        if (snapshot.empty) {
            projectsList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">No projects found.</p>';
            return;
        }
        
        projectsList.innerHTML = '';
        snapshot.forEach(doc => {
            const project = doc.data();
            const div = document.createElement('div');
            div.className = 'data-list-item';
            div.innerHTML = `
                <div class="item-info">
                    <h4>${project.name || 'Unnamed Project'}</h4>
                    <p>ID: ${doc.id} • Created ${project.createdAt ? new Date(project.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}</p>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-sm" onclick="viewProjectDetails('${doc.id}')">View</button>
                    <button class="btn-sm btn-danger" onclick="deleteProject('${doc.id}')">Delete</button>
                </div>
            `;
            projectsList.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading projects:", e);
        projectsList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:2rem;">Error loading projects.</p>';
    }
}

window.viewProjectDetails = async function(projectId) {
    alert(`View project details for: ${projectId}`);
}

window.deleteProject = async function(projectId) {
    if (confirm("Are you sure you want to delete this project?")) {
        try {
            await deleteDoc(doc(db, "projects", projectId));
            loadProjects();
        } catch (e) {
            console.error("Error deleting project:", e);
            alert("Failed to delete project.");
        }
    }
}

// --- CONTACT SUBMISSIONS ---
async function loadContactSubmissions() {
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
    
    try {
        const q = query(collection(db, "contact_submissions"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            messagesList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">No messages yet.</p>';
            return;
        }
        
        messagesList.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const div = document.createElement('div');
            div.className = 'data-list-item';
            div.style.background = msg.replied ? 'transparent' : '#fffbeb';
            div.innerHTML = `
                <div class="item-info">
                    <h4>${msg.subject} ${!msg.replied ? '<span style="color:#f59e0b; font-size:0.75rem;">• NEW</span>' : ''}</h4>
                    <p>${msg.name} (${msg.email}) • ${msg.category} • ${msg.createdAt ? new Date(msg.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}</p>
                    <p style="margin-top:0.5rem; font-size:0.85rem;">${msg.message.substring(0, 100)}...</p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-direction:column;">
                    <button class="btn-sm" onclick="viewContactMessage('${doc.id}')">View</button>
                    ${!msg.replied ? `<button class="btn-sm" style="background:var(--primary); color:white;" onclick="markAsReplied('${doc.id}')">Mark Replied</button>` : ''}
                    <button class="btn-sm btn-danger" onclick="deleteContactMessage('${doc.id}')">Delete</button>
                </div>
            `;
            messagesList.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading contact submissions:", e);
        messagesList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:2rem;">Error loading messages.</p>';
    }
}

window.viewContactMessage = async function(msgId) {
    try {
        const msgDoc = await getDoc(doc(db, "contact_submissions", msgId));
        if (msgDoc.exists()) {
            const msg = msgDoc.data();
            alert(`From: ${msg.name} (${msg.email})\nCategory: ${msg.category}\nSubject: ${msg.subject}\n\nMessage:\n${msg.message}`);
        }
    } catch (e) {
        console.error("Error viewing message:", e);
    }
}

window.markAsReplied = async function(msgId) {
    try {
        await updateDoc(doc(db, "contact_submissions", msgId), {
            replied: true,
            repliedAt: serverTimestamp()
        });
        loadContactSubmissions();
    } catch (e) {
        console.error("Error marking as replied:", e);
    }
}

window.deleteContactMessage = async function(msgId) {
    if (confirm("Are you sure you want to delete this message?")) {
        try {
            await deleteDoc(doc(db, "contact_submissions", msgId));
            loadContactSubmissions();
        } catch (e) {
            console.error("Error deleting message:", e);
        }
    }
}

// --- LIVE SUPPORT SESSIONS ---
function loadLiveSupportSessions() {
    const sessionList = document.getElementById('session-list');
    
    // Unsubscribe from previous listener
    if (unsubscribeSessions) {
        unsubscribeSessions();
    }

    // Real-time listener for support sessions
    const q = query(
        collection(db, "support_sessions"),
        where("status", "in", ["waiting", "active"]),
        orderBy("createdAt", "desc")
    );

    unsubscribeSessions = onSnapshot(q, (snapshot) => {
        sessions = {};
        sessionList.innerHTML = '';

        if (snapshot.empty) {
            sessionList.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No active sessions</div>';
            return;
        }

        snapshot.forEach(doc => {
            const session = { id: doc.id, ...doc.data() };
            sessions[doc.id] = session;

            const item = document.createElement('div');
            item.className = 'session-item' + (activeSessionId === doc.id ? ' active' : '');
            item.onclick = () => selectSession(doc.id);

            // Calculate waiting time for unassigned chats
            let waitingIndicator = '';
            if (session.status === 'waiting') {
                const waitTime = session.createdAt ? Math.floor((Date.now() - session.createdAt.toMillis()) / 60000) : 0;
                waitingIndicator = `<span style="color:#f59e0b; font-size:0.75rem; margin-top:0.25rem; display:block;"><i class="fas fa-clock"></i> Waiting ${waitTime}min</span>`;
            }

            // Assigned agent indicator
            let agentIndicator = '';
            if (session.status === 'active' && session.agentName) {
                agentIndicator = `<span style="color:#10b981; font-size:0.75rem; margin-top:0.25rem; display:block;"><i class="fas fa-user-check"></i> ${session.agentName}</span>`;
            }

            item.innerHTML = `
                <div class="session-user">
                    <i class="fas fa-user-circle" style="margin-right:0.5rem; color:var(--primary);"></i>
                    ${session.userName || 'Anonymous'}
                    ${session.priority === 'high' ? '<i class="fas fa-exclamation-circle" style="color:#ef4444; margin-left:0.5rem;" title="High Priority"></i>' : ''}
                </div>
                <div class="session-preview">
                    ${session.category || 'general'} • ${session.userEmail || ''}
                </div>
                ${waitingIndicator}
                ${agentIndicator}
            `;

            sessionList.appendChild(item);
        });
    });
}

function selectSession(sessionId) {
    activeSessionId = sessionId;
    const session = sessions[sessionId];

    // Update UI
    renderSessionList();
    loadSessionMessages(sessionId);
    
    // Enable chat input
    const replyInput = document.getElementById('reply-input');
    const sendBtn = document.getElementById('send-btn');
    if (replyInput) {
        replyInput.disabled = false;
        replyInput.focus();
    }
    if (sendBtn) sendBtn.disabled = false;

    // Assign agent if not assigned
    if (session.status === 'waiting' && currentAgentId) {
        assignSessionToAgent(sessionId);
    }
}

function renderSessionList() {
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const items = document.querySelectorAll('.session-item');
    items.forEach((item, index) => {
        const sessionId = Object.keys(sessions)[index];
        if (sessionId === activeSessionId) {
            item.classList.add('active');
        }
    });
}

async function assignSessionToAgent(sessionId) {
    try {
        await updateDoc(doc(db, "support_sessions", sessionId), {
            agentId: currentAgentId,
            agentName: currentAgentName,
            status: 'active',
            assignedAt: serverTimestamp()
        });

        // Increment agent's current chat count
        await updateDoc(doc(db, "support_agents", currentAgentId), {
            currentChats: increment(1),
            totalChatsHandled: increment(1)
        });

        // Send system message
        await addDoc(collection(db, "support_messages"), {
            sessionId: sessionId,
            sender: 'system',
            senderName: 'Support Bot',
            text: `${currentAgentName} has joined the chat.`,
            timestamp: serverTimestamp(),
            read: false,
            type: 'system'
        });
    } catch (e) {
        console.error("Error assigning session:", e);
    }
}

function loadSessionMessages(sessionId) {
    const session = sessions[sessionId];
    const chatHeader = document.getElementById('chat-header');
    const messagesContainer = document.getElementById('messages-container');

    if (chatHeader) {
        chatHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600; font-size:1rem;">${session.userName || 'Anonymous'}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${session.userEmail}</div>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="resolveSession('${sessionId}')" class="btn-sm" style="background:#10b981; color:white;">
                        <i class="fas fa-check"></i> Resolve
                    </button>
                    <button onclick="window.deleteSession('${sessionId}')" class="btn-sm btn-danger">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // Unsubscribe from previous messages listener
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    // Real-time listener for messages
    const q = query(
        collection(db, "support_messages"),
        where("sessionId", "==", sessionId),
        orderBy("timestamp", "asc")
    );

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            renderChatMessage(msg, messagesContainer, doc.id);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function renderChatMessage(msg, container, msgId) {
    const isUser = msg.sender === 'user';
    const isSupport = msg.sender === 'support';
    const isSystem = msg.sender === 'system';

    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : isSupport ? 'support' : 'system'}`;
    div.style.cssText = isSystem ? 'align-self:center; max-width:90%; text-align:center; font-size:0.85rem; opacity:0.7;' : '';

    const textSpan = document.createElement('span');
    textSpan.textContent = msg.text;
    div.appendChild(textSpan);

    if (isSupport && msgId) {
        const delIcon = document.createElement('i');
        delIcon.className = 'fas fa-times';
        delIcon.style.cssText = 'margin-left:10px; cursor:pointer; opacity:0.6; font-size:0.8em;';
        delIcon.onclick = () => window.deleteSupportMessage(msgId);
        div.appendChild(delIcon);
    }

    container.appendChild(div);
}

window.sendAdminChat = async function() {
    const input = document.getElementById('reply-input');
    const text = input.value.trim();
    
    if (!text || !activeSessionId) return;
    
    input.value = '';
    
    try {
        await addDoc(collection(db, "support_messages"), {
            sessionId: activeSessionId,
            sender: 'support',
            senderName: currentAgentName,
            text: text,
            timestamp: serverTimestamp(),
            read: false,
            type: 'text'
        });

        // Update session last message time
        await updateDoc(doc(db, "support_sessions", activeSessionId), {
            lastMessageAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Error sending message:", e);
        alert("Failed to send message.");
    }
}

window.resolveSession = async function(sessionId) {
    if (confirm("Mark this conversation as resolved?")) {
        try {
            await updateDoc(doc(db, "support_sessions", sessionId), {
                status: 'resolved',
                resolvedAt: serverTimestamp(),
                resolvedBy: currentAgentId
            });

            // Decrement agent's current chat count
            if (currentAgentId) {
                await updateDoc(doc(db, "support_agents", currentAgentId), {
                    currentChats: increment(-1)
                });
            }

            // Send system message
            await addDoc(collection(db, "support_messages"), {
                sessionId: sessionId,
                sender: 'system',
                senderName: 'Support Bot',
                text: 'This conversation has been marked as resolved.',
                timestamp: serverTimestamp(),
                read: false,
                type: 'system'
            });

            // Clear active session
            activeSessionId = null;
            document.getElementById('messages-container').innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Select a conversation</div>';
            document.getElementById('chat-header').innerHTML = 'Select a conversation';
            document.getElementById('reply-input').disabled = true;
            document.getElementById('send-btn').disabled = true;
        } catch (e) {
            console.error("Error resolving session:", e);
            alert("Failed to resolve session.");
        }
    }
}

window.deleteSession = async function(sessionId) {
    if (confirm("Delete this entire conversation? This cannot be undone.")) {
        try {
            // Delete all messages
            const q = query(collection(db, "support_messages"), where("sessionId", "==", sessionId));
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Delete session
            batch.delete(doc(db, "support_sessions", sessionId));
            
            await batch.commit();

            // Update agent count if this was an active session
            const session = sessions[sessionId];
            if (session && session.agentId === currentAgentId && session.status === 'active') {
                await updateDoc(doc(db, "support_agents", currentAgentId), {
                    currentChats: increment(-1)
                });
            }

            activeSessionId = null;
        } catch (e) {
            console.error("Error deleting session:", e);
            alert("Failed to delete session.");
        }
    }
}

window.deleteSupportMessage = async function(msgId) {
    if (confirm("Delete this message?")) {
        try {
            await deleteDoc(doc(db, "support_messages", msgId));
        } catch (e) {
            console.error("Error deleting message:", e);
        }
    }
}

window.handleQuickResponse = function(selectElement) {
    const input = document.getElementById('reply-input');
    if (selectElement.value && input) {
        input.value = selectElement.value;
        input.focus();
        selectElement.value = "";
    }
}

window.handleAutoResponse = async function(selectElement) {
    if (selectElement.value && activeSessionId) {
        document.getElementById('reply-input').value = selectElement.value;
        await window.sendAdminChat();
        selectElement.value = "";
    }
}

// --- SETTINGS ---
async function loadSettings() {
    try {
        const bannerSnap = await getDoc(doc(db, "system_settings", "sponsored_banner"));
        if (bannerSnap.exists()) {
            const data = bannerSnap.data();
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

// Settings form handlers
document.getElementById('banner-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await setDoc(doc(db, "system_settings", "sponsored_banner"), {
            isActive: document.getElementById('banner-active').checked,
            title: document.getElementById('banner-title').value,
            description: document.getElementById('banner-desc').value,
            link: document.getElementById('banner-link').value,
            updatedAt: serverTimestamp()
        });
        alert('Banner settings saved!');
    } catch (e) {
        console.error("Error saving banner settings:", e);
        alert("Failed to save settings.");
    }
});

document.getElementById('file-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await setDoc(doc(db, "system_settings", "file_config"), {
            maxSizeMb: Number(document.getElementById('max-file-size').value) || 100
        });
        alert('File settings saved!');
    } catch (e) {
        console.error("Error saving file settings:", e);
        alert("Failed to save settings.");
    }
});

document.getElementById('ui-config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await setDoc(doc(db, "system_settings", "ui_config"), {
            defaultPage: document.getElementById('default-page-select').value
        });
        alert('UI settings saved!');
    } catch (e) {
        console.error("Error saving UI settings:", e);
        alert("Failed to save settings.");
    }
});