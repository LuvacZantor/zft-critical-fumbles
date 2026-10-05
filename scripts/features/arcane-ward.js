console.log("[ZFT] 🛡️ v1.3.9 | Arcane Ward feature automation loading");

const MODULE_ID = "zft-feature-automation";
const ARCANE_WARD_NAME = "Arcane Ward";
const PROJECTED_WARD_NAME = "Projected Ward";
const ARCANE_WARD_IDENTIFIER = "arcane-ward";
const PROJECTED_WARD_IDENTIFIER = "projected-ward";
const PROJECTED_WARD_RANGE = 30;
const ABJURATION_SCHOOL = "abj";
const ARCANE_WARD_CREATED_FLAG = "arcaneWardCreated";
const PROJECTED_WARD_SOCKET_HANDLER = "promptProjectedWard";

const damageBatches = new WeakMap();
let featureSocket = null;

function log(message, data) {
  if (data === undefined) console.log(`[ZFT] ${message}`);
  else console.log(`[ZFT] ${message}`, data);
}

function warn(message, data) {
  if (data === undefined) console.warn(`[ZFT] ${message}`);
  else console.warn(`[ZFT] ${message}`, data);
}

function error(message, data) {
  if (data === undefined) console.error(`[ZFT] ${message}`);
  else console.error(`[ZFT] ${message}`, data);
}

function debug(message, data) {
  if (data === undefined) console.log(`[ZFT] 🧪 v1.3.9 | ${message}`);
  else console.log(`[ZFT] 🧪 v1.3.9 | ${message}`, data);
}

function itemDiagnostic(item) {
  if (!item) return null;
  return {
    name: item.name,
    type: item.type,
    identifier: item.system?.identifier ?? null,
    rules: item.system?.source?.rules ?? null,
    ddbLegacy: item.flags?.ddbimporter?.legacy ?? null,
    ddbIs2014: item.flags?.ddbimporter?.is2014 ?? null,
    ddbIs2024: item.flags?.ddbimporter?.is2024 ?? null,
    uuid: item.uuid ?? null
  };
}

function getItemRules(item) {
  return String(item?.system?.source?.rules ?? "").trim();
}

function is2024ArcaneWard(item) {
  if (!item || item.type !== "feat") return false;

  const identifier = item.system?.identifier;
  if (identifier !== ARCANE_WARD_IDENTIFIER && item.name !== ARCANE_WARD_NAME) return false;

  const ddb = item.flags?.ddbimporter;
  if (ddb?.legacy === true || ddb?.is2014 === true) return false;
  if (ddb?.is2024 === true) return true;

  return getItemRules(item) === "2024";
}

function is2024ProjectedWard(item) {
  if (!item || item.type !== "feat") return false;

  const identifier = item.system?.identifier;
  if (identifier !== PROJECTED_WARD_IDENTIFIER && item.name !== PROJECTED_WARD_NAME) return false;

  const ddb = item.flags?.ddbimporter;
  if (ddb?.legacy === true || ddb?.is2014 === true) return false;
  if (ddb?.is2024 === true) return true;

  const rules = getItemRules(item);
  return rules === "2024" || item.name === PROJECTED_WARD_NAME;
}

function findArcaneWard(actor) {
  return actor?.items?.find(is2024ArcaneWard) ?? null;
}

function findProjectedWard(actor) {
  return actor?.items?.find(is2024ProjectedWard) ?? null;
}

async function evaluateWardMaximum(ward) {
  const raw = ward?.system?.uses?.max;
  if (Number.isFinite(Number(raw))) return Math.max(0, Number(raw));
  if (!raw || !ward?.actor) return 0;

  try {
    const roll = await new Roll(String(raw), ward.actor.getRollData()).evaluate();
    return Math.max(0, Number(roll.total) || 0);
  } catch (err) {
    error(`❌ Arcane Ward | Failed to evaluate maximum for ${ward.actor?.name ?? "unknown actor"}`, err);
    return 0;
  }
}

async function getWardState(actor) {
  const ward = findArcaneWard(actor);
  if (!ward) return null;

  const maximum = await evaluateWardMaximum(ward);
  const spent = Math.max(0, Number(ward.system?.uses?.spent ?? 0));
  const remaining = Math.max(0, maximum - spent);

  return { ward, maximum, spent, remaining };
}

function getWizardLevel(actor) {
  const wizardClass = actor?.classes?.wizard
    ?? actor?.items?.find(item =>
      item?.type === "class"
      && (item?.system?.identifier === "wizard" || item?.name === "Wizard")
    )
    ?? null;

  return Math.max(0, Number(wizardClass?.system?.levels ?? 0));
}

async function getRuleWardMaximum(actor, ward) {
  const wizardLevel = getWizardLevel(actor);
  const intelligenceModifier = Number(actor?.system?.abilities?.int?.mod ?? 0);

  if (wizardLevel > 0 && Number.isFinite(intelligenceModifier)) {
    return Math.max(0, (wizardLevel * 2) + intelligenceModifier);
  }

  return evaluateWardMaximum(ward);
}

