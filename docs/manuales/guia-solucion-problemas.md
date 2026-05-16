# Guia de solucion de problemas

## 1. Pantalla oscura en admin
- Sintoma: panel bloqueado por capa oscura.
- Causa probable: overlay/backdrop stale o cache antiguo.
- Solucion:
  1. Recargar con Ctrl+F5.
  2. Cerrar modal activo o presionar Esc.
  3. Verificar logs API.
  4. Si persiste, reconstruir y levantar `api`.

## 2. No abre /admin o /simulador desde otro PC
- Verificar misma red, IP del servidor, firewall TCP 4000 y Docker activo.

## 3. IP cambio
- Obtener nueva IP local y compartir nueva URL.

## 4. Estudiante no inicia sesion
- Validar tipo/numero de identificacion y estado del estudiante.

## 5. Estudiante no ve prueba
- Confirmar asignacion de prueba y estado publicado.

## 6. Estudiante perdio conexion
- Esperar reconexion para sincronizar respuestas pendientes.

## 7. Estudiante cerro navegador
- Iniciar sesion y continuar intento activo.

## 8. Estudiante cambio de equipo
- Iniciar sesion en equipo nuevo y retomar intento activo desde servidor.

## 9. Respuesta no guarda
- Verificar indicador de sincronizacion y health/ready.
- Revisar logs API con requestId.

## 10. Docente no ve estudiantes
- Revisar alcance asignado (colegio/salon) y filtros.

## 11. Solo aparece un departamento en formulario
- Confirmar carga de Departamento -> Municipio -> Colegio en formulario.
- Validar endpoint `/api/schools/departments` con rol ADMIN.
- Revisar que no haya filtros activos heredados del dashboard.

## 12. Docker no esta arriba
- Ejecutar `docker compose ps` y levantar servicios.

## 13. Health o ready falla
- Revisar logs API/DB, conectividad y estado de contenedores.

## 14. Sistema lento
- Revisar red LAN, carga simultanea y procesos pesados activos.

## Escalar al responsable tecnico cuando
- hay errores 500 repetidos
- no se puede iniciar/finalizar intentos
- falla el acceso por rol
- health/ready se mantiene en error
