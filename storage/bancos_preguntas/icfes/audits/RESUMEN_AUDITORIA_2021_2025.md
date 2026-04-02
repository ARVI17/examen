# Resumen Auditoria Enlaces Oficiales Saber 11 (2021-2025)

Fecha de auditoria: 2026-03-31

## Fuentes oficiales revisadas

- https://www.icfes.gov.co/caja-de-herramientas-saber-11/
- https://www.icfes.gov.co/caja-de-herramientas-saber-11/que-se-evalua/
- https://www.icfes.gov.co/caja-de-herramientas-saber-11/practica/
- https://www.icfes.gov.co/interpreta-tus-resultados/
- https://www.icfes.gov.co/wp-json/wp/v2/media
- https://icfes.acendra.com.co/wp-json/wp/v2/media
- https://www.icfes.gov.co/publicaciones-icfes/guias-de-orientacion/2023-2/

## Resultado de enlaces

- Enlaces candidatos 2021-2025 evaluados: 149
- Enlaces con estado `200 OK`: 149
- Archivo de detalle: `audit_links_2021_2025.json`

## Cobertura consolidada descargada (41 archivos)

Matriz por anio y tipo:

- 2021: 3 (1 guia, 1 informe, 1 marco)
- 2022: 5 (1 informe, 4 marcos/niveles)
- 2023: 2 (1 informe, 1 infografia)
- 2024: 22 (1 cuadernillo, 10 practicas/explicadas, 5 marcos, 6 infografias)
- 2025: 9 (2 guias, 1 cuadernillo, 6 infografias)

Archivo de cobertura:

- `coverage_matrix_2021_2025_consolidado.json`

Manifiesto consolidado:

- `../examenes_pasados/manifest_examenes_saber11_2021_2025_consolidado.json`

## Hallazgos importantes

- No se encontraron enlaces oficiales activos de **cuadernillos de preguntas Saber 11** para 2022 ni 2023 en las fuentes actuales revisadas.
- La pagina oficial de guias 2023 referencia enlaces historicos para Saber 11 (2023-1 y 2023-2), pero esos enlaces apuntan a rutas legacy (`/documents/...` y `www2.icfes.gov.co`) no disponibles en esta auditoria.
- Se ejecutaron barridos por patron en `icfes.acendra.com.co` para 2021-2023 y no se detectaron cuadernillos con el patron actual de archivos de practica.

## Archivos de evidencia

- `audit_links_2021_2025.json`
- `audit_links_2021_2025_saber11_only.json`
- `caja_herramientas_pdf_links.json`
- `acendra_pattern_scan_2021_2023.json`
- `acendra_pattern_scan_https_2021_2023.json`
- `source_link_health_consolidado.json`
