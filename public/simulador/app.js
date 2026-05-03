"use strict";

(() => {
  const state = {
    apiBase: `${window.location.origin}/api`,
    clientLogs: [],
    attemptId: null,
    questionDeck: [],
    currentIndex: 0,
    answersByQuestionId: {},
    result: null,
    sessionPlan: null,
    sessionControl: null,
    waitingForAdmin: false,
    waitPollIntervalId: null,
    timer: {
      intervalId: null,
      currentSessionIndex: -1,
      remainingSeconds: 0
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

  const setText = (elementId, text) => {
    const element = $(elementId);
    if (element) element.textContent = text ?? "";
  };

  const appendClientLog = (level, message, details) => {
    const timestamp = new Date().toISOString();
    const suffix = details ? ` | ${typeof details === "string" ? details : JSON.stringify(details)}` : "";
    const line = `[${timestamp}] [${level}] ${message}${suffix}`;
    state.clientLogs.unshift(line);
    if (state.clientLogs.length > 200) {
      state.clientLogs.length = 200;
    }
    const logBox = $("clientLogOut");
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
    const { method = "GET", body } = options;
    const headers = new Headers();
    let payloadBody = body;
    const startedAt = Date.now();

    if (body && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
      payloadBody = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${state.apiBase}${path}`, {
        method,
        headers,
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

    appendClientLog("INFO", `${method} ${path} -> ${response.status}`, { durationMs: Date.now() - startedAt });

    const payload = await response.json();
    if (payload?.meta?.requestId) {
      appendClientLog("INFO", `${method} ${path} requestId`, payload.meta.requestId);
    }
    return payload;
  };

  const renderKpis = (containerId, items) => {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = items
      .map(
        (item) =>
          `<div class="kpi"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(
            item.value
          )}</div></div>`
      )
      .join("");
  };

  const renderBars = (containerId, rows) => {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = rows
      .map((row) => {
        const value = Number(row.percent || 0);
        const width = Math.max(0, Math.min(100, value));
        return `<div class="bar-row"><div>${escapeHtml(row.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><div>${width.toFixed(
          1
        )}%</div></div>`;
      })
      .join("");
  };

  const formatDuration = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const getSessionPlan = () => state.sessionPlan;

  const getCurrentSession = () => {
    const plan = getSessionPlan();
    if (!plan || !Array.isArray(plan.sessions) || plan.sessions.length === 0) {
      return null;
    }

    const index = state.timer.currentSessionIndex;
    if (index < 0 || index >= plan.sessions.length) {
      return null;
    }

    return plan.sessions[index];
  };

  const getCurrentSessionBounds = () => {
    const session = getCurrentSession();
    if (!session) {
      return {
        minIndex: 0,
        maxIndex: Math.max(0, state.questionDeck.length - 1)
      };
    }

    return {
      minIndex: Math.max(0, session.questionStart - 1),
      maxIndex: Math.max(0, Math.min(state.questionDeck.length - 1, session.questionEnd - 1))
    };
  };

  const clampIndexToCurrentSession = () => {
    const bounds = getCurrentSessionBounds();
    if (state.currentIndex < bounds.minIndex) state.currentIndex = bounds.minIndex;
    if (state.currentIndex > bounds.maxIndex) state.currentIndex = bounds.maxIndex;
  };

  const renderTimerPanel = () => {
    const session = getCurrentSession();
    if (!session) {
      setText("sessionLabel", "Jornada: Sin jornada activa");
      setText("sessionRange", "Preguntas: -");
      setText("sessionTime", "Tiempo de jornada: -");
      setText("timerMain", "--:--");
      setText("timerHint", "El cronometro se activa al iniciar.");
      return;
    }

    setText("sessionLabel", `Jornada activa: ${session.label}`);
    setText("sessionRange", `Preguntas ${session.questionStart} a ${session.questionEnd} (total ${session.questionCount})`);
    setText("sessionTime", `Tiempo jornada: ${session.durationMinutes} minutos`);
    setText("timerMain", state.waitingForAdmin ? "--:--" : formatDuration(state.timer.remainingSeconds));

    if (state.waitingForAdmin) {
      setText("timerHint", "Jornada 1 finalizada. Esperando habilitacion de jornada 2 por administrador.");
      return;
    }

    if (state.timer.remainingSeconds <= 300) {
      setText("timerHint", "Quedan menos de 5 minutos en esta jornada.");
    } else {
      setText("timerHint", session.description || "");
    }
  };

  const stopTimer = () => {
    if (state.timer.intervalId) {
      window.clearInterval(state.timer.intervalId);
      state.timer.intervalId = null;
    }
  };

  const stopAdminWaitPolling = () => {
    if (state.waitPollIntervalId) {
      window.clearInterval(state.waitPollIntervalId);
      state.waitPollIntervalId = null;
    }
  };

  const isStrictMode = () => state.sessionControl?.strictMode === true && state.sessionPlan?.mode === "SABER11_DOS_JORNADAS";

  const markWaitingForAdmin = () => {
    state.waitingForAdmin = true;
    stopTimer();
    state.timer.remainingSeconds = 0;
    state.timer.currentSessionIndex = Math.max(1, state.timer.currentSessionIndex);
    renderTimerPanel();
    renderQuestionNav();
    setStatus(
      "startStatus",
      "Jornada 1 finalizada. Debes esperar que el administrador habilite la jornada 2.",
      "warn"
    );
  };

  const unlockSessionTwoFromServerState = () => {
    if (!state.sessionControl?.session2Enabled) return false;
    if (!state.waitingForAdmin) return false;

    state.waitingForAdmin = false;
    stopAdminWaitPolling();
    const nextSessionIndex =
      typeof state.sessionControl.currentSessionIndex === "number"
        ? state.sessionControl.currentSessionIndex
        : 1;

    setStatus("startStatus", "Jornada 2 habilitada por el administrador. Puedes continuar.", "ok");
    startSessionTimer(Math.max(nextSessionIndex, 1));
    return true;
  };

  const refreshAttemptState = async ({ silent = false } = {}) => {
    if (!state.attemptId) {
      if (!silent) {
        setStatus("startStatus", "No hay intento activo para actualizar", "warn");
      }
      return null;
    }

    const response = await apiRequest(`/attempts/public/${state.attemptId}`);
    const data = response.data || {};
    if (data.sessionPlan) {
      state.sessionPlan = data.sessionPlan;
    }
    if (data.sessionControl) {
      state.sessionControl = data.sessionControl;
    }
    return data;
  };

  const startAdminWaitPolling = () => {
    stopAdminWaitPolling();

    state.waitPollIntervalId = window.setInterval(async () => {
      try {
        await refreshAttemptState({ silent: true });
        unlockSessionTwoFromServerState();
      } catch (error) {
        setStatus("startStatus", `Esperando habilitacion de jornada 2: ${error.message}`, "warn");
      }
    }, 10000);
  };

  const completeSessionOneAndWaitAdmin = async () => {
    if (!state.attemptId) return;

    try {
      const response = await apiRequest(`/attempts/public/${state.attemptId}/session1/complete`, {
        method: "POST"
      });
      const data = response.data || {};
      if (data.sessionControl) {
        state.sessionControl = data.sessionControl;
      }
      if (data.sessionPlan) {
        state.sessionPlan = data.sessionPlan;
      }
      markWaitingForAdmin();
      startAdminWaitPolling();
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const startSessionTimer = (sessionIndex) => {
    const plan = getSessionPlan();
    if (!plan || !plan.sessions?.[sessionIndex]) {
      return;
    }

    state.waitingForAdmin = false;
    stopAdminWaitPolling();
    stopTimer();
    state.timer.currentSessionIndex = sessionIndex;
    state.timer.remainingSeconds = Math.max(1, Number(plan.sessions[sessionIndex].durationMinutes || 1) * 60);
    clampIndexToCurrentSession();
    renderTimerPanel();
    renderQuestionNav();
    renderCurrentQuestion();

    state.timer.intervalId = window.setInterval(async () => {
      state.timer.remainingSeconds -= 1;
      if (state.timer.remainingSeconds <= 0) {
        state.timer.remainingSeconds = 0;
        renderTimerPanel();
        stopTimer();

        const nextSessionIndex = sessionIndex + 1;
        if (nextSessionIndex < plan.sessions.length) {
          if (isStrictMode() && sessionIndex === 0 && !state.sessionControl?.session2Enabled) {
            await completeSessionOneAndWaitAdmin();
            return;
          }

          setStatus(
            "startStatus",
            `${plan.sessions[sessionIndex].label} finalizada. Inicia ${plan.sessions[nextSessionIndex].label}.`,
            "warn"
          );
          startSessionTimer(nextSessionIndex);
          return;
        }

        setStatus("startStatus", "Tiempo total finalizado. Enviando intento automaticamente...", "warn");
        await submitAttempt(true);
        return;
      }

      renderTimerPanel();
    }, 1000);
  };

  const applySessionPlan = (incomingPlan, fallbackExam) => {
    if (incomingPlan && Array.isArray(incomingPlan.sessions) && incomingPlan.sessions.length > 0) {
      state.sessionPlan = incomingPlan;
      return;
    }

    const totalQuestions = state.questionDeck.length;
    const totalMinutes = Math.max(Number(fallbackExam?.tiempoLimiteMinutos || 120), 1);
    state.sessionPlan = {
      mode: "SIMPLE",
      totalQuestions,
      totalMinutes,
      sessions: [
        {
          id: "S1",
          label: "Sesion unica",
          questionStart: 1,
          questionEnd: totalQuestions,
          questionCount: totalQuestions,
          durationMinutes: totalMinutes,
          suggestedStart: null,
          suggestedEnd: null,
          description: "Simulacion en sesion unica."
        }
      ]
    };
  };

  const showRegisterPanel = (show) => {
    const panel = $("registerPanel");
    if (!panel) return;
    if (show) panel.classList.remove("hidden");
    else panel.classList.add("hidden");
  };

  const collectRegisteredLookupPayload = () =>
    cleanObject({
      tipo_identificacion: $("stTipo").value,
      numero_identificacion: $("stDocumento").value.trim()
    });

  const collectRegistrationPayload = () =>
    cleanObject({
      ...collectRegisteredLookupPayload(),
      nombres: $("stNombres").value.trim(),
      apellidos: $("stApellidos").value.trim(),
      grado: $("stGrado").value.trim(),
      grupo: $("stGrupo").value.trim(),
      institucion: $("stInstitucion").value.trim()
    });

  const loadConnectionInfo = async () => {
    try {
      const response = await fetch("/connection-info");
      if (!response.ok) throw new Error(`No se pudo leer /connection-info (${response.status})`);
      const payload = await response.json();
      const data = payload?.data || {};

      setText("apiText", state.apiBase);
      const lanUrls = data.sharedLanUrls?.length ? data.sharedLanUrls : data.lanUrls || [];
      setText("lanText", lanUrls.length ? lanUrls.join(" | ") : "sin URLs LAN detectadas");
      appendClientLog("INFO", "connection-info loaded", {
        apiBase: state.apiBase,
        lanUrls: lanUrls.length
      });
    } catch (error) {
      setText("apiText", state.apiBase);
      setText("lanText", `sin datos (${error.message})`);
      appendClientLog("WARN", "connection-info unavailable", error.message);
    }
  };

  const renderExamOptions = (items) => {
    const select = $("examSelect");
    select.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin pruebas disponibles";
      select.appendChild(option);
      $("examInfo").value = "No hay pruebas configuradas";
      return;
    }

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.nombre} | ${item.tipoPrueba} | ${item.gradoObjetivo}`;
      option.dataset.examInfo = `${item.tipoPrueba} | Grado ${item.gradoObjetivo} | ${item.totalPreguntas} preguntas`;
      select.appendChild(option);
    });

    const firstOption = select.options[0];
    $("examInfo").value = firstOption?.dataset.examInfo || "Prueba seleccionada";
  };

  const loadExams = async () => {
    try {
      const preferredQuery = toQueryString({
        tipo_prueba: "SABER_11",
        grado_objetivo: "11",
        limit: 200
      });
      let response = await apiRequest(`/exams/public${preferredQuery}`);
      let items = response.data?.items || [];

      if (!items.length) {
        response = await apiRequest("/exams/public?limit=200");
        items = response.data?.items || [];
      }

      renderExamOptions(items);
      setStatus("startStatus", `Pruebas cargadas: ${items.length}`, items.length ? "ok" : "warn");
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
      renderExamOptions([]);
    }
  };

  const renderQuestionNav = () => {
    const nav = $("qNav");
    nav.innerHTML = "";
    const bounds = getCurrentSessionBounds();

    state.questionDeck.forEach((question, index) => {
      const button = document.createElement("button");
      button.textContent = String(index + 1);
      if (index === state.currentIndex) button.classList.add("current");

      const waitingBlocked = state.waitingForAdmin;
      const outOfSession = index < bounds.minIndex || index > bounds.maxIndex;
      if (outOfSession || waitingBlocked) {
        button.disabled = true;
        button.style.opacity = "0.45";
      }

      if (state.answersByQuestionId[question.questionId]) {
        button.style.borderColor = "#63b58f";
      }

      button.addEventListener("click", () => {
        if (outOfSession) return;
        state.currentIndex = index;
        renderCurrentQuestion();
      });

      nav.appendChild(button);
    });
  };

  const renderCurrentQuestion = () => {
    if (!state.questionDeck.length) {
      setText("questionTitle", "Pregunta");
      setText("questionBody", "Sin intento activo.");
      $("options").innerHTML = "";
      $("qNav").innerHTML = "";
      return;
    }

    clampIndexToCurrentSession();

    const question = state.questionDeck[state.currentIndex];
    const total = state.questionDeck.length;
    setText("questionTitle", `Pregunta ${state.currentIndex + 1} de ${total}`);

    const context = question.contextoTextoBase
      ? `<div><strong>Contexto:</strong> ${escapeHtml(question.contextoTextoBase)}</div>`
      : "";

    const meta = `<div style="margin-top:6px;font-size:12px;color:#567265">Area: ${escapeHtml(
      question.area
    )} | Dificultad: ${escapeHtml(question.nivelDificultad)} | Competencia: ${escapeHtml(question.competencia)}</div>`;

    $("questionBody").innerHTML = `${context}<div style="margin-top:8px">${escapeHtml(
      question.enunciado
    )}</div>${meta}`;

    const selectedOption = state.answersByQuestionId[question.questionId] || question.selectedOptionId || null;
    const disableOptions = state.waitingForAdmin;
    $("options").innerHTML = (question.options || [])
      .map((option) => {
        const selectedClass = option.id === selectedOption ? " selected" : "";
        return `<label class="option-item${selectedClass}" data-opt-id="${option.id}"><input type="radio" name="option" value="${option.id}" ${
          disableOptions ? "disabled" : ""
        } ${
          option.id === selectedOption ? "checked" : ""
        } /><div><strong>${escapeHtml(option.ordenPresentacion)}.</strong> ${escapeHtml(
          option.textoOpcion
        )}</div></label>`;
      })
      .join("");

    if (state.waitingForAdmin) {
      $("questionBody").innerHTML +=
        '<div class="status warn" style="margin-top:8px">Jornada bloqueada hasta habilitacion del administrador.</div>';
    }

    $("options").querySelectorAll(".option-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (state.waitingForAdmin) return;
        const optionId = item.getAttribute("data-opt-id");
        if (!optionId) return;
        state.answersByQuestionId[question.questionId] = optionId;
        renderCurrentQuestion();
      });
    });

    renderQuestionNav();
  };

  const resetAttemptUi = () => {
    stopTimer();
    stopAdminWaitPolling();
    state.attemptId = null;
    state.questionDeck = [];
    state.currentIndex = 0;
    state.answersByQuestionId = {};
    state.result = null;
    state.sessionPlan = null;
    state.sessionControl = null;
    state.waitingForAdmin = false;
    state.timer.currentSessionIndex = -1;
    state.timer.remainingSeconds = 0;

    renderKpis("resultKpis", []);
    renderBars("resultBars", []);
    $("resultOut").textContent = "{}";
    renderCurrentQuestion();
    renderTimerPanel();
    setText("policyText", "Sin intento activo");
  };

  const applyAttemptData = (data) => {
    state.attemptId = data.attempt?.id || null;
    state.questionDeck = Array.isArray(data.questionDeck)
      ? data.questionDeck.slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      : [];
    state.currentIndex = 0;
    state.answersByQuestionId = {};
    state.result = null;

    state.questionDeck.forEach((question) => {
      if (question.selectedOptionId) {
        state.answersByQuestionId[question.questionId] = question.selectedOptionId;
      }
    });

    applySessionPlan(data.sessionPlan, data.attempt?.prueba);
    state.sessionControl = data.sessionControl || null;
    state.waitingForAdmin = false;
    stopAdminWaitPolling();
    setText("policyText", "Preguntas aleatorias, opciones aleatorias y no repeticion por estudiante");

    renderKpis("resultKpis", []);
    renderBars("resultBars", []);
    $("resultOut").textContent = "{}";
  };

  const startAttemptWithPayload = async (examId, bodyPayload) => {
    const response = await apiRequest("/attempts/public/start", {
      method: "POST",
      body: {
        prueba_id: examId,
        ...bodyPayload
      }
    });

    const data = response.data || {};
    applyAttemptData(data);

    const planMode = state.sessionPlan?.mode === "SABER11_DOS_JORNADAS" ? "2 jornadas tipo Saber 11" : "sesion unica";
    setStatus("startStatus", `Intento iniciado (${planMode}).`, "ok");

    const startSessionIndex =
      typeof state.sessionControl?.currentSessionIndex === "number" ? state.sessionControl.currentSessionIndex : 0;

    if (isStrictMode() && startSessionIndex > 0 && !state.sessionControl?.session2Enabled) {
      markWaitingForAdmin();
      startAdminWaitPolling();
      return;
    }

    startSessionTimer(Math.max(0, startSessionIndex));
  };

  const startAttempt = async () => {
    try {
      const examId = $("examSelect").value;
      if (!examId) throw new Error("Selecciona una prueba");

      const lookupPayload = collectRegisteredLookupPayload();
      if (!lookupPayload.numero_identificacion) throw new Error("Ingresa tu numero de identificacion");

      const registerPanelVisible = !$("registerPanel").classList.contains("hidden");
      if (registerPanelVisible) {
        const fullRegistration = collectRegistrationPayload();
        if (!fullRegistration.nombres || !fullRegistration.apellidos || !fullRegistration.grado) {
          throw new Error("Completa nombres, apellidos y grado para registrarte");
        }

        await startAttemptWithPayload(examId, {
          estudiante: fullRegistration
        });
        showRegisterPanel(false);
        return;
      }

      try {
        await startAttemptWithPayload(examId, {
          estudiante_registrado: lookupPayload
        });
      } catch (error) {
        if (error.code === "STUDENT_NOT_REGISTERED") {
          showRegisterPanel(true);
          setStatus(
            "startStatus",
            "No estas registrado. Completa el formulario de registro y vuelve a presionar Iniciar simulacion.",
            "warn"
          );
          return;
        }
        throw error;
      }
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const saveAnswer = async () => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo");
      if (state.waitingForAdmin) {
        throw new Error("Jornada 2 bloqueada. Espera habilitacion del administrador.");
      }

      const question = state.questionDeck[state.currentIndex];
      if (!question) throw new Error("No hay pregunta activa");

      const optionId = state.answersByQuestionId[question.questionId];
      if (!optionId) throw new Error("Selecciona una opcion antes de guardar");

      await apiRequest(`/attempts/public/${state.attemptId}/answer`, {
        method: "POST",
        body: {
          pregunta_id: question.questionId,
          opcion_id_seleccionada: optionId
        }
      });

      setStatus("startStatus", `Respuesta guardada en pregunta ${state.currentIndex + 1}`, "ok");
      renderQuestionNav();
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const submitAttempt = async (automatic = false) => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo");
      if (state.waitingForAdmin) {
        throw new Error("No puedes enviar aun: jornada 2 sigue bloqueada por administrador.");
      }

      if (!automatic) {
        const confirmed = window.confirm("Enviar intento y calcular resultado?");
        if (!confirmed) return;
      }

      stopTimer();

      const response = await apiRequest(`/attempts/public/${state.attemptId}/submit`, {
        method: "POST"
      });

      const data = response.data || {};
      state.result = data;

      renderKpis("resultKpis", [
        { label: "Correctas", value: data.correctas ?? 0 },
        { label: "Incorrectas", value: data.incorrectas ?? 0 },
        { label: "Puntaje", value: data.puntajeTotalObtenido ?? 0 },
        { label: "Porcentaje", value: data.porcentajeTotal ?? 0 },
        { label: "Nivel", value: data.nivelDesempenoGlobal ?? "-" }
      ]);

      renderBars(
        "resultBars",
        (data.areaResults || []).map((row) => ({
          label: row.area,
          percent: row.porcentajeArea
        }))
      );

      $("resultOut").textContent = pretty(data);
      setText("policyText", "Intento finalizado");
      setStatus("startStatus", automatic ? "Tiempo finalizado. Intento enviado automaticamente." : "Intento enviado y calificado.", "ok");

      state.attemptId = null;
      state.sessionControl = null;
      state.waitingForAdmin = false;
      stopAdminWaitPolling();
      state.timer.currentSessionIndex = -1;
      state.timer.remainingSeconds = 0;
      renderTimerPanel();
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const stopAttempt = async () => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo");

      const confirmed = window.confirm("Detener la prueba actual? Esta accion anula el intento en curso.");
      if (!confirmed) return;

      const reason = window.prompt("Motivo de detencion (opcional):", "") || "";
      const response = await apiRequest(`/attempts/public/${state.attemptId}/stop`, {
        method: "POST",
        body: cleanObject({ motivo: reason })
      });
      const data = response.data || {};
      appendClientLog("WARN", "Intento detenido por usuario", data);
      setStatus("startStatus", "Prueba detenida correctamente.", "warn");
      $("resultOut").textContent = pretty({
        stopped: data
      });
      resetAttemptUi();
      showRegisterPanel(false);
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const restartAttempt = async () => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo para reiniciar");

      const confirmed = window.confirm(
        "Reiniciar la prueba? Se anula el intento actual y se crea un intento nuevo."
      );
      if (!confirmed) return;

      const reason = window.prompt("Motivo de reinicio (opcional):", "") || "";
      const response = await apiRequest(`/attempts/public/${state.attemptId}/restart`, {
        method: "POST",
        body: cleanObject({ motivo: reason })
      });
      const data = response.data || {};
      applyAttemptData(data);

      const planMode = state.sessionPlan?.mode === "SABER11_DOS_JORNADAS" ? "2 jornadas tipo Saber 11" : "sesion unica";
      setStatus("startStatus", `Prueba reiniciada (${planMode}).`, "ok");

      const startSessionIndex =
        typeof state.sessionControl?.currentSessionIndex === "number" ? state.sessionControl.currentSessionIndex : 0;
      if (isStrictMode() && startSessionIndex > 0 && !state.sessionControl?.session2Enabled) {
        markWaitingForAdmin();
        startAdminWaitPolling();
        return;
      }

      startSessionTimer(Math.max(0, startSessionIndex));
    } catch (error) {
      setStatus("startStatus", error.message, "bad");
    }
  };

  const prevQuestion = () => {
    if (!state.questionDeck.length) return;
    if (state.waitingForAdmin) return;
    const bounds = getCurrentSessionBounds();
    state.currentIndex = Math.max(bounds.minIndex, state.currentIndex - 1);
    renderCurrentQuestion();
  };

  const nextQuestion = () => {
    if (!state.questionDeck.length) return;
    if (state.waitingForAdmin) return;
    const bounds = getCurrentSessionBounds();
    state.currentIndex = Math.min(bounds.maxIndex, state.currentIndex + 1);
    renderCurrentQuestion();
  };

  const bindEvents = () => {
    $("loadExamsBtn").addEventListener("click", loadExams);
    $("refreshAttemptBtn").addEventListener("click", async () => {
      try {
        const data = await refreshAttemptState();
        if (!data) return;
        renderTimerPanel();
        renderQuestionNav();
        if (!unlockSessionTwoFromServerState()) {
          setStatus(
            "startStatus",
            state.waitingForAdmin
              ? "Sigue bloqueada la jornada 2. Espera habilitacion del administrador."
              : "Estado del intento actualizado.",
            state.waitingForAdmin ? "warn" : "ok"
          );
        }
      } catch (error) {
        setStatus("startStatus", error.message, "bad");
      }
    });
    $("startBtn").addEventListener("click", startAttempt);
    $("saveBtn").addEventListener("click", saveAnswer);
    $("submitBtn").addEventListener("click", () => submitAttempt(false));
    $("stopBtn").addEventListener("click", stopAttempt);
    $("restartBtn").addEventListener("click", restartAttempt);
    $("prevBtn").addEventListener("click", prevQuestion);
    $("nextBtn").addEventListener("click", nextQuestion);
    $("examSelect").addEventListener("change", () => {
      const selected = $("examSelect").selectedOptions?.[0];
      $("examInfo").value = selected?.dataset?.examInfo || "Prueba seleccionada";
    });
  };

  const bootstrap = async () => {
    appendClientLog("INFO", "Simulador UI iniciada");
    showRegisterPanel(false);
    bindEvents();
    resetAttemptUi();
    await loadConnectionInfo();
    await loadExams();
  };

  bootstrap();
})();
