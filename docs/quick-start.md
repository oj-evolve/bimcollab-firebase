# 🚀 Quick Start Guide - Live Support System

## ⏱️ 30-Minute Setup

This guide will get your complete live support chat system running in 30 minutes.

---

## ✅ Prerequisites

- Firebase project already set up
- Admin user account created
- Node.js installed (for setup script)
- Basic Firebase knowledge

---

## 📝 Step-by-Step Setup

### STEP 1: Update Your Firestore Security Rules (5 minutes)

1. Go to Firebase Console → Firestore Database → Rules
2. Copy the contents of `firestore.rules` 
3. Paste into the rules editor
4. Click "Publish"

✅ **Verify**: Rules should show "Published" with current timestamp

---

### STEP 2: Run Setup Script (5 minutes)

1. Install Firebase Admin SDK:
```bash
npm install firebase-admin
```

2. Download your Firebase service account key:
   - Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `service-account-key.json`

3. Edit `setup-support-system.js`:
```javascript
// Line 37: Update with your admin email
const adminEmail = 'your-actual-admin@example.com';
const adminName = 'Your Name';
```

4. Run the setup:
```bash
node setup-support-system.js
```

✅ **Verify**: You should see "✅ SETUP COMPLETE!" message

---

### STEP 3: Create Firestore Indexes (5 minutes)

The setup script will print required indexes. Two options:

**Option A - Automatic (Easier)**
1. Just start using the app
2. Firebase will detect missing indexes
3. Click the provided links in console errors
4. Firebase will auto-create the indexes

**Option B - Manual**
1. Go to Firebase Console → Firestore → Indexes
2. Create these composite indexes:

```
Collection: support_sessions
Fields: status (Ascending), createdAt (Descending)

Collection: support_messages  
Fields: sessionId (Ascending), timestamp (Ascending)

Collection: support_agents
Fields: status (Ascending), currentChats (Ascending)
```

✅ **Verify**: Indexes show as "Enabled" (not "Building")

---

### STEP 4: Update Your Frontend Code (10 minutes)

**4.1 - Add Service Center Module**

Copy `service-center.js` to your `src/` folder

**4.2 - Update app.js imports**

Add at the top of `app.js`:
```javascript
import { 
    initServiceCenter, 
    openServiceCenter, 
    openContactModal, 
    submitContactForm, 
    startLiveChat 
} from "./service-center.js";
```

Add to your initialization section:
```javascript
// Initialize Service Center
initServiceCenter(() => ({
    currentRole,
    currentProjectId,
    currentUserName,
    roleProfiles
}));
```

Add to window exports:
```javascript
window.openServiceCenter = openServiceCenter;
window.openContactModal = openContactModal;
window.startLiveChat = startLiveChat;
```

**4.3 - Verify Floating Button Exists**

Check your `index.html` has the floating button:
```html
<button class="floating-service-btn" onclick="openServiceCenter()" title="Service Center">
    <i class="fas fa-headset"></i>
</button>
```

If not, add it before closing `</body>` tag.

**4.4 - Update Admin Panel**

Replace your `admin.js` with `admin-enhanced.js`:
```bash
cp admin-enhanced.js admin.js
```

✅ **Verify**: No console errors when loading the app

---

### STEP 5: Test Everything (5 minutes)

**5.1 - Test Customer Chat**

1. Log in as a regular user
2. Click the floating "Service Center" button
3. Click "Live Chat"
4. Send a test message

✅ **Verify**: Chat window opens, message appears

**5.2 - Test Agent Dashboard**

1. Log in to admin panel (admin.html) with your admin account
2. Navigate to "Support Team" tab
3. You should see the chat session from Step 5.1
4. Click on the session
5. Reply to the message

✅ **Verify**: 
- Session appears in queue
- Can click and view messages
- Can send replies
- User sees replies in real-time

**5.3 - Test Contact Form**

1. As user, open Service Center
2. Click "Send Message"
3. Fill form and submit

✅ **Verify**: 
- Form submits successfully
- Message appears in admin "Messages" tab

---

