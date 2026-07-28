const state = {
  currentUserId: null,
  currentUserDisplayName: null,
  currentUserTitle: null,
  currentUserEmail: null,
  currentUserEntraId: null,
  loginRole: "employee",
  currentRole: "employee",
  isAuthenticated: false,
  currentView: "day",
  currentDate: todayIso(),
  scheduleStatus: "draft",
  units: [],
  staffingTemplates: [],
  mandatoryBackfill: [],
  mandatoryImportPreview: null,
  employees: [],
  trades: [],
  overtimePosts: [],
  notifications: [],
  auditLog: [],
  importPreview: null,
  unitImportPreview: null,
  rosterImportPreview: null,
  assignments: {},
  activeSurface: "schedule",
  activeAdminTab: "employees",
  employeeFilter: { search: "", shift: "all", status: "active", sort: "name" },
  selectedEmployeeId: null,
  employeeDraft: null,
  persistence: {
    backend: "browser-memory",
    status: "Loading data source…",
    hasRemote: false,
    isSaving: false,
    lastSavedAt: null,
  },
};

// Anchor date for seeding assignment data
const baseDate = "2026-04-13";
// Continuous 48-hour rotation: A → B → C → A → B → C …  (no off days between shifts)
// A: 4/13–4/14, B: 4/15–4/16, C: 4/17–4/18, then repeats
const ROTATION_BASE_DATE = "2026-04-13";
const rotationPattern = ["A", "A", "B", "B", "C", "C"];
// Bump key so old AA/BB/CC data doesn't load and break the renamed shifts
const LOCAL_STORAGE_KEY = "d7fr-scheduler-state-v3";
const REMOTE_STATE_ID = "primary";

const firstNames = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Dakota", "Avery", "Parker", "Riley", "Cameron",
  "Quinn", "Hayden", "Reese", "Logan", "Harper", "Rowan", "Skyler", "Mason", "Peyton", "Blake",
];
const lastNames = [
  "Adams", "Brooks", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hayes", "Irwin", "Jensen",
  "Keller", "Lawson", "Morris", "Norris", "Owens", "Price", "Ramirez", "Stewart", "Turner", "Ward",
];

const employeeRoles = ["paramedic", "emt", "engineer", "officer"];
// Medical LICENSES are held by the person, not granted by rank. The roster
// spreadsheet only knows rank, so a re-import must never strip a license that
// was granted in-app (e.g. an Engineer who is also a paramedic).
const LICENSE_CAPABILITIES = ["paramedic", "emt"];
const unitTypes = ["Engine", "Ladder", "Medic", "Batt", "MOF", "Tender", "Brush", "Rescue"];
const employeeTitleOptions = ["Batt. Chief", "Div. Chief", "Captain", "Lieutenant", "Engineer", "MOF", "FF/EMTP", "FF/EMT"];

// Titles that grant supervisor access in this app
const SUPERVISOR_TITLES = ["Batt. Chief", "Div. Chief", "Captain", "Lieutenant", "MOF"];

// Seat requirements by unit type. Each seat needs a CAPABILITY (cap), not a raw
// rank — a person qualifies if their capabilities (rank-derived certs + any
// ride-up grants) include it. cap: null = any qualified rider. Most-restrictive
// seats are listed first so the greedy matcher reserves the best candidate.
//   Capabilities: "officer", "engineer", "paramedic", "emt".
//   cap can be an array to accept any one of several (e.g. Batt ICT).
//   required: false = optional rider seat (doesn't count toward minimum staffing).
const UNIT_POSITION_REQUIREMENTS = {
  Batt: [
    { role: "BC",  label: "BC Position",  cap: "officer" },
    { role: "ICT", label: "ICT Position", cap: ["officer", "engineer"] },
  ],
  Ladder: [
    { role: "Driver",  label: "Driver/Engineer", cap: "engineer" },
    { role: "Officer", label: "Officer Seat",    cap: "officer" },
    { role: "FF1",     label: "FF 1",            cap: null },
    { role: "FF2",     label: "FF 2",            cap: null },
  ],
  Medic: [
    { role: "EMTP", label: "Paramedic", cap: "paramedic" },  // license-only, no ride-up
    { role: "EMT",  label: "EMT",       cap: "emt" },
  ],
  MOF: [
    { role: "MOF", label: "MOF", cap: "officer" },
  ],
  // Engine: 2 required seats (Officer + Engineer), then up to 3 optional riders
  // of any rank -- minimum 2 filled, staff up to 5.
  Engine: [
    { role: "Officer",  label: "Officer",       cap: "officer" },
    { role: "Engineer", label: "Engineer",      cap: "engineer" },
    { role: "FF1",      label: "Firefighter 1", cap: null, required: false },
    { role: "FF2",      label: "Firefighter 2", cap: null, required: false },
    { role: "FF3",      label: "Firefighter 3", cap: null, required: false },
  ],
  Rescue: [
    { role: "Driver",  label: "Driver/Engineer", cap: "engineer" },
    { role: "Officer", label: "Officer",          cap: "officer" },
  ],
  Tender: [
    { role: "Driver", label: "Driver", cap: "engineer" },
  ],
  Brush: [
    { role: "Driver",  label: "Driver",  cap: null },       // any firefighter may drive brush
    { role: "Officer", label: "Officer", cap: "officer" },
  ],
};

// Readable names for capabilities, used in staffing-alert messages.
const CAPABILITY_LABELS = { officer: "officer", engineer: "driver/engineer", paramedic: "paramedic", emt: "EMT" };
// Which capabilities can be granted as ride-up (medical licenses cannot).
const RIDE_UP_CAPABILITIES = ["officer", "engineer"];

let msalInstance = null;
const GRAPH_SCOPES = ["User.Read", "User.ReadBasic.All"];

const dom = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  wireEvents();
  await hydrateAppState();
  await initMsal(); // attempt silent re-login from cached session
  initializeControls();
  render();
});

function cacheDom() {
  const ids = [
    "ms-sign-in-btn", "sign-out-btn", "auth-message", "auth-role-badge",
    "auth-signed-out", "auth-signed-in", "auth-user-name", "auth-user-title", "auth-user-initials",
    "date-input",
    "prev-btn", "today-btn", "next-btn", "schedule-status", "publish-btn", "summary-grid", "alert-strip",
    "schedule-container", "schedule-title", "schedule-subtitle", "save-indicator", "trade-owner",
    "trade-partner", "trade-date", "trade-notes", "submit-trade-btn",
    "unit-toggle-list", "notification-center",
    "approval-queue", "audit-log", "print-btn", "notify-btn",
    // Employee import
    "import-file", "preview-import-btn", "apply-import-btn", "import-message", "import-preview",
    "download-employee-template-btn",
    // Unit import
    "unit-import-file", "unit-preview-import-btn", "unit-apply-import-btn", "unit-import-message",
    "unit-import-preview", "download-unit-template-btn",
    // D7FR roster import
    "roster-import-file", "roster-preview-btn", "roster-apply-btn",
    "roster-import-message", "roster-import-preview",
    // Roster filters
    "employee-search", "roster-shift-filter", "employee-status-filter", "roster-sort", "employee-roster", "employee-editor",
    "storage-status",
    // Shell chrome: top bar, collapsible sidebar, right-hand tool drawer
    "sidebar-toggle", "drawer-toggle", "drawer-close", "drawer-scrim",
    // Staffing templates
    "template-unit", "template-shift", "template-seats",
    "template-push-days", "template-push-btn", "template-push-summary",
    "export-audit-btn",
    "coverage-list", "coverage-summary", "coverage-days", "coverage-badge", "coverage-shift",
    // Mandatory backfill
    "mandatory-fy", "mandatory-platoon", "download-mandatory-btn", "mandatory-import-file",
    "mandatory-preview-btn", "mandatory-apply-btn", "mandatory-import-message",
    "mandatory-import-preview", "mandatory-summary",
    "tool-drawer", "drawer-badge", "reserve-panel",
    "surface-schedule-btn", "surface-admin-btn", "schedule-surface", "admin-surface",
  ];
  ids.forEach((id) => {
    dom[id] = document.getElementById(id);
  });
  dom.viewButtons = [...document.querySelectorAll(".view-button")];
  dom.mainContent = document.getElementById("main-content");
  dom.accessGate = document.getElementById("access-gate");
  dom.appShell = document.querySelector(".app-shell");
  dom.tabButtons = [...document.querySelectorAll(".tab-button[data-tab]")];
  dom.tabPanes = [...document.querySelectorAll(".tab-pane[data-tab-id]")];
  dom.surfaceButtons = {
    schedule: document.getElementById("surface-schedule-btn"),
    admin: document.getElementById("surface-admin-btn"),
  };
}

function wireEvents() {
  dom["ms-sign-in-btn"].addEventListener("click", handleMsalLogin);
  dom["sign-out-btn"].addEventListener("click", handleMsalSignOut);
  dom["date-input"].addEventListener("change", () => {
    state.currentDate = dom["date-input"].value;
    render();
  });
  dom["schedule-status"].addEventListener("change", () => {
    state.scheduleStatus = dom["schedule-status"].value;
    addAudit(`Schedule marked as ${state.scheduleStatus}.`, "System");
    render();
    persistAppState("Schedule status updated");
  });
  dom["publish-btn"].addEventListener("click", handlePublish);
  dom["prev-btn"].addEventListener("click", () => shiftDate(-1));
  dom["next-btn"].addEventListener("click", () => shiftDate(1));
  dom["today-btn"].addEventListener("click", () => {
    state.currentDate = todayIso();
    render();
  });
  dom["submit-trade-btn"].addEventListener("click", createTradeRequest);
  dom["print-btn"].addEventListener("click", () => window.print());
  dom["notify-btn"].addEventListener("click", createDailyDigest);

  // Employee import
  dom["preview-import-btn"].addEventListener("click", previewEmployeeImport);
  dom["apply-import-btn"].addEventListener("click", applyEmployeeImport);
  dom["download-employee-template-btn"].addEventListener("click", downloadEmployeeTemplate);

  // Unit import
  dom["unit-preview-import-btn"].addEventListener("click", previewUnitImport);
  dom["unit-apply-import-btn"].addEventListener("click", applyUnitImport);
  dom["download-unit-template-btn"].addEventListener("click", downloadUnitTemplate);

  attachShellChromeEvents();
  attachTemplateEvents();
  dom["export-audit-btn"]?.addEventListener("click", exportAuditLog);
  dom["coverage-days"]?.addEventListener("change", renderCoveragePanel);
  dom["download-mandatory-btn"]?.addEventListener("click", downloadMandatoryTemplate);
  dom["mandatory-fy"]?.addEventListener("change", renderMandatorySummary);
  dom["mandatory-platoon"]?.addEventListener("change", renderMandatorySummary);
  dom["mandatory-preview-btn"]?.addEventListener("click", handleMandatoryPreview);
  dom["mandatory-apply-btn"]?.addEventListener("click", applyMandatoryImport);
  dom["coverage-shift"]?.addEventListener("change", (e) => {
    state.coverageShift = e.target.value;
    renderCoveragePanel();
  });

  // D7FR roster import
  dom["roster-preview-btn"].addEventListener("click", previewRosterImport);
  dom["roster-apply-btn"].addEventListener("click", applyRosterImport);

  // Roster filters
  dom["employee-search"].addEventListener("input", () => {
    state.employeeFilter.search = dom["employee-search"].value;
    renderEmployeeRoster();
  });
  dom["roster-shift-filter"].addEventListener("change", () => {
    state.employeeFilter.shift = dom["roster-shift-filter"].value;
    renderEmployeeRoster();
  });
  dom["employee-status-filter"].addEventListener("change", () => {
    state.employeeFilter.status = dom["employee-status-filter"].value;
    renderEmployeeRoster();
  });
  dom["roster-sort"].addEventListener("change", () => {
    state.employeeFilter.sort = dom["roster-sort"].value;
    renderEmployeeRoster();
  });

  // View switcher
  dom.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      render();
    });
  });

  dom.surfaceButtons.schedule.addEventListener("click", () => {
    state.activeSurface = "schedule";
    renderSurfaceState();
    persistAppState("Workspace switched");
  });
  dom.surfaceButtons.admin.addEventListener("click", () => {
    if (!canAccessAdmin()) {
      showToast("Supervisor sign-in is required for admin tools.", "error");
      return;
    }
    state.activeSurface = "admin";
    renderSurfaceState();
    persistAppState("Workspace switched");
  });

  // Admin tabs
  dom.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeAdminTab = btn.dataset.tab;
      dom.tabButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === state.activeAdminTab));
      dom.tabPanes.forEach((pane) => pane.classList.toggle("hidden", pane.dataset.tabId !== state.activeAdminTab));
      persistAppState("Admin tab switched");
    });
  });
}

function initializeControls() {
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
  // Default to the fiscal year people are picking for: after Oct 1 that's the
  // current one, before it that's the one about to start.
  if (dom["mandatory-fy"] && !dom["mandatory-fy"].value) {
    dom["mandatory-fy"].value = String(planningFiscalYear());
  }
  dom["employee-search"].value = state.employeeFilter.search;
  dom["roster-shift-filter"].value = state.employeeFilter.shift;
  dom["employee-status-filter"].value = state.employeeFilter.status;
  dom["roster-sort"].value = state.employeeFilter.sort;
  // Restore active tab
  dom.tabButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === state.activeAdminTab));
  dom.tabPanes.forEach((pane) => pane.classList.toggle("hidden", pane.dataset.tabId !== state.activeAdminTab));
  populateTradeSelects();
  renderSurfaceState();
}

function seedEmployees() {
  const shiftAssignments = ["A", "B", "C"];
  const pins = ["1111", "2222", "3333", "4444", "5555", "6666"];
  const titles = employeeTitleOptions;

  for (let i = 0; i < 60; i += 1) {
    const first = firstNames[i % firstNames.length];
    const last = lastNames[(i * 3) % lastNames.length];
    const shift = shiftAssignments[i % shiftAssignments.length];
    const primaryCert = employeeRoles[i % employeeRoles.length];
    const secondaryCert = employeeRoles[(i + 1) % employeeRoles.length];
    const isSupervisor = primaryCert === "officer" || i % 14 === 0;

    state.employees.push({
      id: `EMP-${String(i + 1).padStart(3, "0")}`,
      name: `${first} ${last}`,
      shift,
      title: titles[i % titles.length],
      certs: Array.from(new Set([primaryCert, secondaryCert, "emt"])),
      pin: isSupervisor ? "9000" : pins[i % pins.length],
      email: `${first.toLowerCase()}.${last.toLowerCase()}@d7fr.org`,
      isSupervisor,
      status: "active",
    });
  }
}

function seedAssignments(preserveExisting = false) {
  // DEMO SCAFFOLDING ONLY. This invents 180 days of staffing by picking whoever
  // is on the matching platoon — it does NOT check seat capabilities. Running it
  // against the live department would fabricate assignments that look real and
  // then get persisted to Railway on the next save. Hard-off whenever the
  // Django API is the backend.
  if (usesSchedulerApi()) return;
  const existingAssignments = preserveExisting ? state.assignments || {} : {};
  state.assignments = existingAssignments;
  // Seed 180 days of assignments
  for (let offset = 0; offset < 180; offset += 1) {
    const date = addDays(baseDate, offset);
    const shift = getShiftForDate(date);
    const dayUnits = state.assignments[date] || {};

    visibleUnitsAll().forEach((unit, index) => {
      if (preserveExisting && Array.isArray(dayUnits[unit.id])) {
        return;
      }
      const eligible = state.employees.filter((employee) => employee.shift === shift);
      const assigned = [];
      const targetCount = unit.minStaff + ((index + offset) % 4 === 0 ? -1 : 0);

      eligible.forEach((employee) => {
        if (assigned.length >= Math.max(1, targetCount)) {
          return;
        }
        // In seed, avoid assigning the same employee to two units on the same day
        const alreadyAssigned = Object.values(dayUnits).flat().find((person) => person.id === employee.id);
        if (!alreadyAssigned) {
          assigned.push(employee);
        }
      });

      dayUnits[unit.id] = unitRunsOn(unit, date) ? assigned : [];
    });

    state.assignments[date] = dayUnits;
  }
}

function seedWorkflowData() {
  state.trades = [
    {
      id: "TR-1001",
      status: "pending",
      employeeId: "EMP-001",
      partnerId: "EMP-004",
      date: addDays(todayIso(), 4),
      notes: "Family event coverage request",
      type: "trade",
      createdBy: "Alex Adams",
    },
    {
      id: "TR-1002",
      status: "approved",
      employeeId: "EMP-008",
      partnerId: "EMP-011",
      date: addDays(todayIso(), 8),
      notes: "Mutual swap completed",
      type: "trade",
      createdBy: "Skyler Norris",
    },
  ];

  state.overtimePosts = [
    {
      id: "OT-2001",
      status: "open",
      unitId: "M2",
      date: addDays(todayIso(), 2),
      qualification: "paramedic",
      reportTime: "06:30",
      applicants: ["EMP-019", "EMP-032"],
    },
    {
      id: "OT-2002",
      status: "approved",
      unitId: "L1",
      date: addDays(todayIso(), 7),
      qualification: "engineer",
      reportTime: "06:30",
      approvedEmployeeId: "EMP-017",
      applicants: ["EMP-017"],
    },
  ];

  state.notifications = [
    createNotification("Email digest queued for on-duty personnel.", "email", "system"),
  ];

  state.auditLog = [
    createAuditEntry("Initial dataset loaded.", "System"),
    createAuditEntry("Schedule generated 180 days ahead.", "System"),
  ];
}

async function hydrateAppState() {
  // The Django API requires a signed-in user's token, so its data can only be
  // loaded AFTER sign-in (see loadRemoteStateAfterAuth, called from the MSAL
  // flow). At startup in API mode we therefore start from an EMPTY state and
  // show a sign-in prompt -- we deliberately do NOT load stale browser data
  // (which could later be saved over the server) and never write at startup.
  if (usesSchedulerApi()) {
    seedDefaultState();
    state.persistence.backend = "api";
    state.persistence.hasRemote = true;
    setPersistenceStatus("Sign in to load the schedule", "warning");
    return;
  }

  // --- Supabase mode (unchanged: anon key lets us load at startup) ---
  const remoteConfigured = hasRemotePersistence();
  let loaded = false;

  if (remoteConfigured) {
    state.persistence.backend = "supabase";
    state.persistence.hasRemote = true;
    try {
      const remoteState = await loadRemoteState();
      if (remoteState) {
        applyPersistedState(remoteState);
        loaded = true;
        setPersistenceStatus(`Connected to ${remoteLabel()}`, "ok");
      } else {
        seedDefaultState();
        await persistAppState("Initial remote seed");
        loaded = true;
        setPersistenceStatus(`${remoteLabel()} seeded with starter data`, "ok");
      }
    } catch (error) {
      console.error("Remote load failed", error);
      setPersistenceStatus(`${remoteLabel()} unavailable, using browser fallback`, "warning");
    }
  }

  if (!loaded) {
    const local = loadLocalState();
    if (local) {
      applyPersistedState(local);
      loaded = true;
      state.persistence.backend = "local-storage";
      setPersistenceStatus("Using saved browser data", "warning");
    }
  }

  if (!loaded) {
    seedDefaultState();
    saveLocalState();
    state.persistence.backend = remoteConfigured ? "supabase-fallback" : "local-storage";
    setPersistenceStatus(remoteConfigured ? "Using browser fallback data" : "Using browser-only data", "warning");
  }
}

// Load the real schedule from the Django API once we have an authenticated
// account. Called right BEFORE setAuthFromToken so the identity sync runs
// against the real roster. Safe: on failure it leaves state as-is and never
// writes, so it can't overwrite the server with empty data.
async function loadRemoteStateAfterAuth() {
  if (!usesSchedulerApi()) return;
  // In API mode the app starts EMPTY and fetches after sign-in. Without this
  // flag the board renders blank for a beat, which reads as "the schedule got
  // wiped" rather than "still loading".
  state.isLoadingRemote = true;
  render();
  try {
    const remoteState = await loadRemoteState();   // carries the bearer token now
    if (remoteState) {
      applyPersistedState(remoteState);
      state.persistence.backend = "api";
      state.persistence.hasRemote = true;
      setPersistenceStatus("Connected to server", "ok");
    }
  } catch (error) {
    console.error("Post-sign-in load failed", error);
    setPersistenceStatus("Server unavailable — try refreshing", "warning");
  } finally {
    state.isLoadingRemote = false;
  }
}

function seedDefaultState() {
  state.employees = [];
  state.units = [];
  state.trades = [];
  state.overtimePosts = [];
  state.notifications = [];
  state.auditLog = [];
  state.importPreview = null;
  state.unitImportPreview = null;
  state.activeSurface = "schedule";
  state.activeAdminTab = "employees";
  state.employeeFilter = { search: "", shift: "all", status: "active", sort: "name" };
  state.selectedEmployeeId = null;
  state.employeeDraft = null;
  state.assignments = {};
}

