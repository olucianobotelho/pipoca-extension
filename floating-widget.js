(() => {
  if (window.__pipocaFloatingWidget?.version === 7) return;
  if (window.__pipocaFloatingWidget?.dispose) window.__pipocaFloatingWidget.dispose();

  const SPRITES = {
    flowIdle: chrome.runtime.getURL("assets/pipoca-flow-idle.png"),
    sleep: chrome.runtime.getURL("assets/pipoca-sleep-128.png"),
    cheer: chrome.runtime.getURL("assets/pipoca-cheer-128.png"),
    linen: chrome.runtime.getURL("assets/bg-linen-tile.png")
  };

  const SVG = {
    plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    chevLeft: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    play: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
    pause: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    stop: `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`
  };

  const host = document.createElement("div");
  host.id = "pipoca-floating-host";
  host.setAttribute("data-pipoca-ui", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .shell {
        position: fixed; z-index: 2147483647; right: 0; top: 180px;
        font: 12px/1.35 Inter, system-ui, -apple-system, sans-serif; user-select: none;
      }
      .widget {
        width: min(296px, calc(100vw - 16px)); box-sizing: border-box; padding: 10px 11px;
        border: 1.5px solid #dfd3ba; border-right: 0; border-radius: 18px 0 0 18px;
        color: #2a3a2f;
        background-color: #fdf7eb;
        background-image: url("${SPRITES.linen}");
        background-repeat: repeat;
        background-size: 200px 200px;
        box-shadow: -3px 8px 26px rgba(42, 34, 18, 0.18);
        transition: opacity 0.18s ease, border-radius 0.18s ease;
      }
      .shell.free .widget {
        border-right: 1.5px solid #dfd3ba; border-radius: 18px;
        box-shadow: 0 10px 28px rgba(42, 34, 18, 0.20);
      }
      .shell.docked .widget { display: none; }

      .dock-tab {
        display: none; position: relative; align-items: center; justify-content: flex-end; gap: 2px;
        padding: 2px 2px 2px 4px; margin: 0; border: 0; background: transparent;
        cursor: pointer; overflow: visible; touch-action: none;
      }
      .shell.docked .dock-tab { display: flex; }
      .dock-pill {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        width: 18px; height: 42px;
        border: 1.5px solid #dfd3ba; border-right: 0; border-radius: 11px 0 0 11px;
        background: #fffdf8; color: #245b40;
        box-shadow: -2px 4px 12px rgba(42, 34, 18, 0.15);
        transition: width 0.18s ease, background 0.15s ease;
      }
      .dock-tab:hover .dock-pill { width: 24px; background: #f5efe1; }
      .dock-dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa79f; }
      .dock-dot.running { background: #245b40; box-shadow: 0 0 0 3px rgba(36, 91, 64, 0.18); }
      .dock-dot.paused { background: #e4a12a; }
      .dock-arrow { display: inline-flex; color: #245b40; }

      .dock-tooltip, .hide-tooltip {
        position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%);
        padding: 5px 9px; border-radius: 7px; background: #202923; color: #ffffff;
        font-size: 11px; font-weight: 600; white-space: nowrap; pointer-events: none;
        opacity: 0; transition: opacity 0.15s ease;
      }
      .hide-tooltip { top: calc(100% + 6px); right: 0; transform: none; }
      .dock-tab:hover .dock-tooltip { opacity: 1; }
      .collapse-wrap:hover .hide-tooltip { opacity: 1; }

      .top { display: flex; align-items: center; gap: 7px; cursor: grab; touch-action: none; }
      .top:active { cursor: grabbing; }

      .mascot-wrap {
        position: relative; width: 46px; height: 46px; flex: 0 0 46px;
        display: grid; place-items: center; overflow: visible;
      }
      .dock-mascot { width: 54px; height: 54px; flex: 0 0 54px; }

      .mascot-sprite {
        width: 100%; height: 100%; pointer-events: none;
        background-image: url("${SPRITES.flowIdle}");
        background-repeat: no-repeat;
        background-size: 2400% 100%;
        background-position: 0% 0%;
        animation: pipocaFlow24 2.4s steps(23) infinite;
      }
      .mascot-wrap.running .mascot-sprite {
        animation: pipocaFlow24 1.9s steps(23) infinite;
      }
      .mascot-wrap.celebrating .mascot-sprite {
        background-image: url("${SPRITES.cheer}");
        background-size: contain;
        background-position: center;
        animation: none;
      }
      .mascot-wrap.paused .mascot-sprite {
        background-image: url("${SPRITES.sleep}");
        background-size: contain;
        background-position: center;
        animation: none;
      }

      .name { min-width: 0; flex: 1; }
      .name strong { display: block; overflow: hidden; color: #2a3a2f; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .status { display: block; color: #6c7c70; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      .top-btns { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
      .collapse-wrap { position: relative; }

      button.icon-btn {
        width: 28px; min-height: 28px; flex: 0 0 28px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border: 1.5px solid #e5dcca; border-radius: 9px;
        color: #245b40; background: #fffdf8; box-shadow: 0 1px 0 #ebe1ce;
      }
      button.icon-btn:hover { background: #f5efe1; }
      button.icon-btn.collapse { color: #54665a; }

      .numbers {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        margin: 8px 0; padding: 8px 10px;
        border: 1px solid #e7decb; border-radius: 12px; background: #fffdf8;
      }
      .time { color: #2a3a2f; font: 800 18px/1 ui-monospace, SFMono-Regular, Consolas, monospace; font-variant-numeric: tabular-nums; }
      .earn {
        text-align: right; cursor: pointer; perspective: 420px; padding: 2px 5px; margin: -2px -5px;
        border-radius: 8px;
      }
      .earn:hover { background: #f5efe1; }
      .earn small { display: block; color: #6c7c70; font-size: 8px; }
      .earn strong {
        display: block; color: #245b40; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums;
        transform-style: preserve-3d; backface-visibility: hidden;
        transition: transform 0.16s ease, color 0.16s ease;
      }
      .earn.brl strong { color: #16687a; }
      .earn.flipping strong { transform: rotateX(90deg) scale(0.95); }

      .actions { display: flex; gap: 6px; }
      button.act-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        min-height: 29px; flex: 1; padding: 0 10px;
        border: 1.5px solid #e5dcca; border-radius: 9px;
        color: #395041; background: #fffdf8; box-shadow: 0 2px 0 #ebe1ce;
        font: 700 10px Inter, system-ui, sans-serif; cursor: pointer;
      }
      button.act-btn:hover:not(:disabled) { background: #f5efe1; }
      button.act-btn:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 1px 0 #ebe1ce; }
      button.act-btn.primary { border-color: #1a4731; color: #ffffff; background: #245b40; box-shadow: 0 2px 0 #163b29; }
      button.act-btn.primary:hover:not(:disabled) { background: #1d4a34; }
      button.act-btn.stop { flex: 0 0 74px; color: #9c382c; background: #fdf0ed; border-color: #eed2cc; }
      button.act-btn:disabled { opacity: 0.5; cursor: default; }
      .error { display: none; margin-top: 6px; color: #9c382c; font-size: 9px; }

      @keyframes pipocaFlow24 {
        from { background-position: 0% 0%; }
        to { background-position: 100% 0%; }
      }
      @media (max-width: 360px) { .widget { width: min(266px, calc(100vw - 12px)); } }
    </style>

    <div class="shell">
      <button class="dock-tab" type="button" aria-label="Mostrar Pipoca">
        <span class="mascot-wrap dock-mascot">
          <span class="mascot-sprite" aria-hidden="true"></span>
        </span>
        <span class="dock-pill">
          <span class="dock-dot"></span>
          <span class="dock-arrow" aria-hidden="true">${SVG.chevLeft}</span>
        </span>
        <span class="dock-tooltip">Mostrar Pipoca</span>
      </button>

      <section class="widget" role="status" aria-label="Cronômetro Pipoca">
        <div class="top" title="Arraste para mover · encoste na borda direita para fixar">
          <span class="mascot-wrap card-mascot">
            <span class="mascot-sprite" aria-hidden="true"></span>
          </span>
          <span class="name"><strong class="project">Projeto</strong><small class="status">PRONTO</small></span>
          <div class="top-btns">
            <button class="icon-btn expand" type="button" title="Abrir painel da Pipoca" aria-label="Abrir Pipoca">${SVG.plus}</button>
            <div class="collapse-wrap">
              <button class="icon-btn collapse" type="button" aria-label="Ocultar controles">${SVG.chevRight}</button>
              <span class="hide-tooltip">Ocultar controles</span>
            </div>
          </div>
        </div>
        <div class="numbers">
          <span class="time">00:00:00</span>
          <span class="earn" role="button" tabindex="0" title="Clique para alternar US$ ↔ R$ em tempo real">
            <small class="earn-label">Você já ganhou</small>
            <strong class="earn-value">US$ 0,00</strong>
          </span>
        </div>
        <div class="actions"><button class="act-btn primary toggle">${SVG.pause}<span>Pausar</span></button><button class="act-btn stop">${SVG.stop}<span>Parar</span></button></div>
        <div class="error" role="alert"></div>
      </section>
    </div>`;
  document.documentElement.append(host);

  const shell = shadow.querySelector(".shell");
  const dockTab = shadow.querySelector(".dock-tab");
  const dockDot = shadow.querySelector(".dock-dot");
  const card = shadow.querySelector(".widget");
  const dragHandle = shadow.querySelector(".top");
  const mascotWraps = Array.from(shadow.querySelectorAll(".mascot-wrap"));
  const projectNode = shadow.querySelector(".project");
  const statusNode = shadow.querySelector(".status");
  const timeNode = shadow.querySelector(".time");
  const earnBox = shadow.querySelector(".earn");
  const earnLabel = shadow.querySelector(".earn-label");
  const earnNode = shadow.querySelector(".earn-value");
  const toggleButton = shadow.querySelector(".toggle");
  const stopButton = shadow.querySelector(".stop");
  const expandButton = shadow.querySelector(".expand");
  const collapseButton = shadow.querySelector(".collapse");
  const errorNode = shadow.querySelector(".error");

  let timer = null;
  let celebrateTimer = null;
  let isCelebrating = false;
  let savedTimer = null;
  let exchangeRate = 5.80;
  let widgetState = { docked: false, side: "right", top: null, left: null, currencyFlip: false };
  let drag = null;
  let disposed = false;

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function formatMoney(value, currency) {
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
    catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
  }
  function liveElapsed(at = Date.now()) {
    if (!savedTimer) return 0;
    return Math.max(0, Number(savedTimer.accumulatedMs || 0) + (savedTimer.state === "running" && savedTimer.runningSince ? Math.max(0, at - savedTimer.runningSince) : 0));
  }

  function updateMascotSprite() {
    const state = savedTimer?.state || "stopped";
    const running = state === "running" && !isCelebrating;
    const paused = state === "paused" && !isCelebrating;
    for (const wrap of mascotWraps) {
      wrap.classList.toggle("running", running);
      wrap.classList.toggle("paused", paused);
      wrap.classList.toggle("celebrating", isCelebrating);
    }
    dockDot.classList.toggle("running", state === "running");
    dockDot.classList.toggle("paused", state === "paused");
  }

  function triggerCelebration() {
    isCelebrating = true;
    updateMascotSprite();
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      isCelebrating = false;
      updateMascotSprite();
    }, 2800);
  }

  function render() {
    updateMascotSprite();
    if (!savedTimer) {
      projectNode.textContent = "Nenhum projeto ativo";
      statusNode.textContent = "PRONTO";
      timeNode.textContent = "00:00:00";
      earnLabel.textContent = "Você já ganhou";
      earnNode.textContent = "—";
      earnBox.classList.remove("brl");
      toggleButton.disabled = true;
      stopButton.disabled = true;
      return;
    }
    const elapsedMs = liveElapsed();
    const rate = Number(savedTimer.rate || 0);
    const isFree = rate <= 0;
    const baseEarned = rate * elapsedMs / 3600000;
    const baseCurrency = savedTimer.currency || "USD";
    let displayValue = baseEarned;
    let displayCurrency = baseCurrency;

    if (!isFree && widgetState.currencyFlip && exchangeRate > 0) {
      if (baseCurrency === "USD") { displayValue = baseEarned * exchangeRate; displayCurrency = "BRL"; }
      else if (baseCurrency === "BRL") { displayValue = baseEarned / exchangeRate; displayCurrency = "USD"; }
    }

    earnBox.classList.toggle("brl", !isFree && displayCurrency === "BRL");
    earnBox.style.cursor = isFree ? "default" : "pointer";
    earnLabel.textContent = isFree
      ? "Modo foco"
      : widgetState.currencyFlip
        ? `${displayCurrency} (cot. ${exchangeRate.toFixed(2).replace(".", ",")}) ⇄`
        : "Você já ganhou ⇄";
    projectNode.textContent = savedTimer.projectName || "Projeto";
    statusNode.textContent = savedTimer.state === "running" ? "RODANDO" : savedTimer.state === "paused" ? "PAUSADO" : "ENCERRADO";
    timeNode.textContent = formatDuration(elapsedMs);
    earnNode.textContent = isFree ? "Sem valor" : formatMoney(displayValue, displayCurrency);
    toggleButton.innerHTML = savedTimer.state === "running"
      ? `${SVG.pause}<span>Pausar</span>`
      : savedTimer.state === "paused"
        ? `${SVG.play}<span>Retomar</span>`
        : `${SVG.play}<span>Continuar</span>`;
    toggleButton.disabled = false;
    stopButton.disabled = savedTimer.state === "stopped";
  }

  function applyLayout() {
    shell.classList.toggle("docked", Boolean(widgetState.docked));
    const rect = shell.getBoundingClientRect();
    const maxTop = Math.max(8, innerHeight - Math.max(rect.height || 120, 60) - 8);
    const defaultTop = Math.max(16, Math.round(innerHeight * 0.42));
    const top = Math.max(8, Math.min(Number.isFinite(widgetState.top) ? widgetState.top : defaultTop, maxTop));
    widgetState.top = top;
    shell.style.top = `${top}px`;

    if (widgetState.docked || widgetState.side === "right" || !Number.isFinite(widgetState.left)) {
      shell.classList.remove("free");
      shell.style.left = "auto";
      shell.style.right = "0px";
    } else {
      shell.classList.add("free");
      const maxLeft = Math.max(8, innerWidth - (card.offsetWidth || 296) - 8);
      const clampedLeft = Math.max(8, Math.min(widgetState.left, maxLeft));
      widgetState.left = clampedLeft;
      shell.style.left = `${clampedLeft}px`;
      shell.style.right = "auto";
    }
  }

  function saveState() {
    chrome.runtime.sendMessage({ type: "pipoca:widget-save-state", state: widgetState }).catch(() => {});
  }
  function setDocked(nextDocked) {
    widgetState.docked = Boolean(nextDocked);
    if (widgetState.docked) widgetState.side = "right";
    applyLayout();
    saveState();
  }
  function flipCurrency() {
    if (!savedTimer || Number(savedTimer.rate || 0) <= 0 || earnBox.classList.contains("flipping")) return;
    earnBox.classList.add("flipping");
    setTimeout(() => {
      widgetState.currencyFlip = !widgetState.currencyFlip;
      render();
      earnBox.classList.remove("flipping");
      saveState();
    }, 155);
  }

  async function sendControl(action) {
    if (!savedTimer?.projectId || !savedTimer?.sessionId) return;
    toggleButton.disabled = true;
    stopButton.disabled = true;
    errorNode.style.display = "none";
    try {
      const response = await chrome.runtime.sendMessage({ type: "pipoca:timer-control", projectId: savedTimer.projectId, sessionId: savedTimer.sessionId, action });
      if (!response?.ok) throw new Error(response?.error || "Não consegui atualizar o cronômetro.");
      savedTimer = response.timer;
      render();
    } catch (error) {
      errorNode.textContent = error.message || "Não consegui falar com a extensão.";
      errorNode.style.display = "block";
      render();
    }
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type === "pipoca:celebrate") { triggerCelebration(); sendResponse?.({ ok: true }); return; }
    if (message?.type !== "pipoca:floating-widget-update") return;
    if (message.enabled === false) { sendResponse({ pipocaWidget: true, version: 7 }); dispose(); return; }
    savedTimer = message.timer || null;
    if (Number(message.exchangeRate?.rate) > 0) exchangeRate = Number(message.exchangeRate.rate);
    if (message.widgetState && typeof message.widgetState === "object") {
      widgetState = { ...widgetState, ...message.widgetState };
      applyLayout();
    }
    errorNode.style.display = "none";
    render();
    sendResponse({ pipocaWidget: true, version: 7 });
  }

  function onCardPointerDown(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = shell.getBoundingClientRect();
    drag = { mode: "card", x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false, pointerId: event.pointerId };
    dragHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onDockPointerDown(event) {
    if (event.button !== 0) return;
    const rect = shell.getBoundingClientRect();
    drag = { mode: "dock", x: event.clientX, y: event.clientY, top: rect.top, moved: false, pointerId: event.pointerId };
    dockTab.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === "dock") {
      widgetState.top = drag.top + dy;
      applyLayout();
    } else {
      const nextLeft = drag.left + dx;
      const distRight = innerWidth - (nextLeft + (card.offsetWidth || 296));
      widgetState.top = drag.top + dy;
      if (distRight <= 26) { widgetState.side = "right"; widgetState.left = null; }
      else { widgetState.side = "free"; widgetState.left = nextLeft; }
      applyLayout();
    }
  }
  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const wasDockClick = drag.mode === "dock" && !drag.moved;
    const wasMoved = drag.moved;
    drag = null;
    if (wasDockClick) setDocked(false);
    else if (wasMoved) saveState();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    clearTimeout(celebrateTimer);
    chrome.runtime.onMessage.removeListener(onMessage);
    window.removeEventListener("resize", applyLayout);
    host.remove();
    window.__pipocaFloatingWidget = null;
  }

  toggleButton.addEventListener("click", () => sendControl(savedTimer?.state === "running" ? "pause" : "resume"));
  stopButton.addEventListener("click", () => sendControl("stop"));
  collapseButton.addEventListener("click", () => setDocked(true));
  earnBox.addEventListener("click", flipCurrency);
  earnBox.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flipCurrency(); } });
  expandButton.addEventListener("click", async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: "pipoca:open-panel", expand: true });
      if (!result?.ok) throw new Error(result?.error || "Não consegui abrir o painel.");
    } catch {
      errorNode.textContent = "Clique no ícone da Pipoca na barra do navegador para abrir o painel.";
      errorNode.style.display = "block";
    }
  });
  dragHandle.addEventListener("pointerdown", onCardPointerDown);
  dragHandle.addEventListener("pointermove", onPointerMove);
  dragHandle.addEventListener("pointerup", onPointerUp);
  dragHandle.addEventListener("pointercancel", onPointerUp);
  dockTab.addEventListener("pointerdown", onDockPointerDown);
  dockTab.addEventListener("pointermove", onPointerMove);
  dockTab.addEventListener("pointerup", onPointerUp);
  dockTab.addEventListener("pointercancel", onPointerUp);

  chrome.runtime.onMessage.addListener(onMessage);
  window.addEventListener("resize", applyLayout);
  timer = setInterval(render, 250);
  window.__pipocaFloatingWidget = { version: 7, dispose };

  chrome.runtime.sendMessage({ type: "pipoca:widget-get-state" }).then((res) => {
    if (disposed) return;
    if (res?.state) widgetState = { ...widgetState, ...res.state };
    applyLayout();
    render();
  }).catch(() => applyLayout());
  chrome.runtime.sendMessage({ type: "pipoca:get-exchange-rate" }).then((res) => {
    if (!disposed && Number(res?.rate) > 0) { exchangeRate = Number(res.rate); render(); }
  }).catch(() => {});
  render();
})();
