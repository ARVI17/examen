#!/bin/sh
set -eu

AREAS="LECTURA_CRITICA MATEMATICAS SOCIALES_CIUDADANAS CIENCIAS_NATURALES INGLES"

for area in $AREAS
do
  for batch in 1 2
  do
    echo "== AREA ${area} | BATCH ${batch}/2 =="
    npm run generate:simulator:questions:ai -- \
      --provider=openai_compatible \
      --base-url=http://ollama:11434/v1 \
      --api-key=ollama \
      --model=qwen2.5:3b-instruct-q4_K_M \
      --count=10 \
      --areas="${area}" \
      --chunks=8 \
      --min-quality-score=78 \
      --max-similarity=0.88 \
      --output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}_batch${batch}.json" \
      --review-output="storage/bancos_preguntas/icfes/ai/generated_questions_${area}_batch${batch}.review.json" \
      --apply
    echo ""
  done
done