function defaultUnits() {
  return [
    { id: "E1",  name: "Engine 1",    type: "Engine",  minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "E2",  name: "Engine 2",    type: "Engine",  minStaff: 4, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "E3",  name: "Engine 3",    type: "Engine",  minStaff: 4, requiredCerts: ["paramedic"], shift: "C", visible: true  },
    { id: "L1",  name: "Ladder 1",    type: "Ladder",  minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "L2",  name: "Ladder 2",    type: "Ladder",  minStaff: 4, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "M1",  name: "Medic 1",     type: "Medic",   minStaff: 2, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "M2",  name: "Medic 2",     type: "Medic",   minStaff: 2, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "M3",  name: "Medic 3",     type: "Medic",   minStaff: 2, requiredCerts: ["paramedic"], shift: "C", visible: true  },
    { id: "BC1", name: "Battalion 1", type: "Batt",    minStaff: 2, requiredCerts: ["officer"],   shift: "A", visible: true  },
    { id: "BC2", name: "Battalion 2", type: "Batt",    minStaff: 2, requiredCerts: ["officer"],   shift: "B", visible: true  },
    { id: "T1",  name: "Tender 1",    type: "Tender",  minStaff: 2, requiredCerts: ["emt"],       shift: "C", visible: true  },
    { id: "R1",  name: "Rescue 1",    type: "Rescue",  minStaff: 3, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "HM1", name: "Hazmat 1",    type: "Rescue",  minStaff: 3, requiredCerts: ["engineer"],  shift: "B", visible: true  },
    { id: "SV1", name: "Safety 1",    type: "MOF",     minStaff: 2, requiredCerts: ["officer"],   shift: "C", visible: true  },
    { id: "U14", name: "Utility 14",  type: "MOF",     minStaff: 2, requiredCerts: ["emt"],       shift: "C", visible: false },
    { id: "U15", name: "Utility 15",  type: "MOF",     minStaff: 2, requiredCerts: ["emt"],       shift: "A", visible: false },
    { id: "R2",  name: "Rescue 2",    type: "Rescue",  minStaff: 3, requiredCerts: ["paramedic"], shift: "B", visible: false },
    { id: "M4",  name: "Medic 4",     type: "Medic",   minStaff: 2, requiredCerts: ["paramedic"], shift: "C", visible: false },
    { id: "B1",  name: "Brush 1",     type: "Brush",   minStaff: 2, requiredCerts: ["emt"],       shift: "A", visible: false },
    { id: "B2",  name: "Brush 2",     type: "Brush",   minStaff: 2, requiredCerts: ["emt"],       shift: "B", visible: false },
    { id: "L3",  name: "Ladder 3",    type: "Ladder",  minStaff: 4, requiredCerts: ["paramedic"], shift: "C", visible: false },
    { id: "E4",  name: "Engine 4",    type: "Engine",  minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: false },
  ];
}

/** Maps CSV / legacy lowercase types and persisted data to canonical `unitTypes` values. */
function normalizeUnitType(rawType, unitId = "") {
  const raw = String(rawType || "").trim();
  const id = String(unitId || "");
  if (!raw) return null;
  if (unitTypes.includes(raw)) return raw;
  const caseMatch = unitTypes.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (caseMatch) return caseMatch;
  const lower = raw.toLowerCase();
  if (lower === "engine") return "Engine";
  if (lower === "ladder") return "Ladder";
  if (lower === "ambulance") return "Medic";
  if (lower === "supervisor") return /^SV/i.test(id) ? "MOF" : "Batt";
  if (lower === "specialty") {
    if (/^T\d/i.test(id)) return "Tender";
    return "Rescue";
  }
  if (lower === "reserve") {
    if (/^B\d/i.test(id)) return "Brush";
    if (/^M\d/i.test(id)) return "Medic";
    if (/^E\d/i.test(id)) return "Engine";
    if (/^L\d/i.test(id)) return "Ladder";
    if (/^R\d/i.test(id)) return "Rescue";
    if (/^U\d/i.test(id)) return "MOF";
    return "Engine";
  }
  return null;
}

function migratePersistedUnitTypes(units) {
  if (!Array.isArray(units)) return;
  units.forEach((unit) => {
    if (!unit || typeof unit !== "object") return;
    const next = normalizeUnitType(unit.type, unit.id);
    unit.type = next || "Engine";
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
  // Default to the fiscal year people are picking for: after Oct 1 that's the
  // current one, before it that's the one about to start.
  if (dom["mandatory-fy"] && !dom["mandatory-fy"].value) {
    dom["mandatory-fy"].value = String(planningFiscalYear());
  }
  dom.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.currentView));
  renderSurfaceState();
  renderSummary();
  renderAlerts();
  renderSchedule();
  renderUnitControls();
  renderNotifications();
  renderApprovalQueue();
  renderAuditLog();
  renderImportPreview();
  renderUnitImportPreview();
  renderRosterImportPreview();
  renderEmployeeRoster();
  renderEmployeeEditor();
  populateTradeSelects();
  renderPermissionStates();
  renderPersistenceStatus();
  renderSaveIndicator();
  renderReservePanel();
  renderCoveragePanel();
  renderMandatoryImportPreview();
  renderMandatorySummary();
  renderDrawerBadge();
  renderTemplateEditor();   // binds its own seat events
}

// Passive reassurance in place of the old "Save Supervisor Edits" button.
// Reports what already happened rather than offering an action.
function renderSaveIndicator() {
  const el = dom["save-indicator"];
  if (!el) return;
  if (state.persistence.isSaving) {
    el.textContent = "Saving…";
    el.className = "save-indicator is-saving";
    return;
  }
  if (!state.persistence.lastSavedAt) {
    el.textContent = "";
    el.className = "save-indicator";
    return;
  }
  const when = new Date(state.persistence.lastSavedAt).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
  el.textContent = `Saved ${when}`;
  el.className = "save-indicator";
}

// Badge = work actually waiting on a supervisor: pending trades + open overtime
// posts with nobody approved. Zero means the drawer can be safely ignored.
function renderDrawerBadge() {
  const el = dom["drawer-badge"];
  if (!el) return;
  const pendingTrades = (state.trades || []).filter((t) => t.status === "pending").length;
  const openPosts = (state.overtimePosts || []).filter((p) => p.status === "open" && !p.approvedEmployeeId).length;
  const total = pendingTrades + openPosts;
  el.textContent = String(total);
  el.classList.toggle("hidden", total === 0);
}

function renderSurfaceState() {
  const adminAllowed = canAccessAdmin();
  if (!adminAllowed && state.activeSurface === "admin") {
    state.activeSurface = "schedule";
  }
  dom.surfaceButtons.schedule.classList.toggle("is-active", state.activeSurface === "schedule");
  dom.surfaceButtons.admin.classList.toggle("is-active", state.activeSurface === "admin");
  dom.surfaceButtons.admin.disabled = !adminAllowed;
  dom.surfaceButtons.admin.title = adminAllowed ? "" : "Supervisor sign-in required";
  dom["schedule-surface"].classList.toggle("hidden", state.activeSurface !== "schedule");
  dom["admin-surface"].classList.toggle("hidden", state.activeSurface !== "admin");
}

// Save state is shown ONLY when something is wrong. A permanent "connected"
// pill is banner blindness waiting to happen, and the one message that must cut
// through is "your change did not save."
function renderPersistenceStatus() {
  const el = dom["storage-status"];
  if (!el) return;
  const p = state.persistence;
  const degraded =
    p.backend === "local-storage" || p.backend === "supabase-fallback" ||
    p.backend === "api-fallback" || p.backend === "browser-memory";
  const isDanger = p.level === "danger" || p.backend === "browser-memory";
  const isWarning = p.level === "warning" || degraded;

  el.className = "save-banner";
  if (!isDanger && !isWarning) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.add(isDanger ? "is-danger" : "is-warning");
  el.textContent = isDanger
    ? `Changes are NOT being saved to the server. ${p.status}`
    : `Working from a backup data source — changes may not reach the server. ${p.status}`;
}

function canAccessAdmin() {
  return state.isAuthenticated && state.currentRole === "supervisor";
}


function populateTradeSelects() {
  const employees = activeEmployees().map((employee) => `<option value="${employee.id}">${employee.name} • ${employee.shift}</option>`).join("");
  dom["trade-owner"].innerHTML = employees;
  dom["trade-partner"].innerHTML = employees;
  dom["trade-owner"].value = activeEmployeeById(state.currentUserId)?.id || activeEmployees()[0]?.id || "";
  dom["trade-partner"].value = activeEmployees().find((employee) => employee.id !== dom["trade-owner"].value)?.id || activeEmployees()[1]?.id || "";
  dom["trade-date"].value = addDays(state.currentDate, 3);
}


function renderSummary() {
  const range = getDateRange();
  const visibleUnitList = visibleUnits();
  const activeShift = getShiftForDate(state.currentDate);
  const offUnits = state.units.length - visibleUnitList.length;
  const uncovered = range.flatMap((date) => getStaffingAlerts(date)).filter((alert) => alert.level === "danger").length;

  dom["summary-grid"].innerHTML = `
    <div class="summary-card">
      <span>Active Shift</span>
      <strong>${activeShift}</strong>
      <small>${formatDate(state.currentDate)}</small>
    </div>
    <div class="summary-card">
      <span>Visible Units</span>
      <strong>${visibleUnitList.length}</strong>
      <small>${offUnits} hidden / reserve</small>
    </div>
    <div class="summary-card">
      <span>Employees</span>
      <strong>${activeEmployees().length}</strong>
      <small>${archivedEmployees().length} archived</small>
    </div>
    <div class="summary-card">
      <span>Coverage Risks</span>
      <strong>${uncovered}</strong>
      <small>${state.scheduleStatus === "published" ? "Published schedule" : "Draft schedule"}</small>
    </div>
  `;
}

// One chip PER UNIT ("Batt 115 — 2 open seats"), not per empty seat. A full
// unit used to produce four near-identical chips and push everything else off
// the strip; grouping keeps the whole day readable at a glance.
function groupAlertsByUnit(alerts) {
  const byUnit = new Map();
  alerts.forEach((a) => {
    const key = a.unitId || a.unitName || a.message;
    if (!byUnit.has(key)) {
      byUnit.set(key, { unitName: a.unitName || "", level: a.level, count: 0, needs: [] });
    }
    const entry = byUnit.get(key);
    entry.count += 1;
    if (a.level === "danger") entry.level = "danger";   // danger outranks warning
    if (a.need && !entry.needs.includes(a.need)) entry.needs.push(a.need);
  });
  // Worst first, then most seats open — the units a chief needs to act on.
  return [...byUnit.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level === "danger" ? -1 : 1;
    return b.count - a.count;
  });
}

function renderAlerts() {
  const groups = groupAlertsByUnit(getStaffingAlerts(state.currentDate));
  if (!groups.length) {
    dom["alert-strip"].innerHTML =
      `<div class="alert-chip is-clear">All units staffed — ${formatDate(state.currentDate)}</div>`;
    return;
  }
  const shown = groups.slice(0, 6);
  const hidden = groups.length - shown.length;
  dom["alert-strip"].innerHTML =
    shown
      .map((g) => {
        const seats = `${g.count} open seat${g.count === 1 ? "" : "s"}`;
        // Full detail on hover; the chip itself stays short.
        const title = g.needs.length ? `Needs: ${g.needs.join(", ")}` : seats;
        return `<div class="alert-chip is-${g.level}" title="${escapeHtml(title)}">
          <span class="alert-count">${g.count}</span>
          <span class="alert-unit">${escapeHtml(g.unitName)}</span>
          <span class="alert-detail">${seats}</span>
        </div>`;
      })
      .join("") +
    (hidden > 0 ? `<div class="alert-chip is-more">+${hidden} more</div>` : "");
}

// ─── Schedule Views ───────────────────────────────────────────────────────────

function renderSchedule() {
  const range = getDateRange();
  const viewLabels = { day: "Daily Schedule", week: "Weekly Schedule", month: "Monthly Schedule" };
  dom["schedule-title"].textContent = viewLabels[state.currentView] || "Schedule View";
  dom["schedule-subtitle"].textContent = `${formatDate(range[0])}${range.length > 1 ? ` through ${formatDate(range[range.length - 1])}` : ""}`;

  if (state.isLoadingRemote) {
    dom["schedule-container"].innerHTML = `
      <div class="schedule-skeleton" role="status" aria-live="polite">
        <p class="helper-text">Loading schedule…</p>
        ${Array.from({ length: 4 }, () => '<div class="skeleton-card"></div>').join("")}
      </div>`;
    return;
  }

  if (state.currentView === "day") {
    dom["schedule-container"].innerHTML = renderTimelineCard(range[0]);
  } else if (state.currentView === "week") {
    dom["schedule-container"].innerHTML = renderWeekCalendar(range);
  } else {
    dom["schedule-container"].innerHTML = renderMonthCalendar(range);
  }

  attachUnitMoveEvents();
  attachCalendarNavEvents();
  attachUnitServiceEvents(dom["schedule-container"]);
}

// ─── Staffing templates ──────────────────────────────────────────────────────
// A template is a STANDING CREW for one unit on one platoon: E115's A-shift crew
// differs from its B-shift crew. A "push" turns templates into real assignments
// for every date that platoon is on duty.
//
// Assignments are GENERATED, never derived at read time. That means the schedule
// you see is the schedule that is stored, editing a template never silently
// rewrites history, and PTO is just a normal edit to one date.

const TEMPLATE_PUSH_DEFAULT_DAYS = 180;   // ~6 months

// How many audit/notification rows the BROWSER carries. Full history lives on
// the server; this is only the display window.
const HISTORY_KEEP = 250;

// Default report time on a newly created overtime gap.
const DEFAULT_REPORT_TIME = "06:30";

function renderTemplateEditor() {
  const unitSelect = dom["template-unit"];
  const seatsEl = dom["template-seats"];
  if (!unitSelect || !seatsEl) return;

  // Every unit is templatable, including reserves — pre-building a reserve crew
  // is exactly how a long-term front-line outage gets staffed.
  const units = visibleUnitsAll();
  const selectedUnit = state.templateUnitId && units.some((u) => u.id === state.templateUnitId)
    ? state.templateUnitId
    : units[0]?.id || "";
  state.templateUnitId = selectedUnit;
  const shift = state.templateShift || "A";
  state.templateShift = shift;

  unitSelect.innerHTML = units
    .map((u) => `<option value="${u.id}" ${u.id === selectedUnit ? "selected" : ""}>
      ${escapeHtml(u.name)}${u.onDemand ? " (reserve)" : ""}</option>`)
    .join("");
  if (dom["template-shift"]) dom["template-shift"].value = shift;

  const unit = unitById(selectedUnit);
  const positions = UNIT_POSITION_REQUIREMENTS[unit?.type];
  if (!unit || !positions) {
    seatsEl.innerHTML = `<div class="empty-state">No seat layout defined for this unit type.</div>`;
    return;   // no selects rendered, nothing to bind
  }

  const tpl = templateFor(selectedUnit, shift);
  // Only people on THIS platoon — a standing crew is by definition the platoon's
  // own people. Overtime and cross-staffing stay one-off edits on the board.
  const pool = activeEmployees().filter((e) => e.shift === shift);

  seatsEl.innerHTML = positions
    .map((pos) => {
      const current = tpl?.seats?.[pos.role] || "";
      const eligible = pool.filter((e) => seatAccepts(pos, e));
      const options = eligible
        .map((e) => `<option value="${e.id}" ${e.id === current ? "selected" : ""}>
          ${escapeHtml(e.name)} — ${escapeHtml(e.title || "—")}</option>`)
        .join("");
      const need = seatNeedLabel(pos);
      return `<div class="seat-row ${seatIsRequired(pos) ? "" : "seat-optional"}">
        <span class="seat-label">${escapeHtml(pos.label)}${need ? ` <em>(${escapeHtml(need)})</em>` : ""}</span>
        <select class="template-seat-select" data-role="${escapeHtml(pos.role)}">
          <option value="">— none —</option>${options}
        </select>
      </div>`;
    })
    .join("");

  const filled = positions.filter((pos) => tpl?.seats?.[pos.role]).length;
  if (dom["template-push-summary"]) {
    dom["template-push-summary"].textContent =
      `${unit.name} · ${shift} shift — ${filled} of ${positions.length} seats set.`;
  }

  // Setting innerHTML above DESTROYED the previous selects and their listeners.
  // Re-binding here — rather than in the callers — is the whole point: the unit
  // and platoon dropdowns used to re-render without re-binding, which left the
  // seat selects completely inert the moment you switched platoon.
  attachTemplateSeatEvents();
}

function attachTemplateEvents() {
  dom["template-unit"]?.addEventListener("change", (e) => {
    state.templateUnitId = e.target.value;
    renderTemplateEditor();
  });
  dom["template-shift"]?.addEventListener("change", (e) => {
    state.templateShift = e.target.value;
    renderTemplateEditor();
  });
  dom["template-push-btn"]?.addEventListener("click", () => {
    const days = Math.min(365, Math.max(1, Number(dom["template-push-days"]?.value) || TEMPLATE_PUSH_DEFAULT_DAYS));
    applyTemplatePush(days);
  });
}

// Delegated: the seat selects are re-rendered on every change.
function attachTemplateSeatEvents() {
  [...(dom["template-seats"]?.querySelectorAll(".template-seat-select") || [])].forEach((select) => {
    select.addEventListener("change", () => {
      if (state.currentRole !== "supervisor") {
        showToast("Supervisor sign-in required to edit templates.", "error");
        return;
      }
      upsertTemplateSeat(state.templateUnitId, state.templateShift, select.dataset.role, select.value);
      addAudit(
        `Staffing template updated: ${unitById(state.templateUnitId)?.name} ${state.templateShift} shift.`,
        currentUserName()
      );
      renderTemplateEditor();   // re-renders AND re-binds
      persistAppState("Staffing template updated");
    });
  });
}

// Provenance lives on each stored assignment row. "manual" always wins: a push
// may overwrite what a push wrote, never what a person placed.
function markManual(people) {
  return (people || []).map((p) => ({ ...p, _src: "manual" }));
}

function isTemplateGenerated(people) {
  return (people || []).length > 0 && people.every((p) => p && p._src === "template");
}

function templateFor(unitId, shift) {
  return (state.staffingTemplates || []).find((t) => t.unitId === unitId && t.shift === shift) || null;
}

function upsertTemplateSeat(unitId, shift, role, employeeId) {
  if (!Array.isArray(state.staffingTemplates)) state.staffingTemplates = [];
  let tpl = templateFor(unitId, shift);
  if (!tpl) {
    tpl = { unitId, shift, seats: {} };
    state.staffingTemplates.push(tpl);
  }
  if (employeeId) tpl.seats[role] = employeeId;
  else delete tpl.seats[role];
}

// Build the crew a template implies for one date. Archived or deleted people are
// DROPPED rather than seated, so the seat reads as an open gap and raises a normal
// staffing alert instead of looking covered by someone who no longer works here.
function crewFromTemplate(unitId, date) {
  const tpl = templateFor(unitId, getShiftForDate(date));
  if (!tpl) return [];
  const positions = UNIT_POSITION_REQUIREMENTS[unitById(unitId)?.type] || [];
  const crew = [];
  positions.forEach((pos) => {
    const empId = tpl.seats?.[pos.role];
    if (!empId) return;
    const emp = employeeById(empId);
    if (!emp || emp.status === "archived") return;
    if (crew.some((p) => p.id === emp.id)) return;
    crew.push({ ...emp, _src: "template" });
  });
  return crew;
}

// Dry run. Returns exactly what a push WOULD do, so the confirm dialog can state
// it in plain numbers before anything is written.
function previewTemplatePush(days = TEMPLATE_PUSH_DEFAULT_DAYS) {
  const result = { created: 0, replaced: 0, skippedManual: 0, noTemplate: 0, dates: 0, unitDays: [] };
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(todayIso(), offset);
    let touched = false;
    unitsForDate(date).forEach((unit) => {
      const crew = crewFromTemplate(unit.id, date);
      if (!crew.length) { result.noTemplate += 1; return; }
      const existing = getAssignments(date, unit.id);
      if (existing.length && !isTemplateGenerated(existing)) { result.skippedManual += 1; return; }
      if (existing.length) result.replaced += 1; else result.created += 1;
      result.unitDays.push({ date, unitId: unit.id, crew });
      touched = true;
    });
    if (touched) result.dates += 1;
  }
  return result;
}

