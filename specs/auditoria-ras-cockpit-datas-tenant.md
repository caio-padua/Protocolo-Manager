# Auditoria do RAS FAP, Cockpit e datas civis entre clínicas

## Estado

BLOQUEADO — 10/11/2026. As correções e testes focados foram concluídos, mas não
há revisão independente disponível nesta execução e o navegador de verificação
não possui sessão autenticada para conferir a tela alterada.

## Objetivo

Fechar os caminhos de documento e leitura clínica que possam usar identidade,
unidade, pasta de armazenamento ou cliente pertencente a outra clínica, e manter
datas civis idênticas em qualquer fuso horário.

## Fatos confirmados no código atual

1. A interface não chama `POST /ras-fap/entregar-protocolo`. “Emitir ao
   Paciente” chama `POST /protocols/:id/emit-document`; imprimir e reenviar o
   RAS FAP chamam `GET` e `POST /ras/physical/:protocolId`.
2. A rota legada aceitava dados de substâncias enviados pelo navegador e usava
   identidade e pasta compartilhadas fixas. Ela agora responde HTTP 410 sem
   gerar documentos ou acionar canais.
3. A emissão atual e os caminhos ativos de RAS usavam identidade genérica,
   unidade salva sem validação ou raiz global do Drive. Agora exigem vínculo do
   protocolo, usam o médico e a clínica autorizados e passam a raiz da empresa
   explicitamente; ausência da raiz não cai na pasta global.
4. As rotas de PDF e upload de um RAS persistido também são chamadas pela
   interface. Elas agora conferem protocolo, cliente, médico, unidade e raiz
   empresarial antes de assinar ou enviar ao Drive.
5. Rotas de demonstração separadas ainda contêm identidade e pasta fixas, além
   de uma lista fixa de destinatário. A interface clínica atual não as chama;
   elas não foram executadas nem enviaram dados nesta auditoria e permanecem
   pendentes de decisão isolada.
6. `tenantContextMiddleware` atribui `empresaId = 5` ao contexto não autenticado.
   `GET /cockpit/:clientId` e `GET /cockpit/:clientId/pdf` não declaram
   `requireCollaborator`; o bloqueio Basic Auth global não substitui a sessão
   individual de colaborador. Agora as duas rotas exigem colaborador, e os
   consumidores diretos encontrados enviam o token existente.
7. As telas de protocolos usavam `new Date(dataCivil)` antes de formatar. O
   valor `yyyy-MM-dd` podia aparecer no dia anterior em fusos negativos. As
   telas auditadas agora usam parser de data civil sem deslocamento de fuso.
8. `drive_clientes_folder_id` está na tabela `empresas` e é lido por SQL
   existente fora do esquema Drizzle. A raiz global do helper permanece para
   fluxos antigos não migrados; os emissores auditados passam uma raiz explícita.
   Nenhuma pasta nem arquivo existente foi movido.

## Contrato de correção

1. O RAS FAP gerado para um protocolo obtém cliente, empresa, unidade e
   profissional de registros persistidos já autorizados no servidor; valores
   recebidos do navegador não concedem identidade nem acesso.
2. Se a identidade, o local responsável, a relação do profissional com a clínica
   ou a pasta de clientes da empresa não puderem ser verificados, bloquear o
   efeito correspondente com erro explícito; não usar dados do Instituto Pádua,
   Dr. Caio ou pasta global como fallback.
3. Documento e cópia no Drive não podem ser enviados para destino de outra
   clínica. A configuração segue a raiz de clientes já associada à empresa; a
   proposta “pasta da empresa → pasta de clientes → pasta do cliente” não cria
   pastas nem migra arquivos sem conferir e manter os vínculos existentes.
4. O endpoint legado sem identificador persistido de protocolo não pode emitir
   documento baseado somente em substâncias enviadas pelo navegador. Como não
   há chamada da interface, deve ser bloqueado ou convertido para usar um
   protocolo persistido, sem apagar a ação atual de emissão.
5. As duas leituras do Cockpit exigem token válido de colaborador e continuam
   limitadas a cliente da empresa autenticada; o contexto legado não autenticado
   jamais é evidência de acesso.
6. Os chamadores internos do Cockpit enviam o token já usado no aplicativo.
7. Datas de protocolo, sessão e aplicação que sejam somente `yyyy-MM-dd` são
   interpretadas como datas civis, sem conversão de fuso; o mesmo valor precisa
   formatar o mesmo dia em `America/Sao_Paulo` e `UTC`.
