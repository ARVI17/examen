"use strict";

(() => {
  const TOKEN_KEY = "saber11_admin_token";
  const VIEW_META = {
    dashboard: ["Inicio", "Resumen operativo y desempeño académico."],
    schools: ["Colegios", "Gestión de instituciones activas."],
    groups: ["Salones", "Grupos por colegio y año académico."],
    students: ["Estudiantes", "Registro, carga masiva y edición de estudiantes."],
    exams: ["Pruebas", "Creación y publicación de simulacros."],
    simulator: ["Simulador", "Ejecución rápida de intentos y control de jornadas."],
    results: ["Resultados", "Ranking, promedios y desempeño por salón."],
    analysis: ["Análisis", "Fortalezas, debilidades y recomendaciones."],
    reports: ["Reportes", "Cobertura documental y banco de preguntas."],
    settings: ["Configuración", "Usuarios, conexión y datos técnicos."]
  };

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    apiBase: `${window.location.origin}/api`,
    activeView: "dashboard",
    schools: [],
    groups: [],
    students: [],
    users: [],
    exams: [],
    charts: {},
    editingStudentId: null,
    editingSchoolId: null,
    simulator: {
      attemptId: null,
      questionDeck: [],
      currentIndex: 0,
      answersByQuestionId: {}
    }
  };

  const $ = (id) => document.getElementById(id);
  const moneyDash = (value) => (value === undefined || value === null || value === "" ? "-" : value);
  const pretty = (value) => JSON.stringify(value ?? {}, null, 2);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const cleanObject = (input) => {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "string" && value.trim().length === 0) return;
      output[key] = value;
    });
    return output;
  };

  const toQueryString = (params) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });
    const text = query.toString();
    return text ? `?${text}` : "";
  };

  const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text ?? "";
  };

  const setStatus = (id, message, tone = "") => {
    const element = $(id);
    if (!element) return;
    element.textContent = message;
    element.className = "status-message";
    if (tone) element.classList.add(tone);
  };

  const showToast = (message) => {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };

  const setButtonLoading = (buttonId, loading, label = "Procesando...") => {
    const button = $(buttonId);
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.innerHTML;
    button.disabled = loading;
    button.innerHTML = loading
      ? `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`
      : button.dataset.defaultLabel;
  };

  const apiRequest = async (path, options = {}) => {
    const { method = "GET", body, auth = true, responseType = "json" } = options;
    const headers = new Headers();
    let payloadBody = body;

    if (auth) {
      if (!state.token) throw new Error("No hay sesión activa.");
      headers.set("Authorization", `Bearer ${state.token}`);
    }
    if (body && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
      payloadBody = JSON.stringify(body);
    }

    const response = await fetch(`${state.apiBase}${path}`, { method, headers, body: payloadBody });
    if (!response.ok) {
      const text = await response.text();
      let message = `Error HTTP ${response.status}`;
      let code = "HTTP_ERROR";
      let details = null;
      try {
        const payload = JSON.parse(text);
        message = payload?.message || payload?.error?.message || message;
        code = payload?.error?.code || code;
        details = payload?.error?.details ?? null;
      } catch {
        message = text || message;
      }
      const error = new Error(message);
      error.code = code;
      error.details = details;
      error.status = response.status;
      throw error;
    }

    if (responseType === "blob") return response.blob();
    return response.json();
  };

  const downloadWithAuth = async (path, fallbackName) => {
    const blob = await apiRequest(path, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const performanceClass = (value) => {
    const numeric = Number(value || 0);
    if (numeric >= 80) return "high";
    if (numeric >= 60) return "medium";
    if (numeric >= 40) return "low";
    return "critical";
  };

  const renderBadge = (value, label) => {
    const cls = performanceClass(value);
    return `<span class="badge-soft ${cls}">${escapeHtml(label ?? value ?? "-")}</span>`;
  };

  const chartColors = ["#2563eb", "#0f766e", "#7c3aed", "#d97706", "#dc2626", "#475569"];

  const renderChart = (id, config) => {
    if (!window.Chart) return;
    const canvas = $(id);
    if (!canvas) return;
    if (state.charts[id]) state.charts[id].destroy();
    state.charts[id] = new Chart(canvas, {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { boxWidth: 10, usePointStyle: true } },
          tooltip: { enabled: true }
        },
        scales: config.type === "doughnut" ? undefined : { y: { beginAtZero: true, max: 100 } },
        ...(config.options || {})
      }
    });
  };

  const setAuthenticatedUi = (authenticated) => {
    $("loginView").classList.toggle("is-hidden", authenticated);
    $("appShell").classList.toggle("is-hidden", !authenticated);
    setText(
      "sessionText",
      authenticated && state.user ? `${state.user.name || state.user.email} · ${state.user.role || ""}` : "Sin sesión"
    );
  };

  const setupPasswordToggle = (inputId, buttonId) => {
    const input = $(inputId);
    const button = $(buttonId);
    if (!input || !button) return;
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.innerHTML = `<i class="bi ${show ? "bi-eye-slash" : "bi-eye"}"></i>`;
      button.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  };

  const setView = (view) => {
    state.activeView = view;
    document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
    $(`view-${view}`)?.classList.add("active");
    document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
    const [title, subtitle] = VIEW_META[view] || VIEW_META.dashboard;
    setText("viewTitle", title);
    setText("viewSubtitle", subtitle);
    $("sidebar")?.classList.remove("open");
  };

  const fillSelect = (id, items, { placeholder = "Todos", value = "id", label = "name" } = {}) => {
    const select = $(id);
    if (!select) return;
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item[value] || "";
      option.textContent = typeof label === "function" ? label(item) : item[label] || "";
      select.appendChild(option);
    });
  };

  const loadConnectionInfo = async () => {
    try {
      const response = await fetch("/connection-info");
      const payload = await response.json();
      const data = payload.data || {};
      $("connectionOut").textContent = pretty(payload);
      state.apiBase = `${window.location.origin}/api`;
      $("docsLink").href = data.docsUrl || "/api/docs";
      $("simLink").href = data.preferredSimulatorWebUrl || data.simulatorWebUrl || "/simulador";
      setText("apiText", data.apiBaseUrl || state.apiBase);
      setText("adminText", data.preferredAdminWebUrl || data.adminWebUrl || `${window.location.origin}/admin`);
      setText("lanText", (data.sharedLanUrls || data.lanUrls || []).join(" | ") || "Sin URL LAN detectada");
    } catch (error) {
      $("connectionOut").textContent = pretty({ error: error.message });
    }
  };

  const login = async () => {
    try {
      setButtonLoading("loginBtn", true, "Validando...");
      const email = $("loginEmail").value.trim();
      const password = $("loginPassword").value;
      if (!email || !password) throw new Error("Ingresa correo y contraseña.");
      const response = await apiRequest("/auth/login", { method: "POST", auth: false, body: { email, password } });
      state.token = response.data?.token || "";
      state.user = response.data?.user || null;
      if (!state.token) throw new Error("La API no devolvió token.");
      localStorage.setItem(TOKEN_KEY, state.token);
      setStatus("loginStatus", "Sesión iniciada correctamente.", "ok");
      setAuthenticatedUi(true);
      await bootstrapData();
      showToast("Panel actualizado.");
    } catch (error) {
      const retryAfter = Number(error?.details?.retryAfterSeconds ?? 0);
      const safeMessage = (() => {
        if (error.code === "INVALID_CREDENTIALS" || error.code === "AUTH_FAILED") {
          return "Credenciales invalidas o cuenta sin permisos.";
        }
        if (error.code === "AUTH_TEMPORARILY_BLOCKED" && retryAfter > 0) {
          return `Cuenta bloqueada temporalmente. Reintenta en ${retryAfter}s.`;
        }
        if (error.code === "AUTH_RATE_LIMITED" || error.status === 429) {
          return "Demasiados intentos. Espera un momento e intenta de nuevo.";
        }
        return error.message;
      })();
      setStatus("loginStatus", safeMessage, "bad");
    } finally {
      setButtonLoading("loginBtn", false);
    }
  };

  const logout = () => {
    state.token = "";
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    setAuthenticatedUi(false);
    setStatus("loginStatus", "Sesión cerrada.", "warn");
  };

  const loadCurrentUser = async () => {
    if (!state.token) return false;
    try {
      const response = await apiRequest("/auth/me");
      state.user = response.data?.user || response.data || null;
      setAuthenticatedUi(true);
      return true;
    } catch {
      logout();
      return false;
    }
  };

  const renderStatCards = (items) => {
    $("dashKpis").innerHTML = items
      .map(
        (item) => `<article class="stat-card">
          <div class="stat-head"><span>${escapeHtml(item.title)}</span><i class="bi ${item.icon}"></i></div>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.hint)}</small>
        </article>`
      )
      .join("");
  };

  const renderBars = (id, rows) => {
    const container = $(id);
    if (!container) return;
    container.innerHTML = (rows || [])
      .map((row) => {
        const value = Math.max(0, Math.min(100, Number(row.percent || 0)));
        return `<div class="bar-row"><span>${escapeHtml(row.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><strong>${value.toFixed(1)}%</strong></div>`;
      })
      .join("");
  };

  const metricLabel = (row) => row.area || row.subject || row.materia || row.tema || "Materia";
  const metricPercent = (row) =>
    Number(row.porcentajeAcierto ?? row.percentage ?? row.porcentajeArea ?? row.averagePercentage ?? row.promedioPorcentaje ?? 0);

  const makeRecommendations = (byArea = [], average = 0) => {
    const sorted = [...byArea].sort((a, b) => metricPercent(b) - metricPercent(a));
    const best = sorted[0];
    const weak = sorted[sorted.length - 1];
    const messages = [];
    if (best) messages.push(["Fortaleza", `${metricLabel(best)} mantiene el mejor desempeño con ${metricPercent(best)}%.`, "bi-award"]);
    if (weak) messages.push(["Refuerzo", `${metricLabel(weak)} requiere seguimiento: ${metricPercent(weak)}% de acierto.`, "bi-exclamation-triangle"]);
    if (Number(average) < 60) {
      messages.push(["Riesgo académico", "El promedio general está por debajo de 60%. Prioriza planes por materia.", "bi-clipboard-pulse"]);
    } else {
      messages.push(["Tendencia", "El promedio general permite avanzar con seguimiento regular.", "bi-graph-up"]);
    }
    return messages;
  };

  const renderRecommendations = (id, messages) => {
    const container = $(id);
    if (!container) return;
    container.innerHTML = messages
      .map(
        ([title, text, icon]) => `<article class="recommendation-card"><i class="bi ${icon}"></i><div><strong>${escapeHtml(
          title
        )}</strong><span>${escapeHtml(text)}</span></div></article>`
      )
      .join("");
  };

  const loadDashboard = async () => {
    try {
      setButtonLoading("dashLoadBtn", true, "Actualizando...");
      const query = toQueryString({
        school_id: $("dashSchoolSelect").value,
        group_id: $("dashGroupSelect").value,
        grado: $("dashGrado").value.trim(),
        from: $("dashFrom").value ? `${$("dashFrom").value}T00:00:00.000Z` : "",
        to: $("dashTo").value ? `${$("dashTo").value}T23:59:59.999Z` : "",
        limit: 80
      });
      const response = await apiRequest(`/reports/dashboard/overview${query}`);
      const data = response.data || {};
      const byArea = data.percentageByArea || [];
      const sorted = [...byArea].sort((a, b) => b.porcentajeAcierto - a.porcentajeAcierto);
      const weak = sorted[sorted.length - 1];
      const best = sorted[0];
      const riskCount = (data.studentsWithLatestResults || []).filter(
        (item) => Number(item.ultimoResultado?.porcentajeTotal || 0) < 60
      ).length;

      renderStatCards([
        { title: "Estudiantes", value: data.totalStudents ?? 0, hint: "Registros activos", icon: "bi-people" },
        { title: "Pruebas", value: data.totalExams ?? 0, hint: "Simulacros y exámenes", icon: "bi-journal-check" },
        { title: "Intentos", value: data.totalAttempts ?? 0, hint: "Presentaciones registradas", icon: "bi-pencil-square" },
        { title: "Promedio", value: `${data.averageGlobalPercentage ?? 0}%`, hint: "Resultado general", icon: "bi-speedometer2" },
        { title: "Mejor materia", value: best?.area || "-", hint: `${best?.porcentajeAcierto ?? 0}% de acierto`, icon: "bi-arrow-up-circle" },
        { title: "Menor materia", value: weak?.area || "-", hint: `${weak?.porcentajeAcierto ?? 0}% de acierto`, icon: "bi-arrow-down-circle" },
        { title: "En riesgo", value: riskCount, hint: "Estudiantes bajo 60%", icon: "bi-exclamation-circle" },
        { title: "Calificadas", value: data.totalGradedAttempts ?? 0, hint: "Intentos cerrados", icon: "bi-check-circle" }
      ]);

      renderBars(
        "dashAreaBars",
        byArea.map((row) => ({ label: row.area, percent: row.porcentajeAcierto }))
      );
      renderRecommendations("dashRecommendations", makeRecommendations(byArea, data.averageGlobalPercentage));
      renderRecommendations("globalRecommendations", makeRecommendations(byArea, data.averageGlobalPercentage));

      $("dashRows").innerHTML = (data.studentsWithLatestResults || [])
        .map((item) => {
          const student = item.estudiante || {};
          const result = item.ultimoResultado || {};
          return `<tr><td>${escapeHtml(`${student.nombres || ""} ${student.apellidos || ""}`.trim())}</td><td>${escapeHtml(
            student.numeroIdentificacion || ""
          )}</td><td>${escapeHtml(result.prueba || "")}</td><td>${renderBadge(
            result.porcentajeTotal,
            `${moneyDash(result.porcentajeTotal)}%`
          )}</td><td>${escapeHtml(result.nivelDesempenoGlobal || "-")}</td></tr>`;
        })
        .join("");

      renderChart("subjectChart", {
        type: "bar",
        data: {
          labels: byArea.map((row) => row.area),
          datasets: [{ label: "% acierto", data: byArea.map((row) => row.porcentajeAcierto), backgroundColor: chartColors }]
        }
      });
      renderChart("summaryChart", {
        type: "doughnut",
        data: {
          labels: ["Calificadas", "Pendientes"],
          datasets: [
            {
              data: [data.totalGradedAttempts || 0, Math.max(0, (data.totalAttempts || 0) - (data.totalGradedAttempts || 0))],
              backgroundColor: ["#2563eb", "#cbd5e1"]
            }
          ]
        }
      });
    } catch (error) {
      showToast(error.message);
    } finally {
      setButtonLoading("dashLoadBtn", false);
    }
  };

  const listSchools = async () => {
    const response = await apiRequest("/schools?limit=200");
    state.schools = response.data?.items || [];
    fillSelect("dashSchoolSelect", state.schools, { placeholder: "Todos los colegios" });
    fillSelect("groupSchoolSelect", state.schools, { placeholder: "Selecciona colegio" });
    fillSelect("stSchoolSelect", state.schools, { placeholder: "Sin asignar" });
    $("schoolRows").innerHTML = state.schools
      .map(
        (school) => `<tr><td>${escapeHtml(school.name)}</td><td>${escapeHtml(school.code || "-")}</td><td>${renderBadge(
          school.isActive ? 80 : 20,
          school.isActive ? "Activo" : "Inactivo"
        )}</td><td><button class="ghost-button" data-school-edit="${school.id}">Editar</button></td></tr>`
      )
      .join("");
  };

  const saveSchool = async () => {
    try {
      const body = cleanObject({
        code: $("schoolCode").value.trim(),
        name: $("schoolName").value.trim(),
        description: $("schoolDescription").value.trim(),
        is_active: $("schoolActive").value === "true"
      });
      if (!body.name) throw new Error("El nombre del colegio es obligatorio.");
      const id = $("schoolEditingId").value;
      await apiRequest(id ? `/schools/${id}` : "/schools", { method: id ? "PATCH" : "POST", body });
      setStatus("schoolStatus", "Colegio guardado.", "ok");
      resetSchoolForm();
      await listSchools();
    } catch (error) {
      setStatus("schoolStatus", error.message, "bad");
    }
  };

  const resetSchoolForm = () => {
    ["schoolEditingId", "schoolCode", "schoolName", "schoolDescription"].forEach((id) => ($(id).value = ""));
    $("schoolActive").value = "true";
  };

  const listGroups = async (schoolId = $("groupSchoolSelect").value || $("dashSchoolSelect").value) => {
    if (!schoolId) {
      state.groups = [];
      fillSelect("dashGroupSelect", [], { placeholder: "Todos los salones" });
      fillSelect("stGroupSelect", [], { placeholder: "Sin asignar" });
      $("groupRows").innerHTML = "<tr><td colspan='4'>Selecciona un colegio.</td></tr>";
      return;
    }
    const response = await apiRequest(`/schools/${schoolId}/groups?limit=200`);
    state.groups = response.data?.items || [];
    fillSelect("dashGroupSelect", state.groups, { placeholder: "Todos los salones", label: (item) => `${item.name} · ${item.grade || "-"}` });
    fillSelect("stGroupSelect", state.groups, { placeholder: "Sin asignar", label: (item) => `${item.name} · ${item.grade || "-"}` });
    $("groupRows").innerHTML = state.groups
      .map(
        (group) => `<tr><td>${escapeHtml(group.name)}</td><td>${escapeHtml(group.grade || "-")}</td><td>${escapeHtml(
          group.academicYear || "-"
        )}</td><td>${renderBadge(group.isActive ? 80 : 20, group.isActive ? "Activo" : "Inactivo")}</td></tr>`
      )
      .join("");
  };

  const saveGroup = async () => {
    try {
      const schoolId = $("groupSchoolSelect").value;
      if (!schoolId) throw new Error("Selecciona un colegio.");
      const body = cleanObject({
        code: $("groupCode").value.trim(),
        name: $("groupName").value.trim(),
        grade: $("groupGrade").value.trim(),
        academic_year: Number($("groupYear").value || new Date().getFullYear()),
        is_active: true
      });
      await apiRequest(`/schools/${schoolId}/groups`, { method: "POST", body });
      setStatus("groupStatus", "Salón guardado.", "ok");
      ["groupCode", "groupName"].forEach((id) => ($(id).value = ""));
      await listGroups(schoolId);
    } catch (error) {
      setStatus("groupStatus", error.message, "bad");
    }
  };

  const collectStudentPayload = () =>
    cleanObject({
      nombres: $("stNombres").value.trim(),
      apellidos: $("stApellidos").value.trim(),
      tipo_identificacion: $("stTipo").value,
      numero_identificacion: $("stDocumento").value.trim(),
      grado: $("stGrado").value.trim(),
      grupo: $("stGrupo").value.trim(),
      institucion: $("stInstitucion").value.trim(),
      email: $("stEmail").value.trim(),
      school_id: $("stSchoolSelect").value,
      group_id: $("stGroupSelect").value
    });

  const resetStudentForm = () => {
    state.editingStudentId = null;
    ["stEditingId", "stNombres", "stApellidos", "stDocumento", "stGrupo", "stInstitucion", "stEmail"].forEach(
      (id) => ($(id).value = "")
    );
    $("stTipo").value = "TI";
    $("stGrado").value = "11";
    $("stDocumento").disabled = false;
    setText("stCreateBtn", "Guardar estudiante");
  };

  const saveStudent = async () => {
    try {
      const payload = collectStudentPayload();
      if (!payload.nombres || !payload.apellidos || !payload.grado) throw new Error("Nombres, apellidos y grado son obligatorios.");
      if (state.editingStudentId) {
        const { numero_identificacion, ...updatePayload } = payload;
        await apiRequest(`/students/${state.editingStudentId}`, { method: "PATCH", body: updatePayload });
      } else {
        await apiRequest("/students", { method: "POST", body: payload });
      }
      setStatus("stCreateStatus", "Estudiante guardado.", "ok");
      resetStudentForm();
      await listStudents();
    } catch (error) {
      setStatus("stCreateStatus", error.message, "bad");
    }
  };

  const listStudents = async () => {
    try {
      const query = toQueryString({
        grado: $("stFilterGrado").value.trim(),
        numero_identificacion: $("stFilterDoc").value.trim(),
        grupo: $("stFilterGrupo").value.trim(),
        institucion: $("stFilterInstitucion").value.trim(),
        limit: 150
      });
      const response = await apiRequest(`/students${query}`);
      state.students = response.data?.items || [];
      setStatus("stListStatus", `Total: ${response.data?.total ?? state.students.length}`, "ok");
      $("stListRows").innerHTML = state.students
        .map(
          (student) => `<tr><td>${escapeHtml(student.numeroIdentificacion)}</td><td>${escapeHtml(
            `${student.nombres} ${student.apellidos}`
          )}</td><td>${escapeHtml(student.grado || "-")}</td><td>${escapeHtml(student.grupo || "-")}</td><td>${escapeHtml(
            student.institucion || "-"
          )}</td><td><button class="ghost-button" data-st-edit="${student.id}">Editar</button><button class="ghost-button" data-st-delete="${student.id}">Eliminar</button></td></tr>`
        )
        .join("");
    } catch (error) {
      setStatus("stListStatus", error.message, "bad");
    }
  };

  const fillStudentForm = (student) => {
    state.editingStudentId = student.id;
    $("stEditingId").value = student.id;
    $("stNombres").value = student.nombres || "";
    $("stApellidos").value = student.apellidos || "";
    $("stTipo").value = student.tipoIdentificacion || "TI";
    $("stDocumento").value = student.numeroIdentificacion || "";
    $("stGrado").value = student.grado || "";
    $("stGrupo").value = student.grupo || "";
    $("stInstitucion").value = student.institucion || "";
    $("stEmail").value = student.email || "";
    $("stSchoolSelect").value = student.schoolId || "";
    $("stDocumento").disabled = true;
    setText("stCreateBtn", "Guardar cambios");
    setView("students");
  };

  const uploadStudentsCsv = async () => {
    try {
      const file = $("stFile").files?.[0];
      if (!file) throw new Error("Selecciona un archivo CSV.");
      const form = new FormData();
      form.append("file", file);
      const response = await apiRequest("/students/bulk", { method: "POST", body: form });
      $("stBulkOutput").textContent = pretty(response.data);
      setStatus("stBulkStatus", "Carga masiva procesada.", "ok");
      await listStudents();
    } catch (error) {
      setStatus("stBulkStatus", error.message, "bad");
    }
  };

  const listUsers = async () => {
    try {
      const response = await apiRequest("/users?limit=150");
      state.users = response.data?.items || [];
      const admins = state.users.filter((user) => user.role === "ADMIN").length;
      const docentes = state.users.filter((user) => user.role === "DOCENTE").length;
      setText("uSummary", `Usuarios: ${state.users.length} | Admin: ${admins} | Docente: ${docentes}`);
      $("uTableRows").innerHTML = state.users
        .map(
          (user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.role)}</td><td>${renderBadge(
            user.isActive ? 80 : 20,
            user.isActive ? "Activo" : "Inactivo"
          )}</td></tr>`
        )
        .join("");
      $("uOutput").textContent = pretty(response.data);
      setStatus("uStatus", "Usuarios actualizados.", "ok");
    } catch (error) {
      setStatus("uStatus", error.message, "bad");
    }
  };

  const createUser = async () => {
    try {
      const body = cleanObject({
        name: $("uNombre").value.trim(),
        email: $("uEmail").value.trim(),
        password: $("uPassword").value,
        role: $("uRol").value,
        is_active: $("uActivo").value === "true"
      });
      await apiRequest("/users", { method: "POST", body });
      setStatus("uStatus", "Usuario creado.", "ok");
      ["uNombre", "uEmail", "uPassword"].forEach((id) => ($(id).value = ""));
      await listUsers();
    } catch (error) {
      setStatus("uStatus", error.message, "bad");
    }
  };

  const uploadUsersCsv = async () => {
    try {
      const file = $("uBulkFile").files?.[0];
      if (!file) throw new Error("Selecciona un archivo CSV.");
      const form = new FormData();
      form.append("file", file);
      const response = await apiRequest("/users/bulk", { method: "POST", body: form });
      $("uOutput").textContent = pretty(response.data);
      setStatus("uStatus", "Carga masiva procesada.", "ok");
      await listUsers();
    } catch (error) {
      setStatus("uStatus", error.message, "bad");
    }
  };

  const createExam = async () => {
    try {
      const body = cleanObject({
        nombre: $("examName").value.trim(),
        descripcion: $("examDescription").value.trim(),
        tipo_prueba: $("examType").value,
        grado_objetivo: $("examGrade").value.trim(),
        estado: $("examStatus").value,
        tiempo_limite_minutos: Number($("examTime").value || 120),
        total_preguntas: Number($("examTotalQuestions").value || 0),
        puntaje_maximo: Number($("examMaxScore").value || 100)
      });
      await apiRequest("/exams", { method: "POST", body });
      setStatus("examStatusBox", "Prueba guardada.", "ok");
      ["examName", "examDescription"].forEach((id) => ($(id).value = ""));
      await listExams();
    } catch (error) {
      setStatus("examStatusBox", error.message, "bad");
    }
  };

  const listExams = async () => {
    try {
      const query = toQueryString({
        tipo_prueba: $("examFilterType").value.trim(),
        grado_objetivo: $("examFilterGrade").value.trim() || "11",
        limit: 200
      });
      const response = await apiRequest(`/exams${query}`);
      state.exams = response.data?.items || [];
      fillSelect("simExamSelect", state.exams, {
        placeholder: "Selecciona prueba",
        label: (item) => `${item.nombre} · ${item.tipoPrueba} · ${item.gradoObjetivo}`
      });
      $("examRows").innerHTML = state.exams
        .map(
          (exam) => `<tr><td>${escapeHtml(exam.nombre)}</td><td>${escapeHtml(exam.tipoPrueba)}</td><td>${escapeHtml(
            exam.gradoObjetivo
          )}</td><td>${escapeHtml(exam.totalPreguntas ?? 0)}</td><td>${renderBadge(
            exam.estado === "PUBLICADO" ? 80 : 45,
            exam.estado
          )}</td><td><button class="ghost-button" data-exam-publish="${exam.id}">Publicar</button></td></tr>`
        )
        .join("");
    } catch (error) {
      setStatus("examStatusBox", error.message, "bad");
    }
  };

  const publishExam = async (examId) => {
    await apiRequest(`/exams/${examId}`, { method: "PATCH", body: { estado: "PUBLICADO" } });
    await listExams();
  };

  const collectSimulatorStudent = () =>
    cleanObject({
      nombres: $("simNombres").value.trim(),
      apellidos: $("simApellidos").value.trim(),
      tipo_identificacion: $("simTipo").value,
      numero_identificacion: $("simDocumento").value.trim(),
      grado: $("simGrado").value.trim(),
      grupo: $("simGrupo").value.trim()
    });

  const applySimulatorAttemptData = (data) => {
    state.simulator.attemptId = data.attempt?.id || null;
    state.simulator.questionDeck = (data.questionDeck || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    state.simulator.currentIndex = 0;
    state.simulator.answersByQuestionId = {};
    $("simStrictAttemptId").value = state.simulator.attemptId || "";
    renderSimulatorQuestion();
  };

  const startSimulatorAttempt = async () => {
    try {
      const student = collectSimulatorStudent();
      if (!student.nombres || !student.apellidos || !student.numero_identificacion) throw new Error("Completa datos del estudiante.");
      const response = await apiRequest("/attempts/start", {
        method: "POST",
        body: { prueba_id: $("simExamSelect").value, estudiante: student }
      });
      applySimulatorAttemptData(response.data || {});
      setStatus("simStatus", `Intento iniciado: ${state.simulator.attemptId}`, "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const renderSimulatorQuestion = () => {
    const deck = state.simulator.questionDeck;
    if (!deck.length) {
      setText("simQuestionTitle", "Pregunta");
      setText("simQuestionBody", "Sin pregunta activa.");
      $("simOptions").innerHTML = "";
      $("simNav").innerHTML = "";
      return;
    }
    const current = deck[state.simulator.currentIndex];
    setText("simQuestionTitle", `Pregunta ${state.simulator.currentIndex + 1} de ${deck.length}`);
    $("simQuestionBody").innerHTML = `${current.contextoTextoBase ? `<strong>Contexto:</strong> ${escapeHtml(current.contextoTextoBase)}<br><br>` : ""}${escapeHtml(
      current.enunciado
    )}`;
    const selected = state.simulator.answersByQuestionId[current.questionId] || current.selectedOptionId;
    $("simOptions").innerHTML = (current.options || [])
      .map(
        (option) => `<label class="option-item ${option.id === selected ? "selected" : ""}" data-option-id="${option.id}">
          <input type="radio" name="simOption" ${option.id === selected ? "checked" : ""} />
          <span><strong>${escapeHtml(option.ordenPresentacion)}.</strong> ${escapeHtml(option.textoOpcion)}</span>
        </label>`
      )
      .join("");
    $("simNav").innerHTML = deck
      .map(
        (question, index) =>
          `<button class="${index === state.simulator.currentIndex ? "current" : ""}" data-sim-index="${index}">${index + 1}</button>`
      )
      .join("");
  };

  const saveCurrentAnswer = async () => {
    try {
      const question = state.simulator.questionDeck[state.simulator.currentIndex];
      const optionId = state.simulator.answersByQuestionId[question?.questionId];
      if (!state.simulator.attemptId || !question || !optionId) throw new Error("Selecciona una respuesta.");
      await apiRequest(`/attempts/${state.simulator.attemptId}/answer`, {
        method: "POST",
        body: { pregunta_id: question.questionId, opcion_id_seleccionada: optionId }
      });
      setStatus("simStatus", `Respuesta guardada: pregunta ${state.simulator.currentIndex + 1}`, "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const submitSimulatorAttempt = async () => {
    try {
      if (!state.simulator.attemptId) throw new Error("No hay intento activo.");
      const response = await apiRequest(`/attempts/${state.simulator.attemptId}/submit`, { method: "POST" });
      const data = response.data || {};
      $("simResultOutput").textContent = pretty(data);
      $("simKpis").innerHTML = [
        { title: "Correctas", value: data.correctas ?? 0, hint: "Respuestas correctas", icon: "bi-check-circle" },
        { title: "Incorrectas", value: data.incorrectas ?? 0, hint: "Respuestas incorrectas", icon: "bi-x-circle" },
        { title: "Porcentaje", value: `${data.porcentajeTotal ?? 0}%`, hint: data.nivelDesempenoGlobal || "Nivel", icon: "bi-speedometer2" },
        { title: "Puntaje", value: data.puntajeTotalObtenido ?? 0, hint: "Puntaje obtenido", icon: "bi-award" }
      ]
        .map(
          (item) => `<article class="stat-card"><div class="stat-head"><span>${item.title}</span><i class="bi ${item.icon}"></i></div><strong>${item.value}</strong><small>${item.hint}</small></article>`
        )
        .join("");
      renderBars("simAreaBars", (data.areaResults || []).map((row) => ({ label: row.area, percent: row.porcentajeArea })));
      state.simulator.attemptId = null;
      setStatus("simStatus", "Intento enviado y calificado.", "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const buildClassroomReportQuery = () =>
    toQueryString({
      grado: $("repClassGrado").value.trim(),
      grupo: $("repClassGrupo").value.trim(),
      institucion: $("repClassInstitucion").value.trim(),
      from: $("repClassFrom").value ? `${$("repClassFrom").value}T00:00:00.000Z` : "",
      to: $("repClassTo").value ? `${$("repClassTo").value}T23:59:59.999Z` : "",
      limit: 3000
    });

  const buildStudentReportQuery = () => toQueryString({ grado: $("repStudentGrado").value.trim() });

  const loadClassroomReport = async () => {
    try {
      const query = buildClassroomReportQuery();
      const response = await apiRequest(`/reports/classroom/summary${query}`);
      const data = response.data || {};
      $("repClassOutput").textContent = pretty(data);
      setStatus("repClassStatus", `Estudiantes con intentos: ${data.totals?.studentsWithAttempts ?? 0}`, "ok");
      $("classroomRows").innerHTML = (data.ranking || [])
        .map(
          (row) => `<tr><td>${escapeHtml(`${row.nombres} ${row.apellidos}`)}</td><td>${escapeHtml(row.numeroIdentificacion)}</td><td>${escapeHtml(
            row.grado || "-"
          )}</td><td>${escapeHtml(row.grupo || "-")}</td><td>${row.attempts}</td><td>${renderBadge(
            row.averagePercentage,
            `${row.averagePercentage}%`
          )}</td><td>${renderBadge(row.averagePercentage, performanceClass(row.averagePercentage).toUpperCase())}</td></tr>`
        )
        .join("");
      renderRecommendations("classroomSummaryCards", makeRecommendations(data.bySubject || [], data.totals?.averagePercentage).map((item) => item));
      renderChart("classroomChart", {
        type: "bar",
        data: {
          labels: (data.bySubject || []).map((row) => row.subject || row.area),
          datasets: [
            {
              label: "% acierto",
              data: (data.bySubject || []).map((row) => Number(row.percentage ?? row.porcentajeAcierto ?? 0)),
              backgroundColor: chartColors
            }
          ]
        }
      });
    } catch (error) {
      setStatus("repClassStatus", error.message, "bad");
    }
  };

  const loadStudentReport = async () => {
    try {
      const doc = $("repStudentDoc").value.trim();
      if (!doc) throw new Error("Ingresa el documento.");
      const query = buildStudentReportQuery();
      const response = await apiRequest(`/reports/student/${encodeURIComponent(doc)}/performance${query}`);
      const data = response.data || {};
      $("repStudentOutput").textContent = pretty(data);
      setStatus("repStudentStatus", `Riesgo: ${data.totals?.riskLevel || "N/A"}`, "ok");
      const bySubject = data.areas || data.bySubject || data.subjects || [];
      const average = data.totals?.averagePercentage ?? data.totals?.average ?? 0;
      renderRecommendations("studentAnalysisCards", makeRecommendations(bySubject, average));
    } catch (error) {
      setStatus("repStudentStatus", error.message, "bad");
    }
  };

  const loadQuestionReadiness = async () => {
    try {
      const query = toQueryString({ grado_objetivo: $("covGrade").value.trim(), target_per_area: $("covTarget").value.trim() });
      const response = await apiRequest(`/reports/questions/readiness${query}`);
      const rows = response.data?.byArea || [];
      $("covRows").innerHTML = rows
        .map(
          (row) => `<tr><td>${escapeHtml(row.area)}</td><td>${row.totalQuestions}</td><td>${row.target}</td><td>${row.deficit}</td><td>${renderBadge(
            row.coveragePercent,
            `${row.coveragePercent ?? 0}%`
          )}</td></tr>`
        )
        .join("");
      setStatus("covStatus", `Cobertura global: ${response.data?.totals?.overallCoveragePercent ?? 0}%`, "ok");
    } catch (error) {
      setStatus("covStatus", error.message, "bad");
    }
  };

  const loadMaterialCoverage = async () => {
    try {
      const response = await apiRequest("/reports/files/material-local/coverage");
      $("materialOutput").textContent = pretty(response.data);
      setStatus("materialStatus", `Assets: ${response.data?.totals?.totalAssets ?? 0}`, "ok");
    } catch (error) {
      setStatus("materialStatus", error.message, "bad");
    }
  };

  const findPendingStrictAttemptByStudent = async () => {
    try {
      const doc = $("simStrictStudentDoc").value.trim();
      if (!doc) throw new Error("Ingresa documento.");
      const response = await apiRequest(`/attempts/student/${encodeURIComponent(doc)}`);
      const items = response.data?.items || [];
      const candidate = items.find((item) => item.estado === "PENDIENTE" || item.estado === "INICIADA") || items[0];
      $("simStrictAttemptId").value = candidate?.id || "";
      setStatus("simStrictStatus", candidate ? `Intento seleccionado: ${candidate.id}` : "Sin intentos.", candidate ? "ok" : "warn");
    } catch (error) {
      setStatus("simStrictStatus", error.message, "bad");
    }
  };

  const attemptAction = async (kind) => {
    try {
      const id = $("simStrictAttemptId").value.trim();
      if (!id) throw new Error("Ingresa Attempt ID.");
      const path =
        kind === "enable" ? `/attempts/${id}/session2/enable` : kind === "stop" ? `/attempts/${id}/stop` : `/attempts/${id}/restart`;
      await apiRequest(path, { method: "POST", body: kind === "enable" ? undefined : { motivo: "Acción administrativa" } });
      setStatus("simStrictStatus", "Acción aplicada correctamente.", "ok");
    } catch (error) {
      setStatus("simStrictStatus", error.message, "bad");
    }
  };

  const bootstrapData = async () => {
    await loadConnectionInfo();
    await listSchools();
    await Promise.allSettled([listGroups(), listStudents(), listUsers(), listExams(), loadDashboard()]);
  };

  const bindEvents = () => {
    $("loginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void login();
    });
    $("logoutBtn").addEventListener("click", logout);
    $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    setupPasswordToggle("loginPassword", "loginTogglePassword");

    $("dashLoadBtn").addEventListener("click", loadDashboard);
    $("dashSchoolSelect").addEventListener("change", () => listGroups($("dashSchoolSelect").value));
    $("groupSchoolSelect").addEventListener("change", () => listGroups($("groupSchoolSelect").value));
    $("stSchoolSelect").addEventListener("change", () => listGroups($("stSchoolSelect").value));

    $("schoolForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveSchool();
    });
    $("schoolCancelBtn").addEventListener("click", resetSchoolForm);
    $("schoolLoadBtn").addEventListener("click", listSchools);
    $("schoolRows").addEventListener("click", (event) => {
      const id = event.target?.dataset?.schoolEdit;
      if (!id) return;
      const school = state.schools.find((item) => item.id === id);
      if (!school) return;
      $("schoolEditingId").value = school.id;
      $("schoolCode").value = school.code || "";
      $("schoolName").value = school.name || "";
      $("schoolDescription").value = school.description || "";
      $("schoolActive").value = school.isActive ? "true" : "false";
    });

    $("groupForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveGroup();
    });
    $("groupLoadBtn").addEventListener("click", () => listGroups($("groupSchoolSelect").value));

    $("studentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveStudent();
    });
    $("stCancelEditBtn").addEventListener("click", resetStudentForm);
    $("stListBtn").addEventListener("click", listStudents);
    $("stTemplateBtn").addEventListener("click", () => downloadWithAuth("/students/bulk/template.csv", "students_bulk_template.csv"));
    $("stBulkBtn").addEventListener("click", uploadStudentsCsv);
    $("stListRows").addEventListener("click", async (event) => {
      const editId = event.target?.dataset?.stEdit;
      const deleteId = event.target?.dataset?.stDelete;
      if (editId) fillStudentForm(state.students.find((item) => item.id === editId));
      if (deleteId && window.confirm("Eliminar lógicamente este estudiante?")) {
        await apiRequest(`/students/${deleteId}`, { method: "DELETE" });
        await listStudents();
      }
    });

    $("userForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void createUser();
    });
    $("uListBtn").addEventListener("click", listUsers);
    $("uTemplateBtn").addEventListener("click", () => downloadWithAuth("/users/bulk/template.csv", "users_bulk_template.csv"));
    $("uBulkBtn").addEventListener("click", uploadUsersCsv);

    $("examForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void createExam();
    });
    $("examLoadBtn").addEventListener("click", listExams);
    $("simLoadExamsBtn").addEventListener("click", listExams);
    $("examRows").addEventListener("click", async (event) => {
      const id = event.target?.dataset?.examPublish;
      if (id) await publishExam(id);
    });

    $("simStartBtn").addEventListener("click", startSimulatorAttempt);
    $("simPrevBtn").addEventListener("click", () => {
      state.simulator.currentIndex = Math.max(0, state.simulator.currentIndex - 1);
      renderSimulatorQuestion();
    });
    $("simNextBtn").addEventListener("click", () => {
      state.simulator.currentIndex = Math.min(state.simulator.questionDeck.length - 1, state.simulator.currentIndex + 1);
      renderSimulatorQuestion();
    });
    $("simNav").addEventListener("click", (event) => {
      const index = event.target?.dataset?.simIndex;
      if (index === undefined) return;
      state.simulator.currentIndex = Number(index);
      renderSimulatorQuestion();
    });
    $("simOptions").addEventListener("click", (event) => {
      const item = event.target.closest?.("[data-option-id]");
      if (!item) return;
      const question = state.simulator.questionDeck[state.simulator.currentIndex];
      state.simulator.answersByQuestionId[question.questionId] = item.dataset.optionId;
      renderSimulatorQuestion();
    });
    $("simSaveBtn").addEventListener("click", saveCurrentAnswer);
    $("simSubmitBtn").addEventListener("click", submitSimulatorAttempt);
    $("simFindStrictAttemptBtn").addEventListener("click", findPendingStrictAttemptByStudent);
    $("simEnableSession2Btn").addEventListener("click", () => attemptAction("enable"));
    $("simStopAttemptBtn").addEventListener("click", () => attemptAction("stop"));
    $("simRestartAttemptBtn").addEventListener("click", () => attemptAction("restart"));

    $("repClassBtn").addEventListener("click", loadClassroomReport);
    $("repClassCsvBtn").addEventListener("click", () =>
      downloadWithAuth(`/reports/classroom/summary/export.csv${buildClassroomReportQuery()}`, "classroom_summary.csv")
    );
    $("repClassPdfBtn").addEventListener("click", () =>
      downloadWithAuth(`/reports/classroom/summary/export.pdf${buildClassroomReportQuery()}`, "classroom_summary.pdf")
    );
    $("repStudentBtn").addEventListener("click", loadStudentReport);
    $("repStudentCsvBtn").addEventListener("click", () =>
      downloadWithAuth(
        `/reports/student/${encodeURIComponent($("repStudentDoc").value.trim())}/performance/export.csv${buildStudentReportQuery()}`,
        "student_performance.csv"
      )
    );
    $("repStudentPdfBtn").addEventListener("click", () =>
      downloadWithAuth(
        `/reports/student/${encodeURIComponent($("repStudentDoc").value.trim())}/performance/export.pdf${buildStudentReportQuery()}`,
        "student_performance.pdf"
      )
    );
    $("covLoadBtn").addEventListener("click", loadQuestionReadiness);
    $("materialLoadBtn").addEventListener("click", loadMaterialCoverage);
    $("filesCsvBtn").addEventListener("click", () => downloadWithAuth("/reports/files/coverage/export.csv", "files_coverage.csv"));
  };

  const init = async () => {
    bindEvents();
    $("groupYear").value = String(new Date().getFullYear());
    await loadConnectionInfo();
    const hasSession = await loadCurrentUser();
    if (hasSession) await bootstrapData();
    else setAuthenticatedUi(false);
  };

  init();
})();
