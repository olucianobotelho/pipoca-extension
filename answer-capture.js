(() => {
  const ALLOWED_INPUT_TYPES = new Set(["", "text", "search", "url", "email", "tel", "number"]);

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest("[data-pipoca-ui]")) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function cleanText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getLabel(el, index) {
    if (el.id) {
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
      const linked = document.querySelector(`label[for="${escapedId}"]`);
      if (linked) {
        const text = cleanText(linked.innerText || linked.textContent);
        if (text) return text.slice(0, 140);
      }
    }

    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input, textarea, select, [contenteditable], [role='textbox']").forEach((n) => n.remove());
      const text = cleanText(clone.innerText || clone.textContent);
      if (text) return text.slice(0, 140);
    }

    const ariaLabel = cleanText(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel.slice(0, 140);

    const labelledBy = cleanText(el.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => {
        const target = document.getElementById(id);
        return target ? cleanText(target.innerText || target.textContent) : "";
      }).filter(Boolean);
      if (parts.length) return parts.join(" ").slice(0, 140);
    }

    const placeholder = cleanText(el.getAttribute("placeholder"));
    if (placeholder) return placeholder.slice(0, 140);

    let container = el.parentElement;
    for (let depth = 0; depth < 4 && container && container !== document.body; depth += 1) {
      const candidates = container.querySelectorAll("label, legend, h1, h2, h3, h4, h5, h6, p");
      for (const candidate of candidates) {
        if (candidate === el || candidate.contains(el) || el.contains(candidate)) continue;
        const text = cleanText(candidate.innerText || candidate.textContent);
        if (text && text.length >= 2) return text.slice(0, 140);
      }
      container = container.parentElement;
    }

    const name = cleanText(el.getAttribute("name"));
    if (name) return name.slice(0, 140);

    return `Campo de texto ${index + 1}`;
  }

  function extractValue(el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return String(el.value || "");
    return String(el.innerText || el.textContent || "");
  }

  const candidates = Array.from(
    document.querySelectorAll('textarea, input, [contenteditable="true"], [contenteditable=""], [role="textbox"]')
  );

  const capturedElements = [];
  const fields = [];

  for (const el of candidates) {
    if (!isVisible(el)) continue;

    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase().trim();
      if (!ALLOWED_INPUT_TYPES.has(type)) continue;
    }

    if (capturedElements.some((parent) => parent.contains(el))) continue;

    const value = extractValue(el);
    if (!value.trim()) continue;

    capturedElements.push(el);
    const label = getLabel(el, fields.length);
    fields.push({
      label,
      text: value.trim().slice(0, 20000),
      tag: el.tagName.toLowerCase()
    });
  }

  return {
    title: cleanText(document.title) || location.hostname || "Página sem título",
    url: location.href,
    capturedAt: Date.now(),
    fields
  };
})();
