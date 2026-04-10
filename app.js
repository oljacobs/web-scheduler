const state = {
  currentUserId: null,
  loginRole: "employee",
  currentRole: "employee",
  isAuthenticated: false,
  currentView: "day",
  currentDate: "2026-04-10",
  scheduleStatus: "draft",
  smsReady: true,
  units: [
    { id: "E1", name: "Engine 1", type: "engine", minStaff: 4, requiredCerts: ["paramedic"], shift: "AA", visible: true },
    { id: "E2", name: "Engine 2", type: "engine", minStaff: 4, requiredCerts: ["paramedic"], shift: "BB", visible: true },
    { id: "E3", name: "Engine 3", type: "engine", minStaff: 4, requiredCerts: ["paramedic"], shift: "CC", visible: true },
    { id: "L1", name: "Ladder 1", type: "ladder", minStaff: 4, requiredCerts: ["paramedic"], shift: "AA", visible: true },
    { id: "L2", name: "Ladder 2", type: "ladder", minStaff: 4, requiredCerts: ["paramedic"], shift: "BB", visible: true },
    { id: "M1", name: "Medic 1", type: "ambulance", minStaff: 2, requiredCerts: ["paramedic"], shift: "AA", visible: true },
    { id: "M2", name: "Medic 2", type: "ambulance", minStaff: 2, requiredCerts: ["paramedic"], shift: "BB", visible: true },
    { id: "M3", name: "Medic 3", type: "ambulance", minStaff: 2, requiredCerts: ["paramedic"], shift: "CC", visible: true },
    { id: "BC1", name: "Battalion 1", type: "supervisor", minStaff: 2, requiredCerts: ["officer"], shift: "AA", visible: true },
    { id: "BC2", name: "Battalion 2", type: "supervisor", minStaff: 2, requiredCerts: ["officer"], shift: "BB", visible: true },
    { id: "T1", name: "Tender 1", type: "specialty", minStaff: 2, requiredCerts: ["emt"], shift: "CC", visible: true },
    { id: "R1", name: "Rescue 1", type: "specialty", minStaff: 3, requiredCerts: ["paramedic"], shift: "AA", visible: true },
    { id: "HM1", name: "Hazmat 1", type: "specialty", minStaff: 3, requiredCerts: ["engineer"], shift: "BB", visible: true },
    { id: "U14", name: "Utility 14", type: "reserve", minStaff: 2, requiredCerts: ["emt"], shift: "CC", visible: false },
    { id: "U15", name: "Utility 15", type: "reserve", minStaff: 2, requiredCerts: ["emt"], shift: "AA", visible: false },
    { id: "R2", name: "Rescue 2", type: "reserve", minStaff: 3, requiredCerts: ["paramedic"], shift: "BB", visible: false },
    { id: "M4", name: "Medic 4", type: "reserve", minStaff: 2, requiredCerts: ["paramedic"], shift: "CC", visible: false },
    { id: "B1", name: "Brush 1", type: "reserve", minStaff: 2, requiredCerts: ["emt"], shift: "AA", visible: false },
    { id: "B2", name: "Brush 2", type: "reserve", minStaff: 2, requiredCerts: ["emt"], shift: "BB", visible: false },
    { id: "L3", name: "Ladder 3", type: "reserve", minStaff: 4, requiredCerts: ["paramedic"], shift: "CC", visible: false },
    { id: "E4", name: "Engine 4", type: "reserve", minStaff: 4, requiredCerts: ["paramedic"], shift: "AA", visible: false },
    { id: "SV1", name: "Safety 1", type: "supervisor", minStaff: 2, requiredCerts: ["officer"], shift: "CC", visible: true },
  ],
  employees: [],
  trades: [],
  overtimePosts: [],
  notifications: [],
  auditLog: [],
  importPreview: null,
};

const baseDate = "2026-04-10";
const rotationPattern = ["AA", "AA", "off", "off", "off", "off", "BB", "BB", "off", "off", "off", "off", "CC", "CC", "off", "off", "off", "off"];

const firstNames = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Dakota", "Avery", "Parker", "Riley", "Cameron",
  "Quinn", "Hayden", "Reese", "Logan", "Harper", "Rowan", "Skyler", "Mason", "Peyton", "Blake",
];
const lastNames = [
  "Adams", "Brooks", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hayes", "Irwin", "Jensen",
  "Keller", "Lawson", "Morris", "Norris", "Owens", "Price", "Ramirez", "Stewart", "Turner", "Ward",
];

