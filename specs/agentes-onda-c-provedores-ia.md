# SPEC — Onda C: 4 Provedores de IA + Painel de Configuração
**Data:** 19/07/2026 | **Status:** APROVADA PARA BUILD

## Objetivo
Nova aba "Provedores IA" na tela de Agentes Virtuais. Mostra os 4 provedores cadastrados, status de conexão, modelos disponíveis e permite definir qual provedor/modelo o agente usa por padrão.

## Os 4 Provedores (todos via Replit AI Integrations — sem chave própria)

| # | Provedor | Empresa | Melhor Modelo | Uso Ideal |
|---|---------|---------|---------------|-----------|
| 1 | **Anthropic Claude** | Anthropic | claude-sonnet-4-6 | Raciocínio clínico, tom de voz preciso |
| 2 | **OpenAI GPT** | OpenAI | gpt-5.6-terra | Tarefas gerais, velocidade |
| 3 | **Google Gemini** | Google | gemini-3.1-pro-preview | Análise de documentos, multimodal |
| 4 | **OpenRouter** | OpenRouter | mistral/mixtral-8x7b | Custo baixo, alto volume |

## Cards de Provedor (UI)
Cada card mostra:
- Logo/ícone do provedor
- Nome + empresa
- Status: ATIVO (verde) | INATIVO (cinza)
- Modelo padrão selecionado (dropdown)
- Latência estimada
- Casos de uso (pills)
- Botão "Testar" → POST de teste e mostra latência real

## Painel de pesquisa "O que há de mais moderno"
Seção colapsável com tabela comparativa:

| Modelo | Provedor | Contexto | Raciocínio | Velocidade | Custo |
|--------|---------|---------|-----------|-----------|-------|
| claude-opus-4-8 | Anthropic | 200k | ⭐⭐⭐⭐⭐ | Médio | Alto |
| claude-sonnet-4-6 | Anthropic | 200k | ⭐⭐⭐⭐ | Rápido | Médio |
| gpt-5.6-terra | OpenAI | 128k | ⭐⭐⭐⭐ | Rápido | Médio |
| gemini-3.1-pro | Google | 1M | ⭐⭐⭐⭐⭐ | Médio | Médio |
| gpt-5.6-luna | OpenAI | 128k | ⭐⭐⭐ | Muito Rápido | Baixo |
| mistral-large | OpenRouter | 32k | ⭐⭐⭐ | Rápido | Baixo |

## Configuração por agente
Cada agente pode ter `provedor_padrao` e `modelo_padrao` configurados.
Dropdown na aba Identidade: "IA padrão: Claude Sonnet ▼"

## Frustração do CEO — Como começar a operar e vender licenças
Seção especial na aba Provedores: "PLANO DE LANÇAMENTO"
```
PASSO 1 → Operação interna (hoje):
  Usar o sistema para gerenciar os próprios clientes da clínica.
  Meta: 10 clientes gerenciados no PAXTER antes de vender para outros.

PASSO 2 → Primeira licença (2-4 semanas):
  Montar uma demonstração com dados reais.
  Preço sugerido: R$ 497/mês (plano básico) ou R$ 997/mês (com IA + WhatsApp).
  Canal: Instagram + WhatsApp direto com outras clínicas.

PASSO 3 → Portal de vendas (futuro):
  Tela pública de pricing com checkout Asaas.
```

## Aceite
- [ ] 4 cards de provedor com status
- [ ] Botão "Testar" retorna latência real
- [ ] Tabela comparativa de modelos modernos
- [ ] Dropdown de provedor por agente salva no banco
- [ ] Seção "Plano de Lançamento" visível
