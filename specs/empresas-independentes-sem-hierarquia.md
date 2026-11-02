# PAXTER Loop — Empresas independentes sem hierarquia

**Estado:** EM ESPECIFICAÇÃO  
**Data:** 02/11/2026  
**Responsável:** Dr. Replit Paxter  
**Ambiente de dados autorizado:** banco de desenvolvimento do Replit  
**Execução:** uma implementação por vez; revisão independente sequencial.

## 1. Objetivo

Retirar a hierarquia empresarial ativa e seus efeitos, preservando o esquema e os registros de teste, sem tratar nomes, CNPJs ou vínculos simulados como empresas ou relações reais.

## 2. Decisão autorizada

O CEO autorizou remover toda a hierarquia empresarial. A execução deve:

1. Não apagar tabelas, colunas, empresas, contratos, históricos ou valores financeiros.
2. Limpar os vínculos de empresa-mãe e empresa-pai de todos os cadastros empresariais.
3. Encerrar, sem excluir, relações ativas da tabela de árvore de licenciamento.
4. Arquivar o registro de teste com nome PAXTER e retirá-lo das listas e seletores de clínicas; PAXTER é somente um nome reservado para uma possível empresa futura, não uma empresa ou clínica existente.
5. Preservar o acesso global do CEO ligado à pessoa autenticada; não atribuí-lo a uma empresa clínica nem criar uma empresa para representá-lo.
6. Bloquear novas gravações não nulas nos dois campos de hierarquia, inclusive nos nomes em padrão de banco de dados.
7. Desativar cálculos, indicadores, telas e mensagens que interpretem vínculos antigos como royalties, repasses ou receita.
8. Manter os valores contratuais e percentuais já registrados como dados históricos, sem convertê-los em cobrança, receita ou pagamento.
9. Não disparar cobrança, transferência, notificação externa, publicação ou sincronização com GitHub.
10. Alterar somente o banco de desenvolvimento, após cópia de segurança e conferência das referências.
11. Tratar os nomes, CNPJs, dados de propriedade e vínculos existentes como simulações de desenvolvimento; não inferir ou declarar relação societária real.
12. Manter Instituto Padua apenas como cadastro clínico simulado já existente; não criar ou alterar cadastros de titularidade da empresa futura.

O CEO informou que a futura empresa global é de sua propriedade e de sua esposa, e que Instituto Padua representa a clínica médica de teste. Essa informação não cria autorização para inserir a futura empresa, declarar CNPJ real ou criar vínculo empresarial entre os registros.

## 3. Escopo técnico

### 3.1 Servidor e persistência

- A rota de compatibilidade `/api/empresas/hierarquia` passa a responder uma coleção plana de empresas clínicas ativas.
- A consulta pública de empresas e os seletores semânticos não devem apresentar empresas arquivadas ou registros técnicos da plataforma.
- A criação e edição empresarial recusam `empresaMaeId`, `empresa_mae_id`, `parentEmpresaId` e `parent_empresa_id` não nulos com resposta explícita `422`; as colunas permanecem no esquema.
- A criação não permite marcar uma empresa clínica como proprietária global da plataforma; o papel global permanece no profissional autenticado.
- A exclusão de cadastro empresarial pela rota existente passa a arquivar em vez de apagar fisicamente.
- O módulo de royalties deixa de produzir resultados monetários derivados de hierarquia; a função legada deve falhar de forma explícita para chamadas futuras.
- Nenhuma migração remove campos, tabela, enumerações existentes ou dados de licenciamento.

### 3.2 Interface

- O Centro de Comando passa a identificar empresas independentes, sem pirâmide, seletor de empresa-mãe, soma de royalties ou projeção de receita derivada.
- Valores e modalidades existentes permanecem visíveis como informações contratuais registradas; devem ser rotulados como históricos/não aplicados quando exibidos.
- Empresas independentes permanecem editáveis nos campos que não representam hierarquia.
- A tela “Hierarquia” e seu item de menu permanecem por compatibilidade, com título “Empresas independentes” e lista plana.
- O cadastro técnico PAXTER não aparece como clínica ativa, opção de edição clínica, nem empresa com código semântico emitível.
- As clínicas ativas permanecem acessíveis no Centro de Comando e na governança.

## 4. Dados a preservar e transição no desenvolvimento

O registro simulado atualmente identificado como “PAXTER Serviços Ltda” deve ser arquivado sem exclusão física e sem ser apresentado como pessoa jurídica existente. A transição deve:

1. Marcar a empresa inativa e arquivada usando valores compatíveis com as restrições reais do esquema.
2. Remover somente sua classificação de proprietária global empresarial e sua permissão para sublicenciar.
3. Anular os vínculos empresa-mãe e empresa-pai em todos os registros empresariais.
4. Marcar relações ativas da árvore como encerradas, preenchendo data final e motivo de encerramento.
5. Preservar o nome e CNPJ fictícios, contratos, mensalidades, percentuais, valores, identificadores e dados de auditoria existentes como histórico de teste.
6. Não alterar o cadastro profissional do CEO nem seus vínculos clínicos.
7. Registrar backup anterior e posterior, contagens de linhas e resultado da transação.
8. Não criar cadastro para a futura empresa global nem registrar titularidade societária como dado real.

