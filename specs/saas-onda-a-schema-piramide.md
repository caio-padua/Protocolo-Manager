# SPEC A — Schema da Pirâmide de Licenciamento PAXTER

Data: 16/07/2026
Autor: Dr. Replit Paxter
Status: APROVADO PARA CONSTRUÇÃO (ordem CEO Dr. Caio)
Método: Paxter Loop

## Objetivo
Adicionar os campos da pirâmide de licenciamento à tabela `empresas` existente,
vincular `locations` a uma empresa via FK aditiva, e backfill dos dados
conhecidos (Instituto Pádua = propria, Barakat e Paluzze = licenciadas_direta).

## Requisitos

1. ADD COLUMN `tipo_licenciamento` TEXT na tabela `empresas`
   - Valores: propria | sub_unidade | licenciada_direta | licenciada_por_clinica
   - Default: 'propria'

2. ADD COLUMN `empresa_mae_id` INTEGER na tabela `empresas`
   - FK self-referencing → empresas.id
   - NULL = raiz da hierarquia

3. ADD COLUMN `royalty_percent` NUMERIC(5,2) na tabela `empresas`
   - Percentual que a empresa repassa ao PAXTER quando licencia outra
   - Default: 30.00 (regra da carta: 30%)

4. ADD COLUMN `valor_mensal_contrato` NUMERIC(10,2) na tabela `empresas`
   - Mensalidade que esta empresa paga (ao PAXTER ou à clínica mãe)
   - NULL = não paga (platform_owner ou propria sem contrato)

5. ADD COLUMN `is_platform_owner` BOOLEAN DEFAULT FALSE na tabela `empresas`
   - Somente 1 empresa = true: a empresa-mãe PAXTER (Dr. Caio)

6. ADD COLUMN `empresa_id` INTEGER na tabela `locations`
   - FK → empresas.id ON DELETE SET NULL
   - NULL = pertence ao tenant padrão (Instituto Pádua, id=1)

7. Schema push via `pnpm --filter @workspace/db run push`

8. Backfill de dados conhecidos via SQL/seed:
   - Empresa 1: Instituto Pádua (propria, isPlatformOwner=false)
   - Empresa 2: PAXTER Serviços Ltda (propria, isPlatformOwner=true) — a HQ
   - Empresa 3: Barakat (licenciada_direta, valorMensalContrato=500)
   - Empresa 4: Paluzze (licenciada_direta, valorMensalContrato=500)
   - Empresa 5: Clínica Barros (licenciada_por_clinica, empresaMaeId=4, valorMensalContrato=300)
   - locations existentes → empresaId = 1 (Instituto Pádua)

## Casos extremos
- Nunca DROP nem TRUNCATE — só ADD COLUMN
- empresaMaeId = NULL significa raiz (platform_owner ou propria independente)
- locations sem empresaId → tratadas como do tenant 1 (backward compatible)

## Linhas vermelhas
- NUNCA dropar coluna existente
- NUNCA alterar colunas existentes (só ADD)
- NUNCA truncar a tabela empresas

## Definição de PRONTO
- `pnpm --filter @workspace/db run push` sem erro
- SELECT count(*) FROM empresas >= 5 linhas
- SELECT count(*) FROM locations WHERE empresa_id IS NOT NULL > 0
