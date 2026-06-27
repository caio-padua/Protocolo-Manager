# Spec-MÃE — Cartório (Órgão de Documentos & Consentimento) | Paxter

Data: 26/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop (multi-spec).
Nome do órgão: **Cartório** (PROPOSTO — aguarda confirmação do CEO). Subtítulo: "Documentos & Consentimento".

> Esta é a spec-MÃE: dá a visão, a anatomia (órgão + nervos), o vocabulário e o índice das ondas.
> Cada onda tem sua própria spec detalhada (`specs/cartorio-onda-N-*.md`) e roda o loop completo
> (Especificar já feito aqui → Construir → Revisar com architect → aprovar) antes de passar à seguinte.

---

## 1. A DOR DO CEO (em uma frase)
O CEO precisa de um lugar único para CRIAR/EDITAR documentos (RAS jurídico e clínico, orçamentos,
termos, e CLÁUSULAS personalizadas para risco fora do padrão), ESCOLHER um paciente, ENVIAR para
assinatura digital pelo ZapSign por vários canais (e-mail, Google Drive, WhatsApp, Telegram), e usar a
assinatura como TRAVA DE CONSENTIMENTO para o médico dar sequência a um ato com segurança jurídica.

## 2. OBJETIVO (uma frase)
Erguer o **Cartório** como órgão independente (central própria no menu) e ao mesmo tempo acoplado por
"nervos" ao Cockpit e à validação do paciente, reusando o motor de assinatura nativo já criado (Onda F),
sem refazer o que existe e sem tocar no assinador A1 do médico.

## 3. GLOSSÁRIO (siglas e termos)
- Cartório = nome PROPOSTO deste órgão (documentos + consentimento). Substituível por decisão do CEO.
- Órgão = módulo autônomo do sistema (tem tela, dados e regras próprios).
- Nervo = ligação de leitura entre órgãos (um órgão consulta outro sem se fundir a ele).
- ZapSign = provedor de assinatura eletrônica em nuvem, validade jurídica no Brasil (conta do CEO).
- TCLE = Termo de Consentimento Livre e Esclarecido. RAS = Registro de Administração de Substâncias.
- Cláusula = trecho jurídico avulso que o CEO acrescenta a um documento para um caso específico.
- Template = modelo de documento com lacunas `{{CHAVE}}` que o sistema preenche por paciente.
- Editor rich-text = editor de texto com formatação (negrito, listas, títulos). Proposto: Tiptap.
- Gate / Trava de consentimento = regra que impede um ato clínico de prosseguir sem assinatura válida.
- Cofre = tabela de segredos cifrados (já existe; guarda o token do ZapSign e do bot Telegram).

---

## 4. ANATOMIA — órgão independente com nervos (decisão do CEO: opção C)

```
                         ┌──────────────────────────────────────────┐
                         │   CARTÓRIO (órgão independente)            │
                         │   Central no menu "O Ato Médico"          │
                         │   - criar/editar documentos (editor)      │
                         │   - templates + cláusulas                 │
                         │   - enviar a paciente (ZapSign)           │
                         │   - linha do tempo de TODAS as assinaturas│
                         └───────┬───────────────┬───────────────────┘
                                 │ nervo         │ nervo
                                 v               v
                ┌────────────────────┐   ┌──────────────────────────┐
                │ COCKPIT do cliente │   │ ATO MÉDICO / Protocolos   │
                │ painel "Documentos │   │ consulta o SELO de        │
                │ & Consentimento"   │   │ consentimento antes de    │
                │ (atalho + status)  │   │ liberar a sequência       │
                └────────────────────┘   └──────────────────────────┘
                                 │ nervo
                                 v
                ┌────────────────────────────┐
                │ VALIDAÇÃO do paciente       │
                │ (CPF+nascimento / código /  │
                │  senha) prova a identidade  │
                └────────────────────────────┘
```

Regra de ouro da anatomia: o Cartório é DONO dos seus dados (tabelas `assinatura_*` da Onda F). Os
outros órgãos só LEEM dele por função pública (nervo), nunca alteram suas tabelas direto.

---

## 5. REUSO — o que JÁ existe (não refazer)