function getConsumedSpellSlotLevel(activity, usageConfig = {}, results = {}) {
  const spell = activity?.item;
  if (!spell || spell.type !== "spell") return 0;
  if (activity?.requiresSpellSlot !== true || activity?.consumption?.spellSlot !== true) return 0;
  if (usageConfig?.consume === false) return 0;

  const consumeSpellSlot = usageConfig?.consume === true
    || usageConfig?.consume?.spellSlot === true;
  if (!consumeSpellSlot) return 0;

  const slotKey = usageConfig?.spell?.slot ?? null;
  if (!slotKey) return 0;

  const actorUpdates = results?.updates?.actor ?? {};
  const updatePath = `system.spells.${slotKey}.value`;
  const consumed = Object.prototype.hasOwnProperty.call(actorUpdates, updatePath)
    || foundry.utils.getProperty(actorUpdates, updatePath) !== undefined;
  if (!consumed) return 0;

  const slotLevel = Number(spell.actor?.system?.spells?.[slotKey]?.level);
  if (Number.isFinite(slotLevel) && slotLevel > 0) return slotLevel;

  const standardSlot = /^spell(\d+)$/.exec(String(slotKey));
  if (standardSlot) return Number(standardSlot[1]);

  const effectiveLevel = Number(spell.system?.level ?? 0) + Number(usageConfig?.scaling ?? 0);
  return Number.isFinite(effectiveLevel) && effectiveLevel > 0 ? effectiveLevel : 0;
}

async function chooseArcaneWardCreation(actor, spell, spellLevel, maximum) {
  const content = `
    <div class="zft-arcane-ward-create-dialog">
      <p><strong>${escapeHtml(actor.name)}</strong> cast <strong>${escapeHtml(spell.name)}</strong> with a level ${spellLevel} spell slot.</p>
      <p>Create <strong>Arcane Ward</strong> with <strong>${maximum}</strong> HP?</p>
    </div>`;

  try {
    const response = await foundry.applications.api.DialogV2.wait({
      window: { title: `Arcane Ward — ${actor.name}` },
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "create",
          label: "Create Arcane Ward",
          icon: "fa-solid fa-shield-halved",
          default: true,
          callback: () => true
        },
        {
          action: "decline",
          label: "Not Now",
          icon: "fa-solid fa-xmark",
          callback: () => false
        }
      ]
    });

    return response === true;
  } catch (err) {
    warn(`⚠️ Arcane Ward | Creation dialog failed for ${actor.name}`, err);
    return false;
  }
}

async function processArcaneWardSpellUse(activity, usageConfig = {}, results = {}) {
  try {
    const spell = activity?.item;
    const actor = spell?.actor;

    if (!spell || spell.type !== "spell" || !actor) return;
    if (spell.system?.school !== ABJURATION_SCHOOL) return;

    const ward = findArcaneWard(actor);
    if (!ward) return;

    const spellLevel = getConsumedSpellSlotLevel(activity, usageConfig, results);
    if (spellLevel <= 0) {
      debug(`Arcane Ward spell cast ignored | ${actor.name}`, {
        spell: spell.name,
        reason: "no spell slot was consumed"
      });
      return;
    }

    const state = await getWardState(actor);
    if (!state) return;

    const maximum = await getRuleWardMaximum(actor, ward);
    if (maximum <= 0) {
      warn(`⚠️ Arcane Ward | Could not determine ward maximum for ${actor.name}`);
      return;
    }

    let created = ward.getFlag(MODULE_ID, ARCANE_WARD_CREATED_FLAG);

    // Migration behavior for wards created before ZFT tracked creation state.
    // A ward with HP remaining is treated as already created for the current day.
    if (created === undefined || created === null) {
      created = state.remaining > 0;
      if (created) {
        await ward.setFlag(MODULE_ID, ARCANE_WARD_CREATED_FLAG, true);
        debug(`Arcane Ward creation state migrated | ${actor.name}`, {
          inferredCreated: true,
          remaining: state.remaining
        });
      }
    }

    debug(`Arcane Ward qualifying spell cast | ${actor.name}`, {
      spell: spell.name,
      spellLevel,
      created: created === true,
      maximum,
      remaining: state.remaining
    });

    if (created !== true) {
      const createWard = await chooseArcaneWardCreation(actor, spell, spellLevel, maximum);
      if (!createWard) {
        log(`🛑 Arcane Ward | ${actor.name} declined ward creation after casting ${spell.name}`);
        return;
      }

      await ward.update({
        "system.uses.max": maximum,
        "system.uses.spent": 0,
        [`flags.${MODULE_ID}.${ARCANE_WARD_CREATED_FLAG}`]: true
      });

      log(`🛡️ Arcane Ward | ${actor.name} created the ward at ${maximum}/${maximum} HP after casting ${spell.name}`, {
        actorUuid: actor.uuid,
        itemUuid: ward.uuid,
        spellUuid: spell.uuid,
        spellLevel
      });
      return;
    }

    const restored = Math.min(spellLevel * 2, Math.max(0, maximum - state.remaining));
    const newRemaining = Math.min(maximum, state.remaining + restored);
    const newSpent = Math.max(0, maximum - newRemaining);

    await ward.update({
      "system.uses.max": maximum,
      "system.uses.spent": newSpent
    });

    if (restored > 0) {
      log(`✨ Arcane Ward | ${actor.name} restored ${restored} HP from ${spell.name}; ${newRemaining}/${maximum} ward HP`, {
        actorUuid: actor.uuid,
        itemUuid: ward.uuid,
        spellUuid: spell.uuid,
        spellLevel
      });
    } else {
      debug(`Arcane Ward restoration skipped | ${actor.name}`, {
        reason: "ward already at maximum HP",
        spell: spell.name,
        spellLevel,
        maximum
      });
    }
  } catch (err) {
    error("❌ Arcane Ward | Abjuration spell processing failed", err);
  }
}