function applyTemplatePush(days = TEMPLATE_PUSH_DEFAULT_DAYS) {
  if (state.currentRole !== "supervisor") {
    showToast("Supervisor sign-in required to push staffing.", "error");
    return;
  }
  const plan = previewTemplatePush(days);
  if (!plan.unitDays.length) {
    // Say WHY. "Nothing to push" with no reason is a dead end, and the most
    // common cause — templates that only cover reserve units — is expected
    // behaviour rather than a mistake.
    const templates = state.staffingTemplates || [];
    const withSeats = templates.filter((t) => Object.values(t.seats || {}).some(Boolean));
    let reason;
    if (!withSeats.length) {
      reason = "No templates have any seats filled yet. Set a crew above first.";
    } else {
      const frontLine = withSeats.filter((t) => !unitById(t.unitId)?.onDemand);
      if (!frontLine.length) {
        const names = [...new Set(withSeats.map((t) => unitById(t.unitId)?.name).filter(Boolean))];
        reason =
          `Templates exist only for reserve units (${names.join(", ")}). Reserve units are ` +
          `not on duty on any date, so a push has nothing to write — their crews are applied ` +
          `when you put the unit in service for a date.`;
      } else {
        reason =
          `Templates exist for ${frontLine.length} front-line unit/platoon combination` +
          `${frontLine.length === 1 ? "" : "s"}, but every matching date already has ` +
          `hand-edited staffing, which a push never overwrites.`;
      }
    }
    window.alert(`Nothing to push.\n\n${reason}`);
    return;
  }
  const ok = window.confirm(
    `Push standing crews for the next ${days} days?\n\n` +
    `• ${plan.created} unit-days will be filled\n` +
    `• ${plan.replaced} previously pushed unit-days will be refreshed\n` +
    `• ${plan.skippedManual} will be SKIPPED (edited by hand — never overwritten)\n` +
    `• ${plan.noTemplate} have no template for the platoon on duty\n\n` +
    `Spans ${plan.dates} dates. PTO and swaps you have already entered are safe.`
  );
  if (!ok) return;

  plan.unitDays.forEach(({ date, unitId, crew }) => {
    if (!state.assignments[date]) state.assignments[date] = {};
    state.assignments[date][unitId] = crew;
  });
  // ONE audit entry, not one per assignment — a 1,200-row log entry is unreadable.
  addAudit(
    `Staffing templates pushed for ${days} days: ${plan.created} filled, ${plan.replaced} refreshed, ${plan.skippedManual} manual skipped.`,
    currentUserName()
  );
  render();
  persistAppState("Staffing templates pushed");
  showToast(`Pushed staffing across ${plan.dates} dates.`, "success");
}

// Pulls the COMPLETE audit history from the server, not the 250-row display
// window the SPA carries. Runs through fetch rather than a plain link because
// the endpoint needs a bearer token.
async function exportAuditLog() {
  const btn = dom["export-audit-btn"];
  if (!usesSchedulerApi()) {
    showToast("Audit export needs the server connection.", "error");
    return;
  }
  const original = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    const url = `${window.APP_CONFIG.schedulerApiUrl.replace(/\/$/, "")}/api/scheduler/audit/export.csv`;
    const response = await fetch(url, { headers: await schedulerApiHeaders() });
    if (!response.ok) throw new Error(`Export failed with status ${response.status}`);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `d7fr-audit-${todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast("Audit log exported.", "success");
  } catch (error) {
    console.error("Audit export failed", error);
    showToast("Audit export failed — check the connection and try again.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// ─── App shell chrome: sidebar collapse + right tool drawer ──────────────────

// One scrim serves both overlays; it stays up while EITHER is open so closing
// one never leaves the other floating over an un-dimmed page.
function syncScrim() {
  const anyOpen =
    document.body.classList.contains("drawer-open") ||
    document.body.classList.contains("sidebar-open");
  dom["drawer-scrim"]?.classList.toggle("hidden", !anyOpen);
}

function setDrawerOpen(open) {
  const drawer = dom["tool-drawer"];
  if (!drawer) return;
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
  dom["drawer-toggle"]?.setAttribute("aria-expanded", open ? "true" : "false");
  document.body.classList.toggle("drawer-open", open);
  syncScrim();
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  dom["sidebar-toggle"]?.setAttribute("aria-expanded", open ? "true" : "false");
  syncScrim();
}

function selectDrawerTab(name) {
  [...document.querySelectorAll("[data-drawer-tab]")].forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.drawerTab === name)
  );
  [...document.querySelectorAll("[data-drawer-pane]")].forEach((pane) =>
    pane.classList.toggle("hidden", pane.dataset.drawerPane !== name)
  );
}

function attachShellChromeEvents() {
  dom["drawer-toggle"]?.addEventListener("click", () =>
    setDrawerOpen(!dom["tool-drawer"].classList.contains("is-open"))
  );
  dom["drawer-close"]?.addEventListener("click", () => setDrawerOpen(false));
  dom["drawer-scrim"]?.addEventListener("click", () => {
    setDrawerOpen(false);
    setSidebarOpen(false);
  });
  dom["sidebar-toggle"]?.addEventListener("click", () =>
    setSidebarOpen(!document.body.classList.contains("sidebar-open"))
  );
  [...document.querySelectorAll("[data-drawer-tab]")].forEach((btn) => {
    btn.addEventListener("click", () => selectDrawerTab(btn.dataset.drawerTab));
  });
  // Escape closes whichever overlay is open — expected on both desktop and tablet.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setDrawerOpen(false);
    setSidebarOpen(false);
  });
}

// In/out of service controls for on-demand apparatus.
// SCOPED to a root element on purpose: the schedule and the drawer are rendered
// by separate passes, and an unscoped querySelectorAll would bind the schedule's
// buttons a second time on the drawer pass — firing deactivate twice per click.
function attachUnitServiceEvents(root) {
  const scope = root || document;
  [...scope.querySelectorAll("[data-activate-unit]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.currentRole !== "supervisor") return;
      activateUnitForDate(btn.dataset.activateUnit, btn.dataset.activateDate);
    });
  });
  [...scope.querySelectorAll("[data-deactivate-unit]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.currentRole !== "supervisor") return;
      deactivateUnitForDate(btn.dataset.deactivateUnit, btn.dataset.deactivateDate);
    });
  });
}

// Day view: full timeline card with unit details
function renderTimelineCard(date) {
  const shift = getShiftForDate(date);
  const alerts = getStaffingAlerts(date);
  const unitsMarkup = unitsForDate(date)
    .map((unit) => renderUnitCard(unit, date, shift))
    .join("");

  return `
    <article class="timeline-card">
      <div class="timeline-head">
        <div>
          <h3>${formatDate(date)}</h3>
          <p class="helper-text">${shift} Shift on duty • continuous 48-hour rotation</p>
        </div>
        <div class="pill-group">
          <span class="pill">${alerts.filter((item) => item.level === "danger").length} staffing risks</span>
          <span class="pill pill-highlight">${alerts.filter((item) => item.level === "warning").length} watch items</span>
        </div>
      </div>
      <div class="timeline-grid">${unitsMarkup || '<div class="empty-state">No visible units scheduled for this day.</div>'}</div>
    </article>
  `;
}

// Supervisor-only tray of on-demand apparatus not currently in service for this
// date (reserve engines, surge medics, brush/tender). Hidden entirely when there
// are none, so it never clutters a normal day.
// Renders into the tool drawer's Reserve tab (not inline under the schedule),
// so the board keeps full width. Day-view date is the one being acted on.
function renderReservePanel() {
  const el = dom["reserve-panel"];
  if (!el) return;
  el.innerHTML = renderReserveTray(state.currentDate);
  attachUnitServiceEvents(el);
}

function renderReserveTray(date) {
  if (state.currentRole !== "supervisor") {
    return '<div class="empty-state">Supervisor sign-in required to place units in service.</div>';
  }
  const available = inactiveOnDemandUnits(date);
  if (!available.length) {
    return '<div class="empty-state">Every reserve unit is already in service for this date.</div>';
  }
  const rows = available
    .map(
      (unit) => `
      <div class="toggle-item">
        <div>
          <strong>${escapeHtml(unit.name)}</strong>
          <p class="helper-text">${escapeHtml(unit.type || "Unit")} • out of service</p>
        </div>
        <button class="button button-secondary button-small" data-activate-unit="${unit.id}" data-activate-date="${date}">
          Put in service
        </button>
      </div>`
    )
    .join("");
  return `
    <div class="reserve-tray">
      <h4>Reserve / on-demand apparatus</h4>
      <p class="helper-text">Not staffed unless placed in service. Applies to ${formatDate(date)} only.</p>
      ${rows}
    </div>
  `;
}

// "Out of service" control shown on an in-service on-demand unit's card.
function unitServiceControlHtml(unit, date) {
  if (!unit.onDemand || state.currentRole !== "supervisor") return "";
  return `<button class="button button-secondary button-small" data-deactivate-unit="${unit.id}" data-deactivate-date="${date}">Out of service</button>`;
}

// Week view: compact 7-column calendar grid
function renderWeekCalendar(dates) {
  const today = todayIso();
  const cols = dates.map((date) => {
    const shift = getShiftForDate(date);
    const alerts = getStaffingAlerts(date);
    const riskCount = alerts.filter((a) => a.level === "danger").length;
    const warnCount = alerts.filter((a) => a.level === "warning").length;
    const isToday = date === today;
    const isSelected = date === state.currentDate;
    const dayName = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
    const dayNum = new Date(`${date}T12:00:00`).getDate();

    const activeUnits = unitsForDate(date);
    const unitRows = activeUnits
      .map((unit) => {
        const people = getAssignments(date, unit.id);
        const ok = people.length >= unit.minStaff;
        return `<div class="cal-unit-row ${ok ? "cal-ok" : "cal-warn"}">
          <span class="cal-unit-name">${unit.name}</span>
          <span class="cal-unit-count">${people.length}/${unit.minStaff}</span>
        </div>`;
      })
      .join("");

    return `
      <div class="cal-day-col ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}">
        <button class="cal-day-head" data-nav-date="${date}">
          <span class="cal-weekday">${dayName}</span>
          <span class="cal-date-num">${dayNum}</span>
          <span class="shift-chip shift-${shift.toLowerCase()}">${shift}</span>
          ${riskCount > 0 ? `<span class="risk-chip">${riskCount} risk${riskCount > 1 ? "s" : ""}</span>` : ""}
          ${warnCount > 0 && riskCount === 0 ? `<span class="warn-chip">${warnCount} watch</span>` : ""}
        </button>
        <div class="cal-units">
          ${shift === "off" ? '<span class="cal-off-label">Off rotation</span>' : unitRows || '<span class="cal-off-label">No visible units</span>'}
        </div>
      </div>
    `;
  }).join("");

  return `<div class="week-calendar">${cols}</div>`;
}

// Month view: traditional calendar grid
function renderMonthCalendar(dates) {
  const today = todayIso();
  const firstDate = new Date(`${dates[0]}T12:00:00`);
  // Monday-anchored: Mon=0 … Sun=6
  const firstDow = (firstDate.getDay() + 6) % 7;

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const header = dayNames.map((d) => `<div class="cal-month-head">${d}</div>`).join("");

  const emptyCells = Array.from({ length: firstDow }, () => '<div class="cal-month-cell is-empty"></div>').join("");

  const dayCells = dates
    .map((date) => {
      const shift = getShiftForDate(date);
      const alerts = getStaffingAlerts(date);
      const riskCount = alerts.filter((a) => a.level === "danger").length;
      const isToday = date === today;
      const isSelected = date === state.currentDate;
      const dayNum = new Date(`${date}T12:00:00`).getDate();

      return `
        <div class="cal-month-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}">
          <button class="cal-month-day-btn" data-nav-date="${date}">
            <span class="cal-date-num">${dayNum}</span>
            <span class="shift-chip shift-${shift.toLowerCase()}">${shift === "off" ? "·" : shift}</span>
            ${riskCount > 0 ? `<span class="risk-chip">${riskCount}</span>` : ""}
          </button>
        </div>
      `;
    })
    .join("");

  return `
    <div class="month-calendar">
      <div class="month-cal-header">${header}</div>
      <div class="month-cal-grid">${emptyCells}${dayCells}</div>
    </div>
  `;
}

function renderUnitCard(unit, date, activeShift) {
  const people = getAssignments(date, unit.id);
  // The truck is in service on any date it's shown; the platoon on duty staffs it.
  const isActive = unitRunsOn(unit, date);
  const isSupervisor = state.currentRole === "supervisor";
  const positions = UNIT_POSITION_REQUIREMENTS[unit.type];

  // --- Unlisted unit type: keep the simple single-dropdown + list behavior. ---
  if (!positions) {
    const booked = assignedEmployeeIdsForDate(date);
    const base = eligibleEmployeesForDate(date);
    const options = base
      .filter((e) => !booked.has(e.id))
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${e.shift || "?"})</option>`)
      .join("");
    const staffingOk = people.length >= (unit.minStaff || 0);
    const cls = !isActive ? "badge-soft" : staffingOk ? "badge-success" : "badge-danger";
    const lbl = !isActive ? "Off rotation" : staffingOk ? "Staffed" : "Needs attention";
    const rows = people.map((p) => seatRowHtml({ label: p.title || "Crew", cap: null }, p, unit, date, isSupervisor, false, p.title || "Crew")).join("");
    return `
    <section class="unit-card" data-apparatus="${escapeHtml(unit.type || "")}">
      <div class="unit-card-header">
        <div><h3>${escapeHtml(unit.name)}</h3><div class="unit-meta"><span>${unit.type || "Unit"}</span><span>${people.length}/${unit.minStaff || 0}</span></div></div>
        <div class="unit-card-actions">
          <span class="badge ${cls}">${lbl}</span>
          ${unitServiceControlHtml(unit, date)}
        </div>
      </div>
      <div class="seat-list">${rows || `<div class="empty-state">No assignment on this date.</div>`}
        ${isSupervisor ? `<div class="seat-row seat-optional"><span class="seat-label">Add personnel</span>
          <select class="assignment-select" data-date="${date}" data-unit="${unit.id}"><option value="">— choose —</option>${options}</select></div>` : ""}
      </div>
    </section>`;
  }

  // --- Seat-based units (Engine, Ladder, Medic, ...) ---
  const { seats, extra } = assignPeopleToSeats(unit.type, people);
  const requiredSeats = seats.filter((s) => seatIsRequired(s.pos));
  const optionalSeats = seats.filter((s) => !seatIsRequired(s.pos));
  const requiredFilled = requiredSeats.filter((s) => s.person).length;
  const requiredCount = requiredSeats.length;
  const optionalFilled = optionalSeats.filter((s) => s.person).length;
  const fullyStaffed = requiredFilled >= requiredCount;

  const statusClass = !isActive ? "badge-soft" : fullyStaffed ? "badge-success" : "badge-danger";
  const statusLabel = !isActive ? "Off rotation" : fullyStaffed ? "Staffed" : "Needs attention";

  // Required seats always render (person or dropdown). Filled optional seats
  // render; then one "additional" dropdown while optional capacity remains.
  let rowsHtml = "";
  seats.forEach((s) => {
    if (seatIsRequired(s.pos) || s.person) {
      rowsHtml += seatRowHtml(s.pos, s.person, unit, date, isSupervisor, seatIsRequired(s.pos));
    }
  });
  const optionalLeft = optionalSeats.length - optionalFilled;
  if (isSupervisor && optionalLeft > 0) {
    rowsHtml += seatRowHtml(
      { label: "Additional personnel", cap: null }, null, unit, date, isSupervisor, false,
      `Additional personnel (optional, ${optionalLeft} left)`,
    );
  }
  // Safety net: anyone assigned who didn't fit a seat still shows (removable).
  extra.forEach((p) => {
    rowsHtml += seatRowHtml({ label: "Extra", cap: null }, p, unit, date, isSupervisor, false, "Extra rider");
  });

  const totalSeats = positions.length;
  return `
    <section class="unit-card" data-apparatus="${escapeHtml(unit.type || "")}">
      <div class="unit-card-header">
        <div>
          <h3>${escapeHtml(unit.name)}</h3>
          <div class="unit-meta">
            <span>${unit.type}</span>
            <span>${requiredFilled}/${requiredCount} required</span>
            <span>up to ${totalSeats}</span>
          </div>
        </div>
        <div class="unit-card-actions">
          <span class="badge ${statusClass}">${statusLabel}</span>
          ${unitServiceControlHtml(unit, date)}
        </div>
      </div>
      <div class="seat-list">
        ${rowsHtml || `<div class="empty-state">No positions defined for this unit.</div>`}
      </div>
    </section>
  `;
}

// ─── Unit Controls (Units tab) ────────────────────────────────────────────────

function renderUnitControls() {
  const supervisorLocked = !state.isAuthenticated || state.currentRole !== "supervisor";

  dom["unit-toggle-list"].innerHTML = state.units
    .map(
      (unit) => `
      <div class="toggle-item unit-edit-row">
        <div class="unit-edit-info">
          <strong>${unit.name}</strong>
          ${
            supervisorLocked
              ? `<p class="helper-text">${unit.type} • ${unit.onDemand ? "on demand" : "runs daily"}</p>`
              : `<select class="unit-type-select" data-unit-type="${unit.id}" title="Edit unit type">
                  ${unitTypes.map((t) => `<option value="${t}" ${t === unit.type ? "selected" : ""}>${t}</option>`).join("")}
                </select>`
          }
        </div>
        <input type="checkbox" data-unit-toggle="${unit.id}" ${unit.visible ? "checked" : ""} ${supervisorLocked ? "disabled" : ""} aria-label="Show ${unit.name}" />
      </div>
    `,
    )
    .join("");

  // Visibility toggles
  [...document.querySelectorAll("[data-unit-toggle]")].forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const unit = state.units.find((item) => item.id === checkbox.dataset.unitToggle);
      if (!unit) return;
      unit.visible = checkbox.checked;
      addAudit(`${unit.name} ${unit.visible ? "shown" : "hidden"} on schedule view.`, currentUserName());
      render();
      persistAppState("Unit visibility updated");
    });
  });

  // Type editing
  [...document.querySelectorAll("[data-unit-type]")].forEach((select) => {
    select.addEventListener("change", () => {
      const unit = state.units.find((item) => item.id === select.dataset.unitType);
      if (!unit) return;
      const oldType = unit.type;
      unit.type = select.value;
      addAudit(`${unit.name} type changed from ${oldType} to ${unit.type}.`, currentUserName());
      persistAppState("Unit type updated");
    });
  });
}

// ─── Employee Roster ──────────────────────────────────────────────────────────

function renderEmployeeRoster() {
  const { search, shift, status, sort } = state.employeeFilter;
  const activeShift = getShiftForDate(state.currentDate);
  const query = search.trim().toLowerCase();

  let employees = state.employees.map((employee) => normalizeEmployeeRecord(employee));

  if (status !== "all") {
    employees = employees.filter((employee) => employee.status === status);
  }

  if (shift !== "all") {
    employees = employees.filter((employee) => employee.shift === shift);
  }

  if (query) {
    employees = employees.filter((employee) =>
      [employee.name, employee.title, employee.email, employee.id].some((field) => String(field || "").toLowerCase().includes(query)),
    );
  }

  // Sort
  if (sort === "name") {
    employees.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "cert") {
    const certOrder = { officer: 0, paramedic: 1, engineer: 2, emt: 3 };
    employees.sort((a, b) => {
      const aLevel = Math.min(...a.certs.map((c) => certOrder[c] ?? 99));
      const bLevel = Math.min(...b.certs.map((c) => certOrder[c] ?? 99));
      return aLevel - bLevel || a.name.localeCompare(b.name);
    });
  } else if (sort === "shift") {
    const shiftOrder = { A: 0, B: 1, C: 2 };
    employees.sort((a, b) => (shiftOrder[a.shift] ?? 99) - (shiftOrder[b.shift] ?? 99) || a.name.localeCompare(b.name));
  }

  if (!employees.length) {
    dom["employee-roster"].innerHTML = '<div class="empty-state">No employees match the current filter.</div>';
    return;
  }

  const rows = employees
    .map((emp) => {
      const onDuty = emp.shift === activeShift;
      const archived = emp.status === "archived";

      const dayAssignments = Object.entries(state.assignments[state.currentDate] || {})
        .filter(([, people]) => people.some((p) => p.id === emp.id))
        .map(([unitId]) => unitById(unitId)?.name)
        .filter(Boolean);

      const dutyBadge = archived
        ? `<span class="badge badge-warning roster-duty-badge">Archived</span>`
        : onDuty
        ? `<span class="badge badge-success roster-duty-badge">On duty</span>`
        : `<span class="badge badge-soft roster-duty-badge">Off duty</span>`;

      return `
        <div class="roster-row ${archived ? "is-archived" : ""}">
          <div class="roster-row-info">
            <strong>${emp.name}</strong>
            <small>${emp.title} • ${emp.shift} Shift • ${emp.id}</small>
          </div>
          <div class="roster-row-meta">
            <div class="roster-status">
              <div class="pill-group">
                ${emp.certs.map((c) => `<span class="pill pill-cap" data-cap="${escapeHtml(c)}">${CAPABILITY_LABELS[c] || c}</span>`).join("")}
              </div>
              ${dutyBadge}
            </div>
            ${
              canAccessAdmin()
                ? `<div class="roster-actions">
                    <button class="button button-secondary button-small" data-edit-employee="${emp.id}">Edit</button>
                    <button class="button button-secondary button-small" data-toggle-employee-status="${emp.id}">
                      ${archived ? "Restore" : "Archive"}
                    </button>
                  </div>`
                : ""
            }
          </div>
          <div class="roster-assignments">
            <small>${emp.email || "No email on file"}${dayAssignments.length ? ` • Assigned: ${dayAssignments.join(", ")}` : ""}</small>
          </div>
        </div>
      `;
    })
    .join("");

  dom["employee-roster"].innerHTML = rows;
  attachEmployeeManagementEvents();
}

