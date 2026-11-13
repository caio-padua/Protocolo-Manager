# Atendimento Telegram recuperável e rubrica histórica

## Objetivo
Corrigir as quatro lacunas auditadas contra a base atual b9c196df, sem substituir
os motores existentes nem fazer envios reais.

## Requisitos, desenho e impacto
1. Inbox salvo → registro durável do atendimento ANTES do aceite do webhook
   (também na reentrega). Falha de registro devolve 500; não apagar inbox.
2. Reutilizar telegram_atendimento_respostas, transporte Telegram, decisão de
   orientações e o mesmo tick do worker do repasse. Nenhum cron/processo novo.
3. Separar plano persistido, pausa humana, alerta e resposta. Capturar destino
   uma vez; revalidar origem, configuração, clínica e orientação antes do envio.
4. Reivindicação condicional com dono, prazo e limite de seis tentativas.
   Queda no planejamento pode retomar; barreira de envio persistida antes da rede.
   Queda depois dessa barreira, prazo, rede ou aceite sem fechamento = incerto,
   nunca repetido automaticamente. Etapa aceita persistida não se repete.
5. Recusa 403 é terminal; 503 e falta de token/destino podem aguardar recuperação
   com limite e espera; destino capturado não é redirecionado silenciosamente.
6. Desligado/fora da lista no recebimento fecha sem efeitos, não acumula mensagens
   antigas para enviar ao ligar futuramente. Revalidar essas condições na retomada.
7. Nenhuma promessa "já avisei". Alerta mínimo por identificadores internos, sem
   nome, CPF, transcrição clínica ou erro externo. Mensagem original protegida
   permanece no Cockpit. Expor falhas/incertos na tela administrativa autenticada
   com consulta empresarial e atualização, inclusive queda antes da pausa humana.
8. Novos estados não reexecutam reivindicações legadas: fechadas permanecem
   concluídas; não fechadas ficam incertas para conferência humana.
9. Na confirmação/rubrica da visita, vincular atomicamente versão, caminho
   privado e hash da imagem daquele momento (ou ausência explícita).
   A troca de imagem usa a mesma trava da captura; nunca apagar versões antigas.
10. Documento regenerado lê somente o vínculo histórico da visita e valida
    cliente, clínica, versão e hash. Sem vínculo legado não inventa imagem atual;
    sinalização explícita de legado/sem imagem. Pendente nunca ganha imagem.
11. Sanitizar também o valor retornado pelo contrato auxiliar do repasse e testar
    texto, diagnóstico e erro com identificadores exclusivamente sintéticos.

Produtores: webhook, configuração já existente e confirmação por chave,
desafio e e-mail. Consumidores: worker existente, tela Dúvidas e Orientações e
montador do RAS FAP. Persistência aditiva; arquivos no armazenamento privado
existente, sem copiar bytes para o banco. Nenhuma autorização de cliente muda.

## Matriz de falhas
| Falha | Risco | Barreira e prova |
|---|---|---|
| Queda após salvar inbox/antes de enfileirar | Perda | 500 e reentrega idempotente; rota sintética |
| Duas reivindicações | Duplicação | Dono e atualização condicional; PostgreSQL descartável |
| Queda antes da barreira externa | Perda | Plano/etapas persistidos e retomada limitada |
| Queda na barreira ou após aceite | Duplicação | Incerto terminal; novo processo não envia |
| Alerta aceito e resposta falha | Alerta duplicado | Etapa de alerta aceita preservada |
| Chat ausente, 403/503, token ausente | Falso encaminhamento | Estado durável legível, sem promessa ao cliente |
| Configuração, vínculo ou aprovação mudam | Destino/autorização errados | Revalidar antes do transporte; bloquear |
| Erro contém CPF ou segredo | Exposição | Código técnico na saída e no diagnóstico |
| Imagem trocada depois da visita | Histórico alterado | Vínculo da versão sob mesma trava transacional |
| Hash ou clínica divergem | Assinatura indevida | Recusa explícita, sem imagem substituta |
| Confirmação antiga sem versão | História inventada | Legado explícito, nunca imagem ativa atual |

## Critérios de validação
Testes sintéticos de decisão, contrato de rotas protegidas, banco descartável
(concorrência, persistência, queda/reinício), rubrica/regeneração e privacidade;
checagem de tipos, compilação e revisão independente sequencial.
Conferência de tela autenticada quando disponível; falta de prova visual
autenticada bloqueia homologação, não é suprida por captura do login.
Cada lote registra comandos/resultados e é sincronizado por avanço normal na
mesma branch de homologação, sem publicação. Não confundir código enviado com
aprovação nem evidência visual histórica com operação atual.

