import { CRITICAL_RESULTS } from "./content/critical-results.mjs";
import { FUMBLE_CONTENT } from "./content/fumble-results.mjs";

const MODULE_ID = "zft-critical-fumbles";
const TABLE_PACK_ID = `${MODULE_ID}.critical-fumble-tables`;
const RESULT_PACK_ID = `${MODULE_ID}.critical-fumble-results`;
const CRITICAL_TABLE_SEED_KEY = "zft-critical-hits";
const CRITICAL_JOURNAL_SEED_KEY = "zft-critical-results";
const CRITICAL_TABLE_NAME = "ZFT Critical Hits";
const CRITICAL_JOURNAL_NAME = "ZFT Critical Results";

let criticalTableId = null;
const fumbleTableIds = new Map();

/**
 * Seed the module-owned critical table and Journal content when missing.
 * Existing seeded content is preserved. Missing pages/results are repaired
 * individually using stable module seed keys rather than display names.
 *
 * @param {{version: string}} options
 */
export async function ensureCriticalContent({ version }) {
  if (!isPrimaryActiveGM()) return;

  const resultPack = game.packs?.get(RESULT_PACK_ID);
  const tablePack = game.packs?.get(TABLE_PACK_ID);

  if (!resultPack || !tablePack) {
    console.warn(`[ZFT] ⚠️ v${version} | Critical content compendium missing`, {
      resultPack: Boolean(resultPack),
      tablePack: Boolean(tablePack)
    });
    return;
  }

  try {
    const pageMap = await ensureCriticalJournal(resultPack, version);
    if (pageMap.size !== CRITICAL_RESULTS.length) {
      throw new Error(`Critical Journal page map incomplete: ${pageMap.size}/${CRITICAL_RESULTS.length}`);
    }

    const table = await ensureCriticalTable(tablePack, pageMap, version);
    criticalTableId = table?.id ?? criticalTableId;

    console.log(
      `[ZFT] ✅ v${version} | Critical content ready | ${CRITICAL_RESULTS.length} Journal pages | ${CRITICAL_RESULTS.length} table results`
    );
  } catch (error) {
    console.error(`[ZFT] ❌ v${version} | Failed to initialize critical content`, error);
  }
}

/**
 * Roll the bundled ZFT critical table without posting Foundry's native table
 * chat message or modifying drawn-state. The returned Journal page is the
 * source of truth for the ZFT result card.
 *
 * @param {{version: string}} options
 * @returns {Promise<{table: object, tableRoll: object|null, result: object, page: object, seedKey: string|null}|null>}
 */
export async function rollCriticalResult({ version }) {
  const pack = game.packs?.get(TABLE_PACK_ID);
  if (!pack) {
    console.warn(`[ZFT] ⚠️ v${version} | Critical table compendium not found | ${TABLE_PACK_ID}`);
    return null;
  }

  try {
    const table = await resolveCriticalTable(pack);
    if (!table) {
      console.warn(`[ZFT] ⚠️ v${version} | ${CRITICAL_TABLE_NAME} has not been seeded yet`);
      return null;
    }

    // RollTable#roll identifies a result without formalizing a draw. This keeps
    // the module's compendium immutable during play and avoids drawn-state writes.
    const draw = await table.roll({ recursive: false });
    const result = Array.from(draw?.results ?? [])[0] ?? null;
    if (!result) {
      console.warn(`[ZFT] ⚠️ v${version} | ${CRITICAL_TABLE_NAME} produced no result`);
      return null;
    }

    const pageUuid = getModuleFlag(result, "journalPageUuid");
    if (!pageUuid) {
      console.warn(`[ZFT] ⚠️ v${version} | Critical table result is missing its Journal page UUID`, {
        table: table.name,
        result: result.name ?? result.text ?? result.id
      });
      return null;
    }

    const page = await resolveUuid(pageUuid);
    if (!page || page.documentName !== "JournalEntryPage") {
      console.warn(`[ZFT] ⚠️ v${version} | Critical Journal page could not be resolved`, {
        pageUuid,
        result: result.name ?? result.text ?? result.id
      });
      return null;
    }

    return {
      table,
      tableRoll: draw?.roll ?? null,
      result,
      page,
      seedKey: getModuleFlag(result, "seedKey") ?? getModuleFlag(page, "seedKey") ?? null
    };
  } catch (error) {
    console.error(`[ZFT] ❌ v${version} | Failed to roll bundled critical result`, error);
    return null;
  }
}

