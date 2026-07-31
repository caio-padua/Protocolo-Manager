/**
 * slack-glossario.ts
 * Glossário de termos técnicos para o monitor de LLMs no Slack.
 *
 * REGRA CENTRAL: cada termo tem um número PERMANENTE = sua posição (1-based)
 * neste array. O número NUNCA muda entre mensagens. Termo novo entra sempre
 * no FINAL — nunca se reordena, nunca se remove.
 *
 * Assim (*1) significa sempre "hash" em qualquer mensagem, hoje e daqui a
 * um ano. O CEO aprende por repetição, que era o ponto inteiro.
 *
 * Dr. Code mantém a cópia autoritativa em:
 *   PADUA-SOFTWARE-DESIGN/DICIONARIO.md
 * Os números lá e aqui devem ser idênticos.
 */

export type GlossarioEntry = {
  termo: string;   // termo técnico exato (case-insensitive na busca)
  leigo: string;   // explicação em português simples para o CEO
  // número permanente = índice + 1 no array GLOSSARIO (derivado, não armazenado)
};

/** Lista completa de termos técnicos com explicações para o CEO. */
export const GLOSSARIO: GlossarioEntry[] = [
  { termo: "hash", leigo: "impressão digital digital de um arquivo — garante que nada foi alterado" },
  { termo: "API", leigo: "porta de comunicação entre sistemas — como um garçom que leva o pedido da cozinha à mesa" },
  { termo: "JWT", leigo: "crachá digital com prazo de validade — prova quem você é sem precisar digitar senha a cada clique" },
  { termo: "CORS", leigo: "lista de convidados de um servidor — só entra quem está na lista" },
  { termo: "tenant", leigo: "cliente/empresa que usa o sistema de forma isolada, como um apartamento num prédio" },
  { termo: "middleware", leigo: "fiscal de entrada — checa credenciais antes de deixar passar o pedido" },
  { termo: "endpoint", leigo: "endereço específico de uma função no servidor — como uma linha direta de telefone" },
  { termo: "cron", leigo: "alarme automático que dispara ações em horários programados, como um temporizador" },
  { termo: "cron job", leigo: "tarefa agendada que roda sozinha no horário marcado" },
  { termo: "schema", leigo: "planta baixa do banco de dados — define o que cabe em cada gaveta" },
  { termo: "deploy", leigo: "publicar o sistema para o mundo real — sair do teste para o ar aberto" },
  { termo: "token", leigo: "chave digital temporária que comprova identidade sem precisar de senha" },
  { termo: "webhook", leigo: "campainha que toca quando algo acontece num serviço externo e avisa o nosso sistema" },
  { termo: "ledger", leigo: "livro-caixa digital — registro cronológico e imutável de tudo que aconteceu" },
  { termo: "buffer", leigo: "sala de espera temporária para dados em trânsito — como a fila antes da catraca" },
  { termo: "pipeline", leigo: "esteira de processamento — dados entram de um lado e saem processados do outro" },
  { termo: "royalty", leigo: "percentual pago ao criador toda vez que o produto licenciado é vendido" },
  { termo: "RLS", leigo: "Row Level Security — porteiro que decide qual linha do banco cada usuário pode ver" },
  { termo: "UUID", leigo: "número de identificação único garantidamente diferente de qualquer outro no mundo" },
  { termo: "migration", leigo: "mudança controlada na estrutura do banco — como reformar um cômodo sem derrubar a casa" },
  { termo: "seed", leigo: "dados iniciais plantados no banco para o sistema funcionar na primeira vez" },
  { termo: "mimeType", leigo: "etiqueta que diz ao computador que tipo de arquivo é aquele (PDF, imagem, planilha...)" },
  { termo: "proxy", leigo: "intermediário que repassa pedidos entre dois lados — como um corretor de imóveis" },
  { termo: "OAuth", leigo: "protocolo de autorização que deixa você entrar com Google/Slack sem dar sua senha ao sistema" },
  { termo: "SSE", leigo: "Server-Sent Events — canal de transmissão ao vivo do servidor para o navegador, como uma TV aberta" },
  { termo: "env var", leigo: "variável de ambiente — configuração secreta guardada fora do código, nunca exposta" },
  { termo: "pull", leigo: "baixar atualizações do repositório central para o seu computador" },
  { termo: "commit", leigo: "salvar uma versão do código com uma descrição do que foi alterado" },
  { termo: "branch", leigo: "ramo independente do código — permite testar uma ideia sem afetar o principal" },
  { termo: "merge", leigo: "juntar dois ramos de código em um só, como costurar dois documentos" },
  { termo: "repo", leigo: "repositório — pasta versionada com todo o histórico do código" },
  { termo: "fail-safe", leigo: "proteção que evita erros graves — se algo falhar, o sistema não trava" },
  { termo: "spec", leigo: "documento de especificação — o contrato escrito do que deve ser construído antes de escrever código" },
  { termo: "tenant context", leigo: "contexto de qual clínica/empresa está usando o sistema naquele momento" },
  { termo: "ai_usage_log", leigo: "tabela que registra toda vez que uma IA foi acionada: quem usou, quanto custou, quantas palavras processou" },
  { termo: "logAiUsage", leigo: "função que registra automaticamente o uso de IA no livro-caixa do sistema" },
  { termo: "requireCeoInstance", leigo: "porteiro eletrônico que só deixa passar quem tem a chave exclusiva do CEO" },
  { termo: "PADAXOR_AI_BYPASS", leigo: "chave secreta que identifica que é o CEO quem está acessando — não um licenciado" },
  { termo: "empresa_id", leigo: "número que identifica qual clínica está usando o sistema — evita misturar dados de clínicas diferentes" },
  { termo: "tenantContext", leigo: "pacote de informações que diz qual clínica está ativa numa requisição" },
  { termo: "Slack", leigo: "plataforma de mensagens corporativas — como um WhatsApp profissional com canais por tema" },
  { termo: "Drive", leigo: "Google Drive — pasta virtual na nuvem onde arquivos são guardados e compartilhados" },
  { termo: "Sheets", leigo: "Google Planilhas — planilha online que todos podem ver e editar ao mesmo tempo" },
  { termo: "Cloudflare", leigo: "empresa de infraestrutura de internet — protege e acelera sistemas na web" },
  { termo: "Railway", leigo: "plataforma onde o sistema fica publicado e rodando 24 horas na internet" },
  { termo: "Replit", leigo: "ambiente de desenvolvimento online onde o código é escrito e testado" },
  { termo: "Anthropic", leigo: "empresa criadora do Claude — o modelo de IA que usamos para raciocínio complexo" },
  { termo: "Gemini", leigo: "modelo de IA do Google — usado para leitura e interpretação de documentos e exames" },
  { termo: "OpenAI", leigo: "empresa criadora do GPT — um dos modelos de IA que o sistema pode acionar" },
  { termo: "token (IA)", leigo: "unidade de medida de texto para IAs — aproximadamente 0,75 palavra em português" },
  { termo: "input_tokens", leigo: "quantidade de texto enviada para a IA ler e processar" },
  { termo: "output_tokens", leigo: "quantidade de texto que a IA gerou como resposta" },
  { termo: "P0", leigo: "prioridade máxima — o sistema não funciona direito sem isso" },
  { termo: "P1", leigo: "prioridade alta — impacta o uso diário, deve ser feito logo" },
  { termo: "P2", leigo: "prioridade média — importante mas não urgente" },
  { termo: "P3", leigo: "prioridade baixa — bom ter, mas pode esperar" },
  { termo: "cron horário", leigo: "alarme que dispara uma vez por hora, todo dia, automaticamente" },
  { termo: "planilha de produção", leigo: "documento mestre onde fica registrado o status de cada tarefa do projeto" },
];