| Recurso | Onde está | Uso no Cartório |
|---|---|---|
| Motor de assinatura (enviar, webhook, timeline, PDF assinado) | `lib/assinatura/*`, `routes/assinaturas.ts` | Coração do envio/assinatura |
| 6 tabelas `assinatura_*` (inclui `assinatura_templates`) | `lib/db/src/schema/assinatura.ts` | Documentos, templates, fila, eventos |
| E-mail (Gmail) | `lib/google-gmail.ts` / `lib/email-service.ts` | Canal de distribuição |
| WhatsApp (Twilio + fallback wa.me) | `lib/whatsapp.ts` (`sendWhatsapp`) | Canal de distribuição |
| Google Drive (pasta do paciente) | `lib/google-drive.ts` (`uploadFileToDrive`) | Canal + arquivamento |
| Validação do paciente (CPF+nascimento, código, token) | `routes/client-portal.ts`, `lib/portal-token.ts`, `routes/validation-codes.ts` | Nervo de identidade |
| Cockpit DTO | `routes/cockpit.ts` (`GET /api/cockpit/:clientId`), `pages/cockpit/index.tsx` | Onde mora o atalho |
| Roteamento/menu frontend | `App.tsx` (wouter), `components/layout/Layout.tsx` | Registrar a central |

| Recurso | Status | Ação |
|---|---|---|
| Editor rich-text | NÃO existe | Instalar Tiptap (decisão técnica delegada ao Paxter) |
| Telegram | NÃO existe | Criar `lib/telegram.ts`; exige bot token (só o CEO cola) + onboarding do chat |

---

## 6. ÍNDICE DAS ONDAS (a multi-spec)

| Onda | Spec | Entrega | Depende de |
|---|---|---|---|
| 1 | `cartorio-onda-1-central-editor.md` | Central no menu + editor + criar/enviar documento a 1 paciente | Onda F |
| 2 | `cartorio-onda-2-cockpit.md` | Atalho/painel "Documentos & Consentimento" dentro do Cockpit | Onda 1 |
| 3 | `cartorio-onda-3-multicanal-telegram.md` | Distribuição multicanal (e-mail/Drive/WhatsApp) + Telegram novo | Onda 1 |
| 4 | `cartorio-onda-4-trava-consentimento.md` | Selo de consentimento + nervo que trava o ato sem assinatura | Onda 1 |
| 5 | `cartorio-onda-5-contexto-clausulas.md` | Contexto clínico no editor + biblioteca de cláusulas reutilizáveis | Onda 1 |

Ordem recomendada de construção: 1 → 2 → 4 → 3 → 5 (entregar valor central e a trava jurídica antes de
multicanal e biblioteca). Confirmável pelo CEO.

---

## 7. LINHAS VERMELHAS (valem para TODAS as ondas)
1. NÃO tocar o assinador A1 nativo (`pdf-signer.ts`, `cert-source.ts`) — ele segue para o médico/RAS.
2. NÃO mudar o motor clínico (`computeMotor`/`motor-anamnese.ts`) nem o motor de orçamento por causa disto.
3. NUNCA logar/exibir token do ZapSign ou do Telegram (só `{ isSet, masked }`); o CEO é quem cola no cofre.
4. Conceito-raiz: dado nasce NATIVO do Paxter, sem tag/prefixo/id de origem.
5. Toda tela nova segue o padrão 3D Paxter (navy + ouro) da skill `skill-layout-paxter` (relevo, vocabulário).
6. Não criar solicitação órfã: sem paciente válido + ao menos um canal de contato, o envio é bloqueado.
7. Não reverter status jurídico: assinatura CONCLUÍDA nunca volta atrás por falha de arquivamento/notificação.

## 8. DEFINIÇÃO DE PRONTO (global)
| Critério | Conferido por |
|---|---|
| Cada onda cumpre 100% da sua spec | architect (Fase 3) por onda |
| Validado em runtime real (curl + screenshot da tela) | execução, não "compilou" |
| Nenhuma linha vermelha violada | leitura do diff |
| Comunicação ao CEO em Densidade B, com "RESUMO EM 1 LINHA" | replit.md Art.37-51 |

## 9. O QUE SÓ O CEO FAZ
1. Colar o token do ZapSign no cofre (já previsto na Onda F) — sem ele, tudo roda em MODO MOCK (teste).
2. Para Telegram: criar um bot no BotFather e colar o token do bot no cofre (Onda 3).
3. Confirmar o NOME do órgão ("Cartório" ou outro) e a ordem de construção das ondas.

---

RESUMO EM 1 LINHA: o Cartório é um órgão independente para criar, assinar (ZapSign) e arquivar qualquer
documento do paciente e travar atos clínicos por consentimento, reusando o motor da Onda F e ligado por
nervos ao Cockpit, ao Ato Médico e à validação — entregue em 5 ondas, cada uma com seu próprio loop.
