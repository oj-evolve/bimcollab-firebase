// service-center.js - Live Support Chat Module
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    doc, 
    updateDoc, 
    serverTimestamp,
    setDoc,
    getDoc,
    getDocs,
    increment
} from "firebase/firestore";
import { db, auth } from "./firebase-init.js";
import { createModal, showAlert, showToast } from "./ui-utils.js";

let getAppState;
let liveChatSessionId = null;
let unsubscribeLiveChat = null;
let isAgentOnline = false;

export function initServiceCenter(stateGetter) {
    getAppState = stateGetter;
}

export function openServiceCenter() {
    const modalId = 'service-center-modal';
    const { card, close } = createModal(modalId, { maxWidth: '500px', zIndex: '4000' });

    card.innerHTML = `
        <div class="modal-header" style="border-bottom: 2px solid var(--primary);">
            <span class="card-title"><i class="fas fa-headset"></i> Service Center</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body" style="padding: 1.5rem;">
            <p style="color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.6;">
                Get help with your BIM projects, report issues, or connect with our support team.
            </p>
            
            <div style="display: grid; gap: 1rem;">
                <!-- Live Chat Option -->
                <button onclick="startLiveChat()" class="service-option" style="
                    display: flex; align-items: center; gap: 1rem; padding: 1rem; 
                    border: 2px solid var(--border); border-radius: 0.5rem; background: var(--bg-body);
                    cursor: pointer; transition: all 0.2s; text-align: left; width: 100%;
                " onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--bg-card)'" 
                   onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-body)'">
                    <div style="
                        width: 50px; height: 50px; border-radius: 50%; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        display: flex; align-items: center; justify-content: center;
                        flex-shrink: 0;
                    ">
                        <i class="fas fa-comments" style="color: white; font-size: 1.5rem;"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 0.25rem 0; color: var(--text-main); font-size: 1rem;">Live Chat</h4>
                        <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">Connect with support team instantly</p>
                        <span id="agent-status-indicator" style="
                            display: inline-flex; align-items: center; gap: 0.25rem; 
                            margin-top: 0.5rem; font-size: 0.75rem; color: #10b981;
                        ">
                            <i class="fas fa-circle" style="font-size: 0.5rem;"></i> Checking availability...
                        </span>
                    </div>
                </button>

                <!-- Contact Form Option -->
                <button onclick="openContactModal()" class="service-option" style="
                    display: flex; align-items: center; gap: 1rem; padding: 1rem; 
                    border: 2px solid var(--border); border-radius: 0.5rem; background: var(--bg-body);
                    cursor: pointer; transition: all 0.2s; text-align: left; width: 100%;
                " onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--bg-card)'" 
                   onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-body)'">
                    <div style="
                        width: 50px; height: 50px; border-radius: 50%; 
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        display: flex; align-items: center; justify-content: center;
                        flex-shrink: 0;
                    ">
                        <i class="fas fa-envelope" style="color: white; font-size: 1.5rem;"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 0.25rem 0; color: var(--text-main); font-size: 1rem;">Send Message</h4>
                        <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">Leave a message and we'll get back to you</p>
                    </div>
                </button>

                <!-- FAQ / Knowledge Base -->
                <button onclick="openFAQModal()" class="service-option" style="
                    display: flex; align-items: center; gap: 1rem; padding: 1rem; 
                    border: 2px solid var(--border); border-radius: 0.5rem; background: var(--bg-body);
                    cursor: pointer; transition: all 0.2s; text-align: left; width: 100%;
                " onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--bg-card)'" 
                   onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-body)'">
                    <div style="
                        width: 50px; height: 50px; border-radius: 50%; 
                        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                        display: flex; align-items: center; justify-content: center;
                        flex-shrink: 0;
                    ">
                        <i class="fas fa-question-circle" style="color: white; font-size: 1.5rem;"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 0.25rem 0; color: var(--text-main); font-size: 1rem;">Help Center</h4>
                        <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">Browse common questions and guides</p>
                    </div>
                </button>
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    
    // Check agent availability
    checkAgentAvailability();
}

async function checkAgentAvailability() {
    try {
        const agentsSnapshot = await getDocs(query(
            collection(db, "support_agents"),
            where("status", "==", "online"),
            where("currentChats", "<", 5) // Max chats per agent
        ));
        
        const indicator = document.getElementById('agent-status-indicator');
        if (indicator) {
            if (agentsSnapshot.size > 0) {
                indicator.innerHTML = '<i class="fas fa-circle" style="font-size: 0.5rem;"></i> Agents available';
                indicator.style.color = '#10b981';
                isAgentOnline = true;
            } else {
                indicator.innerHTML = '<i class="fas fa-circle" style="font-size: 0.5rem;"></i> Leave a message';
                indicator.style.color = '#f59e0b';
                isAgentOnline = false;
            }
        }
    } catch (e) {
        console.error("Error checking agent availability:", e);
    }
}

export async function startLiveChat() {
    const state = getAppState();
    
    if (!auth.currentUser) {
        showAlert("Please log in to use live chat.", "Authentication Required");
        return;
    }

    // Close service center modal
    const serviceModal = document.getElementById('service-center-modal');
    if (serviceModal) serviceModal.remove();

    // Check if user already has an active session
    try {
        const existingSessionQuery = query(
            collection(db, "support_sessions"),
            where("userId", "==", auth.currentUser.uid),
            where("status", "in", ["waiting", "active"])
        );
        
        const existingSnapshot = await getDocs(existingSessionQuery);
        
        if (!existingSnapshot.empty) {
            // Resume existing session
            liveChatSessionId = existingSnapshot.docs[0].id;
            openLiveChatWindow(liveChatSessionId);
            return;
        }
    } catch (e) {
        console.error("Error checking existing sessions:", e);
    }

    // Create new chat session
    try {
        const sessionData = {
            userId: auth.currentUser.uid,
            userName: state.currentUserName || auth.currentUser.email,
            userEmail: auth.currentUser.email,
            userRole: state.currentRole || 'user',
            projectId: state.currentProjectId || 'default',
            status: 'waiting', // waiting, active, resolved, closed
            priority: 'normal', // high, normal, low
            category: 'general', // general, modeling, clash, billing, technical
            createdAt: serverTimestamp(),
            lastMessageAt: serverTimestamp(),
            agentId: null,
            agentName: null,
            waitingTime: 0,
            responseTime: null,
            satisfaction: null,
            tags: [],
            metadata: {
                userAgent: navigator.userAgent,
                platform: navigator.platform
            }
        };

        const sessionRef = await addDoc(collection(db, "support_sessions"), sessionData);
        liveChatSessionId = sessionRef.id;

        // Send initial automated message
        await addDoc(collection(db, "support_messages"), {
            sessionId: liveChatSessionId,
            sender: 'system',
            senderName: 'Support Bot',
            text: `Hello ${state.currentUserName || 'there'}! 👋 Thanks for reaching out. ${isAgentOnline ? 'An agent will be with you shortly.' : 'Our agents are currently offline. Please leave a message and we\'ll get back to you as soon as possible.'}`,
            timestamp: serverTimestamp(),
            read: false,
            type: 'text'
        });

        // Assign agent if available
        if (isAgentOnline) {
            await assignAgentToSession(liveChatSessionId, sessionData.category);
        }

        openLiveChatWindow(liveChatSessionId);
    } catch (e) {
        console.error("Error starting live chat:", e);
        showAlert("Failed to start chat session. Please try again.", "Error");
    }
}

async function assignAgentToSession(sessionId, category) {
    try {
        // Find best available agent
        const agentsQuery = query(
            collection(db, "support_agents"),
            where("status", "==", "online"),
            where("currentChats", "<", 5),
            orderBy("currentChats", "asc"),
            orderBy("averageResponseTime", "asc")
        );
        
        const agentsSnapshot = await getDocs(agentsQuery);
        
        if (agentsSnapshot.empty) {
            return null;
        }

        // Filter by skills if category matches
        let bestAgent = null;
        for (const agentDoc of agentsSnapshot.docs) {
            const agent = agentDoc.data();
            if (agent.skills && agent.skills.includes(category)) {
                bestAgent = { id: agentDoc.id, ...agent };
                break;
            }
        }

        // If no skilled agent, take first available
        if (!bestAgent && !agentsSnapshot.empty) {
            const firstDoc = agentsSnapshot.docs[0];
            bestAgent = { id: firstDoc.id, ...firstDoc.data() };
        }

        if (bestAgent) {
            // Update session with agent
            await updateDoc(doc(db, "support_sessions", sessionId), {
                agentId: bestAgent.id,
                agentName: bestAgent.name,
                status: 'active',
                assignedAt: serverTimestamp()
            });

            // Increment agent's current chat count
            await updateDoc(doc(db, "support_agents", bestAgent.id), {
                currentChats: increment(1)
            });

            // Send agent joined message
            await addDoc(collection(db, "support_messages"), {
                sessionId: sessionId,
                sender: 'system',
                senderName: 'Support Bot',
                text: `${bestAgent.name} has joined the chat.`,
                timestamp: serverTimestamp(),
                read: false,
                type: 'system'
            });

            return bestAgent.id;
        }

        return null;
    } catch (e) {
        console.error("Error assigning agent:", e);
        return null;
    }
}

function openLiveChatWindow(sessionId) {
    const modalId = 'live-chat-window';
    
    // Remove existing window if any
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const { card, close } = createModal(modalId, { 
        maxWidth: '450px', 
        maxHeight: '600px',
        zIndex: '5000' 
    });

    card.innerHTML = `
        <div class="modal-header" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 0.5rem 0.5rem 0 0;
            padding: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div>
                <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">
                    <i class="fas fa-headset"></i> Live Support
                </div>
                <div id="chat-agent-status" style="font-size: 0.75rem; opacity: 0.9;">
                    <i class="fas fa-circle" style="font-size: 0.5rem;"></i> Connecting...
                </div>
            </div>
            <button id="close-${modalId}" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div id="chat-messages-area" style="
            height: 400px;
            overflow-y: auto;
            padding: 1rem;
            background: #f3f4f6;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        ">
            <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p style="margin-top: 1rem;">Loading conversation...</p>
            </div>
        </div>
        <div style="padding: 1rem; background: white; border-top: 1px solid var(--border);">
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <button onclick="attachFile()" style="
                    padding: 0.5rem;
                    background: var(--bg-body);
                    border: 1px solid var(--border);
                    border-radius: 0.375rem;
                    cursor: pointer;
                    color: var(--text-main);
                " title="Attach file">
                    <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="chat-message-input" placeholder="Type your message..." style="
                    flex: 1;
                    padding: 0.75rem;
                    border: 1px solid var(--border);
                    border-radius: 0.375rem;
                    font-size: 0.9rem;
                " onkeypress="if(event.key==='Enter') sendChatMessage('${sessionId}')">
                <button onclick="sendChatMessage('${sessionId}')" style="
                    padding: 0.75rem 1.5rem;
                    background: var(--primary);
                    border: none;
                    color: white;
                    border-radius: 0.375rem;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button onclick="sendQuickMessage('What are your hours?', '${sessionId}')" style="
                    padding: 0.25rem 0.75rem;
                    background: var(--bg-body);
                    border: 1px solid var(--border);
                    border-radius: 1rem;
                    font-size: 0.75rem;
                    cursor: pointer;
                    color: var(--text-main);
                ">Hours?</button>
                <button onclick="sendQuickMessage('I need help with modeling', '${sessionId}')" style="
                    padding: 0.25rem 0.75rem;
                    background: var(--bg-body);
                    border: 1px solid var(--border);
                    border-radius: 1rem;
                    font-size: 0.75rem;
                    cursor: pointer;
                    color: var(--text-main);
                ">Help with modeling</button>
                <button onclick="sendQuickMessage('Billing question', '${sessionId}')" style="
                    padding: 0.25rem 0.75rem;
                    background: var(--bg-body);
                    border: 1px solid var(--border);
                    border-radius: 1rem;
                    font-size: 0.75rem;
                    cursor: pointer;
                    color: var(--text-main);
                ">Billing</button>
            </div>
        </div>
        <div id="typing-indicator" style="
            display: none;
            padding: 0.5rem 1rem;
            background: white;
            border-top: 1px solid var(--border);
            font-size: 0.85rem;
            color: var(--text-muted);
        ">
            <i class="fas fa-circle" style="font-size: 0.5rem; animation: pulse 1.5s infinite;"></i>
            <i class="fas fa-circle" style="font-size: 0.5rem; animation: pulse 1.5s infinite 0.3s;"></i>
            <i class="fas fa-circle" style="font-size: 0.5rem; animation: pulse 1.5s infinite 0.6s;"></i>
            Agent is typing...
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = () => {
        if (unsubscribeLiveChat) {
            unsubscribeLiveChat();
            unsubscribeLiveChat = null;
        }
        close();
    };

    // Load messages in real-time
    loadLiveChatMessages(sessionId);
}

