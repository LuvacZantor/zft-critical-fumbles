import { resolveSingleActiveD20 } from "./d20-detector.mjs";
import { ensureCriticalContent, ensureFumbleContent, rollCriticalResult, rollFumbleResult } from "./content-manager.mjs";
import {
  adjustUserOutcomeStats,
  getUserOutcomeStats,
  incrementCurrentUserOutcome,
  registerPlayerStatsHooks,
  registerPlayerStatsSetting,
  resetUserOutcomeStats,
  setUserOutcomeStats
} from "./player-stats.mjs";

const MODULE_ID = "zft-critical-fumbles";
const VERSION = "1.1.23";
const DEBUG_SETTING = "debugMode";
const CRITICAL_SETTING = "enableCriticals";
const CRITICAL_SOUND_ENABLED_SETTING = "enableCriticalSound";
const FUMBLE_SOUND_ENABLED_SETTING = "enableFumbleSound";
const SOUND_VOLUME_SETTING = "soundVolume";
const SOUND_PACK_ID = `${MODULE_ID}.critical-fumble-sounds`;
const CRITICAL_PLAYLIST_ID = "ZFTCritSounds001";
const FUMBLE_PLAYLIST_ID = "ZFTFumbleSounds1";
const CRITICAL_PLAYLIST_NAME = "ZFT Critical Sounds";
const FUMBLE_PLAYLIST_NAME = "ZFT Fumble Sounds";
const RECENT_WINDOW_MS = 2500;

const FUMBLE_SETTINGS = Object.freeze({
  attack: { key: "fumbleAttack", label: "Fumble on Attack Rolls", default: true },
  ability: { key: "fumbleAbility", label: "Fumble on Ability Checks", default: true },
  skill: { key: "fumbleSkill", label: "Fumble on Skill Checks", default: true },
  save: { key: "fumbleSave", label: "Fumble on Saving Throws", default: true },
  "death-save": { key: "fumbleDeathSave", label: "Fumble on Death Saves", default: true },
  tool: { key: "fumbleTool", label: "Fumble on Tool Checks", default: true },
  initiative: { key: "fumbleInitiative", label: "Fumble on Initiative Rolls", default: true },
  concentration: { key: "fumbleConcentration", label: "Fumble on Concentration Rolls", default: true },
  generic: { key: "fumbleGeneric", label: "Fumble on Generic d20 Rolls", default: true }
});

const processedRolls = new WeakSet();
const recentFingerprints = new Map();

console.log(`[ZFT] 🛠️ v${VERSION} | Critical Fumbles module script loaded`);
registerPlayerStatsHooks({ version: VERSION });

Hooks.once("init", () => {
  console.log(`[ZFT] 🚀 v${VERSION} | Critical Fumbles initializing`);
  registerSettings();
  registerPlayerStatsSetting();
});

Hooks.once("ready", async () => {
  if (game.system?.id !== "dnd5e") {
    console.warn(`[ZFT] ⚠️ v${VERSION} | ${MODULE_ID} requires the D&D5e system; current system is ${game.system?.id ?? "unknown"}`);
    return;
  }

  await ensureBundledSoundPlaylists();
  await ensureCriticalContent({ version: VERSION });
  await ensureFumbleContent({ version: VERSION });
  registerDnd5eRollHooks();
  Hooks.on("createChatMessage", onCreateChatMessage);
  registerPublicApi();

  console.log(
    `[ZFT] ✅ v${VERSION} | Critical Fumbles ready | Foundry ${game.version} | D&D5e ${game.system.version}`
  );
});

/**
 * Register structured D&D5e roll hooks. These provide the best classification
 * context. The generic ChatMessage fallback catches d20 rolls which do not
 * pass through one of these system hooks, including /r 1d20.
 */
function registerDnd5eRollHooks() {
  const hooks = [
    ["dnd5e.rollAttack", "attack"],
    ["dnd5e.rollAbilityCheck", "ability"],
    ["dnd5e.rollSkill", "skill"],
    ["dnd5e.rollSkillV2", "skill"],
    ["dnd5e.rollSavingThrow", "save"],
    ["dnd5e.rollDeathSave", "death-save"],
    ["dnd5e.rollToolCheck", "tool"],
    ["dnd5e.rollToolCheckV2", "tool"],
    ["dnd5e.rollInitiative", "initiative"],
    ["dnd5e.rollConcentration", "concentration"]
  ];

  for (const [hookName, rollType] of hooks) {
    Hooks.on(hookName, (...args) => onStructuredRoll(hookName, rollType, args));
  }

  console.log(`[ZFT] 🪝 v${VERSION} | D&D5e d20 roll hooks registered`);
}

