(() => {
  const STORAGE_KEY = "academic-management-db";
  const YEARS = [1, 2, 3, 4, 5];

  const defaultDB = {
    role: "Coordinador",
    coordinations: [],
    careers: [],
    categories: [],
    teachers: [],
    shifts: [],
    periods: [],
    csvUploads: [],
    classCatalog: [],
    scheduleEntries: [],
    activeContext: { coordinationId: "", careerId: "", shiftId: "" },
    viewContext: { coordinationId: "", careerId: "", shiftId: "" },
  };

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const toMinuteMark = (value) => {
    if (!value) return null;
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };

  const createDataSource = (key, seed) => ({
    read() {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(seed);
      try {
        return { ...structuredClone(seed), ...JSON.parse(raw) };
      } catch {
        return structuredClone(seed);
      }
    },
    write(data) {
      localStorage.setItem(key, JSON.stringify(data));
    },
  });

  const dataSource = createDataSource(STORAGE_KEY, defaultDB);

  const repository = {
    get: () => dataSource.read(),
    save(db) {
      dataSource.write(db);
    },
  };

  const service = {
    getAll: () => repository.get(),
    createCoordination(name) {
      const db = repository.get();
      db.coordinations.push({ id: createId("coord"), name: name.trim() });
      repository.save(db);
    },
    createCareer(name, coordinationId) {
      const db = repository.get();
      db.careers.push({ id: createId("career"), name: name.trim(), coordinationId });
      repository.save(db);
    },
    createCategory(name) {
      const db = repository.get();
      db.categories.push({ id: createId("category"), name: name.trim() });
      repository.save(db);
    },
    createTeacher(name) {
      const db = repository.get();
      db.teachers.push({ id: createId("teacher"), name: name.trim() });
      repository.save(db);
    },
    createShift(payload) {
      const db = repository.get();
      db.shifts.push({ id: createId("shift"), ...payload });
      repository.save(db);
      return { ok: true };
    },
    createPeriod(payload) {
      const shift = repository.get().shifts.find((item) => item.id === payload.shiftId);
      if (!shift) return { ok: false, error: "Selecciona un turno válido." };

      const start = toMinuteMark(payload.startTime);
      const end = toMinuteMark(payload.endTime);
      const shiftStart = toMinuteMark(shift.startTime);
      const shiftEnd = shiftStart + shift.blocks * shift.minutesPerBlock;

      if (start >= end) return { ok: false, error: "El período debe terminar después de iniciar." };
      if (start < shiftStart || end > shiftEnd) return { ok: false, error: "El período debe estar dentro del turno." };

      const db = repository.get();
      db.periods.push({ id: createId("period"), ...payload });
      repository.save(db);
      return { ok: true };
    },
    deletePeriod(periodId) {
      const db = repository.get();
      db.periods = db.periods.filter((period) => period.id !== periodId);
      repository.save(db);
    },
    updateContext(type, payload) {
      const db = repository.get();
      db[type] = { ...db[type], ...payload };
      repository.save(db);
    },
    saveCsv(fileName, csvText, context) {
      const db = repository.get();
      const lines = csvText.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return { ok: false, error: "El CSV no contiene datos." };

      const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
      const required = ["clase", "año", "créditos", "categorías", "compartido"];
      const missing = required.filter((item) => !headers.includes(item));
      if (missing.length > 0) return { ok: false, error: `Faltan columnas: ${missing.join(", ")}` };

      const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
      const parsed = lines.slice(1).map((row) => row.split(",")).map((cells) => {
        const year = Number(String(cells[idx["año"]] || "").replace(/[^0-9]/g, ""));
        return {
          id: createId("class"),
          className: (cells[idx.clase] || "").trim(),
          year: YEARS.includes(year) ? year : 1,
          credits: Number(cells[idx["créditos"]] || 0) || 1,
          category: (cells[idx["categorías"]] || "").trim(),
          shared: (cells[idx.compartido] || "").trim(),
          coordinationId: context.coordinationId,
          careerId: context.careerId,
        };
      }).filter((item) => item.className);

      db.classCatalog.push(...parsed);
      db.csvUploads.push({ id: createId("csv"), fileName, uploadedAt: new Date().toISOString(), rows: parsed.length });
      repository.save(db);
      return { ok: true, rows: parsed.length };
    },
    addScheduleEntry(payload) {
      const db = repository.get();
      const current = db.scheduleEntries.find((entry) =>
        entry.coordinationId === payload.coordinationId &&
        entry.careerId === payload.careerId &&
        entry.shiftId === payload.shiftId &&
        entry.year === payload.year &&
        entry.day === payload.day &&
        entry.block === payload.block
      );

      if (current) {
        db.scheduleEntries = db.scheduleEntries.filter((entry) => entry.id !== current.id);
      }

      db.scheduleEntries.push({ id: createId("entry"), ...payload });
      repository.save(db);

      return { replaced: Boolean(current), previous: current };
    },
    resetSchedules() {
      const db = repository.get();
      db.scheduleEntries = [];
      repository.save(db);
    },
    autoGenerate({ coordinationId, careerId, shiftId, periodId }) {
      const db = repository.get();
      const shift = db.shifts.find((item) => item.id === shiftId);
      if (!shift) return { ok: false, error: "Turno inválido." };
      const period = db.periods.find((item) => item.id === periodId && item.shiftId === shiftId);
      const periodStart = period ? toMinuteMark(period.startTime) : toMinuteMark(shift.startTime);
      const periodEnd = period ? toMinuteMark(period.endTime) : toMinuteMark(shift.startTime) + shift.blocks * shift.minutesPerBlock;

      const startBlock = Math.floor((periodStart - toMinuteMark(shift.startTime)) / shift.minutesPerBlock) + 1;
      const endBlock = Math.floor((periodEnd - toMinuteMark(shift.startTime)) / shift.minutesPerBlock);

      const classes = db.classCatalog.filter((item) => item.coordinationId === coordinationId && item.careerId === careerId);
      if (classes.length === 0) return { ok: false, error: "No hay clases cargadas por CSV para esta carrera." };

      let inserted = 0;
      const days = shift.days;

      classes.forEach((item) => {
        const blocksNeeded = Math.max(1, Math.ceil(item.credits / shift.creditsPerBlock));
        let pending = blocksNeeded;

        for (const day of days) {
          for (let block = startBlock; block <= endBlock; block += 1) {
            if (pending === 0) break;
            const occupied = db.scheduleEntries.some((entry) =>
              entry.coordinationId === coordinationId &&
              entry.careerId === careerId &&
              entry.shiftId === shiftId &&
              entry.year === item.year &&
              entry.day === day &&
              entry.block === block
            );
            if (occupied) continue;
            db.scheduleEntries.push({
              id: createId("entry"),
              coordinationId,
              careerId,
              shiftId,
              year: item.year,
              day,
              block,
              className: item.className,
              source: "auto",
            });
            inserted += 1;
            pending -= 1;
          }
          if (pending === 0) break;
        }
      });

      repository.save(db);
      return { ok: true, inserted };
    },
  };

  const state = { data: service.getAll() };

  const ui = {
    csvForm: document.querySelector("#csv-form"),
    csvError: document.querySelector("#csv-error"),
    csvList: document.querySelector("#csv-list"),
    manualClassForm: document.querySelector("#manual-class-form"),
    manualClassError: document.querySelector("#manual-class-error"),
    autoGenerateForm: document.querySelector("#auto-generate-form"),
    autoGenerateError: document.querySelector("#auto-generate-error"),
    activeSchedules: document.querySelector("#active-schedules"),
    viewSchedules: document.querySelector("#view-schedules"),
    resetScheduleBtn: document.querySelector("#reset-schedule"),

    activeCoordination: document.querySelector("#active-coordination"),
    activeCareer: document.querySelector("#active-career"),
    activeShift: document.querySelector("#active-shift"),
    viewCoordination: document.querySelector("#view-coordination"),
    viewCareer: document.querySelector("#view-career"),
    viewShift: document.querySelector("#view-shift"),
    manualClassDay: document.querySelector("#manual-class-day"),
    manualClassBlock: document.querySelector("#manual-class-block"),
    autoPeriod: document.querySelector("#auto-period"),

    coordinationForm: document.querySelector("#coordination-form"),
    careerForm: document.querySelector("#career-form"),
    categoryForm: document.querySelector("#category-form"),
    teacherForm: document.querySelector("#teacher-form"),
    shiftForm: document.querySelector("#shift-form"),
    periodForm: document.querySelector("#period-form"),
    periodError: document.querySelector("#period-error"),

    coordinationList: document.querySelector("#coordination-list"),
    careerList: document.querySelector("#career-list"),
    categoryList: document.querySelector("#category-list"),
    teacherList: document.querySelector("#teacher-list"),
    shiftList: document.querySelector("#shift-list"),
    periodList: document.querySelector("#period-list"),
    shiftError: document.querySelector("#shift-error"),

    careerCoordinationSelect: document.querySelector("#career-coordination"),
    periodShift: document.querySelector("#period-shift"),

    listItemTemplate: document.querySelector("#list-item-template"),
    tabs: [...document.querySelectorAll(".tab-button")],
    tabPanels: [...document.querySelectorAll(".tab-panel")],
  };

  const refresh = () => {
    state.data = service.getAll();
  };

  const renderSelect = (select, items, placeholder, selected = "") => {
    if (!select) return;
    select.innerHTML = "";
    select.append(new Option(placeholder, ""));
    items.forEach((item) => select.append(new Option(item.name, item.id)));
    if (selected) select.value = selected;
  };

  const renderList = (target, entries, formatter) => {
    target.innerHTML = "";
    entries.forEach((entry) => {
      const node = ui.listItemTemplate.content.firstElementChild.cloneNode(true);
      node.innerHTML = formatter(entry);
      target.append(node);
    });
  };

  const buildScheduleTables = (container, context) => {
    container.innerHTML = "";
    if (!context.coordinationId || !context.careerId || !context.shiftId) {
      container.innerHTML = '<p class="help-text">Selecciona coordinación, carrera y turno para visualizar horarios.</p>';
      return;
    }

    const { shifts, scheduleEntries } = state.data;
    const shift = shifts.find((item) => item.id === context.shiftId);
    if (!shift) return;

    YEARS.forEach((year) => {
      const wrapper = document.createElement("section");
      wrapper.className = "year-schedule";
      const title = document.createElement("h4");
      title.textContent = `${year}° año`;
      wrapper.append(title);

      const table = document.createElement("table");
      table.className = "schedule-table";
      const thead = document.createElement("thead");
      const hrow = document.createElement("tr");
      hrow.append(Object.assign(document.createElement("th"), { textContent: "Bloque" }));
      shift.days.forEach((day) => hrow.append(Object.assign(document.createElement("th"), { textContent: day })));
      thead.append(hrow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      for (let block = 1; block <= shift.blocks; block += 1) {
        const row = document.createElement("tr");
        row.append(Object.assign(document.createElement("th"), { textContent: String(block) }));
        shift.days.forEach((day) => {
          const cell = document.createElement("td");
          const match = scheduleEntries.find((entry) =>
            entry.coordinationId === context.coordinationId &&
            entry.careerId === context.careerId &&
            entry.shiftId === context.shiftId &&
            entry.year === year &&
            entry.day === day &&
            entry.block === block
          );
          cell.textContent = match?.className || "";
          row.append(cell);
        });
        tbody.append(row);
      }
      table.append(tbody);
      wrapper.append(table);
      container.append(wrapper);
    });
  };

  const render = () => {
    const { coordinations, careers, categories, teachers, shifts, periods, csvUploads, activeContext, viewContext } = state.data;

    renderList(ui.coordinationList, coordinations, (item) => item.name);
    renderList(ui.careerList, careers, (item) => `${item.name} · ${coordinations.find((c) => c.id === item.coordinationId)?.name ?? "Sin coordinación"}`);
    renderList(ui.categoryList, categories, (item) => item.name);
    renderList(ui.teacherList, teachers, (item) => item.name);
    renderList(ui.shiftList, shifts, (item) => `${item.name} · Días: ${item.days.join(", ")} · Prioridad: ${Object.entries(item.priorities).map(([k, v]) => `${k}:${v}`).join(", ")} · ${item.startTime}`);

    renderList(ui.csvList, csvUploads, (item) => `${item.fileName} · ${item.rows} clases · ${new Date(item.uploadedAt).toLocaleString("es-NI")}`);

    ui.periodList.innerHTML = "";
    periods.forEach((period) => {
      const shiftName = shifts.find((item) => item.id === period.shiftId)?.name ?? "Turno";
      const row = ui.listItemTemplate.content.firstElementChild.cloneNode(true);
      row.innerHTML = `${shiftName} · ${period.name} (${period.startTime}-${period.endTime}) <button type="button" data-period-id="${period.id}">Eliminar</button>`;
      ui.periodList.append(row);
    });

    renderSelect(ui.careerCoordinationSelect, coordinations, "Selecciona una coordinación");
    renderSelect(ui.activeCoordination, coordinations, "Selecciona coordinación", activeContext.coordinationId);
    renderSelect(ui.viewCoordination, coordinations, "Selecciona coordinación", viewContext.coordinationId || activeContext.coordinationId);
    renderSelect(ui.activeShift, shifts, "Selecciona turno", activeContext.shiftId);
    renderSelect(ui.viewShift, shifts, "Selecciona turno", viewContext.shiftId || activeContext.shiftId);
    renderSelect(ui.periodShift, shifts, "Selecciona turno");

    const activeCareers = careers.filter((item) => !activeContext.coordinationId || item.coordinationId === activeContext.coordinationId);
    const viewCoord = viewContext.coordinationId || activeContext.coordinationId;
    const viewCareers = careers.filter((item) => !viewCoord || item.coordinationId === viewCoord);
    renderSelect(ui.activeCareer, activeCareers, "Selecciona carrera", activeContext.careerId);
    renderSelect(ui.viewCareer, viewCareers, "Selecciona carrera", viewContext.careerId || activeContext.careerId);

    const selectedShift = shifts.find((item) => item.id === activeContext.shiftId);
    ui.manualClassDay.innerHTML = "";
    ui.manualClassBlock.innerHTML = "";
    if (selectedShift) {
      selectedShift.days.forEach((day) => ui.manualClassDay.append(new Option(day, day)));
      for (let block = 1; block <= selectedShift.blocks; block += 1) {
        ui.manualClassBlock.append(new Option(String(block), String(block)));
      }
      const relevantPeriods = periods.filter((item) => item.shiftId === selectedShift.id);
      ui.autoPeriod.innerHTML = "";
      ui.autoPeriod.append(new Option("Todo el turno", ""));
      relevantPeriods.forEach((period) => ui.autoPeriod.append(new Option(`${period.name} (${period.startTime}-${period.endTime})`, period.id)));
    }

    buildScheduleTables(ui.activeSchedules, activeContext);
    buildScheduleTables(ui.viewSchedules, {
      coordinationId: viewContext.coordinationId || activeContext.coordinationId,
      careerId: viewContext.careerId || activeContext.careerId,
      shiftId: viewContext.shiftId || activeContext.shiftId,
    });
  };

  const withRender = (handler) => (event) => {
    event.preventDefault();
    handler(event);
    refresh();
    render();
    event.target.reset();
  };

  ui.coordinationForm.addEventListener("submit", withRender((event) => {
    if (!event.target.name.value.trim()) return;
    service.createCoordination(event.target.name.value);
  }));

  ui.careerForm.addEventListener("submit", withRender((event) => {
    if (!event.target.name.value.trim() || !event.target.coordinationId.value) return;
    service.createCareer(event.target.name.value, event.target.coordinationId.value);
  }));
  ui.categoryForm.addEventListener("submit", withRender((event) => service.createCategory(event.target.name.value)));
  ui.teacherForm.addEventListener("submit", withRender((event) => service.createTeacher(event.target.name.value)));

  ui.shiftForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.shiftError.textContent = "";
    const form = event.target;

    const days = form.days.value.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (days.length === 0 || !form.name.value.trim()) {
      ui.shiftError.textContent = "Indica nombre y al menos un día habilitado.";
      return;
    }

    const prioritiesRaw = form.dayPriorities.value.trim() || "Lunes:1,Martes:2,Miércoles:3,Jueves:4,Viernes:5";
    const priorities = Object.fromEntries(
      prioritiesRaw.split(",").map((pair) => pair.split(":").map((x) => x.trim())).filter((pair) => pair[0] && pair[1]).map(([day, value]) => [day.toLowerCase(), Number(value) || 0])
    );

    const response = service.createShift({
      name: form.name.value.trim(),
      days,
      priorities,
      creditsPerBlock: Number(form.creditsPerBlock.value),
      minutesPerBlock: Number(form.minutesPerBlock.value),
      blocks: Number(form.blocks.value),
      startTime: form.startTime.value || "08:00",
    });

    if (!response.ok) {
      ui.shiftError.textContent = response.error;
      return;
    }
    refresh();
    render();
    form.reset();
    form.startTime.value = "08:00";
    form.days.value = "Lunes,Martes,Miércoles,Jueves,Viernes";
    form.dayPriorities.value = "Lunes:1,Martes:2,Miércoles:3,Jueves:4,Viernes:5";
  });

  ui.periodForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.periodError.textContent = "";
    const form = event.target;
    const response = service.createPeriod({
      shiftId: form.shiftId.value,
      name: form.name.value.trim(),
      startTime: form.startTime.value,
      endTime: form.endTime.value,
    });
    if (!response.ok) {
      ui.periodError.textContent = response.error;
      return;
    }
    refresh();
    render();
    form.reset();
  });

  ui.periodList.addEventListener("click", (event) => {
    const periodId = event.target.dataset.periodId;
    if (!periodId) return;
    service.deletePeriod(periodId);
    refresh();
    render();
  });

  ui.csvForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    ui.csvError.textContent = "";
    const file = event.target.classCsv.files?.[0];
    const context = state.data.activeContext;
    if (!context.careerId) {
      ui.csvError.textContent = "Selecciona una carrera en el contexto activo antes de cargar CSV.";
      return;
    }
    if (!file) return;
    const text = await file.text();
    const response = service.saveCsv(file.name, text, context);
    if (!response.ok) {
      ui.csvError.textContent = response.error;
      return;
    }
    refresh();
    render();
    event.target.reset();
  });

  ui.manualClassForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.manualClassError.textContent = "";
    const context = state.data.activeContext;
    if (!context.careerId) {
      ui.manualClassError.textContent = "Selecciona una carrera antes de agregar una clase manual.";
      return;
    }

    const payload = {
      coordinationId: context.coordinationId,
      careerId: context.careerId,
      shiftId: context.shiftId,
      year: Number(event.target.year.value),
      day: event.target.day.value,
      block: Number(event.target.block.value),
      className: event.target.className.value.trim(),
      source: "manual",
    };

    const result = service.addScheduleEntry(payload);
    if (result.replaced) {
      const careerName = state.data.careers.find((item) => item.id === context.careerId)?.name || "carrera";
      ui.manualClassError.textContent = `Advertencia: se reemplazó la clase existente en ese bloque para ${payload.year}° año de ${careerName}.`;
    }

    refresh();
    render();
    event.target.reset();
  });

  ui.autoGenerateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.autoGenerateError.textContent = "";
    const context = state.data.activeContext;
    if (!context.careerId || !context.shiftId || !context.coordinationId) {
      ui.autoGenerateError.textContent = "Selecciona coordinación, carrera y turno en el contexto activo.";
      return;
    }

    const response = service.autoGenerate({ ...context, periodId: event.target.periodId.value || "" });
    if (!response.ok) {
      ui.autoGenerateError.textContent = response.error;
      return;
    }
    ui.autoGenerateError.textContent = `Generación completada. Bloques asignados: ${response.inserted}.`;
    refresh();
    render();
  });

  ui.resetScheduleBtn.addEventListener("click", () => {
    service.resetSchedules();
    refresh();
    render();
  });

  const updateActiveContext = () => {
    service.updateContext("activeContext", {
      coordinationId: ui.activeCoordination.value,
      careerId: ui.activeCareer.value,
      shiftId: ui.activeShift.value,
    });
    refresh();
    render();
  };

  const updateViewContext = () => {
    service.updateContext("viewContext", {
      coordinationId: ui.viewCoordination.value,
      careerId: ui.viewCareer.value,
      shiftId: ui.viewShift.value,
    });
    refresh();
    render();
  };

  [ui.activeCoordination, ui.activeCareer, ui.activeShift].forEach((input) => input.addEventListener("change", updateActiveContext));
  [ui.viewCoordination, ui.viewCareer, ui.viewShift].forEach((input) => input.addEventListener("change", updateViewContext));

  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      ui.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.tab));
    });
  });

  refresh();
  render();
})();
