// Fairway Finder: offline booking simulator. No network calls or credentials.
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export const TIME_ZONE = 'America/Los_Angeles';
export function releaseDate(playDate, advanceDays) {
  assert.match(playDate, /^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(playDate + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  date.setUTCDate(date.getUTCDate() - advanceDays);
  return date.toISOString().slice(0,10);
}
export function selectTeeTime(request, inventory) {
  if (!request.courses?.length || !request.date || !request.players) throw new Error('Invalid request');
  const eligible = inventory.filter(t =>
    t.date === request.date &&
    request.courses.includes(t.course) &&
    t.time >= request.start && t.time <= request.end &&
    t.availablePlayers >= request.players &&
    t.pricePerPlayer <= request.maxPricePerPlayer
  );
  // Prefer earliest time, then cheapest.
  eligible.sort((a,b) => a.time.localeCompare(b.time) || a.pricePerPlayer-b.pricePerPlayer);
  return eligible[0] ?? null;
}
export class MockProvider {
  constructor(inventory) { this.inventory = inventory; this.reservations = new Map(); }
  async listAvailable() { return this.inventory.filter(t=>t.availablePlayers>0); }
  async reserve(slot, request, idempotencyKey) {
    if (this.reservations.has(idempotencyKey)) return this.reservations.get(idempotencyKey);
    const current = this.inventory.find(t=>t.id===slot.id);
    if (!current || current.availablePlayers < request.players) return {status:'failed',reason:'Slot no longer available'};
    current.availablePlayers -= request.players;
    const result={status:'confirmed_simulation',confirmation:'DEMO-'+randomUUID().slice(0,8),course:current.course,date:current.date,time:current.time,players:request.players};
    this.reservations.set(idempotencyKey,result);
    return result;
  }
}
export async function attemptBooking(request, provider, key=randomUUID()) {
  const available=await provider.listAvailable();
  const slot=selectTeeTime(request,available);
  if(!slot) return {status:'no_match'};
  return provider.reserve(slot,request,key);
}
// Run a demo using: node test-engine.mjs
if (process.argv[1]?.endsWith('/test-engine.mjs')) {
  const request={courses:['Wilson Golf Course','Harding Golf Course'],date:'2026-10-24',players:4,start:'07:00',end:'10:00',maxPricePerPlayer:85};
  const provider=new MockProvider([
    {id:'1',course:'Wilson Golf Course',date:'2026-10-24',time:'07:40',availablePlayers:4,pricePerPlayer:78},
    {id:'2',course:'Harding Golf Course',date:'2026-10-24',time:'08:10',availablePlayers:4,pricePerPlayer:70},
    {id:'3',course:'Wilson Golf Course',date:'2026-10-24',time:'06:50',availablePlayers:4,pricePerPlayer:60}
  ]);
  assert.equal(releaseDate('2026-10-24',9),'2026-10-15');
  const result=await attemptBooking(request,provider,'demo-1');
  assert.equal(result.status,'confirmed_simulation');
  assert.equal(result.time,'07:40');
  assert.deepEqual(await attemptBooking(request,provider,'demo-1'),result);
  assert.equal((await attemptBooking({...request,maxPricePerPlayer:10},provider)).status,'no_match');
  console.log(JSON.stringify({releaseDate:releaseDate(request.date,9),releaseTime:'06:00 America/Los_Angeles',result,tests:'passed'},null,2));
}