/**
 * Handle a structured D&D5e roll hook.
 *
 * @param {string} hookName
 * @param {string} rollType
 * @param {unknown[]} args
 */
async function onStructuredRoll(hookName, rollType, args) {
  try {
    const context = normalizeStructuredHookArgs(args);

    if (!context.rolls.length) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | ${hookName} fired but no roll could be resolved`, args);
      return;
    }

    for (const roll of context.rolls) {
      await processRoll({
        roll,
        rollType,
        source: hookName,
        actor: context.actor,
        item: context.item,
        activity: context.activity,
        speaker: null,
        message: null
      });
    }
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed while processing ${hookName}`, error);
  }
}

/**
 * Generic fallback for any ChatMessage containing a d20 roll. This catches
 * manual /r rolls and module-generated rolls which do not expose a structured
 * D&D5e hook we registered above.
 */
async function onCreateChatMessage(message) {
  try {
    // createChatMessage is observed by every connected client. Only the
    // originating user's client should feed the generic fallback into the
    // consequence pipeline, otherwise every client could create duplicate
    // ZFT cards or broadcast the same sound more than once.
    const authorId = message?.author?.id ?? message?.user?.id ?? message?.user;
    if (authorId && authorId !== game.user?.id) return;

    const rolls = getMessageRolls(message);
    if (!rolls.length) return;

    const context = resolveChatMessageContext(message);

    for (const roll of rolls) {
      await processRoll({
        roll,
        rollType: "generic",
        source: "createChatMessage",
        actor: context.actor,
        item: null,
        activity: null,
        speaker: message.speaker ?? null,
        message
      });
    }
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed while processing generic chat roll`, error);
  }
}

/**
 * Universal d20 processing pipeline.
 */
async function processRoll({ roll, rollType, source, actor, item, activity, speaker, message }) {
  if (!isRollLike(roll)) return;

  if (processedRolls.has(roll)) {
    debugRoll({
      roll,
      rollType,
      source,
      actor,
      item,
      activity,
      message,
      status: "DUPLICATE",
      reason: "Roll object was already processed"
    });
    return;
  }

  const resolved = resolveSingleActiveD20(roll);

  if (!resolved.eligible) {
    const status = resolved.reason === "multiple-active-d20-results" ? "IGNORED" : "NO D20 MATCH";
    const reason = resolved.reason === "multiple-active-d20-results"
      ? `${resolved.activeCount} active d20 results remained after keep/drop resolution`
      : "No single active d20 result was found";

    debugRoll({
      roll,
      rollType,
      source,
      actor,
      item,
      activity,
      message,
      status,
      reason
    });

    await postDebugChatCard({
      roll,
      rollType,
      source,
      actor,
      item,
      activity,
      natural: null,
      outcome: null,
      status,
      reason
    });
    return;
  }

  const detection = resolved.detection;
  const natural = detection.natural;
  const policy = evaluateRollPolicy(detection, rollType);
  const fingerprint = createRollFingerprint(roll, natural, actor, speaker);

  if (isRecentDuplicate(fingerprint, rollType)) {
    processedRolls.add(roll);

    debugRoll({
      roll,
      rollType,
      source,
      actor,
      item,
      activity,
      message,
      natural,
      detectedOutcome: detection.outcome,
      outcome: policy.outcome,
      status: "DUPLICATE",
      reason: "Generic chat fallback duplicated a structured D&D5e roll"
    });
    return;
  }

  processedRolls.add(roll);
  rememberFingerprint(fingerprint, rollType);

  const status = policy.status;
  const reason = policy.reason;

  debugRoll({
    roll,
    rollType,
    source,
    actor,
    item,
    activity,
    message,
    natural,
    detectedOutcome: detection.outcome,
    outcome: policy.outcome,
    status,
    reason
  });

  await postDebugChatCard({
    roll,
    rollType,
    source,
    actor,
    item,
    activity,
    natural,
    detectedOutcome: detection.outcome,
    outcome: policy.outcome,
    status,
    reason
  });

  if (!policy.outcome) return;

  if (policy.outcome === "fumble") {
    console.warn(
      `[ZFT] ⚠️ v${VERSION} | Natural 1 detected | Type: ${rollType}`,
      {
        source,
        actor: actor?.name ?? null,
        item: item?.name ?? null,
        activity: activity?.name ?? null
      }
    );
  }

  if (policy.outcome === "critical") {
    console.log(
      `[ZFT] ✅ v${VERSION} | Natural 20 detected | Type: ${rollType}`,
      {
        source,
        actor: actor?.name ?? null,
        item: item?.name ?? null,
        activity: activity?.name ?? null
      }
    );
  }

  await incrementCurrentUserOutcome(policy.outcome);
  await playOutcomeSound(policy.outcome);

  if (policy.outcome === "critical") {
    const criticalResult = await rollCriticalResult({ version: VERSION });

    if (criticalResult?.page) {
      await postOutcomeResultChatCard({
        natural,
        outcome: "critical",
        rollType,
        actor,
        item,
        activity,
        speaker,
        outcomeResult: criticalResult
      });
      return;
    }

    console.warn(`[ZFT] ⚠️ v${VERSION} | Critical content unavailable; using fallback detection card`);
  }

  if (policy.outcome === "fumble") {
    const fumbleResult = await rollFumbleResult({ version: VERSION, rollType });

    if (fumbleResult?.page) {
      await postOutcomeResultChatCard({
        natural,
        outcome: "fumble",
        rollType,
        actor,
        item,
        activity,
        speaker,
        outcomeResult: fumbleResult
      });
      return;
    }

    console.warn(`[ZFT] ⚠️ v${VERSION} | No bundled ${formatRollType(rollType)} fumble content is available; using fallback detection card`);
  }

  await postTestChatCard({
    natural,
    outcome: policy.outcome,
    rollType,
    actor,
    item,
    activity,
    speaker
  });
}

function evaluateRollPolicy(detection, rollType) {
  const natural = detection?.natural ?? null;

  if (natural === 20) {
    if (rollType !== "attack") {
      return {
        outcome: null,
        status: "NATURAL 20: NOT ELIGIBLE",
        reason: "Critical hits only apply to attack rolls"
      };
    }

    if (!isCriticalEnabled()) {
      return {
        outcome: null,
        status: "NATURAL 20: CRITICALS DISABLED",
        reason: "Critical handling is disabled in Module Settings"
      };
    }

    return {
      outcome: "critical",
      status: "MATCH: CRITICAL",
      reason: null
    };
  }

  if (natural === 1) {
    if (isFumbleEnabled(rollType)) {
      return {
        outcome: "fumble",
        status: "MATCH: FUMBLE",
        reason: null
      };
    }

    return {
      outcome: null,
      status: "NATURAL 1: FUMBLE DISABLED",
      reason: `Fumbles are disabled for ${formatRollType(rollType)} rolls`
    };
  }

  return {
    outcome: null,
    status: "NO MATCH",
    reason: "Active d20 was neither 1 nor 20"
  };
}

function isCriticalEnabled() {
  try {
    return Boolean(game.settings?.get(MODULE_ID, CRITICAL_SETTING));
  } catch {
    return true;
  }
}

function isFumbleEnabled(rollType) {
  const setting = FUMBLE_SETTINGS[rollType] ?? FUMBLE_SETTINGS.generic;

  try {
    return Boolean(game.settings?.get(MODULE_ID, setting.key));
  } catch {
    return setting.default;
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, CRITICAL_SETTING, {
    name: "Enable Critical Handling",
    hint: "Allow natural 20s on Attack rolls to qualify for the ZFT critical system. Disable this if you only want fumble handling.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: enabled => {
      console.log(`[ZFT] ⚙️ v${VERSION} | Critical handling ${enabled ? "enabled" : "disabled"}`);
    }
  });

  game.settings.register(MODULE_ID, DEBUG_SETTING, {
    name: "Debug Mode",
    hint: "Report every roll ZFT Critical Fumbles observes to the console and a private debug chat card, including formula, d20 result, classification, and whether the roll matched or was ignored.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: enabled => {
      console.log(`[ZFT] 🔍 v${VERSION} | Debug mode ${enabled ? "enabled" : "disabled"}`);
    }
  });

  game.settings.register(MODULE_ID, CRITICAL_SOUND_ENABLED_SETTING, {
    name: "Enable Critical Sound",
    hint: `Play a random sound from the bundled ${CRITICAL_PLAYLIST_NAME} Playlist when ZFT qualifies a natural 20 Attack roll as a critical. Add tracks in Compendium Packs > ZFT Critical Fumbles > Critical & Fumble Sounds.`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: enabled => {
      console.log(`[ZFT] 🔊 v${VERSION} | Critical sound ${enabled ? "enabled" : "disabled"}`);
    }
  });

  game.settings.register(MODULE_ID, FUMBLE_SOUND_ENABLED_SETTING, {
    name: "Enable Fumble Sound",
    hint: `Play a random sound from the bundled ${FUMBLE_PLAYLIST_NAME} Playlist when ZFT qualifies a natural 1 as a fumble. Add tracks in Compendium Packs > ZFT Critical Fumbles > Critical & Fumble Sounds.`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: enabled => {
      console.log(`[ZFT] 🔊 v${VERSION} | Fumble sound ${enabled ? "enabled" : "disabled"}`);
    }
  });

  game.settings.register(MODULE_ID, SOUND_VOLUME_SETTING, {
    name: "Critical / Fumble Sound Volume",
    hint: "Master playback volume used by ZFT for both Critical and Fumble one-shot sounds. Each PlaylistSound's own volume is also respected.",
    scope: "world",
    config: true,
    type: Number,
    default: 0.8,
    range: {
      min: 0,
      max: 1,
      step: 0.05
    },
    onChange: volume => {
      console.log(`[ZFT] 🔊 v${VERSION} | Critical/Fumble sound volume changed | ${volume}`);
    }
  });

  for (const [rollType, setting] of Object.entries(FUMBLE_SETTINGS)) {
    game.settings.register(MODULE_ID, setting.key, {
      name: setting.label,
      hint: `Allow a natural 1 on ${formatRollType(rollType)} rolls to qualify for the ZFT fumble system.`,
      scope: "world",
      config: true,
      type: Boolean,
      default: setting.default,
      onChange: enabled => {
        console.log(
          `[ZFT] ⚙️ v${VERSION} | Fumble eligibility changed | ${formatRollType(rollType)}: ${enabled ? "enabled" : "disabled"}`
        );
      }
    });
  }

  console.log(`[ZFT] ⚙️ v${VERSION} | Settings registered`);
}

function registerPublicApi() {
  game.zftCriticalFumbles = {
    get debug() {
      return getDebugMode();
    },

    async setDebug(enabled) {
      const value = Boolean(enabled);
      await game.settings.set(MODULE_ID, DEBUG_SETTING, value);
      return value;
    },

    async toggleDebug() {
      const value = !getDebugMode();
      await game.settings.set(MODULE_ID, DEBUG_SETTING, value);
      return value;
    },

    isCriticalEnabled() {
      return isCriticalEnabled();
    },

    isFumbleEnabled(rollType) {
      return isFumbleEnabled(rollType);
    },

    getUserStats(userOrId = game.user?.id) {
      return getUserOutcomeStats(userOrId);
    },

    async resetUserStats(userOrId = game.user?.id) {
      return resetUserOutcomeStats(userOrId);
    },

    async setUserStats(userOrId, stats) {
      return setUserOutcomeStats(userOrId, stats);
    },

    async adjustUserStats(userOrId, adjustments) {
      return adjustUserOutcomeStats(userOrId, adjustments);
    }
  };

  console.log(`[ZFT] 🔌 v${VERSION} | Public API registered`);
}

function getDebugMode() {
  try {
    return Boolean(game.settings?.get(MODULE_ID, DEBUG_SETTING));
  } catch {
    return false;
  }
}

async function playOutcomeSound(outcome) {
  const isCritical = outcome === "critical";
  const isFumble = outcome === "fumble";
  if (!isCritical && !isFumble) return;

  const enabledSetting = isCritical
    ? CRITICAL_SOUND_ENABLED_SETTING
    : FUMBLE_SOUND_ENABLED_SETTING;

  let enabled = false;
  let volume = 0.8;

  try {
    enabled = Boolean(game.settings.get(MODULE_ID, enabledSetting));
    volume = Number(game.settings.get(MODULE_ID, SOUND_VOLUME_SETTING));
  } catch (error) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Unable to read ${outcome} sound settings`, error);
    return;
  }

  if (!enabled) return;

  const playlist = await getBundledSoundPlaylist(outcome);
  if (!playlist) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Bundled ${formatRollType(outcome)} Playlist could not be resolved`);
    return;
  }

  const availableSounds = Array.from(playlist.sounds ?? []).filter(sound => String(sound?.path ?? "").trim());
  if (!availableSounds.length) {
    console.warn(
      `[ZFT] ⚠️ v${VERSION} | ${playlist.name} contains no playable sounds | Add tracks to ${SOUND_PACK_ID}`
    );
    return;
  }

  const selected = availableSounds[Math.floor(Math.random() * availableSounds.length)];
  const src = String(selected.path).trim();

  if (!Number.isFinite(volume)) volume = 0.8;
  volume = Math.clamp ? Math.clamp(volume, 0, 1) : Math.min(1, Math.max(0, volume));

  let trackVolume = Number(selected.volume);
  if (!Number.isFinite(trackVolume)) trackVolume = 1;
  trackVolume = Math.clamp ? Math.clamp(trackVolume, 0, 1) : Math.min(1, Math.max(0, trackVolume));

  const finalVolume = volume * trackVolume;

  try {
    const AudioHelperClass = globalThis.foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;

    if (!AudioHelperClass?.play) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Foundry AudioHelper API is unavailable; ${outcome} sound was not played`);
      return;
    }

    // The Playlist is used as a module-owned sound pool. We play the selected
    // track as a one-shot so current world music and ambience are untouched.
    await AudioHelperClass.play(
      {
        src,
        volume: finalVolume,
        autoplay: true,
        loop: false,
        channel: selected.channel ?? "interface"
      },
      true
    );

    console.log(`[ZFT] 🔊 v${VERSION} | ${formatRollType(outcome)} sound played`, {
      playlist: playlist.name,
      sound: selected.name,
      src,
      volume: finalVolume
    });
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to play ${outcome} sound`, {
      playlist: playlist.name,
      sound: selected.name,
      src,
      volume: finalVolume,
      error
    });
  }
}

async function getBundledSoundPlaylist(outcome) {
  const playlistId = outcome === "critical" ? CRITICAL_PLAYLIST_ID : FUMBLE_PLAYLIST_ID;
  const pack = game.packs?.get(SOUND_PACK_ID);
  if (!pack) return null;

  try {
    return await pack.getDocument(playlistId);
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to resolve bundled sound Playlist`, {
      pack: SOUND_PACK_ID,
      playlistId,
      error
    });
    return null;
  }
}

