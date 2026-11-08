# Receitas com o padrão clínico PAXMED

## Objetivo
Usar na emissão de receitas o mesmo cabeçalho azul e rodapé PAXMED da
demonstração aprovada, sem afetar fórmulas, identidade, assinatura ou regras
regulatórias.

## Requisitos
1. A emissão do cockpit usa automaticamente a identidade empresarial validada
   no servidor. Identidade ausente, de outra empresa ou inválida impede a emissão.
2. Receita comum e especial usam o mesmo cabeçalho e rodapé; o tipo e os
   requisitos regulatórios permanecem no corpo.
3. A demonstração conserva seus avisos de teste e não tem validade clínica.
   Uma receita clínica nunca deve exibir esses avisos, nem dados de exemplo.
4. A faixa de assinatura fica na parte inferior da última página, sem sobrepor
   texto ou rodapé. Todas as páginas são completadas antes da assinatura.
5. O código de acesso da receita leva a uma página com login obrigatório;
   o servidor verifica profissional, clínica, prescrição, arquivo, assinatura
   registrada e integridade da cópia antes de fornecê-la. O código sozinho não
   dá acesso nem certifica a assinatura criptográfica.
6. Desabilitar temporariamente a entrada de menu das faixas; preservar a tela,
   as configurações salvas e os documentos históricos. O desenho novo do
   cabeçalho e rodapé não é controlado pelas faixas antigas.
7. Evitar a criação automática da cópia alternativa com desenho antigo;
   manter as receitas regulatórias assinadas e sua entrega separada.
8. Preservar farmácias, fórmulas, desmembramento, dados, permissões, avisos de
   certificado e numeração. Nunca modificar arquivos já assinados.

## Riscos e barreiras
| Risco | Barreira |
|---|---|
| Marca de outra empresa | Resolver identidade pelo contexto autorizado, recusar exemplo e falha de leitura. |
| Prova confundida com receita | Aviso obrigatório apenas na prova e testes negativos. |
| Conteúdo ou faixa sobrepostos | Paginação com margem protegida, teste em páginas curtas e longas e renderização visual. |
| Documento modificado após assinar | Carimbar antes de assinar, conferir integridade dos bytes persistidos e assinatura. |
| Código revela prontuário | Exigir sessão e vínculo antes de entregar; resposta sem dados ao negar. |
| Perda de funcionalidades | Preservar histórico, editor e configurações; não alterar cálculo clínico ou desmembramento. |
| Cópia antiga contradiz modelo novo | Suspender a geração automática dessa cópia, não apagar as anteriores. |

## Homologação
Revisão independente sequencial, testes sintéticos de geração, autorização,
falhas de identidade, assinatura e paginação; examinar o documento renderizado
e a tela em execução. Registro de teste não autoriza envio externo ou altera
prontuário real. Qualquer evidência ausente mantém a entrega em construção.