const employeeRoles = ["paramedic", "emt", "engineer", "officer"];

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
  seedEmployees();
  seedAssignments();
  seedWorkflowData();
  cacheDom();
  wireEvents();
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
    "approval-queue", "audit-log", "print-btn", "notify-btn", "import-type", "import-file", "preview-import-btn",
    "apply-import-btn", "download-employee-template-btn", "download-unit-template-btn", "import-message", "import-preview",
  ];
  ids.forEach((id) => {
    dom[id] = document.getElementById(id);
  });
  dom.viewButtons = [...document.querySelectorAll(".view-button")];
  dom.mainContent = document.getElementById("main-content");
  dom.accessGate = document.getElementById("access-gate");
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
  dom["preview-import-btn"].addEventListener("click", previewImport);
  dom["apply-import-btn"].addEventListener("click", applyImport);
  dom["download-employee-template-btn"].addEventListener("click", downloadEmployeeTemplate);
  dom["download-unit-template-btn"].addEventListener("click", downloadUnitTemplate);
  dom.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      render();
    });
  });
}

function initializeControls() {
  dom["role-select"].value = state.loginRole;
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
  populateUserSelect();
  populateTradeSelects();
  populateOpenShiftSelects();
  renderAuthBadge();
}

function seedEmployees() {
  const shiftAssignments = ["AA", "BB", "CC"];
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
    });
  }
}

