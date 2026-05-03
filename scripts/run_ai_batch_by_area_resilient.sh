#!/bin/sh
set -u

AREAS="LECTURA_CRITICA MATEMATICAS SOCIALES_CIUDADANAS CIENCIAS_NATURALES INGLES"

for area in $AREAS
do
  for batch in 1 2 3
  do
    echo "== AREA ${area} | BATCH ${batch}/3 (count=8) =="
    npm run generate:simulator:questions:ai -- \
      --provider=openai_compatible \
      --base-url=http://ollama:11434/v1 \
      --api-key=ollama \
      --model=qwen2.5:3b-instruct-q4_K_M \
      --count=8 \
      --areas="${area}" \
      --chunks=6 \
      --min-quality-score=78 \
      --max-similarity=0.88 \
      --output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}_resilient_batch${batch}.json" \
      --review-output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}_resilient_batch${batch}.review.json" \
      --apply || true
    echo ""
  done
done