async function ensureCriticalJournal(pack, version) {
  await pack.getIndex({ fields: ["name", "flags"] });
  let journalIndex = findIndexBySeedKey(pack.index, CRITICAL_JOURNAL_SEED_KEY);
  let journal = journalIndex ? await pack.getDocument(journalIndex._id ?? journalIndex.id) : null;

  await withUnlockedPack(pack, async () => {
    if (!journal) {
      const source = {
        name: CRITICAL_JOURNAL_NAME,
        pages: CRITICAL_RESULTS.map((definition, index) => createCriticalPageSource(definition, index)),
        flags: {
          [MODULE_ID]: {
            seedKey: CRITICAL_JOURNAL_SEED_KEY,
            managed: true,
            contentVersion: 1
          }
        }
      };

      const JournalClass = pack.documentClass;
      if (!JournalClass?.createDocuments) throw new Error("JournalEntry document implementation is unavailable");

      const created = await JournalClass.createDocuments([source], { pack: RESULT_PACK_ID });
      journal = created?.[0] ?? null;

      console.log(`[ZFT] 📖 v${version} | Created ${CRITICAL_JOURNAL_NAME} with ${CRITICAL_RESULTS.length} pages`);
      return;
    }

    const existingPageKeys = new Set(
      Array.from(journal.pages ?? [])
        .map(page => getModuleFlag(page, "seedKey"))
        .filter(Boolean)
    );

    const missingDefinitions = CRITICAL_RESULTS.filter(definition => !existingPageKeys.has(definition.seedKey));
    if (!missingDefinitions.length) return;

    const startingSort = Math.max(0, ...Array.from(journal.pages ?? []).map(page => Number(page.sort) || 0)) + 100000;
    const sources = missingDefinitions.map((definition, index) => createCriticalPageSource(definition, index, startingSort));
    await journal.createEmbeddedDocuments("JournalEntryPage", sources);

    console.log(
      `[ZFT] 📖 v${version} | Repaired missing critical Journal pages | ${missingDefinitions.map(entry => entry.name).join(", ")}`
    );
  });

  if (!journal) {
    await pack.getIndex({ fields: ["name", "flags"] });
    journalIndex = findIndexBySeedKey(pack.index, CRITICAL_JOURNAL_SEED_KEY);
    journal = journalIndex ? await pack.getDocument(journalIndex._id ?? journalIndex.id) : null;
  } else {
    journal = await pack.getDocument(journal.id);
  }

  if (!journal) throw new Error(`${CRITICAL_JOURNAL_NAME} could not be resolved after seeding`);

  const pageMap = new Map();
  for (const page of Array.from(journal.pages ?? [])) {
    const seedKey = getModuleFlag(page, "seedKey");
    if (seedKey) pageMap.set(seedKey, page);
  }

  return pageMap;
}

