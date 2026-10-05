import { resolveCriticalEffectPolarity, resolveCriticalEffectTarget } from "./critical-targeting.mjs";

const MODULE_ID = "zft-critical-fumbles";
const VERSION = "1.3.0";
const SIDEBAR_HISTORY_SETTING = "sidebarHistory";
export const SIDEBAR_TAB_NAME = "zftCriticalFumbles";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab, Sidebar } = foundry.applications.sidebar;

let sidebarHooksRegistered = false;
let sidebarRegistered = false;
let historyWriteQueue = Promise.resolve();

export class CriticalFumblesSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = SIDEBAR_TAB_NAME;

  static DEFAULT_OPTIONS = {
    window: {
      title: "Criticals & Fumbles"
    },
    actions: {
      pingToken: CriticalFumblesSidebarTab.#onPingToken,
      removeEntry: CriticalFumblesSidebarTab.#onRemoveEntry,
      clearHistory: CriticalFumblesSidebarTab.#onClearHistory
    }
  };

  static PARTS = {
    tab: {
      root: true,
      template: `modules/${MODULE_ID}/templates/sidebar.hbs`,
      scrollable: [".zft-cf-sidebar-list"]
    }
  };

  #expandedEntryIds = new Set();

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getSidebarHistoryState();
    const records = [...state.entries]
      .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));

    const entries = [];
    for (const record of records) {
      entries.push(await buildSidebarDisplayEntry(record, this.#expandedEntryIds));
    }

    const criticalCount = entries.filter(entry => entry.isCritical).length;
    const fumbleCount = entries.length - criticalCount;

    return Object.assign(context, {
      isGM: Boolean(game.user?.isGM),
      entries,
      count: entries.length,
      criticalCount,
      fumbleCount,
      hasEntries: entries.length > 0,
      summary: entries.length === 1
        ? "1 recorded result"
        : `${entries.length} recorded results`
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.classList.add("zft-cf-sidebar-app");
    this.element.classList.toggle("zft-cf-sidebar-gm", Boolean(game.user?.isGM));

    this.element.querySelectorAll("details.zft-cf-sidebar-entry[data-entry-id]").forEach(details => {
      details.addEventListener("toggle", () => {
        const entryId = details.dataset.entryId;
        if (!entryId) return;
        if (details.open) this.#expandedEntryIds.add(entryId);
        else this.#expandedEntryIds.delete(entryId);
      });
    });
  }

  static async #onPingToken(event, target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const tokenUuid = String(target?.dataset?.tokenUuid ?? "").trim();
    if (!tokenUuid) return;

    await pingTokenOnCanvas(tokenUuid);
  }

  static async #onRemoveEntry(event, target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!game.user?.isGM) return;

    const entryId = String(target?.dataset?.entryId ?? "").trim();
    if (!entryId) return;

    target.disabled = true;
    try {
      await removeSidebarHistoryEntry(entryId);
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  static async #onClearHistory(event, target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!game.user?.isGM) return;

    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (!DialogV2?.confirm) return;

    const confirmed = await DialogV2.confirm({
      window: { title: "Clear Critical/Fumble History?" },
      content: "<p>Clear every entry from the Criticals &amp; Fumbles sidebar?</p><p>This does not delete chat messages or remove Active Effects.</p>",
      yes: {
        label: "Clear All",
        icon: "fa-solid fa-trash"
      },
      no: {
        label: "Cancel"
      },
      rejectClose: false,
      modal: true
    });

    if (!confirmed) return;

    target.disabled = true;
    try {
      await clearSidebarHistory();
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }
}

export function registerCriticalFumbleSidebarSettings() {
  game.settings.register(MODULE_ID, SIDEBAR_HISTORY_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      initialized: false,
      entries: []
    },
    restricted: true,
    onChange: () => refreshCriticalFumbleSidebar()
  });

  console.log(`[ZFT] ⚙️ v${VERSION} | Critical/Fumble sidebar history setting registered`);
}

