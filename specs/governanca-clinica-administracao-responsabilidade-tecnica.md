# PAXTER Loop — Administração da clínica e responsabilidade técnica

**Data:** 02/11/2026  
**Status:** etapa 1 implementada localmente; aguardando revisão independente; ainda não homologada
**Escopo:** governança por clínica, identificação do responsável técnico e segurança das rotas de protocolos e RAS/FAP que leem, criam, geram ou entregam documentos clínicos.

## 1. Objetivo

1.1. Separar claramente três poderes:

| Papel | Responsabilidade |
|---|---|
| Proprietário global | Define os administradores das clínicas e mantém a governança global. |
| Administrador da clínica | Concede ou retira permissões locais de profissionais vinculados à própria clínica. |
| Médico responsável técnico | Confere e assina solicitações clínicas que exigem aprovação médica. |

1.2. O administrador local pode ser médico ou não médico, e pode ou não ser o médico responsável técnico.

1.3. Cada clínica ativa deve ter um médico ativo, vinculado à clínica e com registro profissional válido, designado como responsável técnico.

1.4. A enfermagem pode preparar solicitações somente quando autorizada. A aprovação final e a emissão ficam no nome do médico responsável que efetivamente aprovou, preservando separadamente a autoria de quem preparou.

1.5. Nenhum dado enviado pelo navegador concede identidade, vínculo, clínica ou permissão.

## 2. Evidências atuais verificadas no código local

2.1. A tabela e as rotas atuais já representam permissões clínicas por profissional e unidade, incluindo administrador local e médico responsável.

2.2. A rota central de aprovações está registrada no roteador atual. Portanto, a afirmação da auditoria anexada de que ela não estaria registrada não corresponde ao código local conferido.

2.3. A atribuição de administrador local está atualmente limitada à categoria administrativa. Isso impede o cenário autorizado pelo CEO em que um médico também administra a clínica.

2.4. A escolha do responsável técnico está restrita ao proprietário global. O fluxo ainda não permite que o administrador local escolha o médico da própria clínica.

2.5. As rotas de protocolo já usam autenticação de colaborador e verificações de clínica em pontos centrais; o conjunto de testes desta etapa confirma apenas os caminhos cobertos, não uma certificação integral de todos os documentos.

2.6. A auditoria anexada é estática e se refere a uma versão do GitHub. Ela não comprova o estado do banco nem a execução no ambiente atual.

2.7. A rota `GET /ras/physical/:protocolId` não exigia autenticação nem associação do colaborador à clínica do cliente. A proteção local agora exige colaborador autenticado, contexto de clínica válido e vínculo do profissional com o cliente.

2.8. O inventário local encontrou outras rotas RAS/FAP desprotegidas. A proteção local agora cobre listagem, criação, leitura, PDF, envio ao Drive, reenvio de e-mail, histórico de envios e entrega do RAS FAP. O vínculo clínico é verificado antes de gerar ou compartilhar documentos. As rotas de demonstração permanecem separadas e usam dados sintéticos.

2.9. Os testes focados cobrem caminhos autorizados e negados, incluindo bloqueio antes de gerar PDF, gravar RAS, enviar e-mail ou acionar o Drive. As integrações externas são simuladas. A revisão independente ainda precisa confirmar o diff e a correspondência entre esta especificação e o código.

## 3. Regras de autorização

3.1. O proprietário global pode definir ou substituir o administrador local de uma clínica.

3.2. O administrador local pode gerir concessões de prescrição e pedido de exames somente para profissionais ativos e vinculados à própria clínica.

3.3. O administrador local pode designar o médico responsável técnico da própria clínica. A designação exige profissional médico ativo, vínculo válido à unidade e registro profissional válido.

3.4. O administrador local não pode conceder privilégios globais, alterar a matriz global, designar outro administrador local nem administrar outra clínica.

3.5. A matriz global por função continua sendo o teto das permissões. A concessão local pode restringir esse teto, nunca ultrapassá-lo.

3.6. Um profissional não pode aprovar ou assinar a própria solicitação preparada como enfermagem.

3.7. Trocar o responsável técnico não apaga aprovações, solicitações ou trilhas de auditoria anteriores.

3.8. Não se desativa o único responsável técnico vigente sem que outro médico elegível seja designado na mesma operação.

3.9. A luz verde “vela” é somente a representação visual do estado verificado no servidor. Não concede acesso por si só.

## 4. Sequência de execução

