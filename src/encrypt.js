import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase-init.js";

let cryptoKey = null;
let initializationPromise = null;

export async function initEncryption() {
    if (cryptoKey) return;

    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
        let password = sessionStorage.getItem('bim_project_password');
        if (!password) {
            // Attempt to recover key from Firestore if missing
            try {
                const docRef = doc(db, "system_settings", "global_encryption");
                const keySnap = await getDoc(docRef);
                if (keySnap.exists()) {
                    password = keySnap.data().key;
                } else {
                    // Generate key if missing (First run logic)
                    const array = new Uint8Array(32);
                    window.crypto.getRandomValues(array);
                    password = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
                    await setDoc(docRef, { key: password });
                }
                sessionStorage.setItem('bim_project_password', password);
            } catch (e) { console.error("Key recovery failed", e); }

            if (!password) {
                // Key missing. If user is not logged in, auth listener handles login screen.
                return;
            }
        }

        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        // Using a static salt for this demo to ensure all users derive the same key
        const salt = enc.encode("bim-viewer-shared-salt");

        cryptoKey = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    })();

    await initializationPromise;
}

export async function encryptData(text) {
    if (!cryptoKey) await initEncryption();
    if (!cryptoKey) throw new Error("Encryption key not available");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        encoded
    );
    const encryptedArray = new Uint8Array(encrypted);
    const buf = new Uint8Array(iv.length + encryptedArray.length);
    buf.set(iv);
    buf.set(encryptedArray, iv.length);
    
    let binary = '';
    for (let i = 0; i < buf.length; i++) {
        binary += String.fromCharCode(buf[i]);
    }
    return btoa(binary);
}

export async function decryptData(encryptedText) {
    if (!cryptoKey) await initEncryption();
    if (!cryptoKey) return "*** Key Missing ***";
    try {
        const data = new Uint8Array(atob(encryptedText).split("").map(c => c.charCodeAt(0)));
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            cryptoKey,
            encrypted
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        return "*** Encrypted Content ***";
    }
}

export function resetEncryptionState() {
    cryptoKey = null;
    initializationPromise = null;
    sessionStorage.removeItem('bim_project_password');
}