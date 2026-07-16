---
name: Regra de Ouro — Nunca Destruir
description: Lei máxima do sistema PAXTER — preservação total de código, telas e schema. Decisão do CEO em 16/07/2026.
---

# Regra de Ouro PAXTER — Nunca Destruir

**Decisão do CEO Dr. Caio — 16/07/2026. Irrevogável.**

## A Regra

O CEO está investindo sua vida neste sistema. Nenhuma linha de código, tabela, coluna, rota ou tela pode ser destruída sem ordem EXPLÍCITA e ESCRITA do CEO com confirmação dupla.

## Como Aplicar

| Situação | Ação CORRETA | Ação PROIBIDA |
|---|---|---|
| Preciso remover uma tabela | Adicionar coluna `arquivado_em` (soft delete) | DROP TABLE |
| Preciso remover uma coluna | Deixar a coluna, parar de usar | DROP COLUMN |
| Uma tela ficou obsoleta | Tirar do menu — manter o arquivo | Deletar o arquivo .tsx |
| Um schema precisa mudar | ADD COLUMN + migração nova | ALTER COLUMN / DROP |
| Uma rota não é mais usada | Manter a rota, documentar como legado | Deletar a rota |
| Código precisa ser refatorado | Criar arquivo novo _v2, manter o antigo | Sobrescrever e apagar |
| TRUNCATE necessário | Pedir confirmação escrita do CEO, dry-run antes | Executar sem confirmação |

## Por Que Existe

O CEO disse literalmente: "estou dando a minha vida nisso". O sistema tem histórico clínico real, dados de pacientes reais, anos de construção. Uma exclusão irreversível pode destruir algo que nunca volta.

## Exceções

Não existem exceções automáticas. Qualquer exceção requer:
1. CEO pedir explicitamente por escrito
2. Agente confirmar o que será destruído e o impacto
3. CEO confirmar uma segunda vez
4. Agente executar — nunca antes

## Relação com outras regras

Esta regra tem precedência sobre qualquer "limpeza de código", "refatoração", "simplificação" ou "remoção de dívida técnica" que eu mesmo proponha. Se entrar em conflito com uma sugestão minha de melhoria, a preservação vence sempre.
