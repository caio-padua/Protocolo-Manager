# Rascunhos clínicos persistentes

## Objetivo
Preservar receitas e pedidos de exames do cockpit após navegação, recarga e falha de emissão.

## Requisitos
1. Salvar neste navegador cada alteração clínica, sem debounce, em chave versionada com empresa, clínica, médico autenticado, paciente e tipo de documento. Não usar médico selecionado manualmente nem nomes como identidade.
2. Somente abrir o editor após validar o contexto clínico no servidor. Na revalidação da mesma identidade, preservar o editor em memória, oculto e bloqueado durante a checagem; remontar apenas quando mudar o contexto confirmado ou houver recusa de autorização, sem transportar campos ou resultados.
3. Ao reencontrar rascunho, exigir recuperação explícita ou descarte confirmado. Informar paciente, médico, clínica e limitação ao navegador atual.
4. Receita inclui fórmulas editadas, ativos, tomadas, duração, CID, farmácia padrão e roteamentos. Exames incluem carrinho, observação e modalidade de documentos.
5. Falhas de emissão não apagam dados. Sucesso confirmado remove apenas o rascunho emitido. Respostas atrasadas não alteram outro contexto; bloquear edição durante emissão.
6. Falhas de armazenamento, formato inválido e conflito entre abas são explícitos, nunca silenciosamente sobrescritos. Descarte exige confirmação; cancelar não muda nada.
7. Testes de navegador interceptam todas as APIs; nenhuma receita, PDF, mensagem ou integração real é disparada.

## Casos extremos
Troca rápida de paciente/médico/clínica, contexto indisponível, recarga, erro HTTP, resposta tardia, armazenamento bloqueado/cheio, versão inválida e outra aba alterando o mesmo rascunho.

## Pronto
Testes automatizados dos dois painéis cobrem persistência, recuperação, descarte, falha/sucesso e isolamento; conferir capturas dos estados recuperáveis sem dados reais.

## Linhas vermelhas
Não alterar motores, destinatários nem contratos de emissão. Não armazenar credenciais no rascunho. Não emitir documentos ou mensagens reais para validar. Não apagar documentos clínicos: descarte atua somente no rascunho local, mediante confirmação.
