# Manual ADMIN

## 1. Ingreso
1. Abrir `http://192.168.1.25:4000/admin/`.
2. Iniciar sesion con usuario ADMIN.
3. Verificar estado general en Inicio.

## 2. Modulos principales
- Inicio: KPIs y resumen academico.
- Colegios: catalogo, filtros y consulta.
- Salones: grupos por colegio.
- Estudiantes: registro individual y carga CSV.
- Pruebas: creacion/publicacion.
- Resultados, Analisis y Reportes.
- Operacion del sistema: monitoreo LAN y acciones controladas.

## 3. Crear usuario DOCENTE
1. Ir a Configuracion > Usuarios.
2. Completar nombre, email, password, rol DOCENTE y estado.
3. Seleccionar Departamento -> Municipio -> Colegio alcance.
4. Guardar usuario.
5. Verificar en listado que el usuario fue creado.

## 4. Crear estudiante
1. Ir a Estudiantes.
2. Completar datos basicos.
3. Seleccionar Departamento -> Municipio -> Colegio.
4. Seleccionar salon si aplica.
5. Guardar y confirmar mensaje exitoso.

## 5. Validacion de colegio
- Prueba recomendada: MAGDALENA -> SANTA MARTA -> busqueda PALOMINITO.

## 6. Operacion del sistema
- Revisar Estado, LAN y Health.
- Usar Monitoreo del simulacro antes/durante/despues.
- No ejecutar import apply, prepare, reset o backup durante una prueba activa.

## 7. Revision IA
- Revisar preguntas en estado GENERADA_IA o EN_REVISION.
- Publicar solo preguntas validadas manualmente.

## 8. Reglas de seguridad
- No compartir credenciales.
- No ejecutar acciones sensibles sin backup.
- No usar cuentas DOCENTE/ESTUDIANTE para tareas de administracion.

## 9. Cierre
- Confirmar resultados y logs.
- Cerrar sesion al finalizar.
