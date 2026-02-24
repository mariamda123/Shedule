(() => {
  const STORAGE_KEY = "academic-management-db";

  const defaultDB = {
    role: "Coordinador",
    coordinations: [],
    careers: [],
    categories: [],
    teachers: [],
    subjects: [],
  };

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const storageGateway = {
    read() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultDB);
      try {
        return { ...structuredClone(defaultDB), ...JSON.parse(raw) };
      } catch {
        return structuredClone(defaultDB);
      }
    },
    write(data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
  };

  const dbRepository = {
    getDB: () => storageGateway.read(),
    saveDB: (db) => storageGateway.write(db),
    insert(collection, entity) {
      const db = this.getDB();
      db[collection].push(entity);
      this.saveDB(db);
      return entity;
    },
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
    createSubject(payload) {
      return dbRepository.insert("subjects", {
        id: createId("subject"),
        ...payload,
      });
    },
    getAll() {
      return dbRepository.getDB();
    },
  };

  const state = {
    data: academicService.getAll(),
  };

  const ui = {
    coordinationForm: document.querySelector("#coordination-form"),
    careerForm: document.querySelector("#career-form"),
    categoryForm: document.querySelector("#category-form"),
    teacherForm: document.querySelector("#teacher-form"),
    subjectForm: document.querySelector("#subject-form"),

    coordinationList: document.querySelector("#coordination-list"),
    careerList: document.querySelector("#career-list"),
    categoryList: document.querySelector("#category-list"),
    teacherList: document.querySelector("#teacher-list"),
    subjectList: document.querySelector("#subject-list"),

    careerCoordinationSelect: document.querySelector("#career-coordination"),
    subjectCareerSelect: document.querySelector("#subject-career"),
    subjectCategorySelect: document.querySelector("#subject-category"),
    subjectTeachersSelect: document.querySelector("#subject-teachers"),

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

  const renderMultiSelectOptions = (select, items) => {
    select.innerHTML = "";
    items.forEach((item) => {
      select.append(new Option(item.name, item.id));
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
    const { coordinations, careers, categories, teachers, subjects } = state.data;

    renderList(ui.coordinationList, coordinations, (item) => item.name);
    renderList(ui.careerList, careers, (item) => {
      const coordination = coordinations.find((coord) => coord.id === item.coordinationId);
      return `${item.name} · ${coordination?.name ?? "Sin coordinación"}`;
    });
    renderList(ui.categoryList, categories, (item) => item.name);
    renderList(ui.teacherList, teachers, (item) => item.name);
    renderList(ui.subjectList, subjects, (item) => {
      const career = careers.find((row) => row.id === item.careerId);
      const category = categories.find((row) => row.id === item.categoryId);
      const teacherNames = item.teacherIds
        .map((id) => teachers.find((teacher) => teacher.id === id)?.name)
        .filter(Boolean)
        .join(", ");

      return `${item.name} (${item.code}) · ${item.credits} créditos · ${category?.name ?? "Sin categoría"} · ${career?.name ?? "Sin carrera"} · Maestros: ${teacherNames || "N/A"}`;
    });

    renderSelectOptions(ui.careerCoordinationSelect, coordinations, "Selecciona una coordinación");
    renderSelectOptions(ui.subjectCareerSelect, careers, "Selecciona una carrera");
    renderSelectOptions(ui.subjectCategorySelect, categories, "Selecciona una categoría");
    renderMultiSelectOptions(ui.subjectTeachersSelect, teachers);
  };

  const withRender = (handler) => (event) => {
    event.preventDefault();
    handler(event);
    refreshState();
    render();
    event.target.reset();
  };

  ui.coordinationForm.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createCoordination(name);
    })
  );

  ui.careerForm.addEventListener(
    "submit",
    withRender((event) => {
      const { name, coordinationId } = event.target;
      if (!name.value.trim() || !coordinationId.value) return;
      academicService.createCareer(name.value, coordinationId.value);
    })
  );

  ui.categoryForm.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createCategory(name);
    })
  );

  ui.teacherForm.addEventListener(
    "submit",
    withRender((event) => {
      const name = event.target.name.value;
      if (!name.trim()) return;
      academicService.createTeacher(name);
    })
  );

  ui.subjectForm.addEventListener(
    "submit",
    withRender((event) => {
      const form = event.target;
      const selectedTeacherIds = [...form.teacherIds.selectedOptions].map((opt) => opt.value);

      if (
        !form.name.value.trim() ||
        !form.code.value.trim() ||
        !form.credits.value ||
        !form.careerId.value ||
        !form.categoryId.value ||
        selectedTeacherIds.length === 0
      ) {
        return;
      }

      academicService.createSubject({
        name: form.name.value.trim(),
        code: form.code.value.trim().toUpperCase(),
        credits: Number(form.credits.value),
        careerId: form.careerId.value,
        categoryId: form.categoryId.value,
        teacherIds: selectedTeacherIds,
      });
    })
  );

  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      ui.tabs.forEach((tab) => tab.classList.remove("active"));
      ui.tabPanels.forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.tab}`)?.classList.add("active");
    });
  });

  render();
})();
