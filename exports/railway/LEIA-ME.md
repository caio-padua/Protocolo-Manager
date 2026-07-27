# Carga de dados Padcon Conect -> Railway (gerado 27/07/2026)

Origem: banco de desenvolvimento do Replit (75 MB, 155 tabelas).
Destino: Postgres do Railway (projeto padaxor-sistema).

## Conteudo do pacote

| Arquivo                  | O que e                                              | Quando rodar |
|--------------------------|------------------------------------------------------|--------------|
| 00-extras-estrutura.sql  | CREATE TABLE das 28 tabelas fora do schema Drizzle   | SO se o boot do api-server ainda nao as criou |
| 01-truncate.sql          | TRUNCATE CASCADE das 155 tabelas (limpa seeds)       | Sempre, antes da carga |
| 02-dados.sql             | Dados completos (COPY) + ajuste de sequences (setval)| Sempre, por ultimo |

## Ordem de execucao (Dr. Code)

    export R="postgresql://...railway..."   # URL do Postgres do Railway
    # 1. conferir se as 28 extras existem (o api-server cria no boot):
    psql "$R" -t -A -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'"
    #    se der ~127: rodar primeiro  psql "$R" -v ON_ERROR_STOP=1 -f 00-extras-estrutura.sql
    #    se der ~155: pular o passo acima
    psql "$R" -v ON_ERROR_STOP=1 -f 01-truncate.sql
    psql "$R" -v ON_ERROR_STOP=1 -f 02-dados.sql

## Avisos

1. 02-dados.sql usa DISABLE TRIGGER (contorna FKs circulares, ex.: empresas).
   O usuario do Railway e dono das tabelas, entao funciona sem superuser.
2. A carga APAGA o que estiver no Railway antes de inserir (truncate).
   Nao rodar depois que houver dados reais criados em producao.
3. Volumetria esperada apos a carga: clients=3683, exam_results=24287,
   exam_documents=644, sessions=291, protocols=30, professionals=15, locations=17.
4. Depois da carga: ativar o backup automatico do Postgres no painel do Railway.
