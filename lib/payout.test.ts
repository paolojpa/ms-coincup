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

test("one file pays by the Placement column (with Score, without points, wins/kills out of order)", () => {
  // Como o CSV do Yunite: os pontos vêm em "Score", que não manda na colocação de um arquivo só.
  const h = "Placement,Games,Wins,Kills,Score,Discord ID Player 1,Discord ID Player 2,Discord ID Player 3";
  const r = (place: number, wins: number, kills: number, a: number) => `${place},5,${wins},${kills},${300 - place},${id(a)},${id(a + 1)},${id(a + 2)}`;
  const csv = [h, r(1, 0, 2, 1), r(2, 0, 1, 4), r(5, 4, 53, 7), r(9, 0, 0, 10), r(15, 3, 53, 13), r(15, 1, 24, 16)].join("\n");
  const [p] = computePayouts([{ name: "cup.csv", text: csv }], DEFAULT_TIERS, "sum");
  assert.deepEqual(p.teams.map((t) => [t.place, t.coins]), [[1, 150000], [2, 100000], [5, 50000], [9, 30000], [15, 17500], [15, 17500]]);
  assert.equal(p.teams[0].members[0].discordId, id(1));
  assert.equal(p.teams[0].points, 299);
  const noPoints = computePayouts([{ name: "x.csv", text: csv.replace("Score", "Other") }], DEFAULT_TIERS, "sum")[0];
  assert.deepEqual(noPoints.teams.map((t) => t.place), [1, 2, 5, 9, 15, 15]);
  assert.ok(noPoints.warnings.some((w) => w.includes('no "Points" column')));
});

test("one file: rows keep their own order and a repeated player is flagged", () => {
  const csv = [head, row(1, 10, 1, 2, 3), row(2, 50, 4, 5, 6), row(3, 99, 1, 7, 8)].join("\n");
  const [p] = computePayouts([{ name: "cup.csv", text: csv }], DEFAULT_TIERS, "sum");
  assert.deepEqual(p.teams.map((t) => t.place), [1, 2, 3]);
  assert.equal(p.teams[0].coins, 150000);
  assert.ok(p.warnings.some((w) => w.includes(`discord:${id(1)} appears in 2 different teams`)));
});
