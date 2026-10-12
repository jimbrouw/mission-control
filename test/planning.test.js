import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPriority, resumeText } from '../shared/planning.js';
const day = '2026-10-12';
const task = (id, extra = {}) => ({ id, text: id, ...extra });
test('deadline beats Today and LIVE; completed, parked and future work excluded', () => {
  const state = { inbox: [task('today', {today:true}), task('due', {deadline:day}), task('done', {done:true, deadline:'2020-01-01'})], missions: [
    {id:'park',status:'PARKED',tasks:[task('parked',{deadline:'2020-01-01'})]},
    {id:'live',status:'LIVE',tasks:[task('future',{when:'2026-10-13'}),task('live')]}
  ]};
  const before = structuredClone(state);
  assert.equal(dailyPriority(state, day).text, 'due');
  assert.deepEqual(state, before);
  state.inbox.splice(1,1);
  assert.equal(dailyPriority(state, day).text, 'today');
  state.inbox = [];
  assert.equal(dailyPriority(state, day).text, 'live');
});
test('oldest deadline then task order; due tasks can override a future start', () => {
  assert.equal(dailyPriority({inbox:[task('later',{deadline:day}),task('old',{deadline:'2026-10-10',when:'2026-10-20'})]}, day).text,'old');
  assert.equal(dailyPriority({inbox:[task('b',{order:20}),task('a',{order:10})]}, day).text,'a');
  assert.equal(dailyPriority({},day),null);
});
test('resume is explicitly self-reported and never infers verification from completed tasks', () => {
  const text = resumeText({name:'Project',tasks:[task('done',{done:true})],handover:{completed:'Built draft',next:'Test playback'}});
  assert.match(text,/self-reported/);
  assert.match(text,/Verification evidence: Not recorded/);
  assert.match(text,/Next action: Test playback/);
});
