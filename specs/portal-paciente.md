# SPEC — Portal do Paciente (Área do Paciente)
**Data:** 19/06/2026 | **Autor:** Dr. Replit Paxter | **Status:** APROVADA PELO CEO

---

## Objetivo

Redesenhar completamente a `/area` (portal mobile-first do paciente) aplicando o sistema de
design Paxter com rigor: grade imaginária, 5 zonas canônicas, classes 3D, paleta
verde-petroleo/ciano — mantendo 100% da funcionalidade já existente e acrescentando
múltiplos protocolos estratificados, seção de contratos e validação de código pelo paciente.

---

## O que JÁ EXISTE e NÃO muda (lógica de negócio)

| Componente | Status |
|---|---|
| Auth CPF + data nascimento → HMAC token 30min | MANTÉM |
| 7 abas: início / protocolo / agenda / financeiro / exames / documentos / enviar | MANTÉM (reorganiza visual) |
| Hook `useApi<T>` + Bearer token | MANTÉM |
| API `/api/area-paciente/*` (resumo/protocolos/sessoes/financeiro/exames/documentos) | MANTÉM |
| API `/api/area-paciente/ras/:id/pdf` e `/api/area-paciente/protocolo/:id/pdf` | MANTÉM |
| API `/api/client-portal/identify` e `/api/client-portal/upload` | MANTÉM |

---

## O que MUDA — Redesign Visual Completo

### R1. TEMA — Claro (não escuro)
- Background: `bg-background` (branco/quase-branco do sistema Paxter)
- Jamais `bg-[#142e2e]` ou cores hardcoded — usar tokens Tailwind/classes Paxter
- O paciente deve sentir: limpo, confiável, premium — mesma linguagem visual do admin

### R2. CABEÇALHO (header sticky)
- `panel-3d` horizontal como top bar
- Logo: "Pad**con**" (branco+ciano como no admin) + subtítulo "ÁREA DO PACIENTE"
- Nome do paciente: badge `concave-3d` com truncate
- Botão SAIR: `btn-3d-soft` com ícone LogOut — alinhado à direita `shrink-0`

### R3. NAVEGAÇÃO — Bottom Nav (mobile-first)
- Substituir tabs horizontais com scroll por **barra de navegação inferior** fixa
- 5 ícones na barra inferior: Início / Protocolos / Agenda / Documentos / Enviar
- Item ativo: destaque ciano, fundo `concave-3d`
- Abas secundárias (financeiro, exames) ficam acessíveis DENTRO de Documentos

### R4. CARDS DE PROTOCOLO — Grade Imaginária aplicada
Cada protocolo é um card com 5 zonas canônicas:
1. **TOP BAR** fixo: badge STATUS (ATIVO/CONCLUÍDO/PAUSADO) + data início (shrink-0)
2. **TÍTULO** nome do protocolo em uppercase, truncate, font-black
3. **IDENTIDADE** progresso "N/total sessões" em `concave-3d` + badge tipo (IV/IM/IMPLANTE)
4. **META GRID** 2×2 fixo: LOCAL · MÉDICO · PRÓXIMA SESSÃO · SUBSTÂNCIAS
5. **BARRA DE PROGRESSO** visual (% concluído) em ciano

Regra de estratificação:
- Protocolos ATIVOS no topo
- Protocolos CONCLUÍDOS colapsados abaixo com botão "Ver histórico"
- Protocolos PARALELOS (mesmo período) ficam lado a lado em grid 1 col mobile / 2 col tablet

### R5. INÍCIO — Dashboard do Paciente
- Saudação: "Bom dia, [NOME CURTO]"
- Card principal `panel-3d`: próximo atendimento (data + hora + local + substâncias)
- Barra de progresso do protocolo ativo (% concluído)
- Card secundário `panel-3d-sub`: último atendimento + substâncias aplicadas
- Acesso rápido: botões para as 4 seções mais usadas

### R6. VALIDAÇÃO DE CÓDIGO (nova feature)
- Seção dentro da aba Início: "VALIDAR MINHA PRESENÇA"
- Campo único: digitar código (6 caracteres gerado D-1 OU senha permanente do protocolo)
- Botão "CONFIRMAR" → POST `/api/area-paciente/validar-codigo`
- Feedback: verde "Presença confirmada — sessão N confirmada" ou vermelho "Código inválido"
- Regra: campo só aparece se há sessão agendada nos próximos 2 dias

### R7. DOCUMENTOS — Estratificado em categorias
Substituir lista plana por categorias colapsáveis:
- **Registros de Aplicação (RAS)** — ordenados por data desc, botão Download PDF
- **Protocolos Completos** — um por protocolo, botão Download PDF
- **Contratos e Pagamentos** — (futuro: slot vazio com "—" agora, sem sumir)
- Badge de quantidade em `concave-3d` ao lado de cada categoria

### R8. FINANCEIRO — Card resumo simples
- Total pago / Total pendente / Próximo vencimento em MetaGrid 3 colunas
- Lista de pagamentos com status PAGO (verde) / PENDENTE (âmbar)

### R9. ENVIAR — Upload limpo
- Mantém toda a lógica existente
- Visual: `panel-3d` com dropzone `concave-3d`
- Botão upload: `btn-3d` ciano

### R10. RODAPÉ
- Link anamnese mantido
- "Clínica Padua — Padcon Conect" em texto muted mínimo

---

## Linhas Vermelhas (não cruzar)

| Proibido |
|---|
| Alterar qualquer endpoint de API ou payload existente |
| Remover qualquer funcionalidade já construída (upload, download PDF, etc.) |
| Usar cores hardcoded (`#142e2e`, `#d4ae35`, `#0d1f1f`) — só tokens Paxter |
| `flex-wrap` em dados-chave do cabeçalho |
| LED animado (`paxter-led-on`) em contagens ou títulos |
| Badge STATUS ao lado do nome do protocolo (vai ao lado do ID/código) |
| Navegação bottom bar com mais de 5 ícones |

---

## API nova necessária

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/area-paciente/validar-codigo` | POST | Body: `{ codigo: string }`. Verifica `validationCode` (D-1) OU `validationPassword` (permanente). Retorna `{ ok, sessaoId, mensagem }` |

---

## Definição de PRONTO

- [ ] Login com CPF+data aplica design Paxter (tema claro, sem hardcode escuro)
- [ ] Header sticky com nome do paciente truncado + botão SAIR
- [ ] Bottom nav com 5 ícones, ativo em ciano
- [ ] Aba Início: saudação + próximo atendimento + barra de progresso
- [ ] Campo de validação de código (se sessão próxima)
- [ ] Aba Protocolos: cards com 5 zonas + ATIVO/CONCLUÍDO estratificado
- [ ] Aba Agenda: lista de sessões passadas e futuras
- [ ] Aba Documentos: RAS + Protocolo PDF categorizados
- [ ] Aba Enviar: upload funcional com design Paxter
- [ ] Zero cor hardcoded; zero `flex-wrap` em dado-chave
- [ ] Validado em viewport 390px (iPhone) e 768px (tablet)
