#!/bin/bash
# Quick-start benchmark script: compare recognition models (buffalo_l, buffalo_s, AdaFace, etc.)
# Usage: ./run_model_comparison.sh [models] [--align {resize|detect}]
# Example: ./run_model_comparison.sh buffalo_l buffalo_s adaface --align detect

set -e

MODELS="${1:-buffalo_l,buffalo_s,adaface}"
ALIGN="${2:-resize}"

# Parse arguments
for arg in "$@"; do
    if [[ "$arg" == "--align" ]]; then
        shift
        ALIGN="$1"
        shift
    fi
done

# Use the backend venv if it exists
if [ -d "backend/venv" ]; then
    source backend/venv/bin/activate
fi

echo "🚀 Running model comparison benchmark..."
echo "  Models: $MODELS"
echo "  Align mode: $ALIGN"
echo "  Dataset: storage/visitor_photos/"
echo ""

python -m backend.benchmark recognition \
    --models "$MODELS" \
    --align "$ALIGN" \
    --device cpu

echo ""
echo "✅ Benchmark complete! Results saved to storage/benchmarks/"
