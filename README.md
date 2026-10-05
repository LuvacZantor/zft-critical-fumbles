# ZFT Critical Fumbles

Version 1.3.1

Foundry VTT V13/V14 + D&D5e critical/fumble detection framework with configurable fumble eligibility, duplicate-roll suppression, debug reporting, module-owned content compendiums, Journal-driven critical/fumble result cards, persistent player outcome tracking, bundled one-shot outcome sound pools, and optional visual reminder Active Effects.

## Detection

A roll is eligible only when it resolves to exactly one active d20 result:

- `1d20` -> evaluated
- `2d20kh1` -> only the kept/high result is evaluated
- `2d20kl1` -> only the kept/low result is evaluated
- `3d20kh1` -> only the kept result is evaluated
- plain `2d20` or `30d20` -> ignored because multiple d20 results remain active

Natural 20 qualifies as a critical only for Attack rolls when **Enable Critical Handling** is enabled. Natural 1 fumble eligibility is configurable by roll type in Module Settings.

ZFT prefers structured D&D5e roll hooks when available and uses the generic `createChatMessage` path as a fallback for rolls such as `/r 1d20`. Recent structured rolls are tracked so the same roll is not processed a second time when D&D5e also creates a ChatMessage.

Death saves receive additional handling because D&D5e routes them through normal saving-throw machinery before firing `dnd5e.rollDeathSave`. ZFT ignores the preliminary saving-throw interpretation and the death-save ChatMessage fallback, allowing `dnd5e.rollDeathSave` to be the single ZFT processing path. This does not change D&D5e's normal rule that a natural 1 death save counts as two failures.

## Compendium Packs

The module owns three packs grouped beneath the `ZFT Critical Fumbles` Compendium folder using color `#ffba00`:

- **Critical & Fumble Tables** (`RollTable`)
- **Critical & Fumble Results** (`JournalEntry`)
- **Critical & Fumble Sounds** (`Playlist`)

## Seeded Critical Content

On `ready`, the primary active GM checks the module packs for stable ZFT seed flags. Existing seeded documents are left unchanged. Missing content is created individually.

The module seeds:

- **ZFT Critical Hits** RollTable with formula `1d20`
- **ZFT Critical Results** JournalEntry
- 20 JournalEntryPages, one for each generic tactical critical result
- RollTable results linked internally to the matching JournalEntryPage UUID

Stable seed flags are used instead of names, so renaming module-created documents does not cause duplicates. If a seeded page or table result is deleted, the next GM load recreates only the missing content. If a Journal page is recreated with a new UUID, the module repairs the corresponding internal RollTable linkage without replacing the user's existing result text.

## Critical Result Flow

A qualified attack critical uses this pipeline:

```text
Natural 20 Attack
-> ZFT Critical Hits table roll
-> matching JournalEntryPage
-> Journal page HTML is enriched
-> ZFT Critical Hit chat card
-> configured critical one-shot sound
```

The module uses `RollTable#roll()` rather than a formal table draw during combat. This identifies the result without posting Foundry's native RollTable message or writing drawn-state back to the compendium.

The Journal page is the source of truth for the visible critical card content. Editing the page changes future chat-card text without changing module code.

## Default Generic Critical Table

The table contains 20 equally weighted tactical results. It deliberately does not add damage because additional critical damage can be handled separately by the world's existing critical-damage rules.

1. Off Balance
2. Opening
3. Staggered
4. Hobbled
5. Driving Strike
6. Follow Through
7. Pressed Advantage
8. Broken Rhythm
9. Shaken
10. Guard Open
11. Checked Momentum
12. Forced Reposition
13. Combat Momentum
14. Relentless
15. Disrupted Defense
16. Pinned Down
17. Seized Initiative
18. Rallying Strike
19. Crushing Momentum
20. Perfect Opening

Each result is standalone. No result causes another table draw or secondary result selection.

## Seeded Fumble Content

On `ready`, the primary active GM seeds fumble content for eight structured D&D5e roll categories if the expected stable ZFT seed flags are missing:

- **ZFT Attack Fumbles** + **ZFT Attack Fumble Results**
- **ZFT Saving Throw Fumbles** + **ZFT Saving Throw Fumble Results**
- **ZFT Ability Check Fumbles** + **ZFT Ability Check Fumble Results**
- **ZFT Skill Check Fumbles** + **ZFT Skill Check Fumble Results**
- **ZFT Tool Check Fumbles** + **ZFT Tool Check Fumble Results**
- **ZFT Concentration Fumbles** + **ZFT Concentration Fumble Results**
- **ZFT Death Save Fumbles** + **ZFT Death Save Fumble Results**
- **ZFT Initiative Fumbles** + **ZFT Initiative Fumble Results**

