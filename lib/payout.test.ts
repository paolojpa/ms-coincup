import { test } from "node:test";
import assert from "node:assert/strict";
import { computePayouts, DEFAULT_TIERS, parseCsv, splitCoins } from "./payout.ts";

const head = "Placement,Points,Wins,Kills,Discord ID Player 1,Discord Mention 1,Epic Name Player 1,Discord ID Player 2,Discord Mention 2,Epic Name Player 2,Discord ID Player 3,Discord Mention 3,Epic Name Player 3";
const id = (n: number) => `1000000000000000${String(n).padStart(2, "0")}`;
const row = (place: number, pts: number, a: number, b: number, c: number) =>
  `${place},${pts},0,1,${id(a)},<@${id(a)}>,EpicA${a},,<@${id(b)}>,EpicB${b},,,"Epic, ${c}"`;

test("parseCsv handles quotes and BOM", () => {
  const rows = parseCsv('﻿a,b\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [{ a: "x, y", b: 'he said "hi"' }]);
});

test("split is exact and divides by team size", () => {
  assert.deepEqual(splitCoins(150000, 3, 3), [50000, 50000, 50000]);
  assert.deepEqual(splitCoins(17500, 3, 3), [5834, 5833, 5833]);
  assert.deepEqual(splitCoins(30000, 3, 2), [10000, 10000]);
});

test("sum mode adds points across files and ranks", () => {
  const f1 = [head, row(1, 50, 1, 2, 3), row(2, 40, 4, 5, 6)].join("\n");
  const f2 = [head, row(1, 30, 4, 5, 6), row(2, 5, 1, 2, 3)].join("\n");
  const [p] = computePayouts([{ name: "a", text: f1 }, { name: "b", text: f2 }], DEFAULT_TIERS, "sum");
  assert.equal(p.teamSize, 3);
  assert.equal(p.teams.length, 2);
  assert.equal(p.teams[0].points, 70);
  assert.equal(p.teams[0].coins, 150000);
  assert.equal(p.teams[1].points, 55);
  assert.equal(p.teams[0].members[2].discordId, null);
  assert.equal(p.teams[0].members[2].epicName, "Epic, 6");
});

test("separate mode pays each file by placement", () => {
  const f1 = [head, row(1, 50, 1, 2, 3), row(2, 40, 4, 5, 6)].join("\n");
  const out = computePayouts([{ name: "a", text: f1 }, { name: "b", text: f1 }], DEFAULT_TIERS, "separate");
  assert.equal(out.length, 2);
  assert.equal(out[1].teams[1].coins, 100000);
});
