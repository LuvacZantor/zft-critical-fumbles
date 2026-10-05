console.log("[ZFT] 🐾 v1.3.8 | Battle Familiar automation loading");

globalThis.ZFTFA ??= {
  MODULE_ID: "zft-feature-automation"
};

ZFTFA.BattleFamiliar = {
  IDENTIFIER: "battle-familiar",
  SUMMON_IDENTIFIER: "zftBattleFamiliar",
  EMPOWER_IDENTIFIER: "zftBattleFamiliarEmpower",
  ACTOR_FLAG: "battleFamiliarEmpowered",
  SETTINGS: {
    APPEARANCE_ENABLED: "battleFamiliarAppearanceEnabled",
    APPEARANCE_PACKS: "battleFamiliarAppearancePacks",
    BEASTS_ONLY: "battleFamiliarBeastsOnly",
    EXCLUDE_LEGACY: "battleFamiliarExcludeLegacy",
    RANDOM_APPEARANCE: "battleFamiliarRandomAppearance"
  },
  _handledWorkflows: new Set(),
  _restoringActors: new Set(),
  _appearanceCacheKey: null,
  _appearanceCache: null,

  async register() {
    ZFTFA.log("🐾 Battle Familiar | Registering hooks");

    if (!ZFTFA.isModuleActive?.(ZFTFA.MODULES?.MIDI_QOL ?? "midi-qol")) {
      ZFTFA.warn("⚠️ Battle Familiar | Midi-QOL inactive; automation disabled");
      return;
    }

    Hooks.on("midi-qol.RollComplete", async workflow => {
      try {
        await this.handleRollComplete(workflow);
      } catch (error) {
        ZFTFA.error("❌ Battle Familiar | RollComplete failure", error);
      }
    });

    Hooks.on("deleteActiveEffect", async effect => {
      try {
        await this.handleDeletedEffect(effect);
      } catch (error) {
        ZFTFA.error("❌ Battle Familiar | Effect cleanup failure", error);
      }
    });

    Hooks.on("updateActor", async (actor, changes) => {
      try {
        await this.handleActorUpdate(actor, changes);
      } catch (error) {
        ZFTFA.error("❌ Battle Familiar | Actor update failure", error);
      }
    });

    ZFTFA.log("✅ Battle Familiar | Hooks registered");
  },

  get cpr() {
    return globalThis.chrisPremades ?? null;
  },

  get cprReady() {
    return Boolean(
      game.modules.get("chris-premades")?.active
      && this.cpr?.Summons
      && this.cpr?.utils?.workflowUtils
      && this.cpr?.utils?.compendiumUtils
      && this.cpr?.utils?.effectUtils
      && this.cpr?.utils?.genericUtils
      && this.cpr?.utils?.constants
    );
  },

  isBattleFamiliarItem(item) {
    if (!item) return false;

    const identifier = String(item.system?.identifier ?? "").toLowerCase();
    if (identifier === this.IDENTIFIER) return true;

    return item.type === "spell"
      && String(item.name ?? "").trim().toLowerCase() === "battle familiar";
  },

  async handleRollComplete(workflow) {
    if (!workflow || workflow.aborted) return;
    if (!this.isBattleFamiliarItem(workflow.item)) return;

    // Midi-QOL workflow.uuid is the Activity UUID in this environment, so it is
    // reused every time the same spell activity is cast. Use the per-workflow
    // id for duplicate protection instead, and do not fall back to an Item or
    // Activity UUID because those are intentionally persistent.
    const workflowKey = workflow.id ?? null;
    if (workflowKey && this._handledWorkflows.has(workflowKey)) return;

    if (workflowKey) {
      this._handledWorkflows.add(workflowKey);
      if (this._handledWorkflows.size > 250) this._handledWorkflows.clear();
    }

    if (!this.cprReady) {
      ui.notifications.error(
        "Battle Familiar automation requires Chris's Premades (CPR) on Foundry V13."
      );
      ZFTFA.warn("⚠️ Battle Familiar | CPR unavailable; spell left unautomated");
      return;
    }

    const actor = workflow.actor;
    const token = workflow.token;
    const item = workflow.item;

    if (!actor || !token || !item) {
      ZFTFA.warn("⚠️ Battle Familiar | Missing actor, token, or item", {
        actor: actor?.name,
        token: token?.name,
        item: item?.name
      });
      return;
    }

    const spellLevel = Math.max(
      2,
      Number(this.cpr.utils.workflowUtils.getCastLevel(workflow) ?? item.system?.level ?? 2)
    );

    ZFTFA.log("🐾 Battle Familiar | Cast detected", {
      actor: actor.name,
      item: item.name,
      spellLevel,
      workflowUuid: workflow.uuid ?? null
    });

    await this.endExistingBattleFamiliar(actor);

    const existingFamiliar = await this.resolveFindFamiliar(actor);

    if (existingFamiliar?.effect && !existingFamiliar?.tokenDocument) {
      ui.notifications.warn(
        "Find Familiar is active, but its familiar is not currently placed. Place the familiar before using Battle Familiar automation."
      );
      ZFTFA.warn("⚠️ Battle Familiar | Find Familiar exists but no active familiar token was found");
      return;
    }

    if (existingFamiliar?.tokenDocument?.actor) {
      const form = await this.chooseForm(item.name);
      if (!form) return;

      await this.empowerExistingFamiliar({
        workflow,
        familiarToken: existingFamiliar.tokenDocument,
        form,
        spellLevel
      });
      return;
    }

    const choices = await this.chooseNewFamiliarOptions(item.name);
    if (!choices) return;

    await this.summonNewBattleFamiliar({
      workflow,
      form: choices.form,
      creatureType: choices.creatureType,
      appearance: choices.appearance,
      spellLevel
    });
  },

  async chooseForm(title) {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `
        <div class="form-group">
          <label>Battle Familiar Form</label>
          <select name="form">
            <option value="brute">Brute</option>
            <option value="flyer">Flyer</option>
            <option value="stalker">Stalker</option>
          </select>
        </div>
      `,
      modal: true,
      rejectClose: false,
      ok: {
        label: "Continue",
        callback: (event, button) => button.form.elements.form.value
      }
    });
  },

  getAppearanceSettings() {
    const getSetting = (key, fallback) => {
      try {
        const value = game.settings.get(ZFTFA.MODULE_ID, key);
        return value ?? fallback;
      } catch {
        return fallback;
      }
    };

    const storedPacks = getSetting(this.SETTINGS.APPEARANCE_PACKS, {packs: []});
    const packs = Array.isArray(storedPacks)
      ? storedPacks
      : Array.isArray(storedPacks?.packs)
        ? storedPacks.packs
        : [];

    return {
      enabled: Boolean(getSetting(this.SETTINGS.APPEARANCE_ENABLED, true)),
      packs: [...new Set(packs.filter(Boolean))],
      beastsOnly: Boolean(getSetting(this.SETTINGS.BEASTS_ONLY, true)),
      excludeLegacy: Boolean(getSetting(this.SETTINGS.EXCLUDE_LEGACY, true)),
      random: Boolean(getSetting(this.SETTINGS.RANDOM_APPEARANCE, false))
    };
  },

  invalidateAppearanceCache() {
    this._appearanceCacheKey = null;
    this._appearanceCache = null;
    ZFTFA.log("🧹 Battle Familiar | Appearance cache invalidated");
  },

  _isUsefulArtPath(path) {
    const value = String(path ?? "").trim();
    if (!value) return false;
    if (/icons\/svg\/mystery-man/i.test(value)) return false;
    return true;
  },

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  async getAppearanceChoices() {
    const settings = this.getAppearanceSettings();
    if (!settings.enabled || !settings.packs.length) return [];

    const cacheKey = JSON.stringify({
      packs: settings.packs,
      beastsOnly: settings.beastsOnly,
      excludeLegacy: settings.excludeLegacy
    });

    if (this._appearanceCacheKey === cacheKey && Array.isArray(this._appearanceCache)) {
      return this._appearanceCache;
    }

    const byName = new Map();
    const indexedPacks = [];

    for (const collection of settings.packs) {
      const pack = game.packs.get(collection);
      if (!pack || pack.documentName !== "Actor") {
        ZFTFA.warn("⚠️ Battle Familiar | Appearance compendium unavailable or not an Actor pack", {collection});
        continue;
      }

      const index = await pack.getIndex({
        fields: [
          "name",
          "type",
          "system.details.type.value",
          "img",
          "prototypeToken.texture.src"
        ]
      });

      indexedPacks.push(collection);

      for (const entry of index) {
        if (entry.type !== "npc") continue;

        const creatureType = String(entry.system?.details?.type?.value ?? "").toLowerCase();
        if (settings.beastsOnly && creatureType !== "beast") continue;

        const portrait = this._isUsefulArtPath(entry.img) ? entry.img : null;
        const token = this._isUsefulArtPath(entry.prototypeToken?.texture?.src)
          ? entry.prototypeToken.texture.src
          : null;

        if (!portrait && !token) continue;

        const name = String(entry.name ?? "").trim();
        if (!name) continue;
        if (settings.excludeLegacy && /legacy/i.test(name)) continue;

        const packageId = pack.metadata?.packageName ?? pack.metadata?.package ?? "World";
        const packageTitle =
          game.modules.get(packageId)?.title
          ?? (packageId === game.system.id ? game.system.title : null)
          ?? (pack.collection.startsWith("world.") ? "World" : null)
          ?? packageId;

        const candidate = {
          id: entry._id,
          name,
          creatureType,
          portrait: portrait ?? token,
          token: token ?? portrait,
          thumbnail: portrait ?? token,
          pack: collection,
          packTitle: pack.title,
          packageTitle,
          sourceLabel: pack.title === packageTitle ? pack.title : `${pack.title} — ${packageTitle}`,
          score: Number(Boolean(portrait)) + Number(Boolean(token))
        };

        const key = name.toLocaleLowerCase();
        const existing = byName.get(key);
        if (!existing || candidate.score > existing.score) byName.set(key, candidate);
      }
    }

    const choices = [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));

    this._appearanceCacheKey = cacheKey;
    this._appearanceCache = choices;

    ZFTFA.log("📦 Battle Familiar | Appearance index built", {
      packs: indexedPacks,
      beastsOnly: settings.beastsOnly,
      excludeLegacy: settings.excludeLegacy,
      choices: choices.length
    });

    return choices;
  },

  async resolveAppearanceArt(appearance) {
    if (!appearance) return null;

    const resolved = {...appearance};
    const pack = game.packs.get(appearance.pack);

    const fallbackToPortrait = () => {
      const portrait = this._isUsefulArtPath(resolved.portrait)
        ? resolved.portrait
        : this._isUsefulArtPath(resolved.thumbnail)
          ? resolved.thumbnail
          : null;

      if (!this._isUsefulArtPath(resolved.token) || String(resolved.token).includes("*")) {
        resolved.token = portrait;
      }

      if (!this._isUsefulArtPath(resolved.portrait)) {
        resolved.portrait = resolved.token ?? null;
      }

      resolved.thumbnail = resolved.portrait ?? resolved.token ?? null;
      return resolved;
    };

    if (!pack || pack.documentName !== "Actor") {
      return fallbackToPortrait();
    }

    try {
      const sourceActor = await pack.getDocument(appearance.id);
      if (!sourceActor) return fallbackToPortrait();

      const portrait = this._isUsefulArtPath(sourceActor.img)
        ? sourceActor.img
        : null;

      let token = this._isUsefulArtPath(sourceActor.prototypeToken?.texture?.src)
        ? sourceActor.prototypeToken.texture.src
        : null;

      if (token?.includes("*")) {
        let tokenImages = [];

        try {
          if (typeof sourceActor.getTokenImages === "function") {
            tokenImages = await sourceActor.getTokenImages();
          }
        } catch (error) {
          ZFTFA.warn("⚠️ Battle Familiar | Could not resolve wildcard token artwork", {
            appearance: appearance.name,
            pack: appearance.pack,
            token,
            error
          });
        }

        const concreteImages = (tokenImages ?? []).filter(path =>
          this._isUsefulArtPath(path) && !String(path).includes("*")
        );

        if (concreteImages.length) {
          token = concreteImages[Math.floor(Math.random() * concreteImages.length)];
        } else {
          token = portrait;
        }
      }

      resolved.portrait = portrait ?? resolved.portrait ?? token ?? null;
      resolved.token = token ?? resolved.portrait ?? null;

      // Never hand a wildcard path to CPR/Foundry as the actual spawned
      // token texture. If it could not be resolved, use the portrait.
      if (String(resolved.token ?? "").includes("*")) {
        resolved.token = resolved.portrait ?? null;
      }

      resolved.thumbnail = resolved.portrait ?? resolved.token ?? null;

      ZFTFA.log("🖼️ Battle Familiar | Appearance artwork resolved", {
        appearance: resolved.name,
        pack: resolved.pack,
        portrait: resolved.portrait,
        token: resolved.token
      });

      return resolved;
    } catch (error) {
      ZFTFA.warn("⚠️ Battle Familiar | Could not load selected appearance Actor", {
        appearance: appearance.name,
        pack: appearance.pack,
        error
      });

      return fallbackToPortrait();
    }
  },

  async chooseNewFamiliarOptions(title) {
    const appearanceSettings = this.getAppearanceSettings();
    const appearances = appearanceSettings.enabled
      ? await this.getAppearanceChoices()
      : [];

    const appearanceKey = choice => `${choice.pack}::${choice.id}`;
    const appearancesByKey = new Map(appearances.map(choice => [appearanceKey(choice), choice]));
    const defaultRandom = Boolean(appearanceSettings.random && appearances.length);

    const appearanceField = !appearanceSettings.enabled
      ? `<p class="hint">Compendium appearance selection is disabled. The generic summon artwork will be used.</p>`
      : appearances.length
        ? `
          <fieldset style="margin-top: 0.75rem;">
            <legend>Appearance</legend>

            <label class="checkbox" style="margin-bottom: 0.35rem;">
              <input name="randomAppearance" type="checkbox" ${defaultRandom ? "checked" : ""}>
              Randomize appearance
            </label>
            <p class="hint" style="margin-top: 0;">
              When checked, one of the ${appearances.length} available appearances is chosen randomly when you summon the familiar.
            </p>

            <input name="appearanceKey" type="hidden" value="">

            <div data-zft-bf-picker-controls>
              <div class="form-group" style="margin-bottom: 0.5rem;">
                <label>Find an appearance</label>
                <div class="form-fields">
                  <input data-zft-bf-appearance-search type="search" placeholder="Search creature or source..." autocomplete="off">
                  <button type="button" data-zft-bf-clear-selection style="flex: 0 0 auto; width: auto;">
                    <i class="fa-solid fa-eraser"></i> Clear
                  </button>
                </div>
              </div>

              <div data-zft-bf-selected-preview style="margin: 0.5rem 0;"></div>

              <div
                data-zft-bf-appearance-results
                style="max-height: 310px; overflow-y: auto; display: grid; gap: 0.35rem; padding-right: 0.25rem;"
              ></div>

              <p class="hint" style="margin: 0.45rem 0 0;">
                40 matching creatures are loaded initially, with more added as you scroll. Portrait artwork is shown first, with token artwork used as a fallback.
              </p>
            </div>
          </fieldset>
        `
        : `<p class="hint">No matching creature artwork was found in the configured compendiums. The generic summon artwork will be used.</p>`;

    return await foundry.applications.api.DialogV2.prompt({
      window: { title },
      position: { width: appearances.length ? 700 : 460 },
      content: `
        <div class="form-group">
          <label>Battle Familiar Form</label>
          <select name="form">
            <option value="brute">Brute</option>
            <option value="flyer">Flyer</option>
            <option value="stalker">Stalker</option>
          </select>
        </div>
        <div class="form-group">
          <label>Creature Type</label>
          <select name="creatureType">
            <option value="celestial">Celestial</option>
            <option value="fey">Fey</option>
            <option value="fiend">Fiend</option>
          </select>
        </div>
        ${appearanceField}
      `,
      modal: true,
      rejectClose: false,
      render: (event, dialog) => {
        if (!appearances.length) return;

        const root = dialog.element;
        const form = root?.querySelector("form");
        const search = root?.querySelector("[data-zft-bf-appearance-search]");
        const results = root?.querySelector("[data-zft-bf-appearance-results]");
        const preview = root?.querySelector("[data-zft-bf-selected-preview]");
        const clear = root?.querySelector("[data-zft-bf-clear-selection]");
        const random = form?.elements?.randomAppearance;
        const selectedInput = form?.elements?.appearanceKey;

        if (!form || !search || !results || !preview || !clear || !random || !selectedInput) return;
        if (root.dataset.zftBattleFamiliarPickerReady === "true") return;
        root.dataset.zftBattleFamiliarPickerReady = "true";

        const PAGE_SIZE = 40;
        let visibleLimit = PAGE_SIZE;

        const getSelected = () => appearancesByKey.get(String(selectedInput.value ?? "")) ?? null;

        const getFilteredAppearances = () => {
          const query = String(search.value ?? "").trim().toLocaleLowerCase();
          return query
            ? appearances.filter(choice =>
                choice.name.toLocaleLowerCase().includes(query)
                || choice.sourceLabel.toLocaleLowerCase().includes(query)
              )
            : appearances;
        };

        const renderPreview = () => {
          if (random.checked) {
            preview.innerHTML = `
              <div style="padding: 0.55rem 0.65rem; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px;">
                <strong><i class="fa-solid fa-shuffle"></i> Random appearance</strong>
                <div class="hint">A creature will be selected from all ${appearances.length} available appearances when you click Summon.</div>
              </div>
            `;
            return;
          }

          const selected = getSelected();
          if (!selected) {
            preview.innerHTML = `
              <div style="padding: 0.55rem 0.65rem; border: 1px solid var(--color-border-light-tertiary); border-radius: 6px;">
                <strong>Generic artwork</strong>
                <div class="hint">Select a creature below, or leave this blank to use the generic CPR summon artwork.</div>
              </div>
            `;
            return;
          }

          preview.innerHTML = `
            <div style="display: flex; gap: 0.75rem; align-items: center; padding: 0.55rem 0.65rem; border: 1px solid var(--color-border-highlight); border-radius: 6px;">
              <img
                src="${this._escapeHtml(selected.thumbnail)}"
                alt=""
                style="width: 72px; height: 72px; object-fit: contain; border: 0; flex: 0 0 72px;"
              >
              <div style="min-width: 0;">
                <div style="font-weight: 700; font-size: 1.05em;">${this._escapeHtml(selected.name)}</div>
                <div class="hint" style="margin: 0.15rem 0 0;">${this._escapeHtml(selected.sourceLabel)}</div>
              </div>
            </div>
          `;
        };

        const renderResults = ({resetPagination = false, preserveScroll = false} = {}) => {
          const randomMode = Boolean(random.checked);
          search.disabled = randomMode;
          clear.disabled = randomMode;
          results.style.opacity = randomMode ? "0.5" : "1";
          results.style.pointerEvents = randomMode ? "none" : "auto";

          if (resetPagination) visibleLimit = PAGE_SIZE;

          if (randomMode) {
            results.innerHTML = "";
            renderPreview();
            return;
          }

          const filtered = getFilteredAppearances();
          const shown = filtered.slice(0, visibleLimit);
          const selectedKey = String(selectedInput.value ?? "");
          const previousScrollTop = preserveScroll ? results.scrollTop : 0;

          if (!shown.length) {
            results.innerHTML = `<p class="hint" style="padding: 0.5rem 0;">No matching creature appearances.</p>`;
            renderPreview();
            return;
          }

          results.innerHTML = shown.map(choice => {
            const key = appearanceKey(choice);
            const selected = key === selectedKey;
            return `
              <button
                type="button"
                data-zft-bf-appearance-key="${this._escapeHtml(key)}"
                style="
                  display: flex;
                  width: 100%;
                  gap: 0.65rem;
                  align-items: center;
                  padding: 0.4rem 0.5rem;
                  text-align: left;
                  min-height: 62px;
                  border: 1px solid ${selected ? "var(--color-border-highlight)" : "var(--color-border-light-tertiary)"};
                  border-radius: 6px;
                  background: ${selected ? "var(--color-bg-option)" : "transparent"};
                "
              >
                <img
                  src="${this._escapeHtml(choice.thumbnail)}"
                  alt=""
                  loading="lazy"
                  style="width: 52px; height: 52px; object-fit: contain; border: 0; flex: 0 0 52px;"
                >
                <span style="min-width: 0; flex: 1;">
                  <span style="display: block; font-weight: 700;">${this._escapeHtml(choice.name)}</span>
                  <span class="hint" style="display: block; margin: 0.1rem 0 0; white-space: normal;">${this._escapeHtml(choice.sourceLabel)}</span>
                </span>
                ${selected ? '<i class="fa-solid fa-circle-check" aria-label="Selected"></i>' : ""}
              </button>
            `;
          }).join("");

          if (filtered.length > shown.length) {
            results.insertAdjacentHTML(
              "beforeend",
              `<p data-zft-bf-load-more-hint class="hint" style="padding: 0.35rem 0 0;">Showing ${shown.length} of ${filtered.length}. Scroll down to load more.</p>`
            );
          } else {
            results.insertAdjacentHTML(
              "beforeend",
              `<p class="hint" style="padding: 0.35rem 0 0;">Showing all ${shown.length} matching appearance${shown.length === 1 ? "" : "s"}.</p>`
            );
          }

          if (preserveScroll) results.scrollTop = previousScrollTop;
          renderPreview();
        };

        results.addEventListener("click", clickEvent => {
          const row = clickEvent.target.closest("[data-zft-bf-appearance-key]");
          if (!row || random.checked) return;
          selectedInput.value = row.dataset.zftBfAppearanceKey ?? "";
          renderResults({preserveScroll: true});
        });

        search.addEventListener("input", () => {
          results.scrollTop = 0;
          renderResults({resetPagination: true});
        });

        clear.addEventListener("click", () => {
          selectedInput.value = "";
          renderResults({preserveScroll: true});
        });

        random.addEventListener("change", () => {
          results.scrollTop = 0;
          renderResults({resetPagination: true});
        });

        results.addEventListener("scroll", () => {
          if (random.checked) return;

          const filtered = getFilteredAppearances();
          if (visibleLimit >= filtered.length) return;

          const distanceFromBottom = results.scrollHeight - results.scrollTop - results.clientHeight;
          if (distanceFromBottom > 90) return;

          visibleLimit = Math.min(visibleLimit + PAGE_SIZE, filtered.length);
          renderResults({preserveScroll: true});
        });

        renderResults({resetPagination: true});
      },
      ok: {
        label: "Summon",
        callback: (event, button) => {
          let appearance = null;
          const randomize = Boolean(button.form.elements.randomAppearance?.checked);

          if (randomize && appearances.length) {
            appearance = appearances[Math.floor(Math.random() * appearances.length)] ?? null;
          } else {
            const key = String(button.form.elements.appearanceKey?.value ?? "");
            appearance = appearancesByKey.get(key) ?? null;
          }

          return {
            form: button.form.elements.form.value,
            creatureType: button.form.elements.creatureType.value,
            appearance
          };
        }
      }
    });
  },

  getBattleStats(form, spellLevel) {
    const brute = form === "brute";
    const flyer = form === "flyer";

    const hp = (brute ? 30 : 20) + Math.max(0, spellLevel - 2) * 5;
    const ac = 11 + spellLevel + (brute ? 2 : 0);
    const talented = Math.floor(spellLevel / 2);
    const attacks = Math.max(1, Math.floor(spellLevel / 2));

    return {
      hp,
      ac,
      talented,
      attacks,
      movement: {
        walk: 40,
        fly: flyer ? 30 : 0,
        swim: 30,
        hover: flyer
      }
    };
  },

  getSummonAnimationKey(creatureType) {
    switch (String(creatureType ?? "").trim().toLowerCase()) {
      case "celestial":
        return "celestial";
      case "fey":
        return "nature";
      case "fiend":
        return "fire";
      default:
        return "none";
    }
  },

  async playBattleFamiliarEffect(tokenDocument, creatureType) {
    const animationKey = this.getSummonAnimationKey(creatureType);
    if (animationKey === "none") return;

    const animationUtils = this.cpr?.utils?.animationUtils;
    const callback = animationUtils?.summonEffects?.[animationKey];
    if (typeof callback !== "function") return;

    if (!(animationUtils?.jb2aCheck?.() === "patreon" && animationUtils?.aseCheck?.())) return;

    const tokenObject = tokenDocument?.object
      ?? (tokenDocument?.id ? canvas.tokens?.get(tokenDocument.id) : null)
      ?? null;

    if (!tokenObject) return;

    try {
      await callback(null, tokenObject, {}, 0);
    } catch (error) {
      ZFTFA.warn("⚠️ Battle Familiar | Could not play summon effect", {
        animationKey,
        token: tokenDocument?.name ?? tokenObject?.name ?? null,
        error
      });
    }
  },

  async buildBattleItems(originItem, form, spellLevel) {
    const Summons = this.cpr.Summons;
    const stats = this.getBattleStats(form, spellLevel);

    const multiattack = await Summons.getSummonItem(
      "Multiattack (Bestial Spirit)",
      {},
      originItem,
      {
        identifier: "zftBattleFamiliarMultiattack",
        rules: "modern"
      }
    );

    const rend = await Summons.getSummonItem(
      "Rend (Bestial Spirit)",
      {},
      originItem,
      {
        identifier: "zftBattleFamiliarRend",
        flatAttack: true,
        damageFlat: `1d8 + 3 + ${spellLevel}`,
        rules: "modern"
      }
    );

    if (!multiattack || !rend) {
      throw new Error("CPR Battle Familiar support could not load the required Bestial Spirit summon features.");
    }

    multiattack.name = "Multiattack";
    multiattack.system.description.value = `
      <p>The familiar makes <strong>${stats.attacks}</strong> Rend attack${stats.attacks === 1 ? "" : "s"}.</p>
      ${form === "stalker" ? "<p>It can replace one of these attacks with Prowl.</p>" : ""}
    `;

    rend.name = "Rend";
    rend.system.description.value = `
      <p><strong>Melee Attack Roll:</strong> Bonus equals the summoner's spell attack modifier, reach 5 ft.</p>
      <p><strong>Hit:</strong> 1d8 + 3 + ${spellLevel} Force damage.</p>
    `;

    for (const activity of Object.values(rend.system.activities ?? {})) {
      const part = activity?.damage?.parts?.[0];
      if (part) part.types = ["force"];
    }

    const talented = foundry.utils.deepClone(multiattack);
    delete talented._id;
    talented.name = "Talented";
    talented.system.identifier = "zft-battle-familiar-talented";
    talented.system.activities = {};
    talented.system.description.value = `
      <p>Add <strong>${stats.talented}</strong> to any ability check or saving throw the familiar makes.</p>
    `;

    const items = [multiattack, rend, talented];

    if (form === "flyer") {
      const flyby = await Summons.getSummonItem(
        "Flyby (Air Only)",
        {},
        originItem,
        {
          identifier: "zftBattleFamiliarFlyby",
          rules: "modern"
        }
      );

      if (flyby) {
        flyby.name = "Flyby";
        flyby.system.description.value = "<p>The familiar doesn't provoke an Opportunity Attack when it flies out of an enemy's reach.</p>";
        items.push(flyby);
      }
    }

    if (form === "stalker") {
      const prowl = foundry.utils.deepClone(multiattack);
      delete prowl._id;
      prowl.name = "Prowl";
      prowl.system.identifier = "zft-battle-familiar-prowl";
      prowl.system.description.value = `
        <p>The familiar moves up to half its Speed without provoking Opportunity Attacks.</p>
        <p>At the end of this movement, the familiar can take the Hide action.</p>
      `;

      const activities = Object.values(prowl.system.activities ?? {});
      if (activities.length) {
        const activity = activities[0];
        activity.name = "Prowl";
        activity.type = "utility";
        activity.activation = {
          ...(activity.activation ?? {}),
          type: "action",
          value: 1,
          override: false
        };
        delete activity.attack;
        delete activity.damage;
      }

      items.push(prowl);
    }

    return items;
  },

  buildActorUpdates({workflow, form, creatureType, spellLevel, items, appearance = null, preserveHp = false, existingActor = null}) {
    const stats = this.getBattleStats(form, spellLevel);
    const actor = workflow.actor;
    const tokenDocument = workflow.token?.document ?? workflow.token;
    const name = existingActor?.name ?? `Battle Familiar (${form.capitalize?.() ?? form})`;
    const casterLanguages = foundry.utils.deepClone(actor.system?.traits?.languages ?? {value: [], custom: ""});

    const system = {
      abilities: {
        str: { value: 16 },
        dex: { value: 16 },
        con: { value: 12 },
        int: { value: 8 },
        wis: { value: 13 },
        cha: { value: 10 }
      },
      attributes: {
        ac: { flat: stats.ac },
        movement: stats.movement,
        senses: {
          darkvision: 60
        }
      },
      traits: {
        size: "med",
        ci: {
          value: ["charmed", "frightened"]
        },
        languages: casterLanguages
      },
      bonuses: {
        abilities: {
          check: String(stats.talented),
          save: String(stats.talented)
        }
      }
    };

    if (!preserveHp) {
      system.attributes.hp = {
        formula: String(stats.hp),
        max: stats.hp,
        value: stats.hp
      };

      system.details = {
        cr: this.cpr.utils.actorUtils?.getCRFromProf
          ? this.cpr.utils.actorUtils.getCRFromProf(actor.system.attributes.prof)
          : 0,
        type: {
          value: creatureType
        },
        alignment: "Neutral"
      };
    }

    const actorUpdate = {
      name,
      system,
      prototypeToken: {
        name,
        disposition: tokenDocument?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY
      },
      items
    };

    const tokenUpdate = {
      name,
      disposition: tokenDocument?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY
    };

    const portrait = appearance?.portrait ?? appearance?.token ?? null;
    const tokenArt = appearance?.token ?? appearance?.portrait ?? null;

    if (portrait) actorUpdate.img = portrait;
    if (tokenArt) {
      actorUpdate.prototypeToken.texture = {src: tokenArt};
      tokenUpdate.texture = {src: tokenArt};
    }

    return {
      actor: actorUpdate,
      token: tokenUpdate
    };
  },

  async summonNewBattleFamiliar({workflow, form, creatureType, appearance = null, spellLevel}) {
    const {compendiumUtils, constants, genericUtils} = this.cpr.utils;

    const sourceActor = await compendiumUtils.getActorFromCompendium(
      constants.modernPacks.summons,
      "CPR - Bestial Spirit"
    );

    if (!sourceActor) {
      ui.notifications.error("CPR - Bestial Spirit could not be found in the CPR summon compendium.");
      return;
    }

    const items = await this.buildBattleItems(workflow.item, form, spellLevel);
    const resolvedAppearance = await this.resolveAppearanceArt(appearance);
    const updates = this.buildActorUpdates({
      workflow,
      form,
      creatureType,
      spellLevel,
      items,
      appearance: resolvedAppearance
    });

    const stats = this.getBattleStats(form, spellLevel);
    const animation = this.getSummonAnimationKey(creatureType);
    const animationUtils = this.cpr?.utils?.animationUtils;

    ZFTFA.log("✨ Battle Familiar | CPR summon animation selected", {
      animation,
      jb2a: animationUtils?.jb2aCheck?.() ?? false,
      animatedSpellEffectsCartoon: animationUtils?.aseCheck?.() ?? false,
      sequencer: animationUtils?.sequencerCheck?.() ?? false
    });

    const spawned = await this.cpr.Summons.spawn(
      sourceActor,
      updates,
      workflow.item,
      workflow.token,
      {
        duration: 3600,
        range: 10,
        animation,
        initiativeType: "separate",
        customIdentifier: this.SUMMON_IDENTIFIER,
        additionalSummonVaeButtons: items
          .filter(item => ["Multiattack", "Rend", "Prowl"].includes(item.name))
          .map(item => ({
            type: "use",
            name: item.name,
            identifier: item.flags?.["chris-premades"]?.info?.identifier ?? item.system?.identifier
          }))
      }
    );

    if (!spawned?.length) return;

    ZFTFA.log("✅ Battle Familiar | New familiar summoned", {
      actor: workflow.actor.name,
      form,
      creatureType,
      spellLevel,
      ac: stats.ac,
      hp: stats.hp,
      attacks: stats.attacks,
      appearance: resolvedAppearance?.name ?? "generic",
      appearancePack: resolvedAppearance?.pack ?? null,
      appearanceToken: resolvedAppearance?.token ?? null,
      token: spawned[0]?.name
    });
  },

  async resolveFindFamiliar(actor) {
    const effectUtils = this.cpr?.utils?.effectUtils;
    if (!effectUtils) return null;

    const effect = effectUtils.getEffectByIdentifier(actor, "findFamiliar");
    if (!effect) return null;

    const summonFlags = effect.flags?.["chris-premades"]?.summons;
    const idsObject = summonFlags?.ids ?? {};
    const scenesObject = summonFlags?.scenes ?? {};

    const key = Object.keys(idsObject).find(k => Array.isArray(idsObject[k]) && idsObject[k].length);
    if (!key) return {effect, tokenDocument: null};

    const tokenId = idsObject[key]?.[0];
    const sceneId = scenesObject[key]?.[0];
    const scene = game.scenes.get(sceneId) ?? canvas.scene;
    const tokenDocument = scene?.tokens?.get(tokenId) ?? null;

    return {effect, tokenDocument};
  },

  snapshotExistingFamiliar(actor) {
    return foundry.utils.deepClone({
      abilities: actor.system?.abilities,
      ac: actor.system?.attributes?.ac,
      movement: actor.system?.attributes?.movement,
      senses: actor.system?.attributes?.senses,
      bonusesAbilities: actor.system?.bonuses?.abilities,
      size: actor.system?.traits?.size,
      ci: actor.system?.traits?.ci,
      languages: actor.system?.traits?.languages,
      tempHp: Number(actor.system?.attributes?.hp?.temp ?? 0)
    });
  },

  async empowerExistingFamiliar({workflow, familiarToken, form, spellLevel}) {
    const familiarActor = familiarToken.actor;
    if (!familiarActor) return;

    const oldMarker = familiarActor.getFlag(ZFTFA.MODULE_ID, this.ACTOR_FLAG);
    if (oldMarker) {
      await this.endEmpowermentByActor(familiarActor);
    }

    const snapshot = this.snapshotExistingFamiliar(familiarActor);
    const stats = this.getBattleStats(form, spellLevel);
    const items = await this.buildBattleItems(workflow.item, form, spellLevel);

    const systemUpdates = this.buildActorUpdates({
      workflow,
      form,
      creatureType: familiarActor.system?.details?.type?.value,
      spellLevel,
      items: [],
      preserveHp: true,
      existingActor: familiarActor
    }).actor.system;

    await familiarActor.update({
      "system.abilities": systemUpdates.abilities,
      "system.attributes.ac": systemUpdates.attributes.ac,
      "system.attributes.movement": systemUpdates.attributes.movement,
      "system.attributes.senses": systemUpdates.attributes.senses,
      "system.traits.size": systemUpdates.traits.size,
      "system.traits.ci": systemUpdates.traits.ci,
      "system.traits.languages": systemUpdates.traits.languages,
      "system.bonuses.abilities": systemUpdates.bonuses.abilities,
      "system.attributes.hp.temp": stats.hp
    });

    const createdItems = await familiarActor.createEmbeddedDocuments("Item", items);

    await familiarActor.setFlag(ZFTFA.MODULE_ID, this.ACTOR_FLAG, {
      casterUuid: workflow.actor.uuid,
      battleItemUuid: workflow.item.uuid,
      form,
      spellLevel,
      grantedTempHp: stats.hp,
      addedItemIds: createdItems.map(i => i.id)
    });

    const effectData = {
      name: `Battle Familiar (${form.capitalize?.() ?? form})`,
      img: workflow.item.img,
      origin: workflow.item.uuid,
      duration: {
        seconds: 3600,
        startTime: game.time.worldTime
      },
      flags: {
        [ZFTFA.MODULE_ID]: {
          battleFamiliar: {
            mode: "empower",
            familiarActorUuid: familiarActor.uuid,
            familiarTokenUuid: familiarToken.uuid,
            snapshot,
            addedItemIds: createdItems.map(i => i.id),
            form,
            spellLevel
          }
        }
      }
    };

    await this.cpr.utils.effectUtils.createEffect(
      workflow.actor,
      effectData,
      {
        identifier: this.EMPOWER_IDENTIFIER,
        rules: "modern"
      }
    );

    await this.playBattleFamiliarEffect(
      familiarToken,
      familiarActor.system?.details?.type?.value
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor: workflow.actor, token: workflow.token}),
      content: `
        <p><strong>Battle Familiar</strong></p>
        <p>${familiarActor.name} is empowered as a <strong>${form.capitalize?.() ?? form}</strong> Battle Familiar.</p>
        <p>AC ${stats.ac}; Battle Familiar temporary HP ${stats.hp}; Multiattack ${stats.attacks}.</p>
      `
    });

    ZFTFA.log("✅ Battle Familiar | Existing Find Familiar empowered", {
      caster: workflow.actor.name,
      familiar: familiarActor.name,
      form,
      spellLevel,
      ac: stats.ac,
      grantedTempHp: stats.hp,
      attacks: stats.attacks
    });
  },

  async endExistingBattleFamiliar(actor) {
    const {effectUtils, genericUtils} = this.cpr.utils;

    for (const identifier of [this.SUMMON_IDENTIFIER, this.EMPOWER_IDENTIFIER]) {
      const effect = effectUtils.getEffectByIdentifier(actor, identifier);
      if (effect) {
        await genericUtils.remove(effect);
      }
    }
  },

  async handleDeletedEffect(effect) {
    const data = effect?.flags?.[ZFTFA.MODULE_ID]?.battleFamiliar;
    if (!data || data.mode !== "empower") return;

    await this.restoreEmpoweredFamiliar(data);
  },

  async handleActorUpdate(actor, changes) {
    if (!actor || this._restoringActors.has(actor.uuid)) return;

    const marker = actor.getFlag?.(ZFTFA.MODULE_ID, this.ACTOR_FLAG);
    if (!marker) return;

    if (!foundry.utils.hasProperty(changes, "system.attributes.hp.temp")) return;

    const newTemp = Number(foundry.utils.getProperty(changes, "system.attributes.hp.temp") ?? actor.system?.attributes?.hp?.temp ?? 0);
    if (newTemp > 0) return;

    ZFTFA.log("🐾 Battle Familiar | Granted temporary HP depleted; ending empowerment", {
      familiar: actor.name,
      casterUuid: marker.casterUuid
    });

    await this.endEmpowermentByActor(actor);
  },

  async endEmpowermentByActor(actor) {
    const marker = actor.getFlag?.(ZFTFA.MODULE_ID, this.ACTOR_FLAG);
    if (!marker?.casterUuid) return;

    const caster = await fromUuid(marker.casterUuid);
    if (!caster) return;

    const effect = this.cpr.utils.effectUtils.getEffectByIdentifier(caster, this.EMPOWER_IDENTIFIER);
    if (effect) {
      await this.cpr.utils.genericUtils.remove(effect);
    }
  },

  async restoreEmpoweredFamiliar(data) {
    let actor = await fromUuid(data.familiarActorUuid);

    if (!actor && data.familiarTokenUuid) {
      const token = await fromUuid(data.familiarTokenUuid);
      actor = token?.actor ?? null;
    }

    if (!actor) {
      ZFTFA.warn("⚠️ Battle Familiar | Could not restore empowered familiar because its actor is no longer available", data);
      return;
    }

    this._restoringActors.add(actor.uuid);

    try {
      const addedIds = (data.addedItemIds ?? []).filter(id => actor.items.get(id));
      if (addedIds.length) {
        await actor.deleteEmbeddedDocuments("Item", addedIds);
      }

      const snapshot = data.snapshot ?? {};
      const update = {
        "system.abilities": snapshot.abilities,
        "system.attributes.ac": snapshot.ac,
        "system.attributes.movement": snapshot.movement,
        "system.attributes.senses": snapshot.senses,
        "system.bonuses.abilities": snapshot.bonusesAbilities,
        "system.traits.size": snapshot.size,
        "system.traits.ci": snapshot.ci,
        "system.traits.languages": snapshot.languages,
        "system.attributes.hp.temp": 0
      };

      await actor.update(update);
      await actor.unsetFlag(ZFTFA.MODULE_ID, this.ACTOR_FLAG);

      ZFTFA.log("✅ Battle Familiar | Existing familiar restored", {
        familiar: actor.name
      });
    } finally {
      this._restoringActors.delete(actor.uuid);
    }
  }
};

Hooks.once("ready", async () => {
  await ZFTFA.BattleFamiliar.register();
  ZFTFA.log("✅ v1.3.8 | Battle Familiar automation ready");
});
