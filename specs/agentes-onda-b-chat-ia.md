# SPEC — Onda B: Chat Interno com Agente via IA
**Data:** 19/07/2026 | **Status:** APROVADA PARA BUILD

## Objetivo
Nova aba "Chat IA" na tela de Agentes Virtuais. O médico escolhe um agente, digita uma mensagem e recebe resposta em streaming, com a personalidade e identidade daquele agente aplicada via system prompt montado do banco.

## System Prompt (montagem)
```
Você é {nome}, {cargo} da clínica PAXTER.
Tom de voz: {tom_voz}
Você NUNCA faz: {nao_faz}
Regras de formatação: {regras_tdah}
Frases de escalada disponíveis: {frases_escalada}
{descricao}

Responda SEMPRE em português brasileiro.
Respeite rigorosamente o tom de voz e os limites acima.
```

## Provedor padrão
Claude Sonnet 4.6 (Anthropic via Replit AI Integrations — sem chave própria necessária)

## Seletor de provedor (Onda C alimenta isso)
Dropdown: Claude Sonnet | Claude Opus | GPT-5.6 | Gemini 3.1 | OpenRouter/Mistral

## Animação "homenzinhos trabalhando"
Enquanto o agente "pensa" (streaming ativo), mostrar animação CSS com 3 homenzinhos:
- Figuras SVG minimalistas (círculo cabeça + retângulo corpo)
- Movem braços alternadamente como se digitando
- Cor na cor_hex do agente selecionado
- Balão de fala animado com "..." pulsando

## UI da aba Chat IA
```
┌─ SELETOR DE AGENTE ─────────────────────────────────────┐
│ [Avatar] Aurora ADM ▼    Provedor: [Claude Sonnet ▼]     │
│ "Formal, acolhedor, eficiente..."                        │
└──────────────────────────────────────────────────────────┘

┌─ ÁREA DE CHAT ──────────────────────────────────────────┐
│ (histórico de mensagens)                                 │
│ [VOCÊ]: Confirme o agendamento do João para quinta       │
│                                                          │
│ [AURORA ADM]:                                            │
│  ┌─ ANIMAÇÃO HOMENZINHOS ─┐  (durante o streaming)       │
│  │  🚶‍♂️💻🚶‍♂️           │                               │
│  └────────────────────────┘                              │
│  Perfeito! Estou confirmando o agendamento do João...   │
└──────────────────────────────────────────────────────────┘

┌─ INPUT ─────────────────────────────────────────────────┐
│ [textarea] Digite sua mensagem...        [Enviar →]      │
└──────────────────────────────────────────────────────────┘
```

## Backend
- Rota: `POST /api/agentes-chat` (streaming SSE)
- Body: `{ agente_id, mensagens: [{role, content}], provedor? }`
- Monta system prompt do banco → chama IA → stream de volta

## Aceite
- [ ] Seletor de agente mostra nome + cargo + cor
- [ ] Animação homenzinhos aparece durante streaming
- [ ] Texto chega palavra por palavra (streaming)
- [ ] System prompt usa os dados reais do banco
- [ ] Enter envia, Shift+Enter quebra linha
- [ ] Histórico da conversa mantido durante a sessão
