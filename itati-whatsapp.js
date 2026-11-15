/* Keep the WhatsApp handoff functional even when the chat renders a reply
 * button or an anchor without a destination. Messages are never sent here. */
(() => {
    'use strict';

    const contact = 'https://wa.me/5493834571075';
    const controls = '.bpMessageBlocksTextLink, .bpMessageBlocksButton';
    const roots = new Set([document]);
    const normalise = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function isHandoff(control) {
        return control.matches(controls) && /whats\s*app/.test(normalise(control.textContent || ''));
    }

    function messageText(message) {
        const copy = message.cloneNode(true);
        copy.querySelectorAll('a, button, .bpMessageAvatarContainer, .bpMessageDeliveryStatus').forEach((node) => node.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function handoffUrl(control) {
        if (/sin resumen/.test(normalise(control.textContent || ''))) return contact;
        const viewport = control.closest('.bpMessageListViewport');
        const current = control.closest('.bpMessageContainer');
        if (!viewport || !current) return contact;

        const messages = Array.from(viewport.querySelectorAll('.bpMessageContainer'));
        const position = messages.indexOf(current);
        // Never pick a later message or a summary from another conversation.
        const preceding = messages.slice(0, position + 1).reverse();
        const summaryMessage = preceding.find((message) => /resumen/i.test(messageText(message)));
        if (!summaryMessage) return contact;

        let summary = messageText(summaryMessage);
        const start = summary.toLowerCase().indexOf('resumen');
        summary = summary.slice(start).replace(/^resumen(?: de (?:tu|la) consulta)?\s*:?\s*/i, '');
        summary = summary.replace(/(?:revis[aá] el mensaje|vas a poder revisar)[\s\S]*$/i, '').trim();
        if (!summary) return contact;
        const message = 'Hola, conversé con Itatí de Horizontes de Altura.\n\n' + summary.slice(0, 3500);
        return contact + '?text=' + encodeURIComponent(message);
    }

    function repairLinks() {
        const chatRoot = document.getElementById('fab-root')?.shadowRoot;
        if (chatRoot && !roots.has(chatRoot)) {
            roots.add(chatRoot);
            observer.observe(chatRoot, { childList: true, subtree: true });
        }
        roots.forEach((root) => root.querySelectorAll('a.bpMessageBlocksTextLink').forEach((link) => {
            if (!isHandoff(link)) return;
            link.href = handoffUrl(link);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('aria-label', /sin resumen/.test(normalise(link.textContent || ''))
                ? 'Abrir WhatsApp sin resumen, en una nueva pestaña'
                : 'Abrir WhatsApp con el resumen de tu consulta, en una nueva pestaña');
        }));
    }

    document.addEventListener('click', (event) => {
        const opener = event.composedPath().find((node) => node instanceof Element && node.matches('[data-open-itati]'));
        if (opener && typeof window.botpress?.open === 'function') {
            event.preventDefault();
            window.botpress.open();
            return;
        }
        const control = event.composedPath().find((node) => node instanceof Element && isHandoff(node));
        if (!control) return;
        const url = handoffUrl(control);
        if (control.tagName === 'A') {
            control.href = url;
            control.target = '_blank';
            control.rel = 'noopener noreferrer';
            // Preserve the browser's native link navigation, including on iOS.
            event.stopImmediatePropagation();
            return;
        }
        // Old quick-reply messages must navigate instead of sending their label
        // back into the conversation. Same-tab navigation avoids popup blockers.
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.assign(url);
    }, true);

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; repairLinks(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    repairLinks();
})();
