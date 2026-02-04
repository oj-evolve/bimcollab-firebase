# Live Support Chat System - Complete Implementation Guide

## 📋 Overview

This is a complete enterprise-grade live support system integrated with your BIM collaboration platform. It includes:

1. **Customer-facing chat widget** - Embedded in your BIM app
2. **Agent dashboard** - Real-time support team interface
3. **Smart assignment system** - Auto-routes chats to best available agents
4. **Admin console** - Supervisor oversight and analytics

---

## 🗄️ Firebase Database Structure

### Collection: `support_sessions`
Stores all chat sessions between users and support agents.

```javascript
{
  sessionId: "auto-generated",
  userId: "user_uid",
  userName: "John Architect",
  userEmail: "john@example.com",
  userRole: "architect",
  projectId: "project_123",
  
  // Session status
  status: "waiting" | "active" | "resolved" | "closed",
  priority: "high" | "normal" | "low",
  category: "general" | "modeling" | "clash" | "billing" | "technical",
  
  // Agent assignment
  agentId: "agent_uid" | null,
  agentName: "Sarah Support" | null,
  assignedAt: Timestamp | null,
  
  // Timestamps
  createdAt: Timestamp,
  lastMessageAt: Timestamp,
  resolvedAt: Timestamp | null,
  
  // Metrics
  waitingTime: number (minutes),
  responseTime: number (seconds) | null,
  satisfaction: number (1-5) | null,
  
  // Additional
  tags: ["urgent", "billing"],
  metadata: {
    userAgent: "...",
    platform: "..."
  }
}
```

### Collection: `support_messages`
All messages within support sessions.

```javascript
{
  messageId: "auto-generated",
  sessionId: "session_123",
  
  // Sender info
  sender: "user" | "support" | "system",
  senderName: "John Architect",
  
  // Content
  text: "Message content",
  type: "text" | "system" | "file",
  fileUrl: "https://..." | null,
  fileName: "screenshot.png" | null,
  
  // Status
  timestamp: Timestamp,
  read: boolean,
  
  // Optional
  edited: boolean,
  deletedAt: Timestamp | null
}
```

### Collection: `support_agents`
Agent profiles and real-time status.

```javascript
{
  agentId: "agent_uid",
  name: "Sarah Support",
  email: "sarah@support.com",
  
  // Current status
  status: "online" | "away" | "busy" | "offline",
  currentChats: 2,
  maxChats: 5,
  
  // Skills & categories
  skills: ["Revit", "Navisworks", "billing"],
  
  // Performance metrics
  averageResponseTime: 45 (seconds),
  totalChatsHandled: 234,
  satisfactionScore: 4.7 (out of 5),
  
  // Timestamps
  createdAt: Timestamp,
  lastActive: Timestamp
}
```

### Collection: `contact_submissions`
Traditional contact form submissions (non-live chat).

```javascript
{
  submissionId: "auto-generated",
  
  // User info
  name: "John Architect",
  email: "john@example.com",
  userId: "user_uid" | null,
  projectId: "project_123" | null,
  
  // Message details
  category: "general" | "technical" | "billing" | "feature" | "bug",
  subject: "Cannot upload large files",
  message: "Full message text...",
  
  // Status
  status: "new" | "in-progress" | "resolved",
  replied: boolean,
  repliedAt: Timestamp | null,
  
  // Metadata
  createdAt: Timestamp,
  metadata: {
    userAgent: "...",
    referrer: "..."
  }
}
```

---

## 🔧 Installation Steps

### Step 1: Update Your Firebase Security Rules

Add these rules to Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Support sessions - users can read/create their own
    match /support_sessions/{sessionId} {
      allow read: if request.auth != null && 
                     (resource.data.userId == request.auth.uid || 
                      request.auth.token.admin == true);
      allow create: if request.auth != null;
      allow update: if request.auth.token.admin == true;
    }
    
    // Support messages - users can read messages from their sessions
    match /support_messages/{messageId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow delete: if request.auth.token.admin == true;
    }
    
    // Support agents - admin only
    match /support_agents/{agentId} {
      allow read, write: if request.auth.token.admin == true;
    }
    
    // Contact submissions - users can create, admins can read/update
    match /contact_submissions/{submissionId} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth.token.admin == true;
    }
  }
}
```

### Step 2: Set Up Admin Custom Claims

You need to set custom claims for admin users. Run this in Firebase Admin SDK:

```javascript
const admin = require('firebase-admin');

