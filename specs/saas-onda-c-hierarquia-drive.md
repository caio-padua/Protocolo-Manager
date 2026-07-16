# SPEC C — Hierarquia Visual + Drive por Empresa

Data: 16/07/2026
Autor: Dr. Replit Paxter
Status: APROVADO PARA CONSTRUÇÃO
Método: Paxter Loop

## Objetivo
1. Substituir o placeholder `hierarquia.tsx` por organograma real consumindo dados do banco
2. Implementar `POST /api/empresas/:id/setup-drive` para criar pasta raiz no Google Drive por empresa

## Requisitos — Hierarquia

1. Página `/hierarquia` exibe organograma real:
   - Busca GET /api/empresas/hierarquia (árvore com parent-children)
   - Renderiza como árvore vertical:
     - Topo: PAXTER (platform_owner)
     - Nível 1: propria + licenciadas_direta
     - Nível 2: sub_unidades + licenciadas_por_clinica
   - Card por empresa: nome, tipo, status, nLocations, donoNome
   - Badge de tipo colorido (propria=teal, licenciada_direta=ciano, sub_unidade=slate, licenciada_por_clinica=ouro)
   - Se empresa tem locations: listar nomes das unidades como pills abaixo do card

2. Linha de conexão entre cards (CSS border-left + before/after, sem SVG complexo)

3. Estado vazio: "Nenhuma empresa cadastrada — acesse o Centro de Comando para adicionar."

## Requisitos — Drive por Empresa

4. Rota: POST /api/empresas/:id/setup-drive
   - Busca empresa no banco
   - Cria pasta raiz: "EMPRESAS/[NOME] [CNPJ]" no Google Drive compartilhado
   - Dentro da pasta raiz, cria subpastas:
     * CLIENTES (pasta raiz de clientes desta empresa)
     * CONTRATOS
     * CERTIFICADOS
     * FINANCEIRO
     * COMUNICAÇÃO
     * DOCUMENTOS
   - Salva `driveFolderEmpresaId` no banco (UPDATE empresas SET)
   - Retorna: { ok: true, folderId, folderUrl }

5. Idempotente: se `driveFolderEmpresaId` já existe, retorna o existente sem recriar.

6. Se Drive não autorizado → retorna 503 com mensagem clara.

## API — GET /api/empresas/hierarquia

Retorna:
```json
{
  "raiz": {
    "id": 2,
    "nome": "PAXTER Serviços",
    "isPlatformOwner": true,
    "filhos": [
      {
        "id": 1,
        "nome": "Instituto Pádua",
        "tipoLicenciamento": "propria",
        "locations": ["Tatuapé", "Mooca", "Domiciliar"],
        "filhos": []
      },
      {
        "id": 3,
        "nome": "Barakat",
        "tipoLicenciamento": "licenciada_direta",
        "filhos": [
          { "id": 5, "nome": "Barakat Rio", "tipoLicenciamento": "sub_unidade" }
        ]
      }
    ]
  }
}
```

## Casos extremos
- Drive não configurado (sem token OAuth) → 503 com instrução clara
- CNPJ vazio na empresa → usar só o nome na pasta
- Pasta já existe (driveFolderEmpresaId preenchido) → retornar existente
- Empresa sem locais vinculados → mostrar "Sem unidades" no card

## Linhas vermelhas
- Não apagar pasta existente no Drive
- Não alterar estrutura de pastas de clientes (PACIENTES/) — só criar raiz da empresa

## Definição de PRONTO
- hierarquia.tsx exibe árvore real com dados do banco
- POST setup-drive cria pasta no Drive e salva folderId no banco
- Hierarquia mostra locations vinculados a cada empresa
