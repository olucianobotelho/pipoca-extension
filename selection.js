(() => {
  if (window.__pipocaSelectionInstalled) return;
  window.__pipocaSelectionInstalled = true;
  const overlayId = "__pipoca_area_selector__";
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "pipoca:begin-selection") return;
    document.getElementById(overlayId)?.remove();
    const overlay = document.createElement("div");
    overlay.id = overlayId;
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "crosshair", background: "rgba(18,35,28,.22)", touchAction: "none" });
    const hint = document.createElement("div");
    hint.textContent = "Arraste para selecionar a área · Esc cancela";
    Object.assign(hint.style, { position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", padding: "9px 13px", borderRadius: "999px", background: "#174c38", color: "white", font: "600 13px system-ui", boxShadow: "0 4px 20px #0004", pointerEvents: "none" });
    const box = document.createElement("div");
    Object.assign(box.style, { position: "fixed", display: "none", border: "2px solid #f5b85b", background: "rgba(245,184,91,.12)", boxShadow: "0 0 0 99999px rgba(18,35,28,.10)", pointerEvents: "none" });
    overlay.append(hint, box);
    document.documentElement.append(overlay);
    let startX = 0, startY = 0, dragging = false;
    const finish = (rect) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      chrome.runtime.sendMessage({ type: "pipoca:selection-complete", rect, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === hint) return;
      dragging = true; startX = event.clientX; startY = event.clientY;
      box.style.display = "block"; box.style.left = `${startX}px`; box.style.top = `${startY}px`; box.style.width = "0"; box.style.height = "0";
      event.preventDefault(); event.stopPropagation();
    }, true);
    overlay.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const left = Math.min(startX, event.clientX), top = Math.min(startY, event.clientY);
      box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${Math.abs(event.clientX - startX)}px`; box.style.height = `${Math.abs(event.clientY - startY)}px`;
      event.preventDefault(); event.stopPropagation();
    }, true);
    overlay.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      const rect = { x: Math.min(startX, event.clientX), y: Math.min(startY, event.clientY), width: Math.abs(event.clientX - startX), height: Math.abs(event.clientY - startY) };
      if (rect.width < 8 || rect.height < 8) { finish(null); return; }
      finish(rect);
      event.preventDefault(); event.stopPropagation();
    }, true);
    sendResponse({ ok: true });
    return true;
  });
})();