## 🎯 Configuration Options

### Adjust Agent Settings

Edit in Firebase Console → Firestore → `support_agents` → (your agent doc):

```javascript
maxChats: 5,  // Change to 3 or 10 based on capacity
skills: ["general", "technical", "modeling"]  // Add/remove skills
```

### Customize Categories

Edit in `service-center.js` line ~75:
```javascript
category: 'general', 
// Options: 'general', 'modeling', 'clash', 'billing', 'technical'
```

### Change Quick Responses

Edit in `admin.html` lines ~175-180:
```html
<option value="Your custom message">Label</option>
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Permission denied" errors
**Cause**: Firestore rules not deployed or user lacks admin claim  
**Fix**: 
1. Verify rules are published in Firebase Console
2. User must sign out and back in after admin claim is set
3. Check browser console for specific permission errors

### Issue 2: Messages not appearing in real-time
**Cause**: Missing Firestore indexes  
**Fix**: Create the required indexes (see Step 3)

### Issue 3: Agent status stuck as "offline"
**Cause**: Agent profile not created or heartbeat not running  
**Fix**: 
1. Check `support_agents` collection has your user's document
2. Look for JavaScript errors in console
3. Verify admin.js is using the enhanced version

### Issue 4: "No sessions" showing in agent dashboard
**Cause**: Queries not matching due to status field  
**Fix**: Check that test session has `status: "waiting"` or `"active"`

### Issue 5: Chat window won't open
**Cause**: Missing service-center.js or import errors  
**Fix**: 
1. Verify service-center.js is in src/ folder
2. Check import path is correct
3. Look for 404 errors in Network tab

---

## 📊 Post-Setup Checklist

- [ ] Firestore rules deployed
- [ ] Setup script completed successfully  
- [ ] Indexes created and enabled
- [ ] Frontend code updated
- [ ] Admin user can log in to admin panel
- [ ] Regular user can open Service Center
- [ ] Live chat creates sessions
- [ ] Agent can see and reply to chats
- [ ] Contact form submissions work
- [ ] Messages appear in real-time

---

## 🎓 Next Steps

Once basic setup works:

1. **Add More Agents**
   ```javascript
   // In setup-support-system.js:
   addSupportAgent('agent2@company.com', 'Agent Name', ['modeling', 'clash']);
   ```

2. **Customize Branding**
   - Update colors in admin.css
   - Change agent greeting messages
   - Add company logo

3. **Enable Analytics**
   - Track response times
   - Monitor satisfaction scores
   - Generate weekly reports

4. **Add Advanced Features**
   - File attachments
   - Chat transfers
   - Satisfaction ratings
   - Email notifications

---

## 💡 Pro Tips

1. **Set Agent Status Manually**
   ```javascript
   // In admin panel console:
   await updateDoc(doc(db, "support_agents", currentAgentId), {
     status: 'online'
   });
   ```

2. **Test with Multiple Browser Windows**
   - User in Chrome
   - Agent in Firefox
   - See real-time sync

3. **Monitor in Firebase Console**
   - Watch `support_sessions` collection live
   - See messages appear in real-time
   - Check agent status updates

4. **Use Incognito for Testing**
   - Avoids cache issues
   - Clean slate each time
   - Better simulation

---

## 📞 Getting Help

If you encounter issues:

1. Check browser console for errors
2. Verify Firebase Console for:
   - Rules are published
   - Indexes are enabled
   - Collections exist
3. Review the detailed IMPLEMENTATION_GUIDE.md
4. Check that all file paths are correct

---

## 🎉 You're Done!

Your live support system is now fully functional!

**What you've built:**
- ✅ Real-time chat between users and agents
- ✅ Smart agent assignment system
- ✅ Contact form submissions
- ✅ Agent performance tracking
- ✅ Mobile-responsive interface
- ✅ Scalable architecture

**Test it now:**
1. Open your BIM app as a user
2. Click the floating support button
3. Start a live chat
4. Switch to admin panel
5. See the magic happen! ✨

---

Built with ❤️ for BIM COLLAB