Each category uses a `1d20` RollTable with 20 standalone results linked to 20 JournalEntryPages. Existing seeded documents and page text are preserved. Missing pages/results and broken Journal-page UUID links are repaired by stable seed key.

Qualified natural 1s in these eight structured categories use the same production pipeline as criticals:

```text
Natural 1
-> category-specific ZFT Fumble table roll
-> matching JournalEntryPage
-> Journal page HTML is enriched
-> ZFT Fumble chat card
-> configured fumble one-shot sound
```

Generic d20 rolls are still detected and can be qualified by the existing setting, but they intentionally use the fallback detection card because a generic roll does not provide enough context to select a meaningful consequence table.

## Player Stat Reset

Version 1.3.1 adds a GM-only **Reset Stats** control to the Criticals & Fumbles sidebar.

- Resets Critical and Fumble counters to 0 for all non-GM player accounts that currently have tracked totals.
- Requires confirmation before changing any counters.
- Does not clear sidebar history, chat messages, or Active Effects.
- The button is disabled when no player counters need resetting.
- Manual counter reset through the public API is GM-only.
- `await game.zftCriticalFumbles.resetAllPlayerStats()` performs the same bulk reset from the console.

## Criticals & Fumbles Sidebar

Version 1.3.0 adds a native Foundry sidebar tab named **Criticals & Fumbles** with its own persistent world-level history. Chat remains the normal public result output, but chat history is no longer the sidebar source of truth after an event has been recorded.

- Critical and fumble entries start collapsed and are color-coded: criticals use gold accents and fumbles use red accents.
- Expanding an entry shows a snapshot of the Journal-driven result card as it existed when the event occurred. Later Journal edits do not rewrite old sidebar history.
- Sidebar history survives chat deletion, chat pruning, Active Effect removal, browser refreshes, and Foundry restarts.
- On first use, v1.3.0 imports currently available ZFT result ChatMessages once so an existing combat history is not lost. Clearing the sidebar does not cause those chat messages to be imported again.
- When ZFT can resolve the affected token on the currently viewed scene, a location button pans to and pings that token.
- Reminder-effect routing updates the matching sidebar record with the actual target, roller, or selected ally.
- GMs can remove individual sidebar entries or use **Clear** to clear all sidebar history. These actions do not delete chat messages or remove Active Effects.
- When a GM manually removes a ZFT reminder Active Effect, ZFT asks whether the matching sidebar entry should also be removed. **Keep History** leaves the sidebar record intact. Bulk reminder clearing through the ZFT API suppresses these per-effect prompts.
- Players can view, expand, and ping sidebar entries but cannot remove or clear the shared history.
- The sidebar is implemented entirely inside `zft-critical-fumbles`; ZFT Raised Hands is not a dependency.

## Reminder Effects

Version 1.2.0 adds optional visual-only Active Effects for Journal-driven ZFT outcomes.

- **Create Fumble Reminder Effects** is enabled by default.
- **Create Critical Reminder Effects** remains disabled by default while the critical-side behavior is being validated.
- Reminder effects contain no mechanical Active Effect changes.
- The effect description uses the same Journal page HTML that supplies the ZFT result card.
- The effect name includes the result name and the result's `Effect:` wording when available.
- Effects remain in place until manually removed.
- ZFT sets `flags.dae.showIcon = true`, matching DAE's **Always Show Effect Icon** control, so newly-created reminders display on tokens without manual effect configuration.
- Fumble reminders are applied to the Actor that rolled the fumble.

Critical reminder recipients are Journal-driven. Each seeded critical Journal page receives a `flags.zft-critical-fumbles.effectTarget` value. Valid values are:

- `roller` - apply the reminder to the Actor that rolled the critical.
- `target` - apply the reminder to the attack target captured when the critical result card was created. If multiple targets were captured, ZFT prompts for the recipient. If no target was captured, ZFT prompts from scene tokens rather than guessing.
- `ally` - prompt for the ally who receives the reminder.
- `none` - do not create a reminder Active Effect for that result.

The Journal flag is the runtime source of truth. The bundled `critical-results.mjs` definitions only seed missing metadata. Existing valid Journal targeting metadata is preserved on later loads, and Journal result text is never replaced by this metadata migration.

