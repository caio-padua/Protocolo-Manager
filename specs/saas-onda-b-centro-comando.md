# SPEC B — Centro de Comando PAXTER (UI da Pirâmide)

Data: 16/07/2026
Autor: Dr. Replit Paxter
Status: APROVADO PARA CONSTRUÇÃO
Método: Paxter Loop

## Objetivo
Construir a tela "Empresas Licenciadas" (rota /cadastros/empresas-licenciadas)
com: pirâmide visual de tenants, cards de empresa com tipo/status/plano,
CRUD de empresa com tipo de licenciamento, e painel de receita PAXTER (royalties).

## Requisitos

### Tela principal — EmpresasLicenciadas.tsx

1. Header: ConsoleShell com ícone Building2, título "Centro de Comando PAXTER",
   subtítulo "Pirâmide de licenciamento — clínicas, sub-unidades e royalties"

2. Painel KPI superior (3 cards concave-3d):
   - TENANTS ATIVOS (count de empresas ativas)
   - RECEITA MENSAL (soma valorMensalContrato de licenciadas_direta + royalties de sub-níveis)
   - ROYALTIES (soma de royalties recebidos de licenciadas_por_clinica)

3. Pirâmide visual (árvore):
   - Nível 0: PAXTER (platform_owner) — faixa navy com wordmark
   - Nível 1: propria (Instituto Pádua) + licenciadas_direta (Barakat, Paluzze)
   - Nível 2: sub_unidades e licenciadas_por_clinica
   - Cards conectados por linhas verticais/horizontais (CSS puro, sem lib externa)
   - Cor por tipo: propria=verde-petróleo, licenciada_direta=ciano, sub_unidade=slate, licenciada_por_clinica=ouro

4. Tabela de empresas (abaixo da pirâmide):
   - Colunas: Nome | Tipo | Status | Plano Mensal | Royalty % | Empresa Mãe | Ações
   - Ações: Editar, Configurar Drive (se driveFolderEmpresaId vazio), Ver detalhes

5. Botão "Nova Empresa" (btn-3d) → abre modal de criação

6. Modal de empresa (criar/editar):
   - Campos: nome, cnpj, tipoLicenciamento (select), empresaMaeId (select condicional),
     valorMensalContrato, royaltyPercent, status, donoNome, telefone, emailGeral

7. Botão "Configurar Drive" por empresa:
   - POST /api/empresas/:id/setup-drive
   - Feedback de loading + resultado (folderUrl)

### Painel de receita (accordion ou aba separada)

8. Cálculo em tempo real:
   - Para cada licenciada_direta: soma valorMensalContrato
   - Para cada licenciada_por_clinica: soma (valorMensalContrato * royaltyPercent / 100)
   - Total = soma de todos
   - Exibir breakdown por empresa (tabela emoldurada)
   - Projeção anual = total_mensal * 12

## API necessária
- GET /api/empresas (já existe) — adicionar campo tipoLicenciamento no retorno
- POST /api/empresas (já existe)
- PUT /api/empresas/:id (já existe)
- POST /api/empresas/:id/setup-drive (NOVA — Spec C)
- GET /api/empresas/hierarquia (NOVA) — retorna árvore com parent-children

## Casos extremos
- empresa sem empresaMaeId = raiz (nível 1)
- royaltyPercent NULL → tratar como 0
- sem Drive configurado → botão "Configurar Drive" em destaque amber

## Linhas vermelhas
- Não deletar empresas pela UI (só suspender via status)
- Não expor tokens/credenciais na tela
- Não misturar este Centro de Comando com a tela Governança (permissões) existente

## Definição de PRONTO
- Tela renderiza sem erro com empresa data real do banco
- Pirâmide exibe hierarquia correta
- CRUD cria/edita empresa e persiste no banco
- Painel de receita calcula corretamente (R$ 500 + R$ 500 + R$ 90 = R$ 1.090 com dados de exemplo)
- Screenshot do CEO confirma aprovação visual
