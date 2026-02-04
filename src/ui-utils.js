export function createModal(modalId, options = {}) {
    const {
        maxWidth = '400px',
        zIndex = '3000',
        animation = 'fadeIn 0.2s ease-out',
        onClose = () => {}
    } = options;

    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.zIndex = zIndex;

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = maxWidth;
    if (animation) card.style.animation = animation;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const close = () => {
        modal.remove();
        onClose();
    };

    modal.onclick = (e) => {
        if (e.target === modal) close();
    };

    return { modal, card, close };
}

export function showCustomModal(title, message, options = {}) {
    const {
        isConfirm = false,
        confirmText = 'OK',
        cancelText = 'Cancel',
        confirmColor = 'var(--primary)',
        onConfirm = () => {},
        onCancel = () => {}
    } = options;

    const modalId = 'custom-modal-' + Date.now();
    const { modal, card, close } = createModal(modalId, {
        zIndex: '5000',
        onClose: onCancel
    });

    let buttonsHtml = '';
    if (isConfirm) {
        buttonsHtml = `
            <button id="btn-cancel-${modalId}" style="padding:0.6rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.3rem; cursor:pointer; color:var(--text-main);">${cancelText}</button>
            <button id="btn-confirm-${modalId}" style="padding:0.6rem 1rem; border:none; background:${confirmColor}; color:white; border-radius:0.3rem; cursor:pointer; font-weight:600;">${confirmText}</button>
        `;
    } else {
        buttonsHtml = `
            <button id="btn-confirm-${modalId}" style="padding:0.6rem 1rem; border:none; background:${confirmColor}; color:white; border-radius:0.3rem; cursor:pointer; font-weight:600;">${confirmText}</button>
        `;
    }

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">${title}</span>
            <i class="fas fa-times" style="cursor:pointer" id="close-${modalId}"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem; line-height:1.5;">${message}</p>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                ${buttonsHtml}
            </div>
        </div>
    `;

    document.getElementById(`close-${modalId}`).onclick = close;
    
    if (isConfirm) {
        document.getElementById(`btn-cancel-${modalId}`).onclick = close;
    }
    
    document.getElementById(`btn-confirm-${modalId}`).onclick = () => {
        modal.remove();
        onConfirm();
    };
}

export function showAlert(message, title = 'Notification') {
    showCustomModal(title, message);
}

export function showConfirm(message, onConfirm, title = 'Confirmation', confirmText = 'Confirm', confirmColor = 'var(--primary)') {
    showCustomModal(title, message, {
        isConfirm: true,
        confirmText,
        confirmColor,
        onConfirm
    });
}

export function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification'; // Use a class for styling
    toast.innerHTML = `<i class="fas fa-info-circle"></i> <span>${message}</span>`;
    
    // Note: The styles for '.toast-notification' should be moved to your CSS file.
    // Example CSS:
    /*
    .toast-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: var(--primary);
        color: white;
        padding: 10px 20px;
        border-radius: 30px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 5000;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    }
    */

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input) {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        iconElement.classList.toggle('fa-eye');
        iconElement.classList.toggle('fa-eye-slash');
    }
}

export function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}