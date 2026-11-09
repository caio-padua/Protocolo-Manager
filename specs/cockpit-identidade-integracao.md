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