async function processArcaneWardRest(actor, result = {}, config = {}) {
  try {
    const isLongRest = result?.longRest === true
      || result?.type === "long"
      || config?.type === "long";
    if (!isLongRest || !actor) return;

    const ward = findArcaneWard(actor);
    if (!ward) return;

    const maximum = await getRuleWardMaximum(actor, ward);
    if (maximum <= 0) return;

    await ward.update({
      "system.uses.max": maximum,
      "system.uses.spent": maximum,
      [`flags.${MODULE_ID}.${ARCANE_WARD_CREATED_FLAG}`]: false
    });

    log(`🌙 Arcane Ward | ${actor.name} completed a Long Rest; ward ended and can be created again`, {
      actorUuid: actor.uuid,
      itemUuid: ward.uuid,
      maximum
    });
  } catch (err) {
    error("❌ Arcane Ward | Long Rest reset failed", err);
  }
}

function resolveActorFromDamageItem(damageItem) {
  const actorUuid = damageItem?.actorUuid;
  if (actorUuid) {
    try {
      const doc = fromUuidSync(actorUuid);
      if (doc?.documentName === "Actor") return doc;
      if (doc?.documentName === "Token") return doc.actor ?? null;
    } catch (_) {
      // Continue to fallbacks.
    }
  }

  const actorId = damageItem?.actorId;
  if (actorId) return game.actors.get(actorId) ?? null;
  return null;
}

function resolveTokenFromDamageItem(damageItem, actor = null) {
  const tokenUuid = damageItem?.tokenUuid;
  if (tokenUuid) {
    try {
      const doc = fromUuidSync(tokenUuid);
      if (doc?.documentName === "Token") return doc.object ?? canvas.tokens.get(doc.id) ?? null;
    } catch (_) {
      // Continue to fallbacks.
    }
  }

  const tokenId = damageItem?.tokenId;
  if (tokenId) {
    const token = canvas.tokens.get(tokenId);
    if (token) return token;
  }

  if (actor && typeof MidiQOL?.getTokenForActor === "function") {
    return MidiQOL.getTokenForActor(actor) ?? null;
  }

  return null;
}

function getDamageAmount(damageItem) {
  const hpDamage = Math.max(0, Number(damageItem?.hpDamage ?? 0));
  const tempDamage = Math.max(0, Number(damageItem?.tempDamage ?? 0));
  return hpDamage + tempDamage;
}

function setDamageAmount(damageItem, actor, amount) {
  const incoming = Math.max(0, Number(amount) || 0);
  const oldTemp = Math.max(
    0,
    Number(damageItem?.oldTempHP ?? actor?.system?.attributes?.hp?.temp ?? 0)
  );
  const oldHP = Math.max(
    0,
    Number(damageItem?.oldHP ?? actor?.system?.attributes?.hp?.value ?? 0)
  );

  const tempDamage = incoming > 0 ? Math.min(oldTemp, incoming) : 0;
  const hpDamage = Math.max(0, incoming - tempDamage);

  damageItem.totalDamage = incoming;
  damageItem.tempDamage = tempDamage;
  damageItem.hpDamage = hpDamage;
  damageItem.newTempHP = Math.max(0, oldTemp - tempDamage);
  damageItem.newHP = Math.max(0, oldHP - hpDamage);

  if ("appliedDamage" in damageItem) damageItem.appliedDamage = incoming;

  if (Array.isArray(damageItem.damageDetail) && damageItem.damageDetail.length) {
    for (const detail of damageItem.damageDetail) {
      if ("value" in detail) detail.value = 0;
      if ("damage" in detail) detail.damage = 0;
    }

    const first = damageItem.damageDetail[0];
    if ("value" in first) first.value = incoming;
    if ("damage" in first) first.damage = incoming;
  }
}

