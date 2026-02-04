import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase-init.js";
import { escapeHtml } from "./ui-utils.js";

let unsubscribeSponsoredBanner = null;
let sponsoredBannerConfig = null;

export function setupSponsoredBannerListener() {
    if (unsubscribeSponsoredBanner) unsubscribeSponsoredBanner();
    unsubscribeSponsoredBanner = onSnapshot(doc(db, "system_settings", "sponsored_banner"), (docSnap) => {
        if (docSnap.exists()) {
            sponsoredBannerConfig = docSnap.data();
        } else {
            sponsoredBannerConfig = null;
        }
        updateSponsoredBannerUI();
    });
}

export function updateSponsoredBannerUI() {
    const container = document.getElementById('sponsored-banner-container');
    if (!container) return;

    if (!sponsoredBannerConfig || !sponsoredBannerConfig.isActive) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="sponsored-banner" style="background: linear-gradient(90deg, var(--bg-card) 0%, var(--bg-body) 100%); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="background: var(--primary); color: white; font-size: 0.6rem; padding: 3px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Sponsored</div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 0.9rem; color: var(--text-main); font-weight: 600;">${escapeHtml(sponsoredBannerConfig.title || 'Sponsored Content')}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(sponsoredBannerConfig.description || '')}</span>
                </div>
            </div>
            <button onclick="window.open('${escapeHtml(sponsoredBannerConfig.link || '#')}', '_blank')" style="background: transparent; border: 1px solid var(--primary); color: var(--primary); padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;">Learn More</button>
        </div>
    `;
}

export function initializeAds() {
    const adContainer = document.getElementById('ad-container-sidebar');
    if (!adContainer) return;

    window.adsbygoogle = window.adsbygoogle || [];

    try {
        window.adsbygoogle.push({});
    } catch (e) {
        console.warn("AdSense push error:", e);
        adContainer.style.display = 'none';
        return;
    }

    setTimeout(() => {
        const adSlot = adContainer.querySelector('.adsbygoogle');
        if (adSlot && (adSlot.getAttribute('data-ad-status') === 'unfilled' || adSlot.offsetHeight < 50)) {
             console.warn('Ad slot appears empty. Hiding container.');
             adContainer.style.display = 'none';
        }
    }, 2500);
}