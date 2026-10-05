/**
 * Inspect a Foundry/D&D5e roll and return every active d20 result.
 *
 * Foundry marks discarded advantage/disadvantage results inactive/discarded,
 * so only the kept result remains in this collection. A plain d20 pool such as
 * 2d20 or 30d20 keeps multiple active results and is therefore not a single
 * resolved d20 check for Critical Fumbles purposes.
 *
 * @param {Roll} roll
 * @returns {Array<{natural: number, outcome: "critical"|"fumble"|null, die: object, result: object, dieIndex: number, resultIndex: number}>}
 */
export function detectNaturalD20Results(roll) {
  if (!roll) return [];

  const detections = [];
  const d20Dice = Array.from(roll.dice ?? []).filter(die => Number(die?.faces) === 20);

  d20Dice.forEach((die, dieIndex) => {
    const results = Array.from(die?.results ?? []);

    results.forEach((result, resultIndex) => {
      if (!result) return;
      if (result.active === false) return;
      if (result.discarded === true) return;

      const natural = Number(result.result);
      if (!Number.isFinite(natural)) return;

      let outcome = null;
      if (natural === 20) outcome = "critical";
      else if (natural === 1) outcome = "fumble";

      detections.push({
        natural,
        outcome,
        die,
        result,
        dieIndex,
        resultIndex
      });
    });
  });

  return detections;
}

/**
 * Resolve a roll to the single active d20 result used by the check.
 *
 * Exactly one active d20 result is required. This naturally supports normal
 * 1d20 rolls and keep/drop mechanics such as advantage, disadvantage, and
 * 3d20kh1. Unresolved pools such as 2d20 or 30d20 are rejected.
 *
 * @param {Roll} roll
 * @returns {{eligible: boolean, activeCount: number, detection: object|null, reason: string|null}}
 */
export function resolveSingleActiveD20(roll) {
  const detections = detectNaturalD20Results(roll);

  if (detections.length === 1) {
    return {
      eligible: true,
      activeCount: 1,
      detection: detections[0],
      reason: null
    };
  }

  return {
    eligible: false,
    activeCount: detections.length,
    detection: null,
    reason: detections.length > 1 ? "multiple-active-d20-results" : "no-active-d20-result"
  };
}

/**
 * Backwards-compatible single-result helper.
 *
 * Returns a result only when the roll resolves to exactly one active d20.
 *
 * @param {Roll} roll
 * @returns {{natural: number|null, outcome: "critical"|"fumble"|null, die: object|null, result: object|null}}
 */
export function detectNaturalD20(roll) {
  const resolved = resolveSingleActiveD20(roll);
  const detection = resolved.detection;

  if (!detection) {
    return { natural: null, outcome: null, die: null, result: null };
  }

  return {
    natural: detection.natural,
    outcome: detection.outcome,
    die: detection.die,
    result: detection.result
  };
}