async function spendWardHP(state, amount) {
  const absorb = Math.min(state.remaining, Math.max(0, Number(amount) || 0));
  if (absorb <= 0) return { ok: true, absorbed: 0, remaining: state.remaining };

  const newSpent = Math.min(state.maximum, state.spent + absorb);

  try {
    await state.ward.update({ "system.uses.spent": newSpent });
    return {
      ok: true,
      absorbed: absorb,
      remaining: Math.max(0, state.maximum - newSpent)
    };
  } catch (err) {
    error(`❌ Arcane Ward | Failed to update ward HP for ${state.ward.actor?.name ?? "unknown actor"}; damage left unchanged`, err);
    return { ok: false, absorbed: 0, remaining: state.remaining };
  }
}

async function applySelfWard(entry, workflow) {
  const { actor, damageItem } = entry;
  if (!actor || !damageItem) return;

  const incoming = getDamageAmount(damageItem);
  if (incoming <= 0) return;

  const state = await getWardState(actor);
  if (!state || state.remaining <= 0) return;

  const result = await spendWardHP(state, incoming);
  if (!result.ok || result.absorbed <= 0) return;

  const overflow = Math.max(0, incoming - result.absorbed);
  setDamageAmount(damageItem, actor, overflow);

  log(
    `🛡️ Arcane Ward | ${actor.name} absorbed ${result.absorbed}/${incoming}; ${result.remaining} ward HP remain; ${overflow} damage passed through`,
    {
      actorUuid: actor.uuid,
      itemUuid: state.ward.uuid,
      workflowUuid: workflow?.uuid ?? null
    }
  );
}

function getExpectedDamageTargetCount(workflow) {
  const targets = workflow?.targets;
  if (targets && Number.isFinite(Number(targets.size)) && targets.size > 0) {
    return Number(targets.size);
  }

  return 1;
}

function collectDamageBatch(workflow, hookToken, hookDamageItem) {
  let batch = damageBatches.get(workflow);

  if (!batch) {
    batch = {
      expected: getExpectedDamageTargetCount(workflow),
      hookCount: 0,
      entries: []
    };
    damageBatches.set(workflow, batch);

    debug("Arcane Ward damage batch started", {
      workflowUuid: workflow?.uuid ?? null,
      expectedTargets: batch.expected
    });
  }

  batch.hookCount += 1;

  const actor = resolveActorFromDamageItem(hookDamageItem)
    ?? hookToken?.actor
    ?? null;
  const token = resolveTokenFromDamageItem(hookDamageItem, actor)
    ?? hookToken
    ?? null;

  if (actor && hookDamageItem) {
    batch.entries.push({ actor, token, damageItem: hookDamageItem });
  } else {
    debug("Arcane Ward damage batch entry unresolved", {
      hookNumber: batch.hookCount,
      expectedTargets: batch.expected,
      actor: actor?.name ?? null,
      token: token?.name ?? null
    });
  }

  const complete = batch.hookCount >= batch.expected;

  debug("Arcane Ward damage batch collecting", {
    workflowUuid: workflow?.uuid ?? null,
    collectedHooks: batch.hookCount,
    expectedTargets: batch.expected,
    resolvedEntries: batch.entries.length,
    complete
  });

  if (!complete) return null;

  damageBatches.delete(workflow);

  debug("Arcane Ward damage batch complete", {
    workflowUuid: workflow?.uuid ?? null,
    entries: batch.entries.map(entry => ({
      actor: entry.actor?.name ?? null,
      token: entry.token?.name ?? null,
      damage: getDamageAmount(entry.damageItem)
    }))
  });

  return batch.entries;
}

function currentSceneWardOwners(entries) {
  const entryActorUuids = new Set(entries.map(entry => entry.actor?.uuid).filter(Boolean));
  const owners = [];
  const seen = new Set();

  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor || seen.has(actor.uuid)) continue;

    const rawArcaneWard = actor.items?.find(item =>
      item?.system?.identifier === ARCANE_WARD_IDENTIFIER || item?.name === ARCANE_WARD_NAME
    ) ?? null;
    const rawProjectedWard = actor.items?.find(item =>
      item?.system?.identifier === PROJECTED_WARD_IDENTIFIER || item?.name === PROJECTED_WARD_NAME
    ) ?? null;
    const arcaneWard = findArcaneWard(actor);
    const projectedWard = findProjectedWard(actor);

    if (rawArcaneWard || rawProjectedWard) {
      debug(`Projected Ward actor scan | ${actor.name}`, {
        token: token.name,
        arcaneWardMatch: Boolean(arcaneWard),
        projectedWardMatch: Boolean(projectedWard),
        rawArcaneWard: itemDiagnostic(rawArcaneWard),
        rawProjectedWard: itemDiagnostic(rawProjectedWard)
      });
    }

    if (!arcaneWard || !projectedWard) {
      seen.add(actor.uuid);
      continue;
    }

    owners.push({ actor, token, arcaneWard, projectedWard, isDamagedActor: entryActorUuids.has(actor.uuid) });
    seen.add(actor.uuid);
  }

  debug("Projected Ward owner scan complete", {
    owners: owners.map(owner => ({
      actor: owner.actor.name,
      token: owner.token?.name ?? null,
      isDamagedActor: owner.isDamagedActor
    }))
  });

  return owners;
}