async function ensureBundledSoundPlaylists() {
  const pack = game.packs?.get(SOUND_PACK_ID);
  if (!pack) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Sound compendium not found | ${SOUND_PACK_ID}`);
    return;
  }

  // The bundled Playlist documents only need to be seeded once. Use a single
  // active GM to avoid duplicate creation when several clients join together.
  if (!isPrimaryActiveGM()) return;

  try {
    await pack.getIndex();

    const shuffleMode = getShufflePlaylistMode();
    const playlistDefinitions = [
      {
        id: CRITICAL_PLAYLIST_ID,
        name: CRITICAL_PLAYLIST_NAME,
        role: "critical",
        description: "Sound pool used by ZFT Critical Fumbles for qualified critical hits. Add one-shot audio tracks to this Playlist."
      },
      {
        id: FUMBLE_PLAYLIST_ID,
        name: FUMBLE_PLAYLIST_NAME,
        role: "fumble",
        description: "Sound pool used by ZFT Critical Fumbles for qualified fumbles. Add one-shot audio tracks to this Playlist."
      }
    ];

    const missing = [];
    const migrations = [];

    for (const definition of playlistDefinitions) {
      if (!pack.index.has(definition.id)) {
        missing.push(createBundledPlaylistSource(definition));
        continue;
      }

      const playlist = await pack.getDocument(definition.id);
      if (!playlist) continue;

      // v1.1.10 created these Playlists without an explicit playback mode,
      // causing Foundry to default them to Sequential. Correct that once, then
      // leave future user changes alone.
      const modeInitialized = playlist.getFlag?.(MODULE_ID, "modeInitialized") === true;
      if (!modeInitialized) migrations.push(playlist);
    }

    if (!missing.length && !migrations.length) {
      console.log(`[ZFT] 🔊 v${VERSION} | Bundled sound Playlists ready | Mode: Shuffle`);
      return;
    }

    const wasLocked = Boolean(pack.locked);

    try {
      if (wasLocked) await pack.configure({ locked: false });

      const PlaylistClass = pack.documentClass;
      if (!PlaylistClass?.createDocuments) {
        throw new Error("Playlist document implementation is unavailable");
      }

      if (missing.length) {
        await PlaylistClass.createDocuments(missing, {
          pack: SOUND_PACK_ID,
          keepId: true
        });
      }

      for (const playlist of migrations) {
        await playlist.update({
          mode: shuffleMode,
          [`flags.${MODULE_ID}.modeInitialized`]: true
        });
      }
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }

    await pack.getIndex({ fields: ["name", "flags", "mode"] });

    if (missing.length) {
      console.log(
        `[ZFT] ✅ v${VERSION} | Bundled sound Playlists generated in Shuffle mode | ${missing.map(entry => entry.name).join(", ")}`
      );
    }

    if (migrations.length) {
      console.log(
        `[ZFT] ✅ v${VERSION} | Existing bundled sound Playlists migrated to Shuffle mode | ${migrations.map(entry => entry.name).join(", ")}`
      );
    }
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to initialize bundled sound Playlists`, error);
  }
}

