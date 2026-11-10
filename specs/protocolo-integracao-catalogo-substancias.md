# Integração do protocolo com o cadastro de substâncias

## Correção prioritária do responsável — 10/11/2026

Esta correção substitui qualquer requisito anterior desta especificação que
mandasse exibir concentração, volume, quantidade de ampolas, composição ou
outros detalhes do cadastro dentro da apresentação do protocolo ou do RAS FAP.

1. Nas telas do protocolo, no PDF do protocolo, na impressão, no RAS FAP e nas
   versões anexadas ou enviadas, a linha da substância mostra somente o nome e a
   dose prescrita.
2. É proibido mostrar nessa linha a concentração, o volume em mililitros, a
   quantidade de ampolas ou qualquer equivalência de dose em volume.
3. A tela do cadastro de substâncias continua sendo a fonte dos detalhes
   completos. A fotografia interna do cadastro permanece preservada, mas não é
   conteúdo de apresentação clínica.
4. A dose prescrita vem do campo próprio do protocolo. Uma dose padrão só pode
   preencher esse campo quando a interpretação for inequívoca; caso contrário,
   o campo permanece vazio e exige revisão médica.
5. Os fluxos de assinatura, emissão, impressão, envio, agenda, preço e conteúdo
   jurídico existentes não devem ser removidos nem redesenhados por esta
   correção.

## Estado

BLOQUEADO — a conferência autenticada encontrou um caminho de leitura do RAS que
devolvia a dose armazenada sem aplicar o normalizador clínico. A correção foi
aplicada e os testes focados passaram; falta conferência visual autenticada da
correção e revisão independente. O banco e o cadastro não foram alterados.

## Objetivo

Usar a substância selecionada pelo identificador exato do cadastro, preencher
somente uma dose prescrita inequívoca e preservar os dados completos do cadastro
internamente, sem apresentá-los como dose no protocolo.

## Evidência de origem antes da construção

- `GET /api/substances` lê `substances` diretamente e inclui os componentes
  estruturados de blends; não há uma lista alternativa hardcoded no formulário.
- Na base de desenvolvimento, a tabela tinha 217 registros e 139 nomes
  distintos após normalizar maiúsculas, espaços e acentos. Há nomes repetidos
  com apresentações diferentes.
- A resposta da interface de programação de aplicações também tinha 217
  registros. O identificador 14 era COENZIMA Q10 IM, com dose padrão
  `100 MG / 2 ML`, preço de R$ 10,70 e duração de 2,5 minutos; intervalo,
  volume estruturado e unidade estavam vazios.
- O identificador 832 era ADEK, com composição, dose padrão, uma ampola de
  2 mL, preço de R$ 49,47, duração de 2,5 minutos e intervalo de 15 dias.
- O contrato OpenAPI e o tipo gerado não expunham todos os campos retornados
  pelo servidor, incluindo via cadastrada, composição estruturada e volume
  textual da ampola.
- A tela identificava o registro pelo `id`, mas mostrava apenas nome e unidade;
  ao selecioná-lo, copiava somente nome e cor. Dose permanecia vazia e o
  intervalo iniciava semanal, mesmo quando o catálogo registrava 15 dias.
- A tabela `protocol_items` preservava o identificador, a dose revisada, preço,
  sessões e intervalo, mas não guardava uma fotografia dos demais campos do
  cadastro.
- O orçamento formal usa `budget_catalog`, uma fonte comercial separada e
  intencional. O item Q10 ligado ao identificador 14 tinha preço de R$ 90,00,
  sem dose padrão, oito sessões e sete dias. Esta entrega não substituirá esse
  preço pelo preço operacional da tabela `substances`.

## Requisitos da primeira entrega

1. Completar o contrato e os tipos gerados do cadastro para expor os campos
   existentes necessários à identificação, apresentação e revisão clínica.
2. Manter o identificador numérico da substância como chave da seleção, da
   requisição e do vínculo gravado; nomes não serão usados como chave.
3. Diferenciar opções repetidas pelo identificador exato, sem exibir
   concentração, volume, quantidade de ampolas ou composição na tela do protocolo.
4. Preencher a dose revisável somente quando o campo `defaultDose` permitir
   identificar uma única dose prescrita sem confundi-la com concentração ou
   apresentação; caso contrário, deixar a dose vazia.
5. Nas telas do protocolo e em seus documentos, mostrar somente o nome da
   substância e a dose prescrita; os demais dados ficam no cadastro e na
   fotografia interna, não na apresentação clínica.
6. Preencher o intervalo a partir de `intervalDays`. Intervalos iguais às
   opções existentes podem usar seus rótulos; qualquer outro intervalo deve
   permanecer com o número exato em opção personalizada.
7. Quando o cadastro não trouxer `intervalDays`, não selecionar semanal por
   padrão. Exigir que o profissional revise e escolha um intervalo antes de
   criar o protocolo. `frequenciaBase` e texto livre de posologia podem ser
   exibidos, mas não convertidos automaticamente em dias.
