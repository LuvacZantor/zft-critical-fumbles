import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { resolveSingleActiveD20 } from '../scripts/d20-detector.mjs';
import { classifyDnd5eChatRoll, matchingRecentStructuredRoll } from '../scripts/roll-correlation.mjs';

const sourceFile = fileURLToPath(new URL('../scripts/main.mjs', import.meta.url));
const source = readFileSync(sourceFile, 'utf8')
  .replace(/^import(?:.|\n)*?from ["'][^"']+["'];\s*$/gm, '');

function makeRoll({ natural=1, total=5, formula='1d20 + 4', type=null, results=null }={}) {
  const roll = {
    terms: [], formula, total,
    dice: [{ faces: 20, results: results ?? [{ result: natural, active: true }] }],
    options: {}
  };
  if (type) roll.options.rollType = type;
  return roll;
}

function makeMessage(roll, { type=null, actor='actor-A', name='Character A', id='message-1' }={}) {
  return {
    id,
    rolls: [roll],
    flags: type ? { dnd5e: { roll: { type } } } : {},
    author: { id: 'owner-A' },
    speaker: { actor, alias: name },
  };
}

function harness({ settings={} }={}) {
  const cards=[];
  const counts={ stats:0, fumbleResults:0, criticalResults:0, sounds:0 };
  const actor={ id:'actor-A', uuid:'Actor.actor-A', name:'Character A', documentName:'Actor' };
  const ctx = {
    console: { log(){}, warn(){}, error(){}, groupCollapsed(){}, groupEnd(){} },
    setTimeout,
    Hooks: { once(){}, on(){} },
    CONFIG: {},
    foundry: { utils: {randomID:()=> 'event-id' }, audio: { AudioHelper: { async play(){counts.sounds++;} } } },
    game: {
      user: { id: 'owner-A', isGM:true, targets:new Set() },
      system: { id:'dnd5e', version:'5.2.5' }, version:'13.351',
      settings: { get(_module,key) {
        if (Object.hasOwn(settings,key)) return settings[key];
        if (key==='debugMode' || key==='enableCriticalSound' || key==='enableFumbleSound') return false;
        return true;
      } },
      actors: { get(id){ return id==='actor-A'?actor:null; } },
      packs: { get(){ return { async getDocument(){ return { name:'ZFT Fumble Sounds', sounds:[{path:'modules/zft-critical-fumbles/sounds/Fumble1.ogg',volume:1,name:'test-sound'}] }; } }; } },
    },
    ChatMessage: {
      getSpeaker({ actor: supplied }={}) { return { actor: supplied?.id ?? 'actor-A', alias: supplied?.name ?? 'Character A' }; },
      async create(data) { cards.push(data); return data; }
    },
    resolveSingleActiveD20,
    classifyDnd5eChatRoll,
    matchingRecentStructuredRoll,
    registerPlayerStatsHooks(){}, registerPlayerStatsSetting(){},
    registerCriticalFumbleSidebarSettings(){}, registerCriticalFumbleSidebarTab(){},
    initializeCriticalFumbleSidebar(){},
    ensureCriticalContent(){}, ensureFumbleContent(){}, ensureCriticalTargetMetadata(){},
    adjustUserOutcomeStats(){}, getUserOutcomeStats(){},
    async incrementCurrentUserOutcome(){counts.stats++;},
    resetAllPlayerOutcomeStats(){}, resetUserOutcomeStats(){}, setUserOutcomeStats(){},
    async rollFumbleResult({ rollType }){
      counts.fumbleResults++;
      if (rollType === 'generic') return null;
      return { seedKey:'skill-test', table:{name:'Fumble Table'}, tableRoll:{total:1}, result:{name:'Escalation',id:'r1'}, page:{name:'Escalation',uuid:'Page.demo',text:{content:'<p>Effect: Test.</p>'}} };
    },
    async rollCriticalResult(){ counts.criticalResults++;return null; }
  };
  const rewritten = source + '\nthis.__test = { onStructuredRoll, onCreateChatMessage, processRoll };';
  runInNewContext(rewritten,ctx,{filename:'scripts/main.mjs'});
  return { ...ctx.__test, cards, counts, actor };
}

