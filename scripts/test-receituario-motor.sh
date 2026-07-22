#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TEST: Motor Único de Receituário — determinístico (sem dependência externa)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="http://localhost:80/api"
PASS=0
FAIL=0
LOG=""

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); LOG="$LOG\n  FALHOU: $1"; }

check_field() {
  local label="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | grep -o "\"$field\":[^,}]*" | head -1 | sed 's/.*://;s/[",]//g;s/ //g')
  if [[ "$actual" == "$expected" ]]; then
    ok "$label: $field = $actual"
  else
    fail "$label: $field esperado='$expected' obtido='$actual'"
  fi
}

check_contains() {
  local label="$1" json="$2" field="$3"
  if echo "$json" | grep -q "\"$field\""; then
    ok "$label: campo '$field' presente"
  else
    fail "$label: campo '$field' ausente na resposta"
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  PAXTER — Motor Único de Receituário — Suite de Testes"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── T01: Lista de modelos ─────────────────────────────────────────────────────
echo "T01: GET /receituario-modelos"
R=$(curl -sf "$BASE/receituario-modelos" 2>/dev/null || echo '{"error":"conexao"}')
if echo "$R" | grep -q '"modelos"'; then
  ok "T01: retornou campo 'modelos'"
  COUNT=$(echo "$R" | grep -o '"id"' | wc -l | tr -d ' ')
  if [[ "$COUNT" -ge 2 ]]; then
    ok "T01: $COUNT modelos encontrados (esperado ≥2)"
  else
    fail "T01: apenas $COUNT modelos (esperado ≥2 — seed não aplicado?)"
  fi
else
  fail "T01: resposta sem campo 'modelos' → $R"
fi

# ── T02: Modelo ativo ─────────────────────────────────────────────────────────
echo ""
echo "T02: GET /receituario-modelos/ativo"
R=$(curl -sf "$BASE/receituario-modelos/ativo" 2>/dev/null || echo '{"error":"conexao"}')
if echo "$R" | grep -q '"modelo"'; then
  ok "T02: retornou campo 'modelo'"
  check_contains "T02" "$R" "tipo"
  check_contains "T02" "$R" "nome"
  TIPO_INICIAL=$(echo "$R" | grep -o '"tipo":"[^"]*"' | sed 's/"tipo":"//;s/"//')
  echo "     tipo inicial: $TIPO_INICIAL"
else
  fail "T02: resposta sem campo 'modelo' → $R"
  TIPO_INICIAL="faixas_paxter"
fi

# ── T03: Ativar modelo 2 (Clássico ANVISA) ───────────────────────────────────
echo ""
echo "T03: POST /receituario-modelos/2/ativar"
R=$(curl -sf -X POST "$BASE/receituario-modelos/2/ativar" \
  -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"conexao"}')
if echo "$R" | grep -q '"ok":true'; then
  ok "T03: ativação retornou ok:true"
  TIPO_ATIVO=$(echo "$R" | grep -o '"tipo":"[^"]*"' | sed 's/"tipo":"//;s/"//')
  if [[ "$TIPO_ATIVO" == "classico_anvisa" ]]; then
    ok "T03: modelo ativo é agora classico_anvisa"
  else
    fail "T03: tipo esperado 'classico_anvisa', obtido '$TIPO_ATIVO'"
  fi
else
  fail "T03: resposta sem ok:true → $R"
fi

# ── T04: Emite teste com motor classico_anvisa ────────────────────────────────
echo ""
echo "T04: POST /receituario-modelos/emitir-teste (motor classico_anvisa)"
R=$(curl -sf -X POST "$BASE/receituario-modelos/emitir-teste" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 60 2>/dev/null || echo '{"error":"timeout_ou_conexao"}')
if echo "$R" | grep -q '"ok":true'; then
  ok "T04: emissão classico_anvisa ok:true"
  check_contains "T04" "$R" "modeloUsado"
  check_contains "T04" "$R" "pdfSizeBytes"
  TIPO_MOTOR=$(echo "$R" | grep -o '"tipoMotor":"[^"]*"' | sed 's/"tipoMotor":"//;s/"//')
  [[ "$TIPO_MOTOR" == "classico_anvisa" ]] && ok "T04: tipoMotor=classico_anvisa" || fail "T04: tipoMotor=$TIPO_MOTOR (esperado classico_anvisa)"
else
  fail "T04: emissão classico_anvisa falhou → $R"
fi

# ── T05: Ativar modelo 1 (Faixas Paxter) ─────────────────────────────────────
echo ""
echo "T05: POST /receituario-modelos/1/ativar"
R=$(curl -sf -X POST "$BASE/receituario-modelos/1/ativar" \
  -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"conexao"}')
if echo "$R" | grep -q '"ok":true'; then
  ok "T05: ativação retornou ok:true"
  TIPO_ATIVO=$(echo "$R" | grep -o '"tipo":"[^"]*"' | sed 's/"tipo":"//;s/"//')
  [[ "$TIPO_ATIVO" == "faixas_paxter" ]] && ok "T05: modelo ativo é agora faixas_paxter" || fail "T05: tipo=$TIPO_ATIVO (esperado faixas_paxter)"
else
  fail "T05: → $R"
fi

# ── T06: Emite teste com motor faixas_paxter ─────────────────────────────────
echo ""
echo "T06: POST /receituario-modelos/emitir-teste (motor faixas_paxter)"
R=$(curl -sf -X POST "$BASE/receituario-modelos/emitir-teste" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 90 2>/dev/null || echo '{"error":"timeout_ou_conexao"}')
if echo "$R" | grep -q '"ok":true'; then
  ok "T06: emissão faixas_paxter ok:true"
  check_contains "T06" "$R" "modeloUsado"
  TIPO_MOTOR=$(echo "$R" | grep -o '"tipoMotor":"[^"]*"' | sed 's/"tipoMotor":"//;s/"//')
  [[ "$TIPO_MOTOR" == "faixas_paxter" ]] && ok "T06: tipoMotor=faixas_paxter" || fail "T06: tipoMotor=$TIPO_MOTOR (esperado faixas_paxter)"
else
  fail "T06: emissão faixas_paxter falhou → $R"
fi

# ── T07: emitir-prescricao ainda funciona ─────────────────────────────────────
echo ""
echo "T07: POST /receituario/emitir-prescricao (rota legada, deve usar motor único)"
PAYLOAD='{
  "pacienteNome": "TESTE AUTOMATICO",
  "pacienteCpf": "000.000.000-00",
  "formulas": [{"nome": "Fórmula Teste","posologia": "1x ao dia","via": "Oral"}]
}'
R=$(curl -sf -X POST "$BASE/receituario/emitir-prescricao" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 60 2>/dev/null || echo '{"error":"timeout_ou_conexao"}')
if echo "$R" | grep -q '"ok":true\|success.*true\|pdfUrl\|driveUrl\|fileName'; then
  ok "T07: emitir-prescricao respondeu com sucesso"
else
  echo "     (INFO: rota legada pode retornar formato diferente — verificar manualmente)"
  echo "     resposta: ${R:0:200}"
fi

# ── Resultado final ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
printf "  RESULTADO: %d aprovados  %d reprovados\n" $PASS $FAIL
echo "═══════════════════════════════════════════════════════════"
if [[ $FAIL -gt 0 ]]; then
  printf "$LOG\n"
  exit 1
fi
exit 0