export function registerCriticalFumbleSidebarTab() {
  CONFIG.ui[SIDEBAR_TAB_NAME] = CriticalFumblesSidebarTab;

  const tabs = Sidebar?.TABS;
  if (!tabs) {
    console.error(`[ZFT] ❌ v${VERSION} | Sidebar.TABS is unavailable; Critical/Fumble sidebar registration failed`);
    return false;
  }

  if (!tabs[SIDEBAR_TAB_NAME]) {
    const descriptor = {
      tooltip: "Criticals & Fumbles",
      icon: "fa-solid fa-dice-d20 zft-cf-sidebar-tab-icon"
    };

    const ordered = {};
    let inserted = false;

    for (const [key, value] of Object.entries(tabs)) {
      if (key === SIDEBAR_TAB_NAME) continue;
      ordered[key] = value;

      if (key === "chat") {
        ordered[SIDEBAR_TAB_NAME] = descriptor;
        inserted = true;
      }
    }

    if (!inserted) ordered[SIDEBAR_TAB_NAME] = descriptor;

    for (const key of Object.keys(tabs)) delete tabs[key];
    Object.assign(tabs, ordered);
  }

  if (!sidebarRegistered) {
    sidebarRegistered = true;
    console.log(`[ZFT] ✅ v${VERSION} | Critical/Fumble sidebar tab registered`);
  }

  return true;
}

export async function initializeCriticalFumbleSidebar() {
  if (!sidebarHooksRegistered) {
    sidebarHooksRegistered = true;

    Hooks.on("createChatMessage", message => {
      if (isResultMessage(message)) void recordResultMessageInSidebarHistory(message);
    });
  }

  await ensureSidebarHistoryInitialized();
  refreshCriticalFumbleSidebar();
  console.log(`[ZFT] 🧭 v${VERSION} | Critical/Fumble sidebar ready | Persistent world history`);
}

export function refreshCriticalFumbleSidebar() {
  const tab = ui?.[SIDEBAR_TAB_NAME];
  if (tab?.rendered) tab.render();
}

export function hasSidebarHistoryEntry(entryId) {
  const id = String(entryId ?? "").trim();
  if (!id) return false;
  return getSidebarHistoryState().entries.some(entry => entry.id === id);
}

export async function removeSidebarHistoryEntry(entryId) {
  if (!game.user?.isGM) return false;

  const id = String(entryId ?? "").trim();
  if (!id) return false;

  return enqueueHistoryWrite(async () => {
    const state = getSidebarHistoryState();
    const nextEntries = state.entries.filter(entry => entry.id !== id);
    if (nextEntries.length === state.entries.length) return false;

    await setSidebarHistoryState({ ...state, initialized: true, entries: nextEntries });
    console.log(`[ZFT] 🧹 v${VERSION} | Removed Critical/Fumble sidebar entry | ${id}`);
    return true;
  });
}

export async function clearSidebarHistory() {
  if (!game.user?.isGM) return false;

  return enqueueHistoryWrite(async () => {
    const state = getSidebarHistoryState();
    if (!state.entries.length) return false;

    await setSidebarHistoryState({ ...state, initialized: true, entries: [] });
    console.log(`[ZFT] 🧹 v${VERSION} | Cleared Critical/Fumble sidebar history`);
    return true;
  });
}

export async function updateSidebarHistoryRecipient({
  message = null,
  historyEntryId = null,
  actor = null,
  tokenDocument = null,
  effectTarget = null,
  effectPolarity = null
} = {}) {
  if (!isSidebarHistoryAuthority()) return false;

  const flags = message?.flags?.[MODULE_ID] ?? {};
  const entryId = String(historyEntryId ?? flags.historyEntryId ?? message?.id ?? "").trim();
  if (!entryId) return false;

  return enqueueHistoryWrite(async () => {
    const state = getSidebarHistoryState();
    let entries = [...state.entries];
    let index = entries.findIndex(entry => entry.id === entryId);

    if (index < 0 && isResultMessage(message)) {
      const created = await buildHistoryEntryFromMessage(message);
      if (created) {
        entries.push(created);
        index = entries.length - 1;
      }
    }

    if (index < 0) return false;

    entries[index] = {
      ...entries[index],
      recipientActorUuid: actor?.uuid ?? entries[index].recipientActorUuid ?? null,
      recipientTokenUuid: tokenDocument?.uuid ?? entries[index].recipientTokenUuid ?? null,
      recipientName: actor?.name ?? tokenDocument?.name ?? entries[index].recipientName ?? null,
      effectTarget: normalizeEffectTarget(effectTarget) ?? entries[index].effectTarget ?? "none",
      effectPolarity: normalizeEffectPolarity(effectPolarity) ?? entries[index].effectPolarity ?? "neutral"
    };

    await setSidebarHistoryState({ ...state, initialized: true, entries });
    return true;
  });
}

