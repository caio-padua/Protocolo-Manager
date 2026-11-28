# Integração da identidade e das três visualizações do Cockpit

## Objetivo

Aplicar ao Cockpit real o desenho aprovado, preservando a identidade do cliente,
as ferramentas existentes, suas permissões e os processos clínicos.

## Requisitos

1. A identificação vem exclusivamente do cliente confirmado para a rota do
   Cockpit. Nome, foto, data de nascimento, documento, contato e endereço usam o
   cadastro real; uma falha de consulta não vira dado vazio ou estado normal.
2. Apresentar o nome em uma linha. Quando necessário, abreviar do penúltimo nome
   para a esquerda e, se ainda não couber, cortar visualmente com reticências.
   O nome completo permanece acessível por teclado, toque e leitor de tela.
3. Apresentar a idade em anos, meses e dias, sem vírgulas ou conjunção, e o
   endereço em linha própria. Não mostrar idade para data ausente, inválida ou
   futura. Usar a data civil de São Paulo; para apresentação, o aniversário de
   29 de fevereiro é ajustado ao último dia de fevereiro nos anos não bissextos.
4. Não mostrar “sem alarme”, classificação ou plano como fatos se não houver
   fonte real para o cliente. Não inferir diagnóstico, adesão ou resultado.
5. Usar o seletor universal existente uma única vez. A troca de cliente não pode
   manter dados, formulários ou respostas do cliente anterior.
6. Reorganizar as ações de edição e preparação de pastas do Drive e a régua
   deslizante. Retirar apenas o atalho superior duplicado de protocolo; preservar
   a ferramenta Protocolos e o lançador original.
7. Preservar o acesso à marcação existente. O atalho de agendamento deve manter
   o cliente selecionado somente se a passagem de identidade puder ser feita com
   autorização e validação; nunca afirmar vínculo que o servidor não comprovou.
8. Oferecer as visualizações Abas, Telas e Ficha contínua no computador e adaptar
   os controles ao celular. As três usam os mesmos painéis reais, a mesma rota de
   cliente e as mesmas permissões. Na ficha, permitir expandir e recolher cada
   seção e todas as seções.
9. Não montar cópias simultâneas da mesma ferramenta nem descartar formulários
   ou operações ao alternar visualizações. As restrições existentes para
   protocolo em andamento continuam válidas também nos novos controles.
10. Abrir várias ferramentas não pode executar operações externas por efeito
    colateral. Em particular, a abertura geral não marca mensagens como lidas;
    a ação explícita de leitura continua disponível.
11. Respeitar fontes e estados reais dos painéis; ações sem implementação real
    identificada não podem se apresentar como prontas ou produzir dados fictícios.
12. Preservar todos os menus, as rotas e os motores de prescrição, protocolo,
    agendamento, cálculo e emissão. Não alterar dados reais durante os testes.
13. Oferecer no Cockpit real a alternância de tema claro e escuro em computador
    e celular, preservando a escolha e o cliente ao navegar entre as ferramentas.
14. No formulário de protocolo embutido, identificar o médico pela resposta
    autenticada do contexto clínico do mesmo cliente; não pedir que o médico
    selecione a si próprio. Falha de identidade bloqueia o avanço e permite nova
    tentativa. Profissionais não médicos conservam o fluxo de escolha existente.
15. Conferir as ferramentas reais individualmente e não afirmar integração de
    ferramentas que não tenham evidência. A identificação visual não substitui
    autorização nem altera o médico responsável de registros existentes.

## Falhas previstas

