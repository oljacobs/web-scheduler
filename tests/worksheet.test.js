// Daily worksheet rows (design review phase 4). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
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
  const run = (code) => vm.runInContext(code, ctx);
  run(`
    var DATE = "2026-11-18";
    var SHIFT = getShiftForDate(DATE);
    const P = (id, name, certs) => ({ id, name, title: "FF", shift: SHIFT, certs, rideUp: [], status: "active" });
    state.employees = [P("med", "Medic One", ["paramedic", "emt"]), P("emt", "Emt One", ["emt"]),
                       P("pto", "Pto Person", ["emt"]), P("cap", "Cap One", ["officer", "emt"])];
    state.units = [
      { id: "M115", name: "Medic 115", type: "Medic", visible: true, sortOrder: 2, minStaff: 2 },
      { id: "E116", name: "Engine 116", type: "Engine", visible: true, sortOrder: 3, minStaff: 2 },
    ];
    state.assignments = { [DATE]: {
      M115: [{ ...state.employees[0], _seat: "EMTP", _pay: "OT" }, { ...state.employees[2], _off: "PTO" }],
      E116: [{ ...state.employees[3], _seat: "Officer" }],
    } };
    state.currentRole = "supervisor"; state.isAuthenticated = true;
  `);
  return run;
}

test("worksheet lists assigned blocks, open required seats and people off, grouped by station", () => {
  const run = setup();
  const rows = JSON.parse(run(`JSON.stringify(worksheetRowsForDate(DATE).map((r) => [r.station, r.unit.id, r.kind, r.pos.label, r.person ? r.person.id : null]))`));
  assert.deepEqual(rows.map((r) => r[0]), ["115", "115", "115", "116", "116"]);
  assert.deepEqual(rows.filter((r) => r[1] === "M115").map((r) => r[2] + ":" + (r[4] || r[3])),
    ["assigned:med", "open:EMT", "off:pto"]);
  // Engine 116: officer seated, engineer required and empty -> an Open row.
  assert.deepEqual(rows.filter((r) => r[1] === "E116").map((r) => r[2] + ":" + r[3]), ["assigned:Officer", "open:Engineer"]);
});

test("an open row covers the whole tour, so its hours are the tour length", () => {
  const run = setup();
  assert.equal(run(`const r = worksheetRowsForDate(DATE).find((x) => x.kind === "open" && x.unit.id === "E116"); (r.block.end - r.block.start) / 60`), 24);
});

test("the worksheet table renders hours and totals", () => {
  const run = setup();
  const html = run(`renderWorksheet(DATE)`);
  assert.match(html, /<strong>2<\/strong> on duty · <strong>48<\/strong> hours/);
  assert.match(html, /2 open/);
  assert.match(html, /1 off this tour/);
});
