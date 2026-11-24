(() => {
  if (window.__pipocaSelectionInstalled) return;
  window.__pipocaSelectionInstalled = true;
  const overlayId = "__pipoca_area_selector__";
  let activeCleanup = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "pipoca:cancel-selection") {
      if (activeCleanup) activeCleanup();
      else document.getElementById(overlayId)?.remove();
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type !== "pipoca:begin-selection") return;
    if (activeCleanup) activeCleanup();
    document.getElementById(overlayId)?.remove();

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.tabIndex = -1;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(18,35,28,.22)",
      touchAction: "none",
      outline: "none"
    });

    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      padding: "7px 9px 7px 14px",
      borderRadius: "999px",
      background: "#174c38",
      color: "white",
      font: "600 13px system-ui, sans-serif",
      boxShadow: "0 4px 20px #0004",
      pointerEvents: "auto",
      cursor: "default"
    });
    const hintText = document.createElement("span");
    hintText.textContent = "Arraste para selecionar a área · Esc ou botão direito cancela";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    Object.assign(cancelBtn.style, {
      border: "0",
      borderRadius: "999px",
      padding: "4px 10px",
      background: "rgba(255,255,255,0.2)",
      color: "white",
      font: "600 12px system-ui, sans-serif",
      cursor: "pointer"
    });
    hint.append(hintText, cancelBtn);

    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      display: "none",
      border: "2px solid #f5b85b",
      background: "rgba(245,184,91,.12)",
      boxShadow: "0 0 0 99999px rgba(18,35,28,.10)",
      pointerEvents: "none"
    });
    overlay.append(hint, box);
    document.documentElement.append(overlay);
    overlay.focus({ preventScroll: true });

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onKey, true);
      if (activeCleanup === cleanup) activeCleanup = null;
    };

    const finish = (rect) => {
      cleanup();
      chrome.runtime.sendMessage({
        type: "pipoca:selection-complete",
        rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      });
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    };

    activeCleanup = cleanup;
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onKey, true);

    cancelBtn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    }, true);

    overlay.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    }, true);

    overlay.addEventListener("pointerdown", (event) => {
      if (hint.contains(event.target)) return;
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      box.style.display = "block";
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0";
      box.style.height = "0";
      event.preventDefault();
      event.stopPropagation();
    }, true);

    overlay.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const left = Math.min(startX, event.clientX);
      const top = Math.min(startY, event.clientY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(event.clientX - startX)}px`;
      box.style.height = `${Math.abs(event.clientY - startY)}px`;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    overlay.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      const rect = {
        x: Math.min(startX, event.clientX),
        y: Math.min(startY, event.clientY),
        width: Math.abs(event.clientX - startX),
        height: Math.abs(event.clientY - startY)
      };
      if (rect.width < 8 || rect.height < 8) {
        finish(null);
        return;
      }
      finish(rect);
      event.preventDefault();
      event.stopPropagation();
    }, true);

    sendResponse({ ok: true });
    return true;
  });
})();
