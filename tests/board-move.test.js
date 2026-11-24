// Day board drag / tap-to-move / swap (design review phase 2). Run: node --test tests/
// Loads app.js into a stubbed browser context -- no DOM, no network, no API.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const noop = () => {};
  const el = new Proxy(function () {}, { get: () => el, apply: () => el });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: noop, URLSearchParams, Intl, Date, Map, Set, JSON,
    document: { addEventListener: noop, getElementById: () => null, querySelectorAll: () => [],
      querySelector: () => null, createElement: () => el, body: el, readyState: "loading" },
    window: { APP_CONFIG: { schedulerApiUrl: "" }, addEventListener: noop, location: { origin: "http://x" }, alert: noop, confirm: () => true },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: {}, fetch: () => Promise.reject(new Error("no network in tests")),
  };
  ctx.window.document = ctx.document;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), ctx);
  return ctx;
}

// Engine 1, Medic 1, Medic 2 on one B-shift date with hand-picked crews.
function setup() {
  const ctx = load();
  const run = (code) => vm.runInContext(code, ctx);
  run(`
    var DATE = "2026-11-18";
    var SHIFT = getShiftForDate(DATE);
    const P = (id, name, title, certs) => ({ id, name, title, shift: SHIFT, certs, rideUp: [], status: "active" });
    state.employees = [
      P("cap", "Cap Officer", "Captain", ["officer", "emt"]),
      P("eng", "Eng Driver", "Engineer", ["engineer", "emt"]),
      P("medA", "Medic A", "FF/EMTP", ["paramedic", "emt"]),
      P("emtA", "Emt A", "FF/EMT", ["emt"]),
      P("medB", "Medic B", "FF/EMTP", ["paramedic", "emt"]),
      P("dualB", "Dual B", "FF/EMTP", ["paramedic", "emt"]),
      P("spare", "Spare Medic", "FF/EMTP", ["paramedic", "emt"]),
      P("spareEmt", "Spare Emt", "FF/EMT", ["emt"]),
    ];
    const U = (id, name, type, sortOrder) => ({ id, name, type, visible: true, sortOrder, minStaff: 2 });
    state.units = [U("E1", "Engine 1", "Engine", 1), U("M1", "Medic 1", "Medic", 2), U("M2", "Medic 2", "Medic", 3)];
    const A = (id, seat, extra) => ({ ...state.employees.find((e) => e.id === id), _seat: seat, ...(extra || {}) });
    state.assignments = { [DATE]: {
      E1: [A("cap", "Officer"), A("eng", "Engineer")],
      M1: [A("medA", "EMTP"), A("emtA", "EMT")],
      M2: [A("medB", "EMTP"), A("dualB", "EMT")],
    } };
    state.currentRole = "supervisor"; state.isAuthenticated = true;
    render = () => {}; persistAppState = () => {}; showToast = () => {};
    var seatSrc = (unitId, personId, role) => ({ kind: "seat", date: DATE, unitId, personId, startMinute: 0, role });
    var crew = (unitId) => getAssignments(DATE, unitId).map((p) => p.id + ":" + p._seat).sort().join(",");
  `);
  return run;
}

test("a paramedic can swap only with someone qualified for the paramedic seat", () => {
  const run = setup();
  // Medic A (EMTP on M1) -> M2's EMT seat holds Dual B, who is a paramedic: swap offered.
  assert.equal(run(`boardMoveTargets(seatSrc("M1", "medA", "EMTP")).get("M2|EMT")?.action`), "swap");
  // M1's own EMT seat holds Emt A, who cannot take the EMTP seat: no swap.
  assert.equal(run(`boardMoveTargets(seatSrc("M1", "medA", "EMTP")).has("M1|EMT")`), false);
  // An engine officer seat never accepts a paramedic without officer capability.
  assert.equal(run(`boardMoveTargets(seatSrc("M1", "medA", "EMTP")).has("E1|Officer")`), false);
});

test("an open optional seat is offered as a place, not a swap", () => {
  const run = setup();
  assert.equal(run(`boardMoveTargets(seatSrc("M1", "emtA", "EMT")).get("E1|FF1")?.action`), "place");
});

test("a cross-unit swap moves each person to the other's unit and seat in one change", () => {
  const run = setup();
  const message = run(`
    const src = seatSrc("M1", "medA", "EMTP");
    performBoardMove(src, boardMoveTargets(src).get("M2|EMT"));`);
  assert.match(message, /Medic A and Dual B swapped/);
  assert.equal(run(`crew("M1")`), "dualB:EMTP,emtA:EMT");
  assert.equal(run(`crew("M2")`), "medA:EMT,medB:EMTP");
  // Nobody was duplicated or lost.
  assert.equal(run(`Object.values(state.assignments[DATE]).flat().length`), 6);
});

test("a same-unit swap only exchanges the seat pins", () => {
  const run = setup();
  run(`state.assignments[DATE].M2 = [{ ...employeeById("medB"), _seat: "EMTP" }, { ...employeeById("dualB"), _seat: "EMT" }];`);
  run(`const src = seatSrc("M2", "medB", "EMTP"); performBoardMove(src, boardMoveTargets(src).get("M2|EMT"));`);
  assert.equal(run(`crew("M2")`), "dualB:EMTP,medB:EMT");
});

test("a moved seat keeps the person pinned to the chosen seat", () => {
  const run = setup();
  run(`const src = seatSrc("M1", "emtA", "EMT"); performBoardMove(src, boardMoveTargets(src).get("E1|FF1"));`);
  assert.equal(run(`crew("E1")`), "cap:Officer,emtA:FF1,eng:Engineer");
  assert.equal(run(`crew("M1")`), "medA:EMTP");
});

test("a bench member is offered only open seats they qualify for, and lands pinned", () => {
  const run = setup();
  run(`state.assignments[DATE].M2 = [{ ...employeeById("dualB"), _seat: "EMT" }];`);  // M2 EMTP now open
  const targets = run(`[...boardMoveTargets({ kind: "bench", date: DATE, employeeId: "spareEmt", fromUnitId: "" }).keys()].sort().join()`);
  assert.equal(targets.includes("M2|EMTP"), false);   // EMT-only cannot take the paramedic seat
  assert.equal(targets.includes("E1|FF1"), true);
  run(`const src = { kind: "bench", date: DATE, employeeId: "spare", fromUnitId: "" };
       performBoardMove(src, boardMoveTargets(src).get("M2|EMTP"));`);
  assert.equal(run(`crew("M2")`), "dualB:EMT,spare:EMTP");
});

test("a split (partial) block is never offered a swap", () => {
  const run = setup();
  run(`state.assignments[DATE].M1 = [{ ...employeeById("medA"), _seat: "EMTP", _start: 0, _end: 720 }, { ...employeeById("emtA"), _seat: "EMT" }];`);
  const actions = run(`[...boardMoveTargets(seatSrc("M1", "medA", "EMTP")).values()].map((t) => t.action).join()`);
  assert.equal(actions.includes("swap"), false);
});
