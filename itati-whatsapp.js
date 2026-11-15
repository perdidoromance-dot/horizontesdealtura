/* One direct WhatsApp link per conversation, shared with every contact entry point. No modal, popup script or auto-send. */
(() => {
    'use strict';
    const contact = 'https://wa.me/5493834571075';
    const selector = '.bpMessageBlocksTextLink, .bpMessageBlocksButton';
    const roots = new Set([document]);
    const normalise = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isHandoff = node => node.matches(selector) && /whats\s*app|^enviar consulta$/.test(normalise(node.textContent || '').trim());

    function cleanText(message) {
        const copy = message.cloneNode(true);
        copy.querySelectorAll('a, button, .bpMessageAvatarContainer, .bpMessageDeliveryStatus').forEach(node => node.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function consultationUrl(viewport, lastControl) {
        const messages = Array.from(viewport.querySelectorAll('.bpMessageContainer'));
        const current = lastControl.closest('.bpMessageContainer');
        const index = messages.indexOf(current);
        const preceding = messages.slice(0, index + 1).reverse();
        const label = /(?:resumen(?: de (?:tu|la) consulta)?|consulta con tina)\s*:\s*/i;
        const summaryMessage = preceding.find(message => label.test(cleanText(message)));
        let summary = summaryMessage ? cleanText(summaryMessage) : '';
        if (summary) {
            const match = label.exec(summary);
            summary = summary.slice(match.index + match[0].length)
                .replace(/(?:revis[aá] el mensaje|vas a poder revisar)[\s\S]*$/i, '').trim();
        }
        if (!summary) {
            // A handoff without a labelled summary still carries the traveller's
            // visible messages rather than sending an empty consultation.
            summary = messages.filter(message => message.getAttribute('direction') === 'outgoing')
                .map(cleanText).filter(Boolean).slice(-8).join('\n');
        }
        const text = 'Hola, conversé con Tina de Horizontes de Altura.'
            + (summary ? '\n\n' + summary.slice(0, 3500) : '\nQuisiera consultar por un viaje.');
        return contact + '?text=' + encodeURIComponent(text);
    }

    function renderSendButton() {
        const chatRoot = document.getElementById('fab-root')?.shadowRoot;
        if (chatRoot && !roots.has(chatRoot)) {
            roots.add(chatRoot);
            observer.observe(chatRoot, { childList: true, subtree: true });
        }
        if (chatRoot && !chatRoot.querySelector('[data-itati-controls-style]')) {
            const style = document.createElement('style');
            style.dataset.itatiControlsStyle = 'true';
            const avatar = document.querySelector('[data-tina-avatar]')?.src;
            if (!avatar) return;
            style.textContent = `.bpFabWrapper, .bpFABMessagePreview { display:none !important; }
                .bpHeaderContentAvatarFallback, .bpMessageAvatarFallback, .bpMessageListMarqueeAvatarFallback {
                  color:transparent !important;background:center/cover no-repeat url("${avatar}") !important; }`;
            chatRoot.append(style);
        }
        roots.forEach(root => root.querySelectorAll('.bpMessageListViewport').forEach(viewport => {
            const controls = Array.from(viewport.querySelectorAll(selector)).filter(isHandoff);
            if (!controls.length) return;
            // Retain the original elements for the chat renderer, but expose only
            // our one native anchor, with a URL built from the visible summary.
            controls.forEach(control => {
                control.hidden = true;
                control.style.display = 'none';
                control.setAttribute('aria-hidden', 'true');
            });
            const last = controls[controls.length - 1];
            const container = last.closest('.bpMessageContainer');
            if (!container) return;
            const url = consultationUrl(viewport, last);
            let send = viewport.querySelector('[data-itati-send]');
            let row = viewport.querySelector('[data-itati-send-row]');
            if (!send) {
                row = document.createElement('div');
                row.dataset.itatiSendRow = 'true';
                row.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:0 0 0 36px;';
                send = document.createElement('a');
                send.dataset.itatiSend = 'true';
                send.textContent = 'Enviar consulta';
                send.target = '_blank';
                send.rel = 'noopener noreferrer external';
                send.style.cssText = 'display:block;box-sizing:border-box;width:100%;margin:12px 0 4px;padding:14px 18px;border-radius:12px;background:#087b51;color:#fff;text-decoration:none;text-align:center;font:600 15px/1.5 Arial,sans-serif;';
                row.append(send);
            }
            if (container.nextElementSibling !== row) container.after(row);
            send.href = url;
            // All general contact entry points must carry the same trip.
            // A traveller can use the left button or menu after talking to Tina.
            document.querySelectorAll('a[href^="https://wa.me/5493834571075"]').forEach(link => {
                if (link.href !== url) link.href = url;
            });
        }));
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
        queueMicrotask(() => { scheduled = false; renderSendButton(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderSendButton();
    boot();
})();