function renderEmployeeEditor() {
  const employee = employeeById(state.selectedEmployeeId);
  if (!employee || !state.employeeDraft) {
    dom["employee-editor"].innerHTML = '<div class="editor-empty">Choose an employee from the directory to edit credentials, contact details, shift, or archive status.</div>';
    return;
  }

  const draft = state.employeeDraft;
  dom["employee-editor"].innerHTML = `
    <div class="editor-card">
      <div>
        <strong>${employee.name}</strong>
        <p class="helper-text">${employee.id} • ${employee.status === "archived" ? "Archived employee" : "Active employee"}</p>
      </div>
      <div class="editor-grid">
        <label>
          Name
          <input id="employee-edit-name" type="text" value="${escapeHtml(draft.name || "")}" />
        </label>
        <label>
          Title
          <input id="employee-edit-title" type="text" list="employee-title-options" value="${escapeHtml(draft.title || "")}" />
          <datalist id="employee-title-options">
            ${employeeTitleOptions.map((titleOption) => `<option value="${escapeHtml(titleOption)}"></option>`).join("")}
          </datalist>
        </label>
        <label>
          Email
          <input id="employee-edit-email" type="email" value="${escapeHtml(draft.email || "")}" />
        </label>
        <label>
          Shift
          <select id="employee-edit-shift">
            <option value="" ${!draft.shift ? "selected" : ""}>Unassigned</option>
            ${["A", "B", "C"].map((shiftOption) => `<option value="${shiftOption}" ${draft.shift === shiftOption ? "selected" : ""}>${shiftOption} Shift</option>`).join("")}
          </select>
        </label>
        <label>
          Status
          <select id="employee-edit-status">
            <option value="active" ${draft.status === "active" ? "selected" : ""}>Active</option>
            <option value="archived" ${draft.status === "archived" ? "selected" : ""}>Archived</option>
          </select>
        </label>
      </div>
      <div class="editor-section">
        <strong>Credentials</strong>
        <div class="checkbox-grid">
          ${employeeRoles.map((role) => `
            <label class="check-tile">
              <input type="checkbox" class="employee-cert-toggle" value="${role}" ${draft.certs.includes(role) ? "checked" : ""} />
              <span>${capitalize(role)}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <div class="editor-section">
        <strong>Ride-up (acting) qualifications</strong>
        <p class="helper-text" style="margin:0 0 6px">Cleared to act above rank in these roles. Medical (paramedic/EMT) is license-only and not listed here.</p>
        <div class="checkbox-grid">
          ${RIDE_UP_CAPABILITIES.map((cap) => `
            <label class="check-tile">
              <input type="checkbox" class="employee-rideup-toggle" value="${cap}" ${(draft.rideUp || []).includes(cap) ? "checked" : ""} />
              <span>Acting ${cap === "engineer" ? "Driver/Engineer" : capitalize(cap)}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <label class="check-tile">
        <input id="employee-edit-supervisor" type="checkbox" ${draft.isSupervisor ? "checked" : ""} />
        <span>Supervisor access</span>
      </label>
      <div class="editor-footer">
        <button id="save-employee-btn" class="button button-primary">Save Employee</button>
        <button id="cancel-employee-btn" class="button button-secondary">Cancel</button>
      </div>
    </div>
  `;
  attachEmployeeEditorEvents();
}

function attachEmployeeManagementEvents() {
  [...document.querySelectorAll("[data-edit-employee]")].forEach((button) => {
    button.addEventListener("click", () => {
      const employee = employeeById(button.dataset.editEmployee);
      if (!employee) return;
      state.selectedEmployeeId = employee.id;
      state.employeeDraft = createEmployeeDraft(employee);
      renderEmployeeEditor();
      dom["employee-editor"].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  [...document.querySelectorAll("[data-toggle-employee-status]")].forEach((button) => {
    button.addEventListener("click", () => {
      const employee = employeeById(button.dataset.toggleEmployeeStatus);
      if (!employee) return;
      if (employee.id === state.currentUserId && employee.status !== "archived") {
        showToast("You cannot archive the account currently signed in.", "error");
        return;
      }
      employee.status = employee.status === "archived" ? "active" : "archived";
      addAudit(`${employee.name} ${employee.status === "archived" ? "archived" : "restored"} in employee directory.`, currentUserName());
      createNotification(`${employee.name} ${employee.status === "archived" ? "archived" : "restored"} in employee directory.`, "email", currentUserName());
      if (state.selectedEmployeeId === employee.id) {
        state.employeeDraft = createEmployeeDraft(employee);
      }
      populateTradeSelects();
      render();
      persistAppState(`Employee ${employee.status === "archived" ? "archived" : "restored"}`);
    });
  });
}

function attachEmployeeEditorEvents() {
  const certInputs = [...document.querySelectorAll(".employee-cert-toggle")];
  const rideUpInputs = [...document.querySelectorAll(".employee-rideup-toggle")];
  const syncDraft = () => {
    if (!state.employeeDraft) return;
    state.employeeDraft.name = document.getElementById("employee-edit-name").value.trim();
    state.employeeDraft.title = document.getElementById("employee-edit-title").value.trim();
    state.employeeDraft.email = document.getElementById("employee-edit-email").value.trim();
    state.employeeDraft.shift = document.getElementById("employee-edit-shift").value || null;
    state.employeeDraft.status = document.getElementById("employee-edit-status").value;
    state.employeeDraft.isSupervisor = document.getElementById("employee-edit-supervisor").checked;
    state.employeeDraft.certs = certInputs.filter((input) => input.checked).map((input) => input.value);
    state.employeeDraft.rideUp = rideUpInputs.filter((input) => input.checked).map((input) => input.value);
  };

  [
    "employee-edit-name",
    "employee-edit-title",
    "employee-edit-email",
    "employee-edit-shift",
    "employee-edit-status",
    "employee-edit-supervisor",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncDraft);
    document.getElementById(id)?.addEventListener("change", syncDraft);
  });
  certInputs.forEach((i) => i.addEventListener("change", syncDraft));
  rideUpInputs.forEach((i) => i.addEventListener("change", syncDraft));

  document.getElementById("save-employee-btn")?.addEventListener("click", saveEmployeeDraft);
  document.getElementById("cancel-employee-btn")?.addEventListener("click", () => {
    const employee = employeeById(state.selectedEmployeeId);
    state.employeeDraft = employee ? createEmployeeDraft(employee) : null;
    renderEmployeeEditor();
  });
}

function createEmployeeDraft(employee) {
  const normalized = normalizeEmployeeRecord(employee);
  return {
    id: normalized.id,
    name: normalized.name,
    title: normalized.title,
    email: normalized.email,
    shift: normalized.shift || null,
    status: normalized.status,
    isSupervisor: normalized.isSupervisor,
    certs: [...normalized.certs],
    rideUp: [...(normalized.rideUp || [])],
  };
}

function saveEmployeeDraft() {
  if (!canAccessAdmin() || !state.employeeDraft) {
    return;
  }
  if (!state.employeeDraft.name) {
    showToast("Employee name is required.", "error");
    return;
  }
  if (state.employeeDraft.shift && !["A", "B", "C"].includes(state.employeeDraft.shift)) {
    showToast("Employee shift must be A, B, or C.", "error");
    return;
  }
  if (!["active", "archived"].includes(state.employeeDraft.status)) {
    showToast("Employee status must be active or archived.", "error");
    return;
  }
  if (!state.employeeDraft.certs.length) {
    showToast("Select at least one credential.", "error");
    return;
  }
  const employee = employeeById(state.selectedEmployeeId);
  if (!employee) return;
  Object.assign(employee, {
    ...state.employeeDraft,
    certs: Array.from(new Set(state.employeeDraft.certs)),
    rideUp: Array.from(new Set((state.employeeDraft.rideUp || []).filter((c) => RIDE_UP_CAPABILITIES.includes(c)))),
    isSupervisor: state.employeeDraft.isSupervisor ||
                  state.employeeDraft.certs.includes("officer") ||
                  SUPERVISOR_TITLES.some((t) => t.toLowerCase() === (state.employeeDraft.title || "").toLowerCase()),
  });
  if (employee.id === state.currentUserId && employee.status === "archived") {
    employee.status = "active";
    showToast("The signed-in supervisor cannot archive their own account.", "error");
  }
  state.employeeDraft = createEmployeeDraft(employee);
  addAudit(`${employee.name} updated in employee directory.`, currentUserName());
  createNotification(`${employee.name} profile updated in employee directory.`, "email", currentUserName());
  populateTradeSelects();
  render();
  showToast("Employee changes saved.", "success");
  persistAppState("Employee updated");
}

// ─── Notifications, Queues, Audit ─────────────────────────────────────────────

function renderNotifications() {
  dom["notification-center"].innerHTML = state.notifications.length
    ? state.notifications
        .slice()
        .reverse()
        .map(
          (notification) => `
        <article class="queue-item">
          <strong>${notification.title}</strong>
          <p>${notification.message}</p>
          <time>${notification.channel.toUpperCase()} • ${notification.time}</time>
        </article>
      `,
        )
        .join("")
    : `<div class="empty-state">No notifications queued.</div>`;
}

function renderApprovalQueue() {
  const queue = [
    ...state.trades.map((trade) => ({ ...trade, queueType: "trade" })),
    ...state.overtimePosts.map((post) => ({ ...post, queueType: "overtime" })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  dom["approval-queue"].innerHTML = queue.length
    ? queue
        .map((item) => {
          const pending = item.status === "pending" || item.status === "open";
          const label = item.queueType === "trade" ? "Trade" : "Overtime";
          const details =
            item.queueType === "trade"
              ? `${employeeById(item.employeeId)?.name} ↔ ${employeeById(item.partnerId)?.name}`
              : `${unitById(item.unitId)?.name} • ${item.qualification} needed`;
          return `
            <article class="queue-item">
              <div class="unit-card-header">
                <strong>${label} • ${formatDate(item.date)}</strong>
                <span class="badge ${pending ? "badge-warning" : "badge-success"}">${item.status}</span>
              </div>
              <p>${details}</p>
              <p class="helper-text">${item.notes || `${item.applicants?.length || 0} applicant(s) in queue`}</p>
              <div class="queue-item-actions ${state.currentRole !== "supervisor" ? "hidden" : ""}">
                <button class="button button-secondary" data-approve="${item.id}">Approve</button>
                <button class="button button-secondary" data-deny="${item.id}">Deny</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">Nothing pending approval right now.</div>`;

  [...document.querySelectorAll("[data-approve]")].forEach((button) => {
    button.addEventListener("click", () => approveQueueItem(button.dataset.approve));
  });
  [...document.querySelectorAll("[data-deny]")].forEach((button) => {
    button.addEventListener("click", () => denyQueueItem(button.dataset.deny));
  });
}

function renderAuditLog() {
  dom["audit-log"].innerHTML = state.auditLog.length
    ? state.auditLog
        .slice()
        .reverse()
        .slice(0, 10)
        .map(
          (item) => `
        <article class="queue-item">
          <strong>${item.actor}</strong>
          <p>${item.message}</p>
          <time>${item.time}</time>
        </article>
      `,
        )
        .join("")
    : `<div class="empty-state">Audit trail will appear here.</div>`;
}

function renderImportPreview() {
  if (!state.importPreview) {
    dom["import-preview"].innerHTML = `<div class="empty-state">No preview yet. Choose a CSV and click Preview.</div>`;
    return;
  }
  dom["import-preview"].innerHTML = buildImportPreviewHtml(state.importPreview, "Employee");
}

function renderUnitImportPreview() {
  if (!state.unitImportPreview) {
    dom["unit-import-preview"].innerHTML = `<div class="empty-state">No preview yet. Choose a CSV and click Preview.</div>`;
    return;
  }
  dom["unit-import-preview"].innerHTML = buildImportPreviewHtml(state.unitImportPreview, "Unit");
}

function buildImportPreviewHtml(preview, label) {
  const { stats, errors, warnings, rows } = preview;
  const sampleRows = rows.slice(0, 5);
  const tableHeaders = sampleRows.length ? Object.keys(sampleRows[0]) : [];

  return `
    <article class="queue-item">
      <strong>${label} import preview</strong>
      <p>${stats.valid} valid row(s), ${errors.length} error(s), ${warnings.length} warning(s)</p>
      <time>Ready for supervisor review</time>
    </article>
    ${
      errors.length
        ? `<article class="queue-item">
            <strong>Errors</strong>
            <div class="status-box status-box-error">
              <p>The import is blocked until these are fixed:</p>
              <ul class="status-list">${errors.map((e) => `<li>${e.message || "Unknown error."}</li>`).join("")}</ul>
            </div>
          </article>`
        : ""
    }
    ${
      warnings.length
        ? `<article class="queue-item">
            <strong>Warnings</strong>
            <div class="status-box status-box-warning">
              <p>These will not block import but should be reviewed:</p>
              <ul class="status-list">${warnings.map((w) => `<li>${w.message || "Unknown warning."}</li>`).join("")}</ul>
            </div>
          </article>`
        : ""
    }
    ${
      sampleRows.length
        ? `<article class="queue-item">
            <strong>Sample rows</strong>
            <table class="preview-table">
              <thead><tr>${tableHeaders.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
              <tbody>${sampleRows.map((row) => `<tr>${tableHeaders.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </article>`
        : ""
    }
  `;
}

// ─── Permission States ────────────────────────────────────────────────────────

function renderPermissionStates() {
  const supervisorLocked = !state.isAuthenticated || state.currentRole !== "supervisor";
  const employeeLocked = !state.isAuthenticated;

  dom["publish-btn"].disabled = supervisorLocked;
  // Primary emphasis only while there is something to publish; otherwise it
  // out-shouts the actual task, which is staffing the board.
  const isDraft = state.scheduleStatus === "draft";
  dom["publish-btn"].classList.toggle("button-primary", isDraft);
  dom["publish-btn"].classList.toggle("button-secondary", !isDraft);
  dom["submit-trade-btn"].disabled = employeeLocked;
  dom["notify-btn"].disabled = employeeLocked;
  dom["print-btn"].disabled = employeeLocked;
  dom["schedule-status"].disabled = supervisorLocked;
  dom["trade-owner"].disabled = employeeLocked;
  dom["trade-partner"].disabled = employeeLocked;
  dom["trade-date"].disabled = employeeLocked;
  dom["trade-notes"].disabled = employeeLocked;
  // Employee import
  dom["import-file"].disabled = supervisorLocked;
  dom["preview-import-btn"].disabled = supervisorLocked;
  dom["apply-import-btn"].disabled = supervisorLocked || !state.importPreview || state.importPreview.errors.length > 0;
  dom["download-employee-template-btn"].disabled = supervisorLocked;
  // Unit import
  dom["unit-import-file"].disabled = supervisorLocked;
  dom["unit-preview-import-btn"].disabled = supervisorLocked;
  dom["unit-apply-import-btn"].disabled = supervisorLocked || !state.unitImportPreview || state.unitImportPreview.errors.length > 0;
  dom["download-unit-template-btn"].disabled = supervisorLocked;
  // D7FR roster import
  dom["roster-import-file"].disabled = supervisorLocked;
  dom["roster-preview-btn"].disabled = supervisorLocked;
  dom["roster-apply-btn"].disabled = supervisorLocked || !state.rosterImportPreview?.length;
  dom["employee-search"].disabled = supervisorLocked;
  dom["roster-shift-filter"].disabled = supervisorLocked;
  dom["employee-status-filter"].disabled = supervisorLocked;
  dom["roster-sort"].disabled = supervisorLocked;

  dom.mainContent.classList.toggle("is-locked", !state.isAuthenticated);
  dom.accessGate.classList.toggle("hidden", state.isAuthenticated);
  // On mobile: show sidebar (login) above main content when signed out, below when signed in
  dom.appShell.classList.toggle("is-authenticated", state.isAuthenticated);

  // Auth panel — toggle signed-in / signed-out views
  dom["auth-signed-out"].classList.toggle("hidden", state.isAuthenticated);
  dom["auth-signed-in"].classList.toggle("hidden", !state.isAuthenticated);
  if (state.isAuthenticated) {
    const displayName = state.currentUserDisplayName || "User";
    const title = state.currentUserTitle || "";
    dom["auth-user-name"].textContent = displayName;
    dom["auth-user-title"].textContent = title;
    const initials = displayName.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    dom["auth-user-initials"].textContent = initials;
    const isSup = state.currentRole === "supervisor";
    dom["auth-role-badge"].textContent = isSup ? "Supervisor" : "Employee";
    dom["auth-role-badge"].className = `badge ${isSup ? "badge-warning" : "badge-soft"}`;
  } else {
    dom["auth-role-badge"].textContent = "Department access";
    dom["auth-role-badge"].className = "badge badge-soft";
  }

  if (supervisorLocked) {
    dom["publish-btn"].title = "Supervisor sign-in required";
  } else {
    dom["publish-btn"].removeAttribute("title");
  }

  if (!canAccessAdmin()) {
    state.activeSurface = "schedule";
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

function attachUnitMoveEvents() {
  [...document.querySelectorAll(".assignment-select")].forEach((select) => {
    select.addEventListener("change", () => {
      if (!select.value) return;
      const date = select.dataset.date;
      const unitId = select.dataset.unit;
      const employee = employeeById(select.value);
      if (!employee) return;
      const existingAssignments = getAssignments(date, unitId);
      // Prevent adding the same employee to the same unit twice, but allow them on multiple units
      if (existingAssignments.find((person) => person.id === employee.id)) {
        select.value = "";
        return;
      }
      if (!state.assignments[date]) state.assignments[date] = {};
      // A human touched this unit-day: stamp EVERY row on it manual so a future
      // template push skips the whole crew, not just the seat that changed.
      state.assignments[date][unitId] = markManual([...existingAssignments, employee]);
      addAudit(`${employee.name} added to ${unitById(unitId)?.name} on ${formatDate(date)}.`, currentUserName());
      createNotification(`${employee.name} assigned to ${unitById(unitId)?.name} for ${formatDate(date)}.`, "email", currentUserName());
      render();
      persistAppState("Assignment updated");
    });
  });

  [...document.querySelectorAll("[data-remove-assignment]")].forEach((button) => {
    button.addEventListener("click", () => {
      const date = button.dataset.removeDate;
      const unitId = button.dataset.removeUnit;
      const employeeId = button.dataset.removeAssignment;
      if (!state.assignments[date]) return;
      state.assignments[date][unitId] = markManual(
        getAssignments(date, unitId).filter((person) => person.id !== employeeId)
      );
      addAudit(`${employeeById(employeeId)?.name || "Employee"} removed from ${unitById(unitId)?.name} on ${formatDate(date)}.`, currentUserName());
      createNotification(`${employeeById(employeeId)?.name || "Employee"} removed from ${unitById(unitId)?.name} for ${formatDate(date)}.`, "email", currentUserName());
      render();
      persistAppState("Assignment removed");
    });
  });
}

function attachCalendarNavEvents() {
  [...document.querySelectorAll("[data-nav-date]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentDate = btn.dataset.navDate;
      state.currentView = "day";
      render();
    });
  });
}

// ─── Microsoft Entra ID (MSAL) Auth ─────────────────────────────────────────

async function initMsal() {
  if (!window.msal) {
    console.error("MSAL: library did not load — check network/CSP for alcdn.msauth.net");
    dom["auth-message"].textContent = "Sign-in unavailable — please refresh the page.";
    return;
  }
  if (!window.APP_CONFIG?.msalConfig) {
    console.error("MSAL: APP_CONFIG.msalConfig is missing");
    dom["auth-message"].textContent = "Sign-in unavailable — configuration error.";
    return;
  }
  try {
    msalInstance = new msal.PublicClientApplication(window.APP_CONFIG.msalConfig);
    await msalInstance.initialize();
    // Attempt silent re-login from a cached session
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
        // Pull the real schedule from the API before syncing identity, so the
        // signed-in user is matched against the actual roster.
        await loadRemoteStateAfterAuth();
        await setAuthFromToken(tokenResponse.accessToken, accounts[0]);
      } catch (silentErr) {
        // No cached session — user must sign in manually; not an error
        console.info("MSAL: no valid cached session, interactive sign-in required.");
      }
    }
  } catch (err) {
    console.error("MSAL init failed:", err.errorCode || err.message, err);
    dom["auth-message"].textContent = "Sign-in unavailable — please refresh the page.";
    msalInstance = null; // ensure null so button gives feedback below
  }
}

async function handleMsalLogin() {
  if (!msalInstance) {
    dom["auth-message"].textContent = "Sign-in unavailable — please refresh the page.";
    showToast("Microsoft sign-in is not ready. Try refreshing.", "error");
    return;
  }
  dom["auth-message"].textContent = "Opening Microsoft sign-in…";
  try {
    // Use blank.html as the popup redirect target — avoids re-running the full
    // app inside the popup, which can cause MSAL to fail silently.
    const popupRedirectUri = window.location.origin + "/blank.html";
    const loginResponse = await msalInstance.loginPopup({
      scopes: GRAPH_SCOPES,
      redirectUri: popupRedirectUri,
    });
    const tokenResponse = await msalInstance.acquireTokenSilent({
      scopes: GRAPH_SCOPES,
      account: loginResponse.account,
      redirectUri: popupRedirectUri,
    });
    // Load the real schedule from the API before syncing identity against it.
    await loadRemoteStateAfterAuth();
    await setAuthFromToken(tokenResponse.accessToken, loginResponse.account);
    render();
    // Supabase mode persists the identity link on sign-in. In API mode we must
    // NOT save here -- the server roster is authoritative and a save before any
    // real edit could overwrite it. Edits will persist normally afterwards.
    if (!usesSchedulerApi()) persistAppState("User signed in");
  } catch (err) {
    if (err.errorCode === "user_cancelled" || err.message?.includes("user_cancelled")) {
      dom["auth-message"].textContent = "Sign-in cancelled.";
    } else {
      console.error("MSAL login error:", err.errorCode || err.message, err);
      dom["auth-message"].textContent = "Sign-in failed — please try again.";
      showToast(`Microsoft sign-in failed: ${err.errorCode || err.message}`, "error");
    }
  }
}

function handleMsalSignOut() {
  state.isAuthenticated = false;
  state.currentUserId = null;
  state.currentUserDisplayName = null;
  state.currentUserTitle = null;
  state.currentUserEmail = null;
  state.currentUserEntraId = null;
  state.currentRole = "employee";
  state.loginRole = "employee";
  render();
  if (msalInstance) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.logoutPopup({ account: accounts[0] }).catch(() => {});
    }
  }
}

async function setAuthFromToken(accessToken, account) {
  const profile = await fetchGraphProfile(accessToken);
  const entraJobTitle = (profile.jobTitle || "").trim();
  const displayName = (profile.displayName || account.name || "Unknown").trim();
  const email = (profile.mail || profile.userPrincipalName || account.username || "").trim();
  const entraId = profile.id || account.localAccountId;
  // Sync identity — roster title/certs take precedence over Entra ID job title
  const employee = syncEmployeeFromEntraProfile({ entraId, name: displayName, email, entraJobTitle });
  state.currentUserId = employee.id;
  state.currentUserDisplayName = displayName;
  // Use the roster title (authoritative); fall back to what Entra ID reports
  state.currentUserTitle = employee.title || entraJobTitle;
  state.currentUserEmail = email;
  state.currentUserEntraId = entraId;
  // Role is derived from the matched/updated employee record, not raw Entra ID title
  state.loginRole = employee.isSupervisor ? "supervisor" : "employee";
  state.currentRole = state.loginRole;
  state.isAuthenticated = true;
}

async function fetchGraphProfile(accessToken) {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  return res.json();
}

function syncEmployeeFromEntraProfile({ entraId, name, email, entraJobTitle }) {
  // Match by Entra ID first, then email — links existing roster entries to their Azure AD identity
  let emp = state.employees.find(
    (e) => (e.entraId && e.entraId === entraId) || (e.email && e.email.toLowerCase() === email.toLowerCase())
  );
  if (emp) {
    // Roster is authoritative for title, shift, and certs.
    // Entra ID only provides identity fields (who you are, not what rank you hold).
    emp.entraId = entraId;
    emp.name = name;
    emp.email = email;
    emp.status = "active";
    // Only apply Entra ID job title if the roster record has no title yet
    if (!emp.title && entraJobTitle) {
      emp.title = entraJobTitle;
      emp.certs = defaultCertsForTitle(entraJobTitle);
    }
    // Always recalculate isSupervisor from the current (possibly roster-set) title
    emp.isSupervisor = SUPERVISOR_TITLES.some((t) => t.toLowerCase() === (emp.title || "").toLowerCase());
  } else {
    // No roster match — create a placeholder record using whatever Entra ID provides.
    // A supervisor should import the full roster so new logins get linked properly.
    emp = {
      id: `ENTRA-${entraId.slice(-8).toUpperCase()}`,
      entraId,
      name,
      shift: null,
      title: entraJobTitle || "",
      certs: defaultCertsForTitle(entraJobTitle),
      email,
      isSupervisor: SUPERVISOR_TITLES.some((t) => t.toLowerCase() === (entraJobTitle || "").toLowerCase()),
      status: "active",
    };
    state.employees.push(emp);
    addAudit(`${name} added to roster via Entra ID (unmatched — import roster to assign title).`, "System");
  }
  return emp;
}

function defaultCertsForTitle(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("ff/emtp") || t.includes("paramedic")) return ["paramedic", "emt"];
  if (t.includes("ff/emt")) return ["emt"];
  if (t.includes("engineer")) return ["engineer", "emt"];
  if (t.includes("lieutenant") || t.includes("captain")) return ["officer", "emt"];
  if (t.includes("batt") || t.includes("chief") || t.includes("div")) return ["officer"];
  if (t.includes("mof")) return ["officer", "emt"];
  return ["emt"];
}

// ─────────────────────────────────────────────────────────────────────────────

function handlePublish() {
  if (state.currentRole !== "supervisor") {
    showToast("Supervisor sign-in required to publish schedules.", "error");
    return;
  }
  // Publishing notifies the department, so surface the gaps first. Publish time
  // is the last cheap moment to catch an unfilled seat.
  const range = getDateRange();
  const openSeats = range.flatMap((d) => getStaffingAlerts(d)).filter((a) => a.level === "danger").length;
  const label = range.length > 1
    ? `${formatDate(range[0])} through ${formatDate(range[range.length - 1])}`
    : formatDate(range[0]);
  const warning = openSeats > 0
    ? `\n\nWARNING: ${openSeats} required seat${openSeats === 1 ? " is" : "s are"} still unfilled.`
    : "\n\nAll required seats are filled.";
  if (!window.confirm(`Publish the ${state.currentView} schedule for ${label}?${warning}\n\nThis notifies the department.`)) {
    return;
  }
  state.scheduleStatus = "published";
  dom["schedule-status"].value = "published";
  addAudit(`Published ${state.currentView} schedule anchored on ${formatDate(state.currentDate)} (${openSeats} unfilled required seats).`, currentUserName());
  createNotification(`Schedule published for ${formatDate(state.currentDate)}.`, "email", currentUserName());
  render();
  persistAppState("Schedule published");
}


function createTradeRequest() {
  if (!state.isAuthenticated) {
    showToast("Sign-in required to submit a trade request.", "error");
    return;
  }
  const ownerId = dom["trade-owner"].value;
  const partnerId = dom["trade-partner"].value;
  const date = dom["trade-date"].value;
  if (!ownerId || !partnerId || ownerId === partnerId) return;
  const trade = {
    id: `TR-${Date.now()}`,
    status: "pending",
    employeeId: ownerId,
    partnerId,
    date,
    notes: dom["trade-notes"].value || "No notes provided",
    type: "trade",
    createdBy: currentUserName(),
  };
  state.trades.push(trade);
  addAudit(`Trade request created for ${formatDate(date)}.`, currentUserName());
  createNotification(`Trade request submitted for ${formatDate(date)} and routed for supervisor approval.`, "email", currentUserName());
  dom["trade-notes"].value = "";
  render();
  persistAppState("Trade request created");
}

// One list, two audiences. Supervisors see every gap with notify/award controls;
// employees see only gaps they are CREDENTIALED for and can apply to or withdraw
// from. Same data, so the two can never drift apart.
function renderCoveragePanel() {
  const listEl = dom["coverage-list"];
  if (!listEl) return;
  const isSupervisor = state.currentRole === "supervisor";
  const days = Math.min(60, Math.max(1, Number(dom["coverage-days"]?.value) || 14));
  const me = state.currentUserId;
  const myShift = employeeById(me)?.shift || null;

  // Battalion chiefs run one platoon, so default to their own and let them widen
  // it. "mine" is stored rather than the literal letter so the filter follows the
  // signed-in user instead of sticking to whoever looked first.
  if (state.coverageShift === undefined) state.coverageShift = myShift ? "mine" : "all";
  const filter = state.coverageShift;
  const wantShift = filter === "mine" ? myShift : (["A", "B", "C"].includes(filter) ? filter : null);
  renderCoverageShiftOptions(myShift);

  const allGaps = coverageGaps(todayIso(), days);
  const gaps = wantShift ? allGaps.filter((g) => getShiftForDate(g.date) === wantShift) : allGaps;

  const visible = isSupervisor
    ? gaps
    : gaps.filter((g) => canApplyToGap(g, me) || (g.post?.applicants || []).includes(me));

  if (dom["coverage-summary"]) {
    const scope = wantShift ? `${wantShift} shift` : "all platoons";
    dom["coverage-summary"].textContent = isSupervisor
      ? `${gaps.length} unfilled seat${gaps.length === 1 ? "" : "s"} • ${scope} • next ${days} days.`
      : `${visible.length} shift${visible.length === 1 ? "" : "s"} you qualify for • ${scope} • next ${days} days.`;
  }

  if (!visible.length) {
    listEl.innerHTML = `<div class="empty-state">${
      isSupervisor
        ? `No coverage gaps${wantShift ? ` on ${wantShift} shift` : ""} — every required seat is filled.`
        : `No open shifts you qualify for${wantShift ? ` on ${wantShift} shift` : ""} right now.`
    }</div>`;
    updateCoverageBadge(gaps, visible, isSupervisor);
    return;
  }

  listEl.innerHTML = visible.map((gap) => {
    const post = gap.post;
    const applicants = post?.applicants || [];
    const applied = applicants.includes(me);
    const eligibleCount = eligibleForGap(gap).length;

    const applicantRows = isSupervisor && applicants.length
      ? `<div class="applicant-list">${applicants.map((id) => {
          const emp = employeeById(id);
          if (!emp) return "";
          return `<div class="applicant-row">
            <span><strong>${escapeHtml(emp.name)}</strong> — ${escapeHtml(emp.title || "—")}
              <span class="pill pill-cap" data-cap="${escapeHtml(gap.cap || "")}">${escapeHtml(gap.need || "any")}</span></span>
            <span class="button-row">
              <button class="button button-primary button-small" data-award-post="${post.id}" data-award-emp="${id}">Award</button>
              <button class="button button-secondary button-small" data-decline-post="${post.id}" data-decline-emp="${id}">Decline</button>
            </span>
          </div>`;
        }).join("")}</div>`
      : isSupervisor
        ? `<p class="helper-text">No applicants yet${post?.notifiedAt ? " — alert sent" : ""}.</p>`
        : "";

    const supervisorActions = isSupervisor
      ? `<button class="button button-secondary button-small" data-notify-gap="${gap.key}">
           ${post?.notifiedAt ? "Re-send alert" : `Notify ${eligibleCount} qualified`}
         </button>`
      : applied
        ? `<button class="button button-secondary button-small" data-withdraw-post="${post.id}">Withdraw</button>`
        : `<button class="button button-primary button-small" data-apply-gap="${gap.key}">Sign up</button>`;

    return `<article class="queue-item coverage-item">
      <div class="unit-card-header">
        <div>
          <strong>${escapeHtml(gap.unitName)} — ${escapeHtml(gap.label)}</strong>
          <p class="helper-text">${formatDate(gap.date)} • needs ${escapeHtml(gap.need || "any qualified rider")}
            ${applicants.length ? ` • ${applicants.length} applicant${applicants.length === 1 ? "" : "s"}` : ""}</p>
        </div>
        <div class="unit-card-actions">
          ${post?.status === "awarded" ? '<span class="badge badge-success">Awarded</span>' : supervisorActions}
        </div>
      </div>
      ${applicantRows}
    </article>`;
  }).join("");

  updateCoverageBadge(gaps, visible, isSupervisor);
  attachCoverageEvents(gaps);
}

// Supervisors are alerted to gaps with people waiting on a decision; employees to
// shifts they could still pick up.
function renderCoverageShiftOptions(myShift) {
  const el = dom["coverage-shift"];
  if (!el) return;
  const opts = [
    ...(myShift ? [{ value: "mine", label: `My shift (${myShift})` }] : []),
    { value: "A", label: "A shift" },
    { value: "B", label: "B shift" },
    { value: "C", label: "C shift" },
    { value: "all", label: "All platoons" },
  ];
  const markup = opts
    .map((o) => `<option value="${o.value}" ${o.value === state.coverageShift ? "selected" : ""}>${o.label}</option>`)
    .join("");
  if (el.innerHTML !== markup) el.innerHTML = markup;
}

function updateCoverageBadge(gaps, visible, isSupervisor) {
  const el = dom["coverage-badge"];
  if (!el) return;
  const count = isSupervisor
    ? gaps.filter((g) => (g.post?.applicants || []).length && g.post?.status !== "awarded").length
    : visible.filter((g) => !(g.post?.applicants || []).includes(state.currentUserId)).length;
  el.textContent = String(count);
  el.classList.toggle("hidden", count === 0);
}

function attachCoverageEvents(gaps) {
  const root = dom["coverage-list"];
  if (!root) return;
  root.querySelectorAll("[data-notify-gap]").forEach((b) =>
    b.addEventListener("click", () => notifyGap(b.dataset.notifyGap, gaps)));
  root.querySelectorAll("[data-apply-gap]").forEach((b) =>
    b.addEventListener("click", () => applyForGap(b.dataset.applyGap, gaps)));
  root.querySelectorAll("[data-withdraw-post]").forEach((b) =>
    b.addEventListener("click", () => withdrawFromGap(b.dataset.withdrawPost)));
  root.querySelectorAll("[data-award-post]").forEach((b) =>
    b.addEventListener("click", () => awardOvertime(b.dataset.awardPost, b.dataset.awardEmp)));
  root.querySelectorAll("[data-decline-post]").forEach((b) =>
    b.addEventListener("click", () => declineApplicant(b.dataset.declinePost, b.dataset.declineEmp)));
}

// ─── Mandatory backfill (forced hire) ────────────────────────────────────────
// NOT a rotation the system derives. Employees pick their dates at the start of
// the fiscal year and supervisors enter them for the year ahead. The fairness
// decision was already made when people picked, so this is stored, not computed.

// WHICH PLATOON CAN BE FORCED ON A DATE.
//
// Nobody may be made to work 72 hours straight, so a platoon can only be brought
// in on a date it works NEITHER the day before NOR the day after. On a 48/96
// rotation that leaves exactly one eligible platoon per date:
//
//   C shift day 1 -> B just finished a 48, so B would hit 72. Forced pool is A.
//   C shift day 2 -> A starts a 48 tomorrow, so A would hit 72. Forced pool is B.
//
// Derived from rotationPattern rather than hardcoded, so changing the rotation
// changes this automatically instead of silently breaking it.
function mandatoryEligibleShift(date) {
  const onDuty = getShiftForDate(date);
  const prev = getShiftForDate(addDays(date, -1));
  const next = getShiftForDate(addDays(date, 1));
  const candidates = ["A", "B", "C"].filter((sh) => sh !== onDuty && sh !== prev && sh !== next);
  return candidates.length === 1 ? candidates[0] : null;
}

// Fiscal year runs Oct 1 -> Sep 30 and is NAMED BY ITS START YEAR.
// FY2027 = 2026-10-01 .. 2027-09-30.
function fiscalYearBounds(startYear) {
  return { start: `${startYear}-10-01`, end: `${startYear + 1}-09-30` };
}

function currentFiscalYear(dateIso) {
  const d = dateIso || todayIso();
  const [y, m] = d.split("-").map(Number);
  return m >= 10 ? y : y - 1;
}

// The year supervisors are PREPARING, which is not the year we are in. Picks are
// collected before Oct 1 for the year about to start, so from July onward the
// useful default is the upcoming fiscal year, not the one running out.
function planningFiscalYear(dateIso) {
  const d = dateIso || todayIso();
  const [y, m] = d.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

// The whole point of generating rather than handing over a blank sheet: the app
// already knows which platoon is on duty on every date, so supervisors never have
// to work that out by hand — which is where the errors would come from.
function buildMandatoryTemplateCsv(startYear, platoon) {
  const { start, end } = fiscalYearBounds(startYear);
  // The platoon column supervisors actually need is the FORCED pool, not who is
  // on duty — those are different platoons on every date. Both are emitted so the
  // sheet is self-explanatory.
  const rows = ["date,onDutyPlatoon,mandatoryPlatoon,employeeEmailOrBadge,order,notes"];
  let date = start;
  while (date <= end) {
    const onDuty = getShiftForDate(date);
    const eligible = mandatoryEligibleShift(date);
    if (!platoon || platoon === "all" || eligible === platoon) {
      rows.push(`${date},${onDuty},${eligible || ""},,1,`);
    }
    date = addDays(date, 1);
  }
  return rows.join("\n");
}

function downloadMandatoryTemplate() {
  const startYear = Number(dom["mandatory-fy"]?.value) || planningFiscalYear();
  const platoon = dom["mandatory-platoon"]?.value || "all";
  const label = platoon === "all" ? "all" : platoon.toLowerCase();
  downloadCsv(`d7fr-mandatory-fy${startYear + 1}-${label}.csv`, buildMandatoryTemplateCsv(startYear, platoon));
}

// Matched on email first, then badge — the two identifiers a supervisor actually
// has to hand. Employee ids are internal and nobody types those.
function findEmployeeByIdentifier(token) {
  const t = String(token || "").trim().toLowerCase();
  if (!t) return null;
  return (
    state.employees.find((e) => (e.email || "").toLowerCase() === t) ||
    state.employees.find((e) => String(e.badge || "").toLowerCase() === t) ||
    state.employees.find((e) => (e.id || "").toLowerCase() === t) ||
    null
  );
}

function previewMandatoryImport(text) {
  const rows = parseCsv(text);
  const errors = [];
  const warnings = [];
  const validRows = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const line = index + 2;
    const date = (row.date || "").trim();
    const token = (row.employeeemailorbadge || row.employee || "").trim();
    if (!date && !token) return;                       // untouched template row
    if (!token) return;                                // date with nobody picked yet
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ message: `Row ${line}: date must be YYYY-MM-DD (got "${date}").` });
      return;
    }
    const emp = findEmployeeByIdentifier(token);
    if (!emp) {
      errors.push({ message: `Row ${line}: no employee matches "${token}".` });
      return;
    }
    if (emp.status === "archived") {
      warnings.push({ message: `Row ${line}: ${emp.name} is archived.` });
    }
    const key = `${emp.id}|${date}`;
    if (seen.has(key)) {
      errors.push({ message: `Row ${line}: ${emp.name} listed twice for ${date}.` });
      return;
    }
    seen.add(key);

    // HARD ERROR, not a warning: forcing a platoon that works the adjacent day
    // means 72 consecutive hours. That is a rest-rule violation, not a typo.
    const eligible = mandatoryEligibleShift(date);
    if (!emp.shift) {
      errors.push({ message: `Row ${line}: ${emp.name} has no platoon assigned.` });
      return;
    }
    if (eligible && emp.shift !== eligible) {
      errors.push({
        message: `Row ${line}: ${emp.name} is ${emp.shift} shift, but only ${eligible} shift can be ` +
                 `forced on ${date} (${getShiftForDate(date)} shift is on duty). ` +
                 `${emp.shift} shift works an adjacent day — that would be 72 hours straight.`,
      });
      return;
    }
    validRows.push({
      employeeId: emp.id,
      date,
      order: Number(row.order) > 0 ? Number(row.order) : 1,
      fiscalYear: currentFiscalYear(date),
      notes: (row.notes || "").slice(0, 200),
    });
  });

  return { rows, errors, warnings, validRows, stats: { valid: validRows.length } };
}

function applyMandatoryImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["mandatory-import-message"].textContent = "Supervisor sign-in is required.";
    return;
  }
  const preview = state.mandatoryImportPreview;
  if (!preview || preview.errors.length) {
    dom["mandatory-import-message"].textContent = "Resolve import errors before applying.";
    return;
  }
  if (!Array.isArray(state.mandatoryBackfill)) state.mandatoryBackfill = [];
  let added = 0;
  let updated = 0;
  preview.validRows.forEach((row) => {
    const existing = state.mandatoryBackfill.find(
      (m) => m.employeeId === row.employeeId && m.date === row.date
    );
    if (existing) { Object.assign(existing, row); updated += 1; }
    else { state.mandatoryBackfill.push(row); added += 1; }
  });
  state.mandatoryImportPreview = null;
  addAudit(`Mandatory backfill import applied: ${added} added, ${updated} updated.`, currentUserName());
  dom["mandatory-import-file"].value = "";
  render();
  persistAppState("Mandatory backfill imported");
  showToast(`Mandatory list updated — ${added} added, ${updated} updated.`, "success");
}

// Who is designated for a date, first-called first.
async function handleMandatoryPreview() {
  if (state.currentRole !== "supervisor") {
    dom["mandatory-import-message"].textContent = "Supervisor sign-in is required.";
    return;
  }
  const file = dom["mandatory-import-file"].files[0];
  if (!file) {
    dom["mandatory-import-message"].textContent = "Choose the completed CSV first.";
    return;
  }
  const text = await file.text();
  const preview = previewMandatoryImport(text);
  state.mandatoryImportPreview = { ...preview, type: "mandatory" };
  const { errors, warnings, validRows } = preview;
  dom["mandatory-import-message"].textContent = errors.length
    ? `${errors.length} error(s) — nothing will be applied. ${errors.slice(0, 2).map((e) => e.message).join(" ")}`
    : `${validRows.length} pick(s) ready${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`;
  renderMandatoryImportPreview();
}

function renderMandatoryImportPreview() {
  const el = dom["mandatory-import-preview"];
  if (!el) return;
  const preview = state.mandatoryImportPreview;
  el.innerHTML = preview ? buildImportPreviewHtml(preview, "Mandatory") : "";
}

// A supervisor needs to see coverage of the LIST itself: which duty dates still
// have nobody designated. That is the gap that matters before Oct 1.
function renderMandatorySummary() {
  const el = dom["mandatory-summary"];
  if (!el) return;
  const startYear = Number(dom["mandatory-fy"]?.value) || planningFiscalYear();
  const { start, end } = fiscalYearBounds(startYear);
  const picks = (state.mandatoryBackfill || []).filter((m) => m.date >= start && m.date <= end);
  const byDate = new Set(picks.map((m) => m.date));

  let dutyDates = 0;
  let covered = 0;
  let date = start;
  while (date <= end) {
    dutyDates += 1;
    if (byDate.has(date)) covered += 1;
    date = addDays(date, 1);
  }
  const people = new Set(picks.map((m) => m.employeeId)).size;
  el.innerHTML = `<div class="status-box ${covered < dutyDates ? "status-box-warning" : ""}">
    <strong>FY${startYear + 1}</strong> (${formatDate(start)} – ${formatDate(end)}):
    ${covered} of ${dutyDates} dates have someone designated, across ${people}
    ${people === 1 ? "person" : "people"}.
    ${covered < dutyDates ? `<br /><span class="helper-text">${dutyDates - covered} dates still have nobody on the mandatory list.</span>` : ""}
  </div>`;
}

function mandatoryForDate(date) {
  return (state.mandatoryBackfill || [])
    .filter((m) => m.date === date)
    .sort((a, b) => (a.order || 1) - (b.order || 1))
    .map((m) => ({ ...m, employee: employeeById(m.employeeId) }))
    .filter((m) => m.employee);
}

// ─── Overtime: gaps, applications, awards ────────────────────────────────────
// The OPPORTUNITY is the staffing gap itself. A post records that the gap is open
// for applications; "notify" records that qualified people were told. That is why
// an employee can apply to a gap nobody has announced yet — applying creates the
// post in "requested" state so a supervisor sees the demand.

// A gap is identified by unit + date + seat role. Derived from the real schedule,
// never typed in, so a post can't ask for a qualification the seat doesn't need.
function gapKey(unitId, date, role) {
  return `${unitId}|${date}|${role}`;
}

// Every unfilled REQUIRED seat across a date range, with the capability it needs.
function coverageGaps(startDate, days) {
  const gaps = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(startDate, offset);
    unitsForDate(date).forEach((unit) => {
      const positions = UNIT_POSITION_REQUIREMENTS[unit.type];
      if (!positions) return;
      const { seats } = assignPeopleToSeats(unit.type, getAssignments(date, unit.id));
      seats.forEach((seat) => {
        if (seat.person || !seatIsRequired(seat.pos)) return;
        gaps.push({
          key: gapKey(unit.id, date, seat.pos.role),
          unitId: unit.id, unitName: unit.name, date,
          role: seat.pos.role, label: seat.pos.label,
          cap: seat.pos.cap, need: seatNeedLabel(seat.pos),
          post: overtimePostForGap(unit.id, date, seat.pos.role),
        });
      });
    });
  }
  return gaps;
}

function overtimePostForGap(unitId, date, role) {
  return (state.overtimePosts || []).find(
    (p) => p.unitId === unitId && p.date === date && p.role === role
  ) || null;
}

// Who may work this gap: credentialed for the seat, active, and NOT already on
// the schedule that date. Same-day double-booking is barred department-wide.
function eligibleForGap(gap) {
  const booked = assignedEmployeeIdsForDate(gap.date);
  const pos = { cap: gap.cap };
  return activeEmployees().filter((e) => !booked.has(e.id) && seatAccepts(pos, e));
}

function canApplyToGap(gap, employeeId) {
  return eligibleForGap(gap).some((e) => e.id === employeeId);
}

function ensureOvertimePost(gap, status) {
  let post = overtimePostForGap(gap.unitId, gap.date, gap.role);
  if (post) return post;
  post = {
    id: `OT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: status || "requested",
    unitId: gap.unitId,
    date: gap.date,
    role: gap.role,
    requiredCap: Array.isArray(gap.cap) ? gap.cap.join("|") : (gap.cap || ""),
    qualification: gap.need,        // legacy display field
    reportTime: DEFAULT_REPORT_TIME,
    applicants: [],
    notifiedAt: null,
  };
  state.overtimePosts.push(post);
  return post;
}

// Supervisor announces gaps to everyone qualified. Queues one notification per
// recipient — nothing sends yet, but the outbox is real and persisted, so turning
// on email (or SMS) later delivers these rather than starting from scratch.
function notifyGap(gapKeyStr, gaps) {
  if (state.currentRole !== "supervisor") {
    showToast("Supervisor sign-in required to send coverage alerts.", "error");
    return;
  }
  const gap = gaps.find((g) => g.key === gapKeyStr);
  if (!gap) return;
  const post = ensureOvertimePost(gap, "open");
  post.status = "open";
  post.notifiedAt = new Date().toISOString();

  const recipients = eligibleForGap(gap);
  recipients.forEach((emp) => {
    queueNotification({
      recipientId: emp.id,
      channel: "email",
      subject: `Overtime available — ${gap.unitName} ${formatDate(gap.date)}`,
      message: `${gap.unitName} needs a ${gap.label}${gap.need ? ` (${gap.need})` : ""} on ` +
               `${formatDate(gap.date)}. Sign in to the scheduler to apply.`,
      relatedKind: "overtime",
      relatedId: post.id,
    });
  });
  addAudit(
    `Coverage alert sent for ${gap.unitName} ${gap.label} on ${formatDate(gap.date)} (${recipients.length} qualified).`,
    currentUserName()
  );
  render();
  persistAppState("Coverage alert queued");
  showToast(`Queued for ${recipients.length} qualified ${recipients.length === 1 ? "person" : "people"}.`, "success");
}

// Employee self-service. Works whether or not the gap has been announced.
function applyForGap(gapKeyStr, gaps) {
  const gap = gaps.find((g) => g.key === gapKeyStr);
  if (!gap || !state.currentUserId) return;
  if (!canApplyToGap(gap, state.currentUserId)) {
    showToast("You are not eligible for this shift.", "error");
    return;
  }
  const post = ensureOvertimePost(gap, "requested");
  if (post.applicants.includes(state.currentUserId)) return;
  post.applicants = [...post.applicants, state.currentUserId];
  addAudit(`${currentUserName()} applied for overtime — ${gap.unitName} ${gap.label} on ${formatDate(gap.date)}.`, currentUserName());
  render();
  persistAppState("Overtime application submitted");
  showToast("Application submitted.", "success");
}

function withdrawFromGap(postId) {
  const post = (state.overtimePosts || []).find((p) => p.id === postId);
  if (!post || !state.currentUserId) return;
  if (post.status === "awarded") {
    showToast("This shift has already been awarded.", "error");
    return;
  }
  post.applicants = (post.applicants || []).filter((id) => id !== state.currentUserId);
  addAudit(`${currentUserName()} withdrew from overtime on ${formatDate(post.date)}.`, currentUserName());
  render();
  persistAppState("Overtime application withdrawn");
  showToast("Application withdrawn.", "success");
}

// Supervisor picks the winner — never automatic. Awarding writes a REAL assignment
// (marked manual so a template push can't overwrite it) and tells every applicant
// where they stand, successful or not.
function awardOvertime(postId, employeeId) {
  if (state.currentRole !== "supervisor") {
    showToast("Supervisor sign-in required to award overtime.", "error");
    return;
  }
  const post = (state.overtimePosts || []).find((p) => p.id === postId);
  const employee = employeeById(employeeId);
  if (!post || !employee) return;
  if (assignedEmployeeIdsForDate(post.date).has(employeeId)) {
    showToast(`${employee.name} is already on the schedule that day.`, "error");
    return;
  }

  post.status = "awarded";
  post.approvedEmployeeId = employeeId;

  if (!state.assignments[post.date]) state.assignments[post.date] = {};
  const existing = getAssignments(post.date, post.unitId);
  state.assignments[post.date][post.unitId] = markManual([...existing, employee]);

  const unitName = unitById(post.unitId)?.name || post.unitId;
  queueNotification({
    recipientId: employeeId,
    channel: "email",
    subject: `Overtime awarded — ${unitName} ${formatDate(post.date)}`,
    message: `You have been awarded the ${post.role || "open"} seat on ${unitName} for ` +
             `${formatDate(post.date)}. Report at ${post.reportTime || DEFAULT_REPORT_TIME}.`,
    relatedKind: "overtime",
    relatedId: post.id,
  });
  (post.applicants || []).filter((id) => id !== employeeId).forEach((id) => {
    queueNotification({
      recipientId: id,
      channel: "email",
      subject: `Overtime filled — ${unitName} ${formatDate(post.date)}`,
      message: `The ${post.role || "open"} seat on ${unitName} for ${formatDate(post.date)} ` +
               `has been filled. Thank you for volunteering.`,
      relatedKind: "overtime",
      relatedId: post.id,
    });
  });

  addAudit(`Overtime awarded to ${employee.name} — ${unitName} ${formatDate(post.date)}.`, currentUserName());
  render();
  persistAppState("Overtime awarded");
  showToast(`Awarded to ${employee.name}.`, "success");
}

function declineApplicant(postId, employeeId) {
  if (state.currentRole !== "supervisor") return;
  const post = (state.overtimePosts || []).find((p) => p.id === postId);
  const employee = employeeById(employeeId);
  if (!post || !employee) return;
  post.applicants = (post.applicants || []).filter((id) => id !== employeeId);
  queueNotification({
    recipientId: employeeId,
    channel: "email",
    subject: `Overtime application — ${formatDate(post.date)}`,
    message: `Your application for ${unitById(post.unitId)?.name || post.unitId} on ` +
             `${formatDate(post.date)} was not selected.`,
    relatedKind: "overtime",
    relatedId: post.id,
  });
  addAudit(`Overtime application declined for ${employee.name} on ${formatDate(post.date)}.`, currentUserName());
  render();
  persistAppState("Overtime application declined");
}

function createDailyDigest() {
  if (!state.isAuthenticated) {
    showToast("Sign-in required to send the daily digest.", "error");
    return;
  }
  createNotification(`Daily digest sent for ${formatDate(state.currentDate)} to on-duty personnel.`, "email", "System");
  addAudit(`Daily digest generated for ${formatDate(state.currentDate)}.`, "System");
  render();
  persistAppState("Daily digest created");
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function previewEmployeeImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["import-message"].textContent = "Supervisor sign-in is required to preview imports.";
    return;
  }
  const file = dom["import-file"].files[0];
  if (!file) {
    dom["import-message"].textContent = "Choose a CSV file first.";
    return;
  }
  const raw = await file.text();
  const rows = parseCsv(raw);
  if (!rows.length) {
    state.importPreview = { type: "employees", rows: [], errors: [{ message: "The CSV did not contain any data rows." }], warnings: [], validRows: [], stats: { valid: 0 } };
    dom["import-message"].textContent = "The selected CSV was empty.";
    render();
    return;
  }
  const preview = validateEmployeeImport(rows);
  state.importPreview = { ...preview, type: "employees" };
  if (preview.errors.length) {
    dom["import-message"].textContent = `Preview found ${preview.errors.length} error(s). ${preview.errors.slice(0, 2).map((e) => e.message).join(" ")}`;
  } else if (preview.warnings.length) {
    dom["import-message"].textContent = `Preview ready with ${preview.warnings.length} warning(s). Review before applying.`;
  } else {
    dom["import-message"].textContent = `Preview ready for ${rows.length} row(s). No blocking errors.`;
  }
  render();
  dom["import-preview"].scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyEmployeeImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["import-message"].textContent = "Supervisor sign-in is required.";
    return;
  }
  if (!state.importPreview) {
    dom["import-message"].textContent = "Preview the CSV before applying it.";
    return;
  }
  if (state.importPreview.errors.length) {
    dom["import-message"].textContent = "Resolve import errors before applying.";
    return;
  }
  mergeEmployees(state.importPreview.validRows);
  state.importPreview = null;
  seedAssignments(true);
  populateTradeSelects();
  addAudit("Employee CSV import applied.", currentUserName());
  createNotification("Employee import completed successfully.", "email", currentUserName());
  dom["import-message"].textContent = "Employee import applied and schedule regenerated.";
  dom["import-file"].value = "";
  render();
  showToast("Employee import applied successfully.", "success");
  persistAppState("Employee CSV import applied");
}

// ── D7FR Roster Import (.xlsx) ────────────────────────────────────────────────
// Parses the department's staff contact spreadsheet directly — no reformatting
// required. Section headers (A SHIFT / B SHIFT / C SHIFT) set the shift field.
// Rank prefixes in the name column determine the D7FR title; DSHS cert column
// resolves Firefighter entries to FF/EMTP or FF/EMT.

const D7FR_RANK_PREFIXES = [
  "Fire Chief", "Assistant Chief", "Division Chief", "Battalion Chief",
  "Captain", "Lieutenant", "Engineer", "EVT",
  "Prob. Paramedic", "Prob. Firefighter", "Firefighter", "Dr.",
];

function parseD7FRRankFromName(rawName) {
  const name = (rawName || "").trim();
  for (const prefix of D7FR_RANK_PREFIXES) {
    if (name.startsWith(prefix + " ")) {
      return { rank: prefix, cleanName: name.slice(prefix.length).trim().replace(/\.$/, "").trim() };
    }
  }
  return { rank: null, cleanName: name };
}

function d7frRankToTitle(rank, dshsCert) {
  const cert = (dshsCert || "").toString().trim().toUpperCase();
  const rankMap = {
    "Fire Chief":       "Batt. Chief",
    "Assistant Chief":  "Div. Chief",
    "Division Chief":   "Div. Chief",
    "Battalion Chief":  "Batt. Chief",
    "Captain":          "Captain",
    "Lieutenant":       "Lieutenant",
    "Engineer":         "Engineer",
    "EVT":              "Engineer",   // Emergency Vehicle Technician — same apparatus role
  };
  if (rankMap[rank]) return rankMap[rank];
  // Firefighter-rank entries: cert level determines title
  if (rank === "Firefighter" || rank === "Prob. Firefighter" || rank === "Prob. Paramedic") {
    return cert === "PARAMEDIC" ? "FF/EMTP" : "FF/EMT";
  }
  return null; // Dr., unnamed admin support — no scheduling role, skip
}

// Parse an optional roster "Ride-up / Acting" cell into capability tokens.
// Free text like "Officer", "Driver", or "Acting Officer; Engineer" all work.
function parseRideUpTokens(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const out = [];
  if (t.includes("officer")) out.push("officer");
  if (t.includes("driver") || t.includes("engineer")) out.push("engineer");
  return Array.from(new Set(out));
}

function parseD7FRRosterXlsx(arrayBuffer) {
  if (!window.XLSX) throw new Error("SheetJS library not loaded — please refresh.");
  const workbook = window.XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const SECTION_SHIFTS = {
    "ADMINISTRATION": null,
    "A SHIFT": "A",
    "B SHIFT": "B",
    "C SHIFT": "C",
    "NEW HIRES": null,
  };

  let currentShift = null;
  const employees = [];

  for (const row of rows) {
    const col0 = (row[0] || "").toString().trim();
    const col1 = (row[1] || "").toString().trim();
    const col2 = (row[2] || "").toString().trim();
    const col3 = (row[3] || "").toString().trim();
    const col4 = (row[4] || "").toString().trim(); // optional Ride-up / Acting column

    // Section header row
    if (col0 in SECTION_SHIFTS) { currentShift = SECTION_SHIFTS[col0]; continue; }
    // Column header rows (Badge Number in col2) or shift aggregate email rows
    if (col2 === "Badge Number" || /^shift[abc]@/i.test(col1)) continue;
    // Empty rows or rows without a valid email
    if (!col0 || !col1 || !col1.includes("@")) continue;

    const { rank, cleanName } = parseD7FRRankFromName(col0);
    const title = d7frRankToTitle(rank, col3);
    if (!title) continue; // Skip Dr., unnamed admin support

    employees.push({
      name:       cleanName,
      email:      col1.toLowerCase(),
      badge:      col2,
      dshsCert:   col3 || "—",
      title,
      shift:      currentShift,
      certs:      defaultCertsForTitle(title),
      rideUp:     parseRideUpTokens(col4), // [] when the column is absent/blank
      isSupervisor: SUPERVISOR_TITLES.some((t) => t.toLowerCase() === title.toLowerCase()),
    });
  }
  return employees;
}

async function previewRosterImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["roster-import-message"].textContent = "Supervisor sign-in required.";
    return;
  }
  const file = dom["roster-import-file"].files[0];
  if (!file) { dom["roster-import-message"].textContent = "Choose an .xlsx file first."; return; }
  if (!window.XLSX) { dom["roster-import-message"].textContent = "Excel library not loaded — refresh the page."; return; }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseD7FRRosterXlsx(buffer);
    if (!parsed.length) { dom["roster-import-message"].textContent = "No valid employee rows found."; return; }

    // Annotate each entry. Three outcomes, matched by email (case-insensitive):
    //  - "add"       : not in the roster and not seen earlier in this file -> new record
    //  - "update"    : already in the roster -> refresh fields, never a 2nd record
    //  - "duplicate" : the same email appears more than once in THIS file -> skipped
    const seenEmails = new Set();
    state.rosterImportPreview = parsed.map((emp) => {
      const email = (emp.email || "").toLowerCase();
      const existing = state.employees.find(
        (e) => e.email && e.email.toLowerCase() === email
      );
      const inFileDuplicate = email && seenEmails.has(email);
      if (email) seenEmails.add(email);
      let action = "add";
      if (inFileDuplicate) action = "duplicate";
      else if (existing) action = "update";
      return {
        ...emp,
        _action: action,
        _existingTitle: existing?.title || null,
        _existingShift: existing?.shift || null,
        _dupReason: inFileDuplicate
          ? "listed more than once in this file"
          : (existing ? "already in roster" : null),
      };
    });

    const adds       = state.rosterImportPreview.filter((r) => r._action === "add").length;
    const updates    = state.rosterImportPreview.filter((r) => r._action === "update").length;
    const duplicates = state.rosterImportPreview.filter((r) => r._action === "duplicate").length;
    dom["roster-import-message"].textContent =
      `Preview ready — ${adds} new, ${updates} update(s)` +
      (duplicates ? `, ${duplicates} duplicate(s) skipped` : "") +
      `. Review below then click Apply Roster.`;
    render();
    dom["roster-import-preview"].scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error("Roster import error:", err);
    dom["roster-import-message"].textContent = `Error: ${err.message}`;
  }
}

function applyRosterImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["roster-import-message"].textContent = "Supervisor sign-in required.";
    return;
  }
  if (!state.rosterImportPreview?.length) {
    dom["roster-import-message"].textContent = "Preview the roster before applying.";
    return;
  }

  let added = 0, updated = 0, skipped = 0;
  const processedEmails = new Set();  // guard: never touch the same email twice in one apply
  state.rosterImportPreview.forEach((emp) => {
    const email = (emp.email || "").toLowerCase();
    // Skip in-file duplicates, and any email we've already handled this run.
    if (emp._action === "duplicate" || (email && processedEmails.has(email))) {
      skipped++;
      return;
    }
    if (email) processedEmails.add(email);

    const existing = state.employees.find(
      (e) => e.email && e.email.toLowerCase() === email
    );
    if (existing) {
      // Roster is authoritative — update title, shift, certs, badge. Never a 2nd record.
      existing.name        = emp.name;
      existing.title       = emp.title;
      // Roster is authoritative for RANK-derived certs (officer/engineer), but
      // medical licenses are person-held — merge them forward so an in-app
      // paramedic grant survives every roster re-import.
      const heldLicenses = (existing.certs || []).filter((c) => LICENSE_CAPABILITIES.includes(c));
      existing.certs       = Array.from(new Set([...emp.certs, ...heldLicenses]));
      existing.isSupervisor = emp.isSupervisor;
      existing.badge       = emp.badge;
      if (emp.shift) existing.shift = emp.shift; // preserve null for admin/new hires
      // Ride-up: only overwrite when the roster actually supplied one, so
      // in-app grants aren't wiped by a roster that has no ride-up column.
      if (emp.rideUp && emp.rideUp.length) existing.rideUp = emp.rideUp;
      else if (!Array.isArray(existing.rideUp)) existing.rideUp = [];
      existing.status      = "active";
      updated++;
    } else {
      state.employees.push({
        id:          `ROSTER-${emp.badge || String(state.employees.length + 1).padStart(3, "0")}`,
        entraId:     null,
        name:        emp.name,
        email:       emp.email,
        badge:       emp.badge,
        shift:       emp.shift,
        title:       emp.title,
        certs:       emp.certs,
        rideUp:      emp.rideUp || [],
        isSupervisor: emp.isSupervisor,
        status:      "active",
      });
      added++;
    }
  });

  state.rosterImportPreview = null;
  const skipNote = skipped ? `, ${skipped} duplicate(s) skipped` : "";
  addAudit(`D7FR roster import applied: ${added} added, ${updated} updated${skipNote}.`, currentUserName());
  createNotification(`Roster import complete — ${added} added, ${updated} updated${skipNote}.`, "email", currentUserName());
  dom["roster-import-message"].textContent = `Applied — ${added} new, ${updated} updated${skipNote}.`;
  dom["roster-import-file"].value = "";
  render();
  showToast(`Roster applied: ${added} new, ${updated} updated.`, "success");
  persistAppState("D7FR roster import applied");
}

function renderRosterImportPreview() {
  const container = dom["roster-import-preview"];
  if (!container) return;
  if (!state.rosterImportPreview?.length) { container.innerHTML = ""; return; }

  const adds       = state.rosterImportPreview.filter((r) => r._action === "add").length;
  const updates    = state.rosterImportPreview.filter((r) => r._action === "update").length;
  const duplicates = state.rosterImportPreview.filter((r) => r._action === "duplicate").length;

  container.innerHTML =
    `<p class="helper-text" style="margin:0 0 0.5rem">
       <strong>${adds}</strong> to add &nbsp;·&nbsp; <strong>${updates}</strong> to update` +
       (duplicates ? ` &nbsp;·&nbsp; <strong>${duplicates}</strong> duplicate(s) skipped` : "") +
     `</p>` +
    state.rosterImportPreview.map((r) => {
      const actionBadge = r._action === "add"
        ? `<span class="badge" style="background:var(--success-bg,#d1fae5);color:#065f46;flex-shrink:0">+ new</span>`
        : r._action === "duplicate"
        ? `<span class="badge" style="background:var(--warning-bg,#fef3c7);color:#92400e;flex-shrink:0">duplicate</span>`
        : `<span class="badge badge-soft" style="flex-shrink:0">update</span>`;
      const dupNote = r._dupReason
        ? ` <span class="helper-text">(${r._dupReason})</span>` : "";
      const titleNote = r._action === "update" && r._existingTitle && r._existingTitle !== r.title
        ? ` <span class="helper-text">(was ${r._existingTitle})</span>` : "";
      const shiftNote = r._action === "update" && r.shift && r._existingShift !== r.shift
        ? ` <span class="helper-text">(was ${r._existingShift || "none"})</span>` : "";
      return `<div class="stack-item" style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0.75rem${r._action === "duplicate" ? ";opacity:0.65" : ""}">
        ${actionBadge}
        <div style="flex:1;min-width:0;overflow:hidden">
          <p style="margin:0;font-weight:600;font-size:0.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</p>
          <p style="margin:0;font-size:0.78rem;color:var(--text-secondary)">${r.email}${dupNote}</p>
        </div>
        <div style="text-align:right;white-space:nowrap;font-size:0.8rem;flex-shrink:0">
          <p style="margin:0;font-weight:500">${r.title}${titleNote}</p>
          <p style="margin:0;color:var(--text-secondary)">Shift ${r.shift || "—"}${shiftNote} · ${r.dshsCert}</p>
        </div>
      </div>`;
    }).join("");
}

async function previewUnitImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["unit-import-message"].textContent = "Supervisor sign-in is required to preview imports.";
    return;
  }
  const file = dom["unit-import-file"].files[0];
  if (!file) {
    dom["unit-import-message"].textContent = "Choose a CSV file first.";
    return;
  }
  const raw = await file.text();
  const rows = parseCsv(raw);
  if (!rows.length) {
    state.unitImportPreview = { type: "units", rows: [], errors: [{ message: "The CSV did not contain any data rows." }], warnings: [], validRows: [], stats: { valid: 0 } };
    dom["unit-import-message"].textContent = "The selected CSV was empty.";
    render();
    return;
  }
  const preview = validateUnitImport(rows);
  state.unitImportPreview = { ...preview, type: "units" };
  if (preview.errors.length) {
    dom["unit-import-message"].textContent = `Preview found ${preview.errors.length} error(s). ${preview.errors.slice(0, 2).map((e) => e.message).join(" ")}`;
  } else if (preview.warnings.length) {
    dom["unit-import-message"].textContent = `Preview ready with ${preview.warnings.length} warning(s). Review before applying.`;
  } else {
    dom["unit-import-message"].textContent = `Preview ready for ${rows.length} row(s). No blocking errors.`;
  }
  render();
  dom["unit-import-preview"].scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyUnitImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["unit-import-message"].textContent = "Supervisor sign-in is required.";
    return;
  }
  if (!state.unitImportPreview) {
    dom["unit-import-message"].textContent = "Preview the CSV before applying it.";
    return;
  }
  if (state.unitImportPreview.errors.length) {
    dom["unit-import-message"].textContent = "Resolve import errors before applying.";
    return;
  }
  mergeUnits(state.unitImportPreview.validRows);
  state.unitImportPreview = null;
  seedAssignments(true);
  addAudit("Unit CSV import applied.", currentUserName());
  createNotification("Unit import completed successfully.", "email", currentUserName());
  dom["unit-import-message"].textContent = "Unit import applied and schedule regenerated.";
  dom["unit-import-file"].value = "";
  render();
  showToast("Unit import applied successfully.", "success");
  persistAppState("Unit CSV import applied");
}

