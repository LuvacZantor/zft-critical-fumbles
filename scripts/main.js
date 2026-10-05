console.log("[ZFT] 🧩 v1.3.9 | ZFT Feature Automation loading");

globalThis.ZFTFA ??= {
  MODULE_ID: "zft-feature-automation",
  FEATURES: {
    ARCANE_WARD: "Arcane Ward",
    PROJECTED_WARD: "Projected Ward",
    BLOODLUST: "Bloodlust",
    GAZE_OF_TWO_MINDS: "Eldritch Invocations: Gaze of Two Minds",
    BATTLE_FAMILIAR: "Battle Familiar"
  },
  FLAGS: {
    BLOODLUST_SANGUINE_FEAST_TURN: "bloodlustSanguineFeastTurn",
    GAZE_LINK: "gazeOfTwoMindsLink",
    GAZE_PROXY: "gazeOfTwoMindsProxy",
    GAZE_CASTING: "gazeOfTwoMindsCasting"
  },
  MODULES: {
    MIDI_QOL: "midi-qol",
    REST_RECOVERY: "rest-recovery",
    CHRIS_PREMADES: "chris-premades"
  },

  log(message, ...args) {
    console.log(`[ZFT] ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`[ZFT] ${message}`, ...args);
  },

  error(message, ...args) {
    console.error(`[ZFT] ${message}`, ...args);
  },

  isModuleActive(moduleId) {
    return game.modules.get(moduleId)?.active === true;
  },

  getFeature(actor, name) {
    if (!actor || !name) return null;
    const allowed = new Set(["feat", "background", "race", "class", "subclass"]);
    return actor.items.find(item => allowed.has(item.type) && item.name === name) ?? null;
  },

  hasFeature(actor, name) {
    return Boolean(this.getFeature(actor, name));
  }
};

for (const script of [
  "./settings.js",
  "./features/arcane-ward.js",
  "./features/bloodlust.js",
  "./features/gaze-of-two-minds.js",
  "./features/battle-familiar.js"
]) {
  try {
    await import(script);
    ZFTFA.log(`✅ Imported ${script.split("/").pop()}`);
  } catch (error) {
    ZFTFA.error(`❌ Failed to import ${script}`, error);
  }
}

Hooks.once("ready", () => {
  const missing = [];
  for (const moduleId of [ZFTFA.MODULES.MIDI_QOL]) {
    if (!ZFTFA.isModuleActive(moduleId)) missing.push(moduleId);
  }

  if (missing.length) {
    ZFTFA.warn(`⚠️ Missing required module(s): ${missing.join(", ")}`);
    return;
  }

  ZFTFA.log(`✅ v1.3.9 | Feature Automation ready | Foundry ${game.version} | D&D5e ${game.system.version}`);
});
