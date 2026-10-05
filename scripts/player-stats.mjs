const MODULE_ID = "zft-critical-fumbles";
const STATS_FLAG = "playerStats";
const SHOW_STATS_SETTING = "showPlayerListStats";
const ACTION_DIALOGS_SETTING = "enableStatActionDialogs";

let VERSION = "unknown";
let hooksRegistered = false;

/**
 * Register early UI hooks so the initial Players-list render is observed.
 * ZFT keeps its counters inside the native player-name area so they do not
 * compete horizontally with resource UIs added by Shared Dice or other modules.
 */
export function registerPlayerStatsHooks({ version }) {
  VERSION = version;
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("renderPlayers", onRenderPlayers);
  Hooks.on("updateUser", onUpdateUser);

  console.log(`[ZFT] 🪝 v${VERSION} | Player-list tracking hooks registered`);
}

export function registerPlayerStatsSetting() {
  game.settings.register(MODULE_ID, SHOW_STATS_SETTING, {
    name: "Show Critical / Fumble Counters in Player List",
    hint: "Show each user's qualified critical and fumble totals on a compact line beneath their name in Foundry's Players list.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshPlayerList()
  });

  game.settings.register(MODULE_ID, ACTION_DIALOGS_SETTING, {
    name: "Enable Action Dialogs for Stat Editing",
    hint: "Match Shared Dice-style editing: when enabled, GM Ctrl-click edits open a quantity dialog instead of adjusting by one.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * Increment the current rolling user's persistent world-user statistics.
 * These counters track qualified ZFT outcomes, not every natural 1/20 detected.
 */
export async function incrementCurrentUserOutcome(outcome) {
  if (outcome !== "critical" && outcome !== "fumble") return null;

  const user = game.user;
  if (!user) return null;

  const current = getUserOutcomeStats(user);
  const next = {
    criticals: current.criticals + (outcome === "critical" ? 1 : 0),
    fumbles: current.fumbles + (outcome === "fumble" ? 1 : 0)
  };

  try {
    await user.setFlag(MODULE_ID, STATS_FLAG, next);
    console.log(`[ZFT] 📈 v${VERSION} | Player outcome tracked | ${user.name}`, {
      outcome,
      criticals: next.criticals,
      fumbles: next.fumbles
    });
    return next;
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to update player critical/fumble counters`, {
      user: user.name,
      userId: user.id,
      outcome,
      error
    });
    return null;
  }
}

export function getUserOutcomeStats(userOrId) {
  const user = typeof userOrId === "string"
    ? game.users?.get(userOrId)
    : userOrId;

  const raw = user?.getFlag?.(MODULE_ID, STATS_FLAG) ?? {};

  return {
    criticals: normalizeCount(raw?.criticals),
    fumbles: normalizeCount(raw?.fumbles)
  };
}

export async function resetUserOutcomeStats(userOrId = game.user?.id) {
  const user = typeof userOrId === "string"
    ? game.users?.get(userOrId)
    : userOrId;

  if (!user) throw new Error("Unable to resolve the requested Foundry user");

  const canReset = user.id === game.user?.id || game.user?.isGM;
  if (!canReset) throw new Error("Only a GM or the user themselves can reset these counters");

  await user.setFlag(MODULE_ID, STATS_FLAG, { criticals: 0, fumbles: 0 });
  return { criticals: 0, fumbles: 0 };
}

/**
 * Reset persistent outcome counters for every Foundry user shown in the Players list,
 * including GM accounts. This does not touch sidebar history, chat messages,
 * or Active Effects.
 */
export async function resetAllPlayerOutcomeStats() {
  if (!game.user?.isGM) throw new Error("Only a GM can reset all ZFT critical/fumble counters");

  const players = Array.from(game.users ?? []);
  const resetUsers = [];

  for (const user of players) {
    const current = getUserOutcomeStats(user);
    if (current.criticals === 0 && current.fumbles === 0) continue;

    await user.setFlag(MODULE_ID, STATS_FLAG, { criticals: 0, fumbles: 0 });
    resetUsers.push({
      id: user.id,
      name: user.name,
      previous: current
    });
  }

  refreshPlayerList();

  console.log(
    `[ZFT] 🧹 v${VERSION} | Reset player Critical/Fumble counters | ${resetUsers.length} user${resetUsers.length === 1 ? "" : "s"}`,
    resetUsers
  );

  return {
    resetCount: resetUsers.length,
    users: resetUsers
  };
}

export async function setUserOutcomeStats(userOrId, stats = {}) {
  const user = resolveUser(userOrId);
  if (!user) throw new Error("Unable to resolve the requested Foundry user");
  if (!game.user?.isGM) throw new Error("Only a GM can manually edit ZFT critical/fumble counters");

  const current = getUserOutcomeStats(user);
  const next = {
    criticals: stats.criticals === undefined ? current.criticals : normalizeCount(stats.criticals),
    fumbles: stats.fumbles === undefined ? current.fumbles : normalizeCount(stats.fumbles)
  };

  await user.setFlag(MODULE_ID, STATS_FLAG, next);
  return next;
}

export async function adjustUserOutcomeStats(userOrId, adjustments = {}) {
  const user = resolveUser(userOrId);
  if (!user) throw new Error("Unable to resolve the requested Foundry user");
  if (!game.user?.isGM) throw new Error("Only a GM can manually edit ZFT critical/fumble counters");

  const current = getUserOutcomeStats(user);
  return setUserOutcomeStats(user, {
    criticals: Math.max(0, current.criticals + normalizeDelta(adjustments.criticals)),
    fumbles: Math.max(0, current.fumbles + normalizeDelta(adjustments.fumbles))
  });
}

function onRenderPlayers(_playersApp, html) {
  const root = resolveHtmlRoot(html);
  if (!root) return;

  queueMicrotask(() => {
    try {
      renderPlayerStats(root);
    } catch (error) {
      console.error(`[ZFT] ❌ v${VERSION} | Failed to render player-list counters`, error);
    }
  });
}

function onUpdateUser(user, changes) {
  if (!hasStatsChange(changes)) return;

  updateVisibleUserRow(user);
}

function renderPlayerStats(root) {
  const showStats = getShowStatsSetting();

  root.querySelectorAll("li[data-user-id]").forEach(row => {
    clearStatsFromRow(row);
    if (!showStats) return;

    const user = game.users?.get(row.dataset.userId);
    if (!user) return;

    const container = createStatsContainer(user);
    insertStatsContainer(row, container);
  });
}

function updateVisibleUserRow(user) {
  const root = resolvePlayersRoot();
  if (!root) return;

  const row = Array.from(root.querySelectorAll("li[data-user-id]"))
    .find(element => element.dataset.userId === user.id);
  if (!row) return;

  clearStatsFromRow(row);
  if (!getShowStatsSetting()) return;

  insertStatsContainer(row, createStatsContainer(user));
}

function createStatsContainer(user) {
  const stats = getUserOutcomeStats(user);
  const container = document.createElement("span");
  container.className = "zft-cf-player-stats";
  container.dataset.userId = user.id;
  container.dataset.moduleId = MODULE_ID;

  container.appendChild(createStatChip({
    user,
    type: "critical",
    icon: "fa-solid fa-burst",
    label: "Criticals",
    count: stats.criticals
  }));

  container.appendChild(createStatChip({
    user,
    type: "fumble",
    icon: "fa-solid fa-skull",
    label: "Fumbles",
    count: stats.fumbles
  }));

  return container;
}

function createStatChip({ user, type, icon, label, count }) {
  const chip = document.createElement("span");
  chip.className = `zft-cf-player-stat ${type}`;
  chip.dataset.statType = type;
  chip.dataset.userId = user.id;

  const editHint = game.user?.isGM
    ? " | Ctrl/Cmd + Left Click: +1 | Ctrl/Cmd + Right Click: -1"
    : "";
  chip.title = `${label}: ${count}${editHint}`;
  chip.setAttribute("aria-label", `${label}: ${count}`);

  const iconElement = document.createElement("i");
  iconElement.className = icon;
  iconElement.setAttribute("aria-hidden", "true");

  // Keep the numeric value as a plain text node rather than another <span>.
  // Foundry and several player-list modules apply broad span/flex rules inside
  // the Players list; a text node cannot inherit those sizing rules, which keeps
  // the icon and value visually locked together.
  chip.append(iconElement, document.createTextNode(String(count)));

  if (game.user?.isGM) {
    chip.classList.add("editable");
    chip.addEventListener("pointerup", onStatPointerUp);
    chip.addEventListener("contextmenu", onStatContextMenu, { capture: true });
  }

  return chip;
}

async function onStatPointerUp(event) {
  if (event.button !== 0) return;
  if (!(event.ctrlKey || event.metaKey)) return;

  event.preventDefault();
  event.stopPropagation();
  await handleManualStatEdit(event.currentTarget, +1, event);
}

async function onStatContextMenu(event) {
  if (!(event.ctrlKey || event.metaKey)) return;

  event.preventDefault();
  event.stopPropagation();
  await handleManualStatEdit(event.currentTarget, -1, event);
}

async function handleManualStatEdit(chip, direction, event) {
  if (!game.user?.isGM) return;

  const userId = chip?.dataset?.userId;
  const statType = chip?.dataset?.statType;
  const user = resolveUser(userId);
  if (!user || !["critical", "fumble"].includes(statType)) return;

  try {
    const current = getUserOutcomeStats(user);
    const key = statType === "critical" ? "criticals" : "fumbles";

    if (getActionDialogsSetting()) {
      const delta = await showAdjustmentDialog({
        user,
        statType,
        current: current[key],
        event
      });
      if (!delta) return;
      await adjustUserOutcomeStats(user, { [key]: delta });
      return;
    }

    await adjustUserOutcomeStats(user, { [key]: direction });
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to manually adjust player stats`, error);
    ui.notifications?.error?.(`ZFT Critical Fumbles: ${error.message ?? error}`);
  }
}

async function showAdjustmentDialog({ user, statType, current, event }) {
  const DialogClass = foundry?.applications?.api?.Dialog;
  const NumberField = foundry?.data?.fields?.NumberField;
  if (!DialogClass?.input || !NumberField) {
    throw new Error("Foundry action dialog API is unavailable");
  }

  const label = statType === "critical" ? "Criticals" : "Fumbles";
  const quantGroup = new NumberField({
    min: -current,
    max: 9999,
    integer: true,
    label: `Adjust ${label}`
  }).toFormGroup({}, { name: "quant", value: 0 }).outerHTML;

  const result = await DialogClass.input({
    window: { title: `${label} - ${user.name}` },
    position: {
      left: (event?.screenX ?? 0) + 20,
      top: event?.screenY ?? 0
    },
    content: quantGroup,
    rejectClose: false,
    modal: true
  });

  return normalizeDelta(result?.quant);
}

function insertStatsContainer(row, container) {
  // Keep ZFT out of the row's horizontal resource lane. The native player-name
  // element already owns the name area, so nesting the counters there gives us
  // a true second line without touching Shared Dice or any other module's DOM.
  const playerName = row.querySelector(":scope > .player-name")
    ?? row.querySelector(".player-name");

  if (playerName) {
    row.classList.add("zft-cf-stats-below-name");
    playerName.appendChild(container);
    return;
  }

  // Defensive fallback for a future Foundry/player-list markup change. This is
  // intentionally generic and does not inspect or modify any third-party UI.
  row.classList.add("zft-cf-stats-fallback");
  row.appendChild(container);
}

function clearStatsFromRow(row) {
  row.querySelectorAll(".zft-cf-player-stats").forEach(element => element.remove());
  row.classList.remove("zft-cf-stats-below-name", "zft-cf-stats-fallback");
}

function getActionDialogsSetting() {
  try {
    return Boolean(game.settings?.get(MODULE_ID, ACTION_DIALOGS_SETTING));
  } catch {
    return false;
  }
}

function getShowStatsSetting() {
  try {
    return Boolean(game.settings?.get(MODULE_ID, SHOW_STATS_SETTING));
  } catch {
    return true;
  }
}

function refreshPlayerList() {
  try {
    ui.players?.render?.();
  } catch (error) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Unable to refresh Players list`, error);
  }
}

function resolvePlayersRoot() {
  const element = ui.players?.element;
  return resolveHtmlRoot(element) ?? document.querySelector("#players");
}

function resolveHtmlRoot(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

function hasStatsChange(changes) {
  const flags = changes?.flags?.[MODULE_ID];
  if (flags && Object.prototype.hasOwnProperty.call(flags, STATS_FLAG)) return true;

  const flatKey = `flags.${MODULE_ID}.${STATS_FLAG}`;
  return Object.keys(changes ?? {}).some(key => key === flatKey || key.startsWith(`${flatKey}.`));
}

function resolveUser(userOrId) {
  if (!userOrId) return null;
  return typeof userOrId === "string" ? game.users?.get(userOrId) : userOrId;
}

function normalizeDelta(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function normalizeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}
