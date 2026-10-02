import { resolveCriticalEffectPolarity, resolveCriticalEffectTarget } from "./critical-targeting.mjs";

const MODULE_ID = "zft-critical-fumbles";
const VERSION = "1.2.0";
const FUMBLE_REMINDER_SETTING = "enableFumbleReminderEffects";
const CRITICAL_REMINDER_SETTING = "enableCriticalReminderEffects";
const FUMBLE_ICON = `modules/${MODULE_ID}/icons/fumble-reminder.svg`;
const CRITICAL_ICON = `modules/${MODULE_ID}/icons/critical-reminder.svg`;
const CRITICAL_HARMFUL_ICON = `modules/${MODULE_ID}/icons/critical-target-reminder.svg`;

console.log(`[ZFT] 🛠️ v${VERSION} | Reminder effects script loaded`);

Hooks.once("init", () => {
  registerReminderSettings();
});

Hooks.once("ready", () => {
  if (game.system?.id !== "dnd5e") return;

  Hooks.on("createChatMessage", onCreateChatMessage);
  registerReminderApi();

  console.log(`[ZFT] ✅ v${VERSION} | Reminder effects ready | Foundry ${game.version} | D&D5e ${game.system.version}`);
});

function registerReminderSettings() {
  game.settings.register(MODULE_ID, FUMBLE_REMINDER_SETTING, {
    name: "Create Fumble Reminder Effects",
    hint: "Create a visual-only Active Effect on the rolling Actor when ZFT posts a Journal-driven fumble result. The effect contains the same Journal result wording and remains until manually removed.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: enabled => {
      console.log(`[ZFT] ⚙️ v${VERSION} | Fumble reminder effects ${enabled ? "enabled" : "disabled"}`);
    }
  });

  game.settings.register(MODULE_ID, CRITICAL_REMINDER_SETTING, {
    name: "Create Critical Reminder Effects",
    hint: "Create visual-only Active Effects for Journal-driven critical results. The critical Journal page decides whether the reminder belongs on the roller, attack target, an ally, or no Actor.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: enabled => {
      console.log(`[ZFT] ⚙️ v${VERSION} | Critical reminder effects ${enabled ? "enabled" : "disabled"}`);
    }
  });

  console.log(`[ZFT] ⚙️ v${VERSION} | Reminder effect settings registered`);
}

