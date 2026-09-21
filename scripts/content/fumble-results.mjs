/**
 * Default ZFT fumble result libraries.
 *
 * Fumbles are house rules, so the bundled effects are intentionally short,
 * broadly applicable, and editable through their seeded Journal pages.
 * Every result resolves in one table roll with no nested draws.
 */

const attackResults = [
  ["Overextended", "Your failed attack carries you too far and leaves your defense exposed.", "The next attack against you before the start of your next turn has advantage."],
  ["Open Guard", "Your attack leaves your guard open while you recover.", "You cannot take reactions until the start of your next turn."],
  ["Lost Footing", "You recover awkwardly and lose some of your mobility.", "Your Speed is reduced by 10 feet until the end of your next turn."],
  ["Broken Rhythm", "The miss throws off the timing of your next strike.", "You have disadvantage on your next attack roll before the end of your next turn."],
  ["Checked Momentum", "Your attack stalls your movement and forces a recovery step.", "You cannot take the Dash action until the end of your next turn."],
  ["Exposed Defense", "The failed attack creates a brief opening in your defenses.", "The next attack against you before the start of your next turn gains a +2 bonus to the attack roll."],
  ["Off Balance", "Your footing slips as the attack goes wide.", "You have disadvantage on your next Strength or Dexterity ability check before the end of your next turn."],
  ["Poor Recovery", "You struggle to turn the failed attack into another opening.", "You cannot gain advantage on attack rolls until the start of your next turn."],
  ["Embarrassing Miss", "The attack fails spectacularly, but you manage to recover before it becomes worse.", "No additional mechanical penalty."],
  ["Telegraphed", "Your opponent reads your movement after the obvious miss.", "The target of the failed attack gains a +2 bonus to AC against your next attack against it before the end of your next turn."],
  ["Distracted", "The miss pulls your attention away from your surroundings.", "You have disadvantage on your next Wisdom (Perception) check before the end of your next turn."],
  ["Hesitation", "The failed attack leaves you second-guessing your timing.", "You cannot take the Ready action until the end of your next turn."],
  ["Lost Opening", "Your recovery is too slow to capitalize on an enemy moving away.", "You cannot make Opportunity Attacks until the start of your next turn."],
  ["Strained Follow-Through", "The attack twists you into a poor defensive posture.", "You have disadvantage on your next Strength or Dexterity saving throw before the start of your next turn."],
  ["Guarded Recovery", "You spend the moment recovering instead of pressing the attack.", "Your next attack before the end of your next turn cannot benefit from advantage."],
  ["Opponent's Read", "Your failed attack reveals enough of your pattern for the opponent to anticipate you.", "The target of the failed attack has advantage on its next attack against you before the end of its next turn."],
  ["Momentary Tangle", "Gear, footing, or positioning interferes with your recovery.", "The first 5 feet of movement you take before the end of your next turn costs 10 feet of movement."],
  ["Recovery Window", "Your miss gives the target a moment to slip away from your threat.", "The target of the failed attack may immediately move 5 feet without provoking an Opportunity Attack from you."],
  ["Severe Overextension", "You commit too hard and need a full beat to recover.", "You cannot take reactions until the start of your next turn, and you have disadvantage on your next attack before the end of your next turn."],
  ["Catastrophic Opening", "The failed attack leaves you completely exposed for a moment.", "The next attack against you before the start of your next turn has advantage, and you cannot take reactions until then."]
];

