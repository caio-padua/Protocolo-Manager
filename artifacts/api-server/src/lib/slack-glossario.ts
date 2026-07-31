/**
 * slack-glossario.ts
 * Leitor do dicionário canônico do PADUA-SOFTWARE-DESIGN.
 *
 * FONTE DA VERDADE: dicionario/dicionario.json no repositório caio-padua/PADUA-SOFTWARE-DESIGN
 * Este arquivo é derivado — o JSON é autoritativo.
 *
 * REGRA CENTRAL: cada termo tem um número PERMANENTE = campo "numero" no JSON.
 * O número NUNCA muda entre mensagens. Termo novo entra sempre no FINAL.
 *
 * Dr. Code mantém o JSON. Dr. Replit atualiza este arquivo quando o JSON cresce.
 * Conferidor: python3 dicionario/conferir_dicionario.py no PADUA-SOFTWARE-DESIGN.
 */

export type GlossarioEntry = {
  numero: number;  // número PERMANENTE — nunca recalcular, nunca reordenar
  termo:  string;  // termo técnico exato (case-insensitive na busca)
  leigo:  string;  // analogia clínica para o CEO
};

/**
 * Dicionário canônico — espelho do dicionario.json do Dr. Code.
 * Ordenado por numero permanente. NÃO alterar a ordem.
 */