const structured = (h, roll, type='skill',hook=null) => h.onStructuredRoll(
  hook ?? `dnd5e.roll${type[0].toUpperCase()}${type.slice(1)}V2`, type,
  [[roll], { subject:h.actor }]
);

function assertOneDetailedFumble(h) {
  assert.equal(h.counts.stats,1,'one statistics increment');
  assert.equal(h.counts.fumbleResults,1,'one table roll');
  assert.equal(h.cards.length,1,'one chat card');
  assert.equal(h.cards[0].flags['zft-critical-fumbles'].resultCard,true,'detailed result, not fallback card');
  assert.equal(h.cards[0].flags['zft-critical-fumbles'].rollType,'skill');
}

test('skill system hook then typed copied ChatMessage: exactly one detailed card',async()=>{
  const h=harness();
  await structured(h,makeRoll({type:'skill'}));
  await h.onCreateChatMessage(makeMessage(makeRoll({type:'skill'}),{type:'skill'}));
  assertOneDetailedFumble(h);
});

test('typed copied ChatMessage first then skill hook: exactly one detailed card',async()=>{
  const h=harness();
  await h.onCreateChatMessage(makeMessage(makeRoll({type:'skill'}),{type:'skill'}));
  await structured(h,makeRoll({type:'skill'}));
  assertOneDetailedFumble(h);
});

test('when flags are missing, roll.options.rollType still blocks Generic fumble',async()=>{
  const h=harness();
  await structured(h,makeRoll({type:'skill'}));
  await h.onCreateChatMessage(makeMessage(makeRoll({type:'skill'})));
  assertOneDetailedFumble(h);
});

test('structured-before-untyped cloned roll with missing actor still gets one detailed card',async()=>{
  const h=harness();
  await structured(h,makeRoll());
  const generic=makeMessage(makeRoll(),{actor:'actor-A',name:'Character A'});
  await h.onCreateChatMessage(generic);
  assertOneDetailedFumble(h);
});

test('untyped ChatMessage first, structured hook during grace: no duplicate fallback',async()=>{
  const h=harness();
  const pending=h.onCreateChatMessage(makeMessage(makeRoll()));
  await structured(h,makeRoll());
  await pending;
  assertOneDetailedFumble(h);
});

test('standalone /r 1d20 retains one generic fallback card',async()=>{
  const h=harness();
  await h.onCreateChatMessage(makeMessage(makeRoll()));
  assert.equal(h.cards.length,1);
  assert.equal(h.counts.stats,1);
  assert.equal(h.counts.fumbleResults,1,'Generic content checked but no category table exists');
  assert.equal(h.cards[0].flags['zft-critical-fumbles'].testCard,true);
  assert.equal(h.cards[0].flags['zft-critical-fumbles'].rollType,'generic');
});

test('two independent identical standalone /r 1d20 rolls are both handled',async()=>{
  const h=harness();
  await h.onCreateChatMessage(makeMessage(makeRoll(),{id:'one'}));
  await h.onCreateChatMessage(makeMessage(makeRoll(),{id:'two'}));
  assert.equal(h.cards.length,2);
  assert.equal(h.counts.stats,2);
});

test('discarded natural 1 (advantage) must not trigger a fumble',async()=>{
  const h=harness();
  await structured(h,makeRoll({ natural:20,results:[{result:1,active:false},{result:20,active:true}],type:'skill' }));
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});

test('plain pool of two active d20 results must not trigger two fumbles',async()=>{
  const h=harness();
  await structured(h,makeRoll({results:[{result:1,active:true},{result:1,active:true}],type:'skill'}));
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});

test('death-saving-throw generic ChatMessage remains excluded before death-save hook',async()=>{
  const h=harness();
  await h.onCreateChatMessage(makeMessage(makeRoll({type:'death'}),{type:'death'}));
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});


