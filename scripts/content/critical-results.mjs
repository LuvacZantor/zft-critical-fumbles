/**
 * Default ZFT generic critical-hit result library.
 *
 * The user's existing critical-damage rules already handle additional damage,
 * so these results focus on short tactical consequences instead of damage.
 */
export const CRITICAL_RESULTS = Object.freeze([
  {
    roll: 1,
    seedKey: "critical-off-balance",
    name: "Off Balance",
    flavor: "The blow catches the target in a bad stance, forcing a hurried recovery.",
    effect: "The target has disadvantage on its next attack roll before the end of its next turn."
  },
  {
    roll: 2,
    seedKey: "critical-opening",
    name: "Opening",
    flavor: "Your strike tears open a brief weakness in the target's defense.",
    effect: "The next attack against the target before the start of its next turn has advantage."
  },
  {
    roll: 3,
    seedKey: "critical-staggered",
    name: "Staggered",
    flavor: "The impact leaves the target momentarily unable to respond.",
    effect: "The target cannot take reactions until the start of its next turn."
  },
  {
    roll: 4,
    seedKey: "critical-hobbled",
    name: "Hobbled",
    flavor: "A punishing hit disrupts the target's footing and movement.",
    effect: "The target's Speed is reduced by 10 feet until the end of its next turn."
  },
  {
    roll: 5,
    seedKey: "critical-driving-strike",
    name: "Driving Strike",
    flavor: "The force of the hit drives the target backward.",
    effect: "Push the target 5 feet if it is no more than one size larger than you."
  },
  {
    roll: 6,
    seedKey: "critical-follow-through",
    name: "Follow Through",
    flavor: "You carry the momentum of the strike into a clean reposition.",
    effect: "You may move 5 feet without provoking an Opportunity Attack from this target."
  },
  {
    roll: 7,
    seedKey: "critical-pressed-advantage",
    name: "Pressed Advantage",
    flavor: "The critical exposes a weakness you can immediately exploit.",
    effect: "You have advantage on your next attack against this target before the end of your next turn."
  },
  {
    roll: 8,
    seedKey: "critical-broken-rhythm",
    name: "Broken Rhythm",
    flavor: "The attack disrupts the target's balance and coordination.",
    effect: "The target has disadvantage on its next Strength or Dexterity ability check before the end of its next turn."
  },
  {
    roll: 9,
    seedKey: "critical-shaken",
    name: "Shaken",
    flavor: "The strike rattles the target's focus and resolve.",
    effect: "The target has disadvantage on its next Wisdom saving throw before the end of its next turn."
  },
  {
    roll: 10,
    seedKey: "critical-guard-open",
    name: "Guard Open",
    flavor: "The target's defense slips, leaving a narrow opening.",
    effect: "The next attack against the target before the start of its next turn gains a +2 bonus to the attack roll."
  },
  {
    roll: 11,
    seedKey: "critical-checked-momentum",
    name: "Checked Momentum",
    flavor: "The hit halts the target's ability to burst into motion.",
    effect: "The target cannot take the Dash action until the end of its next turn."
  },
  {
    roll: 12,
    seedKey: "critical-forced-reposition",
    name: "Forced Reposition",
    flavor: "You turn the impact into leverage, shifting the target's position.",
    effect: "Move the target 5 feet to an unoccupied space adjacent to it if it is no more than one size larger than you."
  },
  {
    roll: 13,
    seedKey: "critical-combat-momentum",
    name: "Combat Momentum",
    flavor: "The successful strike gives you a surge of battle confidence.",
    effect: "You gain temporary hit points equal to your Proficiency Bonus."
  },
  {
    roll: 14,
    seedKey: "critical-relentless",
    name: "Relentless",
    flavor: "You use the opening to accelerate through the fight.",
    effect: "Your Speed increases by 10 feet until the end of your current turn."
  },
  {
    roll: 15,
    seedKey: "critical-disrupted-defense",
    name: "Disrupted Defense",
    flavor: "The target's defensive rhythm breaks under the critical hit.",
    effect: "The target cannot gain advantage on attack rolls until the start of its next turn."
  },
  {
    roll: 16,
    seedKey: "critical-pinned-down",
    name: "Pinned Down",
    flavor: "Your attack controls the target's approach and keeps it at bay.",
    effect: "The target cannot willingly move closer to you until the start of its next turn."
  },
  {
    roll: 17,
    seedKey: "critical-seized-initiative",
    name: "Seized Initiative",
    flavor: "The opening gives you a split second to manipulate your gear or surroundings.",
    effect: "You may immediately draw, stow, pick up, or interact with one object without using an action."
  },
  {
    roll: 18,
    seedKey: "critical-rallying-strike",
    name: "Rallying Strike",
    flavor: "Your critical creates space for an ally to reposition.",
    effect: "One ally who can see you may immediately move 5 feet without provoking an Opportunity Attack from this target."
  },
  {
    roll: 19,
    seedKey: "critical-crushing-momentum",
    name: "Crushing Momentum",
    flavor: "The blow lands with enough force to send the target reeling.",
    effect: "Push the target 10 feet if it is no more than one size larger than you."
  },
  {
    roll: 20,
    seedKey: "critical-perfect-opening",
    name: "Perfect Opening",
    flavor: "The critical completely disrupts the target's immediate defense.",
    effect: "The target cannot take reactions until the start of its next turn, and the next attack against it before then has advantage."
  }
]);
