# ZFT Critical Fumbles

Version 1.1.22

Foundry VTT V13/V14 + D&D5e critical/fumble detection framework with configurable fumble eligibility, debug reporting, module-owned content compendiums, Journal-driven critical/fumble result cards, and one-shot outcome sound pools.

## Detection

A roll is eligible only when it resolves to exactly one active d20 result:

- `1d20` -> evaluated
- `2d20kh1` -> only the kept/high result is evaluated
- `2d20kl1` -> only the kept/low result is evaluated
- `3d20kh1` -> only the kept result is evaluated
- plain `2d20` or `30d20` -> ignored because multiple d20 results remain active

Natural 20 qualifies as a critical only for Attack rolls when **Enable Critical Handling** is enabled. Natural 1 fumble eligibility is configurable by roll type in Module Settings.

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

A qualified attack critical now uses this pipeline:

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

Qualified natural 1s in these eight structured categories now use the same production pipeline as criticals:

```text
Natural 1
-> category-specific ZFT Fumble table roll
-> matching JournalEntryPage
-> Journal page HTML is enriched
-> ZFT Fumble chat card
-> configured fumble one-shot sound
```

Generic d20 rolls are still detected and can be qualified by the existing setting, but they intentionally use the fallback detection card because a generic roll does not provide enough context to select a meaningful consequence table.

## Debug Mode

Enable **Debug Mode** in Module Settings to receive a private debug card for every observed candidate d20 roll and detailed console diagnostics. Debug Mode is client-scoped.

Production outcome cards are independent of Debug Mode, so a real qualified critical still produces its Journal-driven result card while debugging is enabled.

## Outcome Sounds

The module seeds two Playlist documents in the sound compendium if missing:

- `ZFT Critical Sounds`
- `ZFT Fumble Sounds`

Both default to Shuffle mode. Add one-shot audio tracks to these Playlists. ZFT selects a random playable PlaylistSound from the appropriate pool and broadcasts it without starting/stopping the world's normal music or ambience Playlist.

Module Settings provide:

- Enable Critical Sound
- Enable Fumble Sound
- Critical / Fumble Sound Volume

## Validation

After replacing the module and restarting Foundry:

1. Confirm the console reports `v1.1.14`.
2. Open Compendium Packs -> ZFT Critical Fumbles.
3. Confirm `Critical & Fumble Results` contains `ZFT Critical Results` with 20 pages.
4. Confirm `Critical & Fumble Tables` contains `ZFT Critical Hits` with 20 results and formula `1d20`.
5. Make a normal non-critical attack. No public result card should appear.
6. Make or force a natural 20 Attack roll. One ZFT Critical Hit card should appear using the selected Journal page content.
7. Enable Debug Mode and repeat. The private debug card and the normal critical result card should both appear.
8. Delete one seeded critical Journal page, reload as GM, and confirm only that missing page is recreated and its table linkage is repaired.
9. Force a natural 1 on an Attack, Saving Throw, Ability Check, Skill Check, Tool Check, Concentration roll, Death Save, and Initiative roll. Confirm each uses its matching ZFT fumble table, resolves one Journal page, posts one Fumble result card, and does not make a second table draw.
10. Force a generic `/r 1d20` natural 1. Confirm it is still detected but uses the generic fallback card rather than a category-specific table.

## Player-list tracking

v1.1.15 adds persistent per-user qualified critical and fumble counters to Foundry's Players list.

v1.1.20 moves those counters onto a compact second line beneath the native player name. ZFT no longer inspects, repositions around, or modifies Shared Dice UI, so third-party player-list resources retain the full horizontal resource lane. GM manual corrections mirror Shared Dice's edit gesture: Ctrl/Cmd + left-click adds one and Ctrl/Cmd + right-click removes one. An optional client-side Action Dialogs setting opens a quantity editor instead. The display can be disabled per client from Module Settings.

v1.1.22 fixes player-list counter spacing by removing the nested count span and rendering each icon/value pair as one compact inline chip, preventing Foundry or third-party span/flex rules from separating the icon from its number.

The public API exposes:

```js
game.zftCriticalFumbles.getUserStats(userId);
await game.zftCriticalFumbles.resetUserStats(userId);
```
