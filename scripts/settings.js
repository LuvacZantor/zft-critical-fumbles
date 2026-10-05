console.log("[ZFT] ⚙️ v1.3.8 | Feature Automation settings loading");

const MODULE_ID = "zft-feature-automation";

const BF_SETTINGS = {
  APPEARANCE_ENABLED: "battleFamiliarAppearanceEnabled",
  APPEARANCE_PACKS: "battleFamiliarAppearancePacks",
  BEASTS_ONLY: "battleFamiliarBeastsOnly",
  EXCLUDE_LEGACY: "battleFamiliarExcludeLegacy",
  RANDOM_APPEARANCE: "battleFamiliarRandomAppearance"
};

const DEFAULT_APPEARANCE_PACKS = [
  "zantors-dbbi.monsters",
  "dnd-monster-manual.actors"
];

async function submitBattleFamiliarSettings(event, form) {
  const packs = [...form.querySelectorAll('input[name="packs"]:checked')]
    .map(input => input.value)
    .filter(Boolean);

  await game.settings.set(MODULE_ID, BF_SETTINGS.APPEARANCE_ENABLED, Boolean(form.elements.appearanceEnabled?.checked));
  await game.settings.set(MODULE_ID, BF_SETTINGS.BEASTS_ONLY, Boolean(form.elements.beastsOnly?.checked));
  await game.settings.set(MODULE_ID, BF_SETTINGS.EXCLUDE_LEGACY, Boolean(form.elements.excludeLegacy?.checked));
  await game.settings.set(MODULE_ID, BF_SETTINGS.RANDOM_APPEARANCE, Boolean(form.elements.randomAppearance?.checked));
  await game.settings.set(MODULE_ID, BF_SETTINGS.APPEARANCE_PACKS, {packs});

  globalThis.ZFTFA?.BattleFamiliar?.invalidateAppearanceCache?.();

  ui.notifications.info("Battle Familiar appearance settings saved.");
}

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

class BattleFamiliarAppearanceConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "zft-battle-familiar-appearance-config",
    tag: "form",
    position: {
      width: 680
    },
    window: {
      title: "Battle Familiar Appearance",
      icon: "fa-solid fa-paw",
      resizable: true
    },
    form: {
      closeOnSubmit: true,
      handler: submitBattleFamiliarSettings
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/battle-familiar-settings.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = game.settings.get(MODULE_ID, BF_SETTINGS.APPEARANCE_PACKS);
    const selectedPacks = new Set(
      Array.isArray(stored)
        ? stored
        : Array.isArray(stored?.packs)
          ? stored.packs
          : []
    );

    const actorPacks = [...game.packs].filter(pack => pack.documentName === "Actor");

    // Counts are loaded only when this settings window is opened. This does
    // not inspect creature data or build the Battle Familiar appearance cache.
    const packCounts = new Map();
    for (const pack of actorPacks) {
      try {
        const index = await pack.getIndex({fields: ["_id"]});
        packCounts.set(pack.collection, index.size);
      } catch (error) {
        console.warn(`[ZFT] ⚠️ v1.3.8 | Could not read Actor count for ${pack.collection}`, error);
        packCounts.set(pack.collection, null);
      }
    }

    const packs = actorPacks
      .map(pack => {
        const packageId = pack.metadata?.packageName ?? pack.metadata?.package ?? "World";
        const packageTitle =
          game.modules.get(packageId)?.title
          ?? (packageId === game.system.id ? game.system.title : null)
          ?? (pack.collection.startsWith("world.") ? "World" : null)
          ?? packageId;

        return {
          collection: pack.collection,
          title: pack.title,
          package: packageId,
          packageTitle,
          actorCount: packCounts.get(pack.collection),
          selected: selectedPacks.has(pack.collection)
        };
      })
      .sort((a, b) => {
        const byPackage = a.package.localeCompare(b.package, undefined, {sensitivity: "base"});
        if (byPackage) return byPackage;
        const byTitle = a.title.localeCompare(b.title, undefined, {sensitivity: "base"});
        if (byTitle) return byTitle;
        return a.collection.localeCompare(b.collection, undefined, {sensitivity: "base"});
      });

    return {
      ...context,
      packs,
      appearanceEnabled: game.settings.get(MODULE_ID, BF_SETTINGS.APPEARANCE_ENABLED),
      beastsOnly: game.settings.get(MODULE_ID, BF_SETTINGS.BEASTS_ONLY),
      excludeLegacy: game.settings.get(MODULE_ID, BF_SETTINGS.EXCLUDE_LEGACY),
      randomAppearance: game.settings.get(MODULE_ID, BF_SETTINGS.RANDOM_APPEARANCE)
    };
  }
}

Hooks.once("init", () => {
  const invalidate = () => globalThis.ZFTFA?.BattleFamiliar?.invalidateAppearanceCache?.();

  game.settings.register(MODULE_ID, BF_SETTINGS.APPEARANCE_ENABLED, {
    name: "Battle Familiar: Enable Compendium Appearance",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: invalidate
  });

  game.settings.register(MODULE_ID, BF_SETTINGS.APPEARANCE_PACKS, {
    name: "Battle Familiar: Appearance Compendiums",
    scope: "world",
    config: false,
    type: Object,
    default: {packs: DEFAULT_APPEARANCE_PACKS},
    onChange: invalidate
  });

  game.settings.register(MODULE_ID, BF_SETTINGS.BEASTS_ONLY, {
    name: "Battle Familiar: Beast Appearances Only",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: invalidate
  });

  game.settings.register(MODULE_ID, BF_SETTINGS.EXCLUDE_LEGACY, {
    name: "Battle Familiar: Exclude Legacy Appearances",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: invalidate
  });

  game.settings.register(MODULE_ID, BF_SETTINGS.RANDOM_APPEARANCE, {
    name: "Battle Familiar: Randomize Appearance",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.registerMenu(MODULE_ID, "battleFamiliarAppearanceMenu", {
    name: "Battle Familiar Appearance",
    label: "Configure",
    hint: "Choose which Actor compendiums may provide portrait and token artwork for newly summoned Battle Familiars.",
    icon: "fa-solid fa-paw",
    type: BattleFamiliarAppearanceConfig,
    restricted: true
  });

  console.log("[ZFT] ⚙️ v1.3.8 | Battle Familiar appearance settings registered");
});
