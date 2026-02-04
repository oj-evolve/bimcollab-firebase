import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "./firebase-init.js";
import { createModal, showAlert } from "./ui-utils.js";

let getState = () => ({
    currentRole: null,
    currentProjectId: null,
    currentUserName: null,
    roleProfiles: {}
});

export function initServiceCenter(stateGetter) {
    getState = stateGetter;
}

export function openServiceCenter() {
    const modalId = 'service-center-modal';
    const { card, close } = createModal(modalId, { maxWidth: '700px' });

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title"><i class="fas fa-headset" style="margin-right:8px; color:var(--primary)"></i>Service Center</span><i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    
    body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <!-- Customer Care -->
            <div style="border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; background: var(--bg-body);">
                <h4 style="margin: 0 0 0.75rem 0; color: var(--primary); font-size: 0.9rem;"><i class="fas fa-life-ring"></i> Customer Care</h4>
                <ul style="list-style: none; padding: 0; font-size: 0.85rem;">
                    <li style="margin-bottom: 0.5rem;"><a href="#" onclick="openContactModal('support'); return false;" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-envelope" style="color: var(--text-muted);"></i> Contact Support</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="#" onclick="openContactModal('bug'); return false;" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-bug" style="color: var(--text-muted);"></i> Report a Bug</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="#" onclick="startLiveChat(); return false;" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-comments" style="color: var(--text-muted);"></i> Live Chat</a></li>
                </ul>
            </div>

            <!-- Knowledge Base -->
            <div style="border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; background: var(--bg-body);">
                <h4 style="margin: 0 0 0.75rem 0; color: var(--primary); font-size: 0.9rem;"><i class="fas fa-book"></i> Knowledge Base</h4>
                <ul style="list-style: none; padding: 0; font-size: 0.85rem;">
                    <li style="margin-bottom: 0.5rem;"><a href="#" onclick="openResourcesModal(); return false;" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-tools" style="color: var(--text-muted);"></i> Resources & Tools</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="faq.html" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-question-circle" style="color: var(--text-muted);"></i> FAQ</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="README.md" target="_blank" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-file-alt" style="color: var(--text-muted);"></i> Documentation</a></li>
                </ul>
            </div>

            <!-- Legal -->
            <div style="border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; background: var(--bg-body);">
                <h4 style="margin: 0 0 0.75rem 0; color: var(--primary); font-size: 0.9rem;"><i class="fas fa-balance-scale"></i> Legal</h4>
                <ul style="list-style: none; padding: 0; font-size: 0.85rem;">
                    <li style="margin-bottom: 0.5rem;"><a href="terms.html" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-gavel" style="color: var(--text-muted);"></i> Terms of Service</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="privacy.html" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-user-secret" style="color: var(--text-muted);"></i> Privacy Policy</a></li>
                    <li style="margin-bottom: 0.5rem;"><a href="disclaimer.html" target="_blank" style="text-decoration: none; color: var(--text-main); display: flex; align-items: center; gap: 8px;"><i class="fas fa-exclamation-circle" style="color: var(--text-muted);"></i> Disclaimer</a></li>
                </ul>
            </div>
        </div>
    `;

    card.appendChild(header);
    card.appendChild(body);
    document.getElementById(`close-${modalId}`).onclick = close;
}

export function openContactModal(type = 'support') {
    const scModal = document.getElementById('service-center-modal');
    if (scModal) scModal.remove();

    const modalId = 'contact-modal';
    const { card, close } = createModal(modalId, { maxWidth: '500px', zIndex: '3000' });

    const title = type === 'bug' ? 'Report a Bug' : 'Contact Support';
    const icon = type === 'bug' ? 'fa-bug' : 'fa-envelope';

    const { currentRole, roleProfiles } = getState();
    const userName = (currentRole && roleProfiles[currentRole]) ? roleProfiles[currentRole].name : '';
    const userEmail = auth.currentUser ? auth.currentUser.email : '';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas ${icon}" style="color:var(--primary); margin-right:8px;"></i>${title}</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <div style="margin-bottom:1rem;">
                <label style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:0.25rem;">Name</label>
                <input type="text" id="contact-name" value="${userName}" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:0.3rem; background:var(--bg-body); color:var(--text-main);">
            </div>
            <div style="margin-bottom:1rem;">
                <label style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:0.25rem;">Email</label>
                <input type="email" id="contact-email" value="${userEmail}" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:0.3rem; background:var(--bg-body); color:var(--text-main);">
            </div>
            <div style="margin-bottom:1rem;">
                <label style="display:block; font-size:0.85rem; color:var(--text-muted); margin-bottom:0.25rem;">Message</label>
                <textarea id="contact-message" style="width:100%; padding:0.6rem; border:1px solid var(--border); border-radius:0.3rem; background:var(--bg-body); color:var(--text-main); min-height:100px; resize:vertical; font-family:inherit;"></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button id="cancel-${modalId}" style="padding:0.6rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.3rem; cursor:pointer; color:var(--text-main);">Cancel</button>
                <button onclick="submitContactForm('${type}')" style="padding:0.6rem 1.2rem; border:none; background:var(--primary); color:white; border-radius:0.3rem; cursor:pointer; font-weight:600;">Send Message</button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById(`cancel-${modalId}`).onclick = close;
}

export async function submitContactForm(type) {
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    
    if (!name || !email || !message) {
        showAlert("Please fill in all fields.");
        return;
    }

    const modal = document.getElementById('contact-modal');
    const btn = modal.querySelector('button[onclick^="submitContactForm"]');
    if(btn) {
        btn.textContent = 'Sending...';
        btn.disabled = true;
    }

    const { currentRole, currentProjectId } = getState();

    try {
        await addDoc(collection(db, "contact_messages"), {
            type: type,
            name: name,
            email: email,
            message: message,
            userRole: currentRole || 'guest',
            projectId: currentProjectId,
            timestamp: serverTimestamp()
        });
        
        showAlert("Message sent successfully! We will get back to you soon.", "Success");
        if(modal) modal.remove();
    } catch (e) {
        console.error("Error sending message:", e);
        showAlert("Failed to send message. Please try again later.", "Error");
        if(btn) {
            btn.textContent = 'Send Message';
            btn.disabled = false;
        }
    }
}

export function startLiveChat() {
    const scModal = document.getElementById('service-center-modal');
    if (scModal) scModal.remove();

    const widgetId = 'live-chat-widget';
    if (document.getElementById(widgetId)) return;

    const widget = document.createElement('div');
    widget.id = widgetId;
    widget.style.cssText = 'position: fixed; bottom: 20px; right: 20px; width: 300px; height: 400px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 3000; display: flex; flex-direction: column; overflow: hidden; animation: fadeIn 0.3s ease-out;';
    
    const headerId = 'live-chat-header';

    widget.innerHTML = `
        <div id="${headerId}" style="background: var(--primary); color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.9rem; cursor: move; user-select: none;">
            <span><i class="fas fa-headset" style="margin-right: 8px;"></i>Support Chat</span>
            <i class="fas fa-times" id="live-chat-close-btn" style="cursor: pointer;"></i>
        </div>
        <div id="live-chat-messages" style="flex: 1; padding: 15px; overflow-y: auto; background: var(--bg-body); display: flex; flex-direction: column; gap: 10px;">
            <div style="background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px; align-self: flex-start; max-width: 85%; font-size: 0.85rem; color: var(--text-main);">
                Hello! How can we help you today?
            </div>
        </div>
        <div style="padding: 10px; border-top: 1px solid var(--border); background: var(--bg-card); display: flex; gap: 5px;">
            <input id="live-chat-input" type="text" placeholder="Type a message..." style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.85rem; outline: none;">
            <button id="live-chat-send-btn" style="background: var(--primary); color: white; border: none; width: 32px; height: 32px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="fas fa-paper-plane" style="font-size: 0.8rem;"></i></button>
        </div>
    `;
    
    document.body.appendChild(widget);

    // Generate or retrieve a session ID for this chat
    let sessionId = sessionStorage.getItem('bim_support_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('bim_support_session_id', sessionId);
    }

    const sendBtn = document.getElementById('live-chat-send-btn');
    const input = document.getElementById('live-chat-input');
    const messagesContainer = document.getElementById('live-chat-messages');
    const closeBtn = document.getElementById('live-chat-close-btn');

    // Listen for messages in this session
    const q = query(collection(db, "support_messages"), where("sessionId", "==", sessionId));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        // Always re-create the welcome message to ensure it exists and is first
        const welcomeDiv = document.createElement('div');
        welcomeDiv.style.cssText = 'background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px; align-self: flex-start; max-width: 85%; font-size: 0.85rem; color: var(--text-main);';
        welcomeDiv.textContent = "Hello! How can we help you today?";
        messagesContainer.appendChild(welcomeDiv);

        const messages = snapshot.docs.map(doc => doc.data());
        // Sort messages by timestamp (handling pending writes which may have null timestamp)
        messages.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.seconds || 0) : Date.now() / 1000;
            const tB = b.timestamp ? (b.timestamp.seconds || 0) : Date.now() / 1000;
            return tA - tB;
        });

        messages.forEach(data => {
            const msgDiv = document.createElement('div');
            const isUser = data.sender === 'user';
            msgDiv.style.cssText = isUser 
                ? 'background: var(--primary); color: white; padding: 8px 12px; border-radius: 8px; align-self: flex-end; max-width: 85%; font-size: 0.85rem;'
                : 'background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px; align-self: flex-start; max-width: 85%; font-size: 0.85rem; color: var(--text-main);';
            msgDiv.textContent = data.text;
            messagesContainer.appendChild(msgDiv);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, (error) => {
        console.error("Live chat error:", error);
        if (error.code === 'permission-denied') {
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'color: #ef4444; font-size: 0.8rem; text-align: center; padding: 1rem;';
            errDiv.textContent = "Chat unavailable due to permissions.";
            messagesContainer.appendChild(errDiv);
        }
    });

    const sendMessage = async () => {
        const text = input.value.trim();
        if (text === '') return;

        input.value = '';
        input.focus();

        const { currentRole, currentUserName, currentProjectId } = getState();

        try {
            await addDoc(collection(db, "support_messages"), {
                sessionId: sessionId,
                text: text,
                sender: 'user',
                userRole: currentRole || 'guest',
                userName: currentUserName || 'Guest',
                projectId: currentProjectId,
                timestamp: serverTimestamp(),
                read: false
            });
        } catch (err) {
            console.error("Error sending support message:", err);
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'color: #ef4444; font-size: 0.75rem; text-align: right; margin-right: 10px;';
            errDiv.textContent = "Failed to send";
            messagesContainer.appendChild(errDiv);
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    closeBtn.onclick = () => {
        if (unsubscribeChat) unsubscribeChat();
        widget.remove();
    };

    // Make Draggable
    const header = document.getElementById(headerId);
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.onmousedown = function(e) {
        if (e.target.classList.contains('fa-times')) return; // Ignore close button
        e.preventDefault();
        
        const rect = widget.getBoundingClientRect();
        
        // Switch to top/left positioning for dragging
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.left = rect.left + 'px';
        widget.style.top = rect.top + 'px';
        
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        
        isDragging = true;
        
        document.onmousemove = function(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            widget.style.left = (startLeft + dx) + 'px';
            widget.style.top = (startTop + dy) + 'px';
        };
        
        document.onmouseup = function() {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

// Expose functions to window for HTML event handlers
window.openServiceCenter = openServiceCenter;
window.openContactModal = openContactModal;
window.submitContactForm = submitContactForm;
window.startLiveChat = startLiveChat;