async function onCreateChatMessage(message) {
  try {
    const zftFlags = message?.flags?.[MODULE_ID];
    if (!zftFlags?.resultCard) return;

    const outcome = String(zftFlags.outcome ?? "").toLowerCase();
    if (outcome !== "critical" && outcome !== "fumble") return;
    if (!isReminderEnabled(outcome)) return;
    if (!isReminderAuthority(message)) return;

    const sourceActor = await resolveSourceActor(message, zftFlags);
    if (!sourceActor) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Reminder effect skipped | Unable to resolve rolling Actor`, {
        messageId: message?.id ?? null,
        speaker: message?.speaker ?? null,
        outcome
      });
      return;
    }

    const pageUuid = String(zftFlags.journalPageUuid ?? "").trim();
    const page = pageUuid ? await fromUuid(pageUuid) : null;

    if (!page || page.documentName !== "JournalEntryPage") {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Reminder effect skipped | Journal result page unavailable`, {
        actor: sourceActor.name,
        messageId: message?.id ?? null,
        journalPageUuid: pageUuid || null,
        outcome
      });
      return;
    }

    const effectPolarity = outcome === "critical"
      ? resolveCriticalEffectPolarity(page, zftFlags.seedKey ?? null)
      : "harmful";

    const recipient = outcome === "critical"
      ? await resolveCriticalRecipient({ message, page, sourceActor, zftFlags })
      : { actor: sourceActor, effectTarget: "roller" };

    if (!recipient?.actor) return;

    const actor = recipient.actor;
    const effectTarget = recipient.effectTarget ?? "roller";

    if (!actor.canUserModify?.(game.user, "update") && !game.user?.isGM) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Reminder effect skipped | Current user cannot update recipient Actor`, {
        actor: actor.name,
        actorUuid: actor.uuid,
        sourceActor: sourceActor.name,
        messageId: message?.id ?? null,
        outcome,
        effectTarget
      });
      return;
    }

    if (hasReminderForMessage(actor, message.id)) {
      console.log(`[ZFT] 🔍 v${VERSION} | Reminder effect already exists for result card | ${message.id} | ${actor.name}`);
      return;
    }

    const effectData = buildReminderEffectData({
      actor,
      sourceActor,
      message,
      page,
      outcome,
      effectTarget,
      effectPolarity,
      rollType: zftFlags.rollType ?? null,
      seedKey: zftFlags.seedKey ?? null
    });

    const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    const effect = created?.[0] ?? null;

    console.log(`[ZFT] ✅ v${VERSION} | ${formatOutcome(outcome)} reminder effect created`, {
      actor: actor.name,
      actorUuid: actor.uuid,
      sourceActor: sourceActor.name,
      effectTarget,
      effectPolarity,
      effectId: effect?.id ?? null,
      effectName: effect?.name ?? effectData.name,
      messageId: message.id,
      journalPageUuid: page.uuid
    });
  } catch (error) {
    console.error(`[ZFT] ❌ v${VERSION} | Failed to create reminder effect`, error);
  }
}

async function resolveCriticalRecipient({ message, page, sourceActor, zftFlags }) {
  const effectTarget = resolveCriticalEffectTarget(page, zftFlags.seedKey ?? null);

  if (effectTarget === "none") {
    console.log(`[ZFT] 🎯 v${VERSION} | Critical reminder intentionally omitted | ${page.name}`);
    return null;
  }

  if (effectTarget === "roller") {
    return { actor: sourceActor, effectTarget };
  }

  if (effectTarget === "target") {
    const capturedTargets = await resolveCapturedTargets(zftFlags);

    if (capturedTargets.length === 1) {
      return { actor: capturedTargets[0].actor, effectTarget };
    }

    const candidates = capturedTargets.length
      ? capturedTargets
      : getSceneCandidates(message, sourceActor, { alliesOnly: false });

    const chosen = await chooseRecipient({
      message,
      page,
      candidates,
      title: `Critical Target: ${page.name}`,
      prompt: capturedTargets.length > 1
        ? "This critical had multiple captured targets. Choose which target receives the reminder effect."
        : "ZFT could not identify one captured attack target. Choose the creature that receives the critical reminder effect."
    });

    return chosen ? { actor: chosen.actor, effectTarget } : null;
  }

  if (effectTarget === "ally") {
    const candidates = getSceneCandidates(message, sourceActor, { alliesOnly: true });
    const chosen = await chooseRecipient({
      message,
      page,
      candidates,
      title: `Choose Ally: ${page.name}`,
      prompt: "Choose the ally who receives this critical reminder effect."
    });

    return chosen ? { actor: chosen.actor, effectTarget } : null;
  }

  console.warn(`[ZFT] ⚠️ v${VERSION} | Critical reminder skipped | Unsupported recipient metadata`, {
    page: page.name,
    effectTarget
  });
  return null;
}

async function resolveCapturedTargets(zftFlags) {
  const candidates = [];
  const seen = new Set();

  for (const uuid of Array.from(zftFlags?.targetTokenUuids ?? [])) {
    if (!uuid) continue;

    try {
      const tokenDocument = await fromUuid(uuid);
      const actor = tokenDocument?.actor ?? null;
      if (!actor) continue;

      const key = actor.uuid ?? `${tokenDocument.parent?.id ?? "scene"}.${tokenDocument.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(toCandidate(tokenDocument, actor));
    } catch (error) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Could not resolve captured critical target token`, { uuid, error });
    }
  }

  if (candidates.length) return candidates;

  for (const uuid of Array.from(zftFlags?.targetActorUuids ?? [])) {
    if (!uuid) continue;

    try {
      const actor = await fromUuid(uuid);
      if (!actor || actor.documentName !== "Actor") continue;
      const key = actor.uuid ?? actor.id;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(toCandidate(null, actor));
    } catch (error) {
      console.warn(`[ZFT] ⚠️ v${VERSION} | Could not resolve captured critical target Actor`, { uuid, error });
    }
  }

  return candidates;
}

function getSceneCandidates(message, sourceActor, { alliesOnly = false } = {}) {
  const sceneId = message?.speaker?.scene ?? globalThis.canvas?.scene?.id ?? null;
  const scene = sceneId ? game.scenes?.get(sceneId) : globalThis.canvas?.scene ?? null;
  if (!scene) return [];

  const sourceTokenId = message?.speaker?.token ?? null;
  const sourceToken = sourceTokenId ? scene.tokens?.get(sourceTokenId) ?? null : null;
  const sourceDisposition = sourceToken?.disposition ?? null;
  const candidates = [];
  const seen = new Set();

  for (const tokenDocument of Array.from(scene.tokens ?? [])) {
    const actor = tokenDocument?.actor ?? null;
    if (!actor) continue;
    if (tokenDocument.id === sourceTokenId) continue;
    if (actor.uuid === sourceActor?.uuid) continue;

    if (alliesOnly && sourceDisposition != null && Number(sourceDisposition) !== 0) {
      if (Number(tokenDocument.disposition) !== Number(sourceDisposition)) continue;
    }

    const key = actor.uuid ?? tokenDocument.uuid ?? tokenDocument.id;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(toCandidate(tokenDocument, actor));
  }

  if (alliesOnly && !candidates.length) {
    return getSceneCandidates(message, sourceActor, { alliesOnly: false });
  }

  return candidates.sort((a, b) => a.label.localeCompare(b.label));
}

function toCandidate(tokenDocument, actor) {
  const tokenName = String(tokenDocument?.name ?? "").trim();
  const actorName = String(actor?.name ?? "Unnamed Actor").trim();
  const label = tokenName && tokenName !== actorName
    ? `${tokenName} (${actorName})`
    : (tokenName || actorName);

  return {
    actor,
    tokenDocument,
    value: tokenDocument?.uuid ?? actor?.uuid ?? actor?.id ?? label,
    label
  };
}

async function chooseRecipient({ message, page, candidates, title, prompt }) {
  if (!candidates.length) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Critical reminder skipped | No recipient candidates available`, {
      page: page?.name ?? null,
      messageId: message?.id ?? null
    });
    return null;
  }

  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.input) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Critical reminder skipped | DialogV2 is unavailable`, {
      page: page?.name ?? null,
      candidates: candidates.map(candidate => candidate.label)
    });
    return null;
  }

  const optionHtml = candidates
    .map((candidate, index) => `<option value="${index}">${escapeHTML(candidate.label)}</option>`)
    .join("");

  const config = {
    window: { title },
    content: `
      <div class="form-group">
        <label>Recipient</label>
        <div class="form-fields">
          <select name="recipientIndex">${optionHtml}</select>
        </div>
        <p class="hint">${escapeHTML(prompt)}</p>
      </div>
    `,
    ok: {
      label: "Apply Reminder",
      icon: "fa-solid fa-check"
    },
    rejectClose: false,
    modal: true
  };

  let response = null;
  const author = message?.author ?? null;

  try {
    if (author?.active && author.id !== game.user?.id && DialogV2.query) {
      response = await DialogV2.query(author, "input", config);
    } else {
      response = await DialogV2.input(config);
    }
  } catch (error) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Critical recipient selection failed`, error);
    return null;
  }

  if (!response) {
    console.log(`[ZFT] 🎯 v${VERSION} | Critical reminder recipient selection canceled | ${page?.name ?? "Critical"}`);
    return null;
  }

  const rawValue = response?.get?.("recipientIndex")
    ?? response?.object?.recipientIndex
    ?? response?.recipientIndex
    ?? null;
  const index = Number.parseInt(String(rawValue ?? ""), 10);

  if (!Number.isInteger(index) || !candidates[index]) {
    console.warn(`[ZFT] ⚠️ v${VERSION} | Critical reminder skipped | Invalid recipient selection`, {
      page: page?.name ?? null,
      rawValue
    });
    return null;
  }

  return candidates[index];
}

