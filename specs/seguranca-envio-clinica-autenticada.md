# Segurança dos envios: clínica autenticada

## Objetivo
Impedir envio do guia e de texto Telegram a clientes de outra clínica.

## Escopo autorizado
1. Proteger POST /onboarding/enviar-guia e POST /cockpit/:clientId/telegram-inbox/enviar.
2. Verificar assinatura do token existente e carregar vínculo explícito por professionalId no banco em toda requisição.
3. Reutilizar a associação única `professionals.empresa_id`, consultada por resolveOnboardingClinic, sem inferir por nome, cargo ou local de atendimento.
4. Não aceitar empresaId, tenant, cabeçalhos ou privilégios legados do navegador como autorização.
5. Exigir profissional ativo, clínica ativa e cliente pertencente à clínica do vínculo.
6. Negar sem vínculo, vínculo desativado, token inválido ou falha de consulta; não enviar, reservar quota, alterar cooldown ou registrar mensagem.
7. Não conceder permissão global ao médico principal; ele também precisa de vínculo explícito.
8. Cadastrar/revogar vínculos somente por comando administrativo no servidor, sem endpoint web de autoatribuição.
9. Não modificar autenticação global, licenciamento, cobranças nem outros fluxos.
10. A tela do guia deve enviar o token do colaborador e exibir a recusa do servidor sem anunciar sucesso.

## Implantação e operação
O projeto principal incorporou simultaneamente o vínculo em professionals.empresa_id e sua migração aditiva.
Reutilizar esta fonte, sem uma tabela paralela nem concessões automáticas: ausência de vínculo bloqueia os dois envios.
O administrador cadastra pares verificados com o comando documentado em docs/autorizacao-envios-clinica.md.

## Pronto
Testes com rotas, autenticação e middlewares reais, substituindo apenas banco e provedores:
caminho autorizado para ambas as clínicas; acesso cruzado nos dois sentidos; tentativa de override;
token ausente/inválido; vínculo ausente/inativo; profissional inativo; clínica inativa;
falha do banco e remoção do vínculo entre chamadas com o mesmo token.
Nenhuma mensagem real, cobrança ou publicação.