function downloadEmployeeTemplate() {
  downloadCsv(
    "d7fr-employees-template.csv",
    [
      "id,name,shift,title,certs,pin,email,isSupervisor,status",
      'EMP-061,"Jamie Stone",A,Firefighter,"emt|paramedic",1234,jamie.stone@d7fr.org,false,active',
      'EMP-062,"Avery Cole",B,Captain,"officer|emt",9000,avery.cole@d7fr.org,true,archived',
    ].join("\n"),
  );
}

function downloadUnitTemplate() {
  downloadCsv(
    "d7fr-units-template.csv",
    [
      // No "shift" column: apparatus are staffed by the platoon on duty that
      // date. onDemand=true means the unit only runs on dates it's activated.
      "id,name,type,minStaff,requiredCerts,onDemand,sortOrder,visible",
      'E5,"Engine 5",Engine,4,"paramedic",false,9,true',
      'B5,"Brush 5",Brush,2,"emt",true,100,true',
    ].join("\n"),
  );
}

function approveQueueItem(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (trade) {
    trade.status = "approved";
    queueNotification({
      recipientId: trade.employeeId,
      subject: `Trade approved — ${formatDate(trade.date)}`,
      message: `Your trade for ${formatDate(trade.date)} with ${employeeById(trade.partnerId)?.name || "a partner"} was approved.`,
      relatedKind: "trade",
      relatedId: trade.id,
    });
    if (trade.partnerId) {
      queueNotification({
        recipientId: trade.partnerId,
        subject: `Trade approved — ${formatDate(trade.date)}`,
        message: `The trade with ${employeeById(trade.employeeId)?.name || "a colleague"} for ${formatDate(trade.date)} was approved.`,
        relatedKind: "trade",
        relatedId: trade.id,
      });
    }
    addAudit(`Trade ${trade.id} approved.`, currentUserName());
    render();
    persistAppState("Trade approved");
    return;
  }
  // Overtime is never awarded automatically. This branch used to set
  // approvedEmployeeId = applicants[0] — which, with fabricated applicants,
  // handed real shifts to people who had never volunteered. Awarding now goes
  // through awardOvertime(postId, employeeId) with a named applicant.
  if (state.overtimePosts.some((item) => item.id === id)) {
    showToast("Choose an applicant to award this shift to.", "error");
  }
}