function createBundledPlaylistSource({ id, name, role, description }) {
  return {
    _id: id,
    name,
    description,
    mode: getShufflePlaylistMode(),
    sounds: [],
    flags: {
      [MODULE_ID]: {
        role,
        managed: true,
        modeInitialized: true
      }
    }
  };
}

function getShufflePlaylistMode() {
  return globalThis.CONST?.PLAYLIST_MODES?.SHUFFLE ?? 1;
}

function isPrimaryActiveGM() {
  if (!game.user?.isGM) return false;

  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0]?.id === game.user.id;
}

function debugRoll({ roll, rollType, source, actor, item, activity, message, natural = null, detectedOutcome = null, outcome = null, status, reason = null }) {
  if (!getDebugMode()) return;

  const d20Results = summarizeD20Results(roll);
  const label = `[ZFT] 🔍 v${VERSION} | Roll observed | ${status}`;

  console.groupCollapsed(label);
  console.log("Source:", source);
  console.log("Type:", rollType);
  console.log("Formula:", roll?.formula ?? "Unknown");
  console.log("Total:", roll?.total ?? null);
  console.log("d20 Results:", d20Results.length ? d20Results : "None");
  console.log("Active Natural:", natural);
  console.log("Detected Natural Event:", detectedOutcome ?? "none");
  console.log("Qualified Outcome:", outcome ?? "none");
  console.log("Actor:", actor?.name ?? null);
  console.log("Item:", item?.name ?? null);
  console.log("Activity:", activity?.name ?? null);
  console.log("Message ID:", message?.id ?? null);
  if (reason) console.log("Reason:", reason);
  console.log("Roll:", roll);
  console.groupEnd();
}

