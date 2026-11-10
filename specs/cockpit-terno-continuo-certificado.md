# Cockpit: terno contínuo e certificado do profissional

## Decisão

Em 10/11/2026, o responsável escolheu o modelo B entre quatro prévias.
O cabeçalho e a régua mantêm o tecido azul mais claro, com as duas riscas
da marcação de consulta e sem emenda. A área de trabalho conserva os
temas claro e escuro já existentes. O menu, as ações e as doze ferramentas
continuam na ordem atual.

## Limites

- Retirar o espaço externo somente nas rotas `/cockpit` e `/cockpit/...`.
- A régua continua fixa durante a rolagem e utilizável no celular.
- No computador, o menu e a identificação da conta permanecem visíveis
  enquanto o conteúdo é rolado; a lista do menu tem rolagem própria.
- O indicador compacto pertence à conta do médico autenticado e aparece
  junto à própria conta no menu, não junto à foto do cliente.
- Retirar a faixa de certificado do detalhe do protocolo; manter os demais
  componentes de certificado em suas telas e toda validação no servidor.
- O indicador da conta não afirma que outro médico é o responsável pelo
  protocolo. Indisponibilidade, sessão não confirmada, médico diferente e
  certificado inválido nunca podem ser apresentados como certificado válido.
- Não alterar agendamento, autorizações, dados clínicos, ações dos botões,
  emissão, rotas ou persistência.

## Impactos e falhas previstas

| Risco | Proteção e verificação |
| --- | --- |
| A régua deixa de acompanhar a rolagem | Não introduzir um contêiner que limite o posicionamento fixo; verificar rolagem no navegador. |
| Risca desalinhada ou faixa branca ao recolher o menu | Uma mesma pintura ancorada à janela no fundo e na régua; conferir as duas posições do menu. |
| Texto ilegível em tema escuro ou celular | Preservar o tema e verificar contraste e navegação nos dois tamanhos. |
| Certificado de outro profissional aparece como válido | Reutilizar a validação autenticada existente e comparar a identidade antes de mostrar o estado. |
| Erro de rede aparenta certificado válido | Reutilizar o estado explícito de indisponibilidade do componente existente. |
| Esconder certificado causa perda de uma função | Alterar somente a apresentação no detalhe; manter verificação na emissão e os demais usos do componente. |
| Mudança visual altera dados | Testes somente de leitura, sem criar, alterar, enviar ou excluir dados clínicos. |

## Evidências necessárias

Verificar o desenho em computador e celular, menu aberto e recolhido, rolagem,
posição dos botões, seleção de ferramentas e tratamento do estado do certificado.
Apontar separadamente qualquer verificação não executada. Não chamar homologado
sem revisão independente e evidência suficiente.
