/**
 * Identify D&D5e-system rolls from their original roll metadata rather than
 * comparing their values. In D&D5e 5.2.x, BasicRoll copies evaluated rolls to
 * ChatMessages, so a WeakSet of Roll object references is not sufficient.
 *
 * A non-generic classification means a D&D5e system hook owns processing.
 * This includes damage, which must not be treated as a generic d20 fumble.
 * For truly untyped /r 1d20 ChatMessages, return null to enable the fallback.
 */
export function classifyDnd5eChatRoll(message, roll) {
  const provenance = [message?.flags?.dnd5e?.roll?.type, roll?.options?.rollType];
  for (const value of provenance) {
    if (typeof value !== "string") continue;
    const type = value.trim().toLowerCase();
    if (type && type !== "generic" && type !== "roll" && type !== "formula") {
      return type;
    }
  }
  return null;
}

/**
 * A last-resort correlation for *untyped* copied chat rolls. This is not a
 * blanket roll-value deduplicator: two different actors, different formulas,
 * or different known chat-message IDs cannot match. Exact actor matches get
 * 1.5 s; partial/absent actor identity gets only a 0.5 s grace period.
 * Caller consumes the matched entry once to protect subsequent real rolls.
 */
export function matchingRecentStructuredRoll(previous, candidate) {
  if (!previous || !candidate) return false;
  if (previous.natural !== candidate.natural) return false;
  if (previous.total !== candidate.total) return false;

  const elapsed = candidate.timestamp - previous.timestamp;
  if (elapsed < 0 || elapsed > 1500) return false;

  // These IDs are useful if the same ChatMessage is attached to both Rolls.
  if (previous.messageId && candidate.messageId) {
    if (previous.messageId !== candidate.messageId) return false;
    return true;
  }

  // Without shared message identity, exact formula guards against accidental
  // collisions on two independent rolls with the same natural and total.
  if (!previous.formula || !candidate.formula || previous.formula !== candidate.formula) return false;

  const left = Array.isArray(previous.actorKeys) ? previous.actorKeys : [];
  const right = Array.isArray(candidate.actorKeys) ? candidate.actorKeys : [];
  const sharedKey = left.some(key => right.includes(key));
  const sharedName = Boolean(previous.actorName && candidate.actorName && previous.actorName === candidate.actorName);
  if (sharedKey || sharedName) return true;

  // Both sides have conflicting known actors: these are different rolls.
  if (left.length && right.length) return false;
  if (previous.actorName && candidate.actorName && previous.actorName !== candidate.actorName) return false;

  // D&D5e's structured hook sometimes supplies no Actor while the resulting
  // ChatMessage contains a speaker. Only correlate that uncertain case within
  // the short pre/post-hook window and on an identical roll signature.
  return elapsed <= 500;
}
