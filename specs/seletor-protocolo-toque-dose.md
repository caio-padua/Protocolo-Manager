# Seletor do lançador de protocolo

## Objetivo
Permitir localizar e selecionar uma substância exata pelo toque ou teclado, exibindo a dose padrão somente quando comprovada.

## Contrato e limites
1. O lançador atual usa substâncias e envia seu identificador, não procedimentos.
2. Não converter o contrato para procedimentos sem integração completa de persistência e consumidores clínicos.
3. Preservar filtros de via, identificação única, seleção anterior, dose editável e intervalo existentes.
4. Exibir nome e dose segura juntos; quando não houver dose inequívoca, solicitar revisão clínica, sem inventar nem exibir volume como dose.
5. Busca local não escolhe automaticamente entre registros homônimos.
6. Lista deve aceitar toque, rolagem, teclado e telas estreitas.

## Falhas previstas e barreiras
- Homônimos: manter identificador de cada cadastro na lista e selecionar pelo identificador exato.
- Dose versus concentração: utilizar o mesmo resolvedor conservador do preenchimento, nunca extrair por aproximação.
- Filtro de via alterado: conservar a seleção já realizada até o usuário escolher outra.
- Lista sem resultados: informar explicitamente sem substituir a seleção.
- Dados indisponíveis: não inventar itens ou registros de procedimentos.

## Verificação
Testar seleção, pesquisa, rolagem, homônimos, dose segura e ausente em tela estreita e ampla com dados isolados; verificar que o formulário segue enviando o identificador selecionado. Não alterar cadastro, documentos, reservas, permissões ou agenda.
