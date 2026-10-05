# ZFT Feature Automation

Custom D&D5e feature automation for Foundry VTT.

## Compatibility

- Tested target: Foundry VTT V13 Build 351 with D&D5e 5.2.5
- Intended support: Foundry VTT V13
- V14 status: Not verified for the Battle Familiar automation
- Required module: Midi-QOL
- Feature-specific dependency: Chris's Premades (CPR) is required for Battle Familiar

## Battle Familiar

Battle Familiar automation is intended for the 2024 Battle Familiar spell imported by DDB Importer.

When Battle Familiar is cast, ZFT:

- Detects the spell by `battle-familiar` identifier or spell name.
- Uses CPR's V13 summon engine instead of maintaining a separate summon framework.
- Prompts for Brute, Flyer, or Stalker form.
- Prompts for Celestial, Fey, or Fiend when creating a new Battle Familiar.
- Uses CPR's `CPR - Bestial Spirit` actor as a temporary summon chassis.
- Calculates AC and HP from the spell slot level.
- Sets the Battle Familiar ability scores, movement, Darkvision, and condition immunities.
- Applies Talented to ability checks and saving throws.
- Creates Rend using the summoner's spell attack modifier and the Battle Familiar damage formula.
- Creates Multiattack using half the spell level, rounded down.
- Adds Flyby for Flyer and Prowl for Stalker.
- Gives a newly summoned Battle Familiar its own Initiative through CPR.
- Reuses CPR Find Familiar summon visuals for new Battle Familiar summons: Celestial uses the celestial effect, Fey uses the nature effect, and Fiend uses the fire effect.
- Plays the matching CPR summon visual on an existing familiar when Battle Familiar empowers it in place.
- Replaces an earlier ZFT Battle Familiar when the spell is cast again.
- Can use portrait/token artwork from GM-selected Actor compendiums for newly summoned familiars without copying that artwork into ZFT.
- Provides a searchable graphical appearance picker that shows portrait artwork first and token artwork as a fallback.
- Shows the source compendium under each appearance.
- Loads 40 appearance results initially and automatically adds more as the caster scrolls.
- Lets the caster choose a specific appearance or use the per-cast Randomize Appearance checkbox.
- Loads only selected compendium indexes when a new familiar actually needs an appearance and caches the filtered list for the session.
- Resolves wildcard prototype-token artwork (for example `owl-*.webp`) to a concrete token image when an appearance is selected, with portrait artwork as a safe fallback.

If CPR Find Familiar is already active and its familiar is currently placed, ZFT empowers that familiar in place instead of summoning a second familiar. The familiar retains its current HP and creature identity, receives Battle Familiar temporary HP and Battle Familiar statistics, and is restored when the effect ends or the granted temporary HP reaches 0.

### Appearance configuration

Use **Configure Settings → Module Settings → ZFT Feature Automation → Battle Familiar Appearance** to configure the appearance system.

- Only explicitly checked Actor compendiums are used as appearance sources.
- The default sources are `zantors-dbbi.monsters` and `dnd-monster-manual.actors` when those packs exist.
- Other Actor compendiums remain ignored unless enabled by the GM.
- The settings screen shows each compendium's Actor total.
- Opening the settings screen reads only the basic Actor indexes needed for those totals; it does not build the Battle Familiar appearance cache.
- Beast-only filtering is enabled by default.
- Exclude Creatures with “Legacy” in the Name is enabled by default and removes matching creature names from the appearance list.
- Randomize Appearance controls the default state of the per-cast Randomize Appearance checkbox; the caster can override it for each summon.
- Changing an appearance-source/filter setting invalidates the current session cache so it rebuilds on the next applicable cast.

### V13 testing note

The Find Familiar empowerment and compendium appearance paths are V13 code and should be validated before moving this release to production. Pocket Dimension interaction while Battle Familiar is active remains an edge case to test explicitly.

## 2024 Arcane Ward

The Arcane Ward automation corrects damage ordering for the 2024 Abjurer feature when Midi-QOL automatic damage is enabled.

- Detects only the 2024 `Arcane Ward` feature.
- Ignores Legacy/2014 Arcane Ward.
- Reads the ward's current HP from item uses.
- Absorbs post-save, post-resistance, and post-vulnerability damage before temporary HP and normal HP.
- Updates the ward's item uses automatically.
- Passes only overflow damage back to Midi-QOL.
- Keeps Midi-QOL damage detail synchronized so reduced damage is applied correctly.
- Leaves imported Create Ward, restoration, spell-slot, and Long Rest activities intact.
- Avoids conflicting with legacy CPR-managed Arcane Ward automation.

DDB Importer's Arcane Ward enhancer may remain enabled. ZFT handles ward absorption during Midi-QOL's damage workflow before actor damage is applied.

## Projected Ward

Projected Ward is handled as an optional Reaction when another creature takes damage.

- Detects the 2024 `Projected Ward` feature.
- Checks that the ward owner still has Arcane Ward HP remaining.
- Checks whether the Reaction has already been used.
- Requires the damaged creature to use the same token disposition as the ward owner, preventing enemy damage from generating Projected Ward prompts.
- Requires the damaged creature to be within 30 feet.
- Requires the ward owner to be able to see the damaged creature.
- Uses Midi-QOL's configured Reaction timeout.
- Displays a live countdown during the Reaction window.
- Provides explicit Use Projected Ward and Do Not Use choices.
- Does not consume the Reaction if the prompt is declined, closed, or times out.
- Absorbs damage from the ward and passes only overflow damage through to the protected creature.
- Correctly handles temporary HP after the ward absorbs damage.
- Supports multi-target and area-of-effect damage by collecting all eligible damaged creatures into one prompt.
- Allows the ward owner to protect only one creature per Reaction.

## Damage Order

ZFT applies Arcane Ward and Projected Ward after Midi-QOL has already determined the creature's actual incoming damage.

The effective order is:

1. Attack or saving throw resolves.
2. Resistance, vulnerability, and similar mitigation are applied.
3. Final incoming damage is determined.
4. Arcane Ward or Projected Ward absorbs damage.
5. Any remaining damage reaches temporary HP.
6. Any remaining damage reaches normal HP.

## Version

Current release: v1.3.9