async function ensureSidebarHistoryInitialized() {
  const state = getSidebarHistoryState();
  if (state.initialized) return;
  if (!isSidebarHistoryAuthority()) return;

  await enqueueHistoryWrite(async () => {
    const current = getSidebarHistoryState();
    if (current.initialized) return;

    const messages = Array.from(game.messages?.contents ?? game.messages ?? [])
      .filter(isResultMessage)
      .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));

    const entries = [];
    const seen = new Set();

    for (const message of messages) {
      const entry = await buildHistoryEntryFromMessage(message);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }

    await setSidebarHistoryState({ initialized: true, entries });
    console.log(`[ZFT] 🗃️ v${VERSION} | Initialized persistent Critical/Fumble sidebar history | ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  });
}

async function recordResultMessageInSidebarHistory(message) {
  if (!isSidebarHistoryAuthority()) return false;

  return enqueueHistoryWrite(async () => {
    const state = getSidebarHistoryState();
    const entry = await buildHistoryEntryFromMessage(message);
    if (!entry) return false;

    const existingIndex = state.entries.findIndex(item => item.id === entry.id);
    const entries = [...state.entries];

    if (existingIndex >= 0) {
      const existing = entries[existingIndex];
      entries[existingIndex] = {
        ...existing,
        ...entry,
        recipientName: entry.recipientName ?? existing.recipientName ?? null,
        recipientActorUuid: entry.recipientActorUuid ?? existing.recipientActorUuid ?? null,
        recipientTokenUuid: entry.recipientTokenUuid ?? existing.recipientTokenUuid ?? null
      };
    } else {
      entries.push(entry);
    }

    await setSidebarHistoryState({ ...state, initialized: true, entries });
    console.log(`[ZFT] 🗃️ v${VERSION} | Recorded sidebar history entry | ${entry.outcome} | ${entry.title}`);
    return true;
  });
}

async function buildHistoryEntryFromMessage(message) {
  if (!isResultMessage(message)) return null;

  const flags = message?.flags?.[MODULE_ID] ?? {};
  const outcome = String(flags.outcome ?? "").toLowerCase() === "critical" ? "critical" : "fumble";
  const parsed = parseResultCard(message?.content ?? "");
  const sourceName = String(message?.speaker?.alias ?? parsed.actorName ?? "Unknown Actor");

  let effectTarget = outcome === "fumble" ? "roller" : normalizeEffectTarget(flags.effectTarget);
  let effectPolarity = outcome === "fumble" ? "harmful" : normalizeEffectPolarity(flags.effectPolarity);

  if (outcome === "critical" && (!effectTarget || !effectPolarity)) {
    const pageUuid = String(flags.journalPageUuid ?? "").trim();
    if (pageUuid) {
      try {
        const page = await fromUuid(pageUuid);
        if (page?.documentName === "JournalEntryPage") {
          effectTarget ??= resolveCriticalEffectTarget(page, flags.seedKey ?? null);
          effectPolarity ??= resolveCriticalEffectPolarity(page, flags.seedKey ?? null);
        }
      } catch (error) {
        console.warn(`[ZFT] ⚠️ v${VERSION} | Sidebar history could not resolve critical Journal metadata`, {
          messageId: message?.id ?? null,
          pageUuid,
          error
        });
      }
    }
  }

  effectTarget ??= "none";
  effectPolarity ??= "neutral";

  const recipient = await resolveInitialHistoryRecipient({ message, flags, outcome, effectTarget, sourceName });
  const title = String(flags.resultTitle ?? parsed.title ?? "").trim()
    || formatSeedKey(flags.seedKey)
    || (outcome === "critical" ? "Critical Result" : "Fumble Result");

  return {
    id: String(flags.historyEntryId ?? message.id),
    timestamp: Number(message?.timestamp ?? Date.now()),
    outcome,
    natural: Number(flags.natural ?? (outcome === "critical" ? 20 : 1)),
    title,
    sourceName,
    sourceActorUuid: flags.sourceActorUuid ?? null,
    sourceTokenUuid: getSourceTokenUuid(message, flags),
    recipientName: recipient?.name ?? null,
    recipientActorUuid: recipient?.actorUuid ?? flags.recipientActorUuid ?? null,
    recipientTokenUuid: recipient?.tokenUuid ?? flags.recipientTokenUuid ?? null,
    effectTarget,
    effectPolarity,
    rollType: flags.rollType ?? null,
    seedKey: flags.seedKey ?? null,
    journalPageUuid: flags.journalPageUuid ?? null,
    targetTokenUuids: Array.from(flags.targetTokenUuids ?? []),
    targetActorUuids: Array.from(flags.targetActorUuids ?? []),
    content: String(message?.content ?? ""),
    chatMessageId: message?.id ?? null
  };
}

async function buildSidebarDisplayEntry(record, expandedEntryIds) {
  const recipient = await resolveStoredHistoryRecipient(record);
  const sourceName = String(record.sourceName ?? "Unknown Actor");
  const recipientName = String(recipient?.name ?? record.recipientName ?? "").trim();
  const summary = recipientName && recipientName !== sourceName
    ? `${sourceName} → ${recipientName}`
    : sourceName;

  return {
    id: record.id,
    outcome: record.outcome === "critical" ? "critical" : "fumble",
    outcomeLabel: record.outcome === "critical" ? "Critical" : "Fumble",
    isCritical: record.outcome === "critical",
    title: record.title ?? (record.outcome === "critical" ? "Critical Result" : "Fumble Result"),
    summary,
    content: String(record.content ?? ""),
    expanded: expandedEntryIds.has(record.id),
    canPing: Boolean(recipient?.tokenUuid && recipient?.onCurrentScene),
    canManage: Boolean(game.user?.isGM),
    hasActions: Boolean(recipient?.tokenUuid && recipient?.onCurrentScene) || Boolean(game.user?.isGM),
    tokenUuid: recipient?.tokenUuid ?? "",
    effectTarget: record.effectTarget ?? "none",
    effectPolarity: record.effectPolarity ?? "neutral"
  };
}

async function resolveInitialHistoryRecipient({ message, flags, outcome, effectTarget, sourceName }) {
  const persistedTokenUuid = String(flags.recipientTokenUuid ?? "").trim();
  const persistedActorUuid = String(flags.recipientActorUuid ?? "").trim();

  if (persistedTokenUuid) {
    const tokenRecipient = await describeToken(persistedTokenUuid);
    if (tokenRecipient) return tokenRecipient;
  }

  if (persistedActorUuid) {
    const actorRecipient = await describeActor(persistedActorUuid);
    if (actorRecipient) return actorRecipient;
  }

  if (outcome === "fumble" || effectTarget === "roller") {
    const sourceTokenUuid = getSourceTokenUuid(message, flags);
    if (sourceTokenUuid) {
      const tokenRecipient = await describeToken(sourceTokenUuid);
      if (tokenRecipient) return tokenRecipient;
    }

    return {
      name: sourceName,
      actorUuid: flags.sourceActorUuid ?? null,
      tokenUuid: sourceTokenUuid ?? null,
      onCurrentScene: false
    };
  }

  if (effectTarget === "target") {
    const targetTokenUuids = Array.from(flags.targetTokenUuids ?? []).filter(Boolean);
    if (targetTokenUuids.length === 1) {
      const tokenRecipient = await describeToken(targetTokenUuids[0]);
      if (tokenRecipient) return tokenRecipient;
    }
  }

  return null;
}

async function resolveStoredHistoryRecipient(record) {
  const tokenUuid = String(record.recipientTokenUuid ?? "").trim();
  if (tokenUuid) {
    const tokenRecipient = await describeToken(tokenUuid);
    if (tokenRecipient?.onCurrentScene) return tokenRecipient;
  }

  const actorUuid = String(record.recipientActorUuid ?? "").trim();
  if (actorUuid) {
    const actorRecipient = await describeActor(actorUuid);
    if (actorRecipient) return actorRecipient;
  }

  if (tokenUuid) {
    const tokenRecipient = await describeToken(tokenUuid);
    if (tokenRecipient) return tokenRecipient;
  }

  return record.recipientName
    ? { name: record.recipientName, actorUuid: actorUuid || null, tokenUuid: null, onCurrentScene: false }
    : null;
}

async function describeToken(tokenUuid) {
  try {
    const tokenDocument = await fromUuid(tokenUuid);
    if (!tokenDocument || tokenDocument.documentName !== "Token") return null;

    return {
      name: tokenDocument.name ?? tokenDocument.actor?.name ?? "Token",
      actorUuid: tokenDocument.actor?.uuid ?? null,
      tokenUuid: tokenDocument.uuid,
      onCurrentScene: Boolean(canvas?.scene?.id && tokenDocument.parent?.id === canvas.scene.id)
    };
  } catch {
    return null;
  }
}

async function describeActor(actorUuid) {
  try {
    const actor = await fromUuid(actorUuid);
    if (!actor || actor.documentName !== "Actor") return null;

    const token = canvas?.tokens?.placeables?.find(placeable => placeable.actor?.uuid === actor.uuid) ?? null;
    return {
      name: actor.name ?? "Actor",
      actorUuid: actor.uuid,
      tokenUuid: token?.document?.uuid ?? null,
      onCurrentScene: Boolean(token)
    };
  } catch {
    return null;
  }
}

function getSourceTokenUuid(message, flags) {
  const stored = String(flags.sourceTokenUuid ?? "").trim();
  if (stored) return stored;

  const sceneId = message?.speaker?.scene;
  const tokenId = message?.speaker?.token;
  return sceneId && tokenId ? `Scene.${sceneId}.Token.${tokenId}` : null;
}

async function pingTokenOnCanvas(tokenUuid) {
  try {
    const tokenDocument = await fromUuid(tokenUuid);
    if (!tokenDocument || tokenDocument.documentName !== "Token") {
      ui.notifications?.warn?.("ZFT could not resolve that token.");
      return;
    }

    if (!canvas?.scene || tokenDocument.parent?.id !== canvas.scene.id) {
      ui.notifications?.warn?.("That token is not on the currently viewed scene.");
      return;
    }

    const token = tokenDocument.object ?? canvas.tokens?.get?.(tokenDocument.id) ?? null;
    if (!token?.center) {
      ui.notifications?.warn?.("That token is not currently rendered on the canvas.");
      return;
    }

    const point = { x: token.center.x, y: token.center.y };
    if (typeof canvas.animatePan === "function") {
      await canvas.animatePan({ ...point, duration: 250 });
    }

    if (typeof canvas.ping === "function") {
      canvas.ping(point);
    }
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to ping sidebar token`, { tokenUuid, error });
    ui.notifications?.error?.("ZFT could not ping that token.");
  }
}

