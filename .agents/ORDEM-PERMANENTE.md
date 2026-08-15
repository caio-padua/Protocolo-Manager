# ORDEM PERMANENTE — SATELITE DE CONHECIMENTO

Versao 1.0 — 14/08/2026 — decisao do CEO Dr. Caio
Vale para TODOS os agentes: Dr. Replit Paxter, Dr. Claude, Dr. Code, Dr. Manus, Cursor.

---

## 1. A REGRA

**Antes de implementar QUALQUER capacidade, leia a nota da capacidade no PADUA BRAIN.**
Nao reinvente. Se precisar divergir, registre a decisao e o motivo.

---

## 2. ONDE FICA O SATELITE

Repositorio: `caio-padua/padua-segundo-cerebro` (privado)

Leitura direta por raw:

```
https://raw.githubusercontent.com/caio-padua/padua-segundo-cerebro/main/<caminho>
```

O satelite e o REPOSITORIO, nao o aplicativo Obsidian. Ele esta no ar 24 horas,
independente de qualquer maquina estar ligada. O Obsidian e apenas a janela pela
qual o humano olha o satelite.

---

## 3. O QUE LER, E QUANDO

| Momento | Caminho no satelite |
|---|---|
| Antes da primeira linha de um sistema novo | `0-POSTURAS/_LEIA-PRIMEIRO.md` |
| Antes de implementar uma capacidade | `2-CAPACIDADES/<capacidade>/_CAPACIDADE.md` |
| Antes de decidir arquitetura | `1-PRINCIPIOS/` |
| Quando algo quebrar | `3-FALHAS/` |
| Duvida de vocabulario | `5-CONCEITOS/` |
| Regra de negocio do ramo | `4-DOMINIOS/` |

Mapa completo das capacidades: `2-CAPACIDADES/_MAPA.md`

---

## 4. CAPACIDADES JA DESTILADAS

| Capacidade | Caminho | Estado |
|---|---|---|
| cobranca | `2-CAPACIDADES/cobranca/_CAPACIDADE.md` | completa — Asaas, penalidade, gate de pagamento |
| avaliacao-e-evolucao | `2-CAPACIDADES/avaliacao-e-evolucao/_CAPACIDADE.md` | completa — anamnese, linha vermelha, skip-logic, conferencia humana |

As demais (agendamento, cadastro-e-identidade, comunicacao, documentos,
arquivos-e-midia, acesso-e-permissao, relatorios, integracao-externa) tem
material bruto em `6-SISTEMAS/` esperando destilacao.

---

## 5. POSTURAS DE DIA ZERO — decidir ANTES de escrever codigo

| Postura | Custo de adiar |
|---|---|
| `0-POSTURAS/multi-tenant.md` | **35 tabelas alteradas a mao.** Ja aconteceu neste repositorio. |
| `0-POSTURAS/idempotencia-global.md` | bug silencioso: evento duplicado, guard fora da transacao |
| `0-POSTURAS/lgpd-by-design.md` | consentimento retroativo, caro e fragil |

---

## 6. O FLUXO NOS DOIS SENTIDOS

**DESCIDA — obrigatoria e automatica.**
O agente le antes de agir. Custo zero. Nao ha desculpa para pular.

**SUBIDA — com filtro, nunca automatica.**
O que o agente aprende entra primeiro em `.agents/memory/` do PROPRIO repositorio.
Dali sobe para o satelite **somente** o que vale para OUTROS sistemas, marcado
`transferivel: sim`, e **sempre por pull request**.

> Nenhum agente commita direto na `main` do satelite.
> Registro que o proprio agente pode reescrever nao e registro, e rascunho.

Motivo da assimetria: descida barata mantem todos alinhados; subida sem filtro
enche o satelite de ruido. Ja existem 188 notas nao triadas — a prova de que
subida automatica sem peneira nao funciona.

---

## 7. IDENTIDADE

Todo agente commita com identidade propria:

```bash
git config user.name "Dr. Replit Paxter"
git config user.email "dr-replit@padaxor.local"
```

**Nunca com a identidade do dono do repositorio.** Sem isso, o historico nao
distingue quem escreveu o que, e a rastreabilidade que o git oferece se perde.

---

## 8. FONTE UNICA

`dicionario.json` e a UNICA fonte do dicionario.
`DICIONARIO.md` e a aba do Google Sheets sao derivados **somente-leitura**.
Nao editar derivado. Editou derivado, criou divergencia.

---

## 9. COORDENACAO x CONHECIMENTO

Duas cargas distintas, nao misturar:

| Carga | Natureza | Onde vive |
|---|---|---|
| **Conhecimento** — o que e verdade, como se faz | lenta, curada, versionada | satelite (`padua-segundo-cerebro`) |
| **Coordenacao** — quem faz o que agora | rapida, efemera, com estado | fila de producao |

Slack e canal de AVISO. Nenhuma decisao nasce la. Decidiu no Slack, registra
como ADR no satelite — senao nao vale.
