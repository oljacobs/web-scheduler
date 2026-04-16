const state = {
  currentUserId: null,
  loginRole: "employee",
  currentRole: "employee",
  isAuthenticated: false,
  currentView: "day",
  currentDate: new Date().toISOString().slice(0, 10),
  scheduleStatus: "draft",
  units: [],
  employees: [],
  trades: [],
  overtimePosts: [],
  notifications: [],
  auditLog: [],
  importPreview: null,
  unitImportPreview: null,
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
const unitTypes = ["engine", "ladder", "ambulance", "supervisor", "specialty", "reserve"];

const dom = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  wireEvents();
  await hydrateAppState();
  initializeControls();
  render();
});

function cacheDom() {
  const ids = [
    "role-select", "user-select", "pin-input", "sign-in-btn", "auth-message", "auth-role-badge", "date-input",
    "prev-btn", "today-btn", "next-btn", "schedule-status", "publish-btn", "summary-grid", "alert-strip",
    "schedule-container", "schedule-title", "schedule-subtitle", "supervisor-save-btn", "trade-owner",
    "trade-partner", "trade-date", "trade-notes", "submit-trade-btn", "open-unit", "open-date",
    "open-qualification", "open-report-time", "post-open-btn", "unit-toggle-list", "notification-center",
    "approval-queue", "audit-log", "print-btn", "notify-btn",
    // Employee import
    "import-file", "preview-import-btn", "apply-import-btn", "import-message", "import-preview",
    "download-employee-template-btn",
    // Unit import
    "unit-import-file", "unit-preview-import-btn", "unit-apply-import-btn", "unit-import-message",
    "unit-import-preview", "download-unit-template-btn",
    // Roster filters
    "employee-search", "roster-shift-filter", "employee-status-filter", "roster-sort", "employee-roster", "employee-editor",
    "storage-status",
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
  dom["role-select"].addEventListener("change", () => {
    state.loginRole = dom["role-select"].value;
    populateUserSelect();
    renderAuthBadge();
  });

  dom["sign-in-btn"].addEventListener("click", handleSignIn);
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
  dom["supervisor-save-btn"].addEventListener("click", saveSupervisorEdits);
  dom["submit-trade-btn"].addEventListener("click", createTradeRequest);
  dom["post-open-btn"].addEventListener("click", createOpenShift);
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
  dom["role-select"].value = state.loginRole;
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
  dom["employee-search"].value = state.employeeFilter.search;
  dom["roster-shift-filter"].value = state.employeeFilter.shift;
  dom["employee-status-filter"].value = state.employeeFilter.status;
  dom["roster-sort"].value = state.employeeFilter.sort;
  // Restore active tab
  dom.tabButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === state.activeAdminTab));
  dom.tabPanes.forEach((pane) => pane.classList.toggle("hidden", pane.dataset.tabId !== state.activeAdminTab));
  populateUserSelect();
  populateTradeSelects();
  populateOpenShiftSelects();
  renderAuthBadge();
  renderSurfaceState();
}

