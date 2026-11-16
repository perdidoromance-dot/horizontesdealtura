/* Botpress ConsultaWhatsApp owns the native URL button; the page never intercepts it. */
(() => {
    'use strict';
    const contact = 'https://wa.me/5493834571075';
    const roots = new Set([document]);

    function syncTina() {
        const chatRoot = document.getElementById('fab-root')?.shadowRoot;
        if (chatRoot && !roots.has(chatRoot)) {
            roots.add(chatRoot);
            observer.observe(chatRoot, { childList: true, subtree: true });
        }
        if (chatRoot && !chatRoot.querySelector('[data-itati-controls-style]')) {
            const style = document.createElement('style');
            style.dataset.itatiControlsStyle = 'true';
            const avatar = document.querySelector('[data-tina-avatar]')?.src;
            if (avatar) {
                style.textContent = `.bpFabWrapper, .bpFABMessagePreview { display:none !important; }
                    .bpHeaderContentAvatarFallback, .bpMessageAvatarFallback, .bpMessageListMarqueeAvatarFallback {
                      color:transparent !important;background:center/cover no-repeat url("${avatar}") !important; }`;
                chatRoot.append(style);
            }
        }
        // The ConsultaWhatsApp workflow owns the summary and native URL button.
        // Never hide, replace or intercept that button. Only mirror its exact
        // destination to the page's other WhatsApp entry points.
        const controls = chatRoot ? Array.from(chatRoot.querySelectorAll('.bpMessageBlocksButton[href]')) : [];
        const latest = controls.filter(link => {
            try {
                const url = new URL(link.getAttribute('href'));
                return url.origin === 'https://wa.me' && url.pathname === '/5493834571075' && !!url.searchParams.get('text');
            } catch (_) { return false; }
        }).pop();
        const url = latest?.getAttribute('href') || contact + '?text=' + encodeURIComponent('Hola, quiero consultar por un viaje con Horizontes de Altura.');
        document.querySelectorAll('a[href^="https://wa.me/5493834571075"]').forEach(link => {
            if (link.getAttribute('href') !== url) link.setAttribute('href', url);
        });
    }

    // One widget, one loading sequence, no new page or popup for Tina.
    let ready = false;
    let opened = false;
    let pendingOpen = location.hash === '#tina';
    let bootPromise = null;
    let eventsBound = false;
    let slowTimer;
    const feedback = document.createElement('p');
    feedback.id = 'tina-feedback';
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    feedback.style.cssText = 'position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:2147483000;max-width:260px;padding:12px 16px;border:1px solid #d8c9b8;border-radius:16px;background:#fffaf3;color:#4a2818;font:14px/1.5 Arial,sans-serif;box-shadow:0 4px 16px #0002;';
    document.body.append(feedback);
    function showFeedback(text) {
        feedback.textContent = text;
        feedback.hidden = !text;
    }
    function updateOpeners(state) {
        document.querySelectorAll('[data-open-itati]').forEach(button => {
            button.setAttribute('aria-expanded', String(opened));
            button.setAttribute('aria-busy', String(state === 'loading'));
            const detail = button.querySelector('small');
            if (detail) detail.textContent = state === 'loading' ? 'Cargando…' : state === 'error' ? 'Reintentar' : opened ? 'Cerrar chat' : 'Asistente con IA';
        });
    }
    function loadScript(id, src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar Tina.')); };
            document.head.append(script);
        });
    }
    function openChat() {
        if (!ready || typeof window.botpress?.open !== 'function') return;
        try {
            window.botpress.open();
            pendingOpen = false;
            clearTimeout(slowTimer);
            showFeedback('');
        } catch (_) {
            showFeedback('Tina no pudo abrirse. Volvé a tocar el botón para reintentar.');
        }
    }
    function bindBotpress() {
        if (eventsBound) return;
        eventsBound = true;
        window.botpress.on('webchat:initialized', () => {
            ready = true;
            clearTimeout(slowTimer);
            updateOpeners('ready');
            showFeedback('');
            if (pendingOpen) openChat();
        });
        window.botpress.on('webchat:opened', () => { opened = true; updateOpeners('ready'); });
        window.botpress.on('webchat:closed', () => { opened = false; updateOpeners('ready'); });
    }
    async function boot() {
        if (bootPromise) return bootPromise;
        bootPromise = (async () => {
            // Subscribe before loading the configuration, so initialization
            // cannot finish before the opening listener is registered.
            if (!window.botpress) await loadScript('tina-botpress-library', 'https://cdn.botpress.cloud/webchat/v3.7/inject.js');
            bindBotpress();
            await loadScript('tina-botpress-configuration', 'https://files.bpcontent.cloud/2026/11/15/14/20261115141839-B57OU4BF.js');
        })().catch(() => {
            bootPromise = null;
            updateOpeners('error');
            showFeedback('No se pudo cargar Tina. Tocá su botón para reintentar.');
        });
        return bootPromise;
    }
    document.addEventListener('click', event => {
        const opener = event.composedPath().find(node => node instanceof Element && node.matches('[data-open-itati]'));
        if (!opener) return;
        event.preventDefault();
        if (ready) {
            if (opened) window.botpress.close(); else openChat();
            return;
        }
        pendingOpen = true;
        updateOpeners('loading');
        showFeedback('Tina está cargando. El chat se abrirá acá en cuanto esté listo.');
        clearTimeout(slowTimer);
        slowTimer = setTimeout(() => {
            if (!ready) showFeedback('Tina está tardando en cargar. Revisá tu conexión; el chat se abrirá acá cuando esté listo.');
        }, 15000);
        boot();
    });

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; syncTina(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    syncTina();
    boot();
})();