function seedAssignments() {
  state.assignments = {};
  for (let offset = 0; offset < 90; offset += 1) {
    const date = addDays(baseDate, offset);
    const shift = getShiftForDate(date);
    const dayUnits = {};

    visibleUnitsAll().forEach((unit, index) => {
      const eligible = state.employees.filter((employee) => employee.shift === unit.shift);
      const assigned = [];
      const targetCount = unit.minStaff + ((index + offset) % 4 === 0 ? -1 : 0);

      eligible.forEach((employee) => {
        if (assigned.length >= Math.max(1, targetCount)) {
          return;
        }
        const unitLoad = Object.values(dayUnits).flat().find((person) => person.id === employee.id);
        if (!unitLoad) {
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
    createNotification("SMS delivery connectors reserved for later activation.", "sms", "system"),
  ];

  state.auditLog = [
    createAuditEntry("Initial trial dataset loaded.", "System"),
    createAuditEntry("Monthly schedule generated 90 days ahead.", "System"),
  ];
}

function render() {
  dom["date-input"].value = state.currentDate;
  dom["schedule-status"].value = state.scheduleStatus;
  dom.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.currentView));
  renderSummary();
  renderAlerts();
  renderSchedule();
  renderUnitControls();
  renderNotifications();
  renderApprovalQueue();
  renderAuditLog();
  renderImportPreview();
  populateTradeSelects();
  populateOpenShiftSelects();
  renderPermissionStates();
}

function renderAuthBadge() {
  const badge = dom["auth-role-badge"];
  const role = state.loginRole === "supervisor" ? "Supervisor access" : "Employee access";
  badge.textContent = role;
  badge.className = `badge ${state.loginRole === "supervisor" ? "badge-warning" : "badge-soft"}`;
}

function populateUserSelect() {
  const eligibleUsers = state.employees.filter((employee) => employee.isSupervisor === (state.loginRole === "supervisor"));
  dom["user-select"].innerHTML = eligibleUsers
    .map((employee) => `<option value="${employee.id}">${employee.name} • ${employee.shift} Shift</option>`)
    .join("");
  if (!state.currentUserId || !eligibleUsers.find((employee) => employee.id === state.currentUserId)) {
    state.currentUserId = eligibleUsers[0]?.id || null;
  }
  dom["user-select"].value = state.currentUserId || "";
}

function populateTradeSelects() {
  const employees = state.employees.map((employee) => `<option value="${employee.id}">${employee.name} • ${employee.shift}</option>`).join("");
  dom["trade-owner"].innerHTML = employees;
  dom["trade-partner"].innerHTML = employees;
  dom["trade-owner"].value = state.currentUserId || state.employees[0].id;
  dom["trade-partner"].value = state.employees.find((employee) => employee.id !== dom["trade-owner"].value)?.id || state.employees[1].id;
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
  const visibleUnits = visibleUnits();
  const activeShift = getShiftForDate(state.currentDate);
  const offUnits = state.units.length - visibleUnits.length;
  const uncovered = range.flatMap((date) => getStaffingAlerts(date)).filter((alert) => alert.level === "danger").length;

  dom["summary-grid"].innerHTML = `
    <div class="summary-card">
      <span>Active Shift</span>
      <strong>${activeShift}</strong>
      <small>${formatDate(state.currentDate)}</small>
    </div>
    <div class="summary-card">
      <span>Visible Units</span>
      <strong>${visibleUnits.length}</strong>
      <small>${offUnits} hidden / reserve</small>
    </div>
    <div class="summary-card">
      <span>Employees</span>
      <strong>${state.employees.length}</strong>
      <small>PIN sign-in enabled</small>
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

function renderSchedule() {
  const range = getDateRange();
  dom["schedule-title"].textContent =
    state.currentView === "day"
      ? `Daily Schedule`
      : state.currentView === "week"
        ? "Weekly Schedule"
        : "Monthly Schedule";
  dom["schedule-subtitle"].textContent = `${formatDate(range[0])}${range.length > 1 ? ` through ${formatDate(range[range.length - 1])}` : ""}`;

  dom["schedule-container"].innerHTML = range
    .map((date) => renderTimelineCard(date))
    .join("");

  attachUnitMoveEvents();
}

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
          <p class="helper-text">${shift} shift on duty • 48/96 rotation</p>
        </div>
        <div class="pill-group">
          <span class="pill">${alerts.filter((item) => item.level === "danger").length} staffing risks</span>
          <span class="pill pill-highlight">${alerts.filter((item) => item.level === "warning").length} watch items</span>
        </div>
      </div>
      <div class="timeline-grid">${unitsMarkup}</div>
    </article>
  `;
}

function renderUnitCard(unit, date, activeShift) {
  const people = getAssignments(date, unit.id);
  const isActive = unit.shift === activeShift;
  const certCoverage = unit.requiredCerts.every((cert) => people.some((person) => person.certs.includes(cert)));
  const staffingOk = people.length >= unit.minStaff;
  const statusClass = !isActive ? "badge-soft" : staffingOk && certCoverage ? "badge-success" : "badge-danger";
  const statusLabel = !isActive ? "Off rotation" : staffingOk && certCoverage ? "Staffed" : "Needs attention";

  const options = state.employees
    .filter((employee) => employee.shift === unit.shift)
    .map((employee) => `<option value="${employee.id}">${employee.name}</option>`)
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
          Add Or Reassign Personnel
          <select data-date="${date}" data-unit="${unit.id}" class="assignment-select">
            <option value="">Choose employee</option>
            ${options}
          </select>
        </label>
      </div>
    </section>
  `;
}

function renderUnitControls() {
  dom["unit-toggle-list"].innerHTML = state.units
    .map(
      (unit) => `
      <label class="toggle-item">
        <div>
          <strong>${unit.name}</strong>
          <p class="helper-text">${unit.type} • ${unit.shift} shift</p>
        </div>
        <input type="checkbox" data-unit-toggle="${unit.id}" ${unit.visible ? "checked" : ""} ${state.currentRole !== "supervisor" ? "disabled" : ""} />
      </label>
    `,
    )
    .join("");

  [...document.querySelectorAll("[data-unit-toggle]")].forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const unit = state.units.find((item) => item.id === checkbox.dataset.unitToggle);
      unit.visible = checkbox.checked;
      addAudit(`${unit.name} ${unit.visible ? "shown" : "hidden"} on schedule view.`, currentUserName());
      render();
    });
  });
}

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
    dom["import-preview"].innerHTML = `<div class="empty-state">No import preview yet. Choose a CSV and preview it before applying.</div>`;
    return;
  }

  const { type, stats, errors, warnings, rows } = state.importPreview;
  const sampleRows = rows.slice(0, 5);
  const tableHeaders = sampleRows.length ? Object.keys(sampleRows[0]) : [];

  dom["import-preview"].innerHTML = `
    <article class="queue-item">
      <strong>${capitalize(type)} import preview</strong>
      <p>${stats.valid} valid row(s), ${errors.length} error(s), ${warnings.length} warning(s)</p>
      <time>Ready for supervisor review</time>
    </article>
    ${
      errors.length
        ? `<article class="queue-item"><strong>Errors</strong><p>${errors.map((error) => error.message).join("<br />")}</p></article>`
        : ""
    }
    ${
      warnings.length
        ? `<article class="queue-item"><strong>Warnings</strong><p>${warnings.map((warning) => warning.message).join("<br />")}</p></article>`
        : ""
    }
    ${
      sampleRows.length
        ? `
      <article class="queue-item">
        <strong>Sample rows</strong>
        <table class="preview-table">
          <thead>
            <tr>${tableHeaders.map((header) => `<th>${header}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${sampleRows.map((row) => `<tr>${tableHeaders.map((header) => `<td>${row[header] ?? ""}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </article>
    `
        : ""
    }
  `;
}

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
  dom["import-type"].disabled = supervisorLocked;
  dom["import-file"].disabled = supervisorLocked;
  dom["preview-import-btn"].disabled = supervisorLocked;
  dom["apply-import-btn"].disabled = supervisorLocked || !state.importPreview || state.importPreview.errors.length > 0;
  dom["download-employee-template-btn"].disabled = supervisorLocked;
  dom["download-unit-template-btn"].disabled = supervisorLocked;
  dom.mainContent.classList.toggle("is-locked", !state.isAuthenticated);
  dom.accessGate.classList.toggle("hidden", state.isAuthenticated);

  if (supervisorLocked) {
    dom["post-open-btn"].title = "Supervisor sign-in required";
    dom["publish-btn"].title = "Supervisor sign-in required";
  } else {
    dom["post-open-btn"].removeAttribute("title");
    dom["publish-btn"].removeAttribute("title");
  }
}

function attachUnitMoveEvents() {
  [...document.querySelectorAll(".assignment-select")].forEach((select) => {
    select.addEventListener("change", () => {
      if (!select.value) {
        return;
      }
      const date = select.dataset.date;
      const unitId = select.dataset.unit;
      const employee = employeeById(select.value);
      const existingAssignments = getAssignments(date, unitId);
      if (existingAssignments.find((person) => person.id === employee.id)) {
        return;
      }
      state.assignments[date][unitId] = [...existingAssignments, employee];
      addAudit(`${employee.name} added to ${unitById(unitId).name} on ${formatDate(date)}.`, currentUserName());
      createNotification(`${employee.name} reassigned to ${unitById(unitId).name} for ${formatDate(date)}.`, "email", currentUserName());
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
    dom["auth-message"].textContent = "PIN did not match. Trial employee PINs rotate through 1111-6666. Supervisor PIN is 9000.";
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
  createNotification(`Schedule published for ${formatDate(state.currentDate)} and forward planning window.`, "email", currentUserName());
  render();
}

function saveSupervisorEdits() {
  if (state.currentRole !== "supervisor") {
    dom["auth-message"].textContent = "Supervisor login is required to save staffing changes.";
    return;
  }
  addAudit(`Supervisor staffing edits saved for ${formatDate(state.currentDate)}.`, currentUserName());
  createNotification(`Staffing updates saved for ${formatDate(state.currentDate)}.`, "email", currentUserName());
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
  if (!ownerId || !partnerId || ownerId === partnerId) {
    return;
  }
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
  addAudit(`Open shift posted for ${unitById(post.unitId).name} on ${formatDate(post.date)}.`, currentUserName());
  createNotification(
    `Open shift posted for ${unitById(post.unitId).name}. Eligible off-duty employees were notified by email. SMS can be enabled later.`,
    "email",
    currentUserName(),
  );
  render();
}

function createDailyDigest() {
  if (!state.isAuthenticated) {
    dom["auth-message"].textContent = "Sign in is required to send the daily digest.";
    return;
  }
  createNotification(`Daily digest sent for ${formatDate(state.currentDate)} to logged-in department members.`, "email", "System");
  addAudit(`Daily digest generated for ${formatDate(state.currentDate)}.`, "System");
  render();
}

async function previewImport() {
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
    state.importPreview = {
      type: dom["import-type"].value,
      rows: [],
      errors: [{ message: "The CSV did not contain any data rows." }],
      warnings: [],
      validRows: [],
      stats: { valid: 0 },
    };
    dom["import-message"].textContent = "The selected CSV was empty.";
    render();
    return;
  }
  const type = dom["import-type"].value;
  const preview = type === "employees" ? validateEmployeeImport(rows) : validateUnitImport(rows);
  state.importPreview = { ...preview, type };
  dom["import-message"].textContent = `Preview ready for ${rows.length} row(s). Review errors and warnings before applying.`;
  render();
}

function applyImport() {
  if (state.currentRole !== "supervisor" || !state.isAuthenticated) {
    dom["import-message"].textContent = "Supervisor sign-in is required to apply imports.";
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

  if (state.importPreview.type === "employees") {
    mergeEmployees(state.importPreview.validRows);
  } else {
    mergeUnits(state.importPreview.validRows);
  }

  state.importPreview = null;
  seedAssignments();
  populateUserSelect();
  populateTradeSelects();
  populateOpenShiftSelects();
  addAudit(`${capitalize(dom["import-type"].value)} CSV import applied.`, currentUserName());
  createNotification(`${capitalize(dom["import-type"].value)} import completed successfully.`, "email", currentUserName());
  dom["import-message"].textContent = "Import applied successfully and the schedule was regenerated.";
  dom["import-file"].value = "";
  render();
}

function downloadEmployeeTemplate() {
  downloadCsv(
    "d7fr-employees-template.csv",
    [
      "id,name,shift,title,certs,pin,email,isSupervisor",
      'EMP-061,"Jamie Stone",AA,Firefighter,"emt|paramedic",1234,jamie.stone@d7fr.org,false',
      'EMP-062,"Avery Cole",BB,Captain,"officer|emt",9000,avery.cole@d7fr.org,true',
    ].join("\n"),
  );
}

function downloadUnitTemplate() {
  downloadCsv(
    "d7fr-units-template.csv",
    [
      "id,name,type,minStaff,requiredCerts,shift,visible",
      'E5,"Engine 5",engine,4,"paramedic",AA,true',
      'M5,"Medic 5",ambulance,2,"paramedic",BB,false',
    ].join("\n"),
  );
}

function approveQueueItem(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (trade) {
    trade.status = "approved";
    createNotification(`Trade for ${formatDate(trade.date)} approved for ${employeeById(trade.employeeId).name} and ${employeeById(trade.partnerId).name}.`, "email", currentUserName());
    addAudit(`Trade ${trade.id} approved.`, currentUserName());
    render();
    return;
  }

  const overtime = state.overtimePosts.find((item) => item.id === id);
  if (overtime) {
    overtime.status = "approved";
    overtime.approvedEmployeeId = overtime.applicants[0];
    const employee = employeeById(overtime.approvedEmployeeId);
    createNotification(
      `${employee.name} approved for overtime on ${formatDate(overtime.date)} at ${unitById(overtime.unitId).name}. Report at ${overtime.reportTime}.`,
      "email",
      currentUserName(),
    );
    addAudit(`Overtime ${overtime.id} awarded to ${employee.name}.`, currentUserName());
    render();
  }
}

function denyQueueItem(id) {
  const trade = state.trades.find((item) => item.id === id);
  if (trade) {
    trade.status = "denied";
    createNotification(`Trade request for ${formatDate(trade.date)} denied. Both employees were notified.`, "email", currentUserName());
    addAudit(`Trade ${trade.id} denied.`, currentUserName());
    render();
    return;
  }
  const overtime = state.overtimePosts.find((item) => item.id === id);
  if (overtime) {
    overtime.status = "denied";
    createNotification(`Open shift for ${unitById(overtime.unitId).name} on ${formatDate(overtime.date)} was closed without assignment.`, "email", currentUserName());
    addAudit(`Overtime ${overtime.id} denied or closed.`, currentUserName());
    render();
  }
}

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
        alerts.push({
          level: "danger",
          message: `${unit.name} short ${unit.minStaff - people.length} staffing slot(s).`,
        });
      }
      unit.requiredCerts.forEach((cert) => {
        if (!people.some((person) => person.certs.includes(cert))) {
          alerts.push({
            level: "warning",
            message: `${unit.name} missing ${cert} coverage.`,
          });
        }
      });
      return alerts;
    });
}

function getShiftForDate(date) {
  const diff = diffDays(baseDate, date);
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
  return state.employees.filter((employee) => employee.shift !== activeShift);
}

function createNotification(message, channel, createdBy) {
  const title = channel === "sms" ? "SMS-ready integration" : "Email notification";
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
  return state.employees.find((employee) => employee.id === id);
}

function unitById(id) {
  return state.units.find((unit) => unit.id === id);
}

function todayIso() {
  return "2026-04-10";
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseCsv(input) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current.trim());
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = cells[index] ?? "";
    });
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
    const normalized = {
      id: row.id || `EMP-${String(state.employees.length + validRows.length + 1).padStart(3, "0")}`,
      name: row.name || "",
      shift: (row.shift || "").toUpperCase(),
      title: row.title || "Firefighter",
      certs,
      pin: row.pin || (parseBoolean(row.issupervisor) || certs.includes("officer") ? "9000" : "1111"),
      email: row.email || "",
      isSupervisor: parseBoolean(row.issupervisor),
    };

    if (!normalized.name) {
      errors.push({ message: `Employee row ${line} is missing a name.` });
      return;
    }
    if (!["AA", "BB", "CC"].includes(normalized.shift)) {
      errors.push({ message: `Employee row ${line} must use shift AA, BB, or CC.` });
      return;
    }
    if (!normalized.email) {
      warnings.push({ message: `Employee row ${line} has no email address.` });
    }
    const invalidCerts = certs.filter((cert) => !employeeRoles.includes(cert));
    if (invalidCerts.length) {
      errors.push({ message: `Employee row ${line} has invalid cert values: ${invalidCerts.join(", ")}.` });
      return;
    }
    validRows.push(normalized);
  });

  return {
    rows,
    errors,
    warnings,
    validRows,
    stats: { valid: validRows.length },
  };
}