function getProjectedWardPromptUser(actor) {
  if (!actor) return null;

  const activePlayerOwners = Array.from(game.users ?? [])
    .filter(user =>
      user.active &&
      !user.isGM &&
      actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (activePlayerOwners.length > 0) return activePlayerOwners[0];

  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0] ?? null;
}

async function reactionAlreadyUsed(actor) {
  if (typeof MidiQOL?.hasUsedReaction !== "function") return false;
  try {
    return Boolean(await MidiQOL.hasUsedReaction(actor));
  } catch (err) {
    warn(`⚠️ Projected Ward | Could not read reaction state for ${actor.name}`, err);
    return false;
  }
}

async function markReactionUsed(actor) {
  if (typeof MidiQOL?.setReactionUsed !== "function") {
    warn(`⚠️ Projected Ward | MidiQOL.setReactionUsed is unavailable; ${actor.name}'s reaction could not be marked used`);
    return false;
  }

  try {
    await MidiQOL.setReactionUsed(actor);
    return true;
  } catch (err) {
    warn(`⚠️ Projected Ward | Failed to mark ${actor.name}'s reaction used`, err);
    return false;
  }
}

async function withinProjectedWardRange(sourceToken, targetToken) {
  if (!sourceToken || !targetToken) return false;

  if (typeof MidiQOL?.checkDistance === "function") {
    try {
      return Boolean(await MidiQOL.checkDistance(sourceToken, targetToken, PROJECTED_WARD_RANGE, false));
    } catch (err) {
      warn("⚠️ Projected Ward | MidiQOL.checkDistance failed", err);
      return false;
    }
  }

  try {
    const path = canvas.grid.measurePath([sourceToken.center, targetToken.center]);
    return Number(path?.distance ?? Infinity) <= PROJECTED_WARD_RANGE;
  } catch (err) {
    warn("⚠️ Projected Ward | Could not determine target distance", err);
    return false;
  }
}

async function canSeeProjectedWardTarget(sourceToken, targetToken) {
  if (!sourceToken || !targetToken) return false;

  if (typeof MidiQOL?.canSee === "function") {
    try {
      return Boolean(await MidiQOL.canSee(sourceToken, targetToken));
    } catch (err) {
      warn("⚠️ Projected Ward | MidiQOL.canSee failed", err);
      return false;
    }
  }

  if (typeof MidiQOL?.canSense === "function") {
    warn("⚠️ Projected Ward | MidiQOL.canSee unavailable; falling back to MidiQOL.canSense");
    try {
      return Boolean(await MidiQOL.canSense(sourceToken, targetToken));
    } catch (err) {
      warn("⚠️ Projected Ward | MidiQOL.canSense fallback failed", err);
      return false;
    }
  }

  warn("⚠️ Projected Ward | MidiQOL visibility APIs are unavailable; visibility check failed closed");
  return false;
}

async function getProjectedWardCandidates(owner, entries) {
  const candidates = [];

  for (const entry of entries) {
    if (!entry.actor || !entry.token) {
      debug(`Projected Ward candidate rejected | ${owner.actor.name}`, {
        reason: "missing actor or token",
        actor: entry.actor?.name ?? null,
        token: entry.token?.name ?? null
      });
      continue;
    }

    if (entry.actor.uuid === owner.actor.uuid) {
      debug(`Projected Ward candidate rejected | ${entry.actor.name}`, { reason: "self target uses automatic Arcane Ward" });
      continue;
    }

    const ownerDisposition = owner.token?.document?.disposition ?? owner.token?.disposition;
    const targetDisposition = entry.token?.document?.disposition ?? entry.token?.disposition;

    if (
      ownerDisposition !== undefined
      && ownerDisposition !== null
      && targetDisposition !== undefined
      && targetDisposition !== null
      && ownerDisposition !== targetDisposition
    ) {
      debug(`Projected Ward candidate rejected | ${entry.actor.name}`, {
        reason: "different token disposition",
        ownerDisposition,
        targetDisposition
      });
      continue;
    }

    const damage = getDamageAmount(entry.damageItem);
    if (damage <= 0) {
      debug(`Projected Ward candidate rejected | ${entry.actor.name}`, { reason: "no damage", damage });
      continue;
    }

    let measuredDistance = null;
    try {
      measuredDistance = Number(canvas.grid.measurePath([owner.token.center, entry.token.center])?.distance ?? NaN);
      if (!Number.isFinite(measuredDistance)) measuredDistance = null;
    } catch (_) {
      measuredDistance = null;
    }

    const inRange = await withinProjectedWardRange(owner.token, entry.token);
    debug(`Projected Ward range check | ${owner.actor.name} -> ${entry.actor.name}`, {
      measuredDistance,
      limit: PROJECTED_WARD_RANGE,
      inRange
    });
    if (!inRange) continue;

    const visible = await canSeeProjectedWardTarget(owner.token, entry.token);
    debug(`Projected Ward visibility check | ${owner.actor.name} -> ${entry.actor.name}`, { visible });
    if (!visible) continue;

    candidates.push({ ...entry, damage });
    debug(`Projected Ward candidate accepted | ${entry.actor.name}`, { damage });
  }

  debug(`Projected Ward candidates complete | ${owner.actor.name}`, {
    candidates: candidates.map(candidate => ({ actor: candidate.actor.name, damage: candidate.damage }))
  });

  return candidates;
}

