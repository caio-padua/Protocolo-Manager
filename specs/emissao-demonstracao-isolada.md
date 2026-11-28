# Emissão isolada de demonstração de receitas e exames

## Objetivo

Permitir ao médico autenticado gerar documentos de demonstração pelo motor existente,
com itens do sistema e cliente selecionado, sem efeitos de uma emissão clínica.

## Requisitos

1. O Cockpit oferece uma ação explícita de teste em Prescrição de Fórmulas e outra em Pedidos de Exames.
2. As ações usam o médico autenticado, a clínica e o cliente autorizados e um certificado válido do médico.
3. Cada página apresenta aviso destacado: "HOMOLOGAÇÃO — DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA".
4. Os motores existentes produzem o conteúdo e o modelo 3A-1C; textos que apresentem a demonstração como prescrição ou solicitação clínica são omitidos.
5. As demonstrações são armazenadas em local privado separado, sem entrar no histórico clínico nem nas rotas públicas ou de reenvio.
6. A recuperação exige autenticação e revalida médico, cliente, clínica e permissão; respostas não são armazenadas no cache do navegador.
7. Não alterar lembretes, consumir numeração regulatória, gerar links públicos, enviar mensagens ou encaminhar à farmácia.
8. Manter acessíveis os testes criados pelo médico para o cliente selecionado após recarregar a tela.
9. Preservar fluxos clínicos existentes e não mudar o motor de desmembramento.

## Impacto e falhas previstas

| Falha | Barreira e recuperação |
|---|---|
| Sessão, médico, clínica ou cliente incorretos | Negar antes de assinar ou gravar; manter rascunho. |
| Certificado ausente, vencido ou de outro titular | Negar antes de gravar; informar erro sem expor segredos. |
| Aviso ausente em páginas adicionais | Desenhar o aviso em cada página antes da assinatura; testar páginas múltiplas. |
| Texto contraditório de prescrição ou pedido real | Substituir o texto introdutório somente no modo de demonstração. |
| Tentativa de envio, reenvio ou link público | Guardar em prefixo privado exclusivo não consumido por rotas clínicas. |
| Falha ou resposta perdida ao gravar | Avisar resultado incerto e oferecer consulta aos documentos de teste existentes, sem repetição automática. |
| Troca de cliente durante resposta | Não mostrar nem abrir resposta recebida para outro cliente. |
| Dados editados ou fora do catálogo de exames | Validar exames no servidor; não inventar doses nem instruções. |
| Testes agressivos afetarem dados reais | Usar dados sintéticos e serviços simulados nas verificações automatizadas. |

## Pronto

Autorização, identidade, assinatura, isolamento, recuperação, ausência de efeitos
e apresentação do aviso comprovados; captura de tela e revisão independente
conforme disponíveis. Sem evidência obrigatória, não declarar homologação.

## Linhas vermelhas

Não alterar cálculo de orçamento ou desmembramento; não excluir dados; não usar
certificado real nos testes automatizados; não enviar documentos ao cliente.