function loadLiveChatMessages(sessionId) {
    const messagesArea = document.getElementById('chat-messages-area');
    
    // Unsubscribe from previous listener if exists
    if (unsubscribeLiveChat) {
        unsubscribeLiveChat();
    }

    // Listen to messages in real-time
    const messagesQuery = query(
        collection(db, "support_messages"),
        where("sessionId", "==", sessionId),
        orderBy("timestamp", "asc")
    );

    unsubscribeLiveChat = onSnapshot(messagesQuery, (snapshot) => {
        messagesArea.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const msg = doc.data();
            renderChatMessage(msg, messagesArea);
        });

        // Scroll to bottom
        messagesArea.scrollTop = messagesArea.scrollHeight;

        // Mark messages as read
        snapshot.forEach(async (doc) => {
            const msg = doc.data();
            if (msg.sender === 'support' && !msg.read) {
                await updateDoc(doc.ref, { read: true });
            }
        });
    });

    // Also listen to session status
    onSnapshot(doc(db, "support_sessions", sessionId), (docSnap) => {
        if (docSnap.exists()) {
            const session = docSnap.data();
            const statusEl = document.getElementById('chat-agent-status');
            
            if (statusEl) {
                if (session.status === 'active' && session.agentName) {
                    statusEl.innerHTML = `<i class="fas fa-circle" style="font-size: 0.5rem; color: #10b981;"></i> Connected with ${session.agentName}`;
                } else if (session.status === 'waiting') {
                    statusEl.innerHTML = `<i class="fas fa-circle" style="font-size: 0.5rem; color: #f59e0b;"></i> Waiting for agent...`;
                } else if (session.status === 'resolved') {
                    statusEl.innerHTML = `<i class="fas fa-circle" style="font-size: 0.5rem; color: #6b7280;"></i> Chat ended`;
                }
            }
        }
    });
}

