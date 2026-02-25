(() => {
  const STORAGE_KEY = "academic-management-db";

  const defaultDB = {
    role: "Coordinador",
    coordinations: [],
    careers: [],
    categories: [],
    teachers: [],
    shifts: [],
    csvUploads: [],
  };

  const weekDays = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const createLocalStorageDataSource = (key, seed) => ({
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

  const dataSource = createLocalStorageDataSource(STORAGE_KEY, defaultDB);

  const dbRepository = {
    getDB: () => dataSource.read(),
    saveDB: (db) => dataSource.write(db),
    insert(collection, entity) {
      const db = this.getDB();
      db[collection].push(entity);
      this.saveDB(db);
      return entity;
    },
  };

  const parseTimeToMinutes = (time) => {
    if (!time) return null;
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (totalMinutes) => {
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const isAlignedToBlocks = (minuteMark, shiftStart, blockMinutes) =>
    (minuteMark - shiftStart) % blockMinutes === 0;

  const validatePeriod = ({ label, start, end, shiftStart, shiftEnd, blockMinutes }) => {
    if (!start && !end) return { ok: true };
    if (!start || !end) return { ok: false, error: `Debe completar inicio y fin para ${label}.` };

    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    if (startMinutes >= endMinutes) {
      return { ok: false, error: `${label} debe tener una hora fin mayor a la hora inicio.` };
    }

    if (startMinutes < shiftStart || endMinutes > shiftEnd) {
      return { ok: false, error: `${label} debe estar dentro del rango total del turno.` };
    }

    if (!isAlignedToBlocks(startMinutes, shiftStart, blockMinutes) || !isAlignedToBlocks(endMinutes, shiftStart, blockMinutes)) {
      return { ok: false, error: `${label} debe iniciar y terminar en límites exactos de bloque.` };
    }

    return {
      ok: true,
      period: { start, end, startMinutes, endMinutes },
    };
  };

  const academicService = {
    createCoordination(name) {
      return dbRepository.insert("coordinations", { id: createId("coord"), name: name.trim() });
    },
    createCareer(name, coordinationId) {
      return dbRepository.insert("careers", {
        id: createId("career"),
        name: name.trim(),
        coordinationId,
      });
    },
    createCategory(name) {
      return dbRepository.insert("categories", { id: createId("category"), name: name.trim() });
    },
    createTeacher(name) {
      return dbRepository.insert("teachers", { id: createId("teacher"), name: name.trim() });
    },
    createCsvUpload(fileName) {
      return dbRepository.insert("csvUploads", {
        id: createId("csv"),
        fileName,
        uploadedAt: new Date().toISOString(),
      });
    },
    createShift(payload) {
      const blockMinutes = Number(payload.minutesPerBlock);
      const blockCount = Number(payload.blocks);
      const shiftStart = parseTimeToMinutes(payload.startTime);
      const shiftEnd = shiftStart + blockMinutes * blockCount;

      const recessValidation = validatePeriod({
        label: "Receso",
        start: payload.recessStart,
        end: payload.recessEnd,
        shiftStart,
        shiftEnd,
        blockMinutes,
      });
      if (!recessValidation.ok) return recessValidation;

      const lunchValidation = validatePeriod({
        label: "Almuerzo",
        start: payload.lunchStart,
        end: payload.lunchEnd,
        shiftStart,
        shiftEnd,
        blockMinutes,
      });
      if (!lunchValidation.ok) return lunchValidation;

      if (recessValidation.period && lunchValidation.period) {
        const overlap =
          recessValidation.period.startMinutes < lunchValidation.period.endMinutes &&
          lunchValidation.period.startMinutes < recessValidation.period.endMinutes;
        if (overlap) {
          return { ok: false, error: "Receso y almuerzo no pueden solaparse entre sí." };
        }
      }

      const shift = dbRepository.insert("shifts", {
        id: createId("shift"),
        ...payload,
        endTime: minutesToTime(shiftEnd),
      });

      return { ok: true, shift };
    },
    getAll() {
      return dbRepository.getDB();
    },
  };

  const state = {
    data: academicService.getAll(),
  };

  const ui = {
    csvForm: document.querySelector("#csv-form"),
    coordinationForm: document.querySelector("#coordination-form"),
    careerForm: document.querySelector("#career-form"),
    categoryForm: document.querySelector("#category-form"),
    teacherForm: document.querySelector("#teacher-form"),
    shiftForm: document.querySelector("#shift-form"),

    csvList: document.querySelector("#csv-list"),
    coordinationList: document.querySelector("#coordination-list"),
    careerList: document.querySelector("#career-list"),
    categoryList: document.querySelector("#category-list"),
    teacherList: document.querySelector("#teacher-list"),
    shiftList: document.querySelector("#shift-list"),
    shiftError: document.querySelector("#shift-error"),

    careerCoordinationSelect: document.querySelector("#career-coordination"),

    listItemTemplate: document.querySelector("#list-item-template"),
    tabs: [...document.querySelectorAll(".tab-button")],
    tabPanels: [...document.querySelectorAll(".tab-panel")],
  };

  const renderSelectOptions = (select, items, placeholder, valueKey = "id", labelKey = "name") => {
    select.innerHTML = "";
    const defaultOpt = new Option(placeholder, "");
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.append(defaultOpt);

    items.forEach((item) => {
      select.append(new Option(item[labelKey], item[valueKey]));
    });
  };

  const renderList = (listElement, entries, formatter) => {
    listElement.innerHTML = "";
    entries.forEach((entry) => {
      const node = ui.listItemTemplate.content.firstElementChild.cloneNode(true);
      node.textContent = formatter(entry);
      listElement.append(node);
    });
  };

  const refreshState = () => {
    state.data = academicService.getAll();
  };

  const render = () => {
    const { coordinations, careers, categories, teachers, shifts, csvUploads } = state.data;

    renderList(ui.csvList, csvUploads, (item) => `${item.fileName} · ${new Date(item.uploadedAt).toLocaleString("es-NI")}`);
    renderList(ui.coordinationList, coordinations, (item) => item.name);
    renderList(ui.careerList, careers, (item) => {
      const coordination = coordinations.find((coord) => coord.id === item.coordinationId);
      return `${item.name} · ${coordination?.name ?? "Sin coordinación"}`;
    });
    renderList(ui.categoryList, categories, (item) => item.name);
    renderList(ui.teacherList, teachers, (item) => item.name);

    renderList(ui.shiftList, shifts, (item) => {
      const dayLine = item.days
        .map((day) => `${day}(${item.priorities[day]})`)
        .join(", ");
      const breaks = item.recessStart && item.recessEnd ? ` · Receso ${item.recessStart}-${item.recessEnd}` : "";
      const lunch = item.lunchStart && item.lunchEnd ? ` · Almuerzo ${item.lunchStart}-${item.lunchEnd}` : "";

      return `${item.name} · ${dayLine} · ${item.blocks} bloques de ${item.minutesPerBlock} min (${item.creditsPerBlock} créditos por bloque) · ${item.startTime}-${item.endTime}${breaks}${lunch}`;
    });

    renderSelectOptions(ui.careerCoordinationSelect, coordinations, "Selecciona una coordinación");
  };


  const activateTab = (tabId) => {
    const targetPanel = ui.tabPanels.find((panel) => panel.id === tabId);
    const targetTab = ui.tabs.find((tab) => tab.dataset.tab === tabId);
    if (!targetPanel || !targetTab) return;

    ui.tabs.forEach((tab) => {
      const isActive = tab === targetTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    ui.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel === targetPanel);
    });
  };

  const withRender = (handler) => (event) => {
    event.preventDefault();
    handler(event);
    refreshState();
    render();
    event.target.reset();
  };

  ui.csvForm?.addEventListener(
    "submit",
    withRender((event) => {
      const file = event.target.classCsv.files?.[0];
      if (!file) return;
      academicService.createCsvUpload(file.name);
    })
  );

  ui.coordinationForm?.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createCoordination(name);
    })
  );

  ui.careerForm?.addEventListener(
    "submit",
    withRender((event) => {
      const { name, coordinationId } = event.target;
      if (!name.value.trim() || !coordinationId.value) return;
      academicService.createCareer(name.value, coordinationId.value);
    })
  );

  ui.categoryForm?.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createCategory(name);
    })
  );

  ui.teacherForm?.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createTeacher(name);
    })
  );

  ui.shiftForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    ui.shiftError.textContent = "";

    const days = [...form.querySelectorAll('input[name="days"]:checked')].map((checkbox) => checkbox.value);
    if (!form.name.value.trim() || days.length === 0) {
      ui.shiftError.textContent = "Debe indicar un nombre de turno y seleccionar al menos un día.";
      return;
    }

    const priorities = days.reduce((acc, day) => {
      const value = Number(form[`priority-${day}`].value || 0);
      acc[day] = value;
      return acc;
    }, {});

    const hasPriority = Object.values(priorities).some((value) => value > 0);
    if (!hasPriority) {
      ui.shiftError.textContent = "Asigne prioridad mayor a 0 al menos en uno de los días seleccionados.";
      return;
    }

    const minutesPerBlock = Number(form.minutesPerBlock.value);
    const creditsPerBlock = Number(form.creditsPerBlock.value);
    const blocks = Number(form.blocks.value);

    if (minutesPerBlock < 15 || creditsPerBlock < 1 || blocks < 1 || !form.startTime.value) {
      ui.shiftError.textContent = "Completa correctamente créditos, minutos, bloques y hora de inicio.";
      return;
    }

    const response = academicService.createShift({
      name: form.name.value.trim(),
      days,
      priorities,
      creditsPerBlock,
      minutesPerBlock,
      blocks,
      startTime: form.startTime.value,
      recessStart: form.recessStart.value,
      recessEnd: form.recessEnd.value,
      lunchStart: form.lunchStart.value,
      lunchEnd: form.lunchEnd.value,
    });

    if (!response.ok) {
      ui.shiftError.textContent = response.error;
      return;
    }

    refreshState();
    render();
    form.reset();
  });

  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
      history.replaceState(null, "", `#${button.dataset.tab}`);
    });
  });

  const initialTab = location.hash.replace("#", "");
  if (initialTab) activateTab(initialTab);

  render();
})();
