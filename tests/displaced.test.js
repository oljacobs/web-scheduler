// #300 displaced / unassigned members. Run: node --test tests/
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
    console, setTimeout, clearTimeout, setInterval: noop, URLSearchParams, Intl, Date, Map, Set,
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

function setup() {
  const ctx = load();
  const run = (code) => vm.runInContext(code, ctx);
  run(`state.employees = []; seedEmployees(); state.units = defaultUnits();
       state.currentRole = "supervisor"; state.isAuthenticated = true;
       var DATE = "2026-11-18"; // B shift on duty
       var DUTY = state.employees.filter(e => e.shift === getShiftForDate(DATE)).slice(0, 12);
       state.assignments = { [DATE]: {} };
       render = () => {}; persistAppState = () => {}; showToast = () => {};`);
  return run;
}

test("member left on an out-of-service unit is listed as displaced, never invisible", () => {
  const run = setup();
  run(`
    unitById("E2").visible = false;
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    state.assignments[DATE].E2 = [{ ...DUTY[2] }, { ...DUTY[3] }];`);
  const ids = run(`displacedForDate(DATE).filter(d => d.kind === "stranded").map(d => d.person.id).sort().join()`);
  const expected = run(`[DUTY[2].id, DUTY[3].id].sort().join()`);
  assert.equal(ids, expected);
});

test("a member seated on a shown unit is not displaced", () => {
  const run = setup();
  assert.equal(run(`
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    displacedForDate(DATE).some(d => d.person.id === DUTY[0].id)`), false);
});

test("PTO / absent member on a hidden unit is not displacement", () => {
  const run = setup();
  assert.equal(run(`
    unitById("E2").visible = false;
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    state.assignments[DATE].E2 = [{ ...DUTY[2], _off: "PTO" }];
    displacedForDate(DATE).some(d => d.person.id === DUTY[2].id)`), false);
});

test("on-duty member with no seat is listed only once the board has crew", () => {
  const run = setup();
  assert.equal(run(`displacedForDate(DATE).length`), 0, "empty day lists nobody");
  assert.equal(run(`
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    displacedForDate(DATE).some(d => d.kind === "unassigned" && d.person.id === DUTY[1].id)`), true);
});

test("moving a displaced member places them on an in-service unit and clears the warning", () => {
  const run = setup();
  const res = JSON.parse(run(`
    unitById("E2").visible = false;
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    state.assignments[DATE].E2 = [{ ...DUTY[2], _seat: "Officer" }];
    const ok = moveDisplacedPerson({ date: DATE, employeeId: DUTY[2].id, fromUnitId: "E2", toUnitId: "E1" });
    JSON.stringify({ ok,
      onE1: state.assignments[DATE].E1.some(p => p.id === DUTY[2].id),
      seatPinDropped: state.assignments[DATE].E1.find(p => p.id === DUTY[2].id)._seat === undefined,
      onE2: state.assignments[DATE].E2.length,
      stillDisplaced: displacedForDate(DATE).some(d => d.person.id === DUTY[2].id) })`));
  assert.deepEqual(res, { ok: true, onE1: true, seatPinDropped: true, onE2: 0, stillDisplaced: false });
});

test("move is refused when the member is already booked elsewhere at that time", () => {
  const run = setup();
  assert.equal(run(`
    unitById("E2").visible = false;
    state.assignments[DATE].E1 = [{ ...DUTY[0] }];
    state.assignments[DATE].E2 = [{ ...DUTY[2] }];
    state.assignments[DATE].L1 = [{ ...DUTY[2] }];   // also on a shown unit
    window.alert = () => {};
    moveDisplacedPerson({ date: DATE, employeeId: DUTY[2].id, fromUnitId: "E2", toUnitId: "E1" })`), false);
});
