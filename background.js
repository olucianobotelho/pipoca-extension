const ALARM_NAME = "pipoca-earnings-check";
const NOTIFICATION_ICON = "assets/pipoca-128.png";
const RATE_CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchAutoUsdBrlRate() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.USDBRL?.bid);
      if (Number.isFinite(rate) && rate > 0) return { rate, source: "AwesomeAPI", updatedAt: Date.now() };
    }
  } catch {}
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=BRL", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.rates?.BRL);
      if (Number.isFinite(rate) && rate > 0) return { rate, source: "Frankfurter", updatedAt: Date.now() };
    }
  } catch {}
  return null;
}

async function getExchangeRate({ force = false } = {}) {
  const saved = await chrome.storage.local.get({ aiSettings: {}, exchangeRateCache: null });
  const manualRaw = String(saved.aiSettings?.manualUsdBrlRate ?? "").replace(",", ".").trim();
  const manualNum = manualRaw ? Number(manualRaw) : NaN;
  const manualRate = Number.isFinite(manualNum) && manualNum > 0 ? manualNum : null;

  let cache = saved.exchangeRateCache && typeof saved.exchangeRateCache === "object" ? saved.exchangeRateCache : null;
  const fresh = cache && Number(cache.rate) > 0 && (Date.now() - Number(cache.updatedAt || 0)) < RATE_CACHE_TTL_MS;

  if (force || !fresh) {
    const fetched = await fetchAutoUsdBrlRate();
    if (fetched) {
      cache = fetched;
      await chrome.storage.local.set({ exchangeRateCache: cache }).catch(() => {});
    }
  }

  const autoRate = Number(cache?.rate) > 0 ? Number(cache.rate) : 5.80;
  const source = Number(cache?.rate) > 0 ? (cache.source || "cache") : "fallback";
  const updatedAt = Number(cache?.updatedAt || Date.now());
  return {
    rate: manualRate || autoRate,
    autoRate,
    manualRate,
    isManual: Boolean(manualRate),
    source: manualRate ? "manual" : source,
    updatedAt
  };
}

function elapsed(session, at = Date.now()) {
  return Math.max(0, Number(session.accumulatedMs || 0) + (session.state === "running" && session.runningSince ? Math.max(0, at - session.runningSince) : 0));
}
function earned(session, at = Date.now()) {
  return Number(session.rate || 0) * elapsed(session, at) / 3600000;
}
function formatMoney(value, currency) {
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
function projectCurrencyTotal(project, currency, at = Date.now()) {
  return (Array.isArray(project.sessions) ? project.sessions : []).filter((session) => session.currency === currency).reduce((sum, session) => sum + earned(session, at), 0);
}
function widgetSnapshot(project, session, at = Date.now()) {
  return {
    projectId: project.id, projectName: project.name, sessionId: session.id, state: session.state,
    rate: Number(session.rate || 0), currency: session.currency, accumulatedMs: Number(session.accumulatedMs || 0),
    runningSince: Number(session.runningSince || 0), elapsedMs: elapsed(session, at), earned: earned(session, at), updatedAt: at
  };
}
function closeRunningSession(session, at) {
  if (session.state !== "running") return;
  const startAt = Number(session.runningSince || at);
  session.segments = Array.isArray(session.segments) ? session.segments : [];
  session.segments.push({ startAt, endAt: at });
  session.accumulatedMs = elapsed(session, at);
  session.runningSince = null;
  session.updatedAt = at;
}
async function handleWidgetTimerControl(projectId, sessionId, action) {
  const data = await chrome.storage.local.get({ projects: [] });
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const project = projects.find((item) => item.id === projectId && !item.deletedAt);
  if (!project) throw new Error("Não encontrei esse projeto no histórico local.");
  const sessions = Array.isArray(project.sessions) ? project.sessions : [];
  const session = sessions.find((item) => item.id === sessionId) || sessions.find((item) => item.state === "running") || sessions.slice().sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0)).find((item) => item.state === "paused") || sessions.slice().sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0))[0];
  if (!session) throw new Error("Esse projeto ainda não tem uma sessão.");
  const at = Date.now();
  if (action === "pause") {
    if (session.state !== "running") throw new Error("O cronômetro já está pausado.");
    closeRunningSession(session, at); session.state = "paused";
  } else if (action === "resume") {
    if (session.state !== "paused" && session.state !== "stopped") throw new Error("Essa sessão não pode ser retomada.");
    for (const otherProject of projects) for (const other of Array.isArray(otherProject.sessions) ? otherProject.sessions : []) {
      if (other.state === "running" && other.id !== session.id) { closeRunningSession(other, at); other.state = "paused"; otherProject.updatedAt = at; }
    }
    session.state = "running"; session.runningSince = at; session.endAt = null; session.updatedAt = at;
  } else if (action === "stop" || action === "finish") {
    if (session.state === "running") closeRunningSession(session, at);
    if (session.state !== "paused" && session.state !== "running") throw new Error("Essa sessão já foi encerrada.");
    session.state = "stopped"; session.runningSince = null; session.endAt = at; session.updatedAt = at;
  } else throw new Error("Ação desconhecida para o cronômetro.");
  project.updatedAt = at;
  await chrome.storage.local.set({ projects });
  return { ok: true, timer: widgetSnapshot(project, session, at) };
}

