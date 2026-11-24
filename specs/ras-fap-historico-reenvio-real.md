# Conferência do histórico após reenvio real do RAS FAP

## Objetivo

Comprovar que um único reenvio autorizado atualiza o histórico na tela sem
recarregar e que a data permanece depois de recarregar a página.

## Autorização e limites

O responsável autorizou qualquer protocolo na resposta “todos”, em 24/11/2026.
Isso permite escolher um caso elegível; não determina envio em massa.
Executar somente um reenvio, no ambiente de desenvolvimento, ao contato já
cadastrado, sem alterar cliente, clínica, profissional ou documento.
Não publicar nem usar credenciais fabricadas.

## Requisitos

1. Entrar pelo fluxo normal de autenticação com credenciais operacionais.
2. Confirmar conexão do Gmail e protocolo acessível ao profissional.
3. Ler o histórico inicial e clicar uma única vez em “Reenviar RASP FAP”.
4. Confirmar resposta de sucesso e novo registro com estado `enviado`.
5. Conferir a data do novo registro imediatamente abaixo do botão, sem navegação.
6. Recarregar e conferir a mesma identificação e data em nova leitura do servidor.
7. Separar aceitação pelo Gmail de recebimento na caixa do destinatário.
8. Não guardar senha, sessão, contato ou prontuário nas evidências.

## Impacto

Sem alteração do código da aplicação ou do esquema do banco.
O único efeito externo permitido é o e-mail disparado pelo botão existente.
O servidor grava o registro existente de auditoria em `email_log`.
A verificação fica desativada por padrão, exige protocolo explícito, não permite
repetições automáticas e não grava rastreamentos que possam conter a sessão.

## Falhas previstas

| Falha | Barreira e recuperação |
| --- | --- |
| Credencial recusada | Parar; usar apenas identificador alternativo configurado, sem redefinição |
| Protocolo inacessível ou Gmail desconectado | Parar antes do clique |
| Resposta do envio perdida | Não repetir; consultar histórico e remetente |
| Registro não gravado ou tela desatualizada | Falhar e preservar evidência; não reenviar |
| Recebimento não observável | Declarar pendência, sem afirmar entrega |
| Execução acidental na suíte comum | Exigir `RAS_FAP_REAL_SEND=1` e `RAS_FAP_PROTOCOL_ID` |

## Definição de pronto

Todos os requisitos comprovados, incluindo recebimento confirmado pelo
destinatário ou consulta autorizada à sua caixa.
Sem essa última prova, a tarefa permanece incompleta, mesmo com tela e histórico
corretos.

## Evidências de execução — 24/11/2026

Ambiente: desenvolvimento, navegador Chromium, horário de Brasília.
Nenhum código da aplicação, cadastro ou regra de segurança foi alterado.
Não houve publicação nem reinício dos serviços, pois só foram adicionados teste
e documentação.

| Nível | Esperado | Obtido |
| --- | --- | --- |
| Acesso | Sessão normal | Identificador alternativo configurado aceito; identificador principal recusado |
| Segurança | Recusar unidade divergente antes do envio | Protocolo 67 retornou 409, sem novo histórico |
| Segurança | Recusar dose ambígua antes do envio | Protocolo 69 retornou 409, sem registro de reenvio |
| Reenvio real | Um clique e resposta de sucesso | Protocolo 28, uma requisição de envio, resposta 200 |
| Persistência | Nova linha lida do servidor | Registro 20, estado enviado, histórico passou de zero para um |
| Visual imediato | Data abaixo do botão sem navegação | 24/11/2026, 10:31, conferido em captura do painel |
| Visual após recarregar | Mesma linha e mesma data | Registro 20 e mesmo instante retornados pelo servidor |
| Provedor | Mensagem real enviada com documento | Uma mensagem na pasta Enviados do Gmail com anexo PDF (formato de documento portátil) |
| Proteção do teste | Suíte comum sem envio | Uma verificação ignorada quando a autorização explícita está ausente |
| Recebimento | Mensagem chegou ao destinatário | Responsável confirmou expressamente “Sim, recebimento confirmado”, em 24/11/2026 |

Comando da execução real aprovada:

```sh
PADCOM_BASE_URL="https://$REPLIT_DEV_DOMAIN" \
RAS_FAP_REAL_SEND=1 RAS_FAP_PROTOCOL_ID=28 \
pnpm exec playwright test e2e/ras-fap-historico-real.spec.ts --workers=1
```

Resultado: uma verificação passou em 10,5 segundos.
O teste foi reforçado com conferência prévia de unidade e dose depois das duas
recusas clínicas; não houve reenvio automático nem alteração dos dados recusados.

Evidências locais, fora do versionamento:

- `generated-artifacts/ras-fap-real/apos-reenvio.png`
- `generated-artifacts/ras-fap-real/apos-recarregar.png`
- `generated-artifacts/ras-fap-real/resultado.json`
- `generated-artifacts/ras-fap-real/gmail-verificacao.json`

As capturas mostram somente o botão e o histórico, sem dados do cliente.
Não foram capturados celular e tema escuro, pois não houve alteração de tela;
a verificação operacional ocorreu no computador.

Estado: critérios operacionais comprovados; tela e persistência verificadas
automaticamente, envio conferido no Gmail e recebimento confirmado pelo
responsável em 24/11/2026.
Não houve novo envio para registrar essa confirmação.

A captura adicional sem sessão apresentou recusa de acesso; a evidência visual
válida da área autenticada é a captura do teste operacional com login normal.