function validateUnitImport(rows) {
  const errors = [];
  const warnings = [];
  const validRows = [];
  const allowedTypes = ["engine", "ladder", "ambulance", "supervisor", "specialty", "reserve"];

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

    if (!normalized.id || !normalized.name) {
      errors.push({ message: `Unit row ${line} is missing id or name.` });
      return;
    }
    if (!allowedTypes.includes(normalized.type)) {
      errors.push({ message: `Unit row ${line} has an invalid type.` });
      return;
    }
    if (!Number.isFinite(normalized.minStaff) || normalized.minStaff < 1) {
      errors.push({ message: `Unit row ${line} needs a valid minimum staffing number.` });
      return;
    }
    if (!["AA", "BB", "CC"].includes(normalized.shift)) {
      errors.push({ message: `Unit row ${line} must use shift AA, BB, or CC.` });
      return;
    }
    const invalidCerts = requiredCerts.filter((cert) => !employeeRoles.includes(cert));
    if (invalidCerts.length) {
      errors.push({ message: `Unit row ${line} has invalid required certs: ${invalidCerts.join(", ")}.` });
      return;
    }
    if (normalized.type === "reserve" && normalized.visible) {
      warnings.push({ message: `Unit row ${line} is reserve but marked visible.` });
    }
    validRows.push(normalized);
  });

  return {
    rows,
    errors,
    warnings,
    validRows,
    stats: { valid: validRows.length },
  };
}

function mergeEmployees(rows) {
  rows.forEach((row) => {
    const existingIndex = state.employees.findIndex((employee) => employee.id === row.id);
    const nextEmployee = {
      ...state.employees[existingIndex],
      ...row,
      certs: Array.from(new Set(row.certs.length ? row.certs : ["emt"])),
      isSupervisor: row.isSupervisor || row.certs.includes("officer"),
    };
    if (existingIndex >= 0) {
      state.employees[existingIndex] = nextEmployee;
    } else {
      state.employees.push(nextEmployee);
    }
  });
}

function mergeUnits(rows) {
  rows.forEach((row) => {
    const existingIndex = state.units.findIndex((unit) => unit.id === row.id);
    if (existingIndex >= 0) {
      state.units[existingIndex] = { ...state.units[existingIndex], ...row };
    } else {
      state.units.push(row);
    }
  });
}

function splitList(value) {
  return (value || "")
    .split(/[|;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ["true", "yes", "1", "y"].includes(String(value || "").toLowerCase());
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