function getSidebarHistoryState() {
  try {
    return normalizeHistoryState(game.settings.get(MODULE_ID, SIDEBAR_HISTORY_SETTING));
  } catch {
    return { initialized: false, entries: [] };
  }
}

async function setSidebarHistoryState(state) {
  return game.settings.set(MODULE_ID, SIDEBAR_HISTORY_SETTING, normalizeHistoryState(state));
}

function normalizeHistoryState(value) {
  const entries = Array.isArray(value?.entries)
    ? value.entries.filter(entry => entry && typeof entry === "object" && String(entry.id ?? "").trim())
    : [];

  return {
    initialized: Boolean(value?.initialized),
    entries
  };
}

function enqueueHistoryWrite(task) {
  const run = historyWriteQueue.then(task, task);
  historyWriteQueue = run.catch(error => {
    console.error(`[ZFT] ❌ v${VERSION} | Critical/Fumble sidebar history write failed`, error);
  });
  return run;
}

function isSidebarHistoryAuthority() {
  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (!activeGMs.length) return Boolean(game.user?.isGM);
  return activeGMs[0]?.id === game.user?.id;
}

function isResultMessage(message) {
  return message?.flags?.[MODULE_ID]?.resultCard === true;
}

function parseResultCard(html) {
  if (!html || typeof document === "undefined") return { title: "", actorName: "" };

  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(html);

  return {
    title: String(wrapper.querySelector(".zft-cf-result-title")?.textContent ?? "").trim(),
    actorName: String(wrapper.querySelector(".zft-cf-result-context strong")?.textContent ?? "").trim()
  };
}

function normalizeEffectTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["roller", "target", "ally", "none"].includes(normalized) ? normalized : null;
}

function normalizeEffectPolarity(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["beneficial", "harmful", "neutral"].includes(normalized) ? normalized : null;
}

function formatSeedKey(seedKey) {
  const value = String(seedKey ?? "").replace(/^critical-|^fumble-[^-]+-/, "");
  if (!value) return "";
  return value
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