const saveResults = [
  ["Shaken", "The failed save rattles your confidence and concentration.", "You have disadvantage on your next attack roll before the end of your next turn."],
  ["Slow Recovery", "You need an extra moment to recover from the effect you failed to resist.", "You cannot take reactions until the start of your next turn."],
  ["Hobbled", "The failed resistance leaves your movement uncertain.", "Your Speed is reduced by 10 feet until the end of your next turn."],
  ["Exposed", "Your failed defense leaves a brief opening.", "The next attack against you before the start of your next turn gains a +2 bonus to the attack roll."],
  ["Winded", "The effort of resisting leaves you short of breath.", "You cannot take the Dash action until the end of your next turn."],
  ["Rattled Focus", "The failed save disrupts your ability to focus on another task.", "You have disadvantage on your next ability check before the end of your next turn."],
  ["Unsteady", "Your balance and coordination suffer for a moment.", "You have disadvantage on your next Strength or Dexterity ability check before the end of your next turn."],
  ["Broken Tempo", "Your recovery prevents you from immediately turning the situation to your advantage.", "You cannot gain advantage on attack rolls until the start of your next turn."],
  ["Barely Recovered", "The failure hits hard, but you avoid compounding the mistake.", "No additional mechanical penalty."],
  ["Disoriented", "The failed save leaves you briefly unsure of your surroundings.", "You have disadvantage on your next Wisdom (Perception) check before the end of your next turn."],
  ["Guard Down", "Your attention remains fixed on the effect you failed to resist.", "You cannot make Opportunity Attacks until the start of your next turn."],
  ["Open Defense", "Your failed resistance leaves you vulnerable to a follow-up.", "The next attack against you before the start of your next turn has advantage."],
  ["Faltering Resolve", "The failure makes it harder to immediately steady yourself.", "You have disadvantage on your next Wisdom or Charisma ability check before the end of your next turn."],
  ["Compromised Reflexes", "Your reactions lag after the failed save.", "You have disadvantage on your next Dexterity saving throw before the start of your next turn."],
  ["Strained Endurance", "The failed resistance takes a physical toll.", "You have disadvantage on your next Constitution ability check before the end of your next turn."],
  ["Recovery Step", "You must spend a moment regaining your position.", "The first 5 feet of movement you take before the end of your next turn costs 10 feet of movement."],
  ["Momentary Vulnerability", "Your defenses remain unsettled after the failed save.", "You cannot benefit from advantage on your next attack roll before the end of your next turn."],
  ["Ringing Impact", "The effect leaves you momentarily distracted.", "You have disadvantage on your next Intelligence or Wisdom ability check before the end of your next turn."],
  ["Severe Disorientation", "The failed save leaves you badly out of position.", "You cannot take reactions until the start of your next turn, and your Speed is reduced by 10 feet until the end of your next turn."],
  ["Complete Exposure", "Your failed resistance leaves you open to an immediate follow-up.", "The next attack against you before the start of your next turn has advantage, and you cannot take reactions until then."]
];