// ---------------------------------------------------------------------------
// Motor de anotação: marca termos com (*N) PERMANENTES e gera legenda ao final
//
// REGRA: o número de cada termo é sua posição 1-based no array GLOSSARIO.
// Nunca é recalculado por mensagem. Se "API" é o item 2, ela aparece como
// (*2) em qualquer mensagem, hoje ou daqui a um ano.
// ---------------------------------------------------------------------------

export type AnotacaoResult = {
  textoAnotado: string;    // texto com (*N) permanentes
  legendas:     string[];  // somente os termos que apareceram, com seus números fixos
};

export function anotarTermos(texto: string): AnotacaoResult {
  // Índice permanente de cada termo: posição no array + 1 (imutável)
  const numeroPermanente = new Map<string, number>(
    GLOSSARIO.map((entry, i) => [entry.termo.toLowerCase(), i + 1])
  );

  let textoAnotado = texto;
  // Controla quais termos foram encontrados NESTA mensagem (para o rodapé)
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

    // Termo encontrado — recupera seu número PERMANENTE do dicionário
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

  // Rodapé: ordenado pelo número permanente (não pela ordem de aparição no texto)
  encontradosNaMensagem.sort((a, b) => a.numero - b.numero);
  const legendas = encontradosNaMensagem.map(
    ({ numero, entry }) => `(*${numero}) *${entry.termo}* = ${entry.leigo}`
  );

  return { textoAnotado, legendas };
}