function denyQueueItem(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (trade) {
    trade.status = "denied";
    createNotification(`Trade request for ${formatDate(trade.date)} denied. Both employees were notified.`, "email", currentUserName());
    addAudit(`Trade ${trade.id} denied.`, currentUserName());
    render();
    persistAppState("Trade denied");
    return;
  }
  const overtime = state.overtimePosts.find((item) => item.id === id);
  if (overtime) {
    overtime.status = "denied";
    createNotification(`Open shift for ${unitById(overtime.unitId)?.name} on ${formatDate(overtime.date)} was closed without assignment.`, "email", currentUserName());
    addAudit(`Overtime ${overtime.id} denied or closed.`, currentUserName());
    render();
    persistAppState("Overtime denied");
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = "success") {
  const existing = document.getElementById("app-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.className = `app-toast app-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("is-visible"));
  });

  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ─── Date / Schedule Helpers ──────────────────────────────────────────────────

function shiftDate(direction) {
  const amount = state.currentView === "day" ? 1 : state.currentView === "week" ? 7 : 28;
  state.currentDate = addDays(state.currentDate, direction * amount);
  render();
}

function getDateRange() {
  if (state.currentView === "day") {
    return [state.currentDate];
  }
  if (state.currentView === "week") {
    return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(state.currentDate), index));
  }
  return Array.from({ length: 30 }, (_, index) => addDays(startOfMonth(state.currentDate), index));
}