Current bundled critical targeting:

- Target: Off Balance, Opening, Staggered, Hobbled, Driving Strike, Broken Rhythm, Shaken, Guard Open, Checked Momentum, Forced Reposition, Disrupted Defense, Pinned Down, Crushing Momentum, Perfect Opening.
- Roller: Follow Through, Pressed Advantage, Combat Momentum, Relentless, Seized Initiative.
- Ally: Rallying Strike.

The public API adds:

```js
game.zftCriticalFumbles.getReminderEffects(actorOrId);
await game.zftCriticalFumbles.clearReminderEffects(actorOrId);
```

If no Actor or ID is supplied, the API uses the first controlled token when possible.

## Debug Mode

Enable **Debug Mode** in Module Settings to receive a private debug card for every observed candidate d20 roll and detailed console diagnostics. Debug Mode is client-scoped.

Production outcome cards are independent of Debug Mode, so a real qualified critical still produces its Journal-driven result card while debugging is enabled.

## Outcome Sounds

The module seeds two Playlist documents in the sound compendium if missing:

- `ZFT Critical Sounds`
- `ZFT Fumble Sounds`

Both default to Shuffle mode.

The module also ensures the bundled sound files are present in those playlists without deleting user-added tracks:

- `Critical1.ogg` through `Critical10.ogg`
- `Fumble1.ogg` through `Fumble10.ogg`

Bundled files are referenced from:

```text
modules/zft-critical-fumbles/sounds/
```

For each qualified outcome, ZFT randomly selects one playable `PlaylistSound` from the appropriate pool and broadcasts it without starting or stopping the world's normal music or ambience playlists. Because each selection is independent, the same sound can occasionally be selected on consecutive rolls.

Module Settings provide:

- Enable Critical Sound
- Enable Fumble Sound
- Critical / Fumble Sound Volume

## Player-list Tracking

ZFT stores persistent per-user qualified critical and fumble counters and displays them on a compact second line beneath the native player name.

GM manual corrections use Shared Dice-style gestures:

- Ctrl/Cmd + left-click adds one
- Ctrl/Cmd + right-click removes one

An optional client-side Action Dialogs setting opens a quantity editor instead. The display can be disabled per client from Module Settings.

Duplicate structured/generic processing is suppressed before outcome tracking, so one qualified roll produces one ZFT counter update. Death saves are also restricted to the dedicated `dnd5e.rollDeathSave` processing path.

The public API exposes:

```js
game.zftCriticalFumbles.getUserStats(userId);
await game.zftCriticalFumbles.resetUserStats(userId);
```

## Validation

After extracting this patch over the existing `Data/modules/zft-critical-fumbles` directory and restarting Foundry:

1. Confirm the console reports ZFT v1.3.1 and `Critical recipient metadata ready` or `Seeded critical recipient metadata`.
2. Confirm **Create Fumble Reminder Effects** is enabled.
3. Force a structured natural 1 and confirm the rolling Actor receives one reminder Active Effect whose token icon is visible without manually changing **Always Show Effect Icon**.
4. Confirm the reminder effect contains no mechanical Active Effect changes and remains until manually removed.
5. Enable **Create Critical Reminder Effects**.
6. Force a natural 20 until a `target` critical result occurs with exactly one creature targeted. Confirm the reminder appears on the target, not the roller.
7. Force or select a `roller` critical result and confirm the reminder appears on the roller.
8. Force `Rallying Strike` and confirm ZFT prompts for the ally recipient before creating the reminder.
9. Test a critical with multiple targets selected and confirm ZFT prompts which target receives the reminder.
10. Open a seeded critical Journal page and confirm its `effectTarget` flag is present. Editing the Journal text must continue to change future card/effect wording without changing targeting behavior.
11. With an Actor token controlled, run `game.zftCriticalFumbles.getReminderEffects()` and confirm it returns only ZFT reminder effects on that Actor.
12. Run `await game.zftCriticalFumbles.clearReminderEffects()` and confirm only ZFT reminder effects are removed from the controlled Actor.



### Critical reminder polarity icons

Critical Journal pages carry both `effectTarget` and `effectPolarity` metadata. Harmful critical consequences use `icons/critical-target-reminder.svg` (red target/debuff styling), while beneficial or neutral critical reminders use the standard gold `icons/critical-reminder.svg`. Existing valid Journal metadata and user-edited Journal text are preserved when missing metadata is repaired.