function currentWidgetTimer(projects) {
  const entries = [];
  for (const project of projects) {
    if (project.deletedAt || !Array.isArray(project.sessions)) continue;
    for (const session of project.sessions) entries.push({ project, session });
  }
  const current = entries.find((entry) => entry.session.state === "running") || entries.sort((a, b) => Number(b.session.updatedAt || b.session.startAt || 0) - Number(a.session.updatedAt || a.session.startAt || 0))[0];
  return current ? widgetSnapshot(current.project, current.session) : null;
}
async function restoreFloatingWidget(tabId) {
  const saved = await chrome.storage.local.get({ uiState: null, projects: [], floatingWidgetState: null });
  if (!saved.uiState?.floatingEnabled && !saved.uiState?.compact) return;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.active) return;
  const exchangeRate = await getExchangeRate().catch(() => ({ rate: 5.80, source: "fallback", isManual: false }));
  const payload = {
    type: "pipoca:floating-widget-update",
    enabled: true,
    timer: currentWidgetTimer(Array.isArray(saved.projects) ? saved.projects : []),
    exchangeRate,
    widgetState: saved.floatingWidgetState || null
  };
  let response = null;
  try { response = await chrome.tabs.sendMessage(tabId, payload); } catch {}
  if (response?.pipocaWidget && response?.version === 7) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["floating-widget.js"] });
  await chrome.tabs.sendMessage(tabId, payload);
}
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete" && tab.active) restoreFloatingWidget(tabId).catch(() => {});
});
chrome.tabs.onActivated.addListener(({ tabId }) => { restoreFloatingWidget(tabId).catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.projects) return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    if (tabs[0]?.id != null) return restoreFloatingWidget(tabs[0].id);
  }).catch(() => {});
});

async function configurePanelAction() {
  if (chrome.sidePanel?.setPanelBehavior) {
    try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch {}
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  await configurePanelAction();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(async () => {
  await configurePanelAction();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
});
configurePanelAction();
chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });

chrome.action.onClicked.addListener(async (tab) => {
  const tabInfo = tab?.id != null ? { id: tab.id, windowId: tab.windowId, url: tab.url || "", capturedAt: Date.now() } : null;
  const saveTab = tabInfo && chrome.storage.session ? chrome.storage.session.set({ pipocaActionTab: tabInfo }).catch(() => {}) : Promise.resolve();
  if (chrome.sidePanel?.open && tab?.id != null) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); await saveTab; return; } catch {}
  }
  await saveTab;
  await chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
});

async function playChime({ volume = 0.35, customSoundDataUrl = "" } = {}) {
  if (!chrome.offscreen?.createDocument || !chrome.runtime.getContexts) return;
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Tocar um aviso suave quando os ganhos atingirem cada meta configurada." });
  }
  await chrome.runtime.sendMessage({ type: "pipoca:play-chime", volume, customSoundDataUrl });
}

async function notifyActiveTabCelebrate(detail = {}) {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]?.id != null) {
      await chrome.tabs.sendMessage(tabs[0].id, { type: "pipoca:celebrate", ...detail });
    }
  } catch {}
}

