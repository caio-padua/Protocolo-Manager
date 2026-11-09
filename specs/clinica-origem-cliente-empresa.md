# Clínica de origem do cliente

## Objetivo
Exibir e registrar a clínica de origem como empresa cadastrada, sem confundi-la com o local ou a agenda.

## Requisitos
1. Os formulários de inclusão e edição apresentam clínicas ativas cadastradas como empresas, no formato nome (razão social).
2. A clínica de origem é um dado informativo independente da empresa de isolamento, do local e das preferências de agenda; não transfere prontuários nem concede acesso.
3. Cadastro e edição persistem o vínculo selecionado, com validação no servidor; cadastro sem escolha usa a empresa autenticada.
4. Os clientes existentes do ambiente de desenvolvimento são preenchidos com o Instituto Pádua após conferir sua identidade, preservando os locais e demais dados.
5. Não exibir empresas arquivadas ou cadastros que não sejam clínicas ativas como novas escolhas. Preservar referência já existente mesmo se desativada.
6. Erro ao carregar a lista não deve parecer lista vazia e não deve apagar a escolha existente.

## Impacto e falhas previstas
- Empresa de isolamento, local, recursos da agenda e histórico clínico não podem ser trocados por uma seleção informativa.
- Mudanças concorrentes no vínculo devem ser protegidas ou evitadas; servidor valida identificação da empresa.
- Atualização em lote é autorizada pelo responsável exclusivamente para este ambiente e somente após verificar os dados; a coluna nova não sobrescreve vínculos antigos.
- Uma clínica excluída da lista de opções ou sem razão social deve ser indicada com clareza, sem criar dados.
- O antigo padrão de local 8 pertence a outra empresa no banco atual; usá-lo em novo cadastro viola a validação. Novo cliente sem local escolhido permanece sem local, sem inventar uma agenda. O local antigo de clientes existentes é preservado.
- A alteração estrutural é idempotente. A atribuição ao Instituto Pádua é operação única e explícita de desenvolvimento; não é repetida em produção, em inicialização ou em cada migração.
- A mudança é aditiva, sem empurrar esquema automaticamente com risco de exclusão de colunas.

## Pronto
Contratos de criar, editar e reler verificados; autorização e isolamento testados; banco confirma clientes preenchidos e locais preservados; telas verificadas; revisão independente identifica nenhum impeditivo.