function summarizeD20Results(roll) {
  const results = [];
  const d20Dice = Array.from(roll?.dice ?? []).filter(die => Number(die?.faces) === 20);

  d20Dice.forEach((die, dieIndex) => {
    Array.from(die?.results ?? []).forEach((result, resultIndex) => {
      const natural = Number(result?.result);
      if (!Number.isFinite(natural)) return;

      const active = result?.active !== false && result?.discarded !== true;
      results.push({
        natural,
        state: active ? "active" : "discarded",
        dieIndex,
        resultIndex
      });
    });
  });

  return results;
}

/**
 * Normalize common D&D5e hook signatures without coupling the detector to a
 * specific Foundry/D&D5e generation.
 */
function normalizeStructuredHookArgs(args) {
  const rolls = [];

  for (const arg of args) {
    collectRolls(arg, rolls, 0);
  }

  const subject = args.find(arg => arg?.subject)?.subject ?? null;
  const directItem = args.find(arg => isItemLike(arg)) ?? null;
  const directActor = args.find(arg => isActorLike(arg)) ?? null;

  const activity = subject?.item || subject?.actor ? subject : null;
  const item = activity?.item
    ?? (isItemLike(activity?.parent) ? activity.parent : null)
    ?? directItem;

  const actor = isActorLike(subject)
    ? subject
    : activity?.actor
      ?? item?.actor
      ?? (isActorLike(item?.parent) ? item.parent : null)
      ?? directActor
      ?? null;

  return {
    rolls: [...new Set(rolls)],
    actor,
    item,
    activity
  };
}