function buildReminderEffectData({ actor, sourceActor, message, page, outcome, effectTarget, effectPolarity, rollType, seedKey }) {
  const rawJournalContent = String(page?.text?.content ?? "").trim();
  const effectSummary = extractEffectSummary(rawJournalContent);
  const prefix = outcome === "critical" ? "💥 Critical" : "💀 Fumble";
  const baseName = `${prefix}: ${page?.name ?? formatOutcome(outcome)}`;
  const name = effectSummary ? `${baseName} — ${effectSummary}` : baseName;

  return {
    name,
    description: rawJournalContent || `<p>${escapeHTML(page?.name ?? formatOutcome(outcome))}</p>`,
    img: getReminderIcon(outcome, effectPolarity),
    disabled: false,
    transfer: false,
    changes: [],
    origin: actor?.uuid ?? null,
    flags: {
      dae: {
        showIcon: true,
        specialDuration: []
      },
      [MODULE_ID]: {
        managed: true,
        reminderEffect: true,
        outcome,
        effectTarget,
        effectPolarity,
        rollType,
        seedKey,
        journalPageUuid: page?.uuid ?? null,
        chatMessageId: message?.id ?? null,
        sourceActorUuid: sourceActor?.uuid ?? null,
        recipientActorUuid: actor?.uuid ?? null,
        createdByUserId: game.user?.id ?? null
      }
    }
  };
}