function escapeHtml(value) {
  const text = String(value ?? "");
  if (typeof foundry?.utils?.escapeHTML === "function") return foundry.utils.escapeHTML(text);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMidiReactionTimeoutSeconds() {
  try {
    const config = game.settings.get("midi-qol", "ConfigSettings");
    const configured = Number(config?.reactionTimeout);
    if (Number.isFinite(configured) && configured >= 0) return configured;
  } catch (err) {
    warn("⚠️ Projected Ward | Could not read Midi-QOL reaction timeout; using 30 seconds", err);
  }

  return 30;
}

async function showProjectedWardDialog(payload = {}) {
  const ownerName = String(payload.ownerName ?? "Arcane Ward owner");
  const wardRemaining = Math.max(0, Number(payload.wardRemaining ?? 0));
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!candidates.length) return null;

  const timeoutSeconds = getMidiReactionTimeoutSeconds();
  const options = candidates
    .map((candidate, index) => `<option value="${index}">${escapeHtml(candidate.name)} — ${Math.max(0, Number(candidate.damage ?? 0))} damage</option>`)
    .join("");

  const content = `
    <div class="zft-projected-ward-dialog">
      <p><strong>${escapeHtml(ownerName)}</strong> has <strong>${wardRemaining}</strong> Arcane Ward HP remaining.</p>
      <p>Choose one damaged creature to protect with <strong>Projected Ward</strong>.</p>
      <div class="form-group">
        <label>Creature</label>
        <select name="target">${options}</select>
      </div>
      <p style="margin-top: 0.75rem; opacity: 0.85;">
        <i class="fa-solid fa-clock"></i>
        Reaction window: <strong data-zft-reaction-countdown>${timeoutSeconds}</strong> second${timeoutSeconds === 1 ? "" : "s"} remaining
      </p>
    </div>`;

  let intervalId = null;
  let timeoutId = null;
  let timedOut = false;

  const clearTimers = () => {
    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
    intervalId = null;
    timeoutId = null;
  };

  try {
    const response = await foundry.applications.api.DialogV2.wait({
      window: { title: `Projected Ward — ${ownerName}` },
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "use",
          label: "Use Projected Ward",
          icon: "fa-solid fa-shield-halved",
          callback: (_event, button) => ({
            action: "use",
            index: Number(button.form.elements.target.value)
          })
        },
        {
          action: "decline",
          label: "Do Not Use",
          icon: "fa-solid fa-xmark",
          callback: () => ({ action: "decline" })
        }
      ],
      render: (_event, dialog) => {
        const root = dialog.element;
        const useButton = root?.querySelector?.('[data-action="use"]');
        const declineButton = root?.querySelector?.('[data-action="decline"]');

        if (useButton) {
          useButton.style.background = "rgba(46, 160, 67, 0.28)";
          useButton.style.borderColor = "rgba(63, 185, 80, 0.85)";
        }

        if (declineButton) {
          declineButton.style.background = "rgba(218, 54, 51, 0.25)";
          declineButton.style.borderColor = "rgba(248, 81, 73, 0.85)";
        }

        if (timeoutSeconds <= 0) {
          timedOut = true;
          queueMicrotask(() => dialog.close());
          return;
        }

        const deadline = Date.now() + (timeoutSeconds * 1000);
        const updateCountdown = () => {
          const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          const countdown = root?.querySelector?.("[data-zft-reaction-countdown]");
          if (countdown) countdown.textContent = String(remaining);
        };

        updateCountdown();
        intervalId = setInterval(updateCountdown, 250);
        timeoutId = setTimeout(() => {
          timedOut = true;
          clearTimers();
          dialog.close();
        }, timeoutSeconds * 1000);
      },
      close: () => clearTimers()
    });

    clearTimers();

    if (timedOut) {
      log(`⏱️ Projected Ward | ${ownerName} reaction window expired after ${timeoutSeconds} seconds`);
      return null;
    }

    if (!response || response.action !== "use") return null;

    const choice = Number(response.index);
    if (!Number.isInteger(choice) || choice < 0 || choice >= candidates.length) return null;
    return choice;
  } catch (err) {
    clearTimers();
    warn(`⚠️ Projected Ward | Dialog failed for ${ownerName}`, err);
    return null;
  }
}

async function promptProjectedWardRemote(payload = {}) {
  debug("Projected Ward remote prompt received", {
    user: game.user?.name ?? null,
    owner: payload?.ownerName ?? null,
    candidates: Array.isArray(payload?.candidates) ? payload.candidates : []
  });

  return showProjectedWardDialog(payload);
}

