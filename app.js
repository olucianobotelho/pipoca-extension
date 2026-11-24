const FORMAT = "ritmo-project-tracker";
const VERSION = 1;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"]);
const $ = (selector) => document.querySelector(selector);
let projects = [];
let activeTab = "work";
let editingProjectId = null;
let pendingAttachments = [];
let toastTimer = null;
let floatingWidgetEnabled = false;
let floatingWidgetTabId = null;
let currentExchangeRate = { rate: 5.80, source: "fallback", isManual: false };
const flippedProjectCards = new Set();
let summaryFlipToBrl = false;
let soundMilestoneStep = 10;

async function refreshExchangeRate(force = false) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "pipoca:get-exchange-rate", force });
    if (res?.ok && Number(res.rate) > 0) {
      currentExchangeRate = res;
      render();
      if (floatingWidgetEnabled) syncFloatingWidget().catch(() => {});
    }
  } catch {}
  return currentExchangeRate;
}

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const makeId = () => crypto.randomUUID();
const now = () => Date.now();
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function safeHttpUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function compactUrlLabel(value) {
  try { return new URL(value).hostname.replace(/^www\./i, ""); } catch { return "link"; }
}
function plainNotesHtml(text) {
  const pattern = /https?:\/\/[^\s<>]+/gi;
  let result = "", start = 0;
  for (const match of String(text || "").matchAll(pattern)) {
    const index = match.index ?? 0, url = safeHttpUrl(match[0]);
    result += escapeHTML(String(text).slice(start, index)).replace(/\r?\n/g, "<br>");
    result += url ? `<a class="compact-link" data-url="${escapeHTML(url)}" title="Ctrl+clique para abrir">↗ ${escapeHTML(compactUrlLabel(url))}</a>` : escapeHTML(match[0]);
    start = index + match[0].length;
  }
  return result + escapeHTML(String(text || "").slice(start)).replace(/\r?\n/g, "<br>");
}
function sanitizeNoteHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const allowed = new Set(["BR", "DIV", "P", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI"]);
  const clean = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHTML(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName === "A") {
      const url = safeHttpUrl(node.getAttribute("data-url") || node.getAttribute("href") || "");
      if (!url) return Array.from(node.childNodes).map(clean).join("");
      const label = node.textContent.trim();
      const display = !label || label === url ? `↗ ${compactUrlLabel(url)}` : Array.from(node.childNodes).map(clean).join("");
      return `<a class="compact-link" data-url="${escapeHTML(url)}" title="Ctrl+clique para abrir">${display}</a>`;
    }
    const children = Array.from(node.childNodes).map(clean).join("");
    if (!allowed.has(node.tagName)) return children;
    return node.tagName === "BR" ? "<br>" : `<${node.tagName.toLowerCase()}>${children}</${node.tagName.toLowerCase()}>`;
  };
  return Array.from(doc.body.firstElementChild?.childNodes || []).map(clean).join("");
}
function savedNoteHtml(project) {
  return project.notesHtml ? sanitizeNoteHtml(project.notesHtml) : plainNotesHtml(project.notes || "");
}
const money = (amount, currency) => {
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0); }
  catch { return `${currency} ${Number(amount || 0).toFixed(2)}`; }
};
const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.floor((milliseconds || 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};
const formatDate = (timestamp) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
const formatShortDate = (timestamp) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));

function toast(message, isError = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", isError);
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 3200);
}
function allSessions(project) { return Array.isArray(project.sessions) ? project.sessions : []; }
function sessionElapsed(session, at = now()) {
  return Math.max(0, numeric(session.accumulatedMs) + (session.state === "running" && session.runningSince ? Math.max(0, at - session.runningSince) : 0));
}
function sessionEarned(session, at = now()) { return numeric(session.rate) * sessionElapsed(session, at) / 3600000; }
function projectElapsed(project, at = now()) { return allSessions(project).reduce((sum, session) => sum + sessionElapsed(session, at), 0); }
function projectEarned(project, currency = null, at = now()) {
  return allSessions(project).filter((session) => !currency || session.currency === currency).reduce((sum, session) => sum + sessionEarned(session, at), 0);
}
function currentSession(project) {
  const sessions = allSessions(project).slice().sort((a, b) => numeric(b.startAt) - numeric(a.startAt));
  return sessions.find((session) => session.state === "running") || sessions.find((session) => session.state === "paused") || sessions[0] || null;
}
function runningSession() {
  for (const project of projects) {
    if (project.deletedAt) continue;
    const session = allSessions(project).find((item) => item.state === "running");
    if (session) return { project, session };
  }
  return null;
}
function addSegment(session, endAt) {
  if (!session.runningSince) return;
  const startAt = numeric(session.runningSince);
  const safeEnd = Math.max(startAt, endAt);
  session.segments = Array.isArray(session.segments) ? session.segments : [];
  session.segments.push({ startAt, endAt: safeEnd });
  session.accumulatedMs = numeric(session.accumulatedMs) + (safeEnd - startAt);
  session.runningSince = null;
  session.updatedAt = safeEnd;
}
function pauseSession(session, at = now()) {
  if (session.state !== "running") return;
  addSegment(session, at);
  session.state = "paused";
  session.updatedAt = at;
}
function pauseOtherRunning(exceptSessionId = null, at = now()) {
  for (const project of projects) {
    for (const session of allSessions(project)) {
      if (session.state === "running" && session.id !== exceptSessionId) pauseSession(session, at);
    }
  }
}
function startNewSession(project, at = now(), alreadyWorkedMs = 0) {
  pauseOtherRunning(null, at);
  const backfill = Math.max(0, numeric(alreadyWorkedMs));
  const session = { id: makeId(), startAt: at - backfill, endAt: null, accumulatedMs: backfill, runningSince: at, state: "running", rate: numeric(project.rate), currency: project.currency, segments: backfill ? [{ startAt: at - backfill, endAt: at }] : [], updatedAt: at };
  project.sessions = allSessions(project);
  project.sessions.push(session);
  project.updatedAt = at;
  return session;
}
function resumeSession(project, session, at = now()) {
  pauseOtherRunning(session.id, at);
  session.state = "running";
  session.runningSince = at;
  session.endAt = null;
  session.updatedAt = at;
  project.updatedAt = at;
}
async function save() {
  await chrome.storage.local.set({ projects });
}

