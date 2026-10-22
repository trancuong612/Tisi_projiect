import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDailyWorkload } from '../app/services/daily-workload.server.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const now = new Date('2026-10-22T12:00:00.000Z');
const yesterday = new Date(now.getTime() - 86400_000);
const due = Array.from({ length: 61 }, (_, i) => ({
  id: `memory-${i}`, vocabularyId: `due-${i}`, due: yesterday,
  state: 'REVIEWING', lapses: 0, difficulty: 4, vocabulary: { importance: 1 },
}));
const newIds = Array.from({ length: 20 }, (_, i) => `new-${i}`);
const carryIds = Array.from({ length: 82 }, (_, i) => `carry-${i}`);
const weak = [
  { id: 'due-0', weakProfile: { status: 'RELEARNING', score: .99 } },
  { id: 'due-1', weakProfile: { status: 'WEAK', score: .99 } },
  ...Array.from({ length: 5 }, (_, i) => ({ id: `extra-re-${i}`, weakProfile: { status: 'RELEARNING', score: .85 } })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `extra-weak-${i}`, weakProfile: { status: 'WEAK', score: .75 } })),
];
const modes = [
  { count: 0, days: 0, mode: 'NORMAL', dueCap: 20, carryCap: 5, practiceCap: 4 },
  { count: 61, days: 0, mode: 'BUSY', dueCap: 12, carryCap: 3, practiceCap: 2 },
  { count: 61, days: 8, mode: 'RECOVERY', dueCap: 10, carryCap: 3, practiceCap: 1 },
  { count: 0, days: 4, mode: 'BUSY', dueCap: 12, carryCap: 3, practiceCap: 2 },
];
for (const item of modes) {
  const w = buildDailyWorkload({
    now, dueMemories: due.slice(0, item.count), weakWords: weak,
    newWordIds: newIds, lastActivityAt: new Date(now.getTime() - item.days * 86400_000),
  });
  assert.equal(w.mode, item.mode);
  assert.equal(w.targets.newWords.length, 20, 'Must keep all 20 curriculum words');
  assert.equal(w.targets.due.length, Math.min(item.dueCap, item.count));
  assert.equal(w.limits.carryover, item.carryCap);
  assert(w.targets.weak.length + w.targets.relearning.length <= item.practiceCap);
  const ids = Object.values(w.targets).flat();
  assert.equal(new Set(ids).size, ids.length, 'No duplicate exercises');
  assert(w.targets.due.every(id => id.startsWith('due-')), 'MemoryState ID must never be treated as vocabulary ID');
}
const w = buildDailyWorkload({ now, dueMemories: due, weakWords: weak, newWordIds: newIds, lastActivityAt: now });
assert.deepEqual(w.overlap, { dueRelearning: 1, dueWeak: 1, deferredDueRelearning: 0, deferredDueWeak: 0 });
assert.equal(w.deferred.due, 49);
console.log('PASS: 20 NEW + capped DUE + one shared small practice budget; no duplicated IDs');

// Load the session module under a stubbed Prisma client. It imports real Prisma
// in production; this isolated regression never reads or writes your database.
const source = fs.readFileSync(path.join(root, 'app/services/daily-session.server.js'), 'utf8')
  .replace(/^import .*;\s*$/gm, '')
  .replace(/\bexport /g, '');
