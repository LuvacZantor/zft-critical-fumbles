import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDnd5eChatRoll, matchingRecentStructuredRoll } from '../scripts/roll-correlation.mjs';

const structuredRoll = (type) => ({ options: { rollType: type } });
const message = (type) => ({ flags: { dnd5e: { roll: { type } } } });

test('Skill/Save/Attack/Tool/Ability/Death/Initiative/Concentration/Damage metadata owns roll', () => {
  for (const type of ['skill','save','attack','tool','ability','death','initiative','concentration','damage']) {
    assert.equal(classifyDnd5eChatRoll(message(type), {}), type);
    assert.equal(classifyDnd5eChatRoll({}, structuredRoll(type)), type);
  }
});

test('untyped /r 1d20 remains eligible for generic fallback', () => {
  assert.equal(classifyDnd5eChatRoll({}, { options: {} }), null);
  assert.equal(classifyDnd5eChatRoll({ flags: {} }, {}), null);
  assert.equal(classifyDnd5eChatRoll(message('generic'), structuredRoll('roll')), null);
  assert.equal(classifyDnd5eChatRoll(message(' '), { options: { rollType: null } }), null);
});

test('D&D5e roll options survive ChatMessage flag omission', () => {
  assert.equal(classifyDnd5eChatRoll({ flags: {} }, structuredRoll('skill')), 'skill');
});

const base = { timestamp: 1000, natural: 1, total: 5, formula: '1d20 + 4', actorKeys: ['actor:A'], actorName: 'actor a', messageId: null };
const candidate = (overrides={}) => ({ ...base, timestamp: 1100, ...overrides });

test('matches structured and untyped copied roll with one valid actor', () => {
  assert.equal(matchingRecentStructuredRoll(base,candidate()), true);
  assert.equal(matchingRecentStructuredRoll(base,candidate({ actorKeys: [], actorName: '' })), true);
});

test('different actors cannot be confused even if the natural, formula and total match', () => {
  assert.equal(matchingRecentStructuredRoll(base,candidate({ actorKeys: ['actor:B'], actorName: 'actor b' })), false);
});

test('different ChatMessage IDs prevent accidental dedupe', () => {
  assert.equal(matchingRecentStructuredRoll({ ...base, messageId: 'm1' },candidate({ messageId: 'm2' })), false);
});

test('shared ChatMessage IDs allow correlation despite missing Actor', () => {
  assert.equal(matchingRecentStructuredRoll({ ...base, messageId: 'm1' },candidate({ actorKeys: [], actorName: '', messageId: 'm1' })), true);
});

test('same values but different roll formula never match without shared message identity', () => {
  assert.equal(matchingRecentStructuredRoll(base,candidate({ formula: '1d20 + 5' })), false);
});

test('actorless matches expire faster than fully identified matches', () => {
  assert.equal(matchingRecentStructuredRoll(base,candidate({ timestamp: 1550, actorKeys:[], actorName:'' })), false);
  assert.equal(matchingRecentStructuredRoll(base,candidate({ timestamp: 1550 })), true);
  assert.equal(matchingRecentStructuredRoll(base,candidate({ timestamp: 2700 })), false);
});

test('differing outcomes do not match', () => {
  assert.equal(matchingRecentStructuredRoll(base,candidate({ natural: 2 })), false);
  assert.equal(matchingRecentStructuredRoll(base,candidate({ total: 6 })), false);
});
