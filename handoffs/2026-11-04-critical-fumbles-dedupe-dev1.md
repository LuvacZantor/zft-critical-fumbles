# ZFT Critical Fumbles: v1.3.2-dev.1 duplicate-roll checkpoint

Date: 2026-11-04 (America/New_York)

## Repository and provenance

- Repository: `LuvacZantor/zft-critical-fumbles`.
- Development checkpoint: branch `develop`, created from accepted `main` at `5181dafd16c1941535d979e1dda8db52eda5e290`.
- Accepted `main` remains unchanged at that baseline; this is not a release, tag, merge, or deployment.
- Prior installed version: `1.3.1`, user-supplied `zft-critical-fumbles(1).zip`.
- Development test version: `1.3.2-dev.1`, complete manual-install archive `zft-critical-fumbles-v1.3.2-dev.1.zip`.
- ZIP SHA-256: `83fbd29fffa9f3a437892b15dd65a07b86ae83897d955ead9b69d73c100c6739`.
- Test environment: Foundry 13.351 / D&D5e 5.2.5.
- The branch head identifies the exact GitHub checkpoint commit; check the current ref rather than assuming this document contains its SHA.

## Confirmed defect and scoped correction

D&D5e 5.2.x emits the evaluated roll's ChatMessage before the structured Skill hook, and its chat roll is a copy. Version 1.3.1 saw one natural-1 Skill check through `createChatMessage` as Generic, and later through `dnd5e.rollSkill` / `dnd5e.rollSkillV2`, producing two ZFT cards and potentially duplicate side effects.

The fix first checks `message.flags.dnd5e.roll.type` and `roll.options.rollType`. A classified D&D5e roll is left to its structured hook and cannot enter the Generic fallback. Truly untyped chat rolls receive a bounded 200 ms grace period and a short, one-use correlation with recent structured rolls. Standalone `/r 1d20` remains enabled if the existing Generic setting allows it. The code still accepts two independent identical generic rolls.

## Files changed against accepted main

- `module.json`: `1.3.2-dev.1`.
- `README.md`: development notes and validation steps, **preserving the more recent central-standards notice already on GitHub main**.
- `scripts/main.mjs`: provenance-aware classified-chat bypass, short grace/correlation, version.
- `scripts/reminder-effects.mjs`, `scripts/sidebar.mjs`: version constants only.
- `scripts/roll-correlation.mjs`: new isolated helper.
- `test/roll-correlation.test.mjs`, `test/integration.test.mjs`: exact tests from the locally validated test build.
- `handoffs/2026-11-04-critical-fumbles-dedupe-dev1.md`: this handoff.

All other repository files remain those from the existing `main` tree. Critically, GitHub's original `packs/`, sounds, icons, CSS, and templates are preserved. The user's uploaded ZIP contained later world-mutated LevelDB compendiums; do **not** overwrite repository pack contents with those uploaded world data files. The separate test ZIP retains the user's supplied pack bytes. On future installs, back up and retain live `packs/` before replacing module code.

## Validation status

- Node automated regression tests: **35 passed, 0 failed** (`node --test test/*.test.mjs`).
- Syntax checks: tested modified JS modules passed `node --check`.
- Complete manual ZIP integrity and original media/pack preservation checked.
- Live Foundry user reports: **two consecutive natural-1 fumbles resulted in exactly one chat card each**. This is limited acceptance evidence, not full coverage.
- Remaining live checks: Saving Throw, Attack, Tool, Ability, Initiative, Concentration, Death Save, Generic `/r 1d20`, one sound, one player-stat increment, one sidebar entry, one reminder effect, and GM/player multi-client behavior.
- No stable release approval. No changes to `main`; no tag or GitHub Release.

## Resume guidance

1. Inspect this branch head, module version, this handoff and current central standards.
2. Test the still-unverified categories and side effects in Foundry 13.351 / D&D5e 5.2.5.
3. Preserve user-authored Journal/compendium data and all unrelated module behavior.
4. Prepare a later dev build only for confirmed additional corrections, with a new version.
5. Do not merge to `main`, tag, or release without fresh task-specific owner approval.

## Owner authorization

On 2026-11-04, the owner approved creation of `develop` and a commit containing the v1.3.2-dev.1 source changes, tests, and this development handoff. That approval does not authorize any other GitHub operation.
