/**
 * Adds Chinese-to-English translation to Reddit composers.
 * It only fills fields and never submits content.
 */
(function () {
  const BUTTON_CLASS = 'rrh-translate-btn';
  const HANDOFF_KEY = 'rrh_composer_handoff';
  const COMPOSER = (globalThis.RRH_COMPOSER = globalThis.RRH_COMPOSER || {});
  const ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <path d="M9 6.4C9 10.8 6.8 13 4 13M4 6.4h7M5 9c0 2.1 2.3 3.9 6 4"/>
        <path d="m12 20 4-9 4 9m-.9-2h-6.2M6.7 3l.8.6"/>
      </g>
    </svg>`;
  const SHADOW_STYLES = `
    .${BUTTON_CLASS}{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;height:2rem;border:0;background:transparent;color:var(--rte-toolbar-button-color,var(--color-secondary-weak,#7c8082));cursor:pointer;border-radius:9999px;padding:0 6px;line-height:0}
    .${BUTTON_CLASS} svg{width:20px;height:20px}
    .${BUTTON_CLASS}:hover{background:var(--color-neutral-background-hover,rgba(127,127,127,.18))}
    .${BUTTON_CLASS}:focus-visible{outline:2px solid #6aa7ff;outline-offset:2px}
    .${BUTTON_CLASS}:disabled{cursor:wait;opacity:.58}
    .${BUTTON_CLASS}[data-state="done"]{color:#1a7f50}
    .${BUTTON_CLASS}[data-state="error"]{color:#d1242f}
  `;

  let lastEditor = null;
  const styledRoots = new WeakSet();

  document.addEventListener('focusin', rememberEditor, true);
  COMPOSER.fill = fillComposer;
  COMPOSER.queue = queueComposerDraft;
  scan();
  setInterval(scan, 1800);

  function rememberEditor(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node?.matches?.('[contenteditable][data-lexical-editor]')) {
        lastEditor = node;
        fillQueuedDraft(node);
        return;
      }
    }
  }

  function scan() {
    for (const toolbar of deepQueryAll('rte-toolbar')) injectNewReddit(toolbar);
    injectOldReddit();
    fillQueuedDraft();
  }

  function queueComposerDraft(payload) {
    const draft = String(payload?.draft || '').trim();
    if (!draft) return false;
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({
        id: String(payload?.id || ''),
        draft,
        at: Date.now(),
      })
    );
    return true;
  }

  function fillComposer(text, preferredEditor) {
    const draft = String(text || '').trim();
    if (!draft) return false;
    const editor = preferredEditor || findWritableEditor();
    if (!editor || getFieldText(editor)) return false;
    if (editor.matches?.('[contenteditable]')) setBody(editor, draft);
    else setNativeValue(editor, draft);
    return getFieldText(editor).length > 0;
  }

  function fillQueuedDraft(preferredEditor) {
    const queued = readQueuedDraft();
    if (!queued || !pageMatchesPost(queued.id)) return false;
    if (!fillComposer(queued.draft, preferredEditor)) return false;
    sessionStorage.removeItem(HANDOFF_KEY);
    notify('草稿已填入，请检查后手动发送');
    return true;
  }

  function readQueuedDraft() {
    try {
      const value = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null');
      if (!value?.draft || Date.now() - Number(value.at || 0) > 30 * 60 * 1000) {
        sessionStorage.removeItem(HANDOFF_KEY);
        return null;
      }
      return value;
    } catch {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
  }

  function pageMatchesPost(id) {
    return !id || new RegExp(`/comments/${escapeRegExp(id)}(?:/|$)`, 'i').test(location.pathname);
  }

  function findWritableEditor() {
    if (lastEditor?.isConnected && isVisible(lastEditor)) return lastEditor;
    const editors = deepQueryAll('[contenteditable][data-lexical-editor]');
    const emptyEditor = editors.find((editor) => isVisible(editor) && !getEditorText(editor));
    if (emptyEditor) return emptyEditor;
    return [...document.querySelectorAll('.usertext-edit textarea, textarea[name="text"]')]
      .find((field) => isVisible(field) && !field.value.trim()) || null;
  }

  function getFieldText(field) {
    return field?.matches?.('[contenteditable]')
      ? getEditorText(field)
      : String(field?.value || '').trim();
  }

  function isVisible(element) {
    return !!(element?.offsetWidth || element?.offsetHeight || element?.getClientRects?.().length);
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function injectNewReddit(toolbar) {
    const root = toolbar.shadowRoot;
    const container = root?.querySelector('.rte-toolbar-responsive');
    if (!root || !container || container.querySelector(`.${BUTTON_CLASS}`)) return;
    ensureShadowStyle(root);
    const button = makeButton();
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scope = findComposerScope(toolbar);
      const bodyEditor =
        toolbar.querySelector('[contenteditable][data-lexical-editor]') ||
        findComposerEditor(toolbar) ||
        scope?.querySelector?.('[contenteditable][data-lexical-editor]') ||
        lastEditor;
      const titleField = getTitleField(scope);
      await translateComposer(button, {
        title: titleField ? titleField.value.trim() : '',
        body: bodyEditor ? getEditorText(bodyEditor) : '',
        setTitle: (text) => setTitle(titleField, text),
        setBody: (text) => setBody(bodyEditor, text),
      });
    });
    container.appendChild(button);
  }

  function injectOldReddit() {
    document.querySelectorAll('.usertext-edit textarea, textarea[name="text"]').forEach((bodyField) => {
      const form = bodyField.closest('form');
      if (!form || form.querySelector(`.${BUTTON_CLASS}.rrh-old`)) return;
      const button = makeButton('中译英');
      button.classList.add('rrh-old');
      button.addEventListener('click', async () => {
        const titleField = form.querySelector('textarea[name="title"], input[name="title"]');
        await translateComposer(button, {
          title: titleField?.value?.trim() || '',
          body: bodyField.value.trim(),
          setTitle: (text) => setNativeValue(titleField, text),
          setBody: (text) => setNativeValue(bodyField, text),
        });
      });
      const target = form.querySelector('.usertext-buttons, .bottom-area') || bodyField;
      target.insertAdjacentElement('afterend', button);
    });
  }

  async function translateComposer(button, composer) {
    if (button.disabled) return;
    if (!composer.title && !composer.body) {
      setButtonState(button, 'error', '没有可翻译的内容');
      notify('没有可翻译的内容');
      return;
    }
    button.disabled = true;
    setButtonState(button, 'loading', '翻译中…');
    try {
      const [title, body] = await Promise.all([
        composer.title ? requestTranslation(composer.title) : null,
        composer.body ? requestTranslation(composer.body) : null,
      ]);
      if (title !== null) composer.setTitle(title);
      if (body !== null) composer.setBody(body);
      setButtonState(button, 'done', '已翻译为英文');
      notify('已翻译为英文');
    } catch (error) {
      const message = `翻译失败：${error?.message || error}`;
      setButtonState(button, 'error', message);
      notify(message);
    } finally {
      button.disabled = false;
    }
  }

  async function requestTranslation(text) {
    const response = await chrome.runtime.sendMessage({
      type: 'RRH_TRANSLATE_TO_ENGLISH',
      text,
    });
    if (!response?.ok) throw new Error(response?.error || '翻译失败');
    return String(response.translated || '').trim();
  }

  function makeButton(label = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.title = '把当前内容翻译为自然英文';
    button.setAttribute('aria-label', '翻译为英文');
    button.innerHTML = `${ICON}${label ? `<span>${label}</span>` : ''}`;
    return button;
  }

  function setButtonState(button, state, message) {
    button.dataset.state = state;
    button.title = message;
    button.setAttribute('aria-label', message);
    clearTimeout(button._rrhStateTimer);
    if (state === 'done' || state === 'error') {
      button._rrhStateTimer = setTimeout(() => {
        button.dataset.state = '';
        button.title = '把当前内容翻译为自然英文';
        button.setAttribute('aria-label', '翻译为英文');
      }, 3500);
    }
  }

  function notify(message) {
    if (typeof globalThis.RRH_OVERLAY?.notify === 'function') {
      globalThis.RRH_OVERLAY.notify(message);
    }
  }

  function deepQueryAll(selector, root = document, out = []) {
    root.querySelectorAll(selector).forEach((element) => out.push(element));
    root.querySelectorAll('*').forEach((element) => {
      if (element.shadowRoot) deepQueryAll(selector, element.shadowRoot, out);
    });
    return out;
  }

  function ensureShadowStyle(root) {
    if (styledRoots.has(root)) return;
    const style = document.createElement('style');
    style.textContent = SHADOW_STYLES;
    root.appendChild(style);
    styledRoots.add(root);
  }

  function findComposerEditor(start) {
    let node = start;
    while (node) {
      const root = node.getRootNode();
      if (!(root instanceof ShadowRoot)) break;
      const host = root.host;
      const editor = host?.querySelector?.('[contenteditable][data-lexical-editor]');
      if (editor) return editor;
      node = host;
    }
    return null;
  }

  function findComposerScope(start) {
    let node = start;
    for (let depth = 0; depth < 40 && node; depth += 1) {
      let element = node.nodeType === Node.ELEMENT_NODE ? node : null;
      while (element) {
        if (element.matches?.('faceplate-form, shreddit-composer')) return element;
        element = element.parentElement;
      }
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  }

  function getTitleField(scope) {
    if (!scope?.querySelectorAll) return null;
    for (const host of scope.querySelectorAll('post-composer-title')) {
      const field = host.shadowRoot?.querySelector('textarea[name="title"]');
      if (field && field.offsetParent !== null) return field;
    }
    return null;
  }

  function getEditorText(editor) {
    return String(editor.innerText || '').replace(/\u00a0/g, ' ').trim();
  }

  function setBody(editor, text) {
    if (!editor) return;
    editor.focus();
    selectEditor(editor);
    const before = getEditorText(editor);
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
    if (!inserted || getEditorText(editor) === before || getEditorText(editor) !== text.trim()) {
      selectEditor(editor);
      const data = new DataTransfer();
      data.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    }
  }

  function selectEditor(editor) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function setTitle(field, text) {
    if (!field) return;
    setNativeValue(field, text);
    const root = field.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    const internal = host?.shadowRoot?.querySelector('input.faceplate-internal-input');
    if (internal) setNativeValue(internal, text);
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setNativeValue(field, text) {
    if (!field) return;
    field.focus();
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) descriptor.set.call(field, text);
    else field.value = text;
    field.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
})();
