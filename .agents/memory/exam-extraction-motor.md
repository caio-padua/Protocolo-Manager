---
name: Motor de extração de laudos (Gemini + pdf-parse)
description: Lições do motor que lê PDF de exame, extrai analitos via Gemini e valida com Zod.
---

# Motor "Trajetória do Exame Uploadado" — Onda 1

Pipeline: `extractPdfText` (pdf-parse v2) → `compactExamText` → Gemini `generateContent`
(responseMimeType application/json) → Zod parse → fallback determinístico de laboratório.
Vive em `artifacts/api-server/src/lib/exam-extraction/`.

## Latência e tamanho (decisão de arquitetura)
- Uma única chamada Gemini sobre laudo grande (44 págs / 80 mil chars) leva **70 a 106 segundos** —
  perto do teto de 120s de qualquer chamada síncrona. A latência é dominada pelo modelo, não pelo input.
- **Por isso a UI do pipeline TEM de ser assíncrona** (job com status + conferência humana), nunca um
  request HTTP que espera. Não tentar "resolver" deixando o request bloquear.
- `compactExamText` (dedup de linhas idênticas: cabeçalhos/rodapés repetidos por página) corta ~60%
  do texto. Mantém a 1ª ocorrência → não perde analito (linha igual byte-a-byte = mesmo dado repetido).
  Aplicar SEMPRE antes do Gemini (custo + confiabilidade).

## Schema Zod tem de tolerar chave ausente
- O modelo OMITE chaves em vez de mandar `null`. `z.string().nullable()` falha em chave ausente
  (`received undefined`). Use união `z.union([z.string(), z.null()]).optional().transform(v => v ?? null)`
  para todo campo opcional de string. Idem arrays: `.optional().transform(v => v ?? [])`.

## Armadilhas do laudo (prompt precisa ensinar)
- **Nome do paciente**: fica na linha ANTES de "Gênero:"/"CPF:". A linha "Médico: Dr(a) ..." é o
  médico solicitante (pode ser a MESMA pessoa, ex.: Dr. Caio é paciente e médico) — o modelo confunde
  e deixa nome nulo se não for instruído explicitamente.
- **"DN"** = Data de Nascimento (sigla DASA). Sem ensinar, o modelo não reconhece.
- **Laboratório** muitas vezes só aparece na URL de validação (`valida.dasa.com.br`). Mais confiável
  resolver por **regex determinístico** (`inferLabName`) como fallback do que insistir com a IA.

## Conferência só na fonte
- Valores devem casar com o PDF real, não com expectativa de teste: a PCR foi extraída certa
  ("Proteína C Reativa Ultra Sensível 0,29 mg/dL") mas o matcher do teste usava o apelido "PCR".
  Teste por LISTA DE APELIDOS, não por nome único.