function collectRolls(value, target, depth) {
  if (!value || depth > 2) return;

  if (isRollLike(value)) {
    target.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectRolls(entry, target, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  for (const key of ["roll", "rolls"]) {
    if (value[key]) collectRolls(value[key], target, depth + 1);
  }
}

function getMessageRolls(message) {
  const rolls = [];

  if (Array.isArray(message?.rolls)) {
    rolls.push(...message.rolls.filter(isRollLike));
  }

  if (isRollLike(message?.roll)) {
    rolls.push(message.roll);
  }

  return [...new Set(rolls)];
}

function resolveChatMessageContext(message) {
  const actorId = message?.speaker?.actor;
  const actor = actorId ? game.actors?.get(actorId) ?? null : null;
  return { actor };
}

function isRollLike(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.terms));
}

function isItemLike(value) {
  return Boolean(value && typeof value === "object" && value.documentName === "Item");
}

function isActorLike(value) {
  return Boolean(value && typeof value === "object" && value.documentName === "Actor");
}

function createRollFingerprint(roll, natural, actor, speaker) {
  const formula = String(roll.formula ?? "");
  const total = String(roll.total ?? "");
  const actorId = actor?.id ?? speaker?.actor ?? "";
  return `${actorId}|${formula}|${total}|${String(natural ?? "")}`;
}