function seedEmployees() {
  const shiftAssignments = ["A", "B", "C"];
  const pins = ["1111", "2222", "3333", "4444", "5555", "6666"];
  const titles = ["Firefighter", "Driver", "Lieutenant", "Captain", "Medic"];

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
      const eligible = state.employees.filter((employee) => employee.shift === unit.shift);
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

      if (unit.shift !== shift) {
        dayUnits[unit.id] = [];
      } else {
        dayUnits[unit.id] = assigned;
      }
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
        setPersistenceStatus("Connected to Supabase", "ok");
      } else {
        seedDefaultState();
        await persistAppState("Initial remote seed");
        loaded = true;
        setPersistenceStatus("Supabase seeded with starter data", "ok");
      }
    } catch (error) {
      console.error("Remote load failed", error);
      setPersistenceStatus("Supabase unavailable, using browser fallback", "warning");
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

function seedDefaultState() {
  state.employees = [];
  state.units = defaultUnits();
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
  seedEmployees();
  seedAssignments(false);
  seedWorkflowData();
}

function defaultUnits() {
  return [
    { id: "E1",  name: "Engine 1",    type: "engine",     minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "E2",  name: "Engine 2",    type: "engine",     minStaff: 4, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "E3",  name: "Engine 3",    type: "engine",     minStaff: 4, requiredCerts: ["paramedic"], shift: "C", visible: true  },
    { id: "L1",  name: "Ladder 1",    type: "ladder",     minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "L2",  name: "Ladder 2",    type: "ladder",     minStaff: 4, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "M1",  name: "Medic 1",     type: "ambulance",  minStaff: 2, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "M2",  name: "Medic 2",     type: "ambulance",  minStaff: 2, requiredCerts: ["paramedic"], shift: "B", visible: true  },
    { id: "M3",  name: "Medic 3",     type: "ambulance",  minStaff: 2, requiredCerts: ["paramedic"], shift: "C", visible: true  },
    { id: "BC1", name: "Battalion 1", type: "supervisor", minStaff: 2, requiredCerts: ["officer"],   shift: "A", visible: true  },
    { id: "BC2", name: "Battalion 2", type: "supervisor", minStaff: 2, requiredCerts: ["officer"],   shift: "B", visible: true  },
    { id: "T1",  name: "Tender 1",    type: "specialty",  minStaff: 2, requiredCerts: ["emt"],       shift: "C", visible: true  },
    { id: "R1",  name: "Rescue 1",    type: "specialty",  minStaff: 3, requiredCerts: ["paramedic"], shift: "A", visible: true  },
    { id: "HM1", name: "Hazmat 1",    type: "specialty",  minStaff: 3, requiredCerts: ["engineer"],  shift: "B", visible: true  },
    { id: "SV1", name: "Safety 1",    type: "supervisor", minStaff: 2, requiredCerts: ["officer"],   shift: "C", visible: true  },
    { id: "U14", name: "Utility 14",  type: "reserve",    minStaff: 2, requiredCerts: ["emt"],       shift: "C", visible: false },
    { id: "U15", name: "Utility 15",  type: "reserve",    minStaff: 2, requiredCerts: ["emt"],       shift: "A", visible: false },
    { id: "R2",  name: "Rescue 2",    type: "reserve",    minStaff: 3, requiredCerts: ["paramedic"], shift: "B", visible: false },
    { id: "M4",  name: "Medic 4",     type: "reserve",    minStaff: 2, requiredCerts: ["paramedic"], shift: "C", visible: false },
    { id: "B1",  name: "Brush 1",     type: "reserve",    minStaff: 2, requiredCerts: ["emt"],       shift: "A", visible: false },
    { id: "B2",  name: "Brush 2",     type: "reserve",    minStaff: 2, requiredCerts: ["emt"],       shift: "B", visible: false },
    { id: "L3",  name: "Ladder 3",    type: "reserve",    minStaff: 4, requiredCerts: ["paramedic"], shift: "C", visible: false },
    { id: "E4",  name: "Engine 4",    type: "reserve",    minStaff: 4, requiredCerts: ["paramedic"], shift: "A", visible: false },
  ];
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
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
  renderEmployeeRoster();
  renderEmployeeEditor();
  populateTradeSelects();
  populateOpenShiftSelects();
  renderPermissionStates();
  renderPersistenceStatus();
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

function renderPersistenceStatus() {
  const el = dom["storage-status"];
  el.textContent = state.persistence.status;
  el.className = "status-pill";
  if (state.persistence.level === "warning" || state.persistence.backend === "local-storage" || state.persistence.backend === "supabase-fallback") {
    el.classList.add("is-warning");
  }
  if (state.persistence.level === "danger" || state.persistence.backend === "browser-memory") {
    el.classList.add("is-danger");
  }
}

function canAccessAdmin() {
  return state.isAuthenticated && state.currentRole === "supervisor";
}

function renderAuthBadge() {
  const badge = dom["auth-role-badge"];
  const role = state.loginRole === "supervisor" ? "Supervisor access" : "Employee access";
  badge.textContent = role;
  badge.className = `badge ${state.loginRole === "supervisor" ? "badge-warning" : "badge-soft"}`;
}

function populateUserSelect() {
  const eligibleUsers = activeEmployees().filter((employee) => employee.isSupervisor === (state.loginRole === "supervisor"));
  dom["user-select"].innerHTML = eligibleUsers
    .map((employee) => `<option value="${employee.id}">${employee.name} • ${employee.shift} Shift</option>`)
    .join("");
  if (!state.currentUserId || !eligibleUsers.find((employee) => employee.id === state.currentUserId)) {
    state.currentUserId = eligibleUsers[0]?.id || null;
  }
  dom["user-select"].value = state.currentUserId || "";
}

function populateTradeSelects() {
  const employees = activeEmployees().map((employee) => `<option value="${employee.id}">${employee.name} • ${employee.shift}</option>`).join("");
  dom["trade-owner"].innerHTML = employees;
  dom["trade-partner"].innerHTML = employees;
  dom["trade-owner"].value = activeEmployeeById(state.currentUserId)?.id || activeEmployees()[0]?.id || "";
  dom["trade-partner"].value = activeEmployees().find((employee) => employee.id !== dom["trade-owner"].value)?.id || activeEmployees()[1]?.id || "";
  dom["trade-date"].value = addDays(state.currentDate, 3);
}

function populateOpenShiftSelects() {
  dom["open-unit"].innerHTML = visibleUnitsAll()
    .map((unit) => `<option value="${unit.id}">${unit.name}</option>`)
    .join("");
  dom["open-date"].value = addDays(state.currentDate, 2);
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

function renderAlerts() {
  const alerts = getStaffingAlerts(state.currentDate).slice(0, 4);
  if (!alerts.length) {
    dom["alert-strip"].innerHTML = `<div class="alert-chip">No staffing alerts for ${formatDate(state.currentDate)}</div>`;
    return;
  }
  dom["alert-strip"].innerHTML = alerts
    .map((alert) => `<div class="alert-chip">${alert.message}</div>`)
    .join("");
}

// ─── Schedule Views ───────────────────────────────────────────────────────────

function renderSchedule() {
  const range = getDateRange();
  const viewLabels = { day: "Daily Schedule", week: "Weekly Schedule", month: "Monthly Schedule" };
  dom["schedule-title"].textContent = viewLabels[state.currentView] || "Schedule View";
  dom["schedule-subtitle"].textContent = `${formatDate(range[0])}${range.length > 1 ? ` through ${formatDate(range[range.length - 1])}` : ""}`;

  if (state.currentView === "day") {
    dom["schedule-container"].innerHTML = renderTimelineCard(range[0]);
  } else if (state.currentView === "week") {
    dom["schedule-container"].innerHTML = renderWeekCalendar(range);
  } else {
    dom["schedule-container"].innerHTML = renderMonthCalendar(range);
  }

  attachUnitMoveEvents();
  attachCalendarNavEvents();
}

// Day view: full timeline card with unit details
function renderTimelineCard(date) {
  const shift = getShiftForDate(date);
  const alerts = getStaffingAlerts(date);
  const unitsMarkup = visibleUnits()
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

    const activeUnits = visibleUnits().filter((u) => u.shift === shift);
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
  const isActive = unit.shift === activeShift;
  const certCoverage = unit.requiredCerts.every((cert) => people.some((person) => person.certs.includes(cert)));
  const staffingOk = people.length >= unit.minStaff;
  const statusClass = !isActive ? "badge-soft" : staffingOk && certCoverage ? "badge-success" : "badge-danger";
  const statusLabel = !isActive ? "Off rotation" : staffingOk && certCoverage ? "Staffed" : "Needs attention";

  // Show employees from the same shift as the unit; supervisors can also see off-shift options
  const eligibleEmployees = state.currentRole === "supervisor"
    ? activeEmployees()
    : activeEmployees().filter((employee) => employee.shift === unit.shift);

  const options = eligibleEmployees
    .map((employee) => `<option value="${employee.id}">${employee.name} (${employee.shift})</option>`)
    .join("");

  return `
    <section class="unit-card">
      <div class="unit-card-header">
        <div>
          <h3>${unit.name}</h3>
          <div class="unit-meta">
            <span>${unit.type}</span>
            <span>${unit.minStaff} required</span>
            <span>${unit.requiredCerts.join(", ")}</span>
          </div>
        </div>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="person-list">
        ${
          people.length
            ? people
                .map(
                  (person) => `
              <div class="person-row">
                <div>
                  <strong>${person.name}</strong>
                  <small>${person.title} • ${person.shift} Shift</small>
                </div>
                <div class="pill-group">
                  ${person.certs.map((cert) => `<span class="pill">${cert}</span>`).join("")}
                  ${
                    state.currentRole === "supervisor"
                      ? `<button class="button button-secondary button-small" data-remove-assignment="${person.id}" data-remove-date="${date}" data-remove-unit="${unit.id}">Remove</button>`
                      : ""
                  }
                </div>
              </div>
            `,
                )
                .join("")
            : `<div class="empty-state">No assignment on this date. Supervisors can add personnel below.</div>`
        }
      </div>
      <div class="workflow-form ${state.currentRole !== "supervisor" ? "hidden" : ""}">
        <label>
          Add Personnel
          <select data-date="${date}" data-unit="${unit.id}" class="assignment-select">
            <option value="">Choose employee…</option>
            ${options}
          </select>
        </label>
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
              ? `<p class="helper-text">${unit.type} • ${unit.shift} shift</p>`
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

  let employees = [...state.employees].filter(normalizeEmployeeRecord);

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
                ${emp.certs.map((c) => `<span class="pill">${c}</span>`).join("")}
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
          <input id="employee-edit-title" type="text" value="${escapeHtml(draft.title || "")}" />
        </label>
        <label>
          Email
          <input id="employee-edit-email" type="email" value="${escapeHtml(draft.email || "")}" />
        </label>
        <label>
          PIN
          <input id="employee-edit-pin" type="text" maxlength="4" inputmode="numeric" value="${escapeHtml(draft.pin || "")}" />
        </label>
        <label>
          Shift
          <select id="employee-edit-shift">
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
      populateUserSelect();
      populateTradeSelects();
      populateOpenShiftSelects();
      render();
      persistAppState(`Employee ${employee.status === "archived" ? "archived" : "restored"}`);
    });
  });
}

function attachEmployeeEditorEvents() {
  const certInputs = [...document.querySelectorAll(".employee-cert-toggle")];
  const syncDraft = () => {
    if (!state.employeeDraft) return;
    state.employeeDraft.name = document.getElementById("employee-edit-name").value.trim();
    state.employeeDraft.title = document.getElementById("employee-edit-title").value.trim();
    state.employeeDraft.email = document.getElementById("employee-edit-email").value.trim();
    state.employeeDraft.pin = document.getElementById("employee-edit-pin").value.trim();
    state.employeeDraft.shift = document.getElementById("employee-edit-shift").value;
    state.employeeDraft.status = document.getElementById("employee-edit-status").value;
    state.employeeDraft.isSupervisor = document.getElementById("employee-edit-supervisor").checked;
    state.employeeDraft.certs = certInputs.filter((input) => input.checked).map((input) => input.value);
  };

  [
    "employee-edit-name",
    "employee-edit-title",
    "employee-edit-email",
    "employee-edit-pin",
    "employee-edit-shift",
    "employee-edit-status",
    "employee-edit-supervisor",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncDraft);
    document.getElementById(id)?.addEventListener("change", syncDraft);
  });
  certInputs.forEach((input) => input.addEventListener("change", syncDraft));

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
    pin: normalized.pin,
    shift: normalized.shift,
    status: normalized.status,
    isSupervisor: normalized.isSupervisor,
    certs: [...normalized.certs],
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
  if (!["A", "B", "C"].includes(state.employeeDraft.shift)) {
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
    isSupervisor: state.employeeDraft.isSupervisor || state.employeeDraft.certs.includes("officer"),
  });
  if (employee.id === state.currentUserId && employee.status === "archived") {
    employee.status = "active";
    showToast("The signed-in supervisor cannot archive their own account.", "error");
  }
  state.employeeDraft = createEmployeeDraft(employee);
  addAudit(`${employee.name} updated in employee directory.`, currentUserName());
  createNotification(`${employee.name} profile updated in employee directory.`, "email", currentUserName());
  populateUserSelect();
  populateTradeSelects();
  populateOpenShiftSelects();
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
  dom["supervisor-save-btn"].disabled = supervisorLocked;
  dom["post-open-btn"].disabled = supervisorLocked;
  dom["submit-trade-btn"].disabled = employeeLocked;
  dom["notify-btn"].disabled = employeeLocked;
  dom["print-btn"].disabled = employeeLocked;
  dom["schedule-status"].disabled = supervisorLocked;
  dom["trade-owner"].disabled = employeeLocked;
  dom["trade-partner"].disabled = employeeLocked;
  dom["trade-date"].disabled = employeeLocked;
  dom["trade-notes"].disabled = employeeLocked;
  dom["open-unit"].disabled = supervisorLocked;
  dom["open-date"].disabled = supervisorLocked;
  dom["open-qualification"].disabled = supervisorLocked;
  dom["open-report-time"].disabled = supervisorLocked;
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
  dom["employee-search"].disabled = supervisorLocked;
  dom["roster-shift-filter"].disabled = supervisorLocked;
  dom["employee-status-filter"].disabled = supervisorLocked;
  dom["roster-sort"].disabled = supervisorLocked;

  dom.mainContent.classList.toggle("is-locked", !state.isAuthenticated);
  dom.accessGate.classList.toggle("hidden", state.isAuthenticated);
  // On mobile: show sidebar (login) above main content when signed out, below when signed in
  dom.appShell.classList.toggle("is-authenticated", state.isAuthenticated);

  if (supervisorLocked) {
    dom["post-open-btn"].title = "Supervisor sign-in required";
    dom["publish-btn"].title = "Supervisor sign-in required";
  } else {
    dom["post-open-btn"].removeAttribute("title");
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
      state.assignments[date][unitId] = [...existingAssignments, employee];
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
      state.assignments[date][unitId] = getAssignments(date, unitId).filter((person) => person.id !== employeeId);
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

function handleSignIn() {
  const user = employeeById(dom["user-select"].value);
  if (!user) {
    dom["auth-message"].textContent = "Select a valid user.";
    return;
  }
  if (dom["pin-input"].value !== user.pin) {
    dom["auth-message"].textContent = "PIN did not match. Employee PINs cycle through 1111–6666. Supervisor PIN is 9000.";
    return;
  }
  state.isAuthenticated = true;
  state.currentUserId = user.id;
  state.currentRole = state.loginRole;
  dom["auth-message"].textContent = `${user.name} signed in as ${state.currentRole}.`;
  addAudit(`${user.name} signed in.`, "System");
  render();
}

function handlePublish() {
  if (state.currentRole !== "supervisor") {
    dom["auth-message"].textContent = "Supervisor login is required to publish schedules.";
    return;
  }
  state.scheduleStatus = "published";
  dom["schedule-status"].value = "published";
  addAudit(`Published ${state.currentView} schedule anchored on ${formatDate(state.currentDate)}.`, currentUserName());
  createNotification(`Schedule published for ${formatDate(state.currentDate)}.`, "email", currentUserName());
  render();
  persistAppState("Schedule published");
}

function saveSupervisorEdits() {
  if (state.currentRole !== "supervisor") {
    dom["auth-message"].textContent = "Supervisor login is required to save staffing changes.";
    return;
  }
  addAudit(`Supervisor staffing edits saved for ${formatDate(state.currentDate)}.`, currentUserName());
  createNotification(`Staffing updates saved for ${formatDate(state.currentDate)}.`, "email", currentUserName());
  persistAppState("Supervisor edits saved");
  showToast("Supervisor edits saved successfully.", "success");
  render();
}

function createTradeRequest() {
  if (!state.isAuthenticated) {
    dom["auth-message"].textContent = "Employee sign-in is required to submit a trade request.";
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

function createOpenShift() {
  if (state.currentRole !== "supervisor") {
    dom["auth-message"].textContent = "Supervisor login is required to post overtime shifts.";
    return;
  }
  const post = {
    id: `OT-${Date.now()}`,
    status: "open",
    unitId: dom["open-unit"].value,
    date: dom["open-date"].value,
    qualification: dom["open-qualification"].value,
    reportTime: dom["open-report-time"].value,
    applicants: availableEmployeesForOpenShift(dom["open-date"].value).slice(0, 3).map((employee) => employee.id),
  };
  state.overtimePosts.push(post);
  addAudit(`Open shift posted for ${unitById(post.unitId)?.name} on ${formatDate(post.date)}.`, currentUserName());
  createNotification(
    `Open shift posted for ${unitById(post.unitId)?.name}. Eligible off-duty employees notified by email.`,
    "email",
    currentUserName(),
  );
  render();
  persistAppState("Open shift posted");
}

function createDailyDigest() {
  if (!state.isAuthenticated) {
    dom["auth-message"].textContent = "Sign in is required to send the daily digest.";
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
  populateUserSelect();
  populateTradeSelects();
  populateOpenShiftSelects();
  addAudit("Employee CSV import applied.", currentUserName());
  createNotification("Employee import completed successfully.", "email", currentUserName());
  dom["import-message"].textContent = "Employee import applied and schedule regenerated.";
  dom["import-file"].value = "";
  render();
  showToast("Employee import applied successfully.", "success");
  persistAppState("Employee CSV import applied");
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
  populateOpenShiftSelects();
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
      "id,name,type,minStaff,requiredCerts,shift,visible",
      'E5,"Engine 5",engine,4,"paramedic",A,true',
      'M5,"Medic 5",ambulance,2,"paramedic",B,false',
    ].join("\n"),
  );
}

function approveQueueItem(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (trade) {
    trade.status = "approved";
    createNotification(`Trade for ${formatDate(trade.date)} approved for ${employeeById(trade.employeeId)?.name} and ${employeeById(trade.partnerId)?.name}.`, "email", currentUserName());
    addAudit(`Trade ${trade.id} approved.`, currentUserName());
    render();
    persistAppState("Trade approved");
    return;
  }
  const overtime = state.overtimePosts.find((item) => item.id === id);
  if (overtime) {
    overtime.status = "approved";
    overtime.approvedEmployeeId = overtime.applicants[0];
    const employee = employeeById(overtime.approvedEmployeeId);
    createNotification(
      `${employee?.name} approved for overtime on ${formatDate(overtime.date)} at ${unitById(overtime.unitId)?.name}. Report at ${overtime.reportTime}.`,
      "email",
      currentUserName(),
    );
    addAudit(`Overtime ${overtime.id} awarded to ${employee?.name}.`, currentUserName());
    render();
    persistAppState("Overtime approved");
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
  return visibleUnits()
    .filter((unit) => unit.shift === getShiftForDate(date))
    .flatMap((unit) => {
      const people = getAssignments(date, unit.id);
      const alerts = [];
      if (people.length < unit.minStaff) {
        alerts.push({ level: "danger", message: `${unit.name} short ${unit.minStaff - people.length} staffing slot(s).` });
      }
      unit.requiredCerts.forEach((cert) => {
        if (!people.some((person) => person.certs.includes(cert))) {
          alerts.push({ level: "warning", message: `${unit.name} missing ${cert} coverage.` });
        }
      });
      return alerts;
    });
}

function getShiftForDate(date) {
  const diff = diffDays(ROTATION_BASE_DATE, date);
  const index = ((diff % rotationPattern.length) + rotationPattern.length) % rotationPattern.length;
  return rotationPattern[index];
}

function visibleUnits() {
  return state.units.filter((unit) => unit.visible);
}

function visibleUnitsAll() {
  return state.units;
}

function availableEmployeesForOpenShift(date) {
  const activeShift = getShiftForDate(date);
  return activeEmployees().filter((employee) => employee.shift !== activeShift);
}

// ─── Notification / Audit Helpers ─────────────────────────────────────────────

function createNotification(message, channel, createdBy) {
  const title = channel === "sms" ? "SMS notification" : "Email notification";
  const entry = {
    id: `NT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    message,
    channel,
    createdBy,
    time: formatDateTime(new Date()),
  };
  state.notifications.push(entry);
  return entry;
}

function addAudit(message, actor) {
  state.auditLog.push(createAuditEntry(message, actor));
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
  return employeeById(state.currentUserId)?.name || "Supervisor";
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
  employee.status = employee.status === "archived" ? "archived" : "active";
  return employee;
}

function unitById(id) {
  return state.units.find((unit) => unit.id === id);
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
    const normalized = {
      id: row.id || "",
      name: row.name || "",
      type: (row.type || "").toLowerCase(),
      minStaff: Number(row.minstaff),
      requiredCerts,
      shift: (row.shift || "").toUpperCase(),
      visible: parseBoolean(row.visible),
    };
    if (!normalized.id || !normalized.name) { errors.push({ message: `Row ${line}: missing id or name.` }); return; }
    if (!unitTypes.includes(normalized.type)) { errors.push({ message: `Row ${line}: invalid type "${normalized.type}". Must be one of: ${unitTypes.join(", ")}.` }); return; }
    if (!Number.isFinite(normalized.minStaff) || normalized.minStaff < 1) { errors.push({ message: `Row ${line}: minStaff must be a positive number.` }); return; }
    if (!["A", "B", "C"].includes(normalized.shift)) { errors.push({ message: `Row ${line}: shift must be A, B, or C.` }); return; }
    const invalidCerts = requiredCerts.filter((cert) => !employeeRoles.includes(cert));
    if (invalidCerts.length) { errors.push({ message: `Row ${line}: invalid required certs: ${invalidCerts.join(", ")}.` }); return; }
    if (normalized.type === "reserve" && normalized.visible) warnings.push({ message: `Row ${line}: reserve unit marked visible.` });
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
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

function remoteBaseUrl() {
  return `${window.APP_CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/scheduler_state`;
}

async function loadRemoteState() {
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
      state.persistence.backend = "supabase";
      setPersistenceStatus(`Saved to Supabase${reason ? ` • ${reason}` : ""}`, "ok");
    } else {
      state.persistence.backend = "local-storage";
      setPersistenceStatus(`Saved in browser${reason ? ` • ${reason}` : ""}`, "warning");
    }
  } catch (error) {
    console.error("Persist failed", error);
    saveLocalState();
    state.persistence.backend = hasRemotePersistence() ? "supabase-fallback" : "local-storage";
    setPersistenceStatus("Saved in browser fallback only", "warning");
  } finally {
    state.persistence.isSaving = false;
    state.persistence.lastSavedAt = new Date().toISOString();
    renderPersistenceStatus();
  }
}

async function saveRemoteState() {
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
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serializableState()));
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
    employees: state.employees,
    trades: state.trades,
    overtimePosts: state.overtimePosts,
    notifications: state.notifications,
    auditLog: state.auditLog,
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

  state.units = Array.isArray(data.units) ? data.units : defaultUnits();
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

function setPersistenceStatus(message, level) {
  state.persistence.status = message;
  state.persistence.level = level;
}