function registerFeatureSocket() {
  if (featureSocket || !globalThis.socketlib) return featureSocket;

  try {
    featureSocket = socketlib.registerModule(MODULE_ID);
    featureSocket.register(PROJECTED_WARD_SOCKET_HANDLER, promptProjectedWardRemote);
    log("🔌 Projected Ward | SocketLib routing registered");
  } catch (err) {
    featureSocket = null;
    error("❌ Projected Ward | SocketLib registration failed", err);
  }

  return featureSocket;
}

async function chooseProjectedWardTarget(owner, candidates, wardRemaining) {
  if (!candidates.length) return null;

  const promptUser = getProjectedWardPromptUser(owner.actor);
  if (!promptUser) {
    warn(`⚠️ Projected Ward | No active owner or GM is available to answer ${owner.actor.name}'s Reaction`);
    return null;
  }

  const payload = {
    ownerName: owner.actor.name,
    wardRemaining,
    candidates: candidates.map(candidate => ({
      name: candidate.actor.name,
      damage: candidate.damage
    }))
  };

  debug(`Projected Ward prompt routing | ${owner.actor.name}`, {
    workflowUser: game.user?.name ?? null,
    promptUser: promptUser.name,
    promptUserId: promptUser.id,
    local: promptUser.id === game.user?.id,
    socketReady: Boolean(featureSocket)
  });

  let selectedIndex = null;

  if (promptUser.id === game.user?.id) {
    selectedIndex = await showProjectedWardDialog(payload);
  } else if (featureSocket) {
    try {
      selectedIndex = await featureSocket.executeAsUser(
        PROJECTED_WARD_SOCKET_HANDLER,
        promptUser.id,
        payload
      );
    } catch (err) {
      warn(`⚠️ Projected Ward | Remote prompt failed for ${promptUser.name}`, err);

      if (game.user?.isGM) {
        warn(`⚠️ Projected Ward | Falling back to the GM prompt for ${owner.actor.name}`);
        selectedIndex = await showProjectedWardDialog(payload);
      }
    }
  } else if (game.user?.isGM) {
    warn(`⚠️ Projected Ward | SocketLib is unavailable; falling back to the GM prompt for ${owner.actor.name}`);
    selectedIndex = await showProjectedWardDialog(payload);
  } else {
    warn(`⚠️ Projected Ward | SocketLib is unavailable and ${game.user?.name ?? "current user"} cannot route the prompt`);
  }

  if (selectedIndex === null || selectedIndex === undefined) return null;

  const choice = Number(selectedIndex);
  if (!Number.isInteger(choice) || choice < 0 || choice >= candidates.length) return null;
  return candidates[choice];
}

async function postProjectedWardChat(owner, candidate, absorbed, incoming, overflow) {
  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: owner.actor, token: owner.token?.document }),
      content: `<p><strong>Projected Ward</strong>: ${escapeHtml(owner.actor.name)}'s Arcane Ward absorbs <strong>${absorbed}</strong> of ${escapeHtml(candidate.actor.name)}'s <strong>${incoming}</strong> damage${overflow > 0 ? `, leaving <strong>${overflow}</strong> damage` : ""}.</p>`
    });
  } catch (err) {
    warn("⚠️ Projected Ward | Could not create chat message", err);
  }
}

