/* One native WhatsApp link per conversation. No modal, popup script or auto-send. */
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
        const summaryMessage = preceding.find(message => /resumen/i.test(cleanText(message)));
        let summary = summaryMessage ? cleanText(summaryMessage) : '';
        if (summary) {
            summary = summary.slice(summary.toLowerCase().indexOf('resumen'))
                .replace(/^resumen(?: de (?:tu|la) consulta)?\s*:?\s*/i, '')
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
            send.href = consultationUrl(viewport, last);
        }));
    }

    let chatInitialized = false;
    let eventsBound = false;
    const standalone = document.body.hasAttribute('data-tina-page');
    function bindChatEvents() {
        if (eventsBound || typeof window.botpress?.on !== 'function') return;
        eventsBound = true;
        window.botpress.on('webchat:initialized', () => {
            chatInitialized = true;
            const status = document.getElementById('tina-status');
            if (status) status.textContent = 'Tina está lista para conversar.';
            const open = document.getElementById('tina-open');
            if (open) open.disabled = false;
            if (standalone) window.botpress.open();
        });
        document.getElementById('tina-open')?.addEventListener('click', () => {
            if (chatInitialized) window.botpress.open();
        });
    }
    bindChatEvents();
    window.addEventListener('load', bindChatEvents, { once: true });

    document.addEventListener('click', event => {
        const opener = event.composedPath().find(node => node instanceof Element && node.matches('[data-open-itati]'));
        if (opener && chatInitialized && typeof window.botpress?.open === 'function') {
            // Only cancel the native fallback once the embedded chat can open.
            try {
                window.botpress.open();
                event.preventDefault();
            } catch (_) { /* Native href opens the same Botpress AI directly. */ }
        }
        // The send anchor uses the browser's normal link handling. Do not turn
        // this click into a quick reply or call window.open asynchronously.
    }, true);

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; renderSendButton(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderSendButton();
})();
