"use strict";

(() => {
  const TOKEN_KEY = "saber11_admin_token";
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    apiBase: `${window.location.origin}/api`,
    connection: null,
    clientLogs: [],
    students: [],
    editingStudentId: null,
    strictPendingAutoRefresh: true,
    strictPendingPollId: null,
    simulator: {
      attemptId: null,
      questionDeck: [],
      currentIndex: 0,
      answersByQuestionId: {},
      result: null
    }
  };

  const $ = (id) => document.getElementById(id);
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
      if (value === undefined || value === null) return;
      if (typeof value === "string" && value.trim().length === 0) return;
      query.set(key, String(value));
    });
    const text = query.toString();
    return text ? `?${text}` : "";
  };

  const setStatus = (elementId, message, tone = "") => {
    const element = $(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = "status";
    if (tone === "ok") element.classList.add("ok");
    if (tone === "warn") element.classList.add("warn");
    if (tone === "bad") element.classList.add("bad");
  };

  const setText = (elementId, value) => {
    const element = $(elementId);
    if (element) element.textContent = value ?? "";
  };

  const appendClientLog = (level, message, details) => {
    const timestamp = new Date().toISOString();
    const suffix = details ? ` | ${typeof details === "string" ? details : JSON.stringify(details)}` : "";
    const line = `[${timestamp}] [${level}] ${message}${suffix}`;
    state.clientLogs.unshift(line);
    if (state.clientLogs.length > 200) {
      state.clientLogs.length = 200;
    }
    const logBox = $("adminClientLog");
    if (logBox) {
      logBox.textContent = state.clientLogs.join("\n");
    }

    if (level === "ERROR" || level === "WARN") {
      console.warn(line);
    } else {
      console.info(line);
    }
  };

  const parseErrorResponse = async (response) => {
    const text = await response.text();
    let message = text || `Error HTTP ${response.status}`;
    let code = "HTTP_ERROR";
    let requestId = null;
    try {
      const payload = JSON.parse(text);
      message = payload?.error?.message || payload?.message || message;
      code = payload?.error?.code || code;
      requestId = payload?.error?.requestId || payload?.meta?.requestId || null;
    } catch {}

    const error = new Error(message);
    error.code = code;
    error.requestId = requestId;
    throw error;
  };

  const apiRequest = async (path, options = {}) => {
    const { method = "GET", body, auth = true, headers = {}, responseType = "json" } = options;
    const requestHeaders = new Headers(headers);
    let payloadBody = body;
    const startedAt = Date.now();

    if (auth) {
      if (!state.token) throw new Error("No hay sesion activa. Inicia sesion.");
      requestHeaders.set("Authorization", `Bearer ${state.token}`);
    }

    if (body && !(body instanceof FormData)) {
      requestHeaders.set("Content-Type", "application/json");
      payloadBody = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${state.apiBase}${path}`, {
        method,
        headers: requestHeaders,
        body: payloadBody
      });
    } catch (error) {
      appendClientLog("ERROR", `${method} ${path} network_error`, {
        message: error?.message || "fetch_failed",
        apiBase: state.apiBase
      });
      throw new Error(
        `No se pudo conectar con la API (${state.apiBase}). Verifica IP del servidor, red local y firewall.`
      );
    }

    if (!response.ok) {
      try {
        await parseErrorResponse(response);
      } catch (error) {
        appendClientLog("ERROR", `${method} ${path} -> ${response.status}`, {
          message: error.message,
          code: error.code || "HTTP_ERROR",
          requestId: error.requestId || null,
          durationMs: Date.now() - startedAt
        });
        throw error;
      }
    }

    appendClientLog("INFO", `${method} ${path} -> ${response.status}`, {
      durationMs: Date.now() - startedAt
    });

    if (responseType === "blob") return response.blob();
    const payload = await response.json();
    if (payload?.meta?.requestId) {
      appendClientLog("INFO", `${method} ${path} requestId`, payload.meta.requestId);
    }
    return payload;
  };

  const downloadWithAuth = async (path, fallbackName) => {
    const blob = await apiRequest(path, { auth: true, responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const setSessionUi = () => {
    setText("sessionText", state.token ? `token cargado (${state.token.slice(0, 14)}...)` : "sin token");
  };

  const initTabs = () => {
    const tabs = document.querySelectorAll("#tabs .tab");
    tabs.forEach((tabButton) => {
      tabButton.addEventListener("click", () => {
        const sectionName = tabButton.getAttribute("data-section");
        tabs.forEach((tab) => tab.classList.remove("active"));
        tabButton.classList.add("active");
        document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
        const section = $(`sec-${sectionName}`);
        if (section) section.classList.add("active");
      });
    });
  };

  const loadConnectionInfo = async () => {
    try {
      const response = await fetch("/connection-info");
      if (!response.ok) throw new Error(`No se pudo leer /connection-info (${response.status})`);
      const payload = await response.json();
      state.connection = payload?.data || null;
      $("connectionOut").textContent = pretty(payload);
      const docsUrl = state.connection?.docsUrl || `${window.location.origin}/api/docs`;
      const apiFromRequest = state.connection?.apiBaseUrl || `${window.location.origin}/api`;
      const preferredApi = state.connection?.preferredApiBaseUrl || null;
      const lanUrls = state.connection?.sharedLanUrls?.length
        ? state.connection.sharedLanUrls
        : state.connection?.lanUrls || [];

      state.apiBase = `${window.location.origin}/api`;
      $("docsLink").href = docsUrl;
      $("simLink").href = state.connection?.preferredSimulatorWebUrl || state.connection?.simulatorWebUrl || "/simulador";
      setText(
        "apiText",
        preferredApi && preferredApi !== apiFromRequest
          ? `${apiFromRequest} (preferida: ${preferredApi})`
          : apiFromRequest
      );
      setText("adminText", state.connection?.preferredAdminWebUrl || state.connection?.adminWebUrl || `${window.location.origin}/admin`);
      setText("lanText", Array.isArray(lanUrls) && lanUrls.length ? lanUrls.join(" | ") : "sin URLs LAN detectadas");
      appendClientLog("INFO", "connection-info loaded", {
        effectiveApiBase: state.apiBase,
        apiFromRequest,
        preferredApi
      });
    } catch (error) {
      $("connectionOut").textContent = pretty({ error: error.message });
      setText("apiText", state.apiBase);
      setText("lanText", "sin datos");
      setText("adminText", `${window.location.origin}/admin`);
      appendClientLog("WARN", "connection-info unavailable", error.message);
    }
  };

  const stopStrictPendingAutoRefresh = () => {
    if (state.strictPendingPollId) {
      window.clearInterval(state.strictPendingPollId);
      state.strictPendingPollId = null;
    }
  };

  const renderStrictPendingRows = (items) => {
    const rows = Array.isArray(items) ? items : [];
    $("simPendingRows").innerHTML = rows
      .map(
        (item) => `<tr>
          <td class="mono">${escapeHtml(item.attemptId)}</td>
          <td>${escapeHtml(`${item.student?.nombres || ""} ${item.student?.apellidos || ""}`.trim())}</td>
          <td>${escapeHtml(`${item.student?.tipoIdentificacion || ""} ${item.student?.numeroIdentificacion || ""}`.trim())}</td>
          <td>${escapeHtml(item.exam?.nombre || "")}</td>
          <td>${escapeHtml(item.waitingMinutes ?? 0)}</td>
          <td>
            <div class="inline">
              <button class="btn warn" data-enable-attempt="${escapeHtml(item.attemptId)}">Habilitar J2</button>
              <button class="btn alt" data-stop-attempt="${escapeHtml(item.attemptId)}">Detener</button>
              <button class="btn" data-restart-attempt="${escapeHtml(item.attemptId)}">Reiniciar</button>
            </div>
          </td>
        </tr>`
      )
      .join("");
  };

  const loadPendingStrictAttempts = async ({ silent = false } = {}) => {
    const query = toQueryString({
      grado: $("simPendingGrade").value.trim(),
      grupo: $("simPendingGroup").value.trim(),
      limit: $("simPendingLimit").value.trim()
    });

    const response = await apiRequest(`/attempts/pending-session2${query}`);
    const data = response.data || {};
    renderStrictPendingRows(data.items || []);

    if (!silent) {
      setStatus("simPendingStatus", `Pendientes jornada 2: ${data.total ?? 0}`, data.total ? "warn" : "ok");
    }
  };

  const startStrictPendingAutoRefresh = () => {
    stopStrictPendingAutoRefresh();
    if (!state.strictPendingAutoRefresh || !state.token) return;

    state.strictPendingPollId = window.setInterval(async () => {
      try {
        await loadPendingStrictAttempts({ silent: true });
      } catch (error) {
        setStatus("simPendingStatus", `Auto-refresh pendientes: ${error.message}`, "warn");
      }
    }, 10000);
  };

  const updateStrictAutoButton = () => {
    $("simPendingAutoBtn").textContent = `Auto-refresh: ${state.strictPendingAutoRefresh ? "ON" : "OFF"}`;
  };

  const toggleStrictPendingAutoRefresh = () => {
    state.strictPendingAutoRefresh = !state.strictPendingAutoRefresh;
    updateStrictAutoButton();
    if (state.strictPendingAutoRefresh) {
      startStrictPendingAutoRefresh();
    } else {
      stopStrictPendingAutoRefresh();
    }
  };

  const login = async () => {
    try {
      const email = $("loginEmail").value.trim();
      const password = $("loginPassword").value;
      if (!email || !password) throw new Error("Debes ingresar email y password");
      const response = await apiRequest("/auth/login", { method: "POST", auth: false, body: { email, password } });
      const token = response?.data?.token;
      if (!token) throw new Error("Login sin token en respuesta");
      state.token = token;
      localStorage.setItem(TOKEN_KEY, token);
      setSessionUi();
      setStatus("loginStatus", "Sesion iniciada correctamente.", "ok");
      appendClientLog("INFO", "Sesion admin iniciada", { email });
      await Promise.all([loadDashboard(), loadExams(), listStudents(), listUsers(), loadPendingStrictAttempts()]);
      startStrictPendingAutoRefresh();
    } catch (error) {
      setStatus("loginStatus", error.message, "bad");
      appendClientLog("ERROR", "Error de login admin", error.message);
    }
  };

  const logout = () => {
    stopStrictPendingAutoRefresh();
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    setSessionUi();
    setStatus("loginStatus", "Sesion cerrada localmente.", "warn");
    appendClientLog("WARN", "Sesion admin cerrada localmente");
  };

  const renderKpis = (containerId, items) => {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = items
      .map((item) => `<div class="kpi"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`)
      .join("");
  };

  const renderBars = (containerId, rows) => {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = rows
      .map((row) => {
        const value = Number(row.percent || 0);
        const width = Math.max(0, Math.min(100, value));
        return `<div class="bar-row"><div>${escapeHtml(row.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><div>${width.toFixed(1)}%</div></div>`;
      })
      .join("");
  };

  const loadDashboard = async () => {
    try {
      const query = toQueryString({
        grado: $("dashGrado").value.trim(),
        from: $("dashFrom").value.trim(),
        to: $("dashTo").value.trim(),
        limit: 50
      });
      const response = await apiRequest(`/reports/dashboard/overview${query}`);
      const data = response.data || {};

      renderKpis("dashKpis", [
        { label: "Estudiantes", value: data.totalStudents ?? 0 },
        { label: "Pruebas", value: data.totalExams ?? 0 },
        { label: "Intentos", value: data.totalAttempts ?? 0 },
        { label: "Calificadas", value: data.totalGradedAttempts ?? 0 },
        { label: "Promedio %", value: data.averageGlobalPercentage ?? 0 }
      ]);

      renderBars(
        "dashAreaBars",
        (data.percentageByArea || []).map((row) => ({ label: row.area, percent: row.porcentajeAcierto }))
      );

      $("dashRows").innerHTML = (data.studentsWithLatestResults || [])
        .map((item) => {
          const student = item.estudiante || {};
          const result = item.ultimoResultado || {};
          return `<tr><td>${escapeHtml(`${student.nombres || ""} ${student.apellidos || ""}`.trim())}</td><td>${escapeHtml(student.numeroIdentificacion || "")}</td><td>${escapeHtml(result.prueba || "")}</td><td>${escapeHtml(result.porcentajeTotal ?? "-")}</td><td>${escapeHtml(result.nivelDesempenoGlobal || "-")}</td></tr>`;
        })
        .join("");
    } catch (error) {
      setStatus("loginStatus", `Dashboard: ${error.message}`, "warn");
    }
  };

  const resetStudentForm = () => {
    state.editingStudentId = null;
    $("stEditingId").value = "";
    $("stNombres").value = "";
    $("stApellidos").value = "";
    $("stTipo").value = "TI";
    $("stDocumento").value = "";
    $("stGrado").value = "11";
    $("stGrupo").value = "";
    $("stInstitucion").value = "";
    $("stDocumento").disabled = false;
    $("stCreateBtn").textContent = "Crear estudiante";
  };

  const fillStudentFormForEdit = (student) => {
    state.editingStudentId = student.id;
    $("stEditingId").value = student.id;
    $("stNombres").value = student.nombres || "";
    $("stApellidos").value = student.apellidos || "";
    $("stTipo").value = student.tipoIdentificacion || "TI";
    $("stDocumento").value = student.numeroIdentificacion || "";
    $("stGrado").value = student.grado || "";
    $("stGrupo").value = student.grupo || "";
    $("stInstitucion").value = student.institucion || "";
    $("stDocumento").disabled = true;
    $("stCreateBtn").textContent = "Guardar cambios";
    setStatus("stCreateStatus", `Editando ${student.numeroIdentificacion}`, "warn");
  };

  const collectStudentPayload = () =>
    cleanObject({
      nombres: $("stNombres").value.trim(),
      apellidos: $("stApellidos").value.trim(),
      tipo_identificacion: $("stTipo").value,
      numero_identificacion: $("stDocumento").value.trim(),
      grado: $("stGrado").value.trim(),
      grupo: $("stGrupo").value.trim(),
      institucion: $("stInstitucion").value.trim()
    });

  const saveStudent = async () => {
    try {
      const payload = collectStudentPayload();
      if (!payload.nombres || !payload.apellidos || !payload.grado) throw new Error("Nombres, apellidos y grado son obligatorios");

      if (state.editingStudentId) {
        const updatePayload = cleanObject({
          nombres: payload.nombres,
          apellidos: payload.apellidos,
          tipo_identificacion: payload.tipo_identificacion,
          grado: payload.grado,
          grupo: payload.grupo,
          institucion: payload.institucion
        });
        const response = await apiRequest(`/students/${state.editingStudentId}`, { method: "PATCH", body: updatePayload });
        setStatus("stCreateStatus", response.message || "Estudiante actualizado", "ok");
      } else {
        if (!payload.numero_identificacion || !payload.tipo_identificacion) throw new Error("Tipo y numero de identificacion son obligatorios");
        const response = await apiRequest("/students", { method: "POST", body: payload });
        setStatus("stCreateStatus", response.message || "Estudiante creado", "ok");
      }

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
        limit: 120
      });
      const response = await apiRequest(`/students${query}`);
      const data = response.data || {};
      state.students = data.items || [];
      setStatus("stListStatus", `Total: ${data.total ?? state.students.length}`, "ok");
      $("stListRows").innerHTML = state.students
        .map((student) => `<tr><td>${escapeHtml(student.numeroIdentificacion)}</td><td>${escapeHtml(`${student.nombres} ${student.apellidos}`)}</td><td>${escapeHtml(student.grado || "")}</td><td>${escapeHtml(student.grupo || "")}</td><td>${escapeHtml(student.institucion || "")}</td><td><div class="inline"><button class="btn alt" data-st-action="edit" data-st-id="${student.id}">Editar</button><button class="btn warn" data-st-action="delete" data-st-id="${student.id}">Eliminar</button></div></td></tr>`)
        .join("");
    } catch (error) {
      setStatus("stListStatus", error.message, "bad");
      $("stListRows").innerHTML = "";
    }
  };

  const handleStudentTableClick = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-st-action");
    const studentId = target.getAttribute("data-st-id");
    if (!action || !studentId) return;

    const student = state.students.find((item) => item.id === studentId);
    if (!student) {
      setStatus("stListStatus", "No se encontro el estudiante seleccionado", "bad");
      return;
    }

    if (action === "edit") {
      fillStudentFormForEdit(student);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(`Eliminar logicamente a ${student.nombres} ${student.apellidos}?`);
      if (!confirmed) return;
      try {
        await apiRequest(`/students/${studentId}`, { method: "DELETE" });
        setStatus("stListStatus", "Estudiante eliminado logicamente", "ok");
        if (state.editingStudentId === studentId) resetStudentForm();
        await listStudents();
      } catch (error) {
        setStatus("stListStatus", error.message, "bad");
      }
    }
  };
  const downloadStudentsTemplate = async () => {
    try {
      await downloadWithAuth("/students/bulk/template.csv", "students_bulk_template.csv");
      setStatus("stBulkStatus", "Plantilla descargada.", "ok");
    } catch (error) {
      setStatus("stBulkStatus", error.message, "bad");
    }
  };

  const uploadStudentsCsv = async () => {
    try {
      const file = $("stFile").files?.[0];
      if (!file) throw new Error("Selecciona un archivo CSV");
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

  const createUser = async () => {
    try {
      const payload = cleanObject({
        name: $("uNombre").value.trim(),
        email: $("uEmail").value.trim(),
        password: $("uPassword").value,
        role: $("uRol").value,
        is_active: $("uActivo").value === "true"
      });
      const response = await apiRequest("/users", { method: "POST", body: payload });
      setStatus("uStatus", response.message || "Usuario creado", "ok");
      await listUsers();
    } catch (error) {
      setStatus("uStatus", error.message, "bad");
    }
  };

  const listUsers = async () => {
    try {
      const response = await apiRequest("/users?limit=150");
      $("uOutput").textContent = pretty(response.data);
      setStatus("uStatus", `Usuarios: ${response.data?.total ?? 0}`, "ok");
    } catch (error) {
      setStatus("uStatus", error.message, "bad");
    }
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

  const renderExamOptions = (items) => {
    const select = $("simExamSelect");
    select.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin pruebas disponibles";
      select.appendChild(option);
      return;
    }

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.nombre} | ${item.tipoPrueba} | ${item.gradoObjetivo} | ${item.estado}`;
      select.appendChild(option);
    });
  };

  const loadExams = async () => {
    try {
      const query = toQueryString({
        tipo_prueba: $("simTipoFiltro").value.trim(),
        grado_objetivo: $("simGradoFiltro").value.trim(),
        limit: 200
      });
      const response = await apiRequest(`/exams${query}`);
      renderExamOptions(response.data?.items || []);
      setStatus("simStatus", `Pruebas cargadas: ${response.data?.total ?? 0}`, "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
      renderExamOptions([]);
    }
  };

  const renderSimulatorNav = () => {
    const nav = $("simNav");
    nav.innerHTML = "";
    state.simulator.questionDeck.forEach((question, index) => {
      const button = document.createElement("button");
      button.textContent = String(index + 1);
      if (index === state.simulator.currentIndex) button.classList.add("current");
      if (state.simulator.answersByQuestionId[question.questionId]) button.style.borderColor = "#59a884";
      button.addEventListener("click", () => {
        state.simulator.currentIndex = index;
        renderSimulatorQuestion();
      });
      nav.appendChild(button);
    });
  };

  const renderSimulatorQuestion = () => {
    const deck = state.simulator.questionDeck;
    if (!deck.length) {
      $("simQuestionTitle").textContent = "Pregunta";
      $("simQuestionBody").textContent = "Sin intento activo.";
      $("simOptions").innerHTML = "";
      $("simNav").innerHTML = "";
      return;
    }

    const current = deck[state.simulator.currentIndex];
    const total = deck.length;
    $("simQuestionTitle").textContent = `Pregunta ${state.simulator.currentIndex + 1} de ${total}`;

    const context = current.contextoTextoBase
      ? `<div><strong>Contexto:</strong> ${escapeHtml(current.contextoTextoBase)}</div>`
      : "";
    const meta = `<div style="margin-top:6px;font-size:12px;color:#55675d">Area: ${escapeHtml(current.area)} | Dificultad: ${escapeHtml(current.nivelDificultad)} | Competencia: ${escapeHtml(current.competencia)}</div>`;
    $("simQuestionBody").innerHTML = `${context}<div style="margin-top:8px">${escapeHtml(current.enunciado)}</div>${meta}`;

    const selectedId = state.simulator.answersByQuestionId[current.questionId] || current.selectedOptionId || null;
    $("simOptions").innerHTML = (current.options || [])
      .map((option) => {
        const selectedClass = option.id === selectedId ? " selected" : "";
        return `<label class="option-item${selectedClass}" data-opt-id="${option.id}"><input type="radio" name="simOption" value="${option.id}" ${option.id === selectedId ? "checked" : ""} /><div><strong>${escapeHtml(option.ordenPresentacion)}.</strong> ${escapeHtml(option.textoOpcion)}</div></label>`;
      })
      .join("");

    $("simOptions").querySelectorAll(".option-item").forEach((item) => {
      item.addEventListener("click", () => {
        const optionId = item.getAttribute("data-opt-id");
        if (!optionId) return;
        state.simulator.answersByQuestionId[current.questionId] = optionId;
        renderSimulatorQuestion();
      });
    });

    renderSimulatorNav();
  };

  const applySimulatorAttemptData = (data) => {
    state.simulator.attemptId = data.attempt?.id || null;
    state.simulator.questionDeck = Array.isArray(data.questionDeck)
      ? data.questionDeck.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];
    state.simulator.currentIndex = 0;
    state.simulator.answersByQuestionId = {};
    state.simulator.result = null;
    state.simulator.questionDeck.forEach((q) => {
      if (q.selectedOptionId) state.simulator.answersByQuestionId[q.questionId] = q.selectedOptionId;
    });

    $("simStrictAttemptId").value = state.simulator.attemptId || "";
    renderKpis("simKpis", []);
    renderBars("simAreaBars", []);
    $("simResultOutput").textContent = "{}";
    renderSimulatorQuestion();
  };

  const startSimulatorAttempt = async () => {
    try {
      const examId = $("simExamSelect").value;
      if (!examId) throw new Error("Selecciona una prueba");
      const student = collectSimulatorStudent();
      if (!student.nombres || !student.apellidos || !student.numero_identificacion || !student.grado) {
        throw new Error("Completa datos obligatorios del estudiante");
      }

      const response = await apiRequest("/attempts/start", {
        method: "POST",
        body: {
          prueba_id: examId,
          estudiante: student
        }
      });

      const data = response.data || {};
      applySimulatorAttemptData(data);
      setStatus("simStatus", `Intento iniciado: ${state.simulator.attemptId}`, "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const enableSessionTwoForAttempt = async () => {
    try {
      const attemptId = $("simStrictAttemptId").value.trim();
      if (!attemptId) throw new Error("Ingresa el attempt ID");
      const response = await apiRequest(`/attempts/${attemptId}/session2/enable`, { method: "POST" });
      $("simResultOutput").textContent = pretty(response.data || {});
      setStatus("simStrictStatus", "Jornada 2 habilitada correctamente.", "ok");
      await loadPendingStrictAttempts();
    } catch (error) {
      setStatus("simStrictStatus", error.message, "bad");
    }
  };

  const stopAttemptByIdAdmin = async (attemptId) => {
    if (!attemptId) {
      throw new Error("Ingresa el attempt ID");
    }

    const reason = window.prompt("Motivo para detener el intento (opcional):", "") || "";
    const response = await apiRequest(`/attempts/${attemptId}/stop`, {
      method: "POST",
      body: cleanObject({ motivo: reason })
    });
    $("simResultOutput").textContent = pretty(response.data || {});
    setStatus("simStrictStatus", "Intento detenido.", "ok");
    if (state.simulator.attemptId === attemptId) {
      state.simulator.attemptId = null;
      state.simulator.questionDeck = [];
      state.simulator.answersByQuestionId = {};
      state.simulator.currentIndex = 0;
      renderSimulatorQuestion();
    }
    await loadPendingStrictAttempts();
  };

  const restartAttemptByIdAdmin = async (attemptId) => {
    if (!attemptId) {
      throw new Error("Ingresa el attempt ID");
    }

    const reason = window.prompt("Motivo para reiniciar el intento (opcional):", "") || "";
    const response = await apiRequest(`/attempts/${attemptId}/restart`, {
      method: "POST",
      body: cleanObject({ motivo: reason })
    });
    const data = response.data || {};
    applySimulatorAttemptData(data);
    $("simResultOutput").textContent = pretty(data);
    setStatus("simStrictStatus", `Intento reiniciado. Nuevo ID: ${data.attempt?.id || "-"}`, "ok");
    await loadPendingStrictAttempts();
  };

  const findPendingStrictAttemptByStudent = async () => {
    try {
      const documentId = $("simStrictStudentDoc").value.trim();
      if (!documentId) throw new Error("Ingresa el documento del estudiante");

      const response = await apiRequest(`/attempts/student/${encodeURIComponent(documentId)}`);
      const items = Array.isArray(response.data?.items) ? response.data.items : [];

      if (!items.length) {
        throw new Error("El estudiante no tiene intentos registrados");
      }

      const getSessionControl = (attempt) => {
        const presentation = attempt?.presentacion;
        if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
        const sessionControl = presentation.sessionControl;
        if (!sessionControl || typeof sessionControl !== "object" || Array.isArray(sessionControl)) return null;
        return sessionControl;
      };

      const candidate =
        items.find((attempt) => {
          const sessionControl = getSessionControl(attempt);
          return (
            (attempt.estado === "PENDIENTE" || attempt.estado === "INICIADA") &&
            sessionControl?.strictMode === true &&
            sessionControl?.session2Enabled !== true
          );
        }) ??
        items.find((attempt) => attempt.estado === "PENDIENTE" || attempt.estado === "INICIADA") ??
        items[0];

      $("simStrictAttemptId").value = candidate?.id || "";
      setStatus(
        "simStrictStatus",
        candidate?.id
          ? `Intento seleccionado: ${candidate.id} (${candidate.estado})`
          : "No se encontro intento seleccionable",
        candidate?.id ? "ok" : "warn"
      );
    } catch (error) {
      setStatus("simStrictStatus", error.message, "bad");
    }
  };

  const handlePendingStrictTableClick = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const attemptId = target.getAttribute("data-enable-attempt");
    const stopAttemptId = target.getAttribute("data-stop-attempt");
    const restartAttemptId = target.getAttribute("data-restart-attempt");

    try {
      if (attemptId) {
        $("simStrictAttemptId").value = attemptId;
        await enableSessionTwoForAttempt();
        return;
      }

      if (stopAttemptId) {
        $("simStrictAttemptId").value = stopAttemptId;
        await stopAttemptByIdAdmin(stopAttemptId);
        return;
      }

      if (restartAttemptId) {
        $("simStrictAttemptId").value = restartAttemptId;
        await restartAttemptByIdAdmin(restartAttemptId);
      }
    } catch (error) {
      setStatus("simStrictStatus", error.message, "bad");
    }
  };

  const saveCurrentAnswer = async () => {
    try {
      if (!state.simulator.attemptId) throw new Error("No hay intento activo");
      const question = state.simulator.questionDeck[state.simulator.currentIndex];
      if (!question) throw new Error("No hay pregunta activa");
      const optionId = state.simulator.answersByQuestionId[question.questionId];
      if (!optionId) throw new Error("Selecciona una opcion antes de guardar");
      await apiRequest(`/attempts/${state.simulator.attemptId}/answer`, {
        method: "POST",
        body: {
          pregunta_id: question.questionId,
          opcion_id_seleccionada: optionId
        }
      });
      renderSimulatorNav();
      setStatus("simStatus", `Respuesta guardada para pregunta ${state.simulator.currentIndex + 1}`, "ok");
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const submitSimulatorAttempt = async () => {
    try {
      if (!state.simulator.attemptId) throw new Error("No hay intento activo");
      const confirmed = window.confirm("Enviar intento y calificar ahora?");
      if (!confirmed) return;

      const response = await apiRequest(`/attempts/${state.simulator.attemptId}/submit`, { method: "POST" });
      const data = response.data || {};
      state.simulator.result = data;

      renderKpis("simKpis", [
        { label: "Correctas", value: data.correctas ?? 0 },
        { label: "Incorrectas", value: data.incorrectas ?? 0 },
        { label: "Puntaje", value: data.puntajeTotalObtenido ?? 0 },
        { label: "Porcentaje", value: data.porcentajeTotal ?? 0 },
        { label: "Nivel", value: data.nivelDesempenoGlobal ?? "-" }
      ]);

      renderBars(
        "simAreaBars",
        (data.areaResults || []).map((row) => ({ label: row.area, percent: row.porcentajeArea }))
      );

      $("simResultOutput").textContent = pretty(data);
      setStatus("simStatus", "Intento enviado y calificado.", "ok");
      state.simulator.attemptId = null;
    } catch (error) {
      setStatus("simStatus", error.message, "bad");
    }
  };

  const goToPreviousQuestion = () => {
    if (!state.simulator.questionDeck.length) return;
    state.simulator.currentIndex = Math.max(0, state.simulator.currentIndex - 1);
    renderSimulatorQuestion();
  };

  const goToNextQuestion = () => {
    if (!state.simulator.questionDeck.length) return;
    state.simulator.currentIndex = Math.min(state.simulator.questionDeck.length - 1, state.simulator.currentIndex + 1);
    renderSimulatorQuestion();
  };
  const loadStudentReport = async () => {
    try {
      const documentId = $("repStudentDoc").value.trim();
      if (!documentId) throw new Error("Ingresa el documento");
      const query = toQueryString({ grado: $("repStudentGrado").value.trim() });
      const response = await apiRequest(`/reports/student/${encodeURIComponent(documentId)}/performance${query}`);
      $("repStudentOutput").textContent = pretty(response.data);
      setStatus("repStudentStatus", `Riesgo: ${response.data?.totals?.riskLevel || "N/A"}`, "ok");
    } catch (error) {
      setStatus("repStudentStatus", error.message, "bad");
      $("repStudentOutput").textContent = "{}";
    }
  };

  const downloadStudentReport = async (format) => {
    try {
      const documentId = $("repStudentDoc").value.trim();
      if (!documentId) throw new Error("Ingresa el documento");
      const query = toQueryString({ grado: $("repStudentGrado").value.trim() });
      const extension = format === "pdf" ? "pdf" : "csv";
      await downloadWithAuth(
        `/reports/student/${encodeURIComponent(documentId)}/performance/export.${extension}${query}`,
        `student_${documentId}_performance.${extension}`
      );
      setStatus("repStudentStatus", `Export ${extension.toUpperCase()} generado.`, "ok");
    } catch (error) {
      setStatus("repStudentStatus", error.message, "bad");
    }
  };

  const loadClassroomReport = async () => {
    try {
      const query = toQueryString({
        grado: $("repClassGrado").value.trim(),
        grupo: $("repClassGrupo").value.trim(),
        institucion: $("repClassInstitucion").value.trim(),
        limit: 3000
      });
      const response = await apiRequest(`/reports/classroom/summary${query}`);
      $("repClassOutput").textContent = pretty(response.data);
      setStatus("repClassStatus", `Estudiantes con intentos: ${response.data?.totals?.studentsWithAttempts ?? 0}`, "ok");
    } catch (error) {
      setStatus("repClassStatus", error.message, "bad");
      $("repClassOutput").textContent = "{}";
    }
  };

  const downloadClassroomReport = async (format) => {
    try {
      const query = toQueryString({
        grado: $("repClassGrado").value.trim(),
        grupo: $("repClassGrupo").value.trim(),
        institucion: $("repClassInstitucion").value.trim(),
        limit: 5000
      });
      const extension = format === "pdf" ? "pdf" : "csv";
      await downloadWithAuth(`/reports/classroom/summary/export.${extension}${query}`, `classroom_summary.${extension}`);
      setStatus("repClassStatus", `Export ${extension.toUpperCase()} generado.`, "ok");
    } catch (error) {
      setStatus("repClassStatus", error.message, "bad");
    }
  };

  const loadQuestionReadiness = async () => {
    try {
      const query = toQueryString({
        grado_objetivo: $("covGrade").value.trim(),
        target_per_area: $("covTarget").value.trim()
      });
      const response = await apiRequest(`/reports/questions/readiness${query}`);
      const rows = response.data?.byArea || [];
      $("covRows").innerHTML = rows
        .map((row) => `<tr><td>${escapeHtml(row.area)}</td><td>${escapeHtml(row.totalQuestions)}</td><td>${escapeHtml(row.target)}</td><td>${escapeHtml(row.deficit)}</td><td>${escapeHtml(row.coveragePercent ?? 0)}</td></tr>`)
        .join("");
      setStatus("covStatus", `Cobertura global: ${response.data?.totals?.overallCoveragePercent ?? 0}%`, "ok");
    } catch (error) {
      setStatus("covStatus", error.message, "bad");
      $("covRows").innerHTML = "";
    }
  };

  const loadMaterialCoverage = async () => {
    try {
      const response = await apiRequest("/reports/files/material-local/coverage");
      $("materialOutput").textContent = pretty(response.data);
      const totals = response.data?.totals || {};
      setStatus("materialStatus", `Assets: ${totals.totalAssets ?? 0} | Cobertura: ${totals.coveragePercent ?? "N/A"}%`, "ok");
    } catch (error) {
      setStatus("materialStatus", error.message, "bad");
      $("materialOutput").textContent = "{}";
    }
  };

  const downloadFilesCoverageCsv = async () => {
    try {
      await downloadWithAuth("/reports/files/coverage/export.csv", "files_coverage.csv");
      setStatus("materialStatus", "CSV de cobertura descargado.", "ok");
    } catch (error) {
      setStatus("materialStatus", error.message, "bad");
    }
  };

  const bindEvents = () => {
    $("loginBtn").addEventListener("click", login);
    $("logoutBtn").addEventListener("click", logout);

    $("dashLoadBtn").addEventListener("click", loadDashboard);

    $("stCreateBtn").addEventListener("click", saveStudent);
    $("stCancelEditBtn").addEventListener("click", resetStudentForm);
    $("stTemplateBtn").addEventListener("click", downloadStudentsTemplate);
    $("stBulkBtn").addEventListener("click", uploadStudentsCsv);
    $("stListBtn").addEventListener("click", listStudents);
    $("stListRows").addEventListener("click", handleStudentTableClick);

    $("uCreateBtn").addEventListener("click", createUser);
    $("uListBtn").addEventListener("click", listUsers);

    $("simLoadExamsBtn").addEventListener("click", loadExams);
    $("simStartBtn").addEventListener("click", startSimulatorAttempt);
    $("simFindStrictAttemptBtn").addEventListener("click", findPendingStrictAttemptByStudent);
    $("simEnableSession2Btn").addEventListener("click", enableSessionTwoForAttempt);
    $("simStopAttemptBtn").addEventListener("click", async () => {
      try {
        await stopAttemptByIdAdmin($("simStrictAttemptId").value.trim());
      } catch (error) {
        setStatus("simStrictStatus", error.message, "bad");
      }
    });
    $("simRestartAttemptBtn").addEventListener("click", async () => {
      try {
        await restartAttemptByIdAdmin($("simStrictAttemptId").value.trim());
      } catch (error) {
        setStatus("simStrictStatus", error.message, "bad");
      }
    });
    $("simPendingRefreshBtn").addEventListener("click", async () => {
      try {
        await loadPendingStrictAttempts();
      } catch (error) {
        setStatus("simPendingStatus", error.message, "bad");
      }
    });
    $("simPendingAutoBtn").addEventListener("click", toggleStrictPendingAutoRefresh);
    $("simPendingRows").addEventListener("click", handlePendingStrictTableClick);
    $("simPrevBtn").addEventListener("click", goToPreviousQuestion);
    $("simNextBtn").addEventListener("click", goToNextQuestion);
    $("simSaveBtn").addEventListener("click", saveCurrentAnswer);
    $("simSubmitBtn").addEventListener("click", submitSimulatorAttempt);

    $("repStudentBtn").addEventListener("click", loadStudentReport);
    $("repStudentCsvBtn").addEventListener("click", () => downloadStudentReport("csv"));
    $("repStudentPdfBtn").addEventListener("click", () => downloadStudentReport("pdf"));
    $("repClassBtn").addEventListener("click", loadClassroomReport);
    $("repClassCsvBtn").addEventListener("click", () => downloadClassroomReport("csv"));
    $("repClassPdfBtn").addEventListener("click", () => downloadClassroomReport("pdf"));

    $("covLoadBtn").addEventListener("click", loadQuestionReadiness);
    $("materialLoadBtn").addEventListener("click", loadMaterialCoverage);
    $("filesCsvBtn").addEventListener("click", downloadFilesCoverageCsv);
  };

  const bootstrap = async () => {
    initTabs();
    bindEvents();
    setSessionUi();
    appendClientLog("INFO", "Admin UI iniciada");
    updateStrictAutoButton();
    resetStudentForm();
    await loadConnectionInfo();

    if (state.token) {
      setStatus("loginStatus", "Sesion recuperada localmente.", "ok");
      await Promise.all([loadDashboard(), loadExams(), listStudents(), listUsers(), loadPendingStrictAttempts()]);
      startStrictPendingAutoRefresh();
    } else {
      setStatus("loginStatus", "Debes iniciar sesion.", "warn");
    }
  };

  bootstrap();
})();
