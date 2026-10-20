// Runs the calculation engine embedded in index.html against the notebook data.
// Usage: node --test ~/garba-split/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)?.[1];
const ctx = {};
vm.runInNewContext(`${src}\nthis.E = GarbaEngine; this.SEED = SEED_DATA;`, ctx);
const { E, SEED } = ctx;

const netOf = (state) => Object.fromEntries(E.balances(state).map(b => [b.name, b.net / 100]));

test('shares of a split always add up to the bill, to the paisa', () => {
  const ex = { split: 'total', amount: 16000, shares: [{ p: 'a', u: 1 }, { p: 'b', u: 1 }, { p: 'c', u: 1 }, { p: 'd', u: 1 }, { p: 'e', u: 1 }, { p: 'f', u: 1 }] };
  const s = E.sharesOf(ex);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), 16000);
});

test('per-person split honours units (x2 = two people)', () => {
  const s = E.sharesOf({ split: 'each', amount: 6700, shares: [{ p: 'a', u: 3 }, { p: 'b', u: 1 }] });
  assert.equal(s.a, 20100);
  assert.equal(s.b, 6700);
});

test('notebook totals per person match the handwritten totals', () => {
  const byDay = (d) => E.consumedBy(SEED, (ex) => ex.day === d);
  const n = (state, map) => Object.fromEntries(Object.entries(map).map(([id, v]) => [state.people.find(p => p.id === id).name, v / 100]));
  // Day 1, paid by Ajendra (Kinshu: notebook says 20, items add to 18)
  assert.deepEqual(n(SEED, byDay(1)), { Kush: 91, Modi: 143, Rushabh: 161, 'Param R': 91, Ajendra: 66, Vishesh: 118, Kinshu: 18 });
  // Day 6, paid by Ajendra: 163/163/163+134/163/128/228/228/128/134
  const d6 = n(SEED, byDay(6));
  assert.deepEqual(d6, { Ajendra: 297, 'Param R': 297, Tanvi: 163, Kinshu: 163, Mann: 128, Juhi: 228, Vandan: 228, Modi: 128 });
});

test('Prince bill paid by Param S matches the notebook per-person list', () => {
  const m = E.consumedBy(SEED, (ex) => ex.payer === 'paramS' && ex.day === 4);
  const name = (id) => SEED.people.find(p => p.id === id).name;
  const got = Object.fromEntries(Object.entries(m).map(([k, v]) => [name(k), v / 100]));
  assert.deepEqual(got, { Kush: 87, Ajendra: 107, 'Param R': 107, Prathmesh: 139, Kshitish: 207, 'Param S': 119 });
});

test('net balances for the whole trip', () => {
  const net = netOf(SEED);
  const expect = { Ajendra: 1858.33, 'Param S': 580.33, Prathmesh: -5.67, Modi: -122.67, Kush: -229.67, 'Param R': -586.67,
    Rushabh: -161, Vishesh: -118, Kinshu: -221, Kshitish: -247, Tanvi: -163, Mann: -128, Juhi: -228, Vandan: -228 };
  for (const [k, v] of Object.entries(expect)) assert.ok(Math.abs(net[k] - v) < 0.02, `${k}: got ${net[k]}, want ${v}`);
  const total = Object.values(net).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total) < 0.001, 'balances must sum to zero');
});

test('simplified settlement clears every balance in whole rupees', () => {
  const bal = E.balances(SEED);
  const tx = E.simplify(bal);
  const rounded = E.roundNets(bal);
  const after = Object.fromEntries(rounded.map(b => [b.id, b.net]));
  for (const t of tx) {
    assert.ok(Number.isInteger(t.amount / 100) && t.amount > 0, 'whole-rupee, positive transfers');
    after[t.from] += t.amount;
    after[t.to] -= t.amount;
  }
  assert.ok(Object.values(after).every(v => v === 0), 'everyone ends at zero');
  const nonZero = rounded.filter(b => b.net !== 0).length;
  assert.ok(tx.length <= nonZero - 1, `at most n-1 transfers, got ${tx.length}`);
});

test('recording a payment reduces what is still owed', () => {
  const before = E.simplify(E.balances(SEED));
  const first = before[0];
  const paidState = { ...SEED, payments: [{ id: 't', from: first.from, to: first.to, amount: first.amount }] };
  const after = E.simplify(E.balances(paidState));
  const owedBefore = before.reduce((a, t) => a + t.amount, 0);
  const owedAfter = after.reduce((a, t) => a + t.amount, 0);
  assert.equal(owedAfter, owedBefore - first.amount);
});

test('direct mode nets each pair once', () => {
  const tx = E.direct(SEED);
  const pairs = new Set(tx.map(t => [t.from, t.to].sort().join('|')));
  assert.equal(pairs.size, tx.length);
  // Prathmesh owes Param S 139 for Prince, Param S owes Prathmesh 26.67 for water -> 112.33
  const p = tx.find(t => t.from === 'prathmesh' && t.to === 'paramS');
  assert.ok(p && Math.abs(p.amount - 11233) <= 1, `got ${p && p.amount}`);
});

test('excluded expenses do not count', () => {
  const state = { ...SEED, expenses: SEED.expenses.map(e => ({ ...e, include: false })) };
  assert.ok(E.balances(state).every(b => b.net === 0));
});
