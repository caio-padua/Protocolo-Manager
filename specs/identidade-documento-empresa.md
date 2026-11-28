# Identidade do Modelo 2B por empresa

## Objetivo
Configurar, no cadastro empresarial, uma identidade de documento compartilhada
por todos os locais da empresa, sem alterar documentos clínicos reais.

## Requisitos
1. Cadastro de Empresas oferece símbolo, nome do cabeçalho e três linhas independentes do rodapé.
2. O símbolo original é preservado em armazenamento privado; a visualização aplica
   o tratamento dourado existente, independentemente da cor de entrada.
3. A identidade pertence à empresa selecionada, nunca é herdada do Instituto por
   outra empresa e não destrói os registros anteriores por unidade.
4. O nome e as linhas são verificados pela largura física com as fontes e tamanhos
   efetivamente usados na prova do Modelo 2B; caracteres não suportados são recusados.
5. O Instituto recebe os textos autorizados e o símbolo já guardado, sem sobrescrever
   uma configuração empresarial existente.
6. A gravação é autenticada, restrita ao proprietário da plataforma enquanto não
   existir concessão empresarial explícita; trocar de empresa não concede permissão.
7. Concorrência usa versão e rejeita sobrescrita; envio de símbolo expira e é de uso único.
8. A tela informa que o documento permanece em teste e não altera a emissão real.
9. A prévia autenticada usa a identidade salva, em documento sintético identificado,
   sem código de verificação; a reconstrução visual do cabeçalho é aproximada.
10. Exibir prévia ampliável do cabeçalho e rodapé enquanto os campos são editados;
    a imagem escolhida deve aparecer antes de salvar e a visualização deve avisar
    que a prova salva é a confirmação final.
11. Centralizar a área visível do símbolo, sem cortar proporções ou ultrapassar
    o espaço reservado; a mesma normalização deve chegar à prova.
12. Identidades de demonstração das empresas clínicas ativas usam nome e endereço
    do cadastro existente; onde faltar dado, usar texto explicitamente fictício.
    Símbolos criados para teste são identificados como provisórios e substituíveis.
    Cadastro existente não é sobrescrito sem ordem; empresas inativas não são reativadas.
13. Nomes longos podem reduzir a fonte dentro de limites legíveis, sem truncamento
    e mantendo o texto inteiro na área útil. Validar na mesma fonte da prova.
14. A pedido do responsável, substituir os símbolos provisórios de iniciais por
    desenhos originais distintos por clínica, sem apresentação como marca oficial.
    Preservar o símbolo oficial do Instituto Pádua, textos e os objetos anteriores.
    Alterar somente as identidades provisórias identificadas e proteger alterações
    concorrentes por versão e símbolo anterior; não alterar a emissão clínica.

## Impacto e falhas previstas
| Falha | Gravidade | Prevenção e recuperação |
|---|---|---|
| Empresa errada altera identidade | Alta | Contexto autenticado, empresa explícita, permissão do proprietário; recusar. |
| Administrador de um local altera todos os locais | Alta | Não inferir concessão empresarial da permissão do local. |
| Texto invade rodapé ou cabeçalho | Alta | Medição no servidor com fonte final, sem truncamento; erro explícito. |
| Escrita simultânea perde alterações | Alta | Versão e comparação atômica; usuário recarrega após conflito. |
| Envio alterado após validação | Alta | Copiar bytes validados para objeto final; consumir envio uma vez. |
| Armazenamento falha | Alta | Preservar identidade anterior e informar erro. |
| Uso clínico presume modelo ou verificação prontos | Alta | Manter bloqueio em produção e aviso explícito de teste. |
| Migrar identidade errada | Alta | Sem migração genérica; copiar somente dados expressamente autorizados do Instituto. |
| Marca fictícia interpretada como oficial | Alta | Registrar símbolo provisório e exibir aviso; prévia sem validade clínica. |
| Prévia visual diverge da prova salva | Alta | Marcar prévia ao vivo como aproximada; conferir prova salva com a fonte real. |
| Espaços transparentes deslocam símbolo | Média | Recortar somente bordas transparentes antes de centralizar, sem tocar o original salvo. |
| Substituir marca oficial ou desenho alterado pelo usuário | Alta | Atualizar apenas símbolo provisório previamente conferido, com versão e objeto anterior em condição atômica. |

## Evidência e definição de pronto
Testar persistência, isolamento entre empresas, expiração, conflitos, imagens de
cores diferentes, caracteres e limite físico, além da tela no computador e celular.
Não declarar homologação sem revisão independente e prova de ponta a ponta.
Não alterar o motor de cálculo, prontuários, cobranças ou integrações externas.