async function ensureCriticalTable(pack, pageMap, version) {
  await pack.getIndex({ fields: ["name", "flags"] });
  let tableIndex = findIndexBySeedKey(pack.index, CRITICAL_TABLE_SEED_KEY);
  let table = tableIndex ? await pack.getDocument(tableIndex._id ?? tableIndex.id) : null;

  await withUnlockedPack(pack, async () => {
    if (!table) {
      const source = {
        name: CRITICAL_TABLE_NAME,
        description: "ZFT generic tactical critical-hit effects. Additional critical damage is handled separately by the game configuration.",
        formula: "1d20",
        replacement: true,
        displayRoll: false,
        results: CRITICAL_RESULTS.map(definition => createCriticalTableResultSource(definition, pageMap.get(definition.seedKey))),
        flags: {
          [MODULE_ID]: {
            seedKey: CRITICAL_TABLE_SEED_KEY,
            managed: true,
            contentVersion: 1
          }
        }
      };

      const RollTableClass = pack.documentClass;
      if (!RollTableClass?.createDocuments) throw new Error("RollTable document implementation is unavailable");

      const created = await RollTableClass.createDocuments([source], { pack: TABLE_PACK_ID });
      table = created?.[0] ?? null;

      console.log(`[ZFT] 📊 v${version} | Created ${CRITICAL_TABLE_NAME} with ${CRITICAL_RESULTS.length} results`);
      return;
    }

    const existingByKey = new Map();
    for (const result of Array.from(table.results ?? [])) {
      const seedKey = getModuleFlag(result, "seedKey");
      if (seedKey) existingByKey.set(seedKey, result);
    }

    const missing = [];
    const repairs = [];

    for (const definition of CRITICAL_RESULTS) {
      const page = pageMap.get(definition.seedKey);
      if (!page) continue;

      const existing = existingByKey.get(definition.seedKey);
      if (!existing) {
        missing.push(createCriticalTableResultSource(definition, page));
        continue;
      }

      const currentUuid = getModuleFlag(existing, "journalPageUuid");
      if (currentUuid !== page.uuid) {
        repairs.push({ _id: existing.id, [`flags.${MODULE_ID}.journalPageUuid`]: page.uuid });
      }
    }

    if (missing.length) {
      await table.createEmbeddedDocuments("TableResult", missing);
      console.log(`[ZFT] 📊 v${version} | Repaired ${missing.length} missing critical table result(s)`);
    }

    if (repairs.length) {
      await table.updateEmbeddedDocuments("TableResult", repairs);
      console.log(`[ZFT] 🔗 v${version} | Repaired ${repairs.length} critical table Journal link(s)`);
    }
  });

  if (!table) {
    await pack.getIndex({ fields: ["name", "flags"] });
    tableIndex = findIndexBySeedKey(pack.index, CRITICAL_TABLE_SEED_KEY);
    table = tableIndex ? await pack.getDocument(tableIndex._id ?? tableIndex.id) : null;
  } else {
    table = await pack.getDocument(table.id);
  }

  if (!table) throw new Error(`${CRITICAL_TABLE_NAME} could not be resolved after seeding`);

  criticalTableId = table.id;
  return table;
}

function createCriticalPageSource(definition, index, startingSort = 100000) {
  return {
    name: definition.name,
    type: "text",
    sort: startingSort + (index * 100000),
    text: {
      format: globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
      content: [
        `<p class="zft-result-flavor">${escapeStaticHTML(definition.flavor)}</p>`,
        `<p class="zft-result-effect"><strong>Effect:</strong> ${escapeStaticHTML(definition.effect)}</p>`
      ].join("")
    },
    flags: {
      [MODULE_ID]: {
        seedKey: definition.seedKey,
        resultType: "critical",
        roll: definition.roll,
        managed: true,
        contentVersion: 1
      }
    }
  };
}

function createCriticalTableResultSource(definition, page) {
  if (!page) throw new Error(`Missing Journal page for ${definition.seedKey}`);

  const link = `@UUID[${page.uuid}]{${definition.name}}`;
  const base = {
    type: globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT ?? "text",
    weight: 1,
    range: [definition.roll, definition.roll],
    drawn: false,
    flags: {
      [MODULE_ID]: {
        seedKey: definition.seedKey,
        resultType: "critical",
        roll: definition.roll,
        journalPageUuid: page.uuid,
        managed: true,
        contentVersion: 1
      }
    }
  };

  // Foundry V14 modernized TableResult display fields. Keep that compatibility
  // adapter isolated here instead of scattering generation checks elsewhere.
  if (getFoundryGeneration() >= 14) {
    return {
      ...base,
      name: definition.name,
      description: link
    };
  }

  return {
    ...base,
    text: link
  };
}

async function resolveCriticalTable(pack) {
  if (criticalTableId) {
    const cached = await pack.getDocument(criticalTableId);
    if (cached) return cached;
    criticalTableId = null;
  }

  await pack.getIndex({ fields: ["name", "flags"] });
  const indexEntry = findIndexBySeedKey(pack.index, CRITICAL_TABLE_SEED_KEY);
  if (!indexEntry) return null;

  criticalTableId = indexEntry._id ?? indexEntry.id;
  return pack.getDocument(criticalTableId);
}