Antes de escrever, verificar as referências de todas as empresas, relações da árvore, unidades e profissionais. Se a transição ameaçar referência clínica, contrato ou outro dado não mencionado, parar e atualizar esta especificação.

### 4.1 Estado verificado em 02/11/2026

- A consulta foi executada somente no banco de desenvolvimento do Replit.
- O banco contém doze registros empresariais e uma relação ativa na árvore legada.
- Quatro registros têm `empresa_mae_id` preenchido; dezessete unidades clínicas e dezesseis profissionais pertencem ao cadastro simulado Instituto Padua.
- O profissional com autoridade global continua identificado no próprio cadastro de profissional e vinculado ao Instituto Padua; esse vínculo, as dezessete unidades e os dezesseis profissionais não serão alterados.
- O registro chamado PAXTER está marcado indevidamente como empresa clínica e proprietário global empresarial, mas não tem unidades nem profissionais associados.
- Foi criada uma cópia de segurança seletiva dos campos que serão alterados e da relação legada, fora do controle de versão. Nenhuma credencial ou senha foi incluída.

## 5. Falhas previstas e barreiras

| Falha | Gravidade | Barreira | Evidência |
|---|---|---|---|
| Um campo alternativo ainda grava empresa-mãe | Crítica | Recusar os quatro nomes de campo no servidor e testar cada alias. | Requisições HTTP com erro explícito |
| Um cálculo legado gera cobrança por relação antiga | Crítica | Desativar função de cálculo e retirar consumidores de royalties. | Testes sem valor calculado ou efeitos externos |
| Registro PAXTER continua no seletor de empresas | Alta | Filtrar ativos e registros técnicos nas rotas de lista e códigos semânticos. | Resposta de rota sem o registro |
| Empresa é apagada por rota antiga | Alta | Trocar `DELETE` por arquivamento e testar persistência de identificador. | Linha ainda existente, inativa e arquivada |
| Tela interpreta valores legados como receita vigente | Alta | Mostrar informação contratual sem totalização ou repasse. | Captura da tela e teste do estado vazio |
| Limpeza parcial de relações | Alta | Transação única e validação de contagens antes/depois. | Consultas de verificação |
| Papel global do CEO é removido junto com a empresa técnica | Crítica | Não alterar `professionals.is_platform_owner`; testar valor antes/depois. | Consulta de banco e teste de autorização |
| Registro simulado é confundido com empresa legal real | Alta | Identificar PAXTER como nome reservado e arquivar o registro técnico sem exibi-lo como clínica. | Rotas de listagem e interface |
| Restrições de banco rejeitam o estado de arquivo | Alta | Inspecionar enumerações e restrições antes da transação; usar estado compatível. | Consulta de esquema e execução transacional |
| Consumidor adicional mantém dependência hierárquica | Alta | Buscar usos no repositório antes da revisão e incluir no diff. | Inventário de referências e revisão independente |

## 6. Definição de pronto

1. Nenhuma relação empresarial ativa permanece em `empresa_mae_id`, `parent_empresa_id` ou na árvore de licenciamento.
2. Novas tentativas de gravar hierarquia pelos quatro nomes de campo são recusadas no servidor.
3. A rota antiga de hierarquia retorna uma lista plana, mantendo contrato compatível.
4. O registro simulado com nome PAXTER permanece no banco, inativo/arquivado, fora das listas clínicas e fora da emissão de códigos; nenhuma interface o descreve como empresa existente.
5. O papel global do CEO continua no profissional e sua permissão de acesso continua válida.
6. Nenhuma tela ou resumo apresenta royalty, repasse ou total financeiro calculado a partir de hierarquia.
7. Os valores e contratos existentes continuam preservados e não geram operação externa.
8. A rota de exclusão não apaga registros.
9. Testes automatizados cobrem caminhos permitidos, tentativas proibidas e preservação dos dados.
10. Revisão independente aprova o diff e os testes.
11. A interface é executada e capturada; a tela autenticada só será declarada conferida se realmente houver acesso.
13. Não há erro inesperado nos registros do servidor.

## 7. Linhas vermelhas

- Não tocar em produção.
- Não executar `DROP`, `TRUNCATE` ou exclusão física de registros empresariais ou de licenciamento.
- Não modificar cobranças, contratos, valores, permissões clínicas, prontuários ou documentos.
- Não disparar mensagens ou chamadas para serviços externos.
- Não sincronizar com GitHub nem publicar sem autorização específica.
- Não declarar como reais os CNPJs, os contratos, a propriedade empresarial ou os vínculos de desenvolvimento.
- Não declarar homologado sem revisão independente sequencial e evidências de execução, banco, tela e registros do servidor.

## 8. Sequência do loop

```text
Mapear consumidores e dados
        ↓
Fechar esta especificação e backup
        ↓
Construir servidor e interface
        ↓
Parar para revisão independente
        ↓
Corrigir achados, se houver
        ↓
Testar código e fluxo completo
        ↓
Migrar somente o banco de desenvolvimento
        ↓
Conferir tela, banco e registros
        ↓
Solicitar homologação do CEO
```

