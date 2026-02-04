import { escapeHtml } from "./ui-utils.js";

const viewerStates = {};

export function initViewerState(id) {
    if (!viewerStates[id]) viewerStates[id] = { zoom: 1, rot: 0 };
}

export function setViewer(vId, url, name) {
    const wrap = document.getElementById(`wrapper-${vId}`);
    if (wrap) {
        const lower = (name || '').toLowerCase();
        const safeName = escapeHtml(name);
        const volSlider = document.getElementById(`vol-${vId}`);
        const orbitBtn = document.getElementById(`orbit-btn-${vId}`);

        if (volSlider) {
            if (/\.(mp4|webm|ogg|mp3|wav)$/i.test(lower)) {
                volSlider.style.display = 'inline-block';
                volSlider.value = 1;
            } else {
                volSlider.style.display = 'none';
            }
        }
        if (orbitBtn) orbitBtn.style.display = 'none';

        let content;
        if (/\.(mp4|webm|ogg)$/i.test(lower)) {
            content = `<video src="${url}" id="img-${vId}" controls style="max-width:100%;max-height:100%"></video>`;
        } else if (/\.(mp3|wav)$/i.test(lower)) {
            content = `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;background:#f8f9fa"><audio src="${url}" id="img-${vId}" controls></audio></div>`;
        } else if (/\.(pdf|txt|html)$/i.test(lower)) {
            content = `<iframe src="${url}" id="img-${vId}" style="width:100%;height:100%;border:none;background:#fff"></iframe>`;
        } else if (/\.(glb|gltf)$/i.test(lower)) {
            content = `<model-viewer src="${url}" id="img-${vId}" camera-controls style="width:100%;height:100%;"></model-viewer>`;
            if (orbitBtn) orbitBtn.style.display = 'flex';
        } else if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lower)) {
            content = `<img src="${url}" id="img-${vId}">`;
        } else if (/\.(dwg|dxf)$/i.test(lower)) {
            content = `<div id="img-${vId}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;background:#f0f0f0;color:#666;text-align:center;padding:20px;">
                        <i class="fas fa-layer-group" style="font-size:3rem;margin-bottom:15px;opacity:0.5"></i>
                        <div style="font-weight:bold;margin-bottom:5px">${safeName}</div>
                        <div style="font-size:0.8rem;margin-bottom:15px">CAD Preview not supported in browser</div>
                        <a href="${url}" download="${safeName}" style="color:var(--primary);text-decoration:underline;cursor:pointer">Download File</a>
                    </div>`;
        } else if (/\.(doc|docx|xls|xlsx|ppt|pptx|csv)$/i.test(lower)) {
            content = `<div id="img-${vId}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;background:#f0f0f0;color:#666;text-align:center;padding:20px;">
                        <i class="fas fa-file-alt" style="font-size:3rem;margin-bottom:15px;opacity:0.5"></i>
                        <div style="font-weight:bold;margin-bottom:5px">${safeName}</div>
                        <div style="font-size:0.8rem;margin-bottom:15px">Document Preview not supported in browser</div>
                        <a href="${url}" download="${safeName}" style="color:var(--primary);text-decoration:underline;cursor:pointer">Download File</a>
                    </div>`;
        } else {
            content = `<iframe src="${url}" id="img-${vId}" style="width:100%;height:100%;border:none;background:#fff"></iframe>`;
        }
        wrap.innerHTML = content;
        if (viewerStates[vId] && viewerStates[vId].currentUrl === url) {
            const el = document.getElementById(`img-${vId}`);
            if (el) el.style.transform = `scale(${viewerStates[vId].zoom}) rotate(${viewerStates[vId].rot}deg)`;
        } else {
            viewerStates[vId] = { zoom: 1, rot: 0, currentUrl: url };
        }
    }
}

export function zoom(id, delta) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    if (!viewerStates[id]) initViewerState(id);
    viewerStates[id].zoom = Math.max(0.1, viewerStates[id].zoom + delta);
    el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
}

export function rotate(id) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    if (!viewerStates[id]) initViewerState(id);
    viewerStates[id].rot += 90;
    el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
}

export function resetViewer(id) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    if (!viewerStates[id]) initViewerState(id);
    viewerStates[id].zoom = 1;
    viewerStates[id].rot = 0;
    el.style.transform = `scale(1) rotate(0deg)`;
}

export function setVolume(id, val) {
    const el = document.getElementById(`img-${id}`);
    if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
        el.volume = val;
    }
}

export function toggleOrbit(id) {
    const el = document.getElementById(`img-${id}`);
    if (el && el.tagName === 'MODEL-VIEWER') {
        if (el.hasAttribute('auto-rotate')) {
            el.removeAttribute('auto-rotate');
        } else {
            el.setAttribute('auto-rotate', '');
        }
    }
}

export function toggleFullscreen(id) {
    const el = document.getElementById(`viewer-container-${id}`);
    if (!el) return;
    if (!document.fullscreenElement) {
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                resetViewer(id);
                el.removeEventListener('fullscreenchange', onFsChange);
            }
        };
        el.addEventListener('fullscreenchange', onFsChange);
        el.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
}

// Expose functions to window for HTML event handlers
window.setViewer = setViewer;
window.zoom = zoom;
window.rotate = rotate;
window.resetViewer = resetViewer;
window.setVolume = setVolume;
window.toggleOrbit = toggleOrbit;
window.toggleFullscreen = toggleFullscreen;