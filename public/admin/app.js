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
    system: ["Operacion del sistema", "Control seguro de LAN, backup y operaciones sensibles."],
    settings: ["Configuración", "Usuarios, conexión y datos técnicos."]
  };

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    apiBase: `${window.location.origin}/api`,
    activeView: "dashboard",
    schools: [],
    schoolDepartments: [],
    schoolMunicipalities: [],
    formCatalog: {
      student: { departments: [], municipalities: [], schools: [] },
      user: { departments: [], municipalities: [], schools: [] }
    },
    groups: [],
    students: [],
    users: [],
    exams: [],
    charts: {},
    dashboardData: null,
    classroomData: null,
    generatedQuestions: [],
    generatedQuestionsTotal: 0,
    system: {
      status: null,
      lan: null,
      health: null,
      dryRun: null,
      backup: null,
      checklist: [],
      operations: [],
      canApplyImport: false
    },
    editingStudentId: null,
    editingSchoolId: null,
    visibleRows: {
      dashboard: 15,
      students: 20,
      exams: 20,
      classroom: 20,
      ai: 20
    },
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

  const clearStaleOverlays = () => {
    document.body.classList.remove("modal-open", "overlay-open", "is-loading", "ui-locked", "no-scroll");
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("opacity");
    document.body.style.removeProperty("filter");
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("overflow");

    const staleNodes = document.querySelectorAll(
      ".modal-backdrop, .app-overlay, .overlay-backdrop, [data-ui-overlay], [data-backdrop], [data-global-lock='true']"
    );
    staleNodes.forEach((node) => {
      if (node.id === "toast") return;
      node.classList.add("is-hidden");
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("hidden", "hidden");
      node.style.removeProperty("opacity");
      node.style.removeProperty("filter");
      node.style.removeProperty("pointer-events");
      node.style.removeProperty("display");
    });
  };

  const resetGlobalUiLocks = () => {
    clearStaleOverlays();
    $("sidebar")?.classList.remove("open");
  };

  const syncCodeToggleLabel = (button, target) => {
    if (!button || !target) return;
    const hidden = target.classList.contains("is-collapsed");
    const showLabel = button.dataset.showLabel || "Ver detalle";
    const hideLabel = button.dataset.hideLabel || "Ocultar detalle";
    button.textContent = hidden ? showLabel : hideLabel;
  };

  const toggleCodeBox = (targetId, button) => {
    const target = $(targetId);
    if (!target) return;
    target.classList.toggle("is-collapsed");
    syncCodeToggleLabel(button, target);
  };

  const copyCodeBox = async (targetId) => {
    const target = $(targetId);
    if (!target) return;
    const text = target.textContent || "";
    await copyPlainText(text, "Detalle copiado");
  };

  const copyPlainText = async (text, successMessage = "Copiado") => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "true");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      showToast(successMessage);
    } catch {
      showToast("No fue posible copiar");
    }
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
    if (numeric >= 90) return "high";
    if (numeric >= 80) return "medium";
    if (numeric >= 60) return "low";
    return "critical";
  };

  const normalizeUpperText = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const renderBadge = (value, label) => {
    const cls = performanceClass(value);
    return `<span class="badge-soft ${cls}">${escapeHtml(label ?? value ?? "-")}</span>`;
  };

  const getAcademicLevel = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return { key: "SIN_NIVEL", label: "Sin nivel", score: 0 };
    if (numeric >= 90) return { key: "SUPERIOR", label: "Superior", score: numeric };
    if (numeric >= 80) return { key: "ALTO", label: "Alto", score: numeric };
    if (numeric >= 60) return { key: "BASICO", label: "Basico", score: numeric };
    return { key: "BAJO", label: "Bajo", score: numeric };
  };

  const mapRiskMessage = (levelKey) => {
    if (levelKey === "SUPERIOR") return "Desempeno sobresaliente";
    if (levelKey === "ALTO") return "Buen desempeno";
    if (levelKey === "BASICO") return "Requiere seguimiento";
    return "Requiere refuerzo";
  };

  const formatShortDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const normalizeSearch = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const chartColors = ["#2563eb", "#0f766e", "#7c3aed", "#d97706", "#dc2626", "#475569"];
  const TABLE_STEP = {
    dashboard: 15,
    students: 20,
    exams: 20,
    classroom: 20,
    ai: 20
  };
  const FORM_CATALOG_LIMIT = 200;

  const td = (label, value, extraClass = "") =>
    `<td data-label="${escapeHtml(label)}"${extraClass ? ` class="${extraClass}"` : ""}>${value}</td>`;

  const formatText = (value) => escapeHtml(value === undefined || value === null || value === "" ? "-" : value);

  const withVisibleRows = (key, rows) => {
    const limit = state.visibleRows[key] || TABLE_STEP[key] || 20;
    return rows.slice(0, limit);
  };

  const updateTableMeta = (metaId, buttonId, shown, total) => {
    const meta = $(metaId);
    const button = $(buttonId);
    if (meta) meta.textContent = `Mostrando ${shown} de ${total}`;
    if (button) {
      button.classList.toggle("is-hidden", shown >= total);
      button.disabled = shown >= total;
    }
  };

  const resetVisibleRows = (key) => {
    state.visibleRows[key] = TABLE_STEP[key] || 20;
  };

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
    resetGlobalUiLocks();
    $("loginView").classList.toggle("is-hidden", authenticated);
    $("appShell").classList.toggle("is-hidden", !authenticated);
    setText(
      "sessionText",
      authenticated && state.user ? `${state.user.name || state.user.email} · ${state.user.role || ""}` : "Sin sesión"
    );
  };

  const applyRoleUi = () => {
    const isAdmin = state.user?.role === "ADMIN";
    const settingsButton = document.querySelector('[data-view="settings"]');
    const systemButton = document.querySelector('[data-view="system"]');
    if (settingsButton) settingsButton.classList.toggle("is-hidden", !isAdmin);
    if (systemButton) systemButton.classList.toggle("is-hidden", !isAdmin);
    if (!isAdmin && (state.activeView === "settings" || state.activeView === "system")) {
      setView("dashboard");
    }
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
    resetGlobalUiLocks();
    state.activeView = view;
    document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
    $(`view-${view}`)?.classList.add("active");
    document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
    const [title, subtitle] = VIEW_META[view] || VIEW_META.dashboard;
    setText("viewTitle", title);
    setText("viewSubtitle", subtitle);
    $("sidebar")?.classList.remove("open");
    if (view === "system" && state.user?.role === "ADMIN") {
      void refreshSystemPanel();
    }
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

  const setSelectDisabled = (id, disabled) => {
    const select = $(id);
    if (!select) return;
    select.disabled = Boolean(disabled);
  };

  const setSelectPlaceholder = (id, placeholder, { disabled = false } = {}) => {
    const select = $(id);
    if (!select) return;
    fillSelect(id, [], { placeholder });
    setSelectDisabled(id, disabled);
  };

  const setFormCatalogStatus = (id, message, tone = "") => {
    if (!$(id)) return;
    setStatus(id, message, tone);
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
      applyRoleUi();
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
      applyRoleUi();
      return true;
    } catch {
      logout();
      return false;
    }
  };

  const renderStatCards = (items, targetId = "dashKpis") => {
    const target = $(targetId);
    if (!target) return;
    target.innerHTML = items
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

  const syncDashboardFilterOptions = (data) => {
    const selectedExam = $("dashExamSelect").value;
    const selectedSubject = $("dashSubjectSelect").value;
    fillSelect(
      "dashExamSelect",
      (state.exams || []).map((exam) => ({ id: exam.nombre, name: exam.nombre })),
      { placeholder: "Todas las pruebas" }
    );
    fillSelect(
      "dashSubjectSelect",
      (data?.percentageByArea || []).map((row) => ({ id: row.area, name: row.area })),
      { placeholder: "Todas las materias" }
    );
    if (selectedExam) $("dashExamSelect").value = selectedExam;
    if (selectedSubject) $("dashSubjectSelect").value = selectedSubject;
  };

  const formatSchoolLabel = (school) => school?.searchLabel || school?.name || school?.establecimiento || "Colegio";

  const renderDashboard = () => {
    const data = state.dashboardData || {};
    const selectedExam = $("dashExamSelect").value;
    const selectedLevel = $("dashLevelSelect").value;
    const selectedSubject = $("dashSubjectSelect").value;
    const studentSearch = normalizeSearch($("dashStudentSearch").value);

    const rows = (data.studentsWithLatestResults || [])
      .map((item) => {
        const student = item.estudiante || {};
        const result = item.ultimoResultado || {};
        const percentage = Number(result.porcentajeTotal || 0);
        const level = getAcademicLevel(percentage);
        return {
          studentName: `${student.nombres || ""} ${student.apellidos || ""}`.trim(),
          document: student.numeroIdentificacion || "",
          examName: result.prueba || "",
          percentage,
          level,
          finishedAt: result.fechaFin || ""
        };
      })
      .filter((row) => {
        if (selectedExam && row.examName !== selectedExam) return false;
        if (selectedLevel && row.level.key !== selectedLevel) return false;
        if (studentSearch) {
          const text = normalizeSearch(`${row.studentName} ${row.document}`);
          if (!text.includes(studentSearch)) return false;
        }
        return true;
      });

    const byAreaBase = data.percentageByArea || [];
    const byArea = selectedSubject ? byAreaBase.filter((row) => row.area === selectedSubject) : byAreaBase;
    const sorted = [...byArea].sort((a, b) => Number(b.porcentajeAcierto || 0) - Number(a.porcentajeAcierto || 0));
    const best = sorted[0];
    const weak = sorted[sorted.length - 1];
    const riskCount = rows.filter((row) => row.percentage < 60).length;

    renderStatCards([
      { title: "Colegios", value: state.schools.length, hint: "Disponibles en tu alcance", icon: "bi-buildings" },
      { title: "Salones", value: state.groups.length, hint: "Segun colegio seleccionado", icon: "bi-door-open" },
      { title: "Estudiantes", value: data.totalStudents ?? 0, hint: "Registros activos", icon: "bi-people" },
      { title: "Pruebas", value: data.totalExams ?? 0, hint: "Simulacros y examenes", icon: "bi-journal-check" },
      { title: "Intentos", value: data.totalAttempts ?? 0, hint: "Presentaciones registradas", icon: "bi-pencil-square" },
      { title: "Promedio", value: `${Number(data.averageGlobalPercentage ?? 0).toFixed(1)}%`, hint: "Resultado general", icon: "bi-speedometer2" },
      { title: "Materia fuerte", value: best?.area || "-", hint: `${Number(best?.porcentajeAcierto ?? 0).toFixed(1)}%`, icon: "bi-arrow-up-circle" },
      { title: "Materia debil", value: weak?.area || "-", hint: `${Number(weak?.porcentajeAcierto ?? 0).toFixed(1)}%`, icon: "bi-arrow-down-circle" },
      { title: "En riesgo", value: riskCount, hint: "Bajo 60% (vista filtrada)", icon: "bi-exclamation-circle" },
      { title: "Filtrados", value: rows.length, hint: "Resultados visibles", icon: "bi-funnel" }
    ]);

    renderBars(
      "dashAreaBars",
      byArea.map((row) => ({ label: row.area, percent: row.porcentajeAcierto }))
    );
    renderRecommendations("dashRecommendations", makeRecommendations(byArea, data.averageGlobalPercentage));
    renderRecommendations("globalRecommendations", makeRecommendations(byAreaBase, data.averageGlobalPercentage));

    const visibleRows = withVisibleRows("dashboard", rows);
    if (!rows.length) {
      $("dashRows").innerHTML = "<tr><td colspan='7'>No hay resultados para los filtros seleccionados.</td></tr>";
      setStatus("dashRowsStatus", "No hay resultados para los filtros seleccionados.", "warn");
      updateTableMeta("dashRowsMeta", "dashRowsMoreBtn", 0, 0);
    } else {
      $("dashRows").innerHTML = visibleRows
        .map(
          (row, index) =>
            `<tr>${td("#", index + 1)}${td("Estudiante", formatText(row.studentName))}${td("Documento", formatText(row.document))}${td(
              "Prueba",
              formatText(row.examName)
            )}${td("Porcentaje", renderBadge(row.percentage, `${row.percentage.toFixed(1)}%`))}${td(
              "Nivel",
              renderBadge(row.percentage, row.level.label)
            )}${td("Fecha", formatText(formatShortDate(row.finishedAt)))}</tr>`
        )
        .join("");
      setStatus("dashRowsStatus", `Resultados visibles: ${rows.length}`, "ok");
      updateTableMeta("dashRowsMeta", "dashRowsMoreBtn", visibleRows.length, rows.length);
    }

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

    const roleMessage =
      state.user?.role === "DOCENTE"
        ? "Vista docente: solo datos del alcance asignado."
        : "Vista admin: comparacion global por filtros.";
    setStatus("dashScopeHint", roleMessage, "ok");
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
        limit: 100
      });
      const response = await apiRequest(`/reports/dashboard/overview${query}`);
      const data = response.data || {};
      state.dashboardData = data;
      resetVisibleRows("dashboard");
      syncDashboardFilterOptions(data);
      renderDashboard();
    } catch (error) {
      showToast(error.message);
    } finally {
      setButtonLoading("dashLoadBtn", false);
    }
  };

  const loadSchoolDepartments = async (preferred = "") => {
    const response = await apiRequest("/schools/departments");
    const departments = response.data?.items || [];
    state.schoolDepartments = departments;
    const options = departments.map((departamento) => ({ id: departamento, name: departamento }));
    fillSelect("dashDepartmentSelect", options, { placeholder: "Todos los departamentos" });
    fillSelect("schoolFilterDepartment", options, { placeholder: "Todos los departamentos" });
    const selected = preferred || $("dashDepartmentSelect").value || $("schoolFilterDepartment").value;
    if (selected) {
      $("dashDepartmentSelect").value = selected;
      $("schoolFilterDepartment").value = selected;
    }
  };

  const loadSchoolMunicipalities = async (departamento, preferred = "") => {
    const normalizedDepartment = normalizeUpperText(departamento);
    if (!normalizedDepartment) {
      state.schoolMunicipalities = [];
      fillSelect("dashMunicipalitySelect", [], { placeholder: "Todos los municipios" });
      fillSelect("schoolFilterMunicipality", [], { placeholder: "Todos los municipios" });
      return;
    }
    const response = await apiRequest(`/schools/municipalities${toQueryString({ departamento: normalizedDepartment })}`);
    const municipalities = response.data?.items || [];
    state.schoolMunicipalities = municipalities;
    const options = municipalities.map((municipio) => ({ id: municipio, name: municipio }));
    fillSelect("dashMunicipalitySelect", options, { placeholder: "Todos los municipios" });
    fillSelect("schoolFilterMunicipality", options, { placeholder: "Todos los municipios" });
    if (preferred) {
      $("dashMunicipalitySelect").value = preferred;
      $("schoolFilterMunicipality").value = preferred;
    }
  };

  const getSelectedSchoolFilters = () => {
    const departamento = normalizeUpperText($("schoolFilterDepartment").value || $("dashDepartmentSelect").value);
    const municipio = normalizeUpperText($("schoolFilterMunicipality").value || $("dashMunicipalitySelect").value);
    const q = $("schoolFilterSearch").value.trim();
    return { departamento, municipio, q };
  };

  const applySchoolSelections = () => {
    const current = {
      dash: $("dashSchoolSelect").value,
      report: $("repClassSchoolSelect").value,
      group: $("groupSchoolSelect").value
    };
    fillSelect("dashSchoolSelect", state.schools, { placeholder: "Todos los colegios", label: formatSchoolLabel });
    fillSelect("repClassSchoolSelect", state.schools, { placeholder: "Todos los colegios", label: formatSchoolLabel });
    fillSelect("groupSchoolSelect", state.schools, { placeholder: "Selecciona colegio", label: formatSchoolLabel });
    if (current.dash) $("dashSchoolSelect").value = current.dash;
    if (current.report) $("repClassSchoolSelect").value = current.report;
    if (current.group) $("groupSchoolSelect").value = current.group;
  };

  const FORM_CATALOG_FIELDS = {
    student: {
      department: "stDepartmentSelect",
      municipality: "stMunicipalitySelect",
      school: "stSchoolSelect",
      search: "stSchoolSearch",
      status: "stSchoolCatalogStatus",
      schoolPlaceholder: "Seleccione un colegio"
    },
    user: {
      department: "uDepartmentSelect",
      municipality: "uMunicipalitySelect",
      school: "uScopeSchoolSelect",
      search: "uSchoolSearch",
      status: "uScopeStatus",
      schoolPlaceholder: "Seleccione un colegio para alcance docente"
    }
  };

  const updateFormScopeVisibility = () => {
    const role = $("uRol")?.value || "DOCENTE";
    const wrap = $("uScopeFields");
    if (!wrap) return;
    const showScope = role === "DOCENTE";
    wrap.classList.toggle("is-hidden", !showScope);
    if (!showScope) {
      setFormCatalogStatus("uScopeStatus", "El alcance por colegio no aplica para usuarios ADMIN.", "ok");
      setSelectPlaceholder("uDepartmentSelect", "No aplica para ADMIN", { disabled: true });
      setSelectPlaceholder("uMunicipalitySelect", "No aplica para ADMIN", { disabled: true });
      setSelectPlaceholder("uScopeSchoolSelect", "No aplica para ADMIN", { disabled: true });
      if ($("uSchoolSearch")) $("uSchoolSearch").value = "";
    } else {
      setFormCatalogStatus("uScopeStatus", "Seleccione departamento, municipio y colegio para DOCENTE.", "warn");
      setSelectDisabled("uDepartmentSelect", false);
      setSelectDisabled("uMunicipalitySelect", false);
      setSelectDisabled("uScopeSchoolSelect", false);
      if (!state.formCatalog.user.departments.length) {
        void loadFormCatalogDepartments("user");
      }
    }
  };

  const getFormCatalogSelection = (kind) => {
    const fields = FORM_CATALOG_FIELDS[kind];
    const departamento = normalizeUpperText($(fields.department)?.value || "");
    const municipio = normalizeUpperText($(fields.municipality)?.value || "");
    const q = $(fields.search)?.value?.trim() || "";
    return { departamento, municipio, q };
  };

  const renderFormSchools = (kind, preferred = "") => {
    const fields = FORM_CATALOG_FIELDS[kind];
    const schools = state.formCatalog[kind].schools || [];
    fillSelect(fields.school, schools, { placeholder: fields.schoolPlaceholder, label: formatSchoolLabel });
    setSelectDisabled(fields.school, schools.length === 0);
    if (preferred) {
      $(fields.school).value = preferred;
    }
  };

  const loadFormCatalogDepartments = async (kind, preferred = "") => {
    const fields = FORM_CATALOG_FIELDS[kind];
    try {
      setFormCatalogStatus(fields.status, "Cargando departamentos...", "warn");
      setSelectPlaceholder(fields.department, "Cargando departamentos...", { disabled: true });
      setSelectPlaceholder(fields.municipality, "Seleccione primero un departamento", { disabled: true });
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      const response = await apiRequest("/schools/departments");
      const departments = response.data?.items || [];
      state.formCatalog[kind].departments = departments;
      const options = departments.map((departamento) => ({ id: departamento, name: departamento }));
      fillSelect(fields.department, options, { placeholder: "Seleccione departamento" });
      setSelectDisabled(fields.department, departments.length === 0);
      if (preferred) $(fields.department).value = preferred;
      const tone = departments.length ? "ok" : "warn";
      setFormCatalogStatus(fields.status, departments.length ? "Departamentos cargados." : "No hay departamentos disponibles.", tone);
    } catch (error) {
      setSelectPlaceholder(fields.department, "No se pudo cargar departamentos", { disabled: true });
      setSelectPlaceholder(fields.municipality, "Seleccione primero un departamento", { disabled: true });
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      setFormCatalogStatus(fields.status, "No se pudo cargar departamentos.", "bad");
    }
  };

  const loadFormCatalogMunicipalities = async (kind, preferred = "") => {
    const fields = FORM_CATALOG_FIELDS[kind];
    const departamento = normalizeUpperText($(fields.department)?.value || "");
    if (!departamento) {
      state.formCatalog[kind].municipalities = [];
      state.formCatalog[kind].schools = [];
      setSelectPlaceholder(fields.municipality, "Seleccione primero un departamento", { disabled: true });
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      setFormCatalogStatus(fields.status, "Seleccione primero un departamento.", "warn");
      return;
    }

    try {
      setFormCatalogStatus(fields.status, "Cargando municipios...", "warn");
      setSelectPlaceholder(fields.municipality, "Cargando municipios...", { disabled: true });
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      const response = await apiRequest(`/schools/municipalities${toQueryString({ departamento })}`);
      const municipalities = response.data?.items || [];
      state.formCatalog[kind].municipalities = municipalities;
      const options = municipalities.map((municipio) => ({ id: municipio, name: municipio }));
      fillSelect(fields.municipality, options, { placeholder: "Seleccione municipio" });
      setSelectDisabled(fields.municipality, municipalities.length === 0);
      if (preferred) $(fields.municipality).value = preferred;
      setFormCatalogStatus(fields.status, municipalities.length ? "Municipios cargados." : "No hay municipios para el departamento.", municipalities.length ? "ok" : "warn");
    } catch {
      setSelectPlaceholder(fields.municipality, "No se pudo cargar municipios", { disabled: true });
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      setFormCatalogStatus(fields.status, "No se pudo cargar municipios.", "bad");
    }
  };

  const loadFormCatalogSchools = async (kind, preferred = "") => {
    const fields = FORM_CATALOG_FIELDS[kind];
    const { departamento, municipio, q } = getFormCatalogSelection(kind);
    if (!departamento) {
      setFormCatalogStatus(fields.status, "Debe seleccionar un departamento.", "warn");
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      return;
    }
    if (!municipio) {
      setFormCatalogStatus(fields.status, "Seleccione un municipio para cargar colegios.", "warn");
      setSelectPlaceholder(fields.school, fields.schoolPlaceholder, { disabled: true });
      return;
    }

    try {
      setFormCatalogStatus(fields.status, "Cargando colegios...", "warn");
      setSelectPlaceholder(fields.school, "Cargando colegios...", { disabled: true });
      const response = await apiRequest(
        `/schools${toQueryString({ departamento, municipio, q, limit: FORM_CATALOG_LIMIT })}`
      );
      const schools = response.data?.items || [];
      state.formCatalog[kind].schools = schools;
      renderFormSchools(kind, preferred);
      if (!schools.length) {
        setFormCatalogStatus(fields.status, "No hay colegios para los filtros seleccionados.", "warn");
        return;
      }
      const total = response.data?.total ?? schools.length;
      setFormCatalogStatus(fields.status, `Colegios cargados: ${schools.length} de ${total}.`, "ok");
    } catch {
      state.formCatalog[kind].schools = [];
      setSelectPlaceholder(fields.school, "No se pudo cargar colegios", { disabled: true });
      setFormCatalogStatus(fields.status, "No se pudo cargar colegios.", "bad");
    }
  };

  const listSchools = async () => {
    const filters = getSelectedSchoolFilters();
    const query = toQueryString({
      limit: 250,
      departamento: filters.departamento,
      municipio: filters.municipio,
      q: filters.q
    });
    const response = await apiRequest(`/schools${query}`);
    state.schools = response.data?.items || [];
    applySchoolSelections();

    if (state.user?.role === "DOCENTE" && state.schools.length === 1) {
      const schoolId = state.schools[0].id;
      $("dashSchoolSelect").value = schoolId;
      $("repClassSchoolSelect").value = schoolId;
      $("groupSchoolSelect").value = schoolId;
    }

    $("schoolRows").innerHTML = state.schools.length
      ? state.schools
          .map(
            (school) =>
              `<tr>${td("Departamento", escapeHtml(school.departamento || "-"))}${td(
                "Municipio",
                escapeHtml(school.municipio || "-")
              )}${td("Colegio", escapeHtml(school.establecimiento || school.name))}${td(
                "Sector",
                escapeHtml(school.sectorNormalizado || "-")
              )}${td("Código DANE", escapeHtml(school.codigoDane || "-"))}${td(
                "Estado",
                renderBadge(school.isActive ? 80 : 20, school.isActive ? "Activo" : "Inactivo")
              )}${td("Acciones", `<button class="ghost-button" data-school-edit="${school.id}">Editar</button>`)}</tr>`
          )
          .join("")
      : "<tr><td colspan='7'>No hay colegios para los filtros seleccionados.</td></tr>";

    const total = response.data?.total ?? state.schools.length;
    setStatus("schoolListStatus", `Mostrando ${state.schools.length} de ${total} colegios.`, state.schools.length ? "ok" : "warn");
  };

  const saveSchool = async () => {
    try {
      const body = cleanObject({
        code: $("schoolCode").value.trim(),
        name: $("schoolName").value.trim(),
        establecimiento: $("schoolEstablecimiento").value.trim(),
        sede: $("schoolSede").value.trim(),
        departamento: normalizeUpperText($("schoolDepartamento").value),
        municipio: normalizeUpperText($("schoolMunicipio").value),
        sector_normalizado: $("schoolSectorNormalizado").value,
        codigo_dane: $("schoolCodigoDane").value.trim(),
        direccion: $("schoolDireccion").value.trim(),
        description: $("schoolDescription").value.trim(),
        is_active: $("schoolActive").value === "true"
      });
      if (!body.name && body.establecimiento) {
        body.name = body.establecimiento;
      }
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
    [
      "schoolEditingId",
      "schoolCode",
      "schoolCodigoDane",
      "schoolName",
      "schoolEstablecimiento",
      "schoolSede",
      "schoolDepartamento",
      "schoolMunicipio",
      "schoolDireccion",
      "schoolDescription"
    ].forEach((id) => ($(id).value = ""));
    $("schoolSectorNormalizado").value = "";
    $("schoolActive").value = "true";
  };

  const listGroups = async (schoolId = $("groupSchoolSelect").value || $("dashSchoolSelect").value) => {
    if (!schoolId) {
      state.groups = [];
      fillSelect("dashGroupSelect", [], { placeholder: "Todos los salones" });
      fillSelect("repClassGroupSelect", [], { placeholder: "Todos los salones" });
      fillSelect("stGroupSelect", [], { placeholder: "Sin asignar" });
      setSelectDisabled("stGroupSelect", true);
      $("groupRows").innerHTML = "<tr><td colspan='4'>Selecciona un colegio.</td></tr>";
      return;
    }
    const response = await apiRequest(`/schools/${schoolId}/groups?limit=200`);
    state.groups = response.data?.items || [];
    const groupLabel = (item) => `${item.name} - ${item.grade || "-"}`;
    fillSelect("dashGroupSelect", state.groups, { placeholder: "Todos los salones", label: groupLabel });
    fillSelect("repClassGroupSelect", state.groups, { placeholder: "Todos los salones", label: groupLabel });
    fillSelect("stGroupSelect", state.groups, { placeholder: "Sin asignar", label: groupLabel });
    setSelectDisabled("stGroupSelect", state.groups.length === 0);
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
      departamento: normalizeUpperText($("stDepartmentSelect").value),
      municipio: normalizeUpperText($("stMunicipalitySelect").value),
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
    if ($("stDepartmentSelect")) $("stDepartmentSelect").value = "";
    if ($("stSchoolSearch")) $("stSchoolSearch").value = "";
    setSelectPlaceholder("stMunicipalitySelect", "Seleccione primero un departamento", { disabled: true });
    setSelectPlaceholder("stSchoolSelect", "Seleccione un colegio", { disabled: true });
    setSelectPlaceholder("stGroupSelect", "Sin asignar", { disabled: true });
    setText("stCreateBtn", "Guardar estudiante");
  };

  const saveStudent = async () => {
    try {
      const payload = collectStudentPayload();
      if (!payload.nombres || !payload.apellidos || !payload.grado) throw new Error("Nombres, apellidos y grado son obligatorios.");
      if (!payload.departamento) throw new Error("Debe seleccionar un departamento.");
      if (!payload.municipio) throw new Error("Debe seleccionar un municipio.");
      if (!payload.school_id) throw new Error("Debe seleccionar un colegio.");
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

  const renderStudentsTable = () => {
    const visibleStudents = withVisibleRows("students", state.students);
    if (!state.students.length) {
      $("stListRows").innerHTML = "<tr><td colspan='6'>No hay estudiantes para los filtros actuales.</td></tr>";
      updateTableMeta("stListMeta", "stListMoreBtn", 0, 0);
      return;
    }

    $("stListRows").innerHTML = visibleStudents
      .map(
        (student) => `<tr>${td("Documento", formatText(student.numeroIdentificacion))}${td(
          "Nombre",
          formatText(`${student.nombres} ${student.apellidos}`)
        )}${td("Grado", formatText(student.grado || "-"))}${td("Grupo", formatText(student.grupo || "-"))}${td(
          "Institucion",
          formatText(student.institucion || "-")
        )}${td(
          "Acciones",
          `<div class="actions"><button class="ghost-button" data-st-edit="${student.id}">Editar</button><button class="ghost-button" data-st-delete="${student.id}">Eliminar</button></div>`
        )}</tr>`
      )
      .join("");

    updateTableMeta("stListMeta", "stListMoreBtn", visibleStudents.length, state.students.length);
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
      resetVisibleRows("students");
      setStatus("stListStatus", `Total: ${response.data?.total ?? state.students.length}`, "ok");
      renderStudentsTable();
    } catch (error) {
      setStatus("stListStatus", error.message, "bad");
    }
  };

  const fillStudentForm = async (student) => {
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
    const departamento = normalizeUpperText(student.departamento || student.school?.departamento || "");
    const municipio = normalizeUpperText(student.municipio || student.school?.municipio || "");
    if (departamento) {
      if (!state.formCatalog.student.departments.length) {
        await loadFormCatalogDepartments("student", departamento);
      } else {
        $("stDepartmentSelect").value = departamento;
      }
      await loadFormCatalogMunicipalities("student", municipio);
      await loadFormCatalogSchools("student", student.schoolId || "");
    } else if (student.schoolId) {
      await loadFormCatalogSchools("student", student.schoolId);
    }
    await listGroups(student.schoolId || $("stSchoolSelect").value);
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
      const role = $("uRol").value;
      const scopeSchoolId = $("uScopeSchoolSelect")?.value || "";
      if (role === "DOCENTE" && !scopeSchoolId) {
        throw new Error("Debe seleccionar un colegio para el alcance del docente.");
      }

      const body = cleanObject({
        name: $("uNombre").value.trim(),
        email: $("uEmail").value.trim(),
        password: $("uPassword").value,
        role,
        is_active: $("uActivo").value === "true",
        scope_school_ids: role === "DOCENTE" && scopeSchoolId ? [scopeSchoolId] : undefined
      });
      await apiRequest("/users", { method: "POST", body });
      setStatus("uStatus", "Usuario creado.", "ok");
      ["uNombre", "uEmail", "uPassword", "uSchoolSearch"].forEach((id) => {
        if ($(id)) $(id).value = "";
      });
      $("uRol").value = "DOCENTE";
      await loadFormCatalogDepartments("user");
      setSelectPlaceholder("uMunicipalitySelect", "Seleccione primero un departamento", { disabled: true });
      setSelectPlaceholder("uScopeSchoolSelect", "Seleccione un colegio para alcance docente", { disabled: true });
      updateFormScopeVisibility();
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

  const renderExamsTable = () => {
    const visibleExams = withVisibleRows("exams", state.exams);
    if (!state.exams.length) {
      $("examRows").innerHTML = "<tr><td colspan='6'>No hay pruebas para los filtros actuales.</td></tr>";
      updateTableMeta("examRowsMeta", "examRowsMoreBtn", 0, 0);
      return;
    }

    $("examRows").innerHTML = visibleExams
      .map(
        (exam) => `<tr>${td("Prueba", formatText(exam.nombre))}${td("Tipo", formatText(exam.tipoPrueba))}${td(
          "Grado",
          formatText(exam.gradoObjetivo)
        )}${td("Preguntas", formatText(exam.totalPreguntas ?? 0))}${td(
          "Estado",
          renderBadge(exam.estado === "PUBLICADO" ? 80 : 45, exam.estado)
        )}${td("Accion", `<button class="ghost-button" data-exam-publish="${exam.id}">Publicar</button>`)}</tr>`
      )
      .join("");

    updateTableMeta("examRowsMeta", "examRowsMoreBtn", visibleExams.length, state.exams.length);
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
      resetVisibleRows("exams");
      fillSelect("simExamSelect", state.exams, {
        placeholder: "Selecciona prueba",
        label: (item) => `${item.nombre} | ${item.tipoPrueba} | ${item.gradoObjetivo}`
      });
      syncDashboardFilterOptions(state.dashboardData || {});
      renderExamsTable();
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
      school_id: $("repClassSchoolSelect").value,
      group_id: $("repClassGroupSelect").value,
      grado: $("repClassGrado").value.trim(),
      grupo: $("repClassGrupo").value.trim(),
      institucion: $("repClassInstitucion").value.trim(),
      from: $("repClassFrom").value ? `${$("repClassFrom").value}T00:00:00.000Z` : "",
      to: $("repClassTo").value ? `${$("repClassTo").value}T23:59:59.999Z` : "",
      limit: 3000
    });

  const buildStudentReportQuery = () => toQueryString({ grado: $("repStudentGrado").value.trim() });

  const renderClassroomTopicCards = (rows = []) => {
    const cards = [...rows]
      .sort((a, b) => Number(a.porcentajeAcierto || 0) - Number(b.porcentajeAcierto || 0))
      .slice(0, 4)
      .map((row) => [
        "Tema critico",
        `${row.topic || row.tema || "Sin tema"}: ${Number(row.porcentajeAcierto || 0).toFixed(1)}% de acierto`,
        "bi-lightbulb"
      ]);
    renderRecommendations(
      "classroomTopicCards",
      cards.length ? cards : [["Sin temas criticos", "No hay datos por tema para los filtros seleccionados.", "bi-info-circle"]]
    );
  };

  const renderClassroomReport = () => {
    const data = state.classroomData || {};
    const selectedLevel = $("repClassLevelSelect").value;
    const selectedSubject = $("repClassSubjectSelect").value;
    const studentSearch = normalizeSearch($("repClassStudentSearch").value);

    const bySubjectBase = data.bySubject || [];
    const bySubject = selectedSubject ? bySubjectBase.filter((row) => (row.subject || row.area) === selectedSubject) : bySubjectBase;

    const rows = (data.ranking || [])
      .map((row) => {
        const percentage = Number(row.averagePercentage || 0);
        const level = getAcademicLevel(percentage);
        return { ...row, percentage, level };
      })
      .filter((row) => {
        if (selectedLevel && row.level.key !== selectedLevel) return false;
        if (studentSearch) {
          const textValue = normalizeSearch(`${row.nombres || ""} ${row.apellidos || ""} ${row.numeroIdentificacion || ""}`);
          if (!textValue.includes(studentSearch)) return false;
        }
        return true;
      });

    const sortedBySubject = [...bySubjectBase].sort(
      (a, b) => Number(b.percentage ?? b.porcentajeAcierto ?? 0) - Number(a.percentage ?? a.porcentajeAcierto ?? 0)
    );
    const bestSubject = sortedBySubject[0];
    const weakSubject = sortedBySubject[sortedBySubject.length - 1];
    const totals = data.totals || {};
    const riskCount = rows.filter((row) => row.percentage < 60).length;

    renderStatCards(
      [
        { title: "Estudiantes", value: totals.studentsWithAttempts ?? 0, hint: "Con intentos", icon: "bi-people" },
        { title: "Intentos", value: totals.totalAttempts ?? 0, hint: "Registros visibles", icon: "bi-pencil-square" },
        { title: "Calificados", value: totals.gradedAttempts ?? 0, hint: "Intentos cerrados", icon: "bi-check-circle" },
        { title: "Promedio", value: `${Number(totals.averagePercentage ?? 0).toFixed(1)}%`, hint: "Resultado general", icon: "bi-speedometer2" },
        {
          title: "Materia fuerte",
          value: bestSubject?.subject || bestSubject?.area || "-",
          hint: `${Number(bestSubject?.percentage ?? bestSubject?.porcentajeAcierto ?? 0).toFixed(1)}%`,
          icon: "bi-arrow-up-circle"
        },
        {
          title: "Materia debil",
          value: weakSubject?.subject || weakSubject?.area || "-",
          hint: `${Number(weakSubject?.percentage ?? weakSubject?.porcentajeAcierto ?? 0).toFixed(1)}%`,
          icon: "bi-arrow-down-circle"
        },
        { title: "En riesgo", value: riskCount, hint: "Promedio bajo 60%", icon: "bi-exclamation-circle" },
        { title: "Filtrados", value: rows.length, hint: "Resultados visibles", icon: "bi-funnel" }
      ],
      "classroomKpis"
    );

    const visibleRows = withVisibleRows("classroom", rows);
    if (!rows.length) {
      $("classroomRows").innerHTML = "<tr><td colspan='9'>No hay resultados para los filtros seleccionados.</td></tr>";
      setStatus("repClassStatus", "No hay resultados para los filtros seleccionados.", "warn");
      updateTableMeta("classroomRowsMeta", "classroomRowsMoreBtn", 0, 0);
    } else {
      $("classroomRows").innerHTML = visibleRows
        .map(
          (row, index) =>
            `<tr>${td("#", index + 1)}${td("Estudiante", formatText(`${row.nombres || ""} ${row.apellidos || ""}`.trim()))}${td(
              "Documento",
              formatText(row.numeroIdentificacion || "-")
            )}${td("Grado", formatText(row.grado || "-"))}${td("Grupo", formatText(row.grupo || "-"))}${td(
              "Intentos",
              formatText(row.attempts ?? 0)
            )}${td("Promedio", renderBadge(row.percentage, `${row.percentage.toFixed(1)}%`))}${td(
              "Nivel",
              renderBadge(row.percentage, row.level.label)
            )}${td("Riesgo", formatText(mapRiskMessage(row.level.key)))}</tr>`
        )
        .join("");
      setStatus("repClassStatus", `Resultados visibles: ${rows.length}`, "ok");
      updateTableMeta("classroomRowsMeta", "classroomRowsMoreBtn", visibleRows.length, rows.length);
    }

    renderRecommendations("classroomSummaryCards", makeRecommendations(bySubject, totals.averagePercentage ?? 0));
    renderClassroomTopicCards(data.byTopic || []);

    renderChart("classroomChart", {
      type: "bar",
      data: {
        labels: bySubject.map((row) => row.subject || row.area),
        datasets: [
          {
            label: "% acierto",
            data: bySubject.map((row) => Number(row.percentage ?? row.porcentajeAcierto ?? 0)),
            backgroundColor: chartColors
          }
        ]
      }
    });

    const levels = rows.reduce(
      (acc, row) => {
        acc[row.level.key] = (acc[row.level.key] || 0) + 1;
        return acc;
      },
      { BAJO: 0, BASICO: 0, ALTO: 0, SUPERIOR: 0 }
    );

    renderChart("classroomLevelChart", {
      type: "doughnut",
      data: {
        labels: ["Bajo", "Basico", "Alto", "Superior"],
        datasets: [
          {
            data: [levels.BAJO, levels.BASICO, levels.ALTO, levels.SUPERIOR],
            backgroundColor: ["#dc2626", "#d97706", "#0f766e", "#2563eb"]
          }
        ]
      }
    });
  };

  const loadClassroomReport = async () => {
    try {
      const query = buildClassroomReportQuery();
      const response = await apiRequest(`/reports/classroom/summary${query}`);
      const data = response.data || {};
      state.classroomData = data;
      const selectedSubject = $("repClassSubjectSelect").value;
      fillSelect(
        "repClassSubjectSelect",
        (data.bySubject || []).map((row) => ({ id: row.subject || row.area, name: row.subject || row.area })),
        { placeholder: "Todas las materias" }
      );
      if (selectedSubject) $("repClassSubjectSelect").value = selectedSubject;
      resetVisibleRows("classroom");
      $("repClassOutput").textContent = pretty(data);
      renderClassroomReport();
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

  const AI_STATUS_FLOW = [
    "BORRADOR",
    "GENERADA_IA",
    "EN_REVISION",
    "REVISADA",
    "APROBADA",
    "PUBLICADA",
    "RECHAZADA",
    "ARCHIVADA"
  ];

  const aiStatusWeight = (status) => {
    if (status === "PUBLICADA" || status === "APROBADA") return 92;
    if (status === "REVISADA") return 84;
    if (status === "EN_REVISION") return 74;
    if (status === "GENERADA_IA" || status === "BORRADOR") return 64;
    if (status === "RECHAZADA" || status === "ARCHIVADA") return 32;
    return 50;
  };

  const aiStatusOptions = (selected) =>
    AI_STATUS_FLOW.map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join("");

  const renderAiQuestions = () => {
    const rowsNode = $("aiQuestionRows");
    if (!rowsNode) return;

    const selectedStatus = $("aiStatusFilter")?.value || "";
    const search = normalizeSearch($("aiSearch")?.value || "");
    const filtered = (state.generatedQuestions || []).filter((item) => {
      const generationStatus = item.generation?.status || "BORRADOR";
      if (selectedStatus && generationStatus !== selectedStatus) return false;
      if (!search) return true;
      const text = normalizeSearch(`${item.codigoInterno || ""} ${item.enunciado || ""}`);
      return text.includes(search);
    });
    const visible = withVisibleRows("ai", filtered);

    if (!filtered.length) {
      rowsNode.innerHTML = "<tr><td colspan='7'>No hay preguntas IA para los filtros seleccionados.</td></tr>";
      updateTableMeta("aiRowsMeta", "aiRowsMoreBtn", 0, 0);
      setStatus("aiQuestionsStatus", "No hay preguntas IA para mostrar.", "warn");
      return;
    }

    rowsNode.innerHTML = visible
      .map((item) => {
        const generationStatus = item.generation?.status || "BORRADOR";
        const source = item.source?.name || item.source?.filename || "-";
        const questionPreview = String(item.enunciado || "").slice(0, 140);
        const actionCell =
          state.user?.role === "ADMIN"
            ? `<div class="actions"><button class="ghost-button" type="button" data-ai-view="${item.id}">Ver</button><select data-ai-status-select="${
                item.id
              }">${aiStatusOptions(generationStatus)}</select><button class="primary-button" type="button" data-ai-save="${
                item.id
              }">Actualizar</button></div>`
            : `<button class="ghost-button" type="button" data-ai-view="${item.id}">Ver</button>`;
        return `<tr>${td("Fecha", formatText(formatShortDate(item.createdAt || item.generation?.createdAt)))}${td(
          "Codigo",
          formatText(item.codigoInterno || "-")
        )}${td("Materia", formatText(item.area || "-"))}${td("Dificultad", formatText(item.nivelDificultad || "-"))}${td(
          "Estado IA",
          renderBadge(aiStatusWeight(generationStatus), generationStatus)
        )}${td("Pregunta", `${formatText(questionPreview)}<br><small class="table-meta">Fuente: ${formatText(source)}</small>`)}${td(
          "Accion",
          actionCell
        )}</tr>`;
      })
      .join("");

    updateTableMeta("aiRowsMeta", "aiRowsMoreBtn", visible.length, filtered.length);
    setStatus("aiQuestionsStatus", `Preguntas IA visibles: ${filtered.length}`, "ok");
  };

  const loadGeneratedQuestions = async () => {
    try {
      setButtonLoading("aiQuestionsLoadBtn", true, "Actualizando...");
      const query = toQueryString({
        status: $("aiStatusFilter")?.value || "",
        limit: 120
      });
      const response = await apiRequest(`/questions/generated${query}`);
      state.generatedQuestions = response.data?.items || [];
      state.generatedQuestionsTotal = response.data?.total ?? state.generatedQuestions.length;
      resetVisibleRows("ai");
      renderAiQuestions();
    } catch (error) {
      setStatus("aiQuestionsStatus", error.message, "bad");
    } finally {
      setButtonLoading("aiQuestionsLoadBtn", false);
    }
  };

  const updateAiQuestionStatus = async (questionId, status) => {
    if (state.user?.role !== "ADMIN") {
      setStatus("aiQuestionsStatus", "Solo ADMIN puede actualizar estado IA.", "warn");
      return;
    }
    await apiRequest(`/questions/${questionId}/ai-status`, {
      method: "PATCH",
      body: { status }
    });
    setStatus("aiQuestionsStatus", `Estado actualizado a ${status}.`, "ok");
    await loadGeneratedQuestions();
  };

  const isSystemAdmin = () => state.user?.role === "ADMIN";

  const systemTone = (status) => {
    if (status === "OK" || status === true || status === "SUCCESS") return "ok";
    if (status === "WARN") return "warn";
    return "bad";
  };

  const systemValue = (value) => (value === undefined || value === null || value === "" ? "-" : value);

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const resolveSystemUrls = () => {
    const status = state.system.status || {};
    const lan = state.system.lan || {};
    const origin = `${window.location.origin}`;
    const adminUrl = lan.adminUrl || status.adminUrl || `${origin}/admin/`;
    const simulatorUrl = lan.simulatorUrl || status.simulatorUrl || `${origin}/simulador/`;
    const healthUrl = lan.healthUrl || status.healthUrl || `${origin}/health`;
    const readyUrl = lan.readyUrl || status.readyUrl || `${origin}/health/ready`;
    const lanIp = lan.lanIp || status.lanIp || null;
    return { lanIp, adminUrl, simulatorUrl, healthUrl, readyUrl };
  };

  const buildQuickLanChecklistText = () => {
    const urls = resolveSystemUrls();
    return [
      "Checklist rapido simulacro LAN",
      `Servidor/IP confirmado: ${urls.lanIp || "-"}`,
      `URL simulador: ${urls.simulatorUrl}`,
      `URL admin: ${urls.adminUrl}`,
      `Health: ${urls.healthUrl}`,
      `Ready: ${urls.readyUrl}`,
      "- Docker activo y PC conectado a corriente",
      "- Otro PC abre /simulador por IP LAN",
      "- Celular abre /simulador por IP LAN",
      "- Prueba escalonada 5 -> 10 -> 25 -> 50",
      "- No ejecutar import/backups/IA pesada durante el simulacro"
    ].join("\n");
  };

  const renderSystemMonitoring = () => {
    const status = state.system.status || {};
    const health = state.system.health || {};
    const monitoring = status.monitoring || {};
    const urls = resolveSystemUrls();
    const services = status.services || {};
    const apiUp = services.api === "up";
    const dbUp = services.db === "up" || status.databaseReady === true || health.checks?.database?.status === "OK";
    const ollamaState = services.ollama || "not-configured";
    const ollamaOk = ollamaState === "up" || health.checks?.ollama?.status === "OK";
    const lanOk = Boolean(urls.lanIp);
    const healthStatus = health.status || (dbUp ? "OK" : "ERROR");
    const refreshAt = health.timestamp || status.currentTime || null;

    setText("sysQuickApi", apiUp ? "OK" : "ERROR");
    setText("sysQuickDb", dbUp ? "OK" : "ERROR");
    setText("sysQuickOllama", ollamaState === "not-configured" ? "WARN" : ollamaOk ? "OK" : "WARN");
    setText("sysQuickLan", lanOk ? "OK" : "WARN");
    setText("sysQuickHealth", systemValue(healthStatus));
    setText("sysQuickUpdated", formatDateTime(refreshAt));
    setText("sysQuickActiveAttempts", systemValue(monitoring.activeAttempts));
    setText("sysQuickSaved15m", systemValue(monitoring.answersSavedLast15m));
    setText("sysQuickSubmitted24h", systemValue(monitoring.submittedAttemptsLast24h));
    setText("sysQuickSyncErrors", systemValue(monitoring.syncErrorsLast15m));

    setText("sysMonitorLanIp", systemValue(urls.lanIp));
    setText("sysMonitorSimUrl", urls.simulatorUrl || "-");
    setText("sysMonitorAdminUrl", urls.adminUrl || "-");
    setText("sysMonitorHealthUrl", urls.healthUrl || "-");
    setText("sysMonitorReadyUrl", urls.readyUrl || "-");

    const monitorTone = !apiUp || !dbUp || healthStatus === "ERROR" ? "bad" : healthStatus === "WARN" || !lanOk || !ollamaOk ? "warn" : "ok";
    const monitorMessage =
      monitorTone === "ok"
        ? "Listo para prueba LAN: API, base de datos y ready en estado saludable."
        : monitorTone === "warn"
          ? "Revisar advertencias antes de iniciar: valida LAN/Ollama y confirma accesos de prueba."
          : "No iniciar simulacro hasta corregir errores criticos en API o base de datos.";
    setStatus("sysMonitorSemaphore", monitorMessage, monitorTone);

    const statusMessage = `API ${apiUp ? "OK" : "ERROR"} | DB ${dbUp ? "OK" : "ERROR"} | Health ${systemValue(healthStatus)} | LAN ${lanOk ? "OK" : "WARN"} | Intentos activos ${systemValue(monitoring.activeAttempts)} | Errores sync 15m ${systemValue(monitoring.syncErrorsLast15m)}`;
    setStatus("sysMonitorStatus", statusMessage, monitorTone);
  };

  const setSystemApplyState = () => {
    const button = $("sysApplyBtn");
    if (!button) return;
    button.disabled = !isSystemAdmin() || !state.system.canApplyImport;
  };

  const renderSystemStatusCards = () => {
    const target = $("sysStatusCards");
    if (!target) return;
    const status = state.system.status || {};
    const lan = state.system.lan || {};
    const health = state.system.health || {};
    const services = status.services || {};
    const cards = [
      { title: "Entorno", value: systemValue(status.nodeEnv), hint: `Host ${systemValue(status.host)}:${systemValue(status.port)}`, icon: "bi-cpu" },
      { title: "IP LAN", value: systemValue(lan.lanIp || status.lanIp), hint: "Uso interno en red privada", icon: "bi-hdd-network" },
      { title: "Base de datos", value: services.db === "up" ? "Disponible" : "No disponible", hint: `Ready: ${status.databaseReady ? "si" : "no"}`, icon: "bi-database-check" },
      { title: "Ollama", value: services.ollama === "up" ? "Disponible" : services.ollama === "not-configured" ? "No configurado" : "No disponible", hint: `Health: ${health.checks?.ollama?.status || "-"}`, icon: "bi-robot" },
      { title: "Health", value: systemValue(health.status), hint: `Checks en ${systemValue(health.durationMs)} ms`, icon: "bi-heart-pulse" },
      { title: "Operacion", value: status.operationLock?.running ? "En curso" : "Libre", hint: status.operationLock?.action || "Sin bloqueo", icon: "bi-shield-check" }
    ];

    target.innerHTML = cards
      .map(
        (item) => `<article class="stat-card">
          <div class="stat-head"><span>${escapeHtml(item.title)}</span><i class="bi ${item.icon}"></i></div>
          <strong>${escapeHtml(String(item.value))}</strong>
          <small>${escapeHtml(String(item.hint))}</small>
        </article>`
      )
      .join("");
  };

  const loadSystemStatus = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysStatusBtn", true, "Consultando...");
      const response = await apiRequest("/admin/system/status");
      state.system.status = response.data || null;
      renderSystemStatusCards();
      renderSystemMonitoring();
      $("sysStatusOut").textContent = pretty(response.data);
      setStatus("sysStatusBox", response.data?.ok ? "Estado general operativo." : "Estado con advertencias.", response.data?.ok ? "ok" : "warn");
    } catch (error) {
      setStatus("sysStatusBox", error.message, "bad");
    } finally {
      setButtonLoading("sysStatusBtn", false);
    }
  };

  const loadSystemLan = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysLanBtn", true, "Consultando...");
      const response = await apiRequest("/admin/system/lan");
      state.system.lan = response.data || null;
      renderSystemStatusCards();
      renderSystemMonitoring();
      $("sysStatusOut").textContent = pretty({
        status: state.system.status,
        lan: response.data
      });
      setStatus("sysStatusBox", response.data?.lanIp ? "LAN detectada y lista para pruebas." : "No se detecto IP LAN valida.", response.data?.lanIp ? "ok" : "warn");
    } catch (error) {
      setStatus("sysStatusBox", error.message, "bad");
    } finally {
      setButtonLoading("sysLanBtn", false);
    }
  };

  const loadSystemHealth = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysHealthBtn", true, "Verificando...");
      const response = await apiRequest("/admin/system/health");
      state.system.health = response.data || null;
      renderSystemStatusCards();
      renderSystemMonitoring();
      $("sysStatusOut").textContent = pretty({
        status: state.system.status,
        health: response.data
      });
      setStatus("sysStatusBox", `Health ${response.data?.status || "-"}`, systemTone(response.data?.status));
    } catch (error) {
      setStatus("sysStatusBox", error.message, "bad");
    } finally {
      setButtonLoading("sysHealthBtn", false);
    }
  };

  const renderSystemOperations = () => {
    const rowsNode = $("sysOpsRows");
    if (!rowsNode) return;
    const rows = state.system.operations || [];
    if (!rows.length) {
      rowsNode.innerHTML = "<tr><td colspan='5'>Sin operaciones registradas.</td></tr>";
      return;
    }

    rowsNode.innerHTML = rows
      .map((item) => {
        const tone = item.status === "SUCCESS" ? "high" : "medium";
        const adminName = item.admin?.name || item.admin?.email || "-";
        const summary = item.message || item.metadata?.message || item.metadata?.report?.message || "-";
        return `<tr>${td("Fecha", formatText(formatShortDate(item.createdAt)))}${td("Accion", formatText(item.action))}${td(
          "Estado",
          `<span class="badge-soft ${tone}">${escapeHtml(item.status || "INFO")}</span>`
        )}${td("Admin", formatText(adminName))}${td("Resumen", formatText(summary))}</tr>`;
      })
      .join("");
  };

  const loadSystemOperations = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysOpsLoadBtn", true, "Actualizando...");
      const response = await apiRequest("/admin/system/operations");
      state.system.operations = response.data?.items || [];
      renderSystemOperations();
      setStatus("sysOpsStatus", `Operaciones: ${state.system.operations.length}`, "ok");
    } catch (error) {
      setStatus("sysOpsStatus", error.message, "bad");
    } finally {
      setButtonLoading("sysOpsLoadBtn", false);
    }
  };

  const renderSystemChecklist = () => {
    const target = $("sysChecklistList");
    if (!target) return;
    const items = state.system.checklist || [];
    if (!items.length) {
      target.innerHTML = "<article class='checklist-item'><div class='check-label'>Sin items disponibles.</div></article>";
      return;
    }
    target.innerHTML = items
      .map(
        (item) => `<article class="checklist-item">
          <div class="check-head">
            <span class="check-area">${escapeHtml(item.area || "")}</span>
            <label class="checkbox-inline"><input type="checkbox" data-sys-check-toggle="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""}/>Completado</label>
          </div>
          <div class="check-label">${escapeHtml(item.label || item.id)}</div>
          <input data-sys-check-note="${escapeHtml(item.id)}" value="${escapeHtml(item.note || "")}" placeholder="Nota opcional" />
          <div class="actions">
            <button class="ghost-button" type="button" data-sys-check-save="${escapeHtml(item.id)}">Guardar</button>
            <small class="table-meta">${escapeHtml(item.updatedAt ? `Actualizado: ${formatShortDate(item.updatedAt)}` : "Sin actualizar")}</small>
          </div>
        </article>`
      )
      .join("");
  };

  const loadSystemChecklist = async () => {
    if (!isSystemAdmin()) return;
    try {
      const response = await apiRequest("/admin/system/checklist");
      state.system.checklist = response.data?.items || [];
      renderSystemChecklist();
      setStatus("sysChecklistStatus", `Items: ${state.system.checklist.length}`, "ok");
    } catch (error) {
      setStatus("sysChecklistStatus", error.message, "bad");
    }
  };

  const saveSystemChecklistItem = async (itemId, checked, note) => {
    await apiRequest(`/admin/system/checklist/${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: {
        checked: Boolean(checked),
        note: String(note || "").trim() || undefined
      }
    });
  };

  const runSystemDryRun = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysDryRunBtn", true, "Ejecutando...");
      const limit = Number($("sysLimit")?.value || 5000);
      const payload = cleanObject({
        datasetId: ($("sysDatasetId")?.value || "cfw5-qzt5").trim(),
        departamento: normalizeUpperText($("sysDept")?.value || ""),
        municipio: normalizeUpperText($("sysMunicipio")?.value || ""),
        search: ($("sysSearch")?.value || "").trim(),
        limit: Number.isFinite(limit) ? Math.max(1, Math.min(10000, limit)) : 5000
      });
      const response = await apiRequest("/admin/system/schools/import/dry-run", { method: "POST", body: payload });
      state.system.dryRun = response.data || null;
      const prerequisites = response.data?.prerequisites || {};
      state.system.canApplyImport = Boolean(prerequisites.hasRecentDryRun && prerequisites.hasRecentBackup);
      setSystemApplyState();
      $("sysImportOut").textContent = pretty(response.data);
      if (state.system.canApplyImport) {
        setStatus("sysImportStatus", "Dry-run OK y backup reciente detectado. Puedes aplicar importacion.", "ok");
      } else {
        setStatus(
          "sysImportStatus",
          "Dry-run ejecutado. Requisitos pendientes para aplicar: backup reciente y dry-run valido.",
          "warn"
        );
      }
      await loadSystemOperations();
    } catch (error) {
      setStatus("sysImportStatus", error.message, "bad");
    } finally {
      setButtonLoading("sysDryRunBtn", false);
    }
  };

  const runSystemImportApply = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysApplyBtn", true, "Importando...");
      const payload = {
        confirmText: ($("sysApplyConfirm")?.value || "").trim(),
        acceptedRisk: Boolean($("sysApplyRisk")?.checked),
        datasetId: ($("sysDatasetId")?.value || "cfw5-qzt5").trim(),
        filters: cleanObject({
          departamento: normalizeUpperText($("sysDept")?.value || ""),
          municipio: normalizeUpperText($("sysMunicipio")?.value || ""),
          search: ($("sysSearch")?.value || "").trim()
        })
      };
      const response = await apiRequest("/admin/system/schools/import/apply", { method: "POST", body: payload });
      $("sysImportOut").textContent = pretty(response.data);
      setStatus("sysImportStatus", "Importacion ejecutada correctamente.", "ok");
      state.system.canApplyImport = false;
      setSystemApplyState();
      await loadSystemOperations();
      await loadSystemStatus();
    } catch (error) {
      setStatus("sysImportStatus", error.message, "bad");
    } finally {
      setButtonLoading("sysApplyBtn", false);
    }
  };

  const runSystemBackup = async (assistantOnly) => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading(assistantOnly ? "sysBackupAssistBtn" : "sysBackupCreateBtn", true, assistantOnly ? "Preparando..." : "Creando...");
      const response = await apiRequest("/admin/system/backup", {
        method: "POST",
        body: { assistantOnly: Boolean(assistantOnly) }
      });
      state.system.backup = response.data || null;
      $("sysBackupOut").textContent = pretty(response.data);
      setStatus(
        "sysBackupStatus",
        assistantOnly ? "Asistente de backup listo. Ejecuta el comando sugerido en consola." : "Backup procesado.",
        assistantOnly ? "warn" : "ok"
      );
      if (!assistantOnly) {
        state.system.canApplyImport = false;
        setSystemApplyState();
      }
      await loadSystemOperations();
    } catch (error) {
      setStatus("sysBackupStatus", error.message, "bad");
    } finally {
      setButtonLoading(assistantOnly ? "sysBackupAssistBtn" : "sysBackupCreateBtn", false);
    }
  };

  const runSystemLocalPrepare = async () => {
    if (!isSystemAdmin()) return;
    try {
      setButtonLoading("sysPrepareBtn", true, "Procesando...");
      const aiCount = Number($("sysPrepareAiCount")?.value || 5);
      const payload = cleanObject({
        confirmText: ($("sysPrepareConfirm")?.value || "").trim(),
        acceptedDataLossRisk: Boolean($("sysPrepareRisk")?.checked),
        execute: Boolean($("sysPrepareExecute")?.checked),
        withSchools: true,
        withDemoUsers: true,
        withAi: Boolean($("sysPrepareWithAi")?.checked),
        aiCount: Number.isFinite(aiCount) ? Math.max(1, Math.min(10, aiCount)) : 5,
        departamento: normalizeUpperText($("sysPrepareDept")?.value || ""),
        backupFile: ($("sysPrepareBackupFile")?.value || "").trim()
      });
      const response = await apiRequest("/admin/system/local-production/prepare", { method: "POST", body: payload });
      $("sysPrepareOut").textContent = pretty(response.data);
      const tone = response.data?.mode === "assistant" ? "warn" : "ok";
      setStatus("sysPrepareStatus", response.data?.mode === "assistant" ? "Asistente listo para ejecucion controlada." : "Preparacion ejecutada.", tone);
      await loadSystemOperations();
    } catch (error) {
      setStatus("sysPrepareStatus", error.message, "bad");
    } finally {
      setButtonLoading("sysPrepareBtn", false);
    }
  };

  const refreshSystemPanel = async () => {
    if (!isSystemAdmin()) {
      setStatus("sysStatusBox", "Solo ADMIN puede operar esta seccion.", "warn");
      return;
    }
    setSystemApplyState();
    try {
      await Promise.allSettled([loadSystemStatus(), loadSystemLan(), loadSystemHealth(), loadSystemChecklist(), loadSystemOperations()]);
    } finally {
      renderSystemMonitoring();
      resetGlobalUiLocks();
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
    await loadSchoolDepartments();
    await loadSchoolMunicipalities($("dashDepartmentSelect").value || $("schoolFilterDepartment").value);
    await listSchools();
    await Promise.allSettled([
      loadFormCatalogDepartments("student"),
      loadFormCatalogDepartments("user"),
      listGroups(),
      listStudents(),
      listUsers(),
      listExams(),
      loadDashboard(),
      loadGeneratedQuestions()
    ]);
    resetStudentForm();
    updateFormScopeVisibility();
    if (isSystemAdmin()) {
      await refreshSystemPanel();
    } else {
      setSystemApplyState();
    }
  };

  const bindEvents = () => {
    $("loginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void login();
    });
    $("logoutBtn").addEventListener("click", logout);
    $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        resetGlobalUiLocks();
      }
    });
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    setupPasswordToggle("loginPassword", "loginTogglePassword");

    $("dashLoadBtn").addEventListener("click", loadDashboard);
    $("dashApplyFiltersBtn").addEventListener("click", () => state.dashboardData && renderDashboard());
    $("dashClearFiltersBtn").addEventListener("click", () => {
      $("dashExamSelect").value = "";
      $("dashLevelSelect").value = "";
      $("dashStudentSearch").value = "";
      $("dashSubjectSelect").value = "";
      resetVisibleRows("dashboard");
      state.dashboardData && renderDashboard();
    });
    $("dashRowsMoreBtn").addEventListener("click", () => {
      state.visibleRows.dashboard += TABLE_STEP.dashboard;
      state.dashboardData && renderDashboard();
    });
    $("dashExamSelect").addEventListener("change", () => {
      resetVisibleRows("dashboard");
      state.dashboardData && renderDashboard();
    });
    $("dashLevelSelect").addEventListener("change", () => {
      resetVisibleRows("dashboard");
      state.dashboardData && renderDashboard();
    });
    $("dashSubjectSelect").addEventListener("change", () => {
      resetVisibleRows("dashboard");
      state.dashboardData && renderDashboard();
    });
    $("dashStudentSearch").addEventListener("input", () => {
      resetVisibleRows("dashboard");
      state.dashboardData && renderDashboard();
    });
    $("dashDepartmentSelect").addEventListener("change", async () => {
      const departamento = $("dashDepartmentSelect").value;
      $("schoolFilterDepartment").value = departamento;
      await loadSchoolMunicipalities(departamento);
      $("schoolFilterMunicipality").value = $("dashMunicipalitySelect").value;
      await listSchools();
      await listGroups($("dashSchoolSelect").value);
    });
    $("dashMunicipalitySelect").addEventListener("change", async () => {
      $("schoolFilterMunicipality").value = $("dashMunicipalitySelect").value;
      await listSchools();
      await listGroups($("dashSchoolSelect").value);
    });
    $("dashSchoolSelect").addEventListener("change", async () => {
      await listGroups($("dashSchoolSelect").value);
      $("repClassSchoolSelect").value = $("dashSchoolSelect").value || "";
    });
    $("groupSchoolSelect").addEventListener("change", () => listGroups($("groupSchoolSelect").value));
    $("stSchoolSelect").addEventListener("change", () => listGroups($("stSchoolSelect").value));
    $("stDepartmentSelect")?.addEventListener("change", async () => {
      await loadFormCatalogMunicipalities("student");
      await loadFormCatalogSchools("student");
      await listGroups($("stSchoolSelect").value);
    });
    $("stMunicipalitySelect")?.addEventListener("change", async () => {
      await loadFormCatalogSchools("student");
      await listGroups($("stSchoolSelect").value);
    });
    $("stSchoolSearch")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void loadFormCatalogSchools("student");
    });
    $("stSchoolSearch")?.addEventListener("blur", () => {
      void loadFormCatalogSchools("student");
    });

    $("schoolForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveSchool();
    });
    $("schoolCancelBtn").addEventListener("click", resetSchoolForm);
    $("schoolLoadBtn").addEventListener("click", listSchools);
    $("schoolFilterDepartment").addEventListener("change", async () => {
      const departamento = $("schoolFilterDepartment").value;
      $("dashDepartmentSelect").value = departamento;
      await loadSchoolMunicipalities(departamento);
      $("dashMunicipalitySelect").value = $("schoolFilterMunicipality").value;
      await listSchools();
      await listGroups($("dashSchoolSelect").value);
    });
    $("schoolFilterMunicipality").addEventListener("change", async () => {
      $("dashMunicipalitySelect").value = $("schoolFilterMunicipality").value;
      await listSchools();
      await listGroups($("dashSchoolSelect").value);
    });
    $("schoolFilterSearch").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void listSchools();
    });
    $("schoolApplyFiltersBtn").addEventListener("click", () => {
      void listSchools();
    });
    $("schoolRows").addEventListener("click", (event) => {
      const id = event.target?.dataset?.schoolEdit;
      if (!id) return;
      const school = state.schools.find((item) => item.id === id);
      if (!school) return;
      $("schoolEditingId").value = school.id;
      $("schoolCode").value = school.code || "";
      $("schoolCodigoDane").value = school.codigoDane || "";
      $("schoolName").value = school.name || "";
      $("schoolEstablecimiento").value = school.establecimiento || "";
      $("schoolSede").value = school.sede || "";
      $("schoolDepartamento").value = school.departamento || "";
      $("schoolMunicipio").value = school.municipio || "";
      $("schoolSectorNormalizado").value = school.sectorNormalizado || "";
      $("schoolDireccion").value = school.direccion || "";
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
    $("stListMoreBtn").addEventListener("click", () => {
      state.visibleRows.students += TABLE_STEP.students;
      renderStudentsTable();
    });
    $("stTemplateBtn").addEventListener("click", () => downloadWithAuth("/students/bulk/template.csv", "students_bulk_template.csv"));
    $("stBulkBtn").addEventListener("click", uploadStudentsCsv);
    $("stListRows").addEventListener("click", async (event) => {
      const editId = event.target?.dataset?.stEdit;
      const deleteId = event.target?.dataset?.stDelete;
      if (editId) {
        const targetStudent = state.students.find((item) => item.id === editId);
        if (targetStudent) {
          await fillStudentForm(targetStudent);
        }
      }
      if (deleteId && window.confirm("Eliminar lógicamente este estudiante?")) {
        await apiRequest(`/students/${deleteId}`, { method: "DELETE" });
        await listStudents();
      }
    });

    $("userForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void createUser();
    });
    $("uRol")?.addEventListener("change", () => updateFormScopeVisibility());
    $("uDepartmentSelect")?.addEventListener("change", async () => {
      await loadFormCatalogMunicipalities("user");
      await loadFormCatalogSchools("user");
    });
    $("uMunicipalitySelect")?.addEventListener("change", () => {
      void loadFormCatalogSchools("user");
    });
    $("uSchoolSearch")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void loadFormCatalogSchools("user");
    });
    $("uSchoolSearch")?.addEventListener("blur", () => {
      void loadFormCatalogSchools("user");
    });
    $("uListBtn").addEventListener("click", listUsers);
    $("uTemplateBtn").addEventListener("click", () => downloadWithAuth("/users/bulk/template.csv", "users_bulk_template.csv"));
    $("uBulkBtn").addEventListener("click", uploadUsersCsv);

    $("examForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void createExam();
    });
    $("examLoadBtn").addEventListener("click", listExams);
    $("examRowsMoreBtn").addEventListener("click", () => {
      state.visibleRows.exams += TABLE_STEP.exams;
      renderExamsTable();
    });
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
    $("repClassSchoolSelect").addEventListener("change", () => {
      const schoolId = $("repClassSchoolSelect").value;
      if (!schoolId) {
        fillSelect("repClassGroupSelect", [], { placeholder: "Todos los salones" });
        return;
      }
      void listGroups(schoolId);
    });
    $("repClassGroupSelect").addEventListener("change", () => {
      const selected = state.groups.find((group) => group.id === $("repClassGroupSelect").value);
      $("repClassGrupo").value = selected?.name || "";
    });
    $("repClassApplyFiltersBtn").addEventListener("click", () => state.classroomData && renderClassroomReport());
    $("repClassClearFiltersBtn").addEventListener("click", () => {
      $("repClassLevelSelect").value = "";
      $("repClassStudentSearch").value = "";
      $("repClassSubjectSelect").value = "";
      resetVisibleRows("classroom");
      state.classroomData && renderClassroomReport();
    });
    $("repClassLevelSelect").addEventListener("change", () => {
      resetVisibleRows("classroom");
      state.classroomData && renderClassroomReport();
    });
    $("repClassSubjectSelect").addEventListener("change", () => {
      resetVisibleRows("classroom");
      state.classroomData && renderClassroomReport();
    });
    $("repClassStudentSearch").addEventListener("input", () => {
      resetVisibleRows("classroom");
      state.classroomData && renderClassroomReport();
    });
    $("classroomRowsMoreBtn").addEventListener("click", () => {
      state.visibleRows.classroom += TABLE_STEP.classroom;
      state.classroomData && renderClassroomReport();
    });
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

    $("aiQuestionsLoadBtn").addEventListener("click", () => void loadGeneratedQuestions());
    $("aiApplyFiltersBtn").addEventListener("click", () => {
      resetVisibleRows("ai");
      renderAiQuestions();
    });
    $("aiRowsMoreBtn").addEventListener("click", () => {
      state.visibleRows.ai += TABLE_STEP.ai;
      renderAiQuestions();
    });
    $("aiStatusFilter").addEventListener("change", () => void loadGeneratedQuestions());
    $("aiSearch").addEventListener("input", () => {
      resetVisibleRows("ai");
      renderAiQuestions();
    });
    $("aiQuestionRows").addEventListener("click", async (event) => {
      const target = event.target?.closest?.("[data-ai-view], [data-ai-save]");
      const viewId = target?.dataset?.aiView;
      const saveId = target?.dataset?.aiSave;
      if (viewId) {
        const item = state.generatedQuestions.find((question) => question.id === viewId);
        if (!item) return;
        const detailNode = $("aiQuestionDetail");
        detailNode.textContent = pretty(item);
        detailNode.classList.remove("is-collapsed");
        return;
      }
      if (saveId) {
        const select = document.querySelector(`select[data-ai-status-select="${saveId}"]`);
        const status = select?.value;
        if (!status) return;
        try {
          await updateAiQuestionStatus(saveId, status);
        } catch (error) {
          setStatus("aiQuestionsStatus", error.message, "bad");
        }
      }
    });

    $("sysStatusBtn").addEventListener("click", () => void loadSystemStatus());
    $("sysLanBtn").addEventListener("click", () => void loadSystemLan());
    $("sysHealthBtn").addEventListener("click", () => void loadSystemHealth());
    $("sysMonitorRefreshBtn")?.addEventListener("click", () => void refreshSystemPanel());
    $("sysCopyQuickChecklistBtn")?.addEventListener("click", () => void copyPlainText(buildQuickLanChecklistText(), "Checklist copiado"));
    $("sysDryRunBtn").addEventListener("click", () => void runSystemDryRun());
    $("sysApplyBtn").addEventListener("click", () => void runSystemImportApply());
    $("sysBackupCreateBtn").addEventListener("click", () => void runSystemBackup(false));
    $("sysBackupAssistBtn").addEventListener("click", () => void runSystemBackup(true));
    $("sysPrepareBtn").addEventListener("click", () => void runSystemLocalPrepare());
    $("sysOpsLoadBtn").addEventListener("click", () => void loadSystemOperations());
    document.querySelectorAll("[data-code-toggle]").forEach((button) => {
      const target = $(button.dataset.codeToggle || "");
      syncCodeToggleLabel(button, target);
      button.addEventListener("click", () => toggleCodeBox(button.dataset.codeToggle, button));
    });
    document.querySelectorAll("[data-code-copy]").forEach((button) => {
      button.addEventListener("click", () => void copyCodeBox(button.dataset.codeCopy));
    });
    document.querySelectorAll("[data-copy-text]").forEach((button) => {
      button.addEventListener("click", () => void copyPlainText(button.dataset.copyText || "", "Comando copiado"));
    });
    document.querySelectorAll("[data-copy-from]").forEach((button) => {
      button.addEventListener("click", () => {
        const sourceId = button.dataset.copyFrom || "";
        const source = $(sourceId);
        if (!source) return;
        void copyPlainText((source.textContent || "").trim(), "Enlace copiado");
      });
    });
    $("sysChecklistList").addEventListener("change", async (event) => {
      const itemId = event.target?.dataset?.sysCheckToggle;
      if (!itemId) return;
      const noteInput = document.querySelector(`[data-sys-check-note="${itemId}"]`);
      try {
        await saveSystemChecklistItem(itemId, event.target.checked, noteInput?.value || "");
        setStatus("sysChecklistStatus", "Checklist actualizado.", "ok");
        await loadSystemChecklist();
        await loadSystemOperations();
      } catch (error) {
        setStatus("sysChecklistStatus", error.message, "bad");
      }
    });
    $("sysChecklistList").addEventListener("click", async (event) => {
      const itemId = event.target?.dataset?.sysCheckSave;
      if (!itemId) return;
      const noteInput = document.querySelector(`[data-sys-check-note="${itemId}"]`);
      const toggleInput = document.querySelector(`[data-sys-check-toggle="${itemId}"]`);
      try {
        await saveSystemChecklistItem(itemId, Boolean(toggleInput?.checked), noteInput?.value || "");
        setStatus("sysChecklistStatus", "Checklist actualizado.", "ok");
        await loadSystemChecklist();
        await loadSystemOperations();
      } catch (error) {
        setStatus("sysChecklistStatus", error.message, "bad");
      }
    });
  };

  const init = async () => {
    resetGlobalUiLocks();
    bindEvents();
    $("groupYear").value = String(new Date().getFullYear());
    await loadConnectionInfo();
    const hasSession = await loadCurrentUser();
    if (hasSession) await bootstrapData();
    else setAuthenticatedUi(false);
    resetGlobalUiLocks();
  };

  init();
})();