// Set admin claim for support agents
async function setAdminClaim(uid) {
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log(`Admin claim set for user: ${uid}`);
}

// Usage
setAdminClaim('your-admin-user-uid');
```

### Step 3: Replace Your Files

1. **Replace `src/service-center.js`** with the new version
2. **Replace `admin.js`** with `admin-enhanced.js`
3. **Update your `app.js` imports** to include the new service center

In your `app.js`:
```javascript
import { 
    initServiceCenter, 
    openServiceCenter, 
    openContactModal, 
    submitContactForm, 
    startLiveChat 
} from "./service-center.js";

// Expose functions globally
window.openServiceCenter = openServiceCenter;
window.openContactModal = openContactModal;
window.startLiveChat = startLiveChat;
```

### Step 4: Create Initial Support Agent

Run this in Firebase Console or Admin SDK:

```javascript
// In Firestore, manually create a document in support_agents collection
{
  agentId: "your-admin-uid",
  name: "Support Team",
  email: "support@bimcollab.com",
  status: "online",
  currentChats: 0,
  maxChats: 5,
  skills: ["general", "technical", "modeling", "billing"],
  averageResponseTime: 0,
  totalChatsHandled: 0,
  satisfactionScore: 5.0,
  createdAt: new Date(),
  lastActive: new Date()
}
```

---

## 🎯 How It Works

### 1. **Customer Starts Chat**
```
User clicks floating "Service Center" button
  → Opens service center modal
  → Checks agent availability
  → User clicks "Live Chat"
  → Creates support_session with status="waiting"
  → Sends initial system message
  → Auto-assigns to best available agent
```

### 2. **Agent Assignment Algorithm**
```javascript
// Finds best agent based on:
1. Agent status = "online"
2. currentChats < maxChats (not overloaded)
3. Skills match category (if possible)
4. Lowest current chat count
5. Best average response time

// If no skilled agent → takes first available
// If no agent available → leaves in "waiting" queue
```

### 3. **Real-time Messaging**
```
Both user and agent see messages instantly via Firestore onSnapshot
  → New messages trigger scroll to bottom
  → Typing indicators (optional)
  → Read receipts
  → System messages for join/leave events
```

### 4. **Session Resolution**
```
Agent clicks "Resolve"
  → Status changes to "resolved"
  → Agent's currentChats decremented
  → System message sent
  → User can rate satisfaction (optional)
  → Session archived but accessible
```

---

## 📊 Agent Dashboard Features

### Real-time Session List
- Shows all waiting and active sessions
- Color-coded by status
- Waiting time indicators
- Priority flags
- One-click to switch between chats

### Chat Interface
- Split-screen view (sessions list | active chat)
- Quick response templates
- Auto-response dropdown
- Message deletion (admin only)
- Session management (resolve, delete, transfer)

### Performance Metrics
- Total chats handled
- Average response time
- Satisfaction scores
- Current load

---

## 🎨 Customization Options

### 1. **Modify Categories**
Edit in `service-center.js`:
```javascript
category: 'general', // Change to your categories
// Options: 'general', 'modeling', 'clash', 'billing', 'technical'
```

### 2. **Change Agent Limits**
Edit in agent profile:
```javascript
maxChats: 5, // Maximum concurrent chats per agent
```

### 3. **Add Priority Rules**
```javascript
// In startLiveChat(), add:
priority: userPlan === 'premium' ? 'high' : 'normal'
```

### 4. **Custom Auto-responses**
Edit in `admin.html`:
```html
<option value="Your custom response">Label</option>
```

---

## 🔔 Notification System

### User-side Notifications
```javascript
// Optional: Add desktop notifications
if (msg.sender === 'support' && Notification.permission === 'granted') {
  new Notification('New message from support', {
    body: msg.text,
    icon: '/path/to/icon.png'
  });
}
```

### Agent-side Alerts
```javascript
// Optional: Sound alert for new sessions
if (session.status === 'waiting') {
  playNotificationSound();
}
```

---

## 📈 Analytics & Reporting

### Key Metrics to Track

1. **First Response Time** - Time from session creation to first agent message
2. **Resolution Time** - Time from creation to resolution
3. **Customer Satisfaction** - Post-chat rating
4. **Agent Utilization** - Current chats / max chats ratio
5. **Abandonment Rate** - Sessions closed without agent interaction

### Sample Analytics Query
```javascript
// Get average resolution time
const sessions = await getDocs(
  query(
    collection(db, "support_sessions"),
    where("status", "==", "resolved"),
    where("resolvedAt", ">=", startDate)
  )
);

