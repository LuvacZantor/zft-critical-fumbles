import { CRITICAL_RESULTS } from "./content/critical-results.mjs";

const MODULE_ID = "zft-critical-fumbles";
const RESULT_PACK_ID = `${MODULE_ID}.critical-fumble-results`;
const CRITICAL_JOURNAL_SEED_KEY = "zft-critical-results";
const CRITICAL_METADATA_VERSION = 2;
const VALID_TARGETS = new Set(["roller", "target", "ally", "none"]);
const VALID_POLARITIES = new Set(["beneficial", "harmful", "neutral"]);

const CRITICAL_BY_SEED_KEY = new Map(
  CRITICAL_RESULTS.map(definition => [definition.seedKey, definition])
);

/**
 * Seed missing reminder-routing metadata onto the existing critical Journal
 * pages without replacing user-edited Journal text or existing valid flags.
 */
export async function ensureCriticalTargetMetadata({ version }) {
  if (!isPrimaryActiveGM()) return;

  const pack = game.packs?.get(RESULT_PACK_ID);
  if (!pack) {
    console.warn(`[ZFT] ⚠️ v${version} | Critical reminder metadata skipped | Result compendium unavailable`);
    return;
  }

  try {
    await pack.getIndex({ fields: ["flags"] });
    const journalIndex = Array.from(pack.index ?? []).find(entry =>
      getModuleFlag(entry, "seedKey") === CRITICAL_JOURNAL_SEED_KEY
    );

    if (!journalIndex) {
      console.warn(`[ZFT] ⚠️ v${version} | Critical reminder metadata skipped | Critical Journal unavailable`);
      return;
    }

    const journal = await pack.getDocument(journalIndex._id ?? journalIndex.id);
    if (!journal) return;

    const updates = [];

    for (const page of Array.from(journal.pages ?? [])) {
      const seedKey = getModuleFlag(page, "seedKey");
      const definition = CRITICAL_BY_SEED_KEY.get(seedKey);
      if (!definition) continue;

      const desiredTarget = normalizeEffectTarget(definition.effectTarget);
      const desiredPolarity = normalizeEffectPolarity(definition.effectPolarity);
      if (!desiredTarget || !desiredPolarity) continue;

      const existingTarget = normalizeEffectTarget(getModuleFlag(page, "effectTarget"));
      const existingPolarity = normalizeEffectPolarity(getModuleFlag(page, "effectPolarity"));
      const update = { _id: page.id };
      let changed = false;

      if (!existingTarget) {
        update[`flags.${MODULE_ID}.effectTarget`] = desiredTarget;
        changed = true;
      }

      if (!existingPolarity) {
        update[`flags.${MODULE_ID}.effectPolarity`] = desiredPolarity;
        changed = true;
      }

      if (!changed) continue;

      update[`flags.${MODULE_ID}.criticalMetadataVersion`] = CRITICAL_METADATA_VERSION;
      updates.push(update);
    }

    if (!updates.length) {
      console.log(`[ZFT] 🎯 v${version} | Critical reminder metadata ready | Journal flags already present`);
      return;
    }

    const wasLocked = Boolean(pack.locked);
    try {
      if (wasLocked) await pack.configure({ locked: false });
      await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }

    console.log(`[ZFT] 🎯 v${version} | Seeded critical reminder metadata | ${updates.length} Journal page${updates.length === 1 ? "" : "s"}`);
  } catch (error) {
    console.error(`[ZFT] ❌ v${version} | Failed to seed critical reminder metadata`, error);
  }
}

export function resolveCriticalEffectTarget(page, seedKey = null) {
  const journalTarget = normalizeEffectTarget(getModuleFlag(page, "effectTarget"));
  if (journalTarget) return journalTarget;

  const resolvedSeedKey = seedKey ?? getModuleFlag(page, "seedKey");
  const definitionTarget = CRITICAL_BY_SEED_KEY.get(resolvedSeedKey)?.effectTarget ?? null;
  return normalizeEffectTarget(definitionTarget) ?? "none";
}

export function resolveCriticalEffectPolarity(page, seedKey = null) {
  const journalPolarity = normalizeEffectPolarity(getModuleFlag(page, "effectPolarity"));
  if (journalPolarity) return journalPolarity;

  const resolvedSeedKey = seedKey ?? getModuleFlag(page, "seedKey");
  const definitionPolarity = CRITICAL_BY_SEED_KEY.get(resolvedSeedKey)?.effectPolarity ?? null;
  return normalizeEffectPolarity(definitionPolarity) ?? "neutral";
}

function normalizeEffectTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_TARGETS.has(normalized) ? normalized : null;
}

function normalizeEffectPolarity(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_POLARITIES.has(normalized) ? normalized : null;
}

function getModuleFlag(document, key) {
  return document?.getFlag?.(MODULE_ID, key)
    ?? document?.flags?.[MODULE_ID]?.[key]
    ?? null;
}

function isPrimaryActiveGM() {
  if (!game.user?.isGM) return false;

  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0]?.id === game.user.id;
}
