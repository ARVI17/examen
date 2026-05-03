#!/bin/sh
set -eu

AREAS="LECTURA_CRITICA MATEMATICAS SOCIALES_CIUDADANAS CIENCIAS_NATURALES INGLES"

for area in $AREAS
do
  echo "== AREA ${area} =="
  npm run generate:simulator:questions:ai -- \
    --provider=openai_compatible \
    --base-url=http://ollama:11434/v1 \
    --api-key=ollama \
    --model=qwen2.5:3b-instruct-q4_K_M \
    --count=20 \
    --areas="${area}" \
    --chunks=16 \
    --min-quality-score=78 \
    --max-similarity=0.88 \
    --output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}.json" \
    --review-output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}.review.json" \
    --apply
  echo ""
done
