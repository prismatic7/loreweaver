#!/usr/bin/env bash
# Design-system drift audit for Loreweaver
cd /Users/chris/Development/loreweaver

echo "=== RADIUS VALUES (inline tsx, px strings) ==="
grep -rhoE "borderRadius:[[:space:]]*[\"'][0-9]+px" src --include="*.tsx" | sort | uniq -c | sort -rn

echo ""
echo "=== RADIUS VALUES (inline tsx, bare numbers) ==="
grep -rhoE "borderRadius:[[:space:]]*[0-9]+[,}]" src --include="*.tsx" | sort | uniq -c | sort -rn

echo ""
echo "=== RADIUS VALUES (CSS) ==="
grep -rhoE "border-radius:[[:space:]]*[0-9]+px" src --include="*.css" | sort | uniq -c | sort -rn

echo ""
echo "=== SHADOWS (tsx) ==="
grep -rhoE "boxShadow:[[:space:]]*[^,}]+" src --include="*.tsx" | sort | uniq -c | sort -rn | head -20

echo ""
echo "=== SHADOWS (CSS) ==="
grep -rhoE "box-shadow:[[:space:]]*[^;]+" src --include="*.css" | sort | uniq -c | sort -rn | head -20

echo ""
echo "=== HARDCODED HEX COLOURS (tsx) ==="
grep -rhoE "#[0-9a-fA-F]{3,8}" src --include="*.tsx" | sort | uniq -c | sort -rn | head -20

echo ""
echo "=== HARDCODED rgb/rgba (tsx) ==="
grep -rhoE "rgba?\([^)]+\)" src --include="*.tsx" | sort | uniq -c | sort -rn | head -20

echo ""
echo "=== FILES WITH 0 border-radius usages (already clean) ==="
for f in src/components/*.tsx; do
  if ! grep -q "borderRadius" "$f" 2>/dev/null; then
    echo "  clean: $f"
  fi
done

echo ""
echo "=== TOTAL radius count per file ==="
grep -rc "borderRadius" src --include="*.tsx" | sort -t: -k2 -rn