function renderChatMessage(msg, container) {
    const isUser = msg.sender === 'user';
    const isSystem = msg.sender === 'system';
    
    const bubble = document.createElement('div');
    bubble.style.cssText = `
        max-width: 75%;
        padding: 0.75rem 1rem;
        border-radius: 1rem;
        font-size: 0.9rem;
        line-height: 1.4;
        word-wrap: break-word;
        ${isUser ? 'align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 0.25rem;' : 
          isSystem ? 'align-self: center; background: #e5e7eb; color: #6b7280; font-size: 0.8rem; text-align: center; max-width: 90%;' :
          'align-self: flex-start; background: white; border: 1px solid var(--border); border-bottom-left-radius: 0.25rem; color: var(--text-main);'}
    `;
    
    if (!isSystem && msg.senderName) {
        const nameTag = document.createElement('div');
        nameTag.textContent = msg.senderName;
        nameTag.style.cssText = `
            font-size: 0.75rem;
            opacity: 0.8;
            margin-bottom: 0.25rem;
            font-weight: 600;
        `;
        bubble.appendChild(nameTag);
    }
    
    const textNode = document.createElement('div');
    textNode.textContent = msg.text;
    bubble.appendChild(textNode);
    
    if (msg.timestamp && !isSystem) {
        const time = msg.timestamp.toDate();
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const timeTag = document.createElement('div');
        timeTag.textContent = timeStr;
        timeTag.style.cssText = `
            font-size: 0.7rem;
            opacity: 0.6;
            margin-top: 0.25rem;
            text-align: right;
        `;
        bubble.appendChild(timeTag);
    }
    
    container.appendChild(bubble);
}

