# Guia de simulacro

## Dia anterior
- Validar credenciales ADMIN, DOCENTE y ESTUDIANTE.
- Revisar health y ready.
- Confirmar pruebas publicadas.
- Confirmar colegios y salones.

## Una hora antes
- Verificar red LAN y energia del servidor.
- Ejecutar prueba corta con 5 estudiantes.
- Revisar estado en Monitoreo del simulacro.

## Escalamiento recomendado
1. 5 estudiantes.
2. 10 estudiantes.
3. 25 estudiantes.
4. 50 estudiantes.

## Durante el simulacro
- Monitorear health/ready.
- Registrar incidencias con hora y requestId.
- No ejecutar tareas administrativas sensibles.

## Despues del simulacro
- Revisar resultados.
- Guardar evidencia operativa.
- Registrar incidencias y acciones correctivas.
- Hacer backup posterior si aplica.

## Plan B
- Si hay falla general de red, pausar inicio de nuevos intentos.
- Reanudar cuando health y ready esten en OK.
