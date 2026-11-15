/* Keep the WhatsApp handoff functional even when the chat renders a reply
 * button or an anchor without a destination. Messages are never sent here. */
(() => {
    'use strict';

    const contact = 'https://wa.me/5493834571075';
    const controls = '.bpMessageBlocksTextLink, .bpMessageBlocksButton';
    const roots = new Set([document]);
    const normalise = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const review = document.createElement('dialog');
    review.id = 'itati-review';
    review.setAttribute('aria-labelledby', 'itati-review-title');
    review.innerHTML = `
        <button id="itati-review-close" type="button" aria-label="Volver a la conversación">×</button>
        <p>Itatí · Horizontes de Altura</p>
        <h2 id="itati-review-title">Tu consulta está lista</h2>
        <p>Revisá el mensaje antes de continuar con nuestro equipo.</p>
        <label for="itati-review-message">Podés editar tu consulta:</label>
        <textarea id="itati-review-message" maxlength="4000"></textarea>
        <a id="itati-review-open" href="https://wa.me/5493834571075" target="_blank" rel="noopener noreferrer">Abrir WhatsApp con mi consulta ↗</a>
        <button id="itati-review-copy" type="button">Copiar consulta</button>
        <a id="itati-review-same-tab" href="https://wa.me/5493834571075">Abrir WhatsApp en esta pestaña</a>
        <p id="itati-review-status" role="status" aria-live="polite"></p>
        <p class="itati-review-small">WhatsApp de Horizontes: +54 9 383 457-1075. El mensaje no se envía automáticamente y no confirma una reserva.</p>`;
    document.body.append(review);
    const messageInput = review.querySelector('#itati-review-message');
    const externalLink = review.querySelector('#itati-review-open');
    const sameTabLink = review.querySelector('#itati-review-same-tab');
    const copyStatus = review.querySelector('#itati-review-status');

    function isHandoff(control) {
        return control.matches(controls) && /whats\s*app/.test(normalise(control.textContent || ''));
    }

    function messageText(message) {
        const copy = message.cloneNode(true);
        copy.querySelectorAll('a, button, .bpMessageAvatarContainer, .bpMessageDeliveryStatus').forEach((node) => node.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function handoffUrl(control) {
        if (control.dataset.itatiDirect === 'true' || /sin resumen/.test(normalise(control.textContent || ''))) return contact;
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

    function updateReviewLinks() {
        const text = messageInput.value.trim();
        const url = text ? contact + '?text=' + encodeURIComponent(text) : contact;
        externalLink.href = url;
        sameTabLink.href = url;
    }

    function openReview(control) {
        const url = new URL(handoffUrl(control));
        messageInput.value = url.searchParams.get('text') || 'Hola, quisiera consultar un viaje con Horizontes de Altura.';
        copyStatus.textContent = '';
        updateReviewLinks();
        review.showModal();
    }

    function repairLinks() {
        const chatRoot = document.getElementById('fab-root')?.shadowRoot;
        if (chatRoot && !roots.has(chatRoot)) {
            roots.add(chatRoot);
            observer.observe(chatRoot, { childList: true, subtree: true });
        }
        roots.forEach((root) => root.querySelectorAll('a.bpMessageBlocksTextLink').forEach((link) => {
            if (!isHandoff(link)) return;
            if (!link.dataset.itatiDirect) link.dataset.itatiDirect = String(/sin resumen/.test(normalise(link.textContent || '')));
            link.href = '#consulta-whatsapp';
            link.removeAttribute('target');
            link.setAttribute('aria-label', link.dataset.itatiDirect === 'true'
                ? 'Revisar consulta sin resumen antes de abrir WhatsApp'
                : 'Revisar el resumen de tu consulta antes de abrir WhatsApp');
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
        event.preventDefault();
        event.stopImmediatePropagation();
        openReview(control);
    }, true);

    messageInput.addEventListener('input', updateReviewLinks);
    review.querySelector('#itati-review-close').addEventListener('click', () => review.close());
    review.querySelector('#itati-review-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(messageInput.value);
            copyStatus.textContent = 'Consulta copiada. Podés pegarla en el chat de WhatsApp.';
        } catch {
            messageInput.focus();
            messageInput.select();
            copyStatus.textContent = 'Seleccionamos el mensaje para que puedas copiarlo.';
        }
    });

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; repairLinks(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    repairLinks();
})();
