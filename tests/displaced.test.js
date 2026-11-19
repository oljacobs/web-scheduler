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

// #302: only the unit NAME carries the print colour, not the whole card.
test("print card tints only the unit name, with the group word beside it", () => {
  const run = setup();
  const html = run(`
    const u = unitById("E1"); u.printCategoryEffective = "suppression";
    printUnitCard(u, DATE)`);
  assert.match(html, /<section class="print-unit">/, "section carries no category class");
  assert.match(html, /<span class="print-unit-name print-cat-suppression">Engine 1<\/span>/);
  assert.match(html, /print-cat-tag">Suppression</, "group word printed for B&W copies");
});

test("maintenance notices are not scheduler activity", () => {
  const run = setup();
  assert.equal(run(`isSchedulerNotification({ relatedKind: "maintenance_closed" })`), false);
  assert.equal(run(`isSchedulerNotification({ relatedKind: "maintenance" })`), false);
  assert.equal(run(`isSchedulerNotification({ relatedKind: "trade" })`), true);
  assert.equal(run(`isSchedulerNotification({})`), true);
});

// Move button: any open, qualified seat on the day's schedule, not just this unit.
test("move targets include open qualified seats on OTHER units, never filled or unqualified ones", () => {
  const run = setup();
  const res = JSON.parse(run(`
    const P = { ...DUTY[0], certs: ["emt"] };               // EMT only
    state.assignments[DATE].E1 = [{ ...P, _seat: "FF1" }];
    state.assignments[DATE].E3 = [{ ...DUTY[1], _seat: "FF1" }];   // filled seat on E3
    const person = state.assignments[DATE].E1[0];
    const t = seatMoveTargets(person, unitById("E1"), DATE, "FF1");
    JSON.stringify({
      units: [...new Set(t.map(x => x.unit.id))].sort(),
      e3HasFilledSeat: t.some(x => x.unit.id === "E3" && x.pos.role === "FF1"),
      e3HasOpenFF: t.some(x => x.unit.id === "E3" && x.pos.role === "FF2"),
      allQualified: t.every(x => seatAccepts(x.pos, resolvePerson(person))),
      onlyRunningUnits: t.every(x => unitsForDate(DATE).some(u => u.id === x.unit.id)),
      sameUnitExcludesCurrentSeat: !t.some(x => x.unit.id === "E1" && x.pos.role === "FF1"),
    })`));
  assert.ok(res.units.includes("E3") && res.units.length > 1, "offers other units");
  assert.equal(res.e3HasFilledSeat, false);
  assert.equal(res.e3HasOpenFF, true);
  assert.equal(res.allQualified, true);
  assert.equal(res.onlyRunningUnits, true);
  assert.equal(res.sameUnitExcludesCurrentSeat, true);
});

test("an EMT-only member is not offered a paramedic-only seat", () => {
  const run = setup();
  assert.equal(run(`
    const P = { ...DUTY[0], certs: ["emt"] };
    state.assignments[DATE].E1 = [{ ...P, _seat: "FF1" }];
    const t = seatMoveTargets(state.assignments[DATE].E1[0], unitById("E1"), DATE, "FF1");
    t.some(x => !seatAccepts(x.pos, resolvePerson(state.assignments[DATE].E1[0])))`), false);
});

test("applySeatMove takes the block off the old unit and seats it on the new one", () => {
  const run = setup();
  const res = JSON.parse(run(`
    state.assignments[DATE].E1 = [{ ...DUTY[0], _seat: "FF1" }];
    const person = state.assignments[DATE].E1[0];
    const t = seatMoveTargets(person, unitById("E1"), DATE, "FF1")
      .find(x => x.unit.id === "E3" && x.pos.role === "FF2");
    const ok = applySeatMove({ date: DATE, unitId: "E1", personId: person.id, startMinute: 0, target: t });
    const onE3 = state.assignments[DATE].E3.find(p => p.id === person.id);
    JSON.stringify({ ok, e1: state.assignments[DATE].E1.length, seat: onE3 && onE3._seat,
      fullTour: onE3 && onE3._start === undefined, manual: onE3 && onE3._src })`));
  assert.deepEqual(res, { ok: true, e1: 0, seat: "FF2", fullTour: true, manual: "manual" });
});

test("a member committed on another unit in that window is not offered a clashing seat", () => {
  const run = setup();
  assert.equal(run(`
    // Partial block on E1 (first 4h), and a second block on L1 covering the same hours
    state.assignments[DATE].E1 = [{ ...DUTY[0], _seat: "FF1", _start: 0, _end: 240 }];
    state.assignments[DATE].L1 = [{ ...DUTY[0], _seat: "FF1", _start: 0, _end: 240 }];
    const t = seatMoveTargets(state.assignments[DATE].E1[0], unitById("E1"), DATE, "FF1");
    t.some(x => x.unit.id === "E3")`), false);
});