function floatingTimerSnapshot(at = now()) {
  const current = runningSession() || projects
    .filter((project) => !project.deletedAt)
    .map((project) => ({ project, session: currentSession(project) }))
    .filter((entry) => entry.session)
    .sort((left, right) => numeric(right.session.updatedAt || right.session.startAt) - numeric(left.session.updatedAt || left.session.startAt))[0] || null;
  if (!current) return null;
  return {
    projectId: current.project.id, projectName: current.project.name, sessionId: current.session.id,
    state: current.session.state, rate: numeric(current.session.rate), currency: current.session.currency,
    accumulatedMs: numeric(current.session.accumulatedMs), runningSince: numeric(current.session.runningSince),
    elapsedMs: sessionElapsed(current.session, at), earned: sessionEarned(current.session, at), updatedAt: at
  };
}
async function setFloatingWidgetEnabled(enabled) {
  floatingWidgetEnabled = Boolean(enabled);
  if (!floatingWidgetEnabled) {
    let oldTabId = floatingWidgetTabId;
    floatingWidgetTabId = null;
    if (oldTabId == null) {
      try { oldTabId = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id; } catch {}
    }
    if (oldTabId != null) { try { await chrome.tabs.sendMessage(oldTabId, { type: "pipoca:floating-widget-update", enabled: false }); } catch {} }
    return { ok: true };
  }
  return await syncFloatingWidget();
}
async function syncFloatingWidget() {
  if (!floatingWidgetEnabled) return { ok: false };
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (tab?.id == null) return { ok: false, error: "Não encontrei uma aba aberta para mostrar o cronômetro." };
  if (floatingWidgetTabId != null && floatingWidgetTabId !== tab.id) {
    try { await chrome.tabs.sendMessage(floatingWidgetTabId, { type: "pipoca:floating-widget-update", enabled: false }); } catch {}
  }
  floatingWidgetTabId = tab.id;
  const payload = { type: "pipoca:floating-widget-update", enabled: true, timer: floatingTimerSnapshot(), exchangeRate: currentExchangeRate };
  try {
    let response = null;
    try { response = await chrome.tabs.sendMessage(tab.id, payload); } catch {}
    if (!response?.pipocaWidget || response?.version !== 7) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["floating-widget.js"] });
      response = await chrome.tabs.sendMessage(tab.id, payload);
    }
    if (!response?.pipocaWidget) throw new Error("O cronômetro flutuante não respondeu.");
    return { ok: true, tabId: tab.id, windowId: tab.windowId };
  } catch (error) {
    return { ok: false, error: "Não consegui mostrar o cronômetro nesta página. Abra a Pipoca pelo ícone da extensão nesta aba e tente minimizar novamente." };
  }
}
chrome.tabs.onActivated?.addListener(() => { if (floatingWidgetEnabled) syncFloatingWidget().catch(() => {}); });
chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => { if (changeInfo.status === "complete" && floatingWidgetEnabled) syncFloatingWidget().catch(() => {}); });

function renderSummary() {
  const at = now();
  const activeProjects = projects.filter((project) => !project.deletedAt);
  const totalMs = activeProjects.reduce((sum, project) => sum + projectElapsed(project, at), 0);
  const totalHours = totalMs / 3600000;
  const sessionCount = activeProjects.reduce((sum, project) => sum + allSessions(project).length, 0);
  $("#summaryTime").textContent = formatDuration(totalMs);
  $("#summaryHoursLabel").textContent = `${totalHours.toFixed(1).replace(".", ",")} h · ${activeProjects.length} ${activeProjects.length === 1 ? "projeto" : "projetos"}`;

  const totals = { USD: 0, BRL: 0 };
  for (const project of activeProjects) {
    for (const session of allSessions(project)) {
      if (session.currency === "USD" || session.currency === "BRL") totals[session.currency] += sessionEarned(session, at);
    }
  }
  const rate = Number(currentExchangeRate?.rate) > 0 ? Number(currentExchangeRate.rate) : 5.80;
  const totalUsd = totals.USD + totals.BRL / rate;
  const totalBrl = totals.BRL + totals.USD * rate;
  const mainEl = $("#summaryEarnedMain");
  if (mainEl) {
    mainEl.textContent = summaryFlipToBrl ? money(totalBrl, "BRL") : money(totalUsd, "USD");
    mainEl.classList.toggle("brl", summaryFlipToBrl);
  }
  $("#summaryEarnTitle").textContent = summaryFlipToBrl ? `Ganhos · cot. ${rate.toFixed(2).replace(".", ",")}` : "Ganhos";
  $("#summaryEarnedSub").textContent = summaryFlipToBrl ? `↻ ${money(totalUsd, "USD")}` : `↻ ${money(totalBrl, "BRL")}`;

  const chips = ["USD", "BRL"].filter((currency) => totals[currency] > 0 || activeProjects.some((project) => allSessions(project).some((session) => session.currency === currency))).map((currency) => `<span class="currency-total">${currency}<strong>${escapeHTML(money(totals[currency], currency))}</strong></span>`);
  $("#currencyTotals").innerHTML = chips.length ? chips.join("") : `<span class="currency-total">Sem ganhos ainda</span>`;

  const activeRun = runningSession();
  const current = activeRun || activeProjects
    .map((project) => ({ project, session: currentSession(project) }))
    .filter((entry) => entry.session)
    .sort((left, right) => numeric(right.session.updatedAt || right.session.startAt) - numeric(left.session.updatedAt || left.session.startAt))[0] || null;
  const moodEl = $("#dashboardMood");
  const mascotEl = $("#summaryMascot");
  const statusPill = $("#dashboardStatusPill");
  if (mascotEl) {
    mascotEl.classList.toggle("running", Boolean(activeRun));
    mascotEl.classList.toggle("paused", !activeRun && current?.session?.state === "paused");
  }
  if (statusPill) {
    const isP = !activeRun && current?.session?.state === "paused";
    statusPill.className = `status-pill ${activeRun ? "" : isP ? "paused" : "stopped"}`.trim();
    statusPill.innerHTML = `<i class="status-dot"></i>${activeRun ? "Rodando" : isP ? "Pausado" : "Pronta"}`;
  }
  if (moodEl) {
    if (activeRun) moodEl.textContent = `Foco em ${activeRun.project.name}`;
    else if (totalUsd > 0) moodEl.textContent = `${sessionCount} ${sessionCount === 1 ? "sessão feita" : "sessões feitas"}`;
    else moodEl.textContent = "Pronta pra começar!";
  }

  const step = Math.max(1, Number(soundMilestoneStep) || 10);
  const progressBase = activeRun ? sessionEarned(activeRun.session, at) : totalUsd;
  const progressCurrency = activeRun ? activeRun.session.currency : "USD";
  const intoStep = progressBase % step;
  const pct = progressBase > 0 ? Math.min(100, Math.round((intoStep / step) * 100)) : 0;
  const remaining = Math.max(0, step - intoStep);
  const bar = $("#milestoneProgressBar");
  if (bar) bar.style.width = `${pct}%`;
  const progLabel = $("#milestoneProgressLabel");
  if (progLabel) progLabel.textContent = progressBase > 0 ? `Faltam ${money(remaining, progressCurrency)}` : `Meta ${money(step, "USD")}`;

  $("#compactProjectName").textContent = current?.project.name || "Nenhum projeto";
  $("#compactTimer").textContent = current ? formatDuration(sessionElapsed(current.session, at)) : "00:00:00";
  $("#compactEarnings").textContent = current ? money(sessionEarned(current.session, at), current.session.currency) : "—";
  $("#compactStatus").textContent = current?.session.state === "running" ? "RODANDO" : current?.session.state === "paused" ? "PAUSADO" : "ÚLTIMA SESSÃO";
}