let stored = {
  id: 'today', dateKey: '2026-10-22', day: 'THURSDAY', startedAt: yesterday,
  dueTargets: due.map(d => d.vocabularyId),
  newTargets: newIds, weakTargets: [], relearningTargets: [],
  readingTargets: ['reading-1'], completedReadingTargets: ['reading-1'],
  workloadMode: 'BUSY',
  workloadMeta: { raw: { due: 61 }, carryoverTargets: carryIds },
};
const acquired = new Set([
  ...due.map(d => d.vocabularyId),
  ...weak.map(x => x.id),
  'carry-0', 'carry-1',
]);
const recentlyCompleted = new Set(['due-0', 'due-1', 'due-2']);
let updatedCount = 0;
const mockPrisma = {
  dailySession: {
    findUnique: async () => stored,
    update: async ({ data }) => { updatedCount++; stored = { ...stored, ...data }; return stored; },
    create: async ({ data }) => { stored = { id: 'today', startedAt: yesterday, ...data }; return stored; },
  },
  memoryState: {
    findMany: async ({ where }) => due
      .filter(d => !where?.vocabularyId || where.vocabularyId.in.includes(d.vocabularyId))
      .map(d => ({ vocabularyId: d.vocabularyId, due: d.due })),
  },
  reviewLog: {
    findMany: async ({ where }) => (where?.exerciseType === 'FLASHCARD'
      ? [...recentlyCompleted].filter(id => where.vocabularyId.in.includes(id))
      : []).map(id => ({ vocabularyId: id })),
  },
  newLearningProgress: {
    findMany: async () => carryIds.slice(2, 8).map((id, idx) => ({ vocabularyId: id, exposed: true, correctCount: 4 - Math.floor(idx / 2) })),
  },
};
const getAcquiredVocabularyIdSet = async ids => new Set(ids.filter(id => acquired.has(id)));
const daily = new Function('prisma', 'getAcquiredVocabularyIdSet', source + `\nreturn {
  getOrCreateDailySession, getCarryoverTargets, addOptionalDueBatch,
};`)(mockPrisma, getAcquiredVocabularyIdSet);
const sessionArgs = {
  dateKey: '2026-10-22', day: 'THURSDAY', weekNumber: 1, targets: w.targets,
  carryoverIds: carryIds, readings: ['reading-1'], workloadMode: w.mode,
  workloadMeta: { raw: w.raw, selected: w.selected, deferred: w.deferred, limits: w.limits, overlap: w.overlap },
};
let result = await daily.getOrCreateDailySession(sessionArgs);
assert.equal(result.dueTargets.length, 12, 'Old 61 review targets must be reduced to 12');
assert(result.dueTargets.every(id => id.startsWith('due-')));
for (const id of recentlyCompleted) assert(result.dueTargets.includes(id), 'Completed due must be kept');
assert.equal(result.newTargets.length, 20);
assert.equal(daily.getCarryoverTargets(result).length, 3, 'Old 82 carryover targets must be reduced to 3');
assert(daily.getCarryoverTargets(result).includes('carry-0'));
assert(daily.getCarryoverTargets(result).includes('carry-1'));
assert.deepEqual(result.completedReadingTargets, ['reading-1']);
assert.equal(result.workloadMeta.rawCarryover, 82);
assert.equal(result.workloadMeta.planVersion, 'balanced-v1');
assert(result.relearningTargets.length + result.weakTargets.length <= 2);
console.log('PASS: legacy 61 DUE/82 carryover session safely shrinks; 20 NEW & completed work preserved');
const before = updatedCount;
result = await daily.getOrCreateDailySession(sessionArgs);
assert.equal(result.dueTargets.length, 12);
assert.equal(result.workloadMeta.carryoverTargets.length, 3);
assert.equal(updatedCount, before, 'Idempotent: reload must not mutate the same snapshot');
console.log('PASS: daily refresh is stable; no unbounded refill after completion');
const added = await daily.addOptionalDueBatch({ sessionId: 'today', dateKey: '2026-10-22' });
assert.equal(added, 10);
assert.equal(stored.dueTargets.length, 22);
result = await daily.getOrCreateDailySession(sessionArgs);
assert.equal(result.dueTargets.length, 22, 'Voluntary 10 reviews must survive reload');
assert.equal(result.workloadMeta.extraDueSlots, 10);
// Mode changes during one calendar day must NOT increase required work.
const normalW = buildDailyWorkload({ now, dueMemories: due.slice(0, 15), weakWords: weak, newWordIds: newIds, lastActivityAt: now });
assert.equal(normalW.mode, 'NORMAL');
result = await daily.getOrCreateDailySession({
  ...sessionArgs, targets: normalW.targets, workloadMode: normalW.mode,
  workloadMeta: { ...sessionArgs.workloadMeta, limits: normalW.limits, raw: normalW.raw },
});
assert.equal(result.workloadMode, 'BUSY');
assert.equal(result.workloadMeta.baseLimits.due, 12);
assert.equal(result.dueTargets.length, 22);
console.log('PASS: BUSY -> NORMAL in the same day does not silently inflate targets');
// When the two optional kinds are available, reserve both a place in the shared budget.
const optional = buildDailyWorkload({ now, dueMemories: due.slice(0, 40), weakWords: weak, newWordIds: newIds, lastActivityAt: now });
assert.equal(optional.targets.relearning.length, 1);
assert.equal(optional.targets.weak.length, 1);
console.log('PASS: shared practice budget fairly covers RELEARNING and WEAK without duplicates');
console.log('PASS: voluntary +10 DUE is retained and does not change FSRS dates');
console.log('ALL BALANCED LEARNING REGRESSION TESTS PASSED');