window.sendChatMessage = async function(sessionId) {
    const input = document.getElementById('chat-message-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    input.value = '';
    
    try {
        const state = getAppState();
        
        await addDoc(collection(db, "support_messages"), {
            sessionId: sessionId,
            sender: 'user',
            senderName: state.currentUserName || 'User',
            text: text,
            timestamp: serverTimestamp(),
            read: false,
            type: 'text'
        });

        // Update session last message time
        await updateDoc(doc(db, "support_sessions", sessionId), {
            lastMessageAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Error sending message:", e);
        showAlert("Failed to send message", "Error");
    }
}

window.sendQuickMessage = function(text, sessionId) {
    const input = document.getElementById('chat-message-input');
    input.value = text;
    window.sendChatMessage(sessionId);
}

window.attachFile = function() {
    showToast("File upload feature coming soon!");
}

export function openContactModal() {
    const state = getAppState();
    const modalId = 'contact-modal';
    const { card, close } = createModal(modalId, { maxWidth: '500px', zIndex: '4000' });

    card.classList.add('contact-modal');
    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-envelope"></i> Send Us a Message</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body" style="padding: 1.5rem;">
            <form id="contact-form" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="contact-form-group">
                    <label for="contact-name">Your Name *</label>
                    <input type="text" id="contact-name" value="${state.currentUserName || ''}" required placeholder="Enter your name">
                </div>
                
                <div class="contact-form-group">
                    <label for="contact-email">Email Address *</label>
                    <input type="email" id="contact-email" value="${auth.currentUser ? auth.currentUser.email : ''}" required placeholder="your@email.com">
                </div>
                
                <div class="contact-form-group">
                    <label for="contact-category">Category *</label>
                    <select id="contact-category" required style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-body); color: var(--text-main);">
                        <option value="">Select a category</option>
                        <option value="general">General Inquiry</option>
                        <option value="technical">Technical Support</option>
                        <option value="billing">Billing Question</option>
                        <option value="feature">Feature Request</option>
                        <option value="bug">Bug Report</option>
                    </select>
                </div>
                
                <div class="contact-form-group">
                    <label for="contact-subject">Subject *</label>
                    <input type="text" id="contact-subject" required placeholder="Brief description of your issue">
                </div>
                
                <div class="contact-form-group">
                    <label for="contact-message">Message *</label>
                    <textarea id="contact-message" required rows="5" placeholder="Please provide details about your question or issue..." style="resize: vertical;"></textarea>
                </div>
                
                <div class="contact-form-group">
                    <label for="contact-project-id">Project ID (Optional)</label>
                    <input type="text" id="contact-project-id" value="${state.currentProjectId || ''}" placeholder="Your project ID if relevant">
                </div>
                
                <button type="submit" style="
                    padding: 0.75rem 1.5rem;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 0.375rem;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 1rem;
                ">
                    <i class="fas fa-paper-plane"></i> Send Message
                </button>
            </form>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    document.getElementById('contact-form').addEventListener('submit', (e) => submitContactForm(e, close));
}

export async function submitContactForm(e, closeModal) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;

    try {
        const formData = {
            name: document.getElementById('contact-name').value,
            email: document.getElementById('contact-email').value,
            category: document.getElementById('contact-category').value,
            subject: document.getElementById('contact-subject').value,
            message: document.getElementById('contact-message').value,
            projectId: document.getElementById('contact-project-id').value || null,
            userId: auth.currentUser ? auth.currentUser.uid : null,
            status: 'new', // new, in-progress, resolved
            replied: false,
            createdAt: serverTimestamp(),
            metadata: {
                userAgent: navigator.userAgent,
                referrer: document.referrer
            }
        };

        await addDoc(collection(db, "contact_submissions"), formData);
        
        showToast("Message sent successfully! We'll get back to you soon.", "success");
        closeModal();
    } catch (error) {
        console.error("Error submitting contact form:", error);
        showAlert("Failed to send message. Please try again.", "Error");
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

window.openFAQModal = function() {
    const modalId = 'faq-modal';
    const { card, close } = createModal(modalId, { maxWidth: '600px', zIndex: '4000' });

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-question-circle"></i> Help Center</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body" style="padding: 1.5rem; max-height: 500px; overflow-y: auto;">
            <div style="margin-bottom: 1.5rem;">
                <input type="text" id="faq-search" placeholder="Search help articles..." style="
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid var(--border);
                    border-radius: 0.375rem;
                    font-size: 0.9rem;
                " oninput="filterFAQs(this.value)">
            </div>
            
            <div id="faq-list">
                ${generateFAQItems()}
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
}

function generateFAQItems() {
    const faqs = [
        {
            question: "How do I upload BIM files?",
            answer: "Navigate to the stage you want to upload to, then click the 'Upload File' button. Supported formats include .rvt, .ifc, .dwg, and .pdf files up to 100MB."
        },
        {
            question: "What file formats are supported?",
            answer: "We support Revit (.rvt), IFC (.ifc), AutoCAD (.dwg), PDF (.pdf), and common image formats (.jpg, .png). Maximum file size is 100MB per upload."
        },
        {
            question: "How do I invite team members?",
            answer: "Project owners can share the Project ID with team members. They can then join by entering the Project ID when creating a new account or switching projects."
        },
        {
            question: "Can I delete a project?",
            answer: "Yes, project owners can delete projects from the Settings menu. This action is permanent and will remove all files and chat history."
        },
        {
            question: "How does real-time collaboration work?",
            answer: "All team members connected to the same project can see updates in real-time. Messages, file uploads, and status changes sync automatically across all devices."
        },
        {
            question: "What are the different project stages?",
            answer: "Projects are organized into 7 stages: Briefing, Design Development, Structural Planning, Cost Estimation, Final Drawing, Construction Phase, and Completion."
        },
        {
            question: "How do I switch between Main and Private channels?",
            answer: "Use the toggle switch at the top of your dashboard. Main Stream is for general team communication, while Private Channel is for sensitive or executive discussions."
        },
        {
            question: "What's the difference between free and premium plans?",
            answer: "Free plans include basic collaboration features. Premium plans offer unlimited storage, advanced analytics, priority support, and custom branding options."
        }
    ];

    return faqs.map((faq, index) => `
        <div class="faq-item" style="
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            margin-bottom: 0.75rem;
            overflow: hidden;
        ">
            <div onclick="toggleFAQ(${index})" style="
                padding: 1rem;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-body);
                transition: background 0.2s;
            " onmouseover="this.style.background='var(--border)'" 
               onmouseout="this.style.background='var(--bg-body)'">
                <span style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">${faq.question}</span>
                <i class="fas fa-chevron-down faq-icon-${index}" style="color: var(--text-muted); transition: transform 0.3s;"></i>
            </div>
            <div id="faq-answer-${index}" style="
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease-out;
                background: white;
            ">
                <div style="padding: 1rem; color: var(--text-muted); line-height: 1.6; font-size: 0.9rem;">
                    ${faq.answer}
                </div>
            </div>
        </div>
    `).join('');
}

window.toggleFAQ = function(index) {
    const answer = document.getElementById(`faq-answer-${index}`);
    const icon = document.querySelector(`.faq-icon-${index}`);
    
    if (answer.style.maxHeight && answer.style.maxHeight !== '0px') {
        answer.style.maxHeight = '0px';
        icon.style.transform = 'rotate(0deg)';
    } else {
        answer.style.maxHeight = answer.scrollHeight + 'px';
        icon.style.transform = 'rotate(180deg)';
    }
}

window.filterFAQs = function(searchTerm) {
    const items = document.querySelectorAll('.faq-item');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}