const abilityResults = [
  ["Lost Time", "The attempt goes badly and costs more time than expected.", "The check fails, and the GM introduces a reasonable delay appropriate to the task."],
  ["Unwanted Attention", "The failed attempt draws notice you did not intend.", "The check fails, and the GM may alert a nearby creature, observer, or other relevant attention source."],
  ["Bad Position", "You end the attempt in a worse position than where you started.", "The check fails, and the GM places you in a minor positional disadvantage appropriate to the scene."],
  ["Minor Complication", "Something small goes wrong in addition to the failed attempt.", "The check fails, and the GM introduces a minor complication that does not directly deal damage."],
  ["False Start", "Your first approach clearly does not work.", "The check fails, and another attempt must use a meaningfully different approach unless circumstances change."],
  ["Missed Detail", "Your focus on the attempt causes you to overlook something nearby.", "The check fails, and a non-essential detail or opportunity is missed."],
  ["Poor Leverage", "You commit from a weak angle or position.", "The check fails, and your next closely related ability check before the end of the scene has disadvantage."],
  ["Overcommitment", "You put too much into the attempt and have trouble disengaging cleanly.", "The check fails, and the GM may require extra movement, time, or effort to recover your position."],
  ["Harmless Blunder", "The attempt fails badly but creates no meaningful additional consequence.", "No additional mechanical penalty beyond the failed check."],
  ["Opportunity Lost", "The failed attempt closes off a temporary opening.", "The check fails, and one immediate opportunity connected to this approach is no longer available."],
  ["Awkward Exposure", "Your failure reveals more about your intent than you wanted.", "The check fails, and an observer may recognize what you were attempting."],
  ["Escalation", "The failure makes the situation slightly harder to manage.", "The check fails, and the GM increases the immediate pressure or urgency in a minor way."],
  ["Setback", "Progress is lost rather than merely halted.", "The check fails, and the GM may remove a small amount of progress toward the current task."],
  ["Compromised Approach", "Your method is now clearly unreliable.", "The check fails, and repeating the same approach before circumstances change has disadvantage."],
  ["Strained Effort", "The attempt leaves you physically or mentally taxed for a moment.", "The check fails, and your next ability check using the same ability before the end of your next turn has disadvantage."],
  ["Collateral Mess", "The failed attempt disturbs the immediate environment.", "The check fails, and the GM introduces a harmless but noticeable mess, noise, or disturbance."],
  ["Reduced Options", "Your failure removes one easy path forward.", "The check fails, and the GM may require a different route, tool, position, or approach for the next attempt."],
  ["Wrong Read", "You draw the wrong conclusion from the failed attempt.", "The check fails, and the GM may withhold clarification until new information or a new approach is obtained."],
  ["Major Setback", "The attempt fails in a way that meaningfully complicates the immediate objective.", "The check fails, and the GM introduces a significant but non-damaging complication appropriate to the scene."],
  ["Consequential Failure", "The failure changes the situation instead of simply stopping progress.", "The check fails, and the GM advances an existing threat, clock, consequence, or opposing objective by one reasonable step."]
];

const skillResults = [
  ["Loud Mistake", "Your technique produces more noise or disturbance than intended.", "The check fails, and the GM may make the failure noticeable to nearby creatures or observers when appropriate."],
  ["False Lead", "Your interpretation points you in an unhelpful direction.", "The check fails, and the GM may present an incomplete or misleading impression that can be corrected by new evidence."],
  ["Overlooked Clue", "You miss a useful secondary detail while focusing on the main task.", "The check fails, and one non-essential clue or opportunity is overlooked."],
  ["Poor Timing", "You perform the task at exactly the wrong moment.", "The check fails, and the GM introduces a reasonable delay or timing complication."],
  ["Unwanted Attention", "The failed skill attempt draws notice.", "The check fails, and a relevant observer may become aware of your activity."],
  ["Exposed Position", "Your failed technique leaves you somewhere inconvenient or visible.", "The check fails, and the GM introduces a minor positional disadvantage appropriate to the skill and scene."],
  ["Technique Breakdown", "Your normal method fails you completely this time.", "The check fails, and repeating the same approach before circumstances change has disadvantage."],
  ["Minor Gear Trouble", "Something used in the attempt becomes inconvenient without being destroyed.", "The check fails, and the GM may require a moment to recover, reset, clean, retrieve, or reposition relevant gear."],
  ["Social Misstep", "Your execution communicates the wrong tone or intention.", "The check fails, and when social interaction is involved the target's attitude may worsen slightly at the GM's discretion."],
  ["Harmless Blunder", "The attempt goes poorly, but nothing else meaningful goes wrong.", "No additional mechanical penalty beyond the failed check."],
  ["Lost Trail", "Your technique carries you away from the useful path.", "The check fails, and the GM may require a new clue, vantage point, or approach before another attempt makes progress."],
  ["Bad Read", "You misjudge an important detail of the situation.", "The check fails, and the GM may withhold the correct interpretation until circumstances provide new information."],
  ["Clumsy Execution", "The failed skill attempt leaves you recovering from an awkward mistake.", "The check fails, and your next check using the same skill before the end of the scene has disadvantage."],
  ["Opportunity Lost", "The failed attempt closes a temporary opening.", "The check fails, and one immediate opportunity tied to this skill use is no longer available."],
  ["Escalation", "The failed technique makes the situation more urgent.", "The check fails, and the GM increases immediate pressure, suspicion, or urgency in a minor way."],
  ["Compromised Evidence", "Your handling of the situation makes later interpretation harder.", "The check fails, and a related follow-up Investigation, Perception, or similar check may have disadvantage at the GM's discretion."],
  ["Overcommitment", "You push the technique too far and lose flexibility.", "The check fails, and the GM may require extra time, movement, or effort before you can attempt a different approach."],
  ["Wrong Angle", "You approach the problem from a position that cannot produce a useful result.", "The check fails, and you must change position, tools, information, or approach before retrying."],
  ["Major Complication", "The failure creates a significant obstacle related to the skill being used.", "The check fails, and the GM introduces a significant but non-damaging complication appropriate to the scene."],
  ["Consequential Error", "The skill failure actively changes the situation against you.", "The check fails, and the GM advances an opposing objective, threat, clock, or consequence by one reasonable step."]
];