/**
 * Seed bundled fumble content libraries for Attack rolls, Saving Throws,
 * Ability Checks, Skill Checks, Tool Checks, Concentration rolls, Death Saves,
 * and Initiative. Existing seeded documents are preserved and missing
 * pages/results are repaired by stable seed key.
 *
 * @param {{version: string}} options
 */
export async function ensureFumbleContent({ version }) {
  if (!isPrimaryActiveGM()) return;

  const resultPack = game.packs?.get(RESULT_PACK_ID);
  const tablePack = game.packs?.get(TABLE_PACK_ID);

  if (!resultPack || !tablePack) {
    console.warn(`[ZFT] ⚠️ v${version} | Fumble content compendium missing`, {
      resultPack: Boolean(resultPack),
      tablePack: Boolean(tablePack)
    });
    return;
  }

  for (const config of Object.values(FUMBLE_CONTENT)) {
    try {
      const pageMap = await ensureFumbleJournal(resultPack, config, version);
      if (pageMap.size !== config.results.length) {
        throw new Error(`${config.journalName} page map incomplete: ${pageMap.size}/${config.results.length}`);
      }

      const table = await ensureFumbleTable(tablePack, config, pageMap, version);
      if (table?.id) fumbleTableIds.set(config.rollType, table.id);

      console.log(
        `[ZFT] ✅ v${version} | Fumble content ready | ${formatRollType(config.rollType)} | ${config.results.length} Journal pages | ${config.results.length} table results`
      );
    } catch (error) {
      console.error(`[ZFT] ❌ v${version} | Failed to initialize ${config.tableName}`, error);
    }
  }
}

/**
 * Roll the bundled fumble table for a supported roll type and resolve its
 * linked JournalEntryPage.
 *
 * @param {{version: string, rollType: string}} options
 * @returns {Promise<{table: object, tableRoll: object|null, result: object, page: object, seedKey: string|null}|null>}
 */
export async function rollFumbleResult({ version, rollType }) {
  const config = FUMBLE_CONTENT[rollType];
  if (!config) return null;

  const pack = game.packs?.get(TABLE_PACK_ID);
  if (!pack) {
    console.warn(`[ZFT] ⚠️ v${version} | Fumble table compendium not found | ${TABLE_PACK_ID}`);
    return null;
  }

  try {
    const table = await resolveFumbleTable(pack, config);
    if (!table) {
      console.warn(`[ZFT] ⚠️ v${version} | ${config.tableName} has not been seeded yet`);
      return null;
    }

    const draw = await table.roll({ recursive: false });
    const result = Array.from(draw?.results ?? [])[0] ?? null;
    if (!result) {
      console.warn(`[ZFT] ⚠️ v${version} | ${config.tableName} produced no result`);
      return null;
    }

    const pageUuid = getModuleFlag(result, "journalPageUuid");
    if (!pageUuid) {
      console.warn(`[ZFT] ⚠️ v${version} | Fumble table result is missing its Journal page UUID`, {
        table: table.name,
        result: result.name ?? result.text ?? result.id
      });
      return null;
    }

    const page = await resolveUuid(pageUuid);
    if (!page || page.documentName !== "JournalEntryPage") {
      console.warn(`[ZFT] ⚠️ v${version} | Fumble Journal page could not be resolved`, {
        pageUuid,
        result: result.name ?? result.text ?? result.id
      });
      return null;
    }

    return {
      table,
      tableRoll: draw?.roll ?? null,
      result,
      page,
      seedKey: getModuleFlag(result, "seedKey") ?? getModuleFlag(page, "seedKey") ?? null
    };
  } catch (error) {
    console.error(`[ZFT] ❌ v${version} | Failed to roll bundled ${formatRollType(rollType)} fumble result`, error);
    return null;
  }
}

