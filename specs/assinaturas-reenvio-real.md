# Reenvio real de assinaturas em fallback

## Objetivo
Recuperar solicitações ENVIADO com metadata.fallback=true no ZapSign sem duplicar documentos ou alterar seu conteúdo.

## Requisitos e impacto
1. Rotas GET /assinaturas/fallback/saude e POST /assinaturas/fallback/reenviar, autenticadas e exclusivas do administrador da plataforma. Tabelas legadas não possuem empresa: não conceder acesso a colaboradores de clínicas.
2. POST exige confirmação explícita, processa até dez solicitações ZapSign por chamada e preserva o identificador local e external_id.
3. Persistir reserva antes da chamada externa; concorrência/reinício não libera reserva. HTTP 402 comprovado permite tentar novamente; resposta incerta exige conferência humana.
4. Reutilizar signatários e dados originais. Legado sem PDF reconstrói template somente se SHA-256 do HTML for exatamente o original; divergência bloqueia sem chamar provedor.
5. Após aceite real, persistir recibo antes da atualização transacional dos links e notificações. Recuperar recibo sem criar outro envelope.
6. Atualizar envelope, mock=false e fallback=false; notificar pelo processador existente, com momento próprio e unicidade. Não enviar links simulados.
7. Exibir contagem de pendentes e bloqueados no painel de integrações/saúde do CEO, com atualização periódica e botão de reenvio confirmado.
8. Restaurar fallback 402 ausente nesta revisão: preservar PDF original em armazenamento privado, registrar flags e não notificar links fictícios.

## Falhas previstas
| Gravidade | Causa | Barreira e recuperação | Teste |
|---|---|---|---|
| Alta | Duas chamadas concorrentes | Reserva durável por atualização condicional | Postgres isolado |
| Alta | Resposta perdida ou processo interrompido | Reserva não expira; bloqueio explícito | Teste de falha/repetição |
| Alta | Modelo jurídico mudou | Verificação do hash, sem reidratar cadastro atual | Teste de divergência |
| Alta | Banco falha após aceite | Recibo persistido; nunca liberar reserva | Teste de recuperação |
| Alta | Acesso de clínica | Autenticação e administrador global | Teste de rota |
| Média | Plano ainda gratuito | Preserva fallback, sem notificação | Teste HTTP 402 |
| Média | Mensagem falha | Estado honesto na fila; não recriar envelope | Teste de fila |
| Alta | Lote defasado antes de outro executor persistir recibo | Reserva retorna metadados atuais, finalização bloqueia a linha antes de gravar dependências | Teste de seleção antiga |
| Alta | Armazenamento indisponível após 402 comprovado | Libera RASCUNHO sem envelope externo, permitindo mesma chave após recuperação | Teste de falha e repetição |

## Pronto
Provedor simulado e Postgres descartável demonstram recuperação, repetição, concorrência e persistência. Captura da tela pública e declaração explícita sobre painel protegido. Sem publicação, cobrança, alteração destrutiva, envio real ou migração.

## Fontes e limites
Nota documental do satélite consultada por endereço público retornou 404 (repositório privado). Aplicadas normas locais e motor existente. Revisão final pertence ao mecanismo de conclusão da tarefa.

## Evidências em desenvolvimento
- Vinte e dois testes novos com Postgres descartável/provedores simulados: sucesso, idempotência, concorrência, seleção defasada após recibo, 402, timeout, reserva abandonada, conteúdo alterado, PDF original, recibo recuperável, falhas de persistência e de armazenamento, controle de acesso e notificações.
- Doze testes de regressão de webhook/documentos assinados passaram junto aos dezesseis testes iniciais; os quatro testes do serviço passaram em execução separada.
- Bibliotecas compartilhadas: typecheck:libs passou. Verificações gerais continuam com erros anteriores fora da alteração (laboratorio-calc e agentes/index). Nenhum erro nos novos arquivos.
- API e frontend reiniciados. /api/healthz retornou 200; leitura e escrita de fallback sem sessão retornaram 401. Logs sem falha nova nos módulos alterados; avisos preexistentes de configuração/agenda e estilos duplicados permanecem.
- Captura desktop de /agentes confirmou a página inicial sem falha de renderização. Painel do CEO exige sessão e abertura da aba Integrações: seu estado autenticado não foi capturado; celular e temas não capturados. Nenhum envio externo realizado pelo teste.