## Linhas vermelhas
Somente testes sintéticos e provedores simulados; nenhum novo envio real,
nenhuma alteração de produção/webhook/autorizações ou ativação geral.
Não tocar cálculo de orçamento/desmembramento, não apagar mensagens nem imagens,
não copiar dados clínicos para testes nem reescrever histórico de Git.

## Lote 1 — execução em 13/11/2026
Base examinada: b9c196df. Confirmadas as três lacunas de atendimento e rubrica;
repasse já não lia nome/CPF do cadastro, mas devolvia exceção bruta e ainda
transcrevia texto livre parcialmente redigido.

Implementado: fila recuperável na tabela existente, plano antes de efeitos,
etapas de alerta/resposta, dono/prazo, seis tentativas, reserva antes da rede,
incerto sem repetição, cópia de resposta e aceite local atômicos, bloqueio de
vínculo/destino/configuração/orientação alterados. Webhook aguarda registro mesmo
na reentrega, sem apagar inbox. Mesmo tick do worker; nenhum cron adicionado.
Legados não fechados recebem estado incerto, sem reexecução.
O perfil restrito `telegram-relay-dev` permanece SOMENTE com repasse: não consome
atendimento automático. O consumidor de atendimento usa o mesmo tick no perfil
completo, ainda condicionado às configurações e autorizações já existentes.
Teste isolado pode invocar esse consumidor sem habilitar o perfil completo.

Alerta mínimo contém somente identificador interno e instrução para Cockpit
protegido; **não transcreve mais texto livre**. Isso evita depender de expressões
regulares para reconhecer nomes ou conteúdo sensível. Exceções e retornos de
transporte contêm somente código técnico. O original do inbox permanece intacto.
Não se alterou o conteúdo de lembretes, horários, períodos nem versículos.

Arquivos: atendimento-telegram{,-store,-recuperacao}.ts, telegram-relay-ceo.ts,
telegram-repasse-worker.ts, assinaturas.ts, duvidas-orientacoes.ts (rota e tela),
testes de atendimento/repasse/webhook/rotas e
e2e/atendimento-telegram-pendencias.spec.ts.

| Comando/verificação | Resultado |
|---|---|
| `pnpm --filter @workspace/api-server exec vitest run src/tests/atendimento src/tests/duvidas src/tests/telegram src/tests/lembrete-telegram-motor.test.ts --maxWorkers=2` | 402 testes / 25 arquivos passaram |
| `pnpm --filter @workspace/api-server run typecheck` | Passou |
| `pnpm --filter @workspace/api-worker run typecheck` | Passou |
| `CHROMIUM_PATH=… pnpm exec playwright test e2e/atendimento-telegram-pendencias.spec.ts --timeout=45000` | Passou; computador/celular; respostas sintéticas; zero escrita externa |
| Verificação global de tipos do padcom | 35 erros em outros arquivos; nenhum no arquivo alterado; não tratada como aprovação global |

Falhas encontradas e corrigidas durante os testes: simulação antiga acoplada ao
novo consumidor do tick; expectativa antiga de transcrição agora proibida;
identificador BIGINT retornando texto no contrato (usar id original inteiro do
inbox); teste visual que procurava botão inexistente (provar atualização periódica
real com relógio do navegador). Sem afrouxar autenticação para passar testes.

Prova de reinício: processo Node separado usa SOMENTE socket de PostgreSQL
descartável e transporte sintético. Queda após reivindicar/antes do plano retoma;
queda antes/depois da chamada externa após barreira fica incerta; queda após
aceites persistidos/antes do fechamento não repete nenhuma etapa aceita.

Capturas sintéticas: generated-artifacts/atendimento-pendencias-{desktop,mobile}.png.
Isso comprova renderização com dados de demonstração, não sessão real autenticada.
Nenhum novo envio real, webhook, configuração de canal ou autorização foi tocado.
Rubricas históricas e revisão independente ainda pendentes neste marco.

Complemento do lote: depois da trava explícita do perfil restrito, passaram
60 testes em cinco arquivos afetados (`src/tests/atendimento`,
`telegram-worker-profile.test.ts`, `telegram-repasse-destino-atual.test.ts`),
mais checagens de tipos da aplicação de servidor e do trabalhador.
Incluem dependências reais do atendimento com banco descartável: enfileirar sem
enviar, consumir uma vez, respeitar profissional que assumiu depois do alerta,
recusar aprovação retirada depois do plano e recusar origem de outra clínica.
O teste de encerramento do banco expôs corrida do desligamento rápido do
PostgreSQL com socket em fechamento; a parada inteligente resolveu sem ocultar
erros nem tocar banco da aplicação. A rodada seguinte encerrou sem erro não tratado.