async function ensureFumbleJournal(pack, config, version) {
  await pack.getIndex({ fields: ["name", "flags"] });
  let journalIndex = findIndexBySeedKey(pack.index, config.journalSeedKey);
  let journal = journalIndex ? await pack.getDocument(journalIndex._id ?? journalIndex.id) : null;

  await withUnlockedPack(pack, async () => {
    if (!journal) {
      const source = {
        name: config.journalName,
        pages: config.results.map((definition, index) => createFumblePageSource(config, definition, index)),
        flags: {
          [MODULE_ID]: {
            seedKey: config.journalSeedKey,
            resultType: "fumble",
            rollType: config.rollType,
            managed: true,
            contentVersion: 1
          }
        }
      };

      const JournalClass = pack.documentClass;
      if (!JournalClass?.createDocuments) throw new Error("JournalEntry document implementation is unavailable");

      const created = await JournalClass.createDocuments([source], { pack: RESULT_PACK_ID });
      journal = created?.[0] ?? null;

      console.log(`[ZFT] 📖 v${version} | Created ${config.journalName} with ${config.results.length} pages`);
      return;
    }

    const existingPageKeys = new Set(
      Array.from(journal.pages ?? [])
        .map(page => getModuleFlag(page, "seedKey"))
        .filter(Boolean)
    );

    const missingDefinitions = config.results.filter(definition => !existingPageKeys.has(definition.seedKey));
    if (!missingDefinitions.length) return;

    const startingSort = Math.max(0, ...Array.from(journal.pages ?? []).map(page => Number(page.sort) || 0)) + 100000;
    const sources = missingDefinitions.map((definition, index) => createFumblePageSource(config, definition, index, startingSort));
    await journal.createEmbeddedDocuments("JournalEntryPage", sources);

    console.log(
      `[ZFT] 📖 v${version} | Repaired missing ${formatRollType(config.rollType)} fumble Journal pages | ${missingDefinitions.map(entry => entry.name).join(", ")}`
    );
  });

  if (!journal) {
    await pack.getIndex({ fields: ["name", "flags"] });
    journalIndex = findIndexBySeedKey(pack.index, config.journalSeedKey);
    journal = journalIndex ? await pack.getDocument(journalIndex._id ?? journalIndex.id) : null;
  } else {
    journal = await pack.getDocument(journal.id);
  }

  if (!journal) throw new Error(`${config.journalName} could not be resolved after seeding`);

  const pageMap = new Map();
  for (const page of Array.from(journal.pages ?? [])) {
    const seedKey = getModuleFlag(page, "seedKey");
    if (seedKey) pageMap.set(seedKey, page);
  }

  return pageMap;
}

async function ensureFumbleTable(pack, config, pageMap, version) {
  await pack.getIndex({ fields: ["name", "flags"] });
  let tableIndex = findIndexBySeedKey(pack.index, config.tableSeedKey);
  let table = tableIndex ? await pack.getDocument(tableIndex._id ?? tableIndex.id) : null;

  await withUnlockedPack(pack, async () => {
    if (!table) {
      const source = {
        name: config.tableName,
        description: config.description,
        formula: `1d${config.results.length}`,
        replacement: true,
        displayRoll: false,
        results: config.results.map(definition => createFumbleTableResultSource(config, definition, pageMap.get(definition.seedKey))),
        flags: {
          [MODULE_ID]: {
            seedKey: config.tableSeedKey,
            resultType: "fumble",
            rollType: config.rollType,
            managed: true,
            contentVersion: 1
          }
        }
      };

      const RollTableClass = pack.documentClass;
      if (!RollTableClass?.createDocuments) throw new Error("RollTable document implementation is unavailable");

      const created = await RollTableClass.createDocuments([source], { pack: TABLE_PACK_ID });
      table = created?.[0] ?? null;

      console.log(`[ZFT] 📊 v${version} | Created ${config.tableName} with ${config.results.length} results`);
      return;
    }

    const existingByKey = new Map();
    for (const result of Array.from(table.results ?? [])) {
      const seedKey = getModuleFlag(result, "seedKey");
      if (seedKey) existingByKey.set(seedKey, result);
    }

    const missing = [];
    const repairs = [];

    for (const definition of config.results) {
      const page = pageMap.get(definition.seedKey);
      if (!page) continue;

      const existing = existingByKey.get(definition.seedKey);
      if (!existing) {
        missing.push(createFumbleTableResultSource(config, definition, page));
        continue;
      }

      const currentUuid = getModuleFlag(existing, "journalPageUuid");
      if (currentUuid !== page.uuid) {
        repairs.push({ _id: existing.id, [`flags.${MODULE_ID}.journalPageUuid`]: page.uuid });
      }
    }

    if (missing.length) {
      await table.createEmbeddedDocuments("TableResult", missing);
      console.log(`[ZFT] 📊 v${version} | Repaired ${missing.length} missing ${formatRollType(config.rollType)} fumble table result(s)`);
    }

    if (repairs.length) {
      await table.updateEmbeddedDocuments("TableResult", repairs);
      console.log(`[ZFT] 🔗 v${version} | Repaired ${repairs.length} ${formatRollType(config.rollType)} fumble Journal link(s)`);
    }
  });

  if (!table) {
    await pack.getIndex({ fields: ["name", "flags"] });
    tableIndex = findIndexBySeedKey(pack.index, config.tableSeedKey);
    table = tableIndex ? await pack.getDocument(tableIndex._id ?? tableIndex.id) : null;
  } else {
    table = await pack.getDocument(table.id);
  }

  if (!table) throw new Error(`${config.tableName} could not be resolved after seeding`);

  fumbleTableIds.set(config.rollType, table.id);
  return table;
}

