(() => {
  const STORAGE_KEY = "scheduler-db-v2";
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const EXPECTED_HEADERS = ["Carrera", "Materia", "Codigo", "Dia", "HoraInicio", "HoraFin", "Aula"];

  const defaultDB = {
    coordinations: [],
    careers: [],
    subjects: [],
    classes: [],
  };

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const parseTime = (t) => {
    const [h, m] = String(t || "").split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const repo = {
    read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? { ...structuredClone(defaultDB), ...JSON.parse(raw) } : structuredClone(defaultDB);
      } catch {
        return structuredClone(defaultDB);
      }
    },
    write(db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    },
  };

  let db = repo.read();

  const ui = {
    csvForm: document.querySelector("#csv-form"),
    csvFile: document.querySelector("#csv-file"),
    csvMessage: document.querySelector("#csv-message"),
    csvErrors: document.querySelector("#csv-errors"),

    coordinationForm: document.querySelector("#coordination-form"),
    coordinationList: document.querySelector("#coordination-list"),

    careerForm: document.querySelector("#career-form"),
    careerList: document.querySelector("#career-list"),
    careerCoordination: document.querySelector("#career-coordination"),

    subjectForm: document.querySelector("#subject-form"),
    subjectList: document.querySelector("#subject-list"),
    subjectCareer: document.querySelector("#subject-career"),

    classForm: document.querySelector("#class-form"),
    classList: document.querySelector("#class-list"),
    classCareer: document.querySelector("#class-career"),
    classMessage: document.querySelector("#class-message"),

    hierarchyView: document.querySelector("#hierarchy-view"),

    scheduleCareer: document.querySelector("#schedule-career"),
    scheduleContainer: document.querySelector("#schedule-container"),
    scheduleAlert: document.querySelector("#schedule-alert"),
  };

  const save = () => {
    repo.write(db);
    render();
  };

  const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

  const findConflict = (newClass, ignoreId = null) => {
    const ns = parseTime(newClass.HoraInicio);
    const ne = parseTime(newClass.HoraFin);
    return db.classes.find((c) => {
      if (ignoreId && c.id === ignoreId) return false;
      if (c.Carrera !== newClass.Carrera || c.Dia !== newClass.Dia) return false;
      return overlaps(ns, ne, parseTime(c.HoraInicio), parseTime(c.HoraFin));
    });
  };

  const validateClass = (item) => {
    if (!EXPECTED_HEADERS.every((k) => item[k])) return "Fila con columnas vacías.";
    if (!DAYS.includes(item.Dia)) return `Día inválido: ${item.Dia}.`;
    const start = parseTime(item.HoraInicio);
    const end = parseTime(item.HoraFin);
    if (start === null || end === null) return "Hora inválida (use HH:MM).";
    if (start >= end) return "HoraInicio debe ser menor que HoraFin.";
    return null;
  };

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { rows: [], errors: ["CSV vacío."] };

    const headers = lines[0].split(",").map((h) => h.trim());
    if (headers.join("|") !== EXPECTED_HEADERS.join("|")) {
      return {
        rows: [],
        errors: [`Encabezado inválido. Esperado: ${EXPECTED_HEADERS.join(",")}`],
      };
    }

    const errors = [];
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length !== EXPECTED_HEADERS.length) {
        errors.push(`Línea ${i + 1}: número de columnas inválido.`);
        continue;
      }
      const row = Object.fromEntries(EXPECTED_HEADERS.map((k, idx) => [k, cols[idx]]));
      const e = validateClass(row);
      if (e) {
        errors.push(`Línea ${i + 1}: ${e}`);
        continue;
      }
      rows.push(row);
    }

    return { rows, errors };
  };

  const setMessage = (el, msg, isError = false) => {
    el.textContent = msg;
    el.classList.toggle("error", isError);
  };

  const toOptions = (items, labelFn) => items.map((x) => `<option value="${x.id}">${labelFn(x)}</option>`).join("");

  const renderActions = (onEdit, onDelete) => {
    const wrap = document.createElement("div");
    wrap.className = "actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Editar";
    edit.addEventListener("click", onEdit);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "Eliminar";
    del.addEventListener("click", onDelete);
    wrap.append(edit, del);
    return wrap;
  };

  const renderLists = () => {
    ui.coordinationList.innerHTML = "";
    db.coordinations.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${c.name}</span>`;
      li.append(
        renderActions(
          () => {
            const name = prompt("Editar coordinación", c.name);
            if (!name?.trim()) return;
            c.name = name.trim();
            save();
          },
          () => {
            db.careers = db.careers.filter((r) => r.coordinationId !== c.id);
            db.subjects = db.subjects.filter((s) => db.careers.some((r) => r.id === s.careerId));
            db.coordinations = db.coordinations.filter((x) => x.id !== c.id);
            save();
          }
        )
      );
      ui.coordinationList.append(li);
    });

    ui.careerList.innerHTML = "";
    db.careers.forEach((c) => {
      const coord = db.coordinations.find((x) => x.id === c.coordinationId)?.name || "Sin coordinación";
      const li = document.createElement("li");
      li.innerHTML = `<span>${c.name} · ${coord}</span>`;
      li.append(
        renderActions(
          () => {
            const name = prompt("Editar carrera", c.name);
            if (!name?.trim()) return;
            const oldName = c.name;
            c.name = name.trim();
            db.classes = db.classes.map((cl) => (cl.Carrera === oldName ? { ...cl, Carrera: c.name } : cl));
            save();
          },
          () => {
            db.subjects = db.subjects.filter((s) => s.careerId !== c.id);
            db.classes = db.classes.filter((cl) => cl.Carrera !== c.name);
            db.careers = db.careers.filter((x) => x.id !== c.id);
            save();
          }
        )
      );
      ui.careerList.append(li);
    });

    ui.subjectList.innerHTML = "";
    db.subjects.forEach((s) => {
      const career = db.careers.find((x) => x.id === s.careerId)?.name || "Sin carrera";
      const li = document.createElement("li");
      li.innerHTML = `<span>${s.name} (${s.code}) · ${career}</span>`;
      li.append(
        renderActions(
          () => {
            const name = prompt("Editar materia", s.name);
            if (!name?.trim()) return;
            const code = prompt("Editar código", s.code);
            if (!code?.trim()) return;
            db.classes = db.classes.map((cl) =>
              cl.Carrera === career && cl.Codigo === s.code ? { ...cl, Materia: name.trim(), Codigo: code.trim() } : cl
            );
            s.name = name.trim();
            s.code = code.trim();
            save();
          },
          () => {
            db.classes = db.classes.filter((cl) => cl.Codigo !== s.code || cl.Carrera !== career);
            db.subjects = db.subjects.filter((x) => x.id !== s.id);
            save();
          }
        )
      );
      ui.subjectList.append(li);
    });

    ui.classList.innerHTML = "";
    db.classes.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${c.Carrera} · ${c.Materia} (${c.Codigo}) · ${c.Dia} ${c.HoraInicio}-${c.HoraFin} · Aula ${c.Aula}</span>`;
      li.append(
        renderActions(
          () => {
            const aula = prompt("Editar aula", c.Aula);
            if (!aula?.trim()) return;
            const editable = { ...c, Aula: aula.trim() };
            const conflict = findConflict(editable, c.id);
            if (conflict) {
              alert(`Conflicto con ${conflict.Materia} (${conflict.HoraInicio}-${conflict.HoraFin}).`);
              return;
            }
            c.Aula = aula.trim();
            save();
          },
          () => {
            db.classes = db.classes.filter((x) => x.id !== c.id);
            save();
          }
        )
      );
      ui.classList.append(li);
    });
  };

  const renderSelectors = () => {
    const coordOptions = db.coordinations.length
      ? `<option value="">Seleccione coordinación</option>${toOptions(db.coordinations, (x) => x.name)}`
      : '<option value="">Sin coordinaciones</option>';
    ui.careerCoordination.innerHTML = coordOptions;

    const careerOptions = db.careers.length
      ? `<option value="">Seleccione carrera</option>${toOptions(db.careers, (x) => x.name)}`
      : '<option value="">Sin carreras</option>';

    ui.subjectCareer.innerHTML = careerOptions;
    ui.classCareer.innerHTML = careerOptions;
    ui.scheduleCareer.innerHTML = careerOptions;
  };

  const renderHierarchy = () => {
    if (!db.coordinations.length) {
      ui.hierarchyView.innerHTML = '<p class="muted">Sin datos todavía.</p>';
      return;
    }

    const root = document.createElement("div");
    root.className = "tree";

    db.coordinations.forEach((coord) => {
      const cnode = document.createElement("ul");
      const citem = document.createElement("li");
      citem.textContent = `Coordinación: ${coord.name}`;
      const careerList = document.createElement("ul");

      db.careers
        .filter((ca) => ca.coordinationId === coord.id)
        .forEach((career) => {
          const careerItem = document.createElement("li");
          careerItem.textContent = `Carrera: ${career.name}`;
          const subjectList = document.createElement("ul");

          db.subjects
            .filter((s) => s.careerId === career.id)
            .forEach((s) => {
              const subjectItem = document.createElement("li");
              subjectItem.textContent = `Materia: ${s.name} (${s.code})`;
              const classList = document.createElement("ul");

              db.classes
                .filter((cl) => cl.Carrera === career.name && cl.Codigo === s.code)
                .forEach((cl) => {
                  const classItem = document.createElement("li");
                  classItem.textContent = `Clase: ${cl.Dia} ${cl.HoraInicio}-${cl.HoraFin} · Aula ${cl.Aula}`;
                  classList.append(classItem);
                });

              subjectItem.append(classList);
              subjectList.append(subjectItem);
            });

          careerItem.append(subjectList);
          careerList.append(careerItem);
        });

      citem.append(careerList);
      cnode.append(citem);
      root.append(cnode);
    });

    ui.hierarchyView.innerHTML = "";
    ui.hierarchyView.append(root);
  };

  const renderSchedule = () => {
    const careerName = ui.scheduleCareer.value;
    const classes = db.classes.filter((c) => c.Carrera === careerName);

    if (!careerName) {
      ui.scheduleContainer.innerHTML = '<p class="muted">Seleccione una carrera para ver el horario.</p>';
      ui.scheduleAlert.textContent = "";
      return;
    }

    if (!classes.length) {
      ui.scheduleContainer.innerHTML = '<p class="muted">No hay clases para esta carrera.</p>';
      ui.scheduleAlert.textContent = "";
      return;
    }

    const points = [...new Set(classes.flatMap((c) => [parseTime(c.HoraInicio), parseTime(c.HoraFin)]))].sort((a, b) => a - b);
    const ranges = points.slice(0, -1).map((p, idx) => [p, points[idx + 1]]);

    let conflictMsg = "";
    for (let i = 0; i < classes.length; i += 1) {
      for (let j = i + 1; j < classes.length; j += 1) {
        const a = classes[i];
        const b = classes[j];
        if (a.Dia === b.Dia && overlaps(parseTime(a.HoraInicio), parseTime(a.HoraFin), parseTime(b.HoraInicio), parseTime(b.HoraFin))) {
          conflictMsg = `Conflicto detectado: ${a.Materia} y ${b.Materia} el ${a.Dia}.`;
          break;
        }
      }
      if (conflictMsg) break;
    }

    setMessage(ui.scheduleAlert, conflictMsg, Boolean(conflictMsg));

    let html = '<table class="schedule"><thead><tr><th>Horario</th>';
    DAYS.forEach((d) => {
      html += `<th>${d}</th>`;
    });
    html += "</tr></thead><tbody>";

    ranges.forEach(([start, end]) => {
      html += `<tr><td class="time">${fmt(start)}-${fmt(end)}</td>`;
      DAYS.forEach((day) => {
        const found = classes.find((c) => c.Dia === day && parseTime(c.HoraInicio) <= start && parseTime(c.HoraFin) >= end);
        html += `<td>${found ? `<div class="class-cell"><strong>${found.Materia}</strong><small>Aula ${found.Aula}</small></div>` : ""}</td>`;
      });
      html += "</tr>";
    });

    html += "</tbody></table>";
    ui.scheduleContainer.innerHTML = html;
  };

  const render = () => {
    renderSelectors();
    renderLists();
    renderHierarchy();
    renderSchedule();
  };

  ui.coordinationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    db.coordinations.push({ id: createId("coord"), name });
    e.target.reset();
    save();
  });

  ui.careerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const coordinationId = e.target.coordinationId.value;
    if (!name || !coordinationId) return;
    db.careers.push({ id: createId("career"), name, coordinationId });
    e.target.reset();
    save();
  });

  ui.subjectForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const code = e.target.code.value.trim();
    const careerId = e.target.careerId.value;
    if (!name || !code || !careerId) return;
    db.subjects.push({ id: createId("subject"), name, code, careerId });
    e.target.reset();
    save();
  });

  ui.classForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const careerId = e.target.career.value;
    const career = db.careers.find((x) => x.id === careerId)?.name;
    const item = {
      id: createId("class"),
      Carrera: career || "",
      Materia: e.target.materia.value.trim(),
      Codigo: e.target.codigo.value.trim(),
      Dia: e.target.dia.value,
      HoraInicio: e.target.horaInicio.value,
      HoraFin: e.target.horaFin.value,
      Aula: e.target.aula.value.trim(),
    };

    const error = validateClass(item);
    if (error) {
      setMessage(ui.classMessage, error, true);
      return;
    }

    const conflict = findConflict(item);
    if (conflict) {
      setMessage(ui.classMessage, `Conflicto: ${conflict.Materia} ya ocupa ${conflict.Dia} ${conflict.HoraInicio}-${conflict.HoraFin}.`, true);
      return;
    }

    db.classes.push(item);
    setMessage(ui.classMessage, "Clase agregada correctamente.");
    e.target.reset();
    save();
  });

  ui.csvForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const file = ui.csvFile.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const { rows, errors } = parseCsv(text);

      const conflictErrors = [];
      const staged = [];

      rows.forEach((row, idx) => {
        const candidate = { ...row, id: createId(`csv-${idx}`) };
        const againstDb = findConflict(candidate);
        const againstBatch = staged.find((s) => s.Carrera === candidate.Carrera && s.Dia === candidate.Dia
          && overlaps(parseTime(s.HoraInicio), parseTime(s.HoraFin), parseTime(candidate.HoraInicio), parseTime(candidate.HoraFin)));

        if (againstDb || againstBatch) {
          conflictErrors.push(`Conflicto en CSV (${candidate.Carrera} ${candidate.Dia} ${candidate.HoraInicio}-${candidate.HoraFin}).`);
          return;
        }
        staged.push(candidate);
      });

      const allErrors = [...errors, ...conflictErrors];
      ui.csvErrors.innerHTML = "";

      if (allErrors.length) {
        allErrors.forEach((err) => {
          const li = document.createElement("li");
          li.textContent = err;
          ui.csvErrors.append(li);
        });
        setMessage(ui.csvMessage, "No se insertó el CSV por errores de formato/conflicto.", true);
        return;
      }

      db.classes.push(...staged);
      setMessage(ui.csvMessage, `CSV procesado correctamente. ${staged.length} clases insertadas.`);
      save();
      e.target.reset();
    };

    reader.onerror = () => setMessage(ui.csvMessage, "No se pudo leer el archivo CSV.", true);
    reader.readAsText(file, "utf-8");
  });

  ui.scheduleCareer.addEventListener("change", renderSchedule);

  render();
})();