function isRecentDuplicate(fingerprint, rollType) {
  pruneRecentFingerprints();

  const previous = recentFingerprints.get(fingerprint);
  if (!previous) return false;

  // Preserve the structured D&D5e event and suppress a generic ChatMessage
  // fallback for the same roll. Two separate structured events are not
  // automatically treated as duplicates.
  return previous.rollType !== "generic" && rollType === "generic";
}

function rememberFingerprint(fingerprint, rollType) {
  recentFingerprints.set(fingerprint, {
    timestamp: Date.now(),
    rollType
  });
}

function pruneRecentFingerprints() {
  const cutoff = Date.now() - RECENT_WINDOW_MS;

  for (const [fingerprint, data] of recentFingerprints) {
    if (data.timestamp < cutoff) recentFingerprints.delete(fingerprint);
  }
}

async function postDebugChatCard({ roll, rollType, source, actor, item, activity, natural, detectedOutcome = null, outcome, status, reason }) {
  if (!getDebugMode()) return;

  const d20Results = summarizeD20Results(roll);
  const resultText = d20Results.length
    ? d20Results.map(entry => `${entry.natural} (${entry.state})`).join(", ")
    : "None";
  const actorName = actor?.name ?? "Unresolved Actor";
  const rollName = activity?.name ?? item?.name ?? formatRollType(rollType);
  const matchClass = outcome === "critical"
    ? "critical"
    : outcome === "fumble"
      ? "fumble"
      : "debug";
  const matchLabel = outcome === "critical"
    ? "✅ CRITICAL MATCH"
    : outcome === "fumble"
      ? "⚠️ FUMBLE MATCH"
      : status === "IGNORED"
        ? "🔍 IGNORED"
        : status === "NATURAL 20: NOT ELIGIBLE"
          ? "🔍 NATURAL 20 - NOT A CRITICAL"
          : status === "NATURAL 20: CRITICALS DISABLED"
            ? "🔍 NATURAL 20 - CRITICALS DISABLED"
            : status === "NATURAL 1: FUMBLE DISABLED"
            ? "🔍 NATURAL 1 - FUMBLE DISABLED"
            : "🔍 NO MATCH";

  const content = `
    <div class="zft-critical-fumbles-card ${matchClass}">
      <div class="zft-cf-heading">${matchLabel}</div>
      <div class="zft-cf-details">
        <strong>${escapeHTML(actorName)}</strong><br>
        ${escapeHTML(rollName)}<br>
        <small>Roll Type: ${escapeHTML(formatRollType(rollType))}</small>
      </div>
      <div class="zft-cf-debug-grid">
        <div><strong>Formula:</strong> ${escapeHTML(roll?.formula ?? "Unknown")}</div>
        <div><strong>Total:</strong> ${escapeHTML(roll?.total ?? "")}</div>
        <div><strong>d20:</strong> ${escapeHTML(resultText)}</div>
        <div><strong>Active Natural:</strong> ${natural ?? "None"}</div>
        <div><strong>Detected Event:</strong> ${escapeHTML(detectedOutcome ?? "None")}</div>
        <div><strong>Qualified Outcome:</strong> ${escapeHTML(outcome ?? "None")}</div>
        <div><strong>Source:</strong> ${escapeHTML(source)}</div>
        ${reason ? `<div><strong>Reason:</strong> ${escapeHTML(reason)}</div>` : ""}
      </div>
      <div class="zft-cf-test">Private ZFT debug report</div>
    </div>
  `;

  await ChatMessage.create({
    whisper: [game.user.id],
    speaker: ChatMessage.getSpeaker(),
    content,
    flags: {
      [MODULE_ID]: {
        debugCard: true,
        status,
        natural,
        detectedOutcome,
        outcome,
        rollType,
        source
      }
    }
  });
}