function getAssignments(date, unitId) {
  return state.assignments?.[date]?.[unitId] || [];
}

function getStaffingAlerts(date) {
  return unitsForDate(date)
    .flatMap((unit) => {
      const people = getAssignments(date, unit.id);
      const positions = UNIT_POSITION_REQUIREMENTS[unit.type];
      if (positions) {
        return checkPositionStaffing(unit, people, positions);
      }
      // Fallback: generic minStaff + cert check for any unlisted type
      const alerts = [];
      if (people.length < unit.minStaff) {
        alerts.push({
          level: "danger", unitId: unit.id, unitName: unit.name, need: "",
          message: `${unit.name} short ${unit.minStaff - people.length} slot(s).`,
        });
      }
      (unit.requiredCerts || []).forEach((cert) => {
        if (!people.some((p) => (p.certs || []).includes(cert))) {
          alerts.push({
            level: "warning", unitId: unit.id, unitName: unit.name,
            need: CAPABILITY_LABELS[cert] || cert,
            message: `${unit.name} missing ${cert} coverage.`,
          });
        }
      });
      return alerts;
    });
}

// Greedy position-fill check: most-restrictive positions are listed first in the
// UNIT_POSITION_REQUIREMENTS definition so they get their preferred candidates.
function checkPositionStaffing(unit, people, positions) {
  const alerts = [];
  const unmatched = [...people];
  positions.forEach((pos) => {
    const idx = unmatched.findIndex((p) => seatAccepts(pos, resolvePerson(p)));
    if (idx !== -1) {
      unmatched.splice(idx, 1);
    } else if (seatIsRequired(pos)) {
      // Only required seats raise a staffing alert; optional rider seats don't.
      const need = seatNeedLabel(pos);
      alerts.push({
        level: "danger",
        unitId: unit.id,
        unitName: unit.name,
        need,
        message: `${unit.name} — ${pos.label} unfilled${need ? ` (needs: ${need})` : ""}.`,
      });
    }
  });
  return alerts;
}

// ─── Per-seat staffing helpers ────────────────────────────────────────────────
function seatIsRequired(pos) { return pos.required !== false; }
function seatAllowsAny(pos) { const c = pos.cap; return !c || (Array.isArray(c) && c.length === 0); }

// A person's full capability set = rank-derived certs PLUS ride-up grants.
// This is what makes "acting" work: an Engineer marked ride-up "officer" gains
// the officer capability without changing their permanent rank.
function personCapabilities(emp) {
  if (!emp) return [];
  return [...(emp.certs || []), ...(emp.rideUp || [])];
}

// Resolve an assignment snapshot back to the live roster record so capability
// checks use current certs/ride-up, not whatever was stored when they were added.
function resolvePerson(p) {
  return (p && employeeById(p.id)) || p;
}

// Does a person qualify for a seat? Any-cap seats accept anyone; otherwise the
// person must hold at least one of the seat's required capabilities.
function seatAccepts(pos, emp) {
  // An archived person never satisfies a seat. Their pushed future assignments
  // therefore read as open gaps and raise alerts instead of looking covered.
  if (!emp || emp.status === "archived") return false;
  if (seatAllowsAny(pos)) return true;
  const need = Array.isArray(pos.cap) ? pos.cap : [pos.cap];
  const caps = personCapabilities(emp);
  return need.some((c) => caps.includes(c));
}

function seatNeedLabel(pos) {
  if (seatAllowsAny(pos)) return "";
  const need = Array.isArray(pos.cap) ? pos.cap : [pos.cap];
  return need.map((c) => CAPABILITY_LABELS[c] || c).join(" or ");
}

// Every employee id assigned to ANY unit on a date -- used to keep someone from
// appearing in another unit's pick list once they're on the schedule that day.
function assignedEmployeeIdsForDate(date) {
  // Only count assignments to units that still EXIST, so leftover/orphaned
  // assignments to deleted apparatus can never make someone read as booked.
  const ids = new Set();
  const existingUnitIds = new Set(state.units.map((u) => u.id));
  const byUnit = state.assignments?.[date] || {};
  Object.entries(byUnit).forEach(([unitId, people]) => {
    if (!existingUnitIds.has(unitId)) return;
    (people || []).forEach((p) => p && ids.add(p.id));
  });
  return ids;
}

// Greedily seat a unit's assigned people. Specific/required seats are listed
// first, so they claim their eligible people before the any-rank rider seats.
// Returns { seats: [{ pos, person|null }], extra: [leftover people] }.
function assignPeopleToSeats(unitType, people) {
  const positions = UNIT_POSITION_REQUIREMENTS[unitType];
  if (!positions) return { seats: [], extra: [...people] };
  const pool = [...people];
  const seats = positions.map((pos) => {
    const idx = pool.findIndex((p) => seatAccepts(pos, resolvePerson(p)));
    const person = idx !== -1 ? pool.splice(idx, 1)[0] : null;
    return { pos, person };
  });
  return { seats, extra: pool };
}

// Options for one seat's dropdown: active, rank-eligible for the seat, and NOT
// already assigned anywhere that day (no double-booking). Non-supervisors are
// scoped to the unit's shift (supervisors may cross-staff for overtime).
function seatDropdownOptions(pos, unit, date) {
  const booked = assignedEmployeeIdsForDate(date);
  const base = eligibleEmployeesForDate(date);
  return base
    .filter((e) => !booked.has(e.id))
    .filter((e) => seatAccepts(pos, e))
    .map((e) => {
      const acting = !seatAllowsAny(pos) && !(e.certs || []).some((c) => (Array.isArray(pos.cap) ? pos.cap : [pos.cap]).includes(c));
      return `<option value="${e.id}">${escapeHtml(e.name)} — ${escapeHtml(e.title || "—")}${acting ? " (acting)" : ""} (${e.shift || "?"})</option>`;
    })
    .join("");
}

// One seat row: shows the assigned person (with Remove) or a pick dropdown.
function seatRowHtml(pos, person, unit, date, isSupervisor, required, labelOverride) {
  const label = labelOverride || `${pos.label}${required ? "" : " (optional)"}`;
  let control;
  if (person) {
    control = `<div class="seat-person">
        <span><strong>${escapeHtml(person.name)}</strong> <small>${escapeHtml(person.title || "—")} · ${person.shift || "?"} shift</small></span>
        ${isSupervisor ? `<button class="button button-secondary button-small" data-remove-assignment="${person.id}" data-remove-date="${date}" data-remove-unit="${unit.id}" aria-label="Remove ${escapeHtml(person.name)}">×</button>` : ""}
      </div>`;
  } else if (isSupervisor) {
    control = `<select class="assignment-select" data-date="${date}" data-unit="${unit.id}">
        <option value="">— choose —</option>${seatDropdownOptions(pos, unit, date)}
      </select>`;
  } else {
    control = `<span class="seat-empty">${required ? "Unfilled" : "—"}</span>`;
  }
  return `<div class="seat-row ${required ? "" : "seat-optional"}"><span class="seat-label">${escapeHtml(label)}</span>${control}</div>`;
}

function getShiftForDate(date) {
  const diff = diffDays(ROTATION_BASE_DATE, date);
  const index = ((diff % rotationPattern.length) + rotationPattern.length) % rotationPattern.length;
  return rotationPattern[index];
}

function visibleUnits() {
  return state.units.filter((unit) => unit.visible);
}

// An apparatus is a physical truck: it does NOT belong to a platoon. Whichever
// platoon (A/B/C) is on duty that date staffs it. Front-line units therefore run
// EVERY shift day. On-demand units (Brush, Tender, reserve) only run on dates a
// supervisor has explicitly activated them.
function unitRunsOn(unit, date) {
  if (!unit) return false;
  if (!unit.onDemand) return true;
  return Array.isArray(unit.activeDates) && unit.activeDates.includes(date);
}

