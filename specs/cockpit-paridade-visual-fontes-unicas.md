# Especificação — Paridade visual das ferramentas no Cockpit

Data: 01/11/2026
Estado: ESPECIFICADO — construção pendente de revisão

## 1. Objetivo

Garantir que as ferramentas clínicas abertas dentro do Cockpit da Consulta usem a
mesma tipografia, cores, componentes e padrões de apresentação das respectivas
telas autônomas disponíveis no menu lateral. O Cockpit mantém o contexto do
cliente, mas não cria uma segunda identidade visual para a mesma ferramenta.

## 2. Escopo ativo

Rota ativa: `/cockpit/:clientId/:aba`, renderizada por `CockpitShell`.

Revisar as doze abas e o acompanhamento diário persistente:

1. Prescrição.
2. Injetáveis.
3. Implantes.
4. Exames.
5. Evolução.
6. Anamnese prévia.
7. Documentos.
8. Protocolos.
9. Dieta e Treino.
10. Financeiro.
11. Cadastro.
12. Telegram.
13. Acompanhamento diário, sempre acima da aba selecionada.

O cockpit legado `/cockpit-cliente` redireciona para a rota ativa e não será
reaberto nem reformado nesta etapa. O antigo cockpit de outra rota não será
alterado.

## 3. Fonte visual e arquitetura

- Para cada ferramenta que possui tela autônoma, a tela autônoma é a referência
  visual vinculante.
- Quando a tela autônoma já aceita modo embutido, o Cockpit deve reutilizar esse
  componente e fornecer `clientId`, preservando os motores e eliminando drift.
- Quando ainda não aceita modo embutido, harmonizar a camada visual no painel
  existente sem mudar contrato, validação, gravação, assinatura, emissão,
  autorização, destinatários ou navegação fora do Cockpit.
- Para abas sem tela autônoma equivalente, aplicar o padrão interno Paxter:
  navy e ouro na marca, conteúdo claro, Inter na operação, EB Garamond em títulos
  e valores que pertencem a essa fonte, relevos 3D, linhas-guia fixas e estados
  semânticos.
- Os painéis devem compartilhar tokens e componentes de apresentação, sem
  introduzir cópias de regras clínicas ou de chamadas de serviço.

## 4. Regras visuais obrigatórias

- Tipografia de interface: Inter; títulos e nomes com função editorial: EB
  Garamond, conforme a Lei das Quatro Fontes da skill.
- Cores da marca: navy e ouro; verde, âmbar, vermelho e ciano somente para
  estados e foco, sem trocar o significado.
- Relevo: manter `panel-3d`, `panel-3d-sub`, `bevel-3d`, `concave-3d`,
  `field-engraved` e botões Paxter apropriados à intenção.
- Organização: mesmos rótulos, alinhamentos, colunas e hierarquia da tela
  autônoma correspondente; posições fixas e linhas-guia imaginárias.
- Responsividade: comparar celular de aproximadamente 402 pixels com desktop
  de aproximadamente 1.280 pixels; não aceitar corte ou rolagem horizontal
  indevida.
- A seleção de cliente, a troca de aba e o modo embutido permanecem intactos.

## 5. Limites de segurança e comportamento

- Nenhuma alteração de banco de dados, serviço externo, autenticação,
  autorização clínica, assinatura, cobrança ou envio real.
- Não usar dados clínicos reais em testes.
- Não mudar cálculo, payload, texto clínico, sequência de emissão ou conteúdo de
  documento por causa de apresentação.
- Mudança encontrada que afete um contrato funcional deve bloquear esta etapa e
  ser documentada separadamente.

## 6. Falhas previstas e mitigação

| Falha possível | Mitigação |
|---|---|
| Tela embutida diverge da ferramenta autônoma | Reutilizar a tela autônoma quando houver contrato `embedded`; comparar estrutura e estilos |
| CSS global altera uma ferramenta fora do Cockpit | Escopar classes e estilos ao conteúdo do Cockpit; não alterar estilos globais |
| Relevo 3D perde o contraste por utilitários conflitantes | Reusar classes Paxter já existentes e conferir tema claro |
| Tela móvel fica espremida ou cortada | Revisão visual em 402 pixels e desktop em 1.280 pixels |
| Harmonização altera comportamento clínico por acidente | Diff de lógica, testes já existentes e revisão independente sequencial |
| Uma aba sem tela independente recebe uma aparência inventada | Aplicar o padrão interno documentado, sem alegar paridade inexistente |

## 7. Critérios de aceite

1. Inventário confirma a correspondência de cada aba com sua tela autônoma ou
   registra que ela não existe.
2. Nenhuma aba clínica com ferramenta autônoma permanece com tipografia ou
   cores conflitantes sem justificativa explícita.
3. As funções atuais continuam disponíveis; nenhuma aba ou ação desaparece.
4. Verificação estática e testes direcionados passam.
5. Capturas do Cockpit são verificadas em celular e desktop para as telas
   alteradas.
6. A revisão independente analisa o diff real e os critérios desta
   especificação.
7. Sem autenticação disponível para inspeção visual, a etapa fica BLOQUEADA para
   homologação; não se declara concluída só por compilação.
