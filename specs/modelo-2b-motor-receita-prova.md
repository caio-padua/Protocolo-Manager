# Modelo 2B no motor real de receita: etapa de prova

## Objetivo
Exercitar o desenho 2B no gerador efetivamente usado para receitas, sem
ativar o modelo em documentos clínicos nem modificar documentos existentes.

## Requisitos
1. A prova usa o gerador de receita V2, com conteúdo e quadro de assinatura
   existentes; o pedido de exames já possui prova no seu gerador real.
2. A opção é exclusiva de homologação sintética, recusada em produção e sem
   acesso por rotas clínicas. Todas as páginas avisam que não têm validade.
3. O rodapé é carimbado uma única vez depois da paginação e antes de assinar;
   o conteúdo respeita a margem inferior de 44 milímetros.
4. Preservar os fluxos atuais sem a opção e não alterar o acesso a documentos,
   configurações, dados, assinatura, persistência ou canais de envio.
5. Não afirmar que a imagem aproximada, a identidade empresarial, a emissão
   clínica ou a verificação autenticada foram homologadas.

## Falhas previstas
| Falha | Consequência | Barreira |
|---|---|---|
| Prova ativada na emissão clínica | Documento sem identidade ou verificação apropriada | Exigir homologação, bloquear produção e não conectar rotas |
| Texto ou assinatura invade o rodapé | Conteúdo ilegível | Reservar 44 milímetros e testar paginação |
| Rodapé após assinar | Assinatura inválida | Carimbar antes da assinatura e conferir o arquivo |
| Prova confundida com receita | Risco clínico | Aviso em todas as páginas e dados inteiramente fictícios |
| Instituição errada | Identidade indevida | Identidade empresarial real ainda não é conectada nesta etapa |

## Pronto para esta etapa
Testes sintéticos do gerador real, incluindo múltiplas páginas, preservação do
conteúdo, avisos e bloqueios. A emissão clínica no Modelo 2B continua pendente
da identidade correta por empresa, do acesso autenticado à cópia, da aprovação
visual final, da revisão independente e das demais verificações clínicas.

## Evidência desta etapa
1. O gerador real da receita foi exercitado com o Modelo 2B em modo de prova.
2. Testes sintéticos verificaram receitas e exames com múltiplas páginas,
   preservação dos itens, avisos, paginação, código do validador oficial no
   quadro de assinatura e integridade de assinaturas com certificado fictício.
3. A prova de receita sem certificado e a de exames foram renderizadas e
   examinadas visualmente. A prova da receita tem quatro páginas e a de exames
   tem duas. Não houve impressão física ou uso de certificados reais.
4. Passaram 17 testes nos arquivos de prova, geometria e assinatura; o servidor
   compilou e reiniciou. A jornada autenticada na tela não foi verificada.
5. O cabeçalho da prova ainda contém a arte fixa do Instituto; o cadastro
   empresarial em produção e o acesso autenticado à cópia ainda não foram
   integrados. Os motores clínicos continuam a usar o modelo anterior.