// Board order: explicit sortOrder first (front-line units are 1..8 in the order
// crews read the board), then name as a stable tiebreak for everything sharing
// the default. Never rely on array order — it comes from the API.
function byBoardOrder(a, b) {
  const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 100;
  const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 100;
  if (ao !== bo) return ao - bo;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

// The units in service on a given date (replaces the old `unit.shift === shift`).
function unitsForDate(date) {
  return visibleUnits().filter((unit) => unitRunsOn(unit, date)).sort(byBoardOrder);
}

// On-demand units NOT in service on this date. These are hidden from the normal
// schedule (they aren't running), so supervisors need a separate tray to put one
// in service — otherwise there's no way to ever activate them.
function inactiveOnDemandUnits(date) {
  return visibleUnits().filter((unit) => unit.onDemand && !unitRunsOn(unit, date)).sort(byBoardOrder);
}

// Put an on-demand unit in service for a single date.
function activateUnitForDate(unitId, date) {
  const unit = unitById(unitId);
  if (!unit || !unit.onDemand) return;
  if (!Array.isArray(unit.activeDates)) unit.activeDates = [];
  if (unit.activeDates.includes(date)) return;
  unit.activeDates = [...unit.activeDates, date].sort();
  addAudit(`${unit.name} placed in service for ${formatDate(date)}.`, currentUserName());
  // Offer the standing crew. This is the long-term-outage workflow: activating a
  // reserve rig for 21 shifts should not mean building 21 crews by hand.
  const shift = getShiftForDate(date);
  const crew = crewFromTemplate(unitId, date);
  if (crew.length && !getAssignments(date, unitId).length) {
    const names = crew.map((p) => p.name).join(", ");
    if (window.confirm(`Fill ${unit.name} from its ${shift}-shift template?\n\n${names}`)) {
      if (!state.assignments[date]) state.assignments[date] = {};
      state.assignments[date][unitId] = crew;
      addAudit(`${unit.name} staffed from ${shift}-shift template for ${formatDate(date)}.`, currentUserName());
    }
  }
  render();
  persistAppState(`${unit.name} in service`);
  showToast(`${unit.name} is in service for ${formatDate(date)}.`, "success");
}

// Take an on-demand unit out of service for a single date. Assignments are left
// intact rather than deleted, so putting it back in service restores the crew —
// and so a misclick can never silently destroy a day's staffing.
function deactivateUnitForDate(unitId, date) {
  const unit = unitById(unitId);
  if (!unit || !unit.onDemand) return;
  const assigned = getAssignments(date, unitId).length;
  if (assigned > 0) {
    const ok = window.confirm(
      `${unit.name} has ${assigned} ${assigned === 1 ? "person" : "people"} assigned on ${formatDate(date)}.\n\n` +
      `Take it out of service? The crew is kept and will reappear if you put it back in service.`
    );
    if (!ok) return;
  }
  unit.activeDates = (unit.activeDates || []).filter((d) => d !== date);
  addAudit(`${unit.name} taken out of service for ${formatDate(date)}.`, currentUserName());
  render();
  persistAppState(`${unit.name} out of service`);
  showToast(`${unit.name} is out of service for ${formatDate(date)}.`, "success");
}

// Who is eligible to ride on a given date = the platoon on duty that date.
// Supervisors may cross-staff (overtime), so they see everyone.
function eligibleEmployeesForDate(date) {
  const onDuty = getShiftForDate(date);
  return state.currentRole === "supervisor"
    ? activeEmployees()
    : activeEmployees().filter((e) => e.shift === onDuty);
}

function visibleUnitsAll() {
  // Sorted COPY — never sort state.units in place, or the admin list and the
  // board can disagree with what gets persisted.
  return [...state.units].sort(byBoardOrder);
}


// ─── Notification / Audit Helpers ─────────────────────────────────────────────

// Every notification is an OUTBOX ROW, not a log line. Nothing sends yet — the
// mail and SMS transports aren't built — but rows persist server-side as
// "queued", so switching delivery on later is a transport change rather than a
// redesign, and messages written in the meantime are not lost.
function queueNotification({ recipientId = null, channel = "email", subject = "", message, relatedKind = "", relatedId = "" }) {
  const entry = {
    id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recipientId,
    channel,
    subject,
    message,
    status: "queued",
    relatedKind,
    relatedId,
    createdBy: currentUserName(),
    time: formatDateTime(new Date()),
    title: channel === "sms" ? "SMS" : channel === "in_app" ? "In-app" : "Email",
  };
  state.notifications.push(entry);
  if (state.notifications.length > HISTORY_KEEP * 2) {
    state.notifications = state.notifications.slice(-HISTORY_KEEP);
  }
  return entry;
}

// Legacy broadcast helper — no single addressee. Kept so existing call sites
// keep working; prefer queueNotification() when there IS a recipient.
function createNotification(message, channel, createdBy) {
  return queueNotification({
    channel: channel || "email",
    subject: "",
    message,
    relatedKind: "",
    relatedId: "",
  });
}

// AUDIT POLICY — log things that CHANGE THE SCHEDULE or someone's obligations.
// This is the record a chief reads to answer "who moved this crew, and when",
// so signal matters more than completeness.
//
//   LOG:        assignments added/removed, units in/out of service, unit
//               visibility, publishes, trades, overtime awards, roster and
//               credential changes, template pushes.
//   DON'T LOG:  sign-ins (they fired on every silent token refresh — 122 in one
//               day), tab and workspace switches, anything purely about what one
//               person is looking at.
//
// Authentication events belong in an auth log, not the scheduling record.
function addAudit(message, actor) {
  state.auditLog.push(createAuditEntry(message, actor));
  // Trim in memory too, or a long session rebuilds the same problem.
  if (state.auditLog.length > HISTORY_KEEP * 2) {
    state.auditLog = state.auditLog.slice(-HISTORY_KEEP);
  }
}

function createAuditEntry(message, actor) {
  return {
    id: `AU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    actor,
    time: formatDateTime(new Date()),
  };
}

function currentUserName() {
  return state.currentUserDisplayName || employeeById(state.currentUserId)?.name || "System";
}

function employeeById(id) {
  const employee = state.employees.find((item) => item.id === id);
  return employee ? normalizeEmployeeRecord(employee) : null;
}

function activeEmployeeById(id) {
  return activeEmployees().find((employee) => employee.id === id);
}

function activeEmployees() {
  return state.employees.map(normalizeEmployeeRecord).filter((employee) => employee.status === "active");
}

function archivedEmployees() {
  return state.employees.map(normalizeEmployeeRecord).filter((employee) => employee.status === "archived");
}

function normalizeEmployeeRecord(employee) {
  if (!employee) return null;
  employee.certs = Array.isArray(employee.certs) ? employee.certs : [];
  employee.rideUp = Array.isArray(employee.rideUp) ? employee.rideUp : [];
  employee.status = employee.status === "archived" ? "archived" : "active";
  return employee;
}

function unitById(id) {
  return state.units.find((unit) => unit.id === id);
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

function todayIso() {
  // The department's "shift day" runs 0800 to 0800 (America/Chicago), so this
  // returns the OPERATIONAL shift day, not the raw calendar date:
  //   - computed in Central time, never UTC (UTC made it read as "tomorrow" in
  //     the evening), and
  //   - before 08:00 it rolls back to the previous calendar date, because the
  //     crew that came on the previous morning is still on duty until 0800.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const val = (t) => parts.find((p) => p.type === t).value;
  const centralDate = `${val("year")}-${val("month")}-${val("day")}`;
  const centralHour = parseInt(val("hour"), 10) % 24; // %24 guards a midnight "24"
  if (centralHour >= 8) return centralDate;
  // Before 0800 -> previous shift day. Do the -1 in pure UTC (noon anchor) so
  // it can't be knocked off-by-one by the viewer's own timezone.
  const d = new Date(`${centralDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function diffDays(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.round((endDate - startDate) / 86400000);
}

function startOfWeek(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(dateString) {
  return `${dateString.slice(0, 8)}01`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T12:00:00`));
}

function formatDateTime(date) {
  // Military (24-hour) time format
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// ─── CSV Parsing & Validation ─────────────────────────────────────────────────

function parseCsv(input) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { current += '"'; index += 1; }
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (char === "," && !inQuotes) { row.push(current.trim()); current = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = []; current = "";
      continue;
    }
    current += char;
  }
  if (current || row.length) {
    row.push(current.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => { entry[header] = cells[index] ?? ""; });
    return entry;
  });
}

function validateEmployeeImport(rows) {
  const errors = [];
  const warnings = [];
  const validRows = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const certs = splitList(row.certs);
    const status = normalizeImportEmployeeStatus(row.status, row.archived);
    const normalized = {
      id: row.id || `EMP-${String(state.employees.length + validRows.length + 1).padStart(3, "0")}`,
      name: row.name || "",
      shift: (row.shift || "").toUpperCase(),
      title: row.title || "Firefighter",
      certs,
      pin: row.pin || (parseBoolean(row.issupervisor) || certs.includes("officer") ? "9000" : "1111"),
      email: row.email || "",
      isSupervisor: parseBoolean(row.issupervisor),
      status,
    };
    if (!normalized.name) { errors.push({ message: `Row ${line}: missing name.` }); return; }
    if (!["A", "B", "C"].includes(normalized.shift)) { errors.push({ message: `Row ${line}: shift must be A, B, or C.` }); return; }
    if (!["active", "archived"].includes(normalized.status)) { errors.push({ message: `Row ${line}: status must be active or archived.` }); return; }
    if (!normalized.email) warnings.push({ message: `Row ${line}: no email address.` });
    const invalidCerts = certs.filter((cert) => !employeeRoles.includes(cert));
    if (invalidCerts.length) { errors.push({ message: `Row ${line}: invalid cert values: ${invalidCerts.join(", ")}.` }); return; }
    validRows.push(normalized);
  });

  return { rows, errors, warnings, validRows, stats: { valid: validRows.length } };
}

function validateUnitImport(rows) {
  const errors = [];
  const warnings = [];
  const validRows = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const requiredCerts = splitList(row.requiredcerts);
    const normalizedType = normalizeUnitType(row.type, row.id || "");
    const normalized = {
      id: row.id || "",
      name: row.name || "",
      type: normalizedType,
      minStaff: Number(row.minstaff),
      requiredCerts,
      // Apparatus have no platoon. Optional "onDemand" column marks a unit that
      // only runs on dates a supervisor activates (Brush, Tender, reserve).
      onDemand: parseBoolean(row.ondemand),
      activeDates: [],
      // Blank/invalid sortOrder falls to 100, which sorts after the front-line
      // units and then alphabetically among the reserves.
      sortOrder: Number.isFinite(Number(row.sortorder)) && row.sortorder !== "" ? Number(row.sortorder) : 100,
      visible: parseBoolean(row.visible),
    };
    if (!normalized.id || !normalized.name) { errors.push({ message: `Row ${line}: missing id or name.` }); return; }
    if (!normalizedType || !unitTypes.includes(normalizedType)) {
      errors.push({
        message: `Row ${line}: invalid type "${row.type || ""}". Must be one of: ${unitTypes.join(", ")} (legacy names like engine, ambulance, supervisor are accepted).`,
      });
      return;
    }
    if (!Number.isFinite(normalized.minStaff) || normalized.minStaff < 1) { errors.push({ message: `Row ${line}: minStaff must be a positive number.` }); return; }
    const invalidCerts = requiredCerts.filter((cert) => !employeeRoles.includes(cert));
    if (invalidCerts.length) { errors.push({ message: `Row ${line}: invalid required certs: ${invalidCerts.join(", ")}.` }); return; }
    validRows.push(normalized);
  });

  return { rows, errors, warnings, validRows, stats: { valid: validRows.length } };
}

function mergeEmployees(rows) {
  rows.forEach((row) => {
    const existingIndex = state.employees.findIndex((employee) => employee.id === row.id);
    const nextEmployee = {
      ...state.employees[existingIndex],
      ...row,
      certs: Array.from(new Set(row.certs.length ? row.certs : ["emt"])),
      isSupervisor: row.isSupervisor || row.certs.includes("officer"),
      status: row.status === "archived" ? "archived" : "active",
    };
    if (existingIndex >= 0) { state.employees[existingIndex] = nextEmployee; }
    else { state.employees.push(nextEmployee); }
  });
}

function mergeUnits(rows) {
  rows.forEach((row) => {
    const existingIndex = state.units.findIndex((unit) => unit.id === row.id);
    if (existingIndex >= 0) { state.units[existingIndex] = { ...state.units[existingIndex], ...row }; }
    else { state.units.push(row); }
  });
}

function splitList(value) {
  return (value || "").split(/[|;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function normalizeImportEmployeeStatus(statusValue, archivedValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (status === "active" || status === "archived") {
    return status;
  }
  return parseBoolean(archivedValue) ? "archived" : "active";
}

function parseBoolean(value) {
  return ["true", "yes", "1", "y"].includes(String(value || "").toLowerCase());
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function hasRemotePersistence() {
  const config = window.APP_CONFIG || {};
  // The new Django API takes priority when configured; otherwise fall back to
  // the original Supabase blob. Either one counts as "remote".
  return usesSchedulerApi() || Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

// --- Backend selection -------------------------------------------------------
// When APP_CONFIG.schedulerApiUrl is set, load/save go to the Django REST API
// (/api/scheduler/state/). When it's blank, everything behaves exactly as before
// (Supabase). This lets us cut over one environment at a time with zero risk to
// the live app until the URL is filled in.
function usesSchedulerApi() {
  return Boolean((window.APP_CONFIG || {}).schedulerApiUrl);
}

function schedulerStateUrl() {
  return `${window.APP_CONFIG.schedulerApiUrl.replace(/\/$/, "")}/api/scheduler/state/`;
}

// Human label for the status pill so it reads correctly for whichever backend.
function remoteLabel() {
  return usesSchedulerApi() ? "server" : "Supabase";
}

// Try to attach a Microsoft token so the Django API can verify the caller.
// If we can't get one (not signed in, or the API scope isn't set up yet), we
// send no token -- which still works while the API is in DEBUG dev-open mode.
async function schedulerApiHeaders() {
  const headers = { "Content-Type": "application/json" };
  const scopes = (window.APP_CONFIG || {}).schedulerApiScopes;
  try {
    if (msalInstance && Array.isArray(scopes) && scopes.length) {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length) {
        const res = await msalInstance.acquireTokenSilent({ scopes, account: accounts[0] });
        if (res && res.accessToken) headers.Authorization = `Bearer ${res.accessToken}`;
      }
    }
  } catch (error) {
    console.warn("Could not acquire scheduler API token; sending request without one.", error);
  }
  return headers;
}

function remoteBaseUrl() {
  return `${window.APP_CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/scheduler_state`;
}

async function loadRemoteState() {
  if (usesSchedulerApi()) {
    const response = await fetch(schedulerStateUrl(), { headers: await schedulerApiHeaders() });
    if (!response.ok) throw new Error(`API load failed with status ${response.status}`);
    return await response.json(); // already the full state object
  }
  const response = await fetch(`${remoteBaseUrl()}?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&select=state`, {
    headers: remoteHeaders(),
  });
  if (!response.ok) throw new Error(`Remote load failed with status ${response.status}`);
  const rows = await response.json();
  return rows[0]?.state || null;
}

async function persistAppState(reason) {
  state.persistence.isSaving = true;
  try {
    saveLocalState();
    if (hasRemotePersistence()) {
      await saveRemoteState();
      state.persistence.backend = usesSchedulerApi() ? "api" : "supabase";
      // Stamped ONLY on a confirmed server write. Previously this lived in the
      // finally block, so a failed save still showed "Saved 3:42 PM" — the
      // indicator reassured people at exactly the moment it should have alarmed them.
      state.persistence.lastSavedAt = new Date().toISOString();
      setPersistenceStatus(`Saved to ${remoteLabel()}${reason ? ` • ${reason}` : ""}`, "ok");
    } else {
      state.persistence.backend = "local-storage";
      setPersistenceStatus(`Saved in browser${reason ? ` • ${reason}` : ""}`, "warning");
    }
  } catch (error) {
    console.error("Persist failed", error);
    saveLocalState();
    state.persistence.backend = hasRemotePersistence()
      ? (usesSchedulerApi() ? "api-fallback" : "supabase-fallback")
      : "local-storage";
    setPersistenceStatus("Saved in browser fallback only", "warning");
  } finally {
    state.persistence.isSaving = false;
    state.persistence.lastSavedAt = new Date().toISOString();
    renderPersistenceStatus();
  }
}

async function saveRemoteState() {
  if (usesSchedulerApi()) {
    const response = await fetch(schedulerStateUrl(), {
      method: "PUT",
      headers: await schedulerApiHeaders(),
      body: JSON.stringify(serializableState()),
    });
    if (!response.ok) throw new Error(`API save failed with status ${response.status}`);
    return;
  }
  const response = await fetch(remoteBaseUrl(), {
    method: "POST",
    headers: {
      ...remoteHeaders(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: REMOTE_STATE_ID, state: serializableState() }),
  });
  if (!response.ok) throw new Error(`Remote save failed with status ${response.status}`);
}

function remoteHeaders() {
  return {
    apikey: window.APP_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${window.APP_CONFIG.supabaseAnonKey}`,
  };
}

function saveLocalState() {
  // Best-effort only. A quota error here previously threw out of persistAppState
  // AND out of its catch block (which called this again), so one oversized state
  // took down the entire save path instead of just the local backup.
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serializableState()));
  } catch (error) {
    console.warn("Local backup skipped (state too large for browser storage)", error);
    try { window.localStorage.removeItem(LOCAL_STORAGE_KEY); } catch (_) { /* nothing more to do */ }
  }
}

function loadLocalState() {
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { console.error("Local state parse failed", error); return null; }
}

function serializableState() {
  return {
    units: state.units,
    staffingTemplates: state.staffingTemplates,
    mandatoryBackfill: state.mandatoryBackfill,
    employees: state.employees,
    trades: state.trades,
    overtimePosts: state.overtimePosts,
    // CAPPED. These two are append-only and grow forever: every seat change,
    // toggle and publish adds a row. Uncapped they reached 18 MB, which blew
    // both the localStorage quota AND the request size — so NOTHING could save,
    // by any route, and the browser reported it as a CORS error.
    // The server keeps full history (audit entries are never pruned there); the
    // SPA only needs a recent window to display.
    notifications: (state.notifications || []).slice(-HISTORY_KEEP),
    auditLog: (state.auditLog || []).slice(-HISTORY_KEEP),
    assignments: state.assignments,
    scheduleStatus: state.scheduleStatus,
    employeeFilter: state.employeeFilter,
    activeSurface: state.activeSurface,
    activeAdminTab: state.activeAdminTab,
  };
}

function applyPersistedState(data) {
  // Migrate old AA/BB/CC shift names to A/B/C
  migrateShiftNames(data);
  // Migrate legacy title values to current D7FR title set
  migrateEmployeeTitles(data);
  // Drop the fixed per-unit platoon; trucks run daily and are staffed by the
  // platoon on duty. See unitRunsOn()/unitsForDate().
  migrateUnitShiftModel(data);

  if (Array.isArray(data.units)) {
    migratePersistedUnitTypes(data.units);
    state.units = data.units;
  } else {
    state.units = defaultUnits();
  }
  state.staffingTemplates = Array.isArray(data.staffingTemplates) ? data.staffingTemplates : [];
  state.mandatoryBackfill = Array.isArray(data.mandatoryBackfill) ? data.mandatoryBackfill : [];
  state.employees = Array.isArray(data.employees) ? data.employees : [];
  state.trades = Array.isArray(data.trades) ? data.trades : [];
  state.overtimePosts = Array.isArray(data.overtimePosts) ? data.overtimePosts : [];
  state.notifications = Array.isArray(data.notifications) ? data.notifications : [];
  state.auditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
  state.assignments = data.assignments && typeof data.assignments === "object" ? data.assignments : {};
  state.scheduleStatus = data.scheduleStatus || "draft";
  state.employeeFilter = {
    search: data.employeeFilter?.search || "",
    shift: data.employeeFilter?.shift || "all",
    status: data.employeeFilter?.status || "active",
    sort: data.employeeFilter?.sort || "name",
  };
  state.activeSurface = data.activeSurface || "schedule";
  const adminTabMap = { "emp-import": "imports", "unit-import": "imports", "units-mgmt": "units" };
  state.activeAdminTab = adminTabMap[data.activeAdminTab] || data.activeAdminTab || "employees";
  state.selectedEmployeeId = null;
  state.employeeDraft = null;
  seedAssignments(true);
}

// Migrate legacy title values to current D7FR title strings
function migrateEmployeeTitles(data) {
  const map = {
    Firefighter: "FF/EMT",
    FAO: "Engineer",
    Paramedic: "FF/EMTP",
    "Batt Chief": "Batt. Chief",
    "Battalion Chief": "Batt. Chief",
    "Division Chief": "Div. Chief",
    Officer: "Lieutenant",
  };
  if (Array.isArray(data.employees)) {
    data.employees.forEach((e) => {
      if (e.title && map[e.title]) e.title = map[e.title];
      // Also derive isSupervisor from title so it stays in sync after migration
      if (e.title) {
        e.isSupervisor = e.isSupervisor || SUPERVISOR_TITLES.some((t) => t.toLowerCase() === e.title.toLowerCase());
      }
    });
  }
}

// Backward-compatible migration from AA/BB/CC → A/B/C
function migrateShiftNames(data) {
  const shiftMap = { AA: "A", BB: "B", CC: "C" };
  if (Array.isArray(data.employees)) {
    data.employees.forEach((e) => {
      if (shiftMap[e.shift]) e.shift = shiftMap[e.shift];
      e.status = e.status === "archived" ? "archived" : "active";
    });
  }
  if (Array.isArray(data.units)) {
    data.units.forEach((u) => { if (shiftMap[u.shift]) u.shift = shiftMap[u.shift]; });
  }
}

// Units used to carry a FIXED platoon (E116=B, E115=C…), which meant a truck
// only appeared on 1 day in 3. Real apparatus run every shift day and are
// staffed by whichever platoon is on duty. This drops that field and gives every
// unit an explicit run rule instead.
function migrateUnitShiftModel(data) {
  if (!Array.isArray(data.units)) return;
  data.units.forEach((u) => {
    if (typeof u.onDemand !== "boolean") u.onDemand = false;
    if (!Array.isArray(u.activeDates)) u.activeDates = [];
    if (!Number.isFinite(u.sortOrder)) u.sortOrder = 100;
    delete u.shift;
  });
}

function setPersistenceStatus(message, level) {
  state.persistence.status = message;
  state.persistence.level = level;
}