async function postOutcomeResultChatCard({ natural, outcome, rollType, actor, item, activity, speaker, outcomeResult }) {
  const { table, tableRoll, result, page, seedKey } = outcomeResult;
  const isCritical = outcome === "critical";
  const cssClass = isCritical ? "critical" : "fumble";
  const heading = isCritical ? "💥 CRITICAL HIT" : "💀 FUMBLE";
  const actorName = actor?.name ?? "Unresolved Actor";
  const rollName = activity?.name ?? item?.name ?? formatRollType(rollType);
  const rawJournalContent = String(page?.text?.content ?? "").trim();
  const enrichedJournalContent = await enrichJournalContent(rawJournalContent, page, actor);

  const content = `
    <div class="zft-critical-fumbles-card ${cssClass} result-card">
      <div class="zft-cf-heading">${heading}</div>
      <div class="zft-cf-result-title">${escapeHTML(page?.name ?? (isCritical ? "Critical Result" : "Fumble Result"))}</div>
      <div class="zft-cf-result-content">${enrichedJournalContent || "<p>No Journal content was available for this result.</p>"}</div>
      <div class="zft-cf-details zft-cf-result-context">
        <strong>${escapeHTML(actorName)}</strong><br>
        ${escapeHTML(rollName)}<br>
        <small>Roll Type: ${escapeHTML(formatRollType(rollType))}</small>
      </div>
    </div>
  `;

  await ChatMessage.create({
    speaker: actor
      ? ChatMessage.getSpeaker({ actor })
      : (speaker ?? ChatMessage.getSpeaker()),
    content,
    flags: {
      [MODULE_ID]: {
        resultCard: true,
        natural,
        outcome,
        rollType,
        seedKey,
        tableUuid: table?.uuid ?? null,
        tableResultId: result?.id ?? null,
        tableRollTotal: tableRoll?.total ?? null,
        journalPageUuid: page?.uuid ?? null
      }
    }
  });

  console.log(`[ZFT] 📜 v${VERSION} | ${isCritical ? "Critical" : "Fumble"} result card posted | ${page?.name ?? seedKey ?? "Unknown Result"}`, {
    rollType,
    table: table?.name ?? null,
    tableRoll: tableRoll?.total ?? null,
    result: result?.name ?? result?.text ?? result?.id ?? null,
    journalPageUuid: page?.uuid ?? null
  });
}

async function enrichJournalContent(content, page, actor) {
  if (!content) return "";

  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor ?? globalThis.TextEditor;
  if (!TextEditorClass?.enrichHTML) return content;

  try {
    return await TextEditorClass.enrichHTML(content, {
      documents: true,
      links: true,
      rolls: true,
      secrets: Boolean(game.user?.isGM),
      relativeTo: page,
      rollData: actor?.getRollData?.() ?? {}
    });
  } catch (error) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Failed to enrich result Journal content; using raw HTML`, error);
    return content;
  }
}

async function postTestChatCard({ natural, outcome, rollType, actor, item, activity, speaker }) {
  const isCritical = outcome === "critical";
  const cssClass = isCritical ? "critical" : "fumble";
  const heading = isCritical ? "NATURAL 20 DETECTED" : "NATURAL 1 DETECTED";
  const icon = isCritical ? "💥" : "💀";
  const actorName = actor?.name ?? "Unresolved Actor";
  const rollName = activity?.name ?? item?.name ?? formatRollType(rollType);

  const content = `
    <div class="zft-critical-fumbles-card ${cssClass}">
      <div class="zft-cf-heading">${icon} ${heading}</div>
      <div class="zft-cf-natural">Natural ${natural}</div>
      <div class="zft-cf-details">
        <strong>${escapeHTML(actorName)}</strong><br>
        ${escapeHTML(rollName)}<br>
        <small>Roll Type: ${escapeHTML(formatRollType(rollType))}</small>
      </div>
      <div class="zft-cf-test">ZFT Critical Fumbles detection test</div>
    </div>
  `;

  await ChatMessage.create({
    speaker: actor
      ? ChatMessage.getSpeaker({ actor })
      : (speaker ?? ChatMessage.getSpeaker()),
    content,
    flags: {
      [MODULE_ID]: {
        testCard: true,
        natural,
        outcome,
        rollType
      }
    }
  });
}

function formatRollType(rollType) {
  return String(rollType ?? "generic")
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHTML(value) {
  const text = String(value ?? "");

  if (globalThis.foundry?.utils?.escapeHTML) {
    return foundry.utils.escapeHTML(text);
  }

  return text.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}