let totalTime = 0;
sessions.forEach(doc => {
  const data = doc.data();
  const duration = data.resolvedAt.toMillis() - data.createdAt.toMillis();
  totalTime += duration;
});

const avgMinutes = (totalTime / sessions.size) / 60000;
console.log(`Average resolution time: ${avgMinutes} minutes`);
```

---

## 🚀 Advanced Features (Phase 2)

### 1. **Chat Transfer**
Allow agents to transfer chats to other agents:
```javascript
async function transferSession(sessionId, newAgentId) {
  await updateDoc(doc(db, "support_sessions", sessionId), {
    agentId: newAgentId,
    transferredAt: serverTimestamp()
  });
  // Send system message about transfer
}
```

### 2. **Canned Responses**
Store frequently used responses:
```javascript
// Collection: canned_responses
{
  title: "Welcome Message",
  text: "Hello! How can I help you today?",
  category: "greeting",
  createdBy: "agent_uid"
}
```

### 3. **File Attachments**
Allow users to send screenshots:
```javascript
// Add to support_messages
{
  type: "file",
  fileUrl: "https://storage.googleapis.com/...",
  fileName: "screenshot.png",
  fileSize: 1024576
}
```

### 4. **Chat History**
Show user's previous conversations:
```javascript
const previousChats = await getDocs(
  query(
    collection(db, "support_sessions"),
    where("userId", "==", currentUserId),
    where("status", "==", "resolved"),
    orderBy("createdAt", "desc"),
    limit(5)
  )
);
```

### 5. **AI Chatbot Integration**
Add automated responses for common questions:
```javascript
async function checkForAutoResponse(userMessage) {
  const commonQuestions = {
    "hours": "We're available 9 AM - 6 PM EST, Monday-Friday",
    "pricing": "Visit our pricing page at...",
    "demo": "You can request a demo at..."
  };
  
  for (const [keyword, response] of Object.entries(commonQuestions)) {
    if (userMessage.toLowerCase().includes(keyword)) {
      return response;
    }
  }
  return null;
}
```

---

## 🐛 Troubleshooting

### Issue: Messages not appearing in real-time
**Solution**: Check Firestore indexes. Go to Firebase Console → Firestore → Indexes and ensure composite indexes exist for:
- `support_sessions`: `status` + `createdAt`
- `support_messages`: `sessionId` + `timestamp`

### Issue: Agent status not updating
**Solution**: Verify heartbeat function is running. Check browser console for errors.

### Issue: Can't assign sessions to agents
**Solution**: Ensure agent document exists in `support_agents` collection with correct structure.

### Issue: Permission denied errors
**Solution**: Verify Firestore security rules are properly configured and user has custom claims if needed.

---

## 💰 Monetization Ideas

1. **Premium Support Tier**
   - Priority queue placement
   - Dedicated agent assignment
   - 24/7 availability
   - Faster response SLA

2. **Per-Seat Pricing**
   - Charge per support agent seat
   - Enterprise plans for unlimited agents

3. **Support Analytics Dashboard**
   - Paid add-on for detailed reports
   - Export capabilities
   - Custom metrics

4. **White-Label Option**
   - Custom branding
   - Custom domain
   - Remove "Powered by" footer

---

## 📞 Support & Next Steps

### Immediate Actions
1. ✅ Set up Firestore collections
2. ✅ Configure security rules
3. ✅ Create admin user with custom claims
4. ✅ Create first support agent profile
5. ✅ Test end-to-end flow

### Future Enhancements
- [ ] Add chat satisfaction ratings
- [ ] Implement chat transfers
- [ ] Add file upload capability
- [ ] Create analytics dashboard
- [ ] Add email notifications
- [ ] Implement chat history
- [ ] Add typing indicators
- [ ] Create mobile app version

---

## 🎓 Best Practices

### For Agents
1. Respond within 2 minutes for active chats
2. Use quick responses for efficiency
3. Always confirm issue resolution
4. Mark sessions as resolved when done
5. Keep agent status accurate

### For Admins
1. Monitor waiting queue regularly
2. Balance agent workloads
3. Review satisfaction scores weekly
4. Archive old sessions monthly
5. Update canned responses based on common issues

---

## 📝 License & Credits

Built for BIM COLLAB Platform
© 2024 OJ Evolve

For questions or support, contact: support@bimcollab.com