| Gravidade | Falha e consequência | Barreira e recuperação | Teste |
| --- | --- | --- | --- |
| Crítica | Dados de outra pessoa aparecem após troca ou recusa de acesso | Confirmar o identificador da rota; ocultar conteúdo em erro e permitir nova tentativa | Troca, resposta atrasada e acesso recusado |
| Crítica | Mudança de visualização perde ou duplica uma operação clínica | Uma instância por ferramenta; manter os bloqueios de protocolo e o estado montado | Alternar e recolher durante preenchimento e operação pendente |
| Alta | Expandir tudo marca mensagens como lidas sem intenção | Não executar a marcação automática na abertura geral | Vigiar requisições durante a expansão |
| Alta | Agendamento retoma cliente ou pagamento de outra pessoa | Revalidar identidade e preservar o fluxo existente; não inventar vínculo | Testar troca de identidade e recuperação de pagamento antes de conectar |
| Alta | Dado ausente ou erro aparece como informação clínica normal | Estados neutros e erros explícitos | Cliente sem campos e falha de rede |
| Média | Doze painéis simultâneos travam a navegação ou são comprimidos | Carregamento sob demanda e disposição responsiva | Computador e celular com todas as seções |
| Média | Nome longo perde identificação | Abreviação apenas visual e acesso ao nome completo | Nomes curtos, longos, acentuados e mudança de largura |
| Crítica | Médico ou cliente anterior é usado após mudança de acesso | Contexto autenticado do cliente atual; bloqueio em erro, troca e revalidação | Mudança de cliente, troca de sessão, falha e resposta atrasada |
| Alta | Tema escuro prejudica leitura ou controles | Reutilizar tokens e inspecionar telas reais nos dois tamanhos | Troca de tema, navegação, recarga e contraste |
| Alta | Contexto clínico falha enquanto o resumo está aberto | Aviso e nova tentativa no resumo; impedir confirmação até revalidar | Falha após abertura do resumo e recuperação |
| Alta | Uma chamada direta atribui outro profissional já vinculado | Limitação preexistente da rota geral; não alterar a delegação de outras telas sem especificar autorização por papel | Auditoria independente e teste em ambiente isolado antes de afirmar imposição no servidor |
| Alta | Lista de clientes recusada por sessão ausente ou expirada | Distinguir resposta de autenticação de falha comum e oferecer acesso profissional com retorno ao cockpit; não liberar dados sem sessão | Sessão ausente, expirada, erro de rede e recuperação |
| Média | Apenas o conteúdo inferior muda de cor | Aplicar contraste claro/escuro também ao cabeçalho, identidade, controles e abas, preservando legibilidade | Comparação visual em celular e computador |

## Definição de pronto

- Os requisitos acima são conferidos na aplicação real com dados autorizados e
  em testes isolados, sem envio ou alteração clínica real.
- Os fluxos de protocolo e troca de cliente passam por regressão, inclusive
  recusa de acesso e operação pendente.
- A abertura geral não dispara escrita externa, e todas as ferramentas exibidas
  pertencem ao mesmo cliente confirmado.
- A apresentação e os controles são verificados em computador e celular.
- Uma revisão independente sequencial examina o resultado e suas limitações.
- Falta de integração, teste ou revisão impede declarar homologação.

## Linhas vermelhas

Não alterar `/api/budgets/calculate` nem o motor de desmembramento.
Não excluir menus, ferramentas, arquivos ou dados. Não emitir documentos,
criar agendamentos, cobrar ou enviar mensagens para testar esta interface.

## Evidências e situação da integração

- Em 09/11/2026, a lista sem sessão retornou recusa de autenticação. A interface
  passou a oferecer entrada com retorno à rota, sem expor a lista. O fluxo real
  de entrada e seleção da cliente autorizada foi executado no mesmo navegador
  de celular, sem gravar dados clínicos.
- O cabeçalho e o conteúdo foram vistos nos dois temas em celular; a alternância
  e a persistência também foram verificadas em computador e celular em testes
  isolados. A revisão independente não encontrou novo impeditivo na correção.
- No protocolo embutido, o médico autenticado deixou de precisar selecionar a
  si próprio; o resumo bloqueia o lançamento quando a identidade não é confirmada.
  A imposição de autoria no servidor geral e o teste de todos os atos de todas
  as ferramentas continuam pendentes; navegação não prova emissão clínica.
- Construção do aplicativo: concluída em 09/11/2026, com avisos anteriores em
  `preview-validacao.tsx` e aviso de tamanho do pacote.
- Testes isolados: 12 cenários de identidade, troca de cliente, protocolo,
  falhas e modos passaram; teste adicional verificou computador e celular.
- Testes determinísticos: três casos de nome e data passaram.
- Revisão independente apontou três riscos: falha do Pulso apresentada como
  ausência, formulário retido após recusa e marcação automática do Telegram.
  Foram corrigidos e os cenários de regressão passaram.
- A tela autenticada da cliente autorizada foi aberta em computador e em uma
  nova janela de celular. Os três modos foram acionados em computador, sem
  criar ou alterar registros clínicos. Também foram examinadas capturas com
  serviços isolados. O serviço especializado de teste de navegador não estava
  disponível; a verificação autenticada foi feita no navegador automatizado.
- O atalho Novo agendamento permanece desabilitado: o fluxo público existente
  não comprova vínculo seguro com o cliente escolhido no Cockpit.
- Os indicadores de avaliação sem fonte identificada permanecem desabilitados;
  classificação e plano sem dados reais aparecem como indisponíveis.
- A marcação de mensagens como lidas fica explícita no painel do Telegram;
  trocar de visualização não altera o estado das mensagens.
- **Estado: EM TESTE.** Não declarar homologação integral enquanto as fontes
  pendentes e a integração segura de agendamento não estiverem implementadas
  e verificadas.
