(() => {
  const state = window.__pipocaTranslatorState ||= { originals: new Map(), attributes: new Map(), nodes: new Map() };
  if (state.version === 6) return;
  if (state.listener) chrome.runtime.onMessage.removeListener(state.listener);
  state.originals ||= new Map();
  state.attributes ||= new Map();
  state.nodes ||= new Map();
  state.markers ||= new Set();
  state.version = 6;
  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "SVG", "CANVAS", "SELECT", "OPTION"]);

  function isTranslatableText(clean) {
    if (!clean || clean.length < 2) return false;
    if (/^\W+$/.test(clean)) return false;
    if (/^[\d\s.,:%$€£¥R+\-–—/()[\]{}#@!?*•·|~=_]+$/.test(clean)) return false;
    if (/^https?:\/\/\S+$/i.test(clean)) return false;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
    return true;
  }

  function shouldSkipElement(element) {
    let current = element;
    while (current && current !== document.body) {
      if (skipTags.has(current.tagName) || current.isContentEditable || current.getAttribute("aria-hidden") === "true" || current.hasAttribute("data-pipoca-ui")) return true;
      current = current.parentElement;
    }
    return false;
  }
  function isRendered(element) {
    if (shouldSkipElement(element)) return false;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
  }
  function isInViewport(bounds) {
    return bounds.bottom >= 0 && bounds.top <= window.innerHeight && bounds.right >= 0 && bounds.left <= window.innerWidth;
  }
  function collect() {
    const root = document.body;
    if (!root) return { title: document.title, origin: location.origin, items: [], truncated: false };
    const entries = [];
    let truncated = false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (entries.length >= 700) { truncated = true; break; }
      const node = walker.currentNode;
      if (!node.parentElement || !isRendered(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const bounds = range.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const text = state.originals.get(node) ?? node.nodeValue ?? "";
      const clean = text.replace(/\s+/g, " ").trim();
      if (!isTranslatableText(clean)) continue;
      entries.push({ type: "text", node, text, tag: node.parentElement.tagName || "TEXT", inViewport: isInViewport(bounds) });
    }
    for (const element of root.querySelectorAll("[placeholder], [aria-label], [title]")) {
      if (entries.length >= 700) { truncated = true; break; }
      if (!isRendered(element)) continue;
      const elBounds = element.getBoundingClientRect();
      const inViewport = isInViewport(elBounds);
      for (const attribute of ["placeholder", "aria-label", "title"]) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const original = state.attributes.get(element)?.get(attribute) ?? current;
        const clean = original.replace(/\s+/g, " ").trim();
        if (!isTranslatableText(clean)) continue;
        entries.push({ type: "attribute", node: element, attribute, text: original, tag: element.tagName, inViewport });
        if (entries.length >= 700) { truncated = true; break; }
      }
    }
    state.nodes.clear();
    const items = entries.slice(0, 700).map((entry, index) => {
      const id = `t${index}`;
      state.nodes.set(id, entry);
      return { id, text: entry.text.trim().slice(0, 600), tag: entry.tag, kind: entry.type === "attribute" ? entry.attribute : "text", inViewport: Boolean(entry.inViewport) };
    });
    return { title: document.title, origin: location.origin, items, truncated };
  }
  function removeMarkers() {
    for (const marker of state.markers) marker.remove();
    state.markers.clear();
  }
  function removeMarkerFor(id) {
    for (const marker of Array.from(state.markers)) {
      if (marker.getAttribute("data-pipoca-for") === id) { marker.remove(); state.markers.delete(marker); }
    }
  }
  function addMarker(entry, translation, explanation, id) {
    if (!explanation || !entry.node.parentNode) return;
    const marker = document.createElement("span");
    marker.className = "pipoca-annotation-marker";
    marker.setAttribute("data-pipoca-ui", "true");
    marker.setAttribute("data-pipoca-for", id);
    marker.setAttribute("aria-label", "Anotação da Pipoca: clique para ler");
    marker.title = explanation.slice(0, 320);
    marker.textContent = "i";
    marker.style.cssText = "display:inline-grid;place-items:center;width:15px;height:15px;margin:0 0 0 3px;border:1px solid #d9a63e;border-radius:50%;background:#fff6d9;color:#805814;font:700 10px/1 system-ui,sans-serif;vertical-align:super;cursor:help;box-shadow:0 1px 3px #0002;";
    const notify = (event) => {
      event.preventDefault(); event.stopPropagation();
      try { chrome.runtime.sendMessage({ type: "pipoca:annotation-click", annotation: { text: translation.slice(0, 220), explanation: explanation.slice(0, 600) } }).catch(() => {}); } catch {}
    };
    marker.addEventListener("click", notify);
    const anchor = entry.node;
    anchor.parentNode.insertBefore(marker, anchor.nextSibling);
    state.markers.add(marker);
  }
  function apply(translations) {
    let changed = 0;
    for (const item of translations || []) {
      const entry = state.nodes.get(item.id);
      if (!entry || typeof item.text !== "string") continue;
      removeMarkerFor(item.id);
      if (entry.type === "text") {
        const node = entry.node;
        if (!state.originals.has(node)) state.originals.set(node, node.nodeValue);
        const original = state.originals.get(node) || "";
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        node.nodeValue = `${leading}${item.text.trim()}${trailing}`;
      } else {
        let originals = state.attributes.get(entry.node);
        if (!originals) { originals = new Map(); state.attributes.set(entry.node, originals); }
        if (!originals.has(entry.attribute)) originals.set(entry.attribute, entry.node.getAttribute(entry.attribute) || "");
        entry.node.setAttribute(entry.attribute, item.text.trim());
      }
      addMarker(entry, item.text.trim(), String(item.explanation || ""), item.id);
      changed += 1;
    }
    return { changed };
  }
  function restore() {
    let restored = 0;
    removeMarkers();
    for (const [node, original] of state.originals.entries()) {
      if (node.isConnected) { node.nodeValue = original; restored += 1; }
    }
    for (const [element, originals] of state.attributes.entries()) {
      if (!element.isConnected) continue;
      for (const [name, value] of originals.entries()) { element.setAttribute(name, value); restored += 1; }
    }
    state.originals.clear(); state.attributes.clear(); state.nodes.clear();
    return { restored };
  }
  state.listener = (message, _sender, sendResponse) => {
    if (message?.type === "pipoca:collect-page-text-v2") { sendResponse(collect()); return true; }
    if (message?.type === "pipoca:apply-page-translations-v2") { sendResponse(apply(message.translations)); return true; }
    if (message?.type === "pipoca:restore-page-translations-v2") { sendResponse(restore()); return true; }
  };
  chrome.runtime.onMessage.addListener(state.listener);
})();
