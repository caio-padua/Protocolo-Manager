# Spec P1 — Seletor de Clínica e Médico no Bloco do Certificado

**Data:** 20/07/2026
**Tela alvo:** `artifacts/padcom/src/pages/configuracoes/receituario.tsx`
**Config alvo:** `artifacts/padcom/src/lib/arabesques/receituario-config.ts`

## Objetivo
O bloco P12 (Certificado Digital) passa a ter dois seletores:
- **Empresa emissora** → dropdown das locations da API (`/api/locations`)
- **Médico prescritor** → dropdown dos professionals médicos (`/api/professionals?category=medico`)

Ao selecionar, o bloco exibe os dados cadastrais da empresa/médico no preview e no PDF.

## Mudanças em ReceituarioConfig
Adicionar campos:
```ts
selectedClinicaId?: number;   // id da location selecionada como empresa emissora
selectedMedicoId?: number;    // id do professional selecionado como médico prescritor
```

## UI no bloco P12
1. Select "Empresa emissora" → lista de locations ativas, ordenada por nome
2. Select "Médico prescritor" → lista de professionals com category="medico", ordenada por nome
3. Ao selecionar: exibir abaixo um card resumo com os dados (nome, CNPJ se tiver, CRM, cert status)
4. Os seletores são persistidos no localStorage junto com o restante da config

## Fetch de dados
- `GET /api/locations` → array já disponível
- `GET /api/professionals` → array já disponível
- Fetch no mount do componente com `useState` + `useEffect`
- Padrão: selectedClinicaId = 8 (Instituto Padua), selectedMedicoId = 6 (Dr. Caio)

## Sem mudanças em
- ArabesqueBand.tsx, models.ts, rotas de API (exceto leitura via GET já existente)