8. Nenhum teste dispara e-mail, Telegram, assinatura jurídica ou gravação no
   Google Drive. Todos os testes de tenant usam identidades e dados sintéticos,
   provedores simulados e destinos isolados.

## Falhas previstas e barreiras

| Falha | Gravidade | Barreira exigida |
|---|---|---|
| Clínica ou profissional fixo em documento | Crítica | Resolver por protocolo persistido; bloquear identidade ausente ou incompatível |
| Pasta compartilhada fixa ou pasta global do cliente | Crítica | Resolver pasta exclusiva da empresa; sem fallback; provar ausência de chamada cruzada |
| Cliente de outra clínica | Crítica | Recusa antes de carregar documento ou chamar provedor |
| Colaborador sem sessão no Cockpit | Alta | Resposta 401 antes de consultar dados |
| Sessão válida tentando cliente de outra clínica | Crítica | Resposta sem revelar existência/dados e sem carregar associações |
| Mudança de dia por conversão UTC/local | Alta | Parser de data civil e testes em dois fusos |
| Chamador interno sem token após a proteção | Alta | Atualizar todos os chamadores encontrados e testar a leitura legítima |
| Falha em canal externo durante teste | Alta | Provedores simulados; nenhuma conexão real para envio ou upload |

## Testes de aceitação

1. Busca no código e teste do fluxo comprovam que a interface usa
   `/protocols/:id/emit-document`, não a rota legada.
2. Duas clínicas sintéticas e dois profissionais distintos: emissão, impressão
   e reenvio de RAS usam apenas a identidade e unidade correspondentes.
3. Cliente, profissional, local ou raiz do Drive incompatível: bloqueio sem
   geração ou envio cruzado; raiz ausente não chama o Drive.
4. Rota legada responde HTTP 410 sem efeitos externos.
5. `GET /cockpit/:clientId` e `GET /cockpit/:clientId/pdf`: sem sessão retorna
   401 antes de consulta clínica; sessão de outra clínica não lê nem exporta o
   cliente; sessão autorizada continua funcional.
6. Chamadores de Cockpit com sessão válida enviam token e tratam falha de
   autenticação de forma visível.
7. Datas civis de protocolo, visita e aplicação formatam o mesmo dia sob
   `TZ=America/Sao_Paulo` e `TZ=UTC`.
8. Compilação, testes, logs e captura visual aplicável; sem publicação.

## Arquivos sob revisão

- `artifacts/api-server/src/routes/ras.ts`
- `artifacts/api-server/src/routes/protocols.ts`
- `artifacts/api-server/src/routes/cockpit.ts`
- `artifacts/api-server/src/middleware/tenantContext.ts`
- `artifacts/api-server/src/lib/google-drive.ts`
- `artifacts/padcom/src/pages/protocols/detail.tsx`
- `artifacts/padcom/src/pages/cockpit-cliente/panels/ProtocolosPanel.tsx`
- Chamadores diretos do `GET /cockpit/:clientId`
- Testes relacionados a RAS, emissão, Cockpit e isolamento entre clínicas
- `artifacts/padcom/src/lib/civil-date.ts` e respectivo teste

## Fora de escopo

- Migração de pastas ou arquivos já existentes no Drive.
- Alterações de cadastros, vínculos, permissões globais, agenda ou cobranças.
- Envios reais de documentos, mensagens ou solicitações de assinatura.
- Certificação completa de isolamento de todas as ferramentas do produto.

## Resultado verificado nesta execução

- Quatro suítes focadas: 87 testes passaram e 5 testes antigos de integração
  com a rota legada ficaram ignorados, pois o endpoint agora responde HTTP 410.
- Datas civis: 3 testes passaram sob `America/Sao_Paulo` e `UTC`.
- A compilação do aplicativo web terminou; avisou sobre chaves duplicadas em
  `pages/arsenal/preview-validacao.tsx` e sobre tamanho de um bloco JavaScript.
- A verificação TypeScript do servidor permanece bloqueada por 162 erros em
  48 arquivos; não há erros listados nas rotas auditadas de protocolos, RAS e
  Cockpit.
- Os testes usam provedores simulados. Gmail, Drive, Telegram, banco real e
  interface autenticada não foram exercitados; nenhum dado ou destinatário real
  foi alterado.