export const GLOSSARIO: GlossarioEntry[] = [
  { numero:   1, termo: "AI Gateway", leigo: "E a caixa de energia na frente da casa: nada consome sem passar pelo medidor." },
  { numero:   2, termo: "Anthropic", leigo: "E um dos laboratorios de onde vem a inteligencia que o sistema usa." },
  { numero:   3, termo: "API", leigo: "E o balcao de atendimento de um laboratorio. Voce nao entra no laboratorio: chega no balcao, entrega o pedido, recebe o resultado. A API e o balcao, e cada guiche e uma rota." },
  { numero:   4, termo: "append-only", leigo: "E o prontuario do paciente. Voce nao apaga a evolucao de ontem: escreve a de hoje embaixo. Se errou ontem, escreve hoje que errou. O erro fica registrado, e e isso que da valor legal." },
  { numero:   5, termo: "backup", leigo: "E o seguro do carro. Custa todo mes e parece dinheiro jogado fora, ate o dia da batida." },
  { numero:   6, termo: "banco de dados", leigo: "E o arquivo de fichas da clinica, mas que responde em um centesimo de segundo e nunca perde uma ficha por descuido." },
  { numero:   7, termo: "branch", leigo: "E a via de um exame: voce faz o rascunho da conduta numa folha separada antes de escrever no prontuario oficial. Se der errado, joga a folha fora e o prontuario continua intacto." },
  { numero:   8, termo: "CI/CD", leigo: "E a conferencia dupla da enfermagem antes de aplicar a medicacao. Ninguem confia so na memoria de quem preparou." },
  { numero:   9, termo: "circuit breaker", leigo: "E o disjuntor do quadro: corta antes de queimar." },
  { numero:  10, termo: "clone", leigo: "E uma franquia: mesma placa, dono diferente, cozinha propria." },
  { numero:  11, termo: "CNAME", leigo: "E o encaminhamento de telefone: quem liga para o numero antigo cai automaticamente no novo, sem saber que foi encaminhado." },
  { numero:  12, termo: "commit", leigo: "E uma entrada assinada no prontuario: quem escreveu, quando, e o que mudou. Nao se apaga." },
  { numero:  13, termo: "conector", leigo: "E a tomada: voce nao refaz a fiacao da rua, so pluga." },
  { numero:  14, termo: "CORS", leigo: "E a lista da portaria do predio: so sobe quem esta na lista. Sem a lista certa, ate o morador fica na calcada." },
  { numero:  15, termo: "cron", leigo: "E o despertador do sistema: voce marca a hora, ele toca sem ninguem lembrar." },
  { numero:  16, termo: "deploy", leigo: "E a diferenca entre escrever a receita no bloco e entregar na mao do paciente. Enquanto nao entregou, nao existe para ele." },
  { numero:  17, termo: "DKIM", leigo: "E o carimbo e a assinatura no receituario. Sem eles, a farmacia trata como falsificacao." },
  { numero:  18, termo: "DNS", leigo: "E a lista telefonica: voce sabe o nome da pessoa, e ela devolve o numero. Ninguem decora o numero." },
  { numero:  19, termo: "dry-run", leigo: "E o ensaio da cirurgia: todo mundo faz os gestos, ninguem corta." },
  { numero:  20, termo: "empresa_id", leigo: "E o numero do prontuario: e o que diz de quem e aquela ficha." },
  { numero:  21, termo: "endpoint", leigo: "E o guiche especifico dentro do balcao: um guiche para entregar exame, outro para retirar resultado." },
  { numero:  22, termo: "FK", leigo: "E o numero do prontuario escrito no pedido de exame: e o que amarra aquele exame aquele paciente e nao a outro." },
  { numero:  23, termo: "Gemini", leigo: "Outro laboratorio, melhor em enxergar imagem e PDF." },
  { numero:  24, termo: "hash", leigo: "E a impressao digital de um documento. Duas pessoas nao tem a mesma, e a sua nao muda sozinha. Se o documento foi adulterado, a impressao digital nao bate mais." },
  { numero:  25, termo: "idempotente", leigo: "E apertar o botao do elevador. Apertar dez vezes nao chama dez elevadores: o andar continua marcado uma vez so." },
  { numero:  26, termo: "indice unico", leigo: "E o CPF: o cartorio nao deixa dois cadastros com o mesmo numero. A regra vive no cartorio, nao na boa vontade de quem preenche." },
  { numero:  27, termo: "ledger", leigo: "E o livro-caixa: cada linha e uma coisa que aconteceu e vale dinheiro." },
  { numero:  28, termo: "login_username", leigo: "E o seu nome na portaria: a senha prova que e voce, o usuario diz quem voce diz ser." },
  { numero:  29, termo: "main", leigo: "E o prontuario oficial, nao o rascunho. O que nao esta nele, oficialmente nao aconteceu." },
  { numero:  30, termo: "merge", leigo: "E juntar as anotacoes de dois medicos sobre o mesmo paciente num prontuario unico." },
  { numero:  31, termo: "middleware", leigo: "E o porteiro do predio: toda visita passa por ele antes de chegar no apartamento, e ele decide quem sobe." },
  { numero:  32, termo: "migration", leigo: "E a reforma da clinica com planta aprovada e registrada, em vez de derrubar parede no impulso." },
  { numero:  33, termo: "mock", leigo: "E o manequim de treinamento. Serve para ensaiar, e e perigoso se alguem esquecer e tratar como paciente." },
  { numero:  34, termo: "multi-tenant", leigo: "E um predio de consultorios: mesma estrutura, mesmo elevador, mas cada sala tem chave propria e ninguem entra na do outro." },
  { numero:  35, termo: "OpenAI", leigo: "Um terceiro laboratorio, forte em transcrever audio." },
  { numero:  36, termo: "PR", leigo: "E o pedido de parecer antes da cirurgia. Alguem olha, comenta, e so depois entra." },
  { numero:  37, termo: "PWA", leigo: "E um aparelho que serve de dois jeitos: no consultorio parece bancada, na mao vira portatil. Mesmo aparelho." },
  { numero:  38, termo: "RBAC", leigo: "E a diferenca entre medico, enfermeiro e recepcao no sistema da clinica: cada um ve a tela do seu papel." },
  { numero:  39, termo: "repositorio", leigo: "E o arquivo morto da clinica, mas em que nada se perde e da para voltar a qualquer dia do passado." },
  { numero:  40, termo: "RLS", leigo: "E a tranca da porta da sala, nao o aviso 'por favor nao entre'. O aviso depende da boa vontade; a tranca nao." },
  { numero:  41, termo: "scrypt", leigo: "E guardar a impressao digital do paciente em vez do dedo dele. Da para conferir se bate, mas ninguem reconstroi o dedo a partir dela." },
  { numero:  42, termo: "SPF", leigo: "E a lista de quem pode assinar receita em nome da clinica. Sem ela, qualquer um assina." },
  { numero:  43, termo: "SSE", leigo: "E o monitor de sinais vitais: ele avisa quando muda, voce nao fica olhando de minuto em minuto." },
  { numero:  44, termo: "token", leigo: "E a pulseira do hospital. Voce se identifica uma vez na recepcao e depois so mostra a pulseira em cada setor." },
  { numero:  45, termo: "UPSERT", leigo: "E abrir ficha se o paciente e novo, ou atualizar a que ja existe se ele ja veio antes. Uma decisao so, automatica." },
  { numero:  46, termo: "webhook", leigo: "E o laboratorio que liga para voce quando o resultado critico sai, em vez de voce ligar de hora em hora perguntando." },
  { numero:  47, termo: "worker", leigo: "E o funcionario dos fundos: nao atende no balcao, faz o servico que leva tempo." },
  { numero:  48, termo: "JWT", leigo: "É a pulseira com QR-code da festa VIP: você mostra na entrada e entra em qualquer área permitida sem fila." },
  { numero:  49, termo: "tenant", leigo: "É um apartamento no prédio: mesma estrutura física, porta separada, mobília própria, vizinho não acessa." },
  { numero:  50, termo: "cron job", leigo: "É o funcionário que toda sexta às 18h fecha o caixa automaticamente — não precisa ninguém mandar." },
  { numero:  51, termo: "schema", leigo: "É a planta baixa da clínica: define onde fica cada sala, quantas portas tem, o que cabe em cada cômodo." },
  { numero:  52, termo: "buffer", leigo: "É a sala de espera antes do consultório: o paciente chega, espera, e é chamado na ordem." },
  { numero:  53, termo: "pipeline", leigo: "É a linha de montagem da farmácia de manipulação: pesa, mistura, encapsula, rotula — em ordem fixa." },
  { numero:  54, termo: "royalty", leigo: "É a comissão do médico que assina o protocolo: toda vez que a clínica licenciada aplica, ele recebe." },
  { numero:  55, termo: "UUID", leigo: "É o CPF do registro: nunca se repete, não depende de nenhum contador central." },
  { numero:  56, termo: "seed", leigo: "É o estoque inicial de uma farmácia recém-aberta: sem ele, o sistema existe mas não tem nada para vender." },
  { numero:  57, termo: "mimeType", leigo: "É a etiqueta do frasco de medicamento: diz se é comprimido, líquido ou pomada antes de abrir." },
  { numero:  58, termo: "proxy", leigo: "É o corretor de imóveis: você fala com ele, ele fala com o proprietário — ninguém se fala diretamente." },
  { numero:  59, termo: "OAuth", leigo: "É dar a chave do carro ao manobrista: ele move o carro, mas não tem acesso à sua casa nem ao cofre." },
  { numero:  60, termo: "env var", leigo: "É o cofre da clínica: a senha fica lá, não escrita no protocolo público." },
  { numero:  61, termo: "pull", leigo: "É sincronizar a agenda do Google: você puxa as consultas novas que outra pessoa adicionou." },
  { numero:  62, termo: "repo", leigo: "É o prontuário completo do sistema: cada mudança está lá, assinada, datada e reversível." },
  { numero:  63, termo: "fail-safe", leigo: "É o gerador de emergência da UTI: se a rede cair, o monitor de sinais vitais continua ligado." },
  { numero:  64, termo: "spec", leigo: "É a prescrição antes da manipulação: o médico escreve o que quer antes de a farmácia produzir." },
  { numero:  65, termo: "tenant context", leigo: "É o crachá do plantonista: diz em qual hospital ele está naquele turno, quais salas pode acessar." },
  { numero:  66, termo: "ai_usage_log", leigo: "É o livro-caixa de exames terceirizados: cada pedido ao laboratório externo fica registrado com o custo." },
  { numero:  67, termo: "logAiUsage", leigo: "É o carimbo automático da balança: todo peso registrado ganha carimbo de data e hora sem ninguém pedir." },
  { numero:  68, termo: "requireCeoInstance", leigo: "É a catraca do andar executivo: não adianta ter crachá de funcionário, precisa do crachá de diretor." },
  { numero:  69, termo: "PADAXOR_AI_BYPASS", leigo: "É o crachá master do dono do prédio: abre qualquer porta, inclusive as que o gerente não alcança." },
  { numero:  70, termo: "tenantContext", leigo: "É a pasta do plantonista: ao entrar no turno, ele recebe a pasta da clínica — dados daquele dia, daquele lugar." },
  { numero:  71, termo: "Slack", leigo: "É o WhatsApp do trabalho: cada assunto tem seu grupo, mas a empresa controla o que fica gravado." },
  { numero:  72, termo: "Drive", leigo: "É o arquivo físico da clínica, mas na nuvem: qualquer médico autorizado acessa de qualquer lugar." },
  { numero:  73, termo: "Sheets", leigo: "É a ficha de controle do estoque que todos veem ao mesmo tempo, sem precisar mandar e-mail com anexo." },
  { numero:  74, termo: "Cloudflare", leigo: "É a portaria do prédio com câmera, identificação e lista de visitantes: nenhum pacote entra sem ser conferido." },
  { numero:  75, termo: "Railway", leigo: "É o data center terceirizado: você coloca o servidor lá, eles garantem a luz, o ar-condicionado e o acesso." },
  { numero:  76, termo: "Replit", leigo: "É o consultório de desenvolvimento: onde o médico estuda o caso antes de escrever a prescrição final." },
  { numero:  77, termo: "token (IA)", leigo: "É como a IA cobra por palavra: não exatamente por palavra, mas é a unidade de conta — ~0,75 palavra em português." },
  { numero:  78, termo: "input_tokens", leigo: "É o número de páginas do prontuário que você entregou para o consultor ler antes de dar o parecer." },
  { numero:  79, termo: "output_tokens", leigo: "É o número de páginas do laudo que o consultor escreveu depois de ler o prontuário." },
  { numero:  80, termo: "P0", leigo: "É o paciente que chega em PCR: vai direto para a ressuscitação, fila não existe." },
  { numero:  81, termo: "P1", leigo: "É o paciente com dor intensa: não está em risco imediato de vida, mas não pode esperar." },
  { numero:  82, termo: "P2", leigo: "É o exame de rotina com resultado alterado: importante resolver, mas não hoje de manhã." },
  { numero:  83, termo: "P3", leigo: "É a pintura da sala de espera: fica melhor, mas o consultório funciona sem ela." },
  { numero:  84, termo: "cron horário", leigo: "É o residente que bate na porta a cada hora para checar o pós-operatório — pontual, sem precisar de chamado." },
  { numero:  85, termo: "planilha de produção", leigo: "É o quadro de cirurgias do centro cirúrgico: todo mundo vê o que está agendado, em andamento e concluído." },
];

