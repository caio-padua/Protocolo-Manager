---
name: paxmed-loop
description: "PAXMED Loop: ciclo de 9 passos para toda entrega nao-trivial no PAXMED (especificar, inspecionar, planejar impacto, implementar em dev, testar, conferir visual desktop+mobile, logs, evidencias, entregar a 98% e pausar para aprovacao do Dr. Caio). Usar em qualquer funcionalidade nova, principalmente PAX FINANCE, dinheiro, dados fiscais ou multiempresa."
---

# PAXMED Loop

Complementa o `paxter-loop` (leia tambem `.agents/skills/paxter-loop/CODIGO-PAXTER.md`). Vale para o agente Dr. Replit PaxMed.

## Os 9 passos

| N | Passo | O que fazer | Prova exigida |
|---|---|---|---|
| 1 | Especificar | Escrever o pedido em tópicos: resultado, o que NÃO fazer, dados sensíveis | texto no chat ou arquivo de spec |
| 2 | Inspecionar | Ler código, banco e menus reais antes de afirmar algo | comandos/consultas executados |
| 3 | Planejar impacto | Listar tabelas, rotas, telas, migrações; marcar o que é só aditivo | lista de impacto |
| 4 | Implementar em dev | Só ambiente de desenvolvimento; migração aditiva e idempotente; nada destrutivo | diff + migração espelhada em `scripts/migrations/` |
| 5 | Testar | Unitário, integração com Postgres descartável, ISOLAMENTO MULTIEMPRESA (empresa B nunca vê/edita dado da A), UI | vitest `--maxWorkers=1` verde |
| 6 | Conferir visual | Desktop e celular, tema claro e escuro; alvos de toque >= 44px | captura de tela ou declarar "não capturado" |
| 7 | Logs e regressões | Reiniciar o workflow, ler logs, conferir telas vizinhas e menu | logs sem erro novo |
| 8 | Evidências | Tabela Nível (SMOKE/DADO/VISUAL/LOG) x Esperado x Obtido x Passou | tabela no relatório |
| 9 | Entregar a 98% e pausar | Relatar o que funciona, o que é rascunho, o que falta. PARAR e pedir aprovação expressa do Dr. Caio antes de produção, publicação, envio externo, escolher empresa para dado antigo ou mudar tabela existente | pergunta ao CEO |

## Regras fixas

1. Nunca marcar concluído o que é só visual, simulado ou sem teste. Separar "visto em tela" de "só no código".
2. Dinheiro em centavos inteiros no banco; exibição sempre por `Valor`/`Percentual` do Numeral.
3. Nenhuma alíquota, limite ou regra legal embutida em código: vem de regra versionada, aprovada, com fonte oficial, endereço e data. Sem fonte = "Aguardando verificação".
4. Empresa vem sempre da sessão; todo SELECT/UPDATE/DELETE filtra por `company_id`.
5. Dado de documento entra como rascunho; "validado" só por conferência humana registrada.
6. Dado ausente aparece com rótulo ("Não informado", "Aguardando documento"), nunca vazio.
7. Regra de Ouro: não apagar dados, arquivos ou menus; desativar mantendo no menu.
8. Não enviar documento financeiro real a provedor de IA sem validar privacidade e consentimento. Maia não existe: não afirmar que existe.
9. Typecheck global do padcom é pré-quebrado: filtrar `tsc` pelos arquivos tocados.