| Etapa | Entrega | Critério para avançar |
|---|---|---|
| 1 | Fechar autenticação e isolamento por clínica nas rotas de protocolos e RAS/FAP que leem, alteram, geram ou entregam dados clínicos. | Inventário revisado, testes autorizados e negativos com dados sintéticos; integrações externas simuladas; revisão independente aprovada. |
| 2 | Ajustar a autorização para separar administrador local e médico responsável técnico. | Testes comprovam limites do proprietário global, do administrador e do profissional comum. |
| 3 | Atualizar a governança e o cadastro do Corpo Clínico. | A seleção do responsável e a luz verde refletem o dado persistido, sem autoridade no navegador. |
| 4 | Conferir o quadro real do Instituto Pádua e propor funções por vínculo e categoria. | Revisão individual dos profissionais e do ambiente de dados, sem concessões presumidas. |
| 5 | Aplicar as atribuições somente no banco de desenvolvimento confirmado. | Consulta posterior confirma escopos, vínculos, histórico e ausência de alteração em produção. |
| 6 | Fazer revisão independente e homologação sintética final. | Revisão independente disponível e evidências de servidor, interface, persistência e negações. |

As etapas são sequenciais. Não haverá agentes ou implementações concorrentes; cada etapa precisa ser revisada antes da seguinte.

## 5. Previsão de falhas e respostas

5.1. Clínica ou vínculo enviado pelo navegador não corresponde à sessão: negar a operação e registrar a tentativa sem expor dados de outra clínica.

5.2. Profissional inativo, sem vínculo, sem registro válido ou sem categoria elegível: não permitir designação nem concessão incompatível.

5.3. Clínica sem médico responsável: bloquear novas solicitações que dependam de aprovação e indicar ao administrador que designe um médico elegível.

5.4. Tentativas de remover o único responsável técnico: rejeitar sem modificar a atribuição vigente.

5.5. Resposta do banco incerta ou falha no registro de auditoria: não confirmar a mudança ao usuário; consultar o estado persistido antes de permitir repetição.

5.6. Falha em qualquer checagem de empresa, unidade, profissional ou cliente: negar por padrão.

## 6. Testes obrigatórios

6.1. Administrador local autorizado concede e retira uma permissão dentro da própria clínica.

6.2. Administrador local não altera a matriz global, não concede acesso em outra clínica e não escolhe outro administrador.

6.3. Administrador local designa um médico elegível como responsável técnico.

6.4. Pessoa sem papel administrativo não altera concessões nem designa responsável.

6.5. Médico sem vínculo ou sem registro válido não pode ser escolhido como responsável.

6.6. Clínica não pode ficar sem responsável técnico após uma tentativa de remoção.

6.7. Tentativas de acesso cruzado a protocolos, PDF, atualização e validação são negadas.

6.8. A preparação por enfermagem permanece sem assinatura; a aprovação registra o médico emissor e o profissional preparador.

6.9. Listagem, criação, leitura, geração de PDF, upload para Drive e entrega de RAS/FAP exigem identidade autenticada e vínculo válido à clínica e ao cliente.

6.10. Falha ou ausência de vínculo impede a geração do PDF, alteração de dados, upload e chamada a canais externos.

6.11. Todos os testes usam registros sintéticos. Nenhum e-mail, WhatsApp ou Telegram é enviado.

## 7. Limites explícitos

7.1. Não alterar cobranças, licenciamento comercial nem dados de produção.

7.2. Não atribuir acesso clínico em massa antes de conferir individualmente função, vínculo e escopo de cada profissional.

7.3. Não registrar nem reutilizar a senha enviada em conversa. Ela deve ser considerada exposta; a troca precisa ocorrer por fluxo privado e autenticado da própria conta. A senha do sistema não deve ser copiada para a conta Google.

7.4. A inclusão do e-mail Google é um vínculo de identidade separado. O mesmo endereço pode ser escolhido para o cadastro e para o Google, mas a senha do sistema e a senha Google continuam independentes.

7.5. Nenhuma etapa será declarada concluída sem evidências reproduzíveis e revisão independente. Se o revisor não estiver disponível, o estado final será “bloqueado para homologação”.

## 8. Pendências antes de gravar dados do Instituto Pádua

8.1. Confirmar se o banco de teste é o banco de desenvolvimento do Replit ou uma base externa de teste.

8.2. Consultar, em modo somente leitura, os profissionais e vínculos ativos da clínica no ambiente confirmado.

8.3. Confirmar o identificador do profissional autenticado como proprietário global antes de atribuir funções locais.

8.4. Não alterar produção, credenciais ou dados clínicos reais durante esta etapa.