test('Skill duplicate does not replay the fumble sound',async()=>{
  const h=harness({settings:{enableFumbleSound:true,soundVolume:1}});
  await structured(h,makeRoll({type:'skill'}));
  await h.onCreateChatMessage(makeMessage(makeRoll({type:'skill'}),{type:'skill'}));
  assertOneDetailedFumble(h);
  assert.equal(h.counts.sounds,1,'one one-shot sound');
});

test('one roll from another user does not run local generic fallback',async()=>{
  const h=harness();
  const message=makeMessage(makeRoll());
  message.author.id='player-B';
  await h.onCreateChatMessage(message);
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});

test('standalone generic natural 1 respects disabled Generic setting',async()=>{
  const h=harness({ settings:{fumbleGeneric:false} });
  await h.onCreateChatMessage(makeMessage(makeRoll()));
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});

test('structured hook without Actor and untyped copied chat with Actor are correlated',async()=>{
  const h=harness();
  await h.onStructuredRoll('dnd5e.rollSkillV2','skill',[[makeRoll()], {}]);
  await h.onCreateChatMessage(makeMessage(makeRoll()));
  assert.equal(h.cards.length,1,'no second generic card');
  assert.equal(h.counts.stats,1);
});

test('different Actors with identical result retain independent fumble cards',async()=>{
  const h=harness();
  const first=makeRoll();
  const second=makeRoll();
  await structured(h,first);
  const actorB={ id:'actor-B',uuid:'Actor.actor-B',name:'Character B',documentName:'Actor' };
  await h.onStructuredRoll('dnd5e.rollSkillV2','skill',[[second],{subject:actorB}]);
  assert.equal(h.cards.length,2);
  assert.equal(h.counts.stats,2);
});


test('D&D5e 5.2.x fires both rollSkill and rollSkillV2 for the same Roll without two cards',async()=>{
  const h=harness();
  const roll=makeRoll({type:'skill'});
  await structured(h,roll,'skill','dnd5e.rollSkill');
  await structured(h,roll,'skill','dnd5e.rollSkillV2');
  assertOneDetailedFumble(h);
});

test('D&D5e 5.2.x actual sequence: cloned typed chat, rollSkill, rollSkillV2 creates one card',async()=>{
  const h=harness();
  const roll=makeRoll({type:'skill'});
  const clonedChatRoll=makeRoll({type:'skill'});
  await h.onCreateChatMessage(makeMessage(clonedChatRoll,{type:'skill'}));
  await structured(h,roll,'skill','dnd5e.rollSkill');
  await structured(h,roll,'skill','dnd5e.rollSkillV2');
  assertOneDetailedFumble(h);
});

for (const type of ['attack', 'save', 'ability', 'tool', 'initiative', 'concentration', 'death-save']) {
  test(`typed ${type} ChatMessage followed by D&D5e hook emits one fumble`,async()=>{
    const h=harness();
    const metadataType = type === 'death-save' ? 'death' : type;
    const chatRoll=makeRoll({type: metadataType});
    await h.onCreateChatMessage(makeMessage(chatRoll,{type:metadataType}));
    const systemRoll=makeRoll({type:metadataType});
    await h.onStructuredRoll(`dnd5e.roll${type}`,type,[[systemRoll],{subject:h.actor,ability:'dex'}]);
    assert.equal(h.cards.length,1,`one ${type} fumble card`);
    assert.equal(h.counts.stats,1,`one ${type} stat increment`);
    assert.equal(h.cards[0].flags['zft-critical-fumbles'].rollType,type);
  });
}

test('natural 20 from a Skill check is not a critical hit',async()=>{
  const h=harness();
  await structured(h,makeRoll({natural:20,total:24,type:'skill'}));
  await h.onCreateChatMessage(makeMessage(makeRoll({natural:20,total:24,type:'skill'}),{type:'skill'}));
  assert.equal(h.cards.length,0);
  assert.equal(h.counts.stats,0);
});