function createFumblePageSource(config, definition, index, startingSort = 100000) {
  return {
    name: definition.name,
    type: "text",
    sort: startingSort + (index * 100000),
    text: {
      format: globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
      content: [
        `<p class="zft-result-flavor">${escapeStaticHTML(definition.flavor)}</p>`,
        `<p class="zft-result-effect"><strong>Effect:</strong> ${escapeStaticHTML(definition.effect)}</p>`
      ].join("")
    },
    flags: {
      [MODULE_ID]: {
        seedKey: definition.seedKey,
        resultType: "fumble",
        rollType: config.rollType,
        roll: definition.roll,
        managed: true,
        contentVersion: 1
      }
    }
  };
}

function createFumbleTableResultSource(config, definition, page) {
  if (!page) throw new Error(`Missing Journal page for ${definition.seedKey}`);

  const link = `@UUID[${page.uuid}]{${definition.name}}`;
  const base = {
    type: globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT ?? "text",
    weight: 1,
    range: [definition.roll, definition.roll],
    drawn: false,
    flags: {
      [MODULE_ID]: {
        seedKey: definition.seedKey,
        resultType: "fumble",
        rollType: config.rollType,
        roll: definition.roll,
        journalPageUuid: page.uuid,
        managed: true,
        contentVersion: 1
      }
    }
  };

  if (getFoundryGeneration() >= 14) {
    return {
      ...base,
      name: definition.name,
      description: link
    };
  }

  return {
    ...base,
    text: link
  };
}

async function resolveFumbleTable(pack, config) {
  const cachedId = fumbleTableIds.get(config.rollType);
  if (cachedId) {
    const cached = await pack.getDocument(cachedId);
    if (cached) return cached;
    fumbleTableIds.delete(config.rollType);
  }

  await pack.getIndex({ fields: ["name", "flags"] });
  const indexEntry = findIndexBySeedKey(pack.index, config.tableSeedKey);
  if (!indexEntry) return null;

  const tableId = indexEntry._id ?? indexEntry.id;
  fumbleTableIds.set(config.rollType, tableId);
  return pack.getDocument(tableId);
}

function formatRollType(rollType) {
  return String(rollType ?? "generic")
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function findIndexBySeedKey(index, seedKey) {
  return Array.from(index ?? []).find(entry => getModuleFlag(entry, "seedKey") === seedKey) ?? null;
}

function getModuleFlag(document, key) {
  try {
    if (typeof document?.getFlag === "function") return document.getFlag(MODULE_ID, key);
  } catch {
    // Fall through to index/source data.
  }

  return document?.flags?.[MODULE_ID]?.[key] ?? null;
}

async function withUnlockedPack(pack, operation) {
  const wasLocked = Boolean(pack.locked);

  try {
    if (wasLocked) await pack.configure({ locked: false });
    return await operation();
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  return resolver(uuid);
}

function getFoundryGeneration() {
  return Number(game.release?.generation ?? String(game.version ?? "13").split(".")[0] ?? 13);
}

function isPrimaryActiveGM() {
  if (!game.user?.isGM) return false;

  const activeGMs = Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0]?.id === game.user.id;
}

function escapeStaticHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}