function getReminderIcon(outcome, effectPolarity) {
  if (outcome !== "critical") return FUMBLE_ICON;
  return effectPolarity === "harmful" ? CRITICAL_HARMFUL_ICON : CRITICAL_ICON;
}

function extractEffectSummary(html) {
  if (!html) return "";

  try {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const effectNode = wrapper.querySelector(".zft-result-effect");
    const text = String(effectNode?.textContent ?? "").replace(/^\s*Effect:\s*/i, "").trim();
    if (text) return text;
  } catch {
    // Fall through to a text-only extraction for non-browser test contexts.
  }

  const plainText = String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const effectIndex = plainText.toLowerCase().lastIndexOf("effect:");
  return effectIndex >= 0
    ? plainText.slice(effectIndex + "effect:".length).trim()
    : plainText;
}

async function resolveSourceActor(message, zftFlags) {
  const sourceActorUuid = String(zftFlags?.sourceActorUuid ?? "").trim();
  if (sourceActorUuid) {
    try {
      const actor = await fromUuid(sourceActorUuid);
      if (actor?.documentName === "Actor") return actor;
    } catch {
      // Fall back to ChatMessage speaker resolution.
    }
  }

  return resolveMessageActor(message);
}

function resolveMessageActor(message) {
  const speaker = message?.speaker ?? {};

  if (speaker.scene && speaker.token) {
    const scene = game.scenes?.get(speaker.scene);
    const tokenDocument = scene?.tokens?.get(speaker.token) ?? null;
    if (tokenDocument?.actor) return tokenDocument.actor;
  }

  if (speaker.actor) {
    const worldActor = game.actors?.get(speaker.actor) ?? null;
    if (worldActor) return worldActor;
  }

  return null;
}

function hasReminderForMessage(actor, messageId) {
  if (!messageId) return false;

  return Array.from(actor?.effects ?? []).some(effect => {
    const flags = effect?.flags?.[MODULE_ID];
    return flags?.reminderEffect === true && flags?.chatMessageId === messageId;
  });
}

function isReminderEnabled(outcome) {
  const setting = outcome === "critical"
    ? CRITICAL_REMINDER_SETTING
    : FUMBLE_REMINDER_SETTING;

  try {
    return Boolean(game.settings.get(MODULE_ID, setting));
  } catch {
    return outcome === "fumble";
  }
}

function isReminderAuthority(message) {
  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (activeGMs.length) {
    return activeGMs[0]?.id === game.user?.id;
  }

  const authorId = message?.author?.id ?? message?.user?.id ?? message?.user ?? null;
  return Boolean(authorId && authorId === game.user?.id);
}

function registerReminderApi() {
  if (!game.zftCriticalFumbles) return;

  game.zftCriticalFumbles.getReminderEffects = actorOrUuid => {
    const actor = resolveApiActor(actorOrUuid);
    if (!actor) return [];

    return Array.from(actor.effects ?? []).filter(effect => effect?.flags?.[MODULE_ID]?.reminderEffect === true);
  };

  game.zftCriticalFumbles.clearReminderEffects = async actorOrUuid => {
    const actor = resolveApiActor(actorOrUuid);
    if (!actor) return 0;

    const ids = Array.from(actor.effects ?? [])
      .filter(effect => effect?.flags?.[MODULE_ID]?.reminderEffect === true)
      .map(effect => effect.id)
      .filter(Boolean);

    if (!ids.length) return 0;

    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    console.log(`[ZFT] 🧹 v${VERSION} | Cleared ${ids.length} reminder effect${ids.length === 1 ? "" : "s"} | ${actor.name}`);
    return ids.length;
  };

  console.log(`[ZFT] 🔌 v${VERSION} | Reminder effect API registered`);
}

function resolveApiActor(actorOrUuid) {
  if (actorOrUuid?.documentName === "Actor") return actorOrUuid;

  if (typeof actorOrUuid === "string") {
    if (actorOrUuid.startsWith("Actor.")) {
      return game.actors?.get(actorOrUuid.split(".")[1]) ?? null;
    }

    return game.actors?.get(actorOrUuid) ?? null;
  }

  return globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? null;
}

function formatOutcome(outcome) {
  const value = String(outcome ?? "outcome");
  return value.charAt(0).toUpperCase() + value.slice(1);
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
