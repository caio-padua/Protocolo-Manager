# SPEC 03 — Unificação das Rotas de Prescrição
**Loop Paxter — Fase 1 (ESPECIFICAR)**
**Data:** 22/07/2026 | Status: AGUARDANDO APROVAÇÃO DO CEO

---

## Objetivo
Garantir que TODAS as rotas de emissão de receituário chamem o motor único (Spec 02)
e que nenhuma rota produza um PDF sem passar pela função `emitirReceituarioPdf`.

---

## Mapa de migração por rota

| Rota atual | Motor atual | Motor novo | Mudança necessária |
|---|---|---|---|
| `POST /api/receituario/emitir-prescricao` | M2 (generateReceituarioPdfV2) | Motor único | Substituir chamada; manter assinatura de body |
| `POST /api/receituario/assinar-imagem-pdf` | M4 (Puppeteer raw) | Motor único | Motor único já usa Puppeteer internamente |
| `POST /api/receituario/emitir-cliente` | M4 (Puppeteer) | Motor único | Idem |
| `POST /api/prescriptions/emit` | M3 (prescription-pdf.ts) | Motor único | Manter desmembramento no PRÉ-processamento; PDF final via motor único |
| `GET /api/receituario/demo` | M1 (V1 grid) | Motor único com dados fictícios | Simplificar |

---

## Requisitos

### R01 — Contrato de body unificado
Todas as rotas de emissão aceitam o mesmo shape:
```json
{
  "patient": { "nome", "cpf", "dataNascimento", "telefone", "endereco" },
  "formulas": [{ "nome", "ativos", "posologia", "via", "forma", "observacao" }],
  "tipoReceita": "especial | simples | manipulacao",
  "modeloId": (opcional — usa ativo se omitido),
  "driveFolder": (opcional),
  "emailTo": (opcional)
}
```

### R02 — Compatibilidade retroativa
- As rotas antigas continuam existindo e aceitando os mesmos bodies
- Internamente roteiam para o motor único
- Nenhuma tela frontend precisa mudar de rota

### R03 — Rota de pré-visualização
- `POST /api/receituario/preview-pdf` → retorna a URL de um PDF temporário (não assina, não sobe ao Drive)
- Usada pelo botão "Testar PDF" da tela "Modelo de Receituários"

---

## Linhas Vermelhas
- NÃO quebrar `POST /api/prescriptions/emit` (tela `/prescricao` depende)
- NÃO remover nenhuma rota — apenas adicionar camada interna
- NÃO mudar contratos de body (breaking change para o frontend)

---

## Definição de PRONTO
- [ ] Todas as 5 rotas acima chamam `emitirReceituarioPdf` internamente
- [ ] Nenhuma rota gera PDF diretamente (sem passar pelo motor único)
- [ ] `POST /api/receituario/preview-pdf` funciona e retorna PDF de demonstração
- [ ] Os 4 botões do sistema (Prescrição, Automático, Cockpit, Emitir Rápido) geram PDFs visualmente idênticos entre si
