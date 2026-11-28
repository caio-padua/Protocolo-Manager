# Dúvidas e Orientações — tela operacional

## Objetivo

Permitir que a equipe consulte e mantenha orientações aprovadas, veja o modo atual do atendimento automático e assuma ou devolva conversas à inteligência artificial, sem enviar mensagens nem ativar o serviço.

## Requisitos

1. A tela fica em `/comunicacao/duvidas-orientacoes` e aparece na navegação permanente da área de Comunicação.
2. A lista é isolada pela empresa que o servidor deriva do profissional autenticado; a tela nunca envia `empresaId`.
3. A equipe pode criar rascunho, editar e inativar orientação; nenhuma dessas ações apaga registros.
4. Somente médico ativo pode aprovar orientação. O estado atual da aprovação e seu responsável devem ficar visíveis.
5. Alterar uma orientação aprovada deve refletir o retorno do servidor como rascunho; a tela não pode exibir aprovação antiga.
6. A tela mostra o modo da inteligência artificial e a situação de revisão das mensagens de queixa como leitura informativa; não oferece botão para ligar o atendimento.
7. A lista de conversas em atendimento humano mostra cliente, motivo e data; ações “Assumir conversa” e “Devolver à IA” usam as rotas existentes e atualizam a lista após sucesso.
8. Toda chamada usa `collabAuthHeaders()`. Erros de autenticação, carregamento, salvamento e atualização são apresentados sem transformar erro em lista vazia.
9. A tela não envia mensagem, documento, receita ou aviso ao cliente e não altera configurações de produção.
10. A aparência segue a linguagem 3D Paxter da tela interna; todos os controles têm rótulo acessível e identificador de teste estável; a tela funciona em computador e celular.

## Contrato existente da interface de programação de aplicações

Base de desenvolvimento: `BASE_URL + /api`.

| Método e caminho | Entrada | Resultado usado pela tela |
|---|---|---|
| GET `/duvidas-orientacoes` | Cabeçalho de colaborador | `{ orientacoes, podeAprovar }` |
| POST `/duvidas-orientacoes` | `{ tema, perguntasExemplo, resposta }` | `{ id, status: "rascunho" }` |
| PUT `/duvidas-orientacoes/:id` | `{ tema, perguntasExemplo, resposta }` | `{ ok, status }` |
| POST `/duvidas-orientacoes/:id/aprovar` | Sem corpo | `{ ok: true }` |
| POST `/duvidas-orientacoes/:id/inativar` | Sem corpo | `{ ok: true }` |
| GET `/duvidas-orientacoes/atendimento/estado` | Cabeçalho de colaborador | `{ modoIA, queixaRevisada, emAtendimentoHumano }` |
| POST `/duvidas-orientacoes/atendimento/:clienteId/assumir` | Sem corpo | `{ ok: true, modo: "humano" }` |
| POST `/duvidas-orientacoes/atendimento/:clienteId/devolver-ia` | Sem corpo | `{ ok: true, modo: "ia" }` |

## Falhas previstas e barreiras

| Falha | Impacto | Barreira e comportamento da tela | Prova |
|---|---|---|---|
| Sessão ausente, vencida ou credencial revogada | Leitura ou escrita indevida | Enviar token atual em todas as chamadas; mostrar erro de sessão; não exibir formulário como se tivesse salvo | Teste das rotas protegidas e verificação das chamadas |
| Colaborador de outra empresa tenta abrir registro | Vazamento ou alteração entre empresas | Servidor deriva a empresa; tela não aceita identificador empresarial | Testes de isolamento já existentes e revisão do contrato |
| Erro de rede ou servidor | Alteração não persistida apresentada como concluída | Manter valores digitados, exibir erro e oferecer nova tentativa | Teste de erro e inspeção do estado |
| Orientação editada depois da aprovação | Texto não revisado poderia ser enviado | Exibir o estado devolvido pelo servidor; estado aprovado não é presumido no cliente | Teste de edição invalida aprovação |
| Usuário sem autoridade tenta aprovar | Orientação não autorizada | Botão ausente ou desabilitado conforme `podeAprovar`; servidor segue como autoridade final | Teste de rota existente |
| Ação de conversa falha | Estado da conversa fica divergente | Exibir erro e recarregar apenas após sucesso | Teste de retorno e atualização da lista |

## Definição de pronto

1. A rota abre dentro do layout interno e é alcançável pelo menu.
2. Criar, editar, aprovar, inativar, assumir e devolver usam as rotas reais e refletem o estado persistido.
3. As chamadas usam autenticação; empresa e autoridade continuam sendo determinadas pelo servidor.
4. Erros, carregamento, lista vazia e ausência de permissão têm estados visíveis e distintos.
5. Testes de regressão passam e a tela é conferida visualmente em computador e celular.
6. Nenhuma mensagem externa é enviada; modo automático continua desligado.

## Linhas vermelhas

- Não criar novo motor de mensageria nem editar o motor de lembretes.
- Não gerar, alterar ou enviar documentos clínicos.
- Não ativar inteligência artificial, queixas automáticas ou produção.
- Não apagar orientações nem conversas; inativar é reversível.
- Não enfraquecer autorização ou isolamento para facilitar a interface.

## Evidências e estado da homologação — 13/11/2026

- A rota está protegida por `CollaboratorGate`; o servidor continua exigindo a sessão atual em todas as rotas usadas pela tela.
- A chamada sem sessão para a lista de orientações retorna `401`; as rotas de cadastro e atendimento passaram por 37 testes existentes, incluindo banco temporário isolado.
- A compilação do PADCOM foi concluída. Ela ainda informa avisos preexistentes em outros arquivos: chaves `width` e `height` repetidas no preview do Arsenal, mapas de origem ausentes em componentes da interface e pacote JavaScript grande.
- A verificação visual inicial confirmou a composição em computador e celular; depois da proteção de acesso, a captura sem sessão redirecionou corretamente para o login.
- O navegador de captura não possui sessão de colaborador; operações autenticadas e aparência com dados autorizados não foram homologadas visualmente.
- O revisor independente exigido pelo PAXTER Loop está indisponível neste modo. Estado: BLOQUEADO para homologação até revisão independente.
- Esta entrega cobre a administração de orientações e o estado/encaminhamento humano. Não implementa consulta a documentos nem ações de agenda; os requisitos funcionais dessas partes não estão definidos nesta especificação.
- Nenhuma mensagem foi enviada; não houve ativação em produção.