async function processProjectedWards(entries, workflow) {
  const owners = currentSceneWardOwners(entries);
  if (!owners.length) {
    debug("Projected Ward processing stopped", { reason: "no eligible Arcane Ward + Projected Ward owners on scene" });
    return;
  }

  for (const owner of owners) {
    const promptUser = getProjectedWardPromptUser(owner.actor);
    debug(`Projected Ward owner evaluation | ${owner.actor.name}`, {
      workflowUser: game.user?.name ?? null,
      workflowUserIsGM: game.user?.isGM ?? false,
      promptUser: promptUser?.name ?? null,
      promptUserId: promptUser?.id ?? null
    });
    if (!promptUser) {
      debug(`Projected Ward owner rejected | ${owner.actor.name}`, { reason: "no active owner or GM is available" });
      continue;
    }

    const usedReaction = await reactionAlreadyUsed(owner.actor);
    debug(`Projected Ward reaction check | ${owner.actor.name}`, { usedReaction });
    if (usedReaction) {
      debug(`Projected Ward owner rejected | ${owner.actor.name}`, { reason: "reaction already used" });
      continue;
    }

    const state = await getWardState(owner.actor);
    debug(`Projected Ward ward-state check | ${owner.actor.name}`, state ? {
      maximum: state.maximum,
      spent: state.spent,
      remaining: state.remaining,
      wardUuid: state.ward.uuid
    } : { state: null });
    if (!state) {
      debug(`Projected Ward owner rejected | ${owner.actor.name}`, { reason: "Arcane Ward state could not be resolved" });
      continue;
    }
    if (state.remaining <= 0) {
      debug(`Projected Ward owner rejected | ${owner.actor.name}`, { reason: "Arcane Ward has no HP remaining" });
      continue;
    }

    const candidates = await getProjectedWardCandidates(owner, entries);
    if (!candidates.length) {
      debug(`Projected Ward owner rejected | ${owner.actor.name}`, { reason: "no eligible damaged creatures" });
      continue;
    }

    debug(`Projected Ward prompt opening | ${owner.actor.name}`, {
      wardRemaining: state.remaining,
      candidates: candidates.map(candidate => ({ actor: candidate.actor.name, damage: candidate.damage }))
    });

    const selected = await chooseProjectedWardTarget(owner, candidates, state.remaining);
    if (!selected) {
      log(`🛑 Projected Ward | ${owner.actor.name} declined the Reaction`);
      continue;
    }

    const freshState = await getWardState(owner.actor);
    if (!freshState || freshState.remaining <= 0) {
      warn(`⚠️ Projected Ward | ${owner.actor.name}'s Arcane Ward has no HP remaining; Reaction cancelled`);
      continue;
    }

    const incoming = getDamageAmount(selected.damageItem);
    if (incoming <= 0) {
      debug(`Projected Ward selection cancelled | ${owner.actor.name}`, { reason: "selected target no longer has damage" });
      continue;
    }

    const result = await spendWardHP(freshState, incoming);
    if (!result.ok || result.absorbed <= 0) {
      debug(`Projected Ward application stopped | ${owner.actor.name}`, { result });
      continue;
    }

    const overflow = Math.max(0, incoming - result.absorbed);
    setDamageAmount(selected.damageItem, selected.actor, overflow);
    await markReactionUsed(owner.actor);
    await postProjectedWardChat(owner, selected, result.absorbed, incoming, overflow);

    log(
      `🛡️ Projected Ward | ${owner.actor.name} protected ${selected.actor.name}; absorbed ${result.absorbed}/${incoming}; ${result.remaining} ward HP remain; ${overflow} damage passed through`,
      {
        ownerActorUuid: owner.actor.uuid,
        targetActorUuid: selected.actor.uuid,
        itemUuid: freshState.ward.uuid,
        workflowUuid: workflow?.uuid ?? null
      }
    );
  }
}

async function processDamageEvent(hookToken, context = {}) {
  const workflow = context.workflow;
  const hookDamageItem = context.damageItem;

  debug("preTargetDamageApplication fired", {
    hookToken: hookToken?.name ?? hookToken?.actor?.name ?? null,
    hookActor: hookToken?.actor?.name ?? null,
    workflowUuid: workflow?.uuid ?? null,
    workflowItem: workflow?.item?.name ?? null,
    damageItemActorUuid: hookDamageItem?.actorUuid ?? null,
    damageItemTokenUuid: hookDamageItem?.tokenUuid ?? null,
    hpDamage: hookDamageItem?.hpDamage ?? null,
    tempDamage: hookDamageItem?.tempDamage ?? null,
    workflowDamageListCount: Array.isArray(workflow?.damageList) ? workflow.damageList.length : null
  });

  if (!workflow || !hookDamageItem) {
    debug("Arcane Ward damage event rejected", {
      reason: "missing workflow or damage item",
      hasWorkflow: Boolean(workflow),
      hasDamageItem: Boolean(hookDamageItem)
    });
    return;
  }

  const entries = collectDamageBatch(workflow, hookToken, hookDamageItem);

  if (!entries) return;

  debug("Arcane Ward damage entries resolved", {
    entries: entries.map(entry => ({
      actor: entry.actor?.name ?? null,
      token: entry.token?.name ?? null,
      hpDamage: entry.damageItem?.hpDamage ?? null,
      tempDamage: entry.damageItem?.tempDamage ?? null,
      totalDamage: getDamageAmount(entry.damageItem)
    }))
  });

  if (!entries.length) {
    debug("Arcane Ward damage event rejected", { reason: "no damage entries resolved" });
    return;
  }

  try {
    for (const entry of entries) {
      await applySelfWard(entry, workflow);
    }

    await processProjectedWards(entries, workflow);
  } catch (err) {
    error("❌ Arcane Ward | Damage event processing failed", err);
  }
}

Hooks.once("socketlib.ready", registerFeatureSocket);

Hooks.once("ready", () => {
  if (!game.modules.get("midi-qol")?.active) {
    warn("⚠️ Arcane Ward | Midi-QOL is not active; automation disabled");
    return;
  }

  if (game.modules.get("socketlib")?.active) registerFeatureSocket();
  else warn("⚠️ Projected Ward | SocketLib is not active; remote player prompt routing will fall back to the GM");

  Hooks.on("midi-qol.preTargetDamageApplication", processDamageEvent);
  Hooks.on("dnd5e.postUseActivity", processArcaneWardSpellUse);
  Hooks.on("dnd5e.restCompleted", processArcaneWardRest);
  log("✅ v1.3.9 | Arcane Ward feature automation ready");
});
