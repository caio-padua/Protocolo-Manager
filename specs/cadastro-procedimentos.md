# Cadastro de procedimentos

## Objetivo e limites

Acrescentar a tela e a entrada de menu "Procedimentos" sem retirar, ocultar ou
alterar as entradas existentes. Procedimento descreve o ato; substância é o
produto já cadastrado. Consultas não exigem substância ou dose. Implantes e
outros procedimentos médicos exigem médico e enfermagem; procedimentos de
enfermagem exigem somente enfermagem. Não inferir classificação pela via.

O cadastro novo é independente do fluxo de protocolo e agenda: não reserva
horários, não cria eventos, não muda o catálogo, não altera protocolos e não
afirma que essas integrações já funcionam.

## Dados e segurança

- Procedimento pertence à clínica identificada pela sessão profissional.
- A clínica efetiva é identificada na tela, inclusive quando a lista está vazia.
- Nome, classificação explícita, descrição opcional e duração opcional.
- Produtos associados por identidade exata do catálogo existente, sem cópia,
  e sem obrigatoriedade para consultas.
- Leituras exigem sessão e empresa autenticadas; escritas são restritas ao
  proprietário da plataforma, conforme a proteção do catálogo compartilhado.
- Toda edição filtra a empresa no servidor. Inativar preserva o registro e os
  vínculos; não há exclusão física. Não semear dados ou alterar registros antigos.
- O armazenamento é aditivo. Uma indisponibilidade do banco gera erro visível,
  não uma lista vazia apresentada como sucesso.

## Falhas previstas e provas

- Recusar entrada inválida, classificação ausente ou produto inexistente.
- Recusar acesso sem sessão e acesso cruzado entre clínicas.
- Gravar procedimento e vínculos na mesma transação; falha não salva parcialmente.
- Testar criar, editar, consultar e inativar em banco descartável com dados
  sintéticos e verificar que produtos originais não são alterados.
- Verificar que todos os menus anteriores continuam no código e o novo endereço
  está protegido. Conferir a tela autenticada em computador e celular quando
  disponível; sem essa prova, não declarar homologação visual.
- Executar revisão independente após a construção, sem alterar regras da agenda.