async function checkEarnings() {
  const state = await chrome.storage.local.get({ projects: [], aiSettings: {}, notificationThresholds: null, customSoundDataUrl: "" });
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const preferences = state.aiSettings || {};
  const customSoundDataUrl = typeof state.customSoundDataUrl === "string" ? state.customSoundDataUrl : "";
  const step = Math.max(1, Math.floor(Number(preferences.soundMilestoneStep) || 10));
  const volume = Math.max(0, Math.min(100, Number(preferences.soundVolume ?? 35))) / 100;
  const thresholds = state.notificationThresholds && typeof state.notificationThresholds === "object" ? state.notificationThresholds : null;
  const liveProjects = projects.filter((project) => !project.deletedAt && Array.isArray(project.sessions) && project.sessions.some((session) => session.state === "running"));

  if (!thresholds) {
    const baseline = {};
    for (const project of projects) {
      for (const currency of ["USD", "BRL"]) baseline[`${project.id}:${currency}`] = Math.floor(projectCurrencyTotal(project, currency) + 1e-8);
    }
    await chrome.storage.local.set({ notificationThresholds: baseline });
    return;
  }

  let changed = false;
  for (const project of liveProjects) {
    const liveCurrencies = new Set(project.sessions.filter((session) => session.state === "running").map((session) => session.currency));
    for (const currency of liveCurrencies) {
      const key = `${project.id}:${currency}`;
      const total = Math.floor(projectCurrencyTotal(project, currency) + 1e-8);
      const previous = Number.isFinite(Number(thresholds[key])) ? Number(thresholds[key]) : total;
      if (!(key in thresholds)) { thresholds[key] = total; changed = true; continue; }
      const hitMilestone = Math.floor(total / step) > Math.floor(previous / step);

      if (preferences.notificationsEnabled !== false && total > previous) {
        const difference = total - previous;
        if (difference > 5) {
          try {
            await chrome.notifications.create(`pipoca-${project.id}-${currency}-${total}`, {
              type: "basic", iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON), title: `Pipoca · +${formatMoney(difference, currency)}`, message: `${project.name}: ${formatMoney(total, currency)} acumulados.`, priority: 0
            });
          } catch {}
        } else {
          for (let amount = previous + 1; amount <= total; amount += 1) {
            try {
              await chrome.notifications.create(`pipoca-${project.id}-${currency}-${amount}`, {
                type: "basic", iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON), title: `Pipoca · +${formatMoney(1, currency)}`, message: `${project.name}: ${formatMoney(amount, currency)} acumulados.`, priority: 0
              });
            } catch {}
          }
        }
      }

      if (hitMilestone) {
        if (preferences.soundEnabled !== false && volume > 0) {
          try { await playChime({ volume, customSoundDataUrl }); } catch {}
        }
        await notifyActiveTabCelebrate({ total, currency, step });
      }

      if (total > previous || !(key in thresholds)) { thresholds[key] = total; changed = true; }
    }
  }
  if (changed) await chrome.storage.local.set({ notificationThresholds: thresholds });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkEarnings().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "pipoca:timer-control") {
    handleWidgetTimerControl(message.projectId, message.sessionId, message.action).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "pipoca:get-exchange-rate") {
    getExchangeRate({ force: Boolean(message.force) }).then((info) => sendResponse({ ok: true, ...info })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "pipoca:test-sound") {
    chrome.storage.local.get({ aiSettings: {}, customSoundDataUrl: "" }).then(async (saved) => {
      const vol = Math.max(0, Math.min(100, Number(message.volume ?? saved.aiSettings?.soundVolume ?? 35))) / 100;
      const custom = typeof saved.customSoundDataUrl === "string" ? saved.customSoundDataUrl : "";
      await playChime({ volume: vol, customSoundDataUrl: custom });
      await notifyActiveTabCelebrate({ test: true });
      sendResponse({ ok: true });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "pipoca:widget-get-state") {
    chrome.storage.local.get({ floatingWidgetState: null, floatingWidgetPosition: null }).then((value) => {
      const state = value.floatingWidgetState || (value.floatingWidgetPosition ? { ...value.floatingWidgetPosition, docked: false } : null);
      sendResponse({ state });
    }).catch(() => sendResponse({ state: null }));
    return true;
  }
  if (message?.type === "pipoca:widget-save-state" && message.state) {
    const incoming = message.state;
    const clean = {
      docked: Boolean(incoming.docked),
      side: incoming.side === "left" ? "left" : "right",
      top: Number.isFinite(Number(incoming.top)) ? Math.max(8, Number(incoming.top)) : null,
      left: Number.isFinite(Number(incoming.left)) ? Math.max(8, Number(incoming.left)) : null,
      currencyFlip: Boolean(incoming.currencyFlip)
    };
    chrome.storage.local.set({ floatingWidgetState: clean }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "pipoca:widget-get-position") {
    chrome.storage.local.get({ floatingWidgetPosition: null }).then((value) => sendResponse({ position: value.floatingWidgetPosition })).catch(() => sendResponse({ position: null }));
    return true;
  }
  if (message?.type === "pipoca:widget-save-position" && message.position) {
    const left = Number(message.position.left), top = Number(message.position.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) { sendResponse({ ok: false }); return; }
    chrome.storage.local.set({ floatingWidgetPosition: { left: Math.max(0, left), top: Math.max(0, top) } }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "pipoca:annotation-click" && chrome.storage.session) {
    chrome.storage.session.set({ pipocaPendingAnnotation: message.annotation }).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "pipoca:check-earnings") {
    checkEarnings().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "pipoca:open-panel" && chrome.sidePanel?.open && sender.tab?.windowId != null) {
    const flag = message.expand && chrome.storage.session ? chrome.storage.session.set({ pipocaExpandOnce: true }) : Promise.resolve();
    const opened = chrome.sidePanel.open({ tabId: sender.tab.id });
    Promise.all([flag, opened]).then(() => sendResponse({ ok: true })).catch(async (error) => {
      if (message.expand && chrome.storage.session) await chrome.storage.session.remove("pipocaExpandOnce").catch(() => {});
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }
});
