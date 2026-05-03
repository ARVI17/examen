# Reclasificacion fina y plan de ingesta

## Resultado
- Archivos evaluados: 164
- Reclasificados automaticamente por area (incluye Multi-area): 164
- Multi-area para revision puntual: 48
- Inventario refinado: material/00. ORGANIZADO/INVENTARIO_REFINADO.csv
- Manifest para proyecto: material/00. ORGANIZADO/MANIFEST_MATERIAL_PARA_PROYECTO.json
- Copia de manifest para pipelines: storage/bancos_preguntas/icfes/material_local/manifest_material_local.json

## Distribucion por area refinada
- MULTI_AREA: 48
- SOCIALES_CIUDADANAS: 39
- CIENCIAS_NATURALES: 30
- MATEMATICAS: 27
- LECTURA_CRITICA: 10
- INGLES: 8
- FILOSOFIA: 2

## Distribucion por categoria de proyecto
- MATERIALES_APOYO: 51
- CLAVES: 49
- EXAMENES: 30
- SIMULACROS: 21
- BANCOS_PREGUNTAS: 13

## Distribucion por tipo de prueba
- SABER_11: 94
- PRACTICA: 39
- SIMULACRO: 21
- DIAGNOSTICO: 6
- EVALUACION: 4

## Confianza de clasificacion
- alta: 114
- media: 45
- baja: 5

## Uso para alimentar el proyecto
1. Usar INVENTARIO_REFINADO.csv como hoja de control para validar metadata.
2. Usar manifest_material_local.json como entrada para un proceso de carga masiva.
3. Priorizar primero categorias EXAMENES, SIMULACROS y BANCOS_PREGUNTAS.
4. Revisar REVISION_MANUAL_MULTI_AREA.csv antes de carga definitiva para casos ambiguos.
