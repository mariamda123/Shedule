(() => {
  const STORAGE_KEY = "academic-management-db";
  const YEARS = [1, 2, 3, 4, 5];

  const defaultDB = {
    role: "Coordinador",
    coordinations: [],
    careers: [],
    categories: [],
    teachers: [],
    classrooms: [],
    shifts: [],
    periods: [],
    csvUploads: [],
    classCatalog: [],
    scheduleEntries: [],
    activeContext: { coordinationId: "", careerId: "", shiftId: "" },
    viewContext: { coordinationId: "", careerId: "", shiftId: "" },
  };

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ensureArray = (value) => (Array.isArray(value) ? value : []);
  const ensureContext = (value) => ({
    coordinationId: typeof value?.coordinationId === "string" ? value.coordinationId : "",
    careerId: typeof value?.careerId === "string" ? value.careerId : "",
    shiftId: typeof value?.shiftId === "string" ? value.shiftId : "",
  });
  const sanitizeDb = (value) => ({
    ...structuredClone(defaultDB),
    ...(value && typeof value === "object" ? value : {}),
    coordinations: ensureArray(value?.coordinations),
    careers: ensureArray(value?.careers),
    categories: ensureArray(value?.categories),
    teachers: ensureArray(value?.teachers),
    classrooms: ensureArray(value?.classrooms),
    shifts: ensureArray(value?.shifts),
    periods: ensureArray(value?.periods),
    csvUploads: ensureArray(value?.csvUploads),
    classCatalog: ensureArray(value?.classCatalog),
    scheduleEntries: ensureArray(value?.scheduleEntries),
    activeContext: ensureContext(value?.activeContext),
    viewContext: ensureContext(value?.viewContext),
  });
  const normalizeClassroomType = (value) => {
    const raw = (value || "").trim().toLowerCase();
    if (["laboratorio", "laboratorios"].includes(raw)) return "Laboratorios";
    if (["taller", "talleres"].includes(raw)) return "Talleres";
    return "Aula normal";
  };
  const parseAcademicYear = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return 1;

    const numeric = Number(raw.replace(/[^0-9]/g, ""));
    if (YEARS.includes(numeric)) return numeric;

    const romanMap = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
    const normalizedRoman = raw.replace(/[^ivx]/g, "");
    if (romanMap[normalizedRoman] && YEARS.includes(romanMap[normalizedRoman])) {
      return romanMap[normalizedRoman];
    }

    const keywordMap = {
      primer: 1,
      primero: 1,
      segundo: 2,
      tercer: 3,
      tercero: 3,
      cuarto: 4,
      quinto: 5,
    };
    const keyword = Object.keys(keywordMap).find((item) => raw.includes(item));
    if (keyword) return keywordMap[keyword];

    return 1;
  };
  const toMinuteMark = (value) => {
    if (!value) return null;
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const toHourLabel = (shift, block) => {
    const shiftStart = toMinuteMark(shift.startTime) ?? 480;
    const start = shiftStart + ((block - 1) * shift.minutesPerBlock);
    const end = start + shift.minutesPerBlock;
    const toText = (mins) => {
      const h = Math.floor(mins / 60).toString().padStart(2, "0");
      const m = (mins % 60).toString().padStart(2, "0");
      return `${h}:${m}`;
    };
    return `${toText(start)} - ${toText(end)}`;
  };

  const createDataSource = (key, seed) => ({
    read() {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(seed);
      try {
        return sanitizeDb(JSON.parse(raw));
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
    createClassroom(payload) {
      const db = repository.get();
      db.classrooms.push({ id: createId("classroom"), ...payload, type: normalizeClassroomType(payload.type) });
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

      const start = new Date(payload.startDate);
      const end = new Date(payload.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { ok: false, error: "Indica fechas válidas para el cuatrimestre." };
      }
      if (start >= end) return { ok: false, error: "La fecha final debe ser posterior a la fecha de inicio." };

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
      const aliases = {
        clase: ["clase", "clases"],
        "año": ["año", "ano"],
        "créditos": ["créditos", "creditos"],
        "categorías": ["categorías", "categorias", "categoría", "categoria"],
        compartido: ["compartido"],
        tipo: ["tipo"],
      };
      const idx = Object.fromEntries(
        Object.entries(aliases).map(([field, options]) => [
          field,
          headers.findIndex((header) => options.includes(header)),
        ])
      );
      const missing = Object.entries(idx)
        .filter(([, position]) => position < 0)
        .map(([field]) => field);
      if (missing.length > 0) return { ok: false, error: `Faltan columnas: ${missing.join(", ")}` };

      const parsed = lines.slice(1).map((row) => row.split(",")).map((cells) => {
        const year = parseAcademicYear(cells[idx["año"]]);
        return {
          id: createId("class"),
          className: (cells[idx.clase] || "").trim(),
          year,
          credits: Number(cells[idx["créditos"]] || 0) || 1,
          category: (cells[idx["categorías"]] || "").trim(),
          shared: (cells[idx.compartido] || "").trim(),
          classroomType: normalizeClassroomType(cells[idx.tipo]),
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
      if (periodId && !db.periods.find((item) => item.id === periodId && item.shiftId === shiftId)) {
        return { ok: false, error: "Cuatrimestre inválido para el turno seleccionado." };
      }

      const startBlock = 1;
      const endBlock = shift.blocks;

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
            const availableClassroom = db.classrooms.find((classroom) => classroom.type === item.classroomType) || db.classrooms[0];
            db.scheduleEntries.push({
              id: createId("entry"),
              coordinationId,
              careerId,
              shiftId,
              year: item.year,
              day,
              block,
              className: item.className,
              classroomId: availableClassroom?.id || "",
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
    resetScheduleBtn: document.querySelector("#reset-schedule"),
    exportSchedulePdfBtn: document.querySelector("#export-schedule-pdf"),
    exportPdfError: document.querySelector("#export-pdf-error"),

    activeCoordination: document.querySelector("#active-coordination"),
    activeCareer: document.querySelector("#active-career"),
    activeShift: document.querySelector("#active-shift"),
    manualClassDay: document.querySelector("#manual-class-day"),
    manualClassBlock: document.querySelector("#manual-class-block"),
    manualClassroom: document.querySelector("#manual-classroom"),
    autoPeriod: document.querySelector("#auto-period"),

    coordinationForm: document.querySelector("#coordination-form"),
    careerForm: document.querySelector("#career-form"),
    categoryForm: document.querySelector("#category-form"),
    teacherForm: document.querySelector("#teacher-form"),
    classroomForm: document.querySelector("#classroom-form"),
    shiftForm: document.querySelector("#shift-form"),
    periodForm: document.querySelector("#period-form"),
    periodError: document.querySelector("#period-error"),

    coordinationList: document.querySelector("#coordination-list"),
    careerList: document.querySelector("#career-list"),
    categoryList: document.querySelector("#category-list"),
    teacherList: document.querySelector("#teacher-list"),
    classroomList: document.querySelector("#classroom-list"),
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
      hrow.append(Object.assign(document.createElement("th"), { textContent: "Hora" }));
      shift.days.forEach((day) => hrow.append(Object.assign(document.createElement("th"), { textContent: day })));
      thead.append(hrow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      for (let block = 1; block <= shift.blocks; block += 1) {
        const row = document.createElement("tr");
        row.append(Object.assign(document.createElement("th"), { textContent: `Bloque ${block}` }));
        row.append(Object.assign(document.createElement("td"), { textContent: toHourLabel(shift, block) }));
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
          if (match) {
            const classroomName = state.data.classrooms.find((item) => item.id === match.classroomId)?.name ?? "Sin aula";
            const blockHour = toHourLabel(shift, block);
            cell.textContent = `${match.className} · ${year}° · ${classroomName} · ${blockHour}`;
          } else {
            cell.textContent = "";
          }
          row.append(cell);
        });
        tbody.append(row);
      }
      table.append(tbody);
      wrapper.append(table);
      container.append(wrapper);
    });
  };

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const createSchedulePdfDocument = (context) => {
    const { coordinations, careers, shifts, scheduleEntries } = state.data;
    const shift = shifts.find((item) => item.id === context.shiftId);
    if (!shift) return "";

    const coordinationName = coordinations.find((item) => item.id === context.coordinationId)?.name ?? "Sin coordinación";
    const careerName = careers.find((item) => item.id === context.careerId)?.name ?? "Sin carrera";

    const tables = YEARS.map((year) => {
      const headerCells = shift.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("");
      const rows = Array.from({ length: shift.blocks }, (_, index) => {
        const block = index + 1;
        const blockHour = toHourLabel(shift, block);
        const cells = shift.days.map((day) => {
          const match = scheduleEntries.find((entry) =>
            entry.coordinationId === context.coordinationId &&
            entry.careerId === context.careerId &&
            entry.shiftId === context.shiftId &&
            entry.year === year &&
            entry.day === day &&
            entry.block === block
          );
          if (!match) return "<td></td>";
          const classroomName = state.data.classrooms.find((item) => item.id === match.classroomId)?.name ?? "Sin aula";
          return `<td>${escapeHtml(`${match.className} · ${year}° · ${classroomName} · ${blockHour}`)}</td>`;
        }).join("");
        return `<tr><th>${escapeHtml(`Bloque ${block}`)}</th><td>${escapeHtml(blockHour)}</td>${cells}</tr>`;
      }).join("");

      return `
        <section class="year-section">
          <h2>${year}° año</h2>
          <table>
            <thead><tr><th>Bloque</th><th>Hora</th>${headerCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    }).join("");

    const now = new Date().toLocaleString("es-NI");
    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Horario ${escapeHtml(careerName)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            .meta { margin: 0 0 16px; color: #4b5563; }
            .year-section { margin-bottom: 20px; break-inside: avoid; }
            h2 { margin: 0 0 8px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; text-align: center; min-width: 90px; }
            @media print {
              @page { size: A4 landscape; margin: 12mm; }
            }
          </style>
        </head>
        <body>
          <h1>Horario académico</h1>
          <p class="meta"><strong>Coordinación:</strong> ${escapeHtml(coordinationName)} · <strong>Carrera:</strong> ${escapeHtml(careerName)} · <strong>Turno:</strong> ${escapeHtml(shift.name)} · <strong>Generado:</strong> ${escapeHtml(now)}</p>
          ${tables}
        </body>
      </html>
    `;
  };

  const render = () => {
    const { coordinations, careers, categories, teachers, classrooms, shifts, periods, csvUploads, activeContext } = state.data;

    renderList(ui.coordinationList, coordinations, (item) => item.name);
    renderList(ui.careerList, careers, (item) => `${item.name} · ${coordinations.find((c) => c.id === item.coordinationId)?.name ?? "Sin coordinación"}`);
    renderList(ui.categoryList, categories, (item) => item.name);
    renderList(ui.teacherList, teachers, (item) => item.name);
    renderList(ui.classroomList, classrooms, (item) => `${item.name} · ${item.location} · ${item.type}`);
    renderList(ui.shiftList, shifts, (item) => `${item.name} · Días: ${item.days.join(", ")} · Prioridad: ${Object.entries(item.priorities).map(([k, v]) => `${k}:${v}`).join(", ")} · Inicio: ${item.startTime || "08:00"} · Receso: ${(item.recessStart || "--:--")}-${(item.recessEnd || "--:--")} · Almuerzo: ${(item.lunchStart || "--:--")}-${(item.lunchEnd || "--:--")}`);

    renderList(ui.csvList, csvUploads, (item) => `${item.fileName} · ${item.rows} clases · ${new Date(item.uploadedAt).toLocaleString("es-NI")}`);

    ui.periodList.innerHTML = "";
    periods.forEach((period) => {
      const shiftName = shifts.find((item) => item.id === period.shiftId)?.name ?? "Turno";
      const row = ui.listItemTemplate.content.firstElementChild.cloneNode(true);
      row.innerHTML = `${shiftName} · ${period.name} (${period.startDate} a ${period.endDate}) <button type="button" data-period-id="${period.id}">Eliminar</button>`;
      ui.periodList.append(row);
    });

    renderSelect(ui.careerCoordinationSelect, coordinations, "Selecciona una coordinación");
    renderSelect(ui.activeCoordination, coordinations, "Selecciona coordinación", activeContext.coordinationId);
    renderSelect(ui.activeShift, shifts, "Selecciona turno", activeContext.shiftId);
    renderSelect(ui.periodShift, shifts, "Selecciona turno");

    const activeCareers = careers.filter((item) => !activeContext.coordinationId || item.coordinationId === activeContext.coordinationId);
    renderSelect(ui.activeCareer, activeCareers, "Selecciona carrera", activeContext.careerId);

    const selectedShift = shifts.find((item) => item.id === activeContext.shiftId);
    const selectedPeriodId = ui.autoPeriod.value;
    ui.manualClassDay.innerHTML = "";
    ui.manualClassBlock.innerHTML = "";
    ui.manualClassroom.innerHTML = "";
    ui.autoPeriod.innerHTML = "";
    ui.autoPeriod.append(new Option("Todo el cuatrimestre", ""));
    const periodsForSelectedShift = selectedShift
      ? periods.filter((item) => item.shiftId === selectedShift.id)
      : periods;
    const relevantPeriods = periodsForSelectedShift.length > 0 ? periodsForSelectedShift : periods;
    relevantPeriods.forEach((period) => ui.autoPeriod.append(new Option(`${period.name} (${period.startDate} a ${period.endDate})`, period.id)));
    if (selectedPeriodId && relevantPeriods.some((period) => period.id === selectedPeriodId)) {
      ui.autoPeriod.value = selectedPeriodId;
    }

    if (selectedShift) {
      selectedShift.days.forEach((day) => ui.manualClassDay.append(new Option(day, day)));
      for (let block = 1; block <= selectedShift.blocks; block += 1) {
        ui.manualClassBlock.append(new Option(toHourLabel(selectedShift, block), String(block)));
      }
    }
    classrooms.forEach((classroom) => ui.manualClassroom.append(new Option(`${classroom.name} (${classroom.location})`, classroom.id)));

    buildScheduleTables(ui.activeSchedules, activeContext);
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
  ui.classroomForm.addEventListener("submit", withRender((event) => {
    service.createClassroom({
      name: event.target.name.value.trim(),
      location: event.target.location.value.trim(),
      type: event.target.type.value,
    });
  }));

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

    const recessStart = toMinuteMark(form.recessStart.value);
    const recessEnd = toMinuteMark(form.recessEnd.value);
    const lunchStart = toMinuteMark(form.lunchStart.value);
    const lunchEnd = toMinuteMark(form.lunchEnd.value);
    if (!(recessStart < recessEnd && lunchStart < lunchEnd)) {
      ui.shiftError.textContent = "Verifica los rangos de receso y almuerzo.";
      return;
    }

    const response = service.createShift({
      name: form.name.value.trim(),
      days,
      priorities,
      creditsPerBlock: Number(form.creditsPerBlock.value),
      minutesPerBlock: Number(form.minutesPerBlock.value),
      blocks: Number(form.blocks.value),
      startTime: form.startTime.value || "08:00",
      recessStart: form.recessStart.value,
      recessEnd: form.recessEnd.value,
      lunchStart: form.lunchStart.value,
      lunchEnd: form.lunchEnd.value,
    });

    if (!response.ok) {
      ui.shiftError.textContent = response.error;
      return;
    }
    refresh();
    render();
    form.reset();
    form.startTime.value = "08:00";
    form.recessStart.value = "10:00";
    form.recessEnd.value = "10:20";
    form.lunchStart.value = "12:00";
    form.lunchEnd.value = "13:00";
    form.days.value = "Lunes,Martes,Miércoles,Jueves,Viernes";
    form.dayPriorities.value = "Lunes:1,Martes:2,Miércoles:3,Jueves:4,Viernes:5";
  });

  ui.periodForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.periodError.textContent = "";
    const form = event.target;
    const formData = new FormData(form);
    const shiftId = String(formData.get("shiftId") || "");
    const periodName = String(formData.get("name") || "").trim();
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");

    if (!shiftId || !periodName) {
      ui.periodError.textContent = "Selecciona turno e indica el nombre del cuatrimestre.";
      return;
    }

    const response = service.createPeriod({
      shiftId,
      name: periodName,
      startDate,
      endDate,
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
      classroomId: event.target.classroomId.value,
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

  ui.exportSchedulePdfBtn.addEventListener("click", () => {
    ui.exportPdfError.textContent = "";
    const context = state.data.activeContext;
    if (!context.coordinationId || !context.careerId || !context.shiftId) {
      ui.exportPdfError.textContent = "Selecciona coordinación, carrera y turno para exportar el horario en PDF.";
      return;
    }

    const printableDocument = createSchedulePdfDocument(context);
    if (!printableDocument) {
      ui.exportPdfError.textContent = "No fue posible generar la vista para exportar. Verifica el turno activo.";
      return;
    }

    const exportWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!exportWindow) {
      ui.exportPdfError.textContent = "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.";
      return;
    }

    exportWindow.document.open();
    exportWindow.document.write(printableDocument);
    exportWindow.document.close();
    exportWindow.focus();
    exportWindow.print();
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

  [ui.activeCoordination, ui.activeCareer, ui.activeShift].forEach((input) => input.addEventListener("change", updateActiveContext));

  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      ui.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.tab));
    });
  });

  refresh();
  render();
})();
