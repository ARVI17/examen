"use strict";

(() => {
  const TOKEN_KEY = "s11_student_token";

  const state = {
    apiBase: `${window.location.origin}/api`,
    token: localStorage.getItem(TOKEN_KEY) || "",
    student: null,
    exams: [],
    attemptId: null,
    questionDeck: [],
    currentIndex: 0,
    answersByQuestionId: {},
    sessionPlan: null,
    sessionControl: null,
    waitingForAdmin: false,
    resultsHistory: [],
    timer: {
      intervalId: null,
      sessionIndex: -1,
      remainingSeconds: 0
    },
    pollIntervalId: null
  };

  const $ = (id) => document.getElementById(id);

  const setStatus = (id, message, tone = "warn") => {
    const node = $(id);
    if (!node) return;
    node.textContent = message;
    node.className = `status ${tone}`;
  };

  const setText = (id, value) => {
    const node = $(id);
    if (node) {
      node.textContent = value || "";
    }
  };

  const setButtonLoading = (id, loading, loadingText = "Procesando...") => {
    const button = $(id);
    if (!button) return;
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent || "";
    }
    button.disabled = loading;
    button.textContent = loading ? loadingText : button.dataset.defaultText;
  };

  const saveToken = (token) => {
    state.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  };

  const clearToken = () => {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
  };

  const toDuration = (seconds) => {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const remain = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  };

  const apiRequest = async (path, options = {}) => {
    const { method = "GET", body, auth = true } = options;
    const headers = new Headers();
    if (auth && state.token) {
      headers.set("Authorization", `Bearer ${state.token}`);
    }

    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${state.apiBase}${path}`, {
      method,
      headers,
      body: payload
    });

    if (response.status === 401 && auth) {
      logout(false);
      throw new Error("Sesion expirada. Inicia sesion nuevamente.");
    }

    if (!response.ok) {
      let message = `Error HTTP ${response.status}`;
      let code = "HTTP_ERROR";
      let details = null;
      try {
        const errorPayload = await response.json();
        message = errorPayload?.error?.message || errorPayload?.message || message;
        code = errorPayload?.error?.code || code;
        details = errorPayload?.error?.details ?? null;
      } catch {
        // no-op
      }

      if (code === "AUTH_RATE_LIMITED" || code === "AUTH_TEMPORARILY_BLOCKED" || response.status === 429) {
        const retryAfter = Number(details?.retryAfterSeconds ?? 0);
        if (retryAfter > 0) {
          message = `Demasiados intentos. Reintenta en ${retryAfter}s.`;
        } else {
          message = "Demasiados intentos. Espera un momento e intenta de nuevo.";
        }
      }

      throw new Error(message);
    }

    return response.json();
  };

  const showView = ({ login, portal }) => {
    $("loginView")?.classList.toggle("hidden", !login);
    $("portalView")?.classList.toggle("hidden", !portal);
  };

  const stopTimer = () => {
    if (state.timer.intervalId) {
      window.clearInterval(state.timer.intervalId);
      state.timer.intervalId = null;
    }
  };

  const stopPolling = () => {
    if (state.pollIntervalId) {
      window.clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
    }
  };

  const resetAttempt = () => {
    stopTimer();
    stopPolling();
    state.attemptId = null;
    state.questionDeck = [];
    state.currentIndex = 0;
    state.answersByQuestionId = {};
    state.sessionPlan = null;
    state.sessionControl = null;
    state.waitingForAdmin = false;
    state.timer.sessionIndex = -1;
    state.timer.remainingSeconds = 0;
    $("attemptView")?.classList.add("hidden");
    setText("timerText", "Tiempo: --:--");
    setText("progressText", "Progreso: 0/0");
    setText("sessionText", "Sesion: -");
  };

  const renderExamOptions = (items) => {
    const select = $("examSelect");
    if (!select) return;

    select.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin simulacros disponibles";
      select.appendChild(option);
      setText("examInfo", "No hay simulacros activos para tu perfil.");
      return;
    }

    items.forEach((exam) => {
      const option = document.createElement("option");
      option.value = exam.id;
      option.textContent = `${exam.nombre} | ${exam.tipoPrueba}`;
      option.dataset.info = `${exam.totalPreguntas} preguntas | ${exam.tiempoLimiteMinutos} min | Grado ${exam.gradoObjetivo}`;
      select.appendChild(option);
    });

    setText("examInfo", select.options[0]?.dataset.info || "");
  };

  const getCurrentSession = () => {
    const sessions = state.sessionPlan?.sessions;
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    if (state.timer.sessionIndex < 0 || state.timer.sessionIndex >= sessions.length) return null;
    return sessions[state.timer.sessionIndex];
  };

  const getSessionBounds = () => {
    const session = getCurrentSession();
    if (!session) {
      return { min: 0, max: Math.max(0, state.questionDeck.length - 1) };
    }

    return {
      min: Math.max(0, session.questionStart - 1),
      max: Math.max(0, Math.min(state.questionDeck.length - 1, session.questionEnd - 1))
    };
  };

  const clampCurrentIndex = () => {
    const bounds = getSessionBounds();
    if (state.currentIndex < bounds.min) state.currentIndex = bounds.min;
    if (state.currentIndex > bounds.max) state.currentIndex = bounds.max;
  };

  const renderQuestionNav = () => {
    const nav = $("questionNav");
    if (!nav) return;

    nav.innerHTML = "";
    const bounds = getSessionBounds();

    state.questionDeck.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);
      const outOfSession = index < bounds.min || index > bounds.max;
      if (index === state.currentIndex) {
        button.classList.add("current");
      }
      if (state.answersByQuestionId[question.questionId]) {
        button.style.borderColor = "#93c5fd";
      }
      if (outOfSession || state.waitingForAdmin) {
        button.disabled = true;
      }
      button.addEventListener("click", () => {
        if (outOfSession || state.waitingForAdmin) return;
        state.currentIndex = index;
        renderCurrentQuestion();
      });
      nav.appendChild(button);
    });
  };

  const renderCurrentQuestion = () => {
    if (!state.questionDeck.length) {
      setText("questionTitle", "Pregunta");
      setText("questionContext", "");
      const body = $("questionBody");
      if (body) body.textContent = "No hay intento activo.";
      const options = $("questionOptions");
      if (options) options.innerHTML = "";
      return;
    }

    clampCurrentIndex();
    const question = state.questionDeck[state.currentIndex];
    const selectedId = state.answersByQuestionId[question.questionId] || question.selectedOptionId || null;
    const responded = Object.keys(state.answersByQuestionId).length;

    setText("questionTitle", `Pregunta ${state.currentIndex + 1} de ${state.questionDeck.length}`);
    setText(
      "questionContext",
      question.contextoTextoBase
        ? `Contexto: ${question.contextoTextoBase}`
        : `Area: ${question.area} | Dificultad: ${question.nivelDificultad}`
    );

    const body = $("questionBody");
    if (body) {
      body.textContent = question.enunciado || "";
    }

    setText("progressText", `Progreso: ${responded}/${state.questionDeck.length}`);

    const optionsHtml = (question.options || [])
      .map((option) => {
        const selected = selectedId === option.id ? " selected" : "";
        return `<label class="option${selected}" data-id="${option.id}">
          <input type="radio" name="question_option" value="${option.id}" ${selectedId === option.id ? "checked" : ""} ${
          state.waitingForAdmin ? "disabled" : ""
        } />
          <div><strong>${option.ordenPresentacion}.</strong> ${option.textoOpcion}</div>
        </label>`;
      })
      .join("");

    const optionsContainer = $("questionOptions");
    if (optionsContainer) {
      optionsContainer.innerHTML = optionsHtml;
      optionsContainer.querySelectorAll(".option").forEach((node) => {
        node.addEventListener("click", () => {
          if (state.waitingForAdmin) return;
          const id = node.getAttribute("data-id");
          if (!id) return;
          state.answersByQuestionId[question.questionId] = id;
          renderCurrentQuestion();
        });
      });
    }

    renderQuestionNav();
  };

  const applySessionPlan = (incomingPlan, fallbackExam) => {
    if (incomingPlan?.sessions?.length) {
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
          durationMinutes: totalMinutes
        }
      ]
    };
  };

  const renderTimerPanel = () => {
    if (!state.sessionPlan) {
      setText("timerText", "Tiempo: --:--");
      setText("sessionText", "Sesion: -");
      return;
    }

    const currentSession = getCurrentSession();
    if (!currentSession) {
      setText("sessionText", "Sesion: -");
      setText("timerText", "Tiempo: --:--");
      return;
    }

    setText("sessionText", `Sesion: ${currentSession.label}`);
    setText("timerText", state.waitingForAdmin ? "Tiempo: --:--" : `Tiempo: ${toDuration(state.timer.remainingSeconds)}`);
  };

  const refreshAttempt = async ({ silent = false } = {}) => {
    if (!state.attemptId) return null;
    const payload = await apiRequest(`/student/attempts/${state.attemptId}`);
    const data = payload.data || {};
    state.sessionControl = data.sessionControl || state.sessionControl;
    state.sessionPlan = data.sessionPlan || state.sessionPlan;

    if (Array.isArray(data.questionDeck)) {
      state.questionDeck = data.questionDeck.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      state.questionDeck.forEach((question) => {
        if (question.selectedOptionId) {
          state.answersByQuestionId[question.questionId] = question.selectedOptionId;
        }
      });
    }

    if (!silent) {
      renderCurrentQuestion();
    }

    return data;
  };

  const startPollingForSessionTwo = () => {
    stopPolling();
    state.pollIntervalId = window.setInterval(async () => {
      try {
        await refreshAttempt({ silent: true });
        if (state.sessionControl?.session2Enabled) {
          state.waitingForAdmin = false;
          stopPolling();
          setStatus("examStatus", "Sesion 2 habilitada. Puedes continuar.", "ok");
          startSessionTimer(Math.max(state.sessionControl.currentSessionIndex || 1, 1));
        }
      } catch (error) {
        setStatus("examStatus", error.message, "warn");
      }
    }, 10000);
  };

  const completeSessionOne = async () => {
    if (!state.attemptId) return;
    await apiRequest(`/student/attempts/${state.attemptId}/session1/complete`, { method: "POST" });
    state.waitingForAdmin = true;
    setStatus("examStatus", "Sesion 1 finalizada. Espera habilitacion de sesion 2.", "warn");
    renderTimerPanel();
    renderQuestionNav();
    startPollingForSessionTwo();
  };

  const startSessionTimer = (sessionIndex) => {
    const sessions = state.sessionPlan?.sessions;
    if (!Array.isArray(sessions) || !sessions[sessionIndex]) return;

    state.timer.sessionIndex = sessionIndex;
    state.timer.remainingSeconds = Math.max(1, Number(sessions[sessionIndex].durationMinutes || 1) * 60);
    state.waitingForAdmin = false;

    stopTimer();
    renderTimerPanel();
    clampCurrentIndex();
    renderCurrentQuestion();

    state.timer.intervalId = window.setInterval(async () => {
      state.timer.remainingSeconds -= 1;
      renderTimerPanel();

      if (state.timer.remainingSeconds > 0) {
        return;
      }

      stopTimer();
      const nextSessionIndex = sessionIndex + 1;

      if (nextSessionIndex < sessions.length) {
        const strictMode = state.sessionPlan?.mode === "SABER11_DOS_JORNADAS";
        if (strictMode && sessionIndex === 0 && !state.sessionControl?.session2Enabled) {
          await completeSessionOne();
          return;
        }

        setStatus("examStatus", `${sessions[sessionIndex].label} finalizada. Inicia ${sessions[nextSessionIndex].label}.`, "warn");
        startSessionTimer(nextSessionIndex);
        return;
      }

      setStatus("examStatus", "Tiempo finalizado. Enviando intento automaticamente...", "warn");
      await submitAttempt(true);
    }, 1000);
  };

  const applyAttemptData = (data) => {
    state.attemptId = data.attempt?.id || null;
    state.questionDeck = Array.isArray(data.questionDeck)
      ? data.questionDeck.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      : [];
    state.currentIndex = 0;
    state.answersByQuestionId = {};
    state.questionDeck.forEach((question) => {
      if (question.selectedOptionId) {
        state.answersByQuestionId[question.questionId] = question.selectedOptionId;
      }
    });

    applySessionPlan(data.sessionPlan, data.attempt?.prueba);
    state.sessionControl = data.sessionControl || {};

    $("attemptView")?.classList.remove("hidden");
    setText("attemptTitle", data.attempt?.prueba?.nombre || "Simulacro activo");
    setText(
      "attemptSummary",
      `${data.attempt?.prueba?.totalPreguntas || state.questionDeck.length} preguntas | ${data.attempt?.prueba?.tiempoLimiteMinutos || "-"} minutos`
    );

    renderCurrentQuestion();
  };

  const renderResults = (result) => {
    const areaRows = (result.areaResults || []).map((item) => ({
      area: item.area,
      porcentaje: Number(item.porcentaje ?? item.porcentajeArea ?? 0),
      correctas: Number(item.correctas ?? 0),
      incorrectas: Number(item.incorrectas ?? 0),
      total: Number(item.total ?? item.totalPreguntasArea ?? 0)
    }));

    const correctas = Number(result.correctas ?? areaRows.reduce((acc, item) => acc + item.correctas, 0));
    const incorrectas = Number(result.incorrectas ?? areaRows.reduce((acc, item) => acc + item.incorrectas, 0));
    const total = Number(result.totalPreguntas ?? Math.max(correctas + incorrectas + Number(result.sinResponder ?? 0), 0));
    const sinResponder = Number(result.sinResponder ?? Math.max(0, total - correctas - incorrectas));

    const kpis = [
      { label: "Correctas", value: correctas },
      { label: "Incorrectas", value: incorrectas },
      { label: "Sin responder", value: sinResponder },
      { label: "Puntaje", value: result.puntajeTotal ?? result.puntajeTotalObtenido ?? 0 },
      { label: "Porcentaje", value: result.porcentajeTotal ?? 0 },
      { label: "Nivel", value: result.nivelDesempeno || result.nivelDesempenoGlobal || "-" }
    ];

    $("resultKpis").innerHTML = kpis
      .map((item) => `<div class="kpi"><small>${item.label}</small><strong>${item.value}</strong></div>`)
      .join("");

    $("resultBars").innerHTML = areaRows
      .map((item) => {
        const pct = Math.max(0, Math.min(100, Number(item.porcentaje || 0)));
        return `<div class="bar-row">
          <div>${item.area}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div>${pct.toFixed(1)}%</div>
        </div>`;
      })
      .join("");

    const recomendaciones = Array.isArray(result.recomendaciones) ? result.recomendaciones : [];
    $("resultRecommendations").innerHTML = recomendaciones.length
      ? recomendaciones.map((item) => `<div class="pill">${item}</div>`).join("")
      : `<div class="pill">Completa mas simulacros para obtener recomendaciones por materia.</div>`;

    $("resultsView")?.classList.remove("hidden");
  };

  const renderResultsHistory = () => {
    const rows = $("resultHistoryRows");
    if (!rows) return;

    if (!state.resultsHistory.length) {
      rows.innerHTML = `<tr><td colspan="6" class="muted">Aun no tienes resultados calificados.</td></tr>`;
      return;
    }

    rows.innerHTML = state.resultsHistory
      .map((item) => {
        const date = item.fechaFin || item.fechaInicio;
        const parsed = date ? new Date(date) : null;
        return `<tr>
          <td>${item.exam?.nombre || "-"}</td>
          <td>${item.exam?.tipoPrueba || "-"}</td>
          <td>${parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : "-"}</td>
          <td>${Number(item.porcentajeTotal ?? 0).toFixed(2)}%</td>
          <td>${item.nivelDesempeno || "-"}</td>
          <td><button class="btn-soft history-view-btn" data-attempt-id="${item.attemptId}" type="button">Ver</button></td>
        </tr>`;
      })
      .join("");

    rows.querySelectorAll(".history-view-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const attemptId = button.getAttribute("data-attempt-id");
        if (!attemptId) return;
        try {
          const payload = await apiRequest(`/student/results/${attemptId}`);
          renderResults(payload.data || {});
          setStatus("portalStatus", "Resultado cargado.", "ok");
        } catch (error) {
          setStatus("portalStatus", error.message, "bad");
        }
      });
    });
  };

  const loadResultsHistory = async ({ silent = false } = {}) => {
    const payload = await apiRequest("/student/results");
    state.resultsHistory = Array.isArray(payload.data?.items) ? payload.data.items : [];
    renderResultsHistory();
    if (!silent) {
      setStatus("portalStatus", `Resultados disponibles: ${state.resultsHistory.length}.`, "ok");
    }
  };

  const syncHomeData = async () => {
    const payload = await apiRequest("/student/home");
    const data = payload.data || {};

    state.student = data.student || null;
    state.exams = Array.isArray(data.availableExams) ? data.availableExams : [];

    const student = data.student;
    setText(
      "studentMeta",
      `${student?.nombres || ""} ${student?.apellidos || ""} | Documento ${student?.numeroIdentificacion || "-"} | Grado ${student?.grado || "-"}`
    );

    renderExamOptions(state.exams);
    await loadResultsHistory({ silent: true });

    return data;
  };

  const loadPortal = async () => {
    const data = await syncHomeData();
    resetAttempt();

    if (data.activeAttempt?.id) {
      const attemptPayload = await apiRequest(`/student/attempts/${data.activeAttempt.id}`);
      applyAttemptData(attemptPayload.data || {});

      const startSessionIndex =
        typeof state.sessionControl?.currentSessionIndex === "number" ? state.sessionControl.currentSessionIndex : 0;

      if (state.sessionControl?.strictMode && startSessionIndex > 0 && !state.sessionControl?.session2Enabled) {
        state.waitingForAdmin = true;
        renderTimerPanel();
        renderQuestionNav();
        startPollingForSessionTwo();
      } else {
        startSessionTimer(Math.max(0, startSessionIndex));
      }

      setStatus("portalStatus", "Se recupero un intento activo.", "ok");
    } else {
      setStatus("portalStatus", "Selecciona una prueba y presiona iniciar.", "warn");
    }
  };

  const login = async () => {
    try {
      setButtonLoading("loginBtn", true, "Validando...");
      const tipo = $("tipoIdentificacion").value;
      const numero = $("numeroIdentificacion").value.trim();
      if (!numero) {
        throw new Error("Ingresa tu numero de identificacion.");
      }

      const payload = await apiRequest("/student-auth/login", {
        method: "POST",
        auth: false,
        body: {
          tipo_identificacion: tipo,
          numero_identificacion: numero
        }
      });

      const token = payload.data?.token;
      if (!token) {
        throw new Error("No se recibio token de sesion.");
      }

      saveToken(token);
      showView({ login: false, portal: true });
      await loadPortal();
      setStatus("loginStatus", "Sesion iniciada correctamente.", "ok");
    } catch (error) {
      setStatus("loginStatus", error.message, "bad");
    } finally {
      setButtonLoading("loginBtn", false);
    }
  };

  const logout = (showMessage = true) => {
    clearToken();
    resetAttempt();
    state.resultsHistory = [];
    renderResultsHistory();
    showView({ login: true, portal: false });
    if (showMessage) {
      setStatus("loginStatus", "Sesion cerrada.", "warn");
    }
  };

  const startAttempt = async () => {
    try {
      const examId = $("examSelect").value;
      if (!examId) {
        throw new Error("Selecciona un simulacro.");
      }

      const confirmed = window.confirm(
        "Confirma que leiste las instrucciones. El tiempo iniciara al comenzar y al enviar no podras modificar respuestas."
      );
      if (!confirmed) return;

      setButtonLoading("startExamBtn", true, "Iniciando...");
      const payload = await apiRequest("/student/attempts/start", {
        method: "POST",
        body: {
          prueba_id: examId
        }
      });

      applyAttemptData(payload.data || {});
      const sessionIndex =
        typeof state.sessionControl?.currentSessionIndex === "number" ? state.sessionControl.currentSessionIndex : 0;
      startSessionTimer(Math.max(0, sessionIndex));

      setStatus("portalStatus", "Simulacro iniciado.", "ok");
      setStatus("examStatus", "Selecciona una opcion y guarda tu respuesta.", "warn");
    } catch (error) {
      setStatus("portalStatus", error.message, "bad");
    } finally {
      setButtonLoading("startExamBtn", false);
    }
  };

  const saveAnswer = async () => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo.");
      if (state.waitingForAdmin) throw new Error("Debes esperar habilitacion de sesion 2.");
      const question = state.questionDeck[state.currentIndex];
      if (!question) throw new Error("No hay pregunta activa.");

      const optionId = state.answersByQuestionId[question.questionId];
      if (!optionId) throw new Error("Selecciona una opcion antes de guardar.");

      await apiRequest(`/student/attempts/${state.attemptId}/answer`, {
        method: "POST",
        body: {
          pregunta_id: question.questionId,
          opcion_id_seleccionada: optionId
        }
      });

      setStatus("examStatus", `Respuesta guardada en pregunta ${state.currentIndex + 1}.`, "ok");
      renderQuestionNav();
    } catch (error) {
      setStatus("examStatus", error.message, "bad");
    }
  };

  const submitAttempt = async (automatic = false) => {
    try {
      if (!state.attemptId) throw new Error("No hay intento activo.");
      if (state.waitingForAdmin) throw new Error("La sesion 2 aun no esta habilitada.");

      const unanswered = state.questionDeck.length - Object.keys(state.answersByQuestionId).length;
      if (!automatic) {
        const confirmed = window.confirm(
          `Seguro que deseas enviar el simulacro? Tienes ${Math.max(unanswered, 0)} preguntas sin responder.`
        );
        if (!confirmed) return;
      }

      stopTimer();
      const payload = await apiRequest(`/student/attempts/${state.attemptId}/submit`, { method: "POST" });
      const attemptId = payload.data?.attemptId || state.attemptId;
      const resultPayload = attemptId ? await apiRequest(`/student/results/${attemptId}`) : payload;

      resetAttempt();
      renderResults(resultPayload.data || payload.data || {});
      await loadResultsHistory({ silent: true });
      const homeData = await syncHomeData();
      if (homeData?.activeAttempt?.id) {
        // Si por cualquier razon quedo un intento activo, mantenerlo recuperable.
        setStatus("portalStatus", "Resultado generado. Hay un intento activo pendiente de recuperacion.", "warn");
      } else {
        setStatus("portalStatus", "Resultado disponible en esta vista.", "ok");
      }
      setStatus(
        "examStatus",
        automatic ? "Tiempo finalizado. Intento enviado automaticamente." : "Simulacro calificado.",
        "ok"
      );
    } catch (error) {
      setStatus("examStatus", error.message, "bad");
    }
  };

  const prevQuestion = () => {
    if (!state.questionDeck.length || state.waitingForAdmin) return;
    const bounds = getSessionBounds();
    state.currentIndex = Math.max(bounds.min, state.currentIndex - 1);
    renderCurrentQuestion();
  };

  const nextQuestion = () => {
    if (!state.questionDeck.length || state.waitingForAdmin) return;
    const bounds = getSessionBounds();
    state.currentIndex = Math.min(bounds.max, state.currentIndex + 1);
    renderCurrentQuestion();
  };

  const bindEvents = () => {
    $("loginForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void login();
    });

    $("logoutBtn")?.addEventListener("click", () => logout(true));

    $("refreshPortalBtn")?.addEventListener("click", async () => {
      try {
        await loadPortal();
        setStatus("portalStatus", "Portal actualizado.", "ok");
      } catch (error) {
        setStatus("portalStatus", error.message, "bad");
      }
    });

    $("startExamBtn")?.addEventListener("click", () => void startAttempt());
    $("saveAnswerBtn")?.addEventListener("click", () => void saveAnswer());
    $("submitExamBtn")?.addEventListener("click", () => void submitAttempt(false));
    $("prevBtn")?.addEventListener("click", prevQuestion);
    $("nextBtn")?.addEventListener("click", nextQuestion);

    $("viewResultsBtn")?.addEventListener("click", async () => {
      try {
        await loadResultsHistory();
        $("resultsView")?.classList.remove("hidden");
      } catch (error) {
        setStatus("portalStatus", error.message, "bad");
      }
    });

    $("examSelect")?.addEventListener("change", () => {
      const selected = $("examSelect")?.selectedOptions?.[0];
      setText("examInfo", selected?.dataset?.info || "");
    });
  };

  const bootstrap = async () => {
    bindEvents();
    if (!state.token) {
      showView({ login: true, portal: false });
      return;
    }

    try {
      await apiRequest("/student-auth/me");
      showView({ login: false, portal: true });
      await loadPortal();
    } catch {
      logout(false);
    }
  };

  void bootstrap();
})();
