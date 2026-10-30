# Conjuntos pessoais de exames

## Objetivo
Reutilizar seleções pessoais do catálogo durante o atendimento, sem emitir ou enviar documentos.

## Requisitos
1. Conjuntos pertencem ao médico autenticado e à clínica/empresa autorizadas pelo vínculo do cliente ativo. Identidades nunca vêm do corpo da requisição.
2. Criar com nome e identificadores reais (1–100, distintos); guardar nomes/códigos como memória de itens removidos. Não inferir equivalências.
3. Listar, renomear, editar a seleção e arquivar sem apagar registros nem alterar pedidos anteriores.
4. Resolver cada identificador no catálogo atual. Mostrar desativados/removidos; aplicar somente disponíveis, somando às caixinhas atuais, sem emissão/envio.
5. Reusar componentes e estilos existentes no painel do Cockpit, sem navegar ou trocar o cliente.
6. Recusar acesso cruzado entre médicos, clínicas e empresas, inclusive atualização por identificador conhecido.
7. Integração com rascunhos: se a gravação local falhar, preservar a única cópia em memória em revalidações temporariamente indisponíveis; editor oculto/bloqueado até nova autorização. Recusa explícita de acesso remove o editor.

## Casos extremos
Catálogo indisponível, sessão trocada, resposta após troca de cliente, conjunto arquivado, nome vazio, IDs inválidos/duplicados, catálogo removido ou desativado após salvar. Edição pode preservar itens indisponíveis já salvos, nunca introduzir IDs inexistentes.

## Pronto
Testes de rotas com autenticação, isolamento, CRUD não destrutivo, hidratação e validação; testes de interface para aplicação sem emissão, manutenção do cliente e avisos. Compilação e verificação do serviço.

## Linhas vermelhas
Nenhuma alteração no motor de emissão, mensageria, histórico ou seleção de cliente. Apenas migração aditiva. Arquivar nunca apaga.