const toolResults = [
  ["Slipped Grip", "The tool slips at the worst moment and forces you to reset your hands and position.", "The check fails, and the tool or work area must be repositioned before the same approach can be attempted again."],
  ["Misalignment", "Your setup shifts out of alignment during the attempt.", "The check fails, and your next check with the same tool before the end of the scene has disadvantage unless you take time to reset the setup."],
  ["Wasted Material", "A small amount of consumable material is spoiled during the failed attempt.", "The check fails, and the GM may expend one minor, nonvaluable consumable used by the task when appropriate."],
  ["Jammed Mechanism", "The tool or mechanism binds instead of cooperating.", "The check fails, and the immediate tool, device, or workpiece must be cleared or reset before another attempt."],
  ["Noisy Mistake", "The failed work produces an unexpected scrape, snap, clatter, or other disturbance.", "The check fails, and nearby creatures may notice the noise when appropriate."],
  ["Wrong Adjustment", "You make a correction in exactly the wrong direction.", "The check fails, and repeating the same approach before reassessing the task has disadvantage."],
  ["Dropped Component", "A small component or tool slips away during the attempt.", "The check fails, and the GM may require a brief search, retrieval, or repositioning before work continues."],
  ["Poor Calibration", "Your tool is no longer properly set for the task.", "The check fails, and the tool must be recalibrated, cleaned, sharpened, tuned, or otherwise reset before the same task is attempted again."],
  ["Harmless Mishap", "The attempt fails awkwardly, but nothing else meaningful goes wrong.", "No additional mechanical penalty beyond the failed check."],
  ["Spoiled Finish", "The work remains usable only after correcting a visible or functional flaw.", "The check fails, and the GM may require extra time or another successful check to restore the intended finish."],
  ["Tool Trouble", "The tool becomes inconvenient without being destroyed.", "The check fails, and the GM may require a moment to free, clean, retrieve, tighten, or otherwise restore the tool before reuse."],
  ["Contaminated Work", "Dust, debris, residue, or another contaminant gets into the work.", "The check fails, and the work area or materials must be cleaned or prepared again before retrying."],
  ["Lost Measure", "You lose track of an important measurement, mark, setting, or reference point.", "The check fails, and the next attempt requires re-establishing the missing reference before progress can continue."],
  ["Compromised Material", "The failed attempt leaves part of the material harder to work with.", "The check fails, and the GM may impose disadvantage on the next closely related tool check unless fresh material or a different approach is used."],
  ["False Progress", "For a moment the work appears successful before the flaw becomes obvious.", "The check fails, and the mistake costs additional time appropriate to the task before it can be corrected."],
  ["Awkward Access", "Your failed attempt leaves the workpiece or mechanism in a harder position to reach.", "The check fails, and you must change position, access, or setup before trying the same task again."],
  ["Minor Damage", "The failed technique causes a small, repairable problem in the work.", "The check fails, and the GM introduces a minor complication that requires repair or correction but does not destroy the item."],
  ["Procedure Breakdown", "Your current method has clearly stopped working.", "The check fails, and another attempt must use a meaningfully different method, tool, or setup unless circumstances change."],
  ["Major Setback", "The work goes badly enough to erase meaningful progress.", "The check fails, and the GM may remove a reasonable amount of progress from the current task without destroying the underlying item or objective."],
  ["Consequential Mishap", "The failed tool use creates a significant problem tied directly to the task.", "The check fails, and the GM introduces a significant but non-damaging complication appropriate to the tool and situation."]
];

