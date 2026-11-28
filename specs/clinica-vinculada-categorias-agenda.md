# Clínica vinculada e categorias no Motor de Agenda

## Objetivo
Padronizar o nome visível do vínculo de clínica no cadastro do cliente e do profissional e permitir que o Motor de Agenda utilize categorias profissionais reais, sem enfraquecer autorização ou modificar dados existentes.

## Requisitos
1. Usar o rótulo “Clínica vinculada” nos dois cadastros e identificar cada opção por nome, razão social e Cadastro Nacional da Pessoa Jurídica (CNPJ), com ausência explícita.
2. Manter os vínculos persistidos e as diferenças entre clínica do cliente, empresa responsável, clínica de origem do profissional e locais de atendimento; não transferir clientes nem desligar agendas.
3. Preservar os valores antigos do campo textual de unidade e evitar sua confusão com o vínculo empresarial.
4. Listar categorias profissionais ativas existentes no cadastro no Motor de Agenda, inclusive categorias criadas posteriormente, preservando os recursos legados.
5. Selecionar e validar categoria, profissional e local reais e compatíveis; um registro não pode ser classificado como outra profissão apenas por possuir nome semelhante.
6. A categoria não confere permissão. Validar no servidor sessão, clínica, profissional, local, categoria e autorização; alterações concorrentes ou incompatíveis devem falhar claramente.
7. Manter a reserva de protocolos e as integrações externas existentes, sem apresentar a seleção de categoria como agendamento concluído.

## Falhas e barreiras
- Dados antigos ou inativos: preservar a exibição e evitar apagar ou inferir vínculos.
- Clínica ou profissional de outra empresa: impedir acesso e escrita por validação no servidor; testar isolamento.
- Nome igual, razão social ou CNPJ ausentes: identificar por chave estável e apresentar ausência, nunca inventar.
- Categoria alterada ou inativada: revalidar no servidor e impedir ligações inválidas.
- Categoria selecionada apenas na tela: não considerar concluído sem persistência e leitura coerente.
- Inicialização do servidor tem efeitos de escrita: não reiniciar até demonstrar uma forma segura; testes de regressão e segurança usam banco descartável.

## Critérios de pronto
Testes isolados de persistência, categorias novas, vínculos válidos e inválidos entre duas clínicas, cliente, profissional, concorrência e sessão; revisão independente; verificações visuais de computador e celular; registro dos comandos, evidências e limitações. Compilação isolada não homologa.

## Situação da revisão
Bloqueado: a revisão independente constatou que o Motor ainda aceita apenas médico/enfermagem e que um teste antigo simulava uma troca de clínica incompatível com o local existente. O teste de interface foi ajustado para distinguir local ausente de recusa com local preservado, mas continua com respostas simuladas. Ainda faltam o modelo e a ligação real de categorias, os testes contra servidor e banco descartável, o fluxo seguro para troca de clínica com dependências existentes e a verificação autenticada. O servidor em uso não foi reiniciado: existem escritas durante o boot. O CNPJ no endpoint do cliente só estará disponível após atualização segura do servidor.

## Restrições
Não publicar, enviar mensagens, alterar agendas ou cadastros existentes automaticamente, remover menus, ou tocar cálculo de orçamento.