const ICONS = {
  play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
  pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  stop: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`,
  save: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  details: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  restore: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
};

function cardEarnedData(project, at = now()) {
  const session = currentSession(project);
  const isRunning = session?.state === "running";
  const isPaused = session?.state === "paused";
  const displayMs = isRunning || isPaused ? sessionElapsed(session, at) : projectElapsed(project, at);
  const displayCurrency = isRunning || isPaused ? session.currency : (session?.currency || project.currency);
  const displayEarned = isRunning || isPaused ? sessionEarned(session, at) : projectEarned(project, displayCurrency, at);
  const isFlipped = flippedProjectCards.has(project.id);
  const rateValue = Number(currentExchangeRate?.rate) > 0 ? Number(currentExchangeRate.rate) : 5.80;
  let shownCurrency = displayCurrency;
  let shownEarned = displayEarned;
  if (isFlipped) {
    if (displayCurrency === "USD") { shownCurrency = "BRL"; shownEarned = displayEarned * rateValue; }
    else if (displayCurrency === "BRL") { shownCurrency = "USD"; shownEarned = displayEarned / rateValue; }
  }
  return { session, isRunning, isPaused, displayMs, displayCurrency, shownCurrency, shownEarned, isFlipped, rateValue };
}

function updateLiveTick() {
  renderSummary();
  const at = now();
  for (const project of projects) {
    const timeEl = document.querySelector(`[data-live-time="${CSS.escape(project.id)}"]`);
    const earnEl = document.querySelector(`[data-live-earn="${CSS.escape(project.id)}"]`);
    if (!timeEl && !earnEl) continue;
    const data = cardEarnedData(project, at);
    if (timeEl) timeEl.textContent = formatDuration(data.displayMs);
    if (earnEl) earnEl.textContent = money(data.shownEarned, data.shownCurrency);
  }
}

function renderCard(project, trash = false) {
  const data = cardEarnedData(project);
  const { session, isRunning, isPaused, displayMs, displayCurrency, shownCurrency, shownEarned, isFlipped, rateValue } = data;
  const statusText = isRunning ? "Rodando" : isPaused ? "Pausado" : trash ? "Na lixeira" : "Finalizado";
  const statusClass = isRunning ? "" : isPaused ? "paused" : trash ? "deleted" : "stopped";
  const cardRate = isRunning || isPaused ? session.rate : project.rate;
  let primaryAction = "";
  if (!trash) {
    if (isRunning) primaryAction = `<button class="secondary-button action-button" data-action="pause" data-project="${escapeHTML(project.id)}">${ICONS.pause}<span>Pausar</span></button><button class="primary-button action-button" data-action="finish" data-project="${escapeHTML(project.id)}">${ICONS.stop}<span>Parar</span></button>`;
    else if (isPaused) primaryAction = `<button class="primary-button action-button" data-action="resume" data-project="${escapeHTML(project.id)}">${ICONS.play}<span>Retomar</span></button><button class="secondary-button action-button" data-action="finish" data-project="${escapeHTML(project.id)}">${ICONS.stop}<span>Parar</span></button>`;
    else if (session && session.state === "stopped") primaryAction = `<button class="primary-button action-button" data-action="continue-last" data-project="${escapeHTML(project.id)}" title="Continuar sessão anterior de onde parou">${ICONS.play}<span>Continuar</span></button><button class="secondary-button action-button" data-action="start" data-project="${escapeHTML(project.id)}" title="Começar nova sessão zerada"><span>Nova</span></button>`;
    else primaryAction = `<button class="primary-button action-button" data-action="start" data-project="${escapeHTML(project.id)}">${ICONS.play}<span>Iniciar</span></button>`;
  } else {
    primaryAction = `<button class="secondary-button restore-button action-button" data-action="restore" data-project="${escapeHTML(project.id)}">${ICONS.restore}<span>Restaurar</span></button><span class="card-actions-spacer"></span><button class="secondary-button purge-button action-button" data-action="purge" data-project="${escapeHTML(project.id)}" title="Excluir definitivamente">${ICONS.trash}<span>Excluir</span></button>`;
  }
  const attachmentCount = Array.isArray(project.attachments) ? project.attachments.length : 0;
  const savedCount = Array.isArray(project.savedAnswers) ? project.savedAnswers.length : 0;
  const context = trash ? "" : `<span class="card-actions-spacer"></span><button class="secondary-button action-button icon-chip" data-action="capture-answers" data-project="${escapeHTML(project.id)}" title="Salvar respostas da aba">${ICONS.save}</button><button class="secondary-button action-button icon-chip" data-action="edit" data-project="${escapeHTML(project.id)}" title="Editar projeto" aria-label="Editar projeto">${ICONS.edit}</button><button class="secondary-button detail-button action-button icon-chip" data-action="details" data-project="${escapeHTML(project.id)}" title="Detalhes do projeto">${ICONS.details}</button><button class="secondary-button trash-button action-button icon-chip" data-action="delete" data-project="${escapeHTML(project.id)}" title="Mover para a lixeira" aria-label="Mover para a lixeira">${ICONS.trash}</button>`;
  const isFree = cardRate <= 0;
  const subParts = [isFree ? "Sem remuneração" : `${money(cardRate, displayCurrency)} / hora`];
  if (project.notes?.trim() || project.notesHtml?.trim()) subParts.push("notas");
  if (attachmentCount) subParts.push(`${attachmentCount} arquivo${attachmentCount > 1 ? "s" : ""}`);
  if (savedCount) subParts.push(`${savedCount} resp.`);
  const earnLabel = isFree
    ? "Modo foco"
    : isFlipped
      ? `${shownCurrency} (cot. ${rateValue.toFixed(2).replace(".", ",")})`
      : (isRunning || isPaused ? "Você já ganhou" : `Total ${displayCurrency}`);
  const earnBlock = isFree
    ? `<div class="metric-earn metric-free">Livre</div><div class="metric-rate">Sem valor</div>`
    : `<div class="metric-earn convertible${shownCurrency === "BRL" ? " brl" : ""}" data-live-earn="${escapeHTML(project.id)}" data-flip-project="${escapeHTML(project.id)}" title="Clique para girar e converter US$ ↔ R$">${escapeHTML(money(shownEarned, shownCurrency))}</div><div class="metric-rate">${escapeHTML(money(cardRate, displayCurrency))} / h</div>`;
  return `<article class="project-card">
    <div class="card-top"><div class="project-title-wrap"><h2 class="project-name">${escapeHTML(project.name)}</h2><div class="project-subtitle">${escapeHTML(subParts.join(" · "))}</div></div><span class="status-pill ${statusClass}"><i class="status-dot"></i>${statusText}</span></div>
    <div class="card-metrics"><div><div class="metric-label">${isRunning || isPaused ? "Sessão atual" : "Tempo total"}</div><div class="metric-time" data-live-time="${escapeHTML(project.id)}">${formatDuration(displayMs)}</div></div><div><div class="metric-label">${earnLabel}</div>${earnBlock}</div></div>
    <div class="card-actions">${primaryAction}${context}</div>
  </article>`;
}
function emptyState(title, message, icon = "◷") {
  return `<div class="empty-state"><div class="empty-illustration">${icon}</div><strong>${title}</strong><p>${message}</p></div>`;
}
function render() {
  renderSummary();
  const list = $("#projectList");
  let visible;
  if (activeTab === "trash") {
    visible = projects.filter((project) => Boolean(project.deletedAt)).sort((a, b) => numeric(b.updatedAt) - numeric(a.updatedAt));
    $("#sectionTitle").textContent = "Lixeira";
    if ($("#sectionHint")) $("#sectionHint").textContent = "Projetos apagados ficam guardados aqui.";
  } else if (activeTab === "history") {
    visible = projects.filter((project) => !project.deletedAt).sort((a, b) => numeric(b.updatedAt) - numeric(a.updatedAt));
    $("#sectionTitle").textContent = "Histórico";
    if ($("#sectionHint")) $("#sectionHint").textContent = "Cada sessão e cada centavo, no seu ritmo.";
  } else {
    visible = projects.filter((project) => !project.deletedAt && allSessions(project).some((session) => session.state === "running" || session.state === "paused")).sort((a, b) => numeric(b.updatedAt) - numeric(a.updatedAt));
    $("#sectionTitle").textContent = "Em foco";
    if ($("#sectionHint")) $("#sectionHint").textContent = "Um passo de cada vez.";
  }
  if (visible.length) {
    const trashBar = activeTab === "trash"
      ? `<div class="trash-toolbar"><span>${visible.length} ${visible.length === 1 ? "projeto na lixeira" : "projetos na lixeira"}</span><button class="secondary-button compact-btn purge-button action-button" data-action="empty-trash" data-project="">Esvaziar lixeira</button></div>`
      : "";
    list.innerHTML = trashBar + visible.map((project) => renderCard(project, activeTab === "trash")).join("");
  }
  else if (activeTab === "work") list.innerHTML = emptyState("Tudo pronto para começar?", "Crie um projeto, defina sua tarifa e acompanhe o tempo render valer.", "✦");
  else if (activeTab === "history") list.innerHTML = emptyState("Seu histórico começa aqui", "Crie seu primeiro projeto e as sessões ficam salvas neste navegador.", "◷");
  else list.innerHTML = emptyState("A lixeira está vazia", "Quando apagar um projeto, você ainda poderá restaurá-lo por aqui.", "⌁");
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  render();
  window.dispatchEvent(new Event("pipoca:tab-change"));
}
function openEditor(project = null, draft = null) {
  editingProjectId = draft?.projectId || project?.id || null;
  const editProject = projects.find((item) => item.id === editingProjectId) || project;
  const curSession = editProject ? currentSession(editProject) : null;
  const curMinutes = curSession ? Math.floor(sessionElapsed(curSession) / 60000) : 0;
  pendingAttachments = draft?.attachments ? draft.attachments.slice() : (editProject?.attachments ? editProject.attachments.slice() : []);
  $("#projectForm").dataset.projectId = editingProjectId || "";
  $("#formTitle").textContent = editProject ? "Editar projeto" : "Novo projeto";
  $("#saveProjectButton").innerHTML = editProject ? "Salvar alterações <span>✓</span>" : "Salvar e iniciar <span>↗</span>";
  $("#formFootnote").textContent = editProject ? "Alterações de tarifa e minutos também atualizam a sessão atual." : "O cronômetro começa assim que você salvar.";
  $("#projectName").value = draft?.name ?? editProject?.name ?? "";
  $("#hourlyRate").value = draft?.rate ?? (editProject ? String(editProject.rate) : "");
  $("#currency").value = draft?.currency || editProject?.currency || "USD";
  $("#backfillField").hidden = false;
  if (editProject) {
    $("#backfillLabel").innerHTML = 'Tempo da sessão atual <span class="optional">minutos · opcional</span>';
    $("#backfillHint").textContent = "Ajuste os minutos acumulados se precisar corrigir o tempo desta sessão.";
    $("#backfillMinutes").value = draft?.backfillMinutes ?? String(curMinutes);
    $("#backfillMinutes").dataset.initialMinutes = String(curMinutes);
  } else {
    $("#backfillLabel").innerHTML = 'Tempo já trabalhado <span class="optional">opcional · minutos</span>';
    $("#backfillHint").textContent = "Se você começou antes de abrir a Pipoca, inclua aqui os minutos já trabalhados.";
    $("#backfillMinutes").value = draft?.backfillMinutes ?? "0";
    $("#backfillMinutes").dataset.initialMinutes = "";
  }
  const noteEditor = $("#projectNotes");
  noteEditor.innerHTML = draft?.notesHtml ? sanitizeNoteHtml(draft.notesHtml) : savedNoteHtml(editProject || { notes: "" });
  noteEditor.dataset.empty = String(!noteEditor.textContent.trim());
  $("#attachmentInput").value = "";
  renderAttachmentChips();
  $("#editorDialog").showModal();
  window.dispatchEvent(new Event("pipoca:editor-open"));
  $("#projectName").focus();
}
function renderAttachmentChips() {
  $("#attachmentList").innerHTML = pendingAttachments.map((attachment) => `<span class="attachment-chip"><span>${escapeHTML(attachment.name)}</span><button type="button" data-remove-attachment="${escapeHTML(attachment.id)}" aria-label="Remover ${escapeHTML(attachment.name)}">×</button></span>`).join("");
  window.dispatchEvent(new Event("pipoca:draft-change"));
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Não consegui ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
async function handleAttachmentSelection(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (!ACCEPTED_TYPES.has(file.type)) { toast(`Formato não suportado: ${file.name}`, true); continue; }
    try {
      const dataUrl = await readFile(file);
      pendingAttachments.push({ id: makeId(), name: file.name, type: file.type, size: file.size, dataUrl, addedAt: now() });
    } catch (error) { toast(error.message || "Erro ao ler arquivo.", true); }
  }
  renderAttachmentChips();
}

function noteView(project) {
  const container = document.createElement("div");
  container.className = "note-box";
  container.innerHTML = savedNoteHtml(project);
  return container;
}
function openDetails(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  $("#detailsTitle").textContent = project.name;
  $("#detailsDialog").dataset.projectId = project.id;
  const sessions = allSessions(project).slice().sort((a, b) => numeric(b.startAt) - numeric(a.startAt));
  const main = document.createElement("div");
  main.className = "detail-summary";
  main.innerHTML = `<div class="detail-stat"><span>Tempo total</span><strong>${formatDuration(projectElapsed(project))}</strong></div><div class="detail-stat"><span>Ganhos totais · USD</span><strong>${escapeHTML(money(projectEarned(project, "USD"), "USD"))}</strong></div><div class="detail-stat"><span>Ganhos totais · BRL</span><strong>${escapeHTML(money(projectEarned(project, "BRL"), "BRL"))}</strong></div><div class="detail-stat"><span>Tarifa para próximas sessões</span><strong>${escapeHTML(money(project.rate, project.currency))} / h</strong></div>`;
  const body = $("#detailsBody");
  body.replaceChildren(main);
  const sessionHeading = document.createElement("div");
  sessionHeading.className = "details-section-title";
  sessionHeading.textContent = `Sessões (${sessions.length})`;
  body.append(sessionHeading);
  if (!sessions.length) {
    const none = document.createElement("div"); none.className = "session-info"; none.textContent = "Nenhuma sessão registrada."; body.append(none);
  }
  for (const session of sessions) {
    const row = document.createElement("div"); row.className = "session-row";
    const finished = session.state === "stopped" ? `Encerrada · ${formatDuration(sessionElapsed(session))}` : session.state === "paused" ? `Pausada · ${formatDuration(sessionElapsed(session))}` : `Rodando · ${formatDuration(sessionElapsed(session))}`;
    row.innerHTML = `<div><div class="session-date">${escapeHTML(formatDate(session.startAt))}</div><div class="session-info">${finished} · tarifa ${escapeHTML(money(session.rate, session.currency))}/h</div></div><div class="session-value">${escapeHTML(money(sessionEarned(session), session.currency))}</div>`;
    body.append(row);
  }
  if (project.notes?.trim() || project.notesHtml?.trim()) {
    const title = document.createElement("div"); title.className = "details-section-title"; title.textContent = "Anotações"; body.append(title);
    body.append(noteView(project));
  }
  if (project.attachments?.length) {
    const title = document.createElement("div"); title.className = "details-section-title"; title.textContent = "Arquivos anexados"; body.append(title);
    const grid = document.createElement("div"); grid.className = "attachment-grid";
    for (const attachment of project.attachments) {
      const link = document.createElement("a"); link.className = "attachment-preview"; link.href = attachment.dataUrl; link.download = attachment.name; link.target = "_blank"; link.rel = "noopener noreferrer"; link.title = `Abrir ${attachment.name}`;
      if (attachment.type.startsWith("image/")) { const image = document.createElement("img"); image.src = attachment.dataUrl; image.alt = attachment.name; link.append(image); }
      else { const label = document.createElement("span"); label.className = "file-name"; label.textContent = `PDF · ${attachment.name}`; link.append(label); }
      grid.append(link);
    }
    body.append(grid);
  }
  const savedAnswers = Array.isArray(project.savedAnswers) ? project.savedAnswers : [];
  const savedHeader = document.createElement("div");
  savedHeader.className = "saved-answers-header";
  const savedTitle = document.createElement("div");
  savedTitle.className = "details-section-title";
  savedTitle.textContent = `Respostas salvas (${savedAnswers.length})`;
  const captureNowButton = document.createElement("button");
  captureNowButton.type = "button";
  captureNowButton.className = "secondary-button saved-answer-btn";
  captureNowButton.textContent = "＋ Salvar respostas da aba atual";
  captureNowButton.addEventListener("click", () => captureAnswersForProject(project.id));
  savedHeader.append(savedTitle, captureNowButton);
  body.append(savedHeader);

  if (!savedAnswers.length) {
    const emptyAnswers = document.createElement("div");
    emptyAnswers.className = "session-info";
    emptyAnswers.textContent = "Nenhuma resposta salva ainda. Clique acima para capturar os campos preenchidos da aba atual.";
    body.append(emptyAnswers);
  } else {
    for (const snapshot of savedAnswers) {
      const card = document.createElement("div");
      card.className = "saved-answer-card";

      const meta = document.createElement("div");
      meta.className = "saved-answer-meta";
      const metaInfo = document.createElement("div");
      const titleEl = document.createElement("strong");
      titleEl.textContent = snapshot.pageTitle || "Página capturada";
      const dateEl = document.createElement("small");
      dateEl.textContent = formatDate(snapshot.savedAt);
      metaInfo.append(titleEl, dateEl);

      const actions = document.createElement("div");
      actions.className = "saved-answer-actions";
      const copyAllBtn = document.createElement("button");
      copyAllBtn.type = "button";
      copyAllBtn.className = "secondary-button saved-answer-btn";
      copyAllBtn.textContent = "Copiar tudo";
      copyAllBtn.addEventListener("click", () => {
        const fullText = snapshot.fields.map((f) => `${f.label}:\n${f.text}`).join("\n\n");
        copySavedText(fullText, "Todas as respostas desse registro foram copiadas!");
      });
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "secondary-button saved-answer-btn saved-answer-remove";
      removeBtn.textContent = "Remover";
      removeBtn.addEventListener("click", async () => {
        project.savedAnswers = (project.savedAnswers || []).filter((item) => item.id !== snapshot.id);
        project.updatedAt = now();
        await save();
        render();
        openDetails(project.id);
        toast("Registro de resposta removido.");
      });
      actions.append(copyAllBtn, removeBtn);
      meta.append(metaInfo, actions);
      card.append(meta);

      for (const field of snapshot.fields) {
        const fieldBox = document.createElement("div");
        fieldBox.className = "saved-answer-field";
        const fieldHead = document.createElement("div");
        fieldHead.className = "saved-answer-field-head";
        const labelEl = document.createElement("span");
        labelEl.textContent = field.label;
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "secondary-button saved-answer-btn";
        copyBtn.textContent = "Copiar";
        copyBtn.addEventListener("click", () => copySavedText(field.text, "Resposta copiada!"));
        fieldHead.append(labelEl, copyBtn);

        const textEl = document.createElement("div");
        textEl.className = "saved-answer-text";
        textEl.textContent = field.text;
        fieldBox.append(fieldHead, textEl);
        card.append(fieldBox);
      }

      body.append(card);
    }
  }
  $("#editProjectButton").dataset.project = project.id;
  $("#detailsDialog").showModal();
  window.dispatchEvent(new Event("pipoca:details-open"));
}

async function copySavedText(text, message = "Resposta copiada!") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    try {
      document.execCommand("copy");
      toast(message);
    } catch {
      toast("Não consegui copiar para a área de transferência.", true);
    } finally {
      helper.remove();
    }
  }
}

async function captureAnswersForProject(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      toast("Abra uma página web (http/https) para capturar os campos.", true);
      return;
    }
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["answer-capture.js"] });
    const result = results?.[0]?.result;
    const fields = Array.isArray(result?.fields) ? result.fields.filter((f) => f?.text && String(f.text).trim()) : [];
    if (!fields.length) {
      toast("Nenhum campo de texto preenchido encontrado nesta aba.", true);
      return;
    }
    const snapshot = normalizedSavedAnswer({
      id: makeId(),
      savedAt: now(),
      pageTitle: result.title || tab.title || "Página",
      pageUrl: result.url || tab.url || "",
      fields
    });
    if (!snapshot) return;
    project.savedAnswers = [snapshot, ...(Array.isArray(project.savedAnswers) ? project.savedAnswers : [])].slice(0, 50);
    project.updatedAt = now();
    await save();
    render();
    const dialog = $("#detailsDialog");
    if (dialog?.open && dialog.dataset.projectId === project.id) openDetails(project.id);
    toast(`${fields.length} campo${fields.length > 1 ? "s" : ""} salvo${fields.length > 1 ? "s" : ""} em ${project.name}!`);
  } catch (error) {
    toast(error?.message || "Não consegui ler os campos desta aba.", true);
  }
}

async function performAction(action, projectId) {
  if (action === "empty-trash") {
    const before = projects.length;
    projects = projects.filter((item) => !item.deletedAt);
    if (projects.length === before) return;
    await save(); render(); toast("Lixeira esvaziada definitivamente.");
    return;
  }
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  const at = now();
  if (action === "pause") {
    const session = allSessions(project).find((item) => item.state === "running");
    if (!session) return;
    pauseSession(session, at); project.updatedAt = at;
    await save(); render(); toast("Cronômetro pausado. Seu tempo está guardado.");
  } else if (action === "resume") {
    const session = currentSession(project);
    if (!session || session.state !== "paused") return;
    resumeSession(project, session, at);
    await save(); render(); window.dispatchEvent(new Event("pipoca:timer-started")); toast("De volta ao foco. O cronômetro está rodando.");
  } else if (action === "continue-last") {
    const session = currentSession(project);
    if (!session) {
      const created = startNewSession(project, at);
      await save(); switchTab("work"); window.dispatchEvent(new Event("pipoca:timer-started"));
      toast(`Nova sessão iniciada · ${escapeHTML(money(created.rate, created.currency))}/h.`);
      return;
    }
    resumeSession(project, session, at);
    await save(); switchTab("work"); window.dispatchEvent(new Event("pipoca:timer-started"));
    toast(`Continuando de onde parou (${formatDuration(sessionElapsed(session, at))}).`);
  } else if (action === "start") {
    const session = startNewSession(project, at);
    await save(); switchTab("work"); window.dispatchEvent(new Event("pipoca:timer-started")); toast(`Nova sessão iniciada · ${escapeHTML(money(session.rate, session.currency))}/h.`);
  } else if (action === "finish") {
    const session = allSessions(project).find((item) => item.state === "running") || currentSession(project);
    if (!session || (session.state !== "running" && session.state !== "paused")) return;
    if (session.state === "running") addSegment(session, at);
    session.state = "stopped"; session.runningSince = null; session.endAt = at; session.updatedAt = at; project.updatedAt = at;
    await save(); render(); toast(`Sessão encerrada · ${formatDuration(sessionElapsed(session))} · ${money(sessionEarned(session), session.currency)}.`);
  } else if (action === "capture-answers") {
    await captureAnswersForProject(projectId);
  } else if (action === "edit") {
    openEditor(project);
  } else if (action === "delete") {
    if (allSessions(project).some((item) => item.state === "running")) pauseSession(allSessions(project).find((item) => item.state === "running"), at);
    project.deletedAt = at; project.updatedAt = at;
    await save(); render(); toast("Projeto movido para a lixeira. Você pode restaurá-lo depois.");
  } else if (action === "restore") {
    project.deletedAt = null; project.updatedAt = at;
    await save(); render(); toast("Projeto restaurado.");
  } else if (action === "purge") {
    projects = projects.filter((item) => item.id !== projectId);
    await save(); render(); toast("Projeto excluído definitivamente.");
  } else if (action === "details") openDetails(projectId);
}

function normalizedAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const type = ACCEPTED_TYPES.has(attachment.type) ? attachment.type : null;
  if (!type || typeof attachment.dataUrl !== "string" || !attachment.dataUrl.startsWith(`data:${type};base64,`)) return null;
  return { id: String(attachment.id || makeId()).slice(0, 100), name: String(attachment.name || "arquivo").slice(0, 255), type, size: Math.max(0, numeric(attachment.size)), dataUrl: attachment.dataUrl, addedAt: numeric(attachment.addedAt, now()) };
}
function normalizedSession(session) {
  if (!session || typeof session !== "object") return null;
  const currency = session.currency === "BRL" ? "BRL" : session.currency === "USD" ? "USD" : null;
  const rate = numeric(session.rate, NaN);
  const state = ["running", "paused", "stopped"].includes(session.state) ? session.state : null;
  const startAt = numeric(session.startAt, NaN);
  if (!currency || !Number.isFinite(rate) || rate < 0 || !state || !Number.isFinite(startAt)) return null;
  const segments = Array.isArray(session.segments) ? session.segments.filter((segment) => Number.isFinite(Number(segment.startAt)) && Number.isFinite(Number(segment.endAt)) && Number(segment.endAt) >= Number(segment.startAt)).map((segment) => ({ startAt: Number(segment.startAt), endAt: Number(segment.endAt) })) : [];
  let accumulatedMs = Math.max(0, numeric(session.accumulatedMs));
  let runningSince = state === "running" ? numeric(session.runningSince, NaN) : null;
  let safeState = state;
  if (safeState === "running" && !Number.isFinite(runningSince)) { safeState = "paused"; runningSince = null; }
  return { id: String(session.id || makeId()).slice(0, 100), startAt, endAt: session.endAt == null ? null : numeric(session.endAt), accumulatedMs, runningSince, state: safeState, rate, currency, segments, updatedAt: numeric(session.updatedAt, startAt) };
}
function normalizedSavedAnswer(entry) {
  if (!entry || typeof entry !== "object") return null;
  const fields = Array.isArray(entry.fields)
    ? entry.fields
        .filter((f) => f && typeof f.text === "string" && f.text.trim())
        .map((f, index) => ({
          label: String(f.label || `Campo de texto ${index + 1}`).trim().slice(0, 140),
          text: f.text.trim().slice(0, 20000),
          tag: String(f.tag || "text").slice(0, 32)
        }))
    : [];
  if (!fields.length) return null;
  return {
    id: String(entry.id || makeId()).slice(0, 100),
    savedAt: numeric(entry.savedAt, now()),
    pageTitle: String(entry.pageTitle || "Página").trim().slice(0, 200),
    pageUrl: typeof entry.pageUrl === "string" ? entry.pageUrl.slice(0, 500) : "",
    fields
  };
}
function normalizedProject(project) {
  if (!project || typeof project !== "object") return null;
  const currency = project.currency === "BRL" ? "BRL" : project.currency === "USD" ? "USD" : null;
  const rate = numeric(project.rate, NaN);
  if (!currency || !Number.isFinite(rate) || rate < 0 || typeof project.name !== "string" || !project.name.trim()) return null;
  const createdAt = numeric(project.createdAt, now());
  return {
    id: String(project.id || makeId()).slice(0, 100), name: project.name.trim().slice(0, 100), rate, currency,
    notes: typeof project.notes === "string" ? project.notes.slice(0, 50000) : "",
    notesHtml: typeof project.notesHtml === "string" ? sanitizeNoteHtml(project.notesHtml).slice(0, 50000) : "",
    attachments: Array.isArray(project.attachments) ? project.attachments.map(normalizedAttachment).filter(Boolean) : [],
    savedAnswers: Array.isArray(project.savedAnswers) ? project.savedAnswers.map(normalizedSavedAnswer).filter(Boolean).slice(0, 50) : [],
    sessions: Array.isArray(project.sessions) ? project.sessions.map(normalizedSession).filter(Boolean) : [],
    createdAt, updatedAt: numeric(project.updatedAt, createdAt), deletedAt: project.deletedAt == null ? null : numeric(project.deletedAt, createdAt)
  };
}
function mergeProjects(existing, incoming) {
  const result = new Map(existing.map((project) => [project.id, project]));
  for (const imported of incoming) {
    const current = result.get(imported.id);
    if (!current) { result.set(imported.id, imported); continue; }
    const winner = numeric(imported.updatedAt) >= numeric(current.updatedAt) ? imported : current;
    const sessionMap = new Map();
    for (const session of [...allSessions(current), ...allSessions(imported)]) {
      const old = sessionMap.get(session.id);
      if (!old || numeric(session.updatedAt) >= numeric(old.updatedAt)) sessionMap.set(session.id, session);
    }
    const attachmentMap = new Map();
    for (const attachment of [...(current.attachments || []), ...(imported.attachments || [])]) if (!attachmentMap.has(attachment.id)) attachmentMap.set(attachment.id, attachment);
    const savedMap = new Map();
    for (const entry of [...(current.savedAnswers || []), ...(imported.savedAnswers || [])]) {
      const prev = savedMap.get(entry.id);
      if (!prev || numeric(entry.savedAt) >= numeric(prev.savedAt)) savedMap.set(entry.id, entry);
    }
    const savedAnswers = Array.from(savedMap.values()).sort((a, b) => numeric(b.savedAt) - numeric(a.savedAt)).slice(0, 50);
    result.set(imported.id, { ...winner, sessions: Array.from(sessionMap.values()).sort((a, b) => numeric(a.startAt) - numeric(b.startAt)), attachments: Array.from(attachmentMap.values()), savedAnswers });
  }
  const merged = Array.from(result.values());
  const running = merged.flatMap((project) => allSessions(project).filter((session) => session.state === "running").map((session) => ({ project, session }))).sort((a, b) => numeric(b.session.updatedAt, b.session.startAt) - numeric(a.session.updatedAt, a.session.startAt));
  for (const item of running.slice(1)) { pauseSession(item.session, now()); item.project.updatedAt = now(); }
  return merged;
}

async function exportBackup() {
  const at = now();
  const exportProjects = projects.map((project) => ({
    ...project,
    sessions: allSessions(project).map((session) => {
      const segments = Array.isArray(session.segments) ? session.segments.map((s) => ({ ...s })) : [];
      if (session.state !== "running") return { ...session, segments };
      const startAt = numeric(session.runningSince, at);
      const safeEnd = Math.max(startAt, at);
      if (session.runningSince) segments.push({ startAt, endAt: safeEnd });
      return {
        ...session,
        state: "paused",
        accumulatedMs: sessionElapsed(session, at),
        runningSince: null,
        segments,
        updatedAt: at
      };
    })
  }));
  const backup = { format: FORMAT, version: VERSION, exportedAt: new Date(at).toISOString(), projects: exportProjects };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const filename = `pipoca-backup-${new Date(at).toISOString().slice(0, 10)}.json`;
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "Backup Pipoca (JSON)", accept: { "application/json": [".json"] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast("Backup salvo. Sessões ativas foram pausadas no arquivo para continuar depois.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast("Backup baixado com seu tempo salvo. Importe em outro navegador para continuar!");
}
async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.format !== FORMAT || parsed?.version !== VERSION || !Array.isArray(parsed.projects)) throw new Error("Esse arquivo não parece ser um backup Pipoca válido.");
  const imported = parsed.projects.map(normalizedProject).filter(Boolean);
  if (parsed.projects.length && !imported.length) throw new Error("Não encontrei projetos válidos nesse backup.");
  projects = mergeProjects(projects, imported);
  await save();
  const hasPausedOrRunning = imported.some((p) => !p.deletedAt && allSessions(p).some((s) => s.state === "paused" || s.state === "running"));
  const hasAnyActive = imported.some((p) => !p.deletedAt);
  if (hasPausedOrRunning) switchTab("work");
  else if (hasAnyActive) switchTab("history");
  else render();
  window.dispatchEvent(new CustomEvent("pipoca:backup-imported", { detail: { hasActive: hasAnyActive } }));
  toast(hasPausedOrRunning
    ? `${imported.length} projeto${imported.length === 1 ? "" : "s"} importado${imported.length === 1 ? "" : "s"}. Clique em Retomar para continuar de onde parou!`
    : `${imported.length} projeto${imported.length === 1 ? "" : "s"} importado${imported.length === 1 ? "" : "s"}! Clique em Continuar no histórico se quiser retomar.`);
}

$("#createButton").addEventListener("click", () => openEditor());
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
$("#projectList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  await performAction(button.dataset.action, button.dataset.project);
});
$("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#projectName").value.trim();
  const rawRate = $("#hourlyRate").value.trim();
  const rate = rawRate === "" ? 0 : Number(rawRate);
  const currency = $("#currency").value;
  if (!name || !Number.isFinite(rate) || rate < 0) { toast("Informe o nome e um valor válido (0 para sem valor).", true); return; }
  const backfillMinutes = Math.floor(Number($("#backfillMinutes").value || 0));
  if (!Number.isFinite(backfillMinutes) || backfillMinutes < 0 || backfillMinutes > 10080) { toast("Informe um tempo anterior entre 0 e 10.080 minutos.", true); return; }
  const at = now();
  let project = projects.find((item) => item.id === editingProjectId);
  const startedNewProject = !project;
  const notesHtml = sanitizeNoteHtml($("#projectNotes").innerHTML);
  const notes = $("#projectNotes").innerText.trim().slice(0, 50000);
  let hasActiveSession = false;
  if (project) {
    project.name = name; project.rate = rate; project.currency = currency; project.notes = notes; project.notesHtml = notesHtml; project.attachments = pendingAttachments; project.updatedAt = at;
    const curSession = currentSession(project);
    if (curSession && (curSession.state === "running" || curSession.state === "paused")) {
      curSession.rate = rate;
      curSession.currency = currency;
      curSession.updatedAt = at;
    }
    const initialMinutes = $("#backfillMinutes").dataset.initialMinutes || "";
    if (String(backfillMinutes) !== initialMinutes) {
      if (curSession) {
        curSession.accumulatedMs = backfillMinutes * 60000;
        if (curSession.state === "running") curSession.runningSince = at;
        curSession.updatedAt = at;
      } else if (backfillMinutes > 0) {
        project.sessions = allSessions(project);
        project.sessions.push({ id: makeId(), startAt: at - backfillMinutes * 60000, endAt: null, accumulatedMs: backfillMinutes * 60000, runningSince: null, state: "paused", rate, currency, segments: [{ startAt: at - backfillMinutes * 60000, endAt: at }], updatedAt: at });
      }
    }
    hasActiveSession = allSessions(project).some((s) => s.state === "running" || s.state === "paused");
  } else {
    project = { id: makeId(), name, rate, currency, notes, notesHtml, attachments: pendingAttachments, sessions: [], createdAt: at, updatedAt: at, deletedAt: null };
    projects.push(project);
    startNewSession(project, at, backfillMinutes * 60000);
    hasActiveSession = true;
  }
  await save();
  $("#editorDialog").close();
  if (startedNewProject || hasActiveSession) switchTab("work");
  else render();
  toast(editingProjectId ? "Projeto atualizado!" : backfillMinutes ? `Projeto iniciado com ${backfillMinutes} min já contabilizados.` : "Projeto salvo. O cronômetro já começou!");
  editingProjectId = null;
  $("#projectForm").dataset.projectId = "";
  window.dispatchEvent(new CustomEvent("pipoca:project-saved", { detail: { started: startedNewProject } }));
});
$("#attachmentInput").addEventListener("change", async (event) => { await handleAttachmentSelection(event.target.files); event.target.value = ""; });
$("#attachmentList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-attachment]");
  if (!button) return;
  pendingAttachments = pendingAttachments.filter((attachment) => attachment.id !== button.dataset.removeAttachment);
  renderAttachmentChips();
});
document.querySelectorAll(".close-dialog, .cancel-dialog").forEach((button) => button.addEventListener("click", () => $("#editorDialog").close()));
document.querySelectorAll(".close-details").forEach((button) => button.addEventListener("click", () => $("#detailsDialog").close()));
$("#editProjectButton").addEventListener("click", () => {
  const project = projects.find((item) => item.id === $("#editProjectButton").dataset.project);
  $("#detailsDialog").close();
  if (project) openEditor(project);
});
$("#exportButton").addEventListener("click", async () => {
  try { await exportBackup(); }
  catch (error) { if (error?.name !== "AbortError") toast(error.message || "Não foi possível salvar o backup.", true); }
});
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importBackup(file); }
  catch (error) { toast(error.message || "Não foi possível importar esse arquivo.", true); }
  finally { event.target.value = ""; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.projects) { projects = Array.isArray(changes.projects.newValue) ? changes.projects.newValue : []; render(); if (floatingWidgetEnabled) syncFloatingWidget().catch(() => {}); }
  if (area === "local" && changes.aiSettings?.newValue) {
    soundMilestoneStep = Math.max(1, Number(changes.aiSettings.newValue.soundMilestoneStep) || 10);
  }
  if (area === "local" && (changes.aiSettings || changes.exchangeRateCache)) { refreshExchangeRate(false).catch(() => {}); }
});

window.PipocaApp = {
  openEditor,
  openDetails,
  switchTab,
  getProject: (id) => projects.find((project) => project.id === id) || null,
  getProjects: () => projects.slice(),
  setTab: (tab) => switchTab(tab),
  getActiveTab: () => activeTab,
  getAttachments: () => pendingAttachments.slice(),
  setFloatingWidgetEnabled,
  refreshExchangeRate,
  getExchangeRate: () => currentExchangeRate
};

document.addEventListener("click", (event) => {
  const summaryTile = event.target.closest?.("#summaryEarnTile");
  if (summaryTile) {
    const mainEl = $("#summaryEarnedMain");
    mainEl?.classList.add("earn-flipping");
    setTimeout(() => {
      summaryFlipToBrl = !summaryFlipToBrl;
      renderSummary();
      mainEl?.classList.remove("earn-flipping");
    }, 150);
    return;
  }
  const flipTarget = event.target.closest?.(".metric-earn.convertible[data-flip-project]");
  if (flipTarget) {
    const projectId = flipTarget.dataset.flipProject;
    flipTarget.classList.add("earn-flipping");
    setTimeout(() => {
      if (flippedProjectCards.has(projectId)) flippedProjectCards.delete(projectId);
      else flippedProjectCards.add(projectId);
      render();
    }, 150);
    return;
  }
  const anchor = event.target.closest?.("a[data-url]");
  if (!anchor) return;
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const url = safeHttpUrl(anchor.dataset.url);
    if (url) chrome.tabs.create({ url });
  }
});

window.PipocaApp.ready = (async function init() {
  const stored = await chrome.storage.local.get({ projects: [], aiSettings: {} });
  projects = Array.isArray(stored.projects) ? stored.projects : [];
  soundMilestoneStep = Math.max(1, Number(stored.aiSettings?.soundMilestoneStep) || 10);
  render();
  refreshExchangeRate(false).catch(() => {});
  setInterval(updateLiveTick, 1000);
})();