const concentrationResults = [
  ["Rattled", "Losing concentration leaves your timing and focus badly shaken.", "You have disadvantage on your next attack roll before the end of your next turn."],
  ["Slow Recovery", "Your focus breaks so sharply that you are slow to react afterward.", "You cannot take reactions until the start of your next turn."],
  ["Unsteady", "The broken concentration throws off your footing.", "Your Speed is reduced by 10 feet until the end of your next turn."],
  ["Mental Static", "The collapse of the effect leaves your thoughts briefly scrambled.", "You have disadvantage on your next Intelligence, Wisdom, or Charisma ability check before the end of your next turn."],
  ["Winded", "Maintaining the effect to the breaking point leaves you short of breath.", "You cannot take the Dash action until the end of your next turn."],
  ["Broken Rhythm", "Your concentration snaps and takes your combat rhythm with it.", "You cannot gain advantage on attack rolls until the start of your next turn."],
  ["Distracted", "The sudden loss of focus pulls your attention away from the battlefield.", "You have disadvantage on your next Wisdom (Perception) check before the end of your next turn."],
  ["Open Guard", "Your attention was so committed to the effect that your defenses lag when it ends.", "The next attack against you before the start of your next turn gains a +2 bonus to the attack roll."],
  ["Clean Break", "The effect collapses, but you recover without making the situation worse.", "No additional mechanical penalty beyond losing concentration."],
  ["Faltering Focus", "The mental recoil makes it harder to immediately focus on another demanding task.", "You have disadvantage on your next Constitution ability check before the end of your next turn."],
  ["Guard Down", "You recover too slowly to punish an enemy that moves away.", "You cannot make Opportunity Attacks until the start of your next turn."],
  ["Exposed", "The collapse of your concentration creates a brief defensive opening.", "The next attack against you before the start of your next turn has advantage."],
  ["Strained Recovery", "You need a moment to regain control of your breathing and posture.", "The first 5 feet of movement you take before the end of your next turn costs 10 feet of movement."],
  ["Reflex Lag", "The mental shock leaves your reactions a fraction too slow.", "You have disadvantage on your next Dexterity saving throw before the start of your next turn."],
  ["Hesitation", "You second-guess your next commitment after the effect collapses.", "Your next attack before the end of your next turn cannot benefit from advantage."],
  ["Scattered Thoughts", "Your attention fragments when concentration breaks.", "You have disadvantage on your next ability check before the end of your next turn."],
  ["Momentary Vulnerability", "The loss of concentration leaves you unable to turn an opening to your advantage.", "You cannot benefit from advantage on your next attack roll before the end of your next turn."],
  ["Ringing Focus", "The collapse leaves you briefly disoriented.", "You have disadvantage on your next Wisdom saving throw before the end of your next turn."],
  ["Severe Disruption", "Your concentration shatters hard enough to leave you badly unsettled.", "You cannot take reactions until the start of your next turn, and your Speed is reduced by 10 feet until the end of your next turn."],
  ["Complete Exposure", "Your broken concentration leaves you open for a dangerous moment.", "The next attack against you before the start of your next turn has advantage, and you cannot take reactions until then."]
];