8. Na gravação, o servidor relê o cadastro pelo identificador enviado,
   rejeita identificadores inexistentes e deriva preço e fotografia do
   cadastro no servidor. Não confia em preço, via, composição ou volume
   enviados pelo navegador.
9. Adicionar ao item do protocolo uma fotografia aditiva e anulável dos dados
   relevantes do cadastro e dos componentes do blend. Protocolos antigos
   continuam legíveis e não serão regravados.
10. Preservar a edição clínica da dose, intervalo e quantidade de sessões.
    A quantidade atual predefinida pelo formulário permanece revisável e não
    será apresentada como dado do cadastro.
11. Não alterar registros do cadastro de substâncias, protocolos já existentes,
    reservas, eventos do Google, mensagens, cálculo comercial do orçamento ou
    publicações.

## Falhas previstas e barreiras

| Falha | Consequência | Barreira e teste |
|---|---|---|
| Nome repetido com concentração diferente | Seleção da apresentação errada ou exposição de detalhe proibido | A opção distingue pelo identificador sem exibir concentração; teste mantém dois identificadores distintos. |
| Dose padrão ausente ou ambígua | Dose inventada ou campo aparentemente preenchido | Campo permanece vazio e obrigatório até revisão médica; não deriva de concentração ou volume. |
| Campo de dose legado contém volume | Volume ou concentração vaza para documento clínico | Normalizador clínico aceita somente uma dose inequívoca; geração bloqueia se não puder separar com segurança. |
| Documento ou reenvio usa um gerador diferente | Volume reaparece em um formato | Testar prévia, emissão, impressão, RAS FAP, e-mail e reenvio com a mesma regra de conteúdo. |
| Intervalo ausente | Frequência semanal falsa | Estado inicial “intervalo não definido”; criação bloqueada até escolha explícita. |
| Intervalo diferente das opções prontas | Alteração silenciosa do intervalo | Opção personalizada guarda o número exato; teste com 15 dias e valor não padronizado. |
| Cadastro alterado depois da criação | Protocolo antigo muda sem revisão | Fotografia anulável no item; teste confirma que a leitura usa a fotografia e mantém compatibilidade com registros antigos. |
| Identificador inválido no pedido | Preço zero ou vínculo incorreto | Servidor rejeita a criação sem inserir protocolo ou item. |
| Preço comercial do orçamento confundido com preço operacional | Valor comercial alterado | Não alterar `budget_catalog` nem `/api/budgets/calculate`; manter fontes separadas. |
| Falha de migração ou contrato | Aplicação não inicia ou perde campos | Testar adição anulável em PostgreSQL isolado, executar código gerado e verificar a resposta tipada. |

## Definição de pronto para a primeira entrega

- Testes determinísticos isolados cobrem Q10, ADEK, dose editável, dose
  ausente/ambígua, nomes repetidos, fotografia persistida e compatibilidade com
  protocolos antigos.
- Capturas e extração de texto comprovam que a tela, o PDF do protocolo, o PDF
  impresso, o RAS FAP e os anexos enviados mostram a dose prescrita correta sem
  volume, concentração, quantidade de ampolas ou equivalência em mililitros.
- O servidor compila e a aplicação web passa sua verificação aplicável.
- A interface autenticada é conferida pelo responsável do produto; uma captura
  não autenticada não substitui essa conferência.
- O banco de desenvolvimento recebe somente a coluna aditiva necessária; os
  registros existentes de catálogo, protocolos e reservas permanecem intactos.
- A entrega não é homologada até revisão independente e verificação visual
  autenticada.

## Evidências da primeira etapa em 10/11/2026

- A interface de programação de aplicações respondeu `200` em
  `GET /api/substances` com 217 registros. A substância de identificador 14
  retornou dose padrão `100 MG / 2 ML`, sem intervalo cadastrado e sem volume
  estruturado. ADEK, identificador 832, retornou intervalo de 15 dias, volume
  textual de 2 mL, valor de R$ 49,47 e quatro componentes.
- Os testes do fluxo de criação sintético e do PostgreSQL isolado passaram:
  23 testes em dois arquivos. O teste de rota usa armazenamento sintético; o
  teste PostgreSQL confirma leitura posterior da fotografia JSON, mas não é um
  teste completo da rota contra esse banco.
- Os testes de seleção passaram: seis testes cobrem dose padrão, intervalo
  ausente, intervalo de 15 dias, intervalo personalizado e ausência de
  inferência por concentração ou volume.
- A compilação do servidor e da interface terminou. A interface ainda emite
  avisos existentes de chaves `width` e `height` repetidas em
  `src/pages/arsenal/preview-validacao.tsx`, fora do escopo desta entrega.
- A verificação de tipos das bibliotecas passou após manter o arquivo-barrel do
  Zod restrito ao módulo gerado da interface. As verificações completas dos
  artefatos continuam falhando em outros arquivos; a interface de protocolo e
  o construtor da fotografia não aparecem entre os erros atuais.
- A captura da rota de criação mostra a tela e os 217 registros. As chamadas
  autenticadas de clientes e menu responderam `401` no navegador de captura;
  portanto, não foi possível verificar visualmente uma seleção autenticada.