// ---------------------------------------------------------------------------
// Motor de anotação: marca termos com (*N) PERMANENTES e gera legenda ao final
//
// REGRA: o número de cada termo é o campo "numero" do GLOSSARIO acima.
// Nunca é recalculado por mensagem.
// ---------------------------------------------------------------------------

export type AnotacaoResult = {
  textoAnotado: string;    // texto com (*N) permanentes
  legendas:     string[];  // somente os termos que apareceram, com seus números fixos
};

export function anotarTermos(texto: string): AnotacaoResult {
  // Índice permanente: campo numero do GLOSSARIO (imutável)
  const numeroPermanente = new Map<string, number>(
    GLOSSARIO.map((entry) => [entry.termo.toLowerCase(), entry.numero])
  );

  let textoAnotado = texto;
  const encontradosNaMensagem: Array<{ numero: number; entry: GlossarioEntry }> = [];
  const jaProcessado = new Set<string>();

  // Varredura do mais longo para o mais curto (evita marcar "cron" antes de "cron job")
  const sorted = [...GLOSSARIO].sort((a, b) => b.termo.length - a.termo.length);

  for (const entry of sorted) {
    const chave = entry.termo.toLowerCase();
    if (jaProcessado.has(chave)) continue;

    const escapado = entry.termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const testeRegex = new RegExp(`\\b(${escapado})\\b`, "gi");

    if (!testeRegex.test(textoAnotado)) continue;

    const numero = numeroPermanente.get(chave)!;
    jaProcessado.add(chave);
    encontradosNaMensagem.push({ numero, entry });

    // Marca APENAS a primeira ocorrência com (*N)
    let primeiraVez = true;
    textoAnotado = textoAnotado.replace(
      new RegExp(`\\b(${escapado})\\b`, "gi"),
      (match) => {
        if (primeiraVez) { primeiraVez = false; return `${match} (*${numero})`; }
        return match;
      },
    );
  }

  // Rodapé: ordenado pelo número permanente
  encontradosNaMensagem.sort((a, b) => a.numero - b.numero);
  const legendas = encontradosNaMensagem.map(
    ({ numero, entry }) => `(*${numero}) *${entry.termo}* = ${entry.leigo}`
  );

  return { textoAnotado, legendas };
}