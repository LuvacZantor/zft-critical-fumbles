console.log("[ZFT] 🩸 v1.0.9 | Bloodlust feature automation loading");

globalThis.ZFTFA ??= {
  MODULE_ID: "zft-feature-automation"
};

ZFTFA.Bloodlust = {
  async register() {
    ZFTFA.log("🩸 Bloodlust | Registering feature hooks");

    if (ZFTFA.isModuleActive?.(ZFTFA.MODULES?.MIDI_QOL ?? "midi-qol")) {
      Hooks.on("midi-qol.postAttackRoll", async workflow => {
        try {
          ZFTFA.log("🧪 Bloodlust | midi-qol.postAttackRoll fired", {
            actor: workflow?.actor?.name,
            item: workflow?.item?.name,
            hitTargets: Array.from(workflow?.hitTargets ?? []).map(t => t.name)
          });

          await this.SanguineFeast.handlePostAttackRoll(workflow, "midi-qol.postAttackRoll");
        } catch (error) {
          ZFTFA.error("❌ Bloodlust | postAttackRoll hook failure", error);
        }
      });

      Hooks.on("midi-qol.RollComplete", async workflow => {
        try {
          ZFTFA.log("🧪 Bloodlust | midi-qol.RollComplete fired", {
            actor: workflow?.actor?.name,
            item: workflow?.item?.name,
            hitTargets: Array.from(workflow?.hitTargets ?? []).map(t => t.name),
            targets: Array.from(workflow?.targets ?? []).map(t => t.name)
          });

          await this.SanguineFeast.handlePostAttackRoll(workflow, "midi-qol.RollComplete");
        } catch (error) {
          ZFTFA.error("❌ Bloodlust | RollComplete hook failure", error);
        }
      });

      ZFTFA.log("✅ Bloodlust | Sanguine Feast hooks registered: postAttackRoll + RollComplete");
    } else {
      ZFTFA.warn("⚠️ Bloodlust | MidiQOL inactive; Sanguine Feast automation disabled");
    }

    Hooks.on("dnd5e.rollHitDie", async (...args) => {
  try {
		ZFTFA.log("🧪 Bloodlust Recovery | dnd5e.rollHitDie hook fired", {
		  argCount: args.length,
		  args
		});

		await this.PowerfulRecovery.handleRollHitDie(...args);
	  } catch (error) {
		ZFTFA.error("❌ Bloodlust | Powerful Recovery hook failure", error);
	  }
	});

	ZFTFA.log("✅ Bloodlust | Powerful Recovery hook registered");
  },

  getFeat(actor) {
    return ZFTFA.getFeature?.(actor, ZFTFA.FEATURES?.BLOODLUST ?? "Bloodlust")
      ?? actor?.items?.find(i => i.name === "Bloodlust" && i.type === "feat")
      ?? null;
  },

  SanguineFeast: {
    async handlePostAttackRoll(workflow, hookSource = "unknown") {
      ZFTFA.log(`🩸 Bloodlust | Sanguine Feast handler entered via ${hookSource}`, {
        actor: workflow?.actor?.name,
        item: workflow?.item?.name,
        hasAttackRoll: Boolean(workflow?.attackRoll),
        hitTargets: Array.from(workflow?.hitTargets ?? []).map(t => t.name),
        targets: Array.from(workflow?.targets ?? []).map(t => t.name)
      });

      const actor = workflow?.actor;
      const token = workflow?.token;

      if (!actor || !token) {
        ZFTFA.warn("⚠️ Bloodlust | Missing workflow actor or token");
        return;
      }

      const feat = ZFTFA.Bloodlust.getFeat(actor);
      if (!feat) {
        ZFTFA.log(`🔎 Bloodlust | Sanguine Feast skipped: ${actor.name} does not have Bloodlust`);
        return;
      }

      if (!this.isAttackWorkflow(workflow)) {
        ZFTFA.log("🔎 Bloodlust | Sanguine Feast skipped: not an attack workflow");
        return;
      }

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (!hitTargets.length) {
        ZFTFA.log("🔎 Bloodlust | Sanguine Feast skipped: no hit targets");
        return;
      }

      const validTargets = hitTargets.filter(targetToken => this.isValidBloodiedTarget(targetToken));
      if (!validTargets.length) {
        ZFTFA.log("🔎 Bloodlust | Sanguine Feast skipped: no valid bloodied targets");
        return;
      }

      if (this.wasUsedThisTurn(actor)) {
        ZFTFA.log("🔎 Bloodlust | Sanguine Feast skipped: already used this turn");
        return;
      }

      if (!this.hasFeatureUse(feat)) {
        ZFTFA.warn("⚠️ Bloodlust | No Bloodlust uses remaining");
        return;
      }

      const hitDiceOptions = this.getAvailableHitDice(actor);
      if (!hitDiceOptions.length) {
        ZFTFA.warn("⚠️ Bloodlust | No Hit Dice available to expend");
        return;
      }

      const targetNames = validTargets.map(t => t.name).join(", ");

	const confirmed = await foundry.applications.api.DialogV2.confirm({
	  window: {
		title: "Bloodlust: Sanguine Feast"
	  },
	  content: `
		<p><strong>${actor.name}</strong> hit a bloodied valid creature:</p>
		<p>${targetNames}</p>
		<p>Expend one Hit Die and one Bloodlust use to regain HP?</p>
	  `,
	  modal: true,
	  rejectClose: false
	});

      if (!confirmed) {
        ZFTFA.log("🚫 Bloodlust | Player declined Sanguine Feast");
        return;
      }

      const selected = await this.chooseHitDie(hitDiceOptions);
      if (!selected) {
        ZFTFA.log("🚫 Bloodlust | Hit Die selection cancelled");
        return;
      }

      await this.expendFeatureUse(feat);
      await this.expendHitDie(selected.classItem);

      const roll = await new Roll(`1${selected.die}`).evaluate();

      const rawDie = roll.dice[0]?.results?.find(r => r.active !== false)?.result ?? roll.total;
      const treatedDie = Math.max(3, Number(rawDie ?? 0));
      const conMod = actor.system?.abilities?.con?.mod ?? 0;
      const healing = Math.max(0, treatedDie + conMod);

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor, token }),
        flavor: `
          <strong>Bloodlust: Sanguine Feast</strong>
          <br>Expended one ${selected.die} Hit Die.
          ${rawDie <= 2 ? `<br>Powerful Recovery: ${rawDie} treated as 3.` : ""}
        `
      });

      await this.applyHealing(actor, token, healing);
      await this.markUsedThisTurn(actor);

      ZFTFA.log(`✅ Bloodlust | Sanguine Feast resolved | Die: ${selected.die} | Raw: ${rawDie} | Treated: ${treatedDie} | CON: ${conMod} | Healing: ${healing}`);
    },

    isAttackWorkflow(workflow) {
      const item = workflow?.item;
      const hasAttackRoll = Boolean(workflow?.attackRoll);
      const actionType = item?.system?.actionType;

      return hasAttackRoll || ["mwak", "rwak", "msak", "rsak"].includes(actionType);
    },

    isValidBloodiedTarget(token) {
      const actor = token?.actor;
      if (!actor) return false;

      const hp = actor.system?.attributes?.hp;
      const current = Number(hp?.value ?? 0);
      const max = Number(hp?.max ?? 0);

      if (!max || current > max / 2) {
        ZFTFA.log(`🔎 Bloodlust | Target not bloodied: ${actor.name} | HP ${current}/${max}`);
        return false;
      }

      const typeValue = String(actor.system?.details?.type?.value ?? "").toLowerCase();
      const customType = String(actor.system?.details?.type?.custom ?? "").toLowerCase();
      const combinedType = `${typeValue} ${customType}`;

      if (combinedType.includes("construct") || combinedType.includes("undead")) {
        ZFTFA.log(`🔎 Bloodlust | Invalid target type: ${actor.name} | ${combinedType}`);
        return false;
      }

      return true;
    },

    getAvailableHitDice(actor) {
      return actor.items
        .filter(i => i.type === "class")
        .map(classItem => {
          const die =
            classItem.system?.hitDice
            ?? classItem.system?.hd?.denomination;

          const levels = Number(classItem.system?.levels ?? 0);

          const used = Number(
            classItem.system?.hitDiceUsed
            ?? classItem.system?.hd?.spent
            ?? 0
          );

          const remaining = Math.max(0, levels - used);

          return {
            classItem,
            die,
            levels,
            used,
            remaining,
            label: `${classItem.name} — ${die} (${remaining} remaining)`
          };
        })
        .filter(option => option.die && option.remaining > 0);
    },

    async chooseHitDie(options) {
	  if (options.length === 1) return options[0];

	  const optionHtml = options.map((option, index) => {
		return `<option value="${index}">${option.label}</option>`;
	  }).join("");

	  const selectedIndex = await foundry.applications.api.DialogV2.prompt({
		window: {
		  title: "Bloodlust: Choose Hit Die"
		},
		content: `
		  <div class="form-group">
			<label>Hit Die</label>
			<select name="hitDie">${optionHtml}</select>
		  </div>
		`,
		modal: true,
		rejectClose: false,
		ok: {
		  label: "Expend",
		  callback: (event, button) => {
			return Number(button.form.elements.hitDie.value);
		  }
		}
	  });

	  if (!Number.isInteger(selectedIndex)) return null;

	  return options[selectedIndex] ?? null;
	},

    async expendHitDie(classItem) {
      const currentUsed = Number(
        classItem.system?.hitDiceUsed
        ?? classItem.system?.hd?.spent
        ?? 0
      );

      if (classItem.system?.hitDiceUsed !== undefined) {
        await classItem.update({
          "system.hitDiceUsed": currentUsed + 1
        });

        ZFTFA.log(`🎲 Bloodlust | Expended Hit Die via system.hitDiceUsed from class: ${classItem.name}`);
        return;
      }

      if (classItem.system?.hd?.spent !== undefined) {
        await classItem.update({
          "system.hd.spent": currentUsed + 1
        });

        ZFTFA.log(`🎲 Bloodlust | Expended Hit Die via system.hd.spent from class: ${classItem.name}`);
        return;
      }

      ZFTFA.warn("⚠️ Bloodlust | Could not identify class Hit Die spent path", {
        className: classItem.name,
        system: classItem.system
      });
    },

        hasFeatureUse(feat) {
      const uses = feat.system?.uses;
      if (!uses) return true;

      const spent = Number(uses.spent ?? 0);
      const max = Number(uses.max ?? 0);

      if (Number.isFinite(spent) && Number.isFinite(max) && max > 0) {
        const hasUses = spent < max;

        ZFTFA.log(`🔎 Bloodlust | Feature uses checked via system.uses.spent | ${spent}/${max} | Available: ${hasUses}`);

        return hasUses;
      }

      if (Number.isNumeric(uses.value)) {
        const hasUses = Number(uses.value) > 0;

        ZFTFA.log(`🔎 Bloodlust | Feature uses checked via legacy system.uses.value | ${uses.value} | Available: ${hasUses}`);

        return hasUses;
      }

      ZFTFA.warn("⚠️ Bloodlust | Could not evaluate feature uses; allowing use by fallback", {
        item: feat.name,
        uuid: feat.uuid,
        uses
      });

      return true;
    },

    async expendFeatureUse(feat) {
      const uses = feat.system?.uses;

      if (!uses) {
        ZFTFA.warn("⚠️ Bloodlust | No uses structure found; feature use not expended", {
          item: feat.name,
          uuid: feat.uuid
        });
        return;
      }

      const spent = Number(uses.spent ?? 0);
      const max = Number(uses.max ?? 0);

      if (Number.isFinite(spent) && Number.isFinite(max) && max > 0) {
        const nextSpent = Math.min(max, spent + 1);

        await feat.update({
          "system.uses.spent": nextSpent
        });

        ZFTFA.log(`🧾 Bloodlust | Expended one feature use via system.uses.spent | ${spent} → ${nextSpent} / ${max}`, {
          item: feat.name,
          uuid: feat.uuid
        });

        return;
      }

      if (Number.isNumeric(uses.value)) {
        const currentValue = Number(uses.value);
        const nextValue = Math.max(0, currentValue - 1);

        await feat.update({
          "system.uses.value": nextValue
        });

        ZFTFA.log(`🧾 Bloodlust | Expended one feature use via legacy system.uses.value | ${currentValue} → ${nextValue}`, {
          item: feat.name,
          uuid: feat.uuid
        });

        return;
      }

      ZFTFA.warn("⚠️ Bloodlust | Could not identify feature use structure; no feature use expended", {
        item: feat.name,
        uuid: feat.uuid,
        uses
      });
    },
   
    async applyHealing(actor, token, amount) {
      if (amount <= 0) {
        ZFTFA.log("🔎 Bloodlust | Healing amount was 0; no HP update applied");
        return;
      }

      const hp = actor.system?.attributes?.hp;
      const current = Number(hp?.value ?? 0);
      const rawMax = Number(hp?.max ?? 0);
      const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : current + amount;
      const newValue = Math.min(max, current + amount);
      const applied = Math.max(0, newValue - current);

      await actor.update({
        "system.attributes.hp.value": newValue
      });

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor, token }),
        content: `
          <p><strong>Bloodlust: Sanguine Feast</strong></p>
          <p>${actor.name} regains <strong>${applied}</strong> Hit Points.</p>
        `
      });

      ZFTFA.log(`💚 Bloodlust | Healing applied | ${current} → ${newValue}`);
    },

    wasUsedThisTurn(actor) {
      const combat = game.combat;
      if (!combat) return false;

      const currentTurnId = `${combat.id}.${combat.round}.${combat.turn}`;

      const usedTurnId = actor.getFlag(
        ZFTFA.MODULE_ID,
        ZFTFA.FLAGS?.BLOODLUST_SANGUINE_FEAST_TURN ?? "bloodlustSanguineFeastTurn"
      );

      return usedTurnId === currentTurnId;
    },

    async markUsedThisTurn(actor) {
      const combat = game.combat;
      if (!combat) return;

      const currentTurnId = `${combat.id}.${combat.round}.${combat.turn}`;

      await actor.setFlag(
        ZFTFA.MODULE_ID,
        ZFTFA.FLAGS?.BLOODLUST_SANGUINE_FEAST_TURN ?? "bloodlustSanguineFeastTurn",
        currentTurnId
      );

      ZFTFA.log(`🕒 Bloodlust | Marked once-per-turn usage: ${currentTurnId}`);
    }
  },

      PowerfulRecovery: {
    async handleRollHitDie(...args) {
      const context = this.resolveRollHitDieContext(args);

      ZFTFA.log("🧪 Bloodlust Recovery | Parsed rollHitDie context", {
        argCount: args.length,
        actor: context.actor?.name,
        rollFormula: context.roll?.formula,
        hasRollDice: Boolean(context.roll?.dice?.length),
        hasUpdates: Boolean(context.updates),
        argTypes: args.map(arg => ({
          constructor: arg?.constructor?.name,
          isArray: Array.isArray(arg),
          length: Array.isArray(arg) ? arg.length : undefined,
          name: arg?.name,
          type: arg?.type,
          uuid: arg?.uuid,
          hasSubject: Boolean(arg?.subject),
          hasUpdates: Boolean(arg?.updates),
          hasActor: Boolean(arg?.actor),
          hasRoll: Boolean(arg?.roll),
          hasRolls: Boolean(arg?.rolls?.length),
          hasDice: Boolean(arg?.dice?.length)
        }))
      });

      const { actor, roll, updates } = context;

      if (!actor) {
        ZFTFA.warn("⚠️ Bloodlust Recovery | Could not resolve actor from dnd5e.rollHitDie hook", {
          args
        });
        return;
      }

      const feat = ZFTFA.Bloodlust.getFeat(actor);
      if (!feat) {
        ZFTFA.log(`🔎 Bloodlust Recovery | Skipped: ${actor.name} does not have Bloodlust`);
        return;
      }

      if (!roll?.dice?.length) {
        ZFTFA.warn("⚠️ Bloodlust Recovery | Could not resolve roll dice from dnd5e.rollHitDie hook", {
          actor: actor.name,
          roll,
          args
        });
        return;
      }

      const hitDie = this.getPrimaryHitDie(roll);

      if (!hitDie) {
        ZFTFA.warn("⚠️ Bloodlust Recovery | Could not identify primary Hit Die", {
          actor: actor.name,
          formula: roll.formula,
          dice: roll.dice
        });
        return;
      }

      const delta = this.getPowerfulRecoveryDelta(hitDie);

      if (delta <= 0) {
        ZFTFA.log(`🔎 Bloodlust Recovery | No adjustment needed | ${actor.name} | Formula: ${roll.formula}`);
        return;
      }

      const applied = await this.applyBonusHealing(actor, delta, roll, updates);

      if (applied <= 0) {
        ZFTFA.log("🔎 Bloodlust Recovery | Bonus healing calculated but no HP could be applied", {
          actor: actor.name,
          delta,
          formula: roll.formula
        });
        return;
      }

      ZFTFA.log(`✅ Bloodlust Recovery | Applied Powerful Recovery | Actor: ${actor.name} | Delta Healing: ${applied}`);
    },

    resolveRollHitDieContext(args) {
      const isActor = value => value?.documentName === "Actor" || value instanceof Actor;
      const isRoll = value => value instanceof Roll || Boolean(value?.dice?.length);

      const rollArray = args.find(arg => Array.isArray(arg) && arg.some(isRoll));

      const actor =
        args.find(isActor)
        ?? args.find(arg => isActor(arg?.subject))?.subject
        ?? args.find(arg => isActor(arg?.actor))?.actor
        ?? args.find(arg => isActor(arg?.parent))?.parent
        ?? null;

      const roll =
        rollArray?.find(isRoll)
        ?? args.find(isRoll)
        ?? args.find(arg => isRoll(arg?.roll))?.roll
        ?? args.find(arg => Array.isArray(arg?.rolls) && arg.rolls.some(isRoll))?.rolls?.find(isRoll)
        ?? args.find(arg => isRoll(arg?.data?.roll))?.data?.roll
        ?? args.find(arg => isRoll(arg?.message?.rolls?.[0]))?.message?.rolls?.[0]
        ?? null;

      const updates =
        args.find(arg => arg?.updates)?.updates
        ?? args.find(arg => arg?.data?.updates)?.data?.updates
        ?? null;

      return { actor, roll, updates };
    },

    getPrimaryHitDie(roll) {
      return roll.dice.find(die => {
        const faces = Number(die.faces ?? 0);
        const results = die.results?.filter(r => r.active !== false) ?? [];

        return faces >= 6 && faces <= 12 && results.length > 0;
      });
    },

    getPowerfulRecoveryDelta(hitDie) {
      const results = hitDie.results?.filter(r => r.active !== false) ?? [];

      return results.reduce((total, result) => {
        const value = Number(result.result ?? 0);

        if (value === 1) return total + 2;
        if (value === 2) return total + 1;

        return total;
      }, 0);
    },

    async applyBonusHealing(actor, amount, sourceRoll, updates = null) {
      const hp = actor.system?.attributes?.hp;
      const current = Number(hp?.value ?? 0);
      const rawMax = Number(hp?.effectiveMax ?? hp?.max ?? 0);
      const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : current + amount;

      const pendingHpPath = "system.attributes.hp.value";
      const pendingValue = Number(foundry.utils.getProperty(updates?.actor ?? {}, pendingHpPath));

      const baseValue = Number.isFinite(pendingValue)
        ? pendingValue
        : current;

      const newValue = Math.min(max, baseValue + amount);
      const applied = Math.max(0, newValue - baseValue);

      if (applied <= 0) {
        ZFTFA.log("🔎 Bloodlust Recovery | Actor already at max HP after pending Hit Die healing", {
          actor: actor.name,
          current,
          baseValue,
          max,
          amount
        });
        return 0;
      }

      if (updates?.actor) {
        foundry.utils.setProperty(updates.actor, pendingHpPath, newValue);

        ZFTFA.log(`💚 Bloodlust Recovery | Mutated pending Hit Die healing update | ${baseValue} → ${newValue}`);
      } else {
        await actor.update({
          [pendingHpPath]: newValue
        });

        ZFTFA.warn("⚠️ Bloodlust Recovery | No pending update object found; applied fallback actor.update", {
          actor: actor.name,
          baseValue,
          newValue
        });
      }

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <p><strong>Bloodlust: Powerful Recovery</strong></p>
          <p>One or more Hit Dice rolled a 1 or 2 and were treated as 3.</p>
          <p><strong>${actor.name}</strong> regains an additional <strong>${applied}</strong> Hit Points.</p>
          <hr>
          <p><small>Original roll: ${sourceRoll.formula}</small></p>
        `
      });

      return applied;
    }
  }
  };

Hooks.once("ready", async () => {
  await ZFTFA.Bloodlust.register();
  ZFTFA.log("✅ Bloodlust | Feature automation ready");
});