- A coluna `catalog_snapshot` existe no banco de desenvolvimento. A coluna
  antiga `empresa_id` também permanece; a tabela mantém 123 itens, dos quais 73
  têm `empresa_id`. A alteração foi aditiva.
- Nenhum protocolo de cliente foi criado nesta etapa. O protocolo 72, suas
  reservas, o catálogo original e os serviços externos não foram alterados.
  Não houve envio ao Google, e-mail, Telegram ou publicação.

## Evidências da correção de apresentação em 10/11/2026

- O formulário mostra o nome sem teor percentual ou apresentação em volume e
  aceita apenas uma dose inequívoca; apresentações ambíguas exigem revisão.
- O detalhe do protocolo, a resposta da interface de programação de aplicações,
  a geração do protocolo e o RAS FAP usam somente a dose prescrita. O PDF mantém
  duração, via, sessões e demais dados clínicos existentes, mas não exibe
  concentração, volume, ampolas nem equivalência em volume.
- O código de criação recusa doses com apresentação e não grava protocolo nem
  altera o cadastro original nesses casos.
- A extração de texto dos PDFs sintéticos confirmou `LIDOCAINA — 100 mg` e a
  ausência de teor percentual, mL e ampolas. O teste cobriu também a tabela de
  e-mail e os caminhos autenticados de prévia/emissão com integrações simuladas.
- Foram aprovados 120 testes do servidor em sete arquivos e nove testes do
  auxiliar do formulário. O teste de PDF cobre conteúdo não assinado; não prova
  a cadeia real de certificado nem uma entrega externa.
- A compilação do servidor e da interface terminou. A interface ainda mostra
  avisos de chaves `width` e `height` repetidas em
  `src/pages/arsenal/preview-validacao.tsx`, fora desta correção.
- A verificação completa de tipos continua falhando em pontos do projeto,
  incluindo `PDFFont`, `docSessions` sem tipo explícito e campos de cliente
  anuláveis. Não há erro apontado nos novos auxiliares de dose; isso não equivale
  a uma verificação de tipos aprovada.
- A captura da rota do Cockpit mostrou bloqueio de acesso e respostas `401`;
  portanto, a interface autenticada do protocolo não foi verificada pelo agente.
  A revisão independente também não estava disponível nesta sessão.
- Os testes usaram dados sintéticos e integrações simuladas. Nenhum protocolo,
  reserva ou cadastro de substância foi alterado; nenhum e-mail, Telegram ou
  evento do Google foi enviado; não houve publicação.

## Etapas seguintes, sem homologação antecipada

1. Confirmar o formulário e o detalhe autenticados com o responsável do produto.
2. Conferir a dose exibida na agenda interna e no evento do Google sem alterar
   regras de reserva nem permissões entre clínicas.
3. Revisar a apresentação do orçamento formal somente via `substanceId`,
   preservando `budget_catalog` como fonte comercial separada.
4. Testar sincronização Google e cada ação de comunicação em destinos de teste
   identificados, sem destinatários reais.

## Reteste autenticado e nova descoberta — 10/11/2026

- O responsável conferiu ADEK, identificador 832, e Coenzima Q10, identificador
  14, sem criar protocolo. A tela mostrou, respectivamente, a composição com
  `/ 2 ML` e `100 MG / 2 ML`; o intervalo quinzenal de ADEK e a ausência de
  intervalo de Q10 estavam corretos.
- A conferência também observou campos de volume e concentração. Esses campos
  pertencem ao cadastro e devem continuar nele; não podem aparecer como dose no
  protocolo nem no RAS FAP.
- A inspeção do código local encontrou `formatRAS` devolvendo `r.substances`
  diretamente. Esse caminho de leitura contorna `dosePrescritaParaDocumento`
  mesmo quando a geração do PDF já a utiliza.
- ADEK contém vários componentes e uma apresentação em 2 mL. Como a dose
  prescrita não pode ser identificada com segurança apenas removendo o volume,
  a regra é deixar a dose vazia e exigir revisão clínica. Para Q10, a convenção
  previamente aprovada permite preencher somente `100 mg` a partir de
  `100 MG / 2 ML`.
- Correção prevista: normalizar as doses no retorno do RAS e ocultar conteúdo
  inseguro em toda prévia de protocolo. Testes devem provar que a resposta não
  revela `/ 2 ML`, que o valor original armazenado não é modificado e que
  composições ambíguas exigem revisão. Nenhum dado clínico será criado ou
  regravado.
- Resultado da correção: 38 testes do servidor e 10 testes da interface
  passaram. A resposta do RAS e a entrada do gerador de PDF mostram `100 mg`
  para Q10 e deixam ADEK vazia para revisão; o texto original do registro de
  teste permanece inalterado.
- As compilações do servidor e da interface terminaram. A verificação completa
  de tipos continua com 162 erros em 48 arquivos; não apontou erro nas rotas e
  testes do servidor alterados nesta correção.
- A captura desta execução não tinha sessão autenticada e não permitiu selecionar
  Q10 ou ADEK. Portanto, a apresentação autenticada depois da correção permanece
  sem verificação independente; nenhum protocolo foi criado.
