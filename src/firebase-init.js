import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
let db;
try {
    db = initializeFirestore(app, {
        cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (err) {
    console.error("Firestore persistence failed, falling back to memory cache.", err);
    db = initializeFirestore(app, {}); // Fallback to memory cache
}

const storageService = getStorage(app);
const analytics = getAnalytics(app);
const auth = getAuth(app);

export { app, db, storageService, analytics, auth };