const deathSaveResults = [
  ["Fading Breath", "Your breathing grows faint as life slips further away.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Cold Stillness", "For a terrifying moment, you are completely still.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Weak Pulse", "Your pulse becomes difficult to find as your condition worsens.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Shallow Breath", "Each breath becomes smaller and harder won.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Deathly Pallor", "Color drains from your face as the moment turns grim.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Unresponsive", "Voices and movement around you receive no response.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Faltering Heart", "Your body struggles visibly to keep going.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Distant Awareness", "The sounds of the battlefield seem to recede into the distance.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Darkening Vision", "Even unconscious, your fading senses seem to slip toward darkness.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Desperate Moment", "The line between survival and death narrows dangerously.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Failing Strength", "Your body has almost nothing left to give.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Stillness", "The battlefield seems to move around you while you remain frighteningly still.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Fading Warmth", "Warmth begins to leave your limbs as your condition deteriorates.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Labored Breath", "A strained breath escapes as your body fights to survive.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Near the Edge", "You drift perilously close to the edge of death.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Fading Presence", "Your presence seems to diminish as the moment becomes critical.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Grim Silence", "A heavy silence hangs over your motionless form.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Life Flickers", "For a moment, it seems as though the last spark of life might go out.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Critical Condition", "Your condition worsens dramatically, leaving little margin for another failure.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."],
  ["Death's Door", "You hang at death's door as the natural 1 takes its full toll.", "No additional mechanical penalty beyond the normal consequences of a natural 1 on a death saving throw."]
];

const initiativeResults = [
  ["Caught Flat-Footed", "Combat begins before you are fully ready to respond.", "You cannot take reactions until the start of your first turn."],
  ["Slow Start", "You hesitate as the fight erupts around you.", "Your Speed is reduced by 10 feet until the end of your first turn."],
  ["Bad Footing", "You begin the fight from an awkward stance.", "The first 5 feet of movement on your first turn costs 10 feet of movement."],
  ["Distracted", "Your attention is somewhere else when combat begins.", "You have disadvantage on your first Wisdom (Perception) check made before the end of your first turn."],
  ["Guard Down", "You are late bringing your defenses fully into position.", "The first attack against you before the start of your first turn gains a +2 bonus to the attack roll."],
  ["Hesitant", "You struggle to commit to your first offensive move.", "Your first attack roll on your first turn cannot benefit from advantage."],
  ["Wrong Read", "You misread the opening moments of the fight.", "You have disadvantage on your first ability check made before the end of your first turn."],
  ["Out of Rhythm", "The sudden start disrupts your timing.", "You cannot take the Dash action on your first turn."],
  ["Recovered Quickly", "You are caught off guard, but recover before it costs you more.", "No additional mechanical penalty beyond the low initiative roll."],
  ["Poor Position", "Your starting position gives you less room to react.", "You cannot make Opportunity Attacks until the start of your first turn."],
  ["Momentary Confusion", "You need a heartbeat to understand how the fight is developing.", "You cannot take the Ready action on your first turn."],
  ["Exposed Opening", "An enemy sees your delayed reaction and has a brief opening.", "The first attack against you before the start of your first turn has advantage."],
  ["Late Movement", "You are slow to get your feet moving when the fight starts.", "You cannot gain bonus movement from the Dash action or similar voluntary movement increases until the end of your first turn."],
  ["Unsettled", "The sudden violence leaves your concentration on the immediate moment shaky.", "You have disadvantage on your first Constitution ability check made before the end of your first turn."],
  ["Poor Awareness", "You fail to take in the battlefield before acting.", "You have disadvantage on your first Intelligence or Wisdom ability check made before the end of your first turn."],
  ["Telegraphed Start", "Your first offensive movement is easy to read.", "The first creature you attack on your first turn gains a +2 bonus to AC against that attack."],
  ["Stumbled Start", "A small stumble costs you momentum at the worst possible time.", "Your Speed is reduced by 5 feet until the end of your first turn, and you cannot take reactions until that turn begins."],
  ["Defensive Delay", "You are slow to establish a defensive rhythm.", "You cannot benefit from advantage on your first attack roll before the end of your first turn."],
  ["Severely Unprepared", "You are badly out of sync as combat begins.", "You cannot take reactions until the start of your first turn, and your Speed is reduced by 10 feet until the end of that turn."],
  ["Complete Surprise", "The fight catches you at exactly the wrong moment.", "The first attack against you before the start of your first turn has advantage, and you cannot take reactions until that turn begins."]
];

function buildResults(prefix, tuples) {
  return Object.freeze(tuples.map(([name, flavor, effect], index) => ({
    roll: index + 1,
    seedKey: `fumble-${prefix}-${slugify(name)}`,
    name,
    flavor,
    effect
  })));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const FUMBLE_CONTENT = Object.freeze({
  attack: Object.freeze({
    rollType: "attack",
    tableSeedKey: "zft-attack-fumbles",
    tableName: "ZFT Attack Fumbles",
    journalSeedKey: "zft-attack-fumble-results",
    journalName: "ZFT Attack Fumble Results",
    description: "ZFT generic consequences for natural 1 Attack rolls.",
    results: buildResults("attack", attackResults)
  }),
  save: Object.freeze({
    rollType: "save",
    tableSeedKey: "zft-saving-throw-fumbles",
    tableName: "ZFT Saving Throw Fumbles",
    journalSeedKey: "zft-saving-throw-fumble-results",
    journalName: "ZFT Saving Throw Fumble Results",
    description: "ZFT generic consequences for natural 1 Saving Throws.",
    results: buildResults("save", saveResults)
  }),
  ability: Object.freeze({
    rollType: "ability",
    tableSeedKey: "zft-ability-check-fumbles",
    tableName: "ZFT Ability Check Fumbles",
    journalSeedKey: "zft-ability-check-fumble-results",
    journalName: "ZFT Ability Check Fumble Results",
    description: "ZFT generic consequences for natural 1 Ability Checks.",
    results: buildResults("ability", abilityResults)
  }),
  skill: Object.freeze({
    rollType: "skill",
    tableSeedKey: "zft-skill-check-fumbles",
    tableName: "ZFT Skill Check Fumbles",
    journalSeedKey: "zft-skill-check-fumble-results",
    journalName: "ZFT Skill Check Fumble Results",
    description: "ZFT generic consequences for natural 1 Skill Checks.",
    results: buildResults("skill", skillResults)
  }),
  tool: Object.freeze({
    rollType: "tool",
    tableSeedKey: "zft-tool-check-fumbles",
    tableName: "ZFT Tool Check Fumbles",
    journalSeedKey: "zft-tool-check-fumble-results",
    journalName: "ZFT Tool Check Fumble Results",
    description: "ZFT generic consequences for natural 1 Tool Checks.",
    results: buildResults("tool", toolResults)
  }),
  concentration: Object.freeze({
    rollType: "concentration",
    tableSeedKey: "zft-concentration-fumbles",
    tableName: "ZFT Concentration Fumbles",
    journalSeedKey: "zft-concentration-fumble-results",
    journalName: "ZFT Concentration Fumble Results",
    description: "ZFT generic consequences for natural 1 Concentration rolls after concentration is lost.",
    results: buildResults("concentration", concentrationResults)
  }),
  "death-save": Object.freeze({
    rollType: "death-save",
    tableSeedKey: "zft-death-save-fumbles",
    tableName: "ZFT Death Save Fumbles",
    journalSeedKey: "zft-death-save-fumble-results",
    journalName: "ZFT Death Save Fumble Results",
    description: "ZFT narrative consequences for natural 1 Death Saves. These add no penalty beyond the normal natural-1 death-save consequence.",
    results: buildResults("death-save", deathSaveResults)
  }),
  initiative: Object.freeze({
    rollType: "initiative",
    tableSeedKey: "zft-initiative-fumbles",
    tableName: "ZFT Initiative Fumbles",
    journalSeedKey: "zft-initiative-fumble-results",
    journalName: "ZFT Initiative Fumble Results",
    description: "ZFT generic first-round consequences for natural 1 Initiative rolls.",
    results: buildResults("initiative", initiativeResults)
  })
});
