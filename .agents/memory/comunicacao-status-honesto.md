---
name: Painel de status honesto (erro != desligado)
description: Em consoles que mostram status real de canal/integração, falha de leitura NUNCA pode aparecer como "não configurado".
---

# Painel de status: erro de leitura ≠ "desligado"

Regra: quando uma tela mostra o estado verdadeiro de um canal/integração a partir de um fetch de
status, ela DEVE distinguir três estados, não dois:

1. carregando (pending)
2. ERRO ao consultar (fetch falhou / API fora) → rótulo "Indisponível", LED vermelho
3. resposta chegou → ligado (verde) ou desligado (âmbar)

**Por quê:** se o hook devolve `status=null` em erro e a tela faz `!!status?.canal`, todo canal vira
`false` e a UI mostra "Não configurado" — isso é DESONESTO (confunde falha operacional com ausência
de configuração) e viola a premissa do CEO de "nada simulado, estado verdadeiro". Foi exatamente a
pendência média que o architect apontou na entrega do menu "Comunicação".

**Como aplicar:** o hook expõe `{status, loading, error}`; a vela/badge recebe `pending` e `error`
com prioridade `pending > error > on`. Placeholders intencionais (ex.: OneDrive "Em breve") NÃO
recebem `error` — são desligado de propósito, não falha.
