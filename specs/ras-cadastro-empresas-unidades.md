# PAXTER Loop — Cadastro de empresas, unidades e agendas

**Estado:** UNIDADE 1 PARCIAL; UNIDADE 2 COM IMPORTAÇÃO PARCIAL — SEM HOMOLOGAÇÃO
**Data:** 02/11/2026  
**Responsável:** Dr. Replit Paxter  
**Unidade ativa:** 1 — código semântico da unidade clínica  
**Execução:** sequencial; a unidade seguinte só começa após aceite do CEO.

## 1. Objetivo

Organizar os cadastros empresariais e das unidades clínicas, gerar códigos rastreáveis por unidade, associar profissionais a várias agendas e preservar os dados existentes.

## 2. Decisões confirmadas pelo CEO

1. O código semântico terá quatro blocos: `BASE.VINC.CNPJ4.SEQ4`.
2. O código será **um por unidade clínica**, não um por empresa.
3. `BASE` será formado automaticamente por quatro letras do nome principal da empresa, em maiúsculas e sem acentos; prefixos genéricos podem ser ignorados.
4. `VINC` será escolhido exclusivamente pelo CEO e representará uma classificação interna. Não altera a relação jurídica nem a hierarquia de licenciamento.
5. `CNPJ4` conterá os quatro primeiros números do Cadastro Nacional da Pessoa Jurídica (CNPJ) da empresa proprietária da unidade.
6. `SEQ4` será o número sequencial e estável da unidade no sistema, com quatro posições, começando por `0001`. Não será o identificador técnico do banco nem o número da linha da planilha.
7. “Única” significa que existe uma única empresa para aquele CNPJ completo. Não será inferido apenas pela raiz do CNPJ.
8. Os registros existentes são preservados por padrão. A marca `APAGAR` da planilha, sozinha, não autoriza exclusão; cada exclusão exige pedido explícito e confirmação final do CEO após a análise de dependências. Em 02/11/2026, essa confirmação foi dada exclusivamente para o cadastro `x`, ID 9, no banco de desenvolvimento.
9. O CEO autorizou padronizar cadastros novos e existentes com iniciais maiúsculas e sem acentos. A alteração em massa será registrada e limitada aos campos estruturados de cadastro.
10. Nomes, endereços, campos fiscais e de contato da planilha atualizada devem ser considerados na consolidação.
11. Cada código será atribuído a uma unidade física e guardará os blocos como fotografia do momento da emissão; mudanças futuras na empresa não reescrevem códigos antigos.
12. PAXTER não é uma empresa médica existente; é um nome reservado para uma possível empresa futura. Os campos de empresa-mãe e hierarquia permanecem no esquema, mas não compõem o código semântico.

## 3. Modelo do código semântico

Formato:

```text
BASE.VINC.CNPJ4.SEQ4
PADU.PROU.6386.0001
```

| Bloco | Regra | Exemplo |
|---|---|---|
| `BASE` | Quatro letras do nome principal da empresa, sem acentos; ignorar prefixos genéricos como “Instituto” e “Clínica” quando houver outro nome identificador. | `PADU` |
| `VINC` | Código de quatro letras escolhido pelo CEO, com significado mostrado por extenso na tela. | `PROU` |
| `CNPJ4` | Quatro primeiros algarismos do CNPJ da empresa à qual a unidade pertence. | `6386` |
| `SEQ4` | Sequência estável da unidade clínica, preenchida com zeros à esquerda. | `0001` |

### 3.1 Opções iniciais de vínculo

| Código | Significado mostrado ao usuário |
|---|---|
| `PROU` | Própria do grupo |
| `FILU` | Unidade vinculada ao grupo |
| `LICD` | Licenciada diretamente |
| `LICI` | Licenciada por uma clínica |
| `INDE` | Empresa independente |
| `PARC` | Empresa parceira |

Essas opções são classificações internas selecionadas pelo CEO; não declaram filial jurídica. O código não concede acesso, licença, permissão, cobrança ou vínculo clínico.

### 3.2 Geração e integridade

1. A tela mostra a base congelada, a classificação e o código emitido.
2. A empresa deve ter CNPJ válido para gerar o código. CNPJ ausente, inválido ou duplicado bloqueia a geração e informa o motivo.
3. O vínculo `VINC` é escolhido pelo CEO no cadastro da empresa e aplicado às unidades dela.
4. A sequência da unidade é atribuída automaticamente por uma sequência nativa do banco de dados; códigos completos só são emitidos pelo CEO depois da validação.
5. Criações simultâneas não podem receber a mesma sequência. O banco deve garantir unicidade do código completo.
6. A base, o vínculo e o CNPJ ficam protegidos contra alteração depois que a primeira unidade da empresa recebe código. O código emitido é imutável e não pode ser reutilizado.
7. Colaboradores autenticados podem visualizar os códigos da própria empresa; somente o CEO consulta empresas/unidades de toda a plataforma e altera classificações ou emite códigos.
8. A emissão bloqueia quando a sequência ultrapassa 9.999; nunca reduz nem recicla a sequência.
9. A empresa vinculada a uma unidade vem do contexto autenticado no servidor. Somente o CEO pode selecionar uma empresa diferente; o identificador enviado pelo navegador não concede acesso.
10. A classificação semântica e a emissão do código exigem autenticação do colaborador e validação de CEO no servidor. A proteção não pode existir apenas no botão da tela.

## 4. Escopo funcional completo

### Unidade 1 — Código semântico por unidade

- Adicionar campos de código e sequência às estruturas corretas de empresa e unidade.
- Expor a edição de `VINC` somente a usuário CEO, com validação no servidor.
- Atribuir números sequenciais por mecanismo independente do identificador técnico da unidade.
- Exibir código e significado em leitura para os demais usuários autorizados.
- Gerar automaticamente a sequência para novas unidades.
- Não preencher códigos semânticos antigos por tentativa de correspondência; a emissão final exige ação do CEO.

### Unidade 2 — Cadastro empresarial e fiscal

- Consolidar os campos da planilha atualizada no cadastro canônico.
- Disponibilizar os regimes tributários: Simples Nacional, Microempreendedor Individual (MEI), Lucro Presumido e Lucro Real.
- Preservar valores legados sem conversão automática.
- Aplicar máscara e validação do Cadastro Nacional de Atividades Econômicas (CNAE) com sete algarismos e formato canônico `NN.NN-N-NN`.
- Manter campos separados para endereço, número, complemento, bairro, cidade e unidade federativa.

**Estado verificado em 02/11/2026:** o esquema já possui campos para CNAE e regime tributário, e a tela “Cadastro de Empresas” já tem seletor com os quatro regimes pedidos, além de uma opção extra “Isento”. A tela ainda inicia novas empresas com “Simples Nacional” pré-selecionado. O campo CNAE é texto livre, sem máscara ou validação dos sete algarismos. Na base de desenvolvimento, 0 das 12 empresas têm código CNAE e 0 das 12 têm regime tributário; 4 têm apenas descrição de CNAE. A planilha atualizada ainda não foi reconciliada nem importada. Esta unidade permanece pendente de ajuste e homologação.

### Unidade 3 — Um local de cadastro

- Fazer de “Cadastro de Empresas” o ponto de entrada canônico.
- Permitir administrar unidades físicas dentro do cadastro da empresa.
- Manter o item “Clínicas & Locais” no menu; a rota antiga exibirá uma faixa discreta vermelha “DESABILITADA”.
- Preservar registros e identificadores da rota antiga.
- Não desabilitar telas de configuração operacional sem confirmar que fazem o mesmo cadastro.

**Estado verificado em 02/11/2026:** “Cadastro de Empresas” e “Clínicas & Locais” continuam como rotas e itens separados no menu. A recomendação é tornar “Cadastro de Empresas” a entrada principal e administrar locais vinculados dentro dela, sem apagar dados. A consolidação da interface ainda não foi feita.

### Unidade 4 — Profissional e várias agendas por unidade

- Permitir mais de uma agenda ativa para o mesmo profissional na mesma unidade.
- Preservar os vínculos atuais e a coluna antiga até todos os consumidores usarem a nova associação.
- Resolver a agenda por regra explícita de serviço/recurso e agenda padrão.
- Se houver mais de uma agenda aplicável sem regra única, bloquear o agendamento com erro claro; nunca escolher a primeira silenciosamente.
- Validar que cada agenda pertence à unidade selecionada ou está autorizada como agenda global.

### Unidade 5 — Padronização de cadastros existentes

- Aplicar iniciais maiúsculas e remover acentos apenas em campos estruturados de identificação e endereço.
- Preservar valores anteriores em registro de auditoria protegido.
- Não alterar documentos assinados, histórico clínico, texto livre, identificadores, números fiscais, e-mails, telefones ou CNAE.
- Preservar a razão social oficial até haver confirmação de que o valor normalizado continua idêntico ao cadastro fiscal oficial.
- Rodar prévia com contagens de alterações e conflitos antes da atualização.

### Unidade 6 — Reconciliação controlada, sem exclusões automáticas

- Relacionar linhas por nome do sistema e CNPJ; nunca usar o número da linha como identificador do banco.
- Mostrar divergências e itens sem correspondência para decisão explícita.
- Preservar por padrão registros marcados `APAGAR`; a planilha serve como fonte de correção, não como autorização de exclusão.
- Excluir somente após pedido explícito, confirmação final do CEO, cópia de segurança e verificação das dependências; a autorização de um registro não se estende aos demais.
- Não renomear nem reaproveitar registros sem correspondência exata; manter a linha pendente para decisão do CEO.
- Não representar o proprietário da plataforma como empresa médica fictícia. Manter os campos técnicos existentes enquanto a identidade da plataforma e os cadastros clínicos são separados.

## 5. Limites e preservação

1. Não alterar cobranças, valores de licenciamento, permissões clínicas nem conteúdo de documentos.
2. Não apagar tabelas, dados de clientes ou históricos.
3. Não usar `empresaMaeId` ou a árvore de licenciamento para guardar vínculo semântico interno.
4. Não usar identificador interno do banco, identificador da linha da planilha ou posição em lista como código público.
5. Não publicar nem sincronizar com GitHub sem autorização expressa e confirmação da revisão remota.
6. Testes de exclusão, concorrência e segurança usarão dados sintéticos no banco de desenvolvimento, nunca mensagens reais.

## 6. Falhas previstas e barreiras

| Falha | Gravidade | Barreira e recuperação | Prova obrigatória |
|---|---|---|---|
| CNPJ vazio, inválido ou repetido | Alta | Bloquear código; mostrar conflito sem escolher registro automaticamente. | Testes de validação e duplicidade |
| Usuário licenciado altera `VINC` pela tela ou chamada direta | Crítica | Guard de CEO no servidor; negar por padrão. | Requisição autorizada e negada |
| Requisição manipula o identificador de empresa | Crítica | Derivar a empresa do contexto autenticado; aceitar seleção cruzada só com guard de CEO. | Testes de vínculo válido e adulterado |
| Duas unidades recebem a mesma sequência | Alta | Sequenciador transacional e restrição única no banco. | Teste concorrente |
| Código muda e o antigo é reutilizado | Alta | Histórico imutável e código reservado. | Teste de alteração/repetição |
| Agenda ambígua para um atendimento | Alta | Exigir regra única ou bloquear antes de gravar/enviar. | Teste de agenda única e ambígua |
| Planilha associa empresa errada | Crítica | Reconciliar por CNPJ; conflitos ficam pendentes. | Relatório de correspondência |
| Exclusão interrompe plataforma ou prontuários | Crítica | Prévia de dependências; bloquear enquanto houver referências. | Teste sintético de exclusão |
| Remoção de acentos altera razão social oficial | Alta | Não normalizar razão social sem confirmação documental. | Comparação com fonte fiscal |
| Erro de interface existente na lista de clínicas | Média | Corrigir como dependência apenas quando a unidade que usa essa tela for construída. | Abertura da tela e captura |

## 7. Sequência de construção

```text
Unidade 1 — Código por clínica
        ↓ revisão independente e testes
Aceite do CEO
        ↓
Unidade 2 — Cadastro empresarial e fiscal
        ↓ revisão independente e testes
Aceite do CEO
        ↓
Unidade 3 — Cadastro canônico e rota desabilitada
        ↓ revisão independente e testes
Aceite do CEO
        ↓
Unidade 4 — Várias agendas por profissional e clínica
        ↓ revisão independente e testes
Aceite do CEO
        ↓
Unidade 5 — Normalização dos registros existentes
        ↓ prévia, backup e aprovação da lista de alterações
Unidade 6 — Reconciliação sem exclusões
```

Uma unidade por vez. Uma descoberta impeditiva atualiza esta especificação antes de continuar.

## 8. Critérios de homologação

1. A especificação e os campos persistidos concordam em todos os quatro blocos.
2. O servidor impede que usuários não CEO alterem `VINC`, sequência ou código.
3. CNPJ inválido, ausência de CNPJ, código duplicado e sequência esgotada são recusados com motivo claro.
4. Unidades diferentes recebem códigos diferentes, mesmo quando pertencem à mesma empresa.
5. O código continua igual após recarregar e abrir em outra sessão autorizada.
6. A tela mantém o padrão visual Paxter e funciona em computador e celular.
7. Os testes demonstram caminho permitido e tentativas proibidas.
8. Revisão independente sequencial aprova o diff e os testes da unidade.
9. Para declarar homologada, registrar evidências de requisição, banco, captura de tela e log.
10. Nenhuma alteração destrutiva ou sincronização externa acontece sem verificação e autorização específicas.

## 9. Estado da unidade ativa

**Unidade 1 — implementação parcial; revisão independente, teste concorrente e homologação ainda pendentes. A Unidade 2 recebeu autorização direta para iniciar a reconciliação de dados, mas também permanece parcial.**

- Migração aditiva aplicada somente ao banco de desenvolvimento.
- As 17 unidades existentes receberam uma sequência estável e única; nenhuma empresa, classificação ou código semântico foi alterado ou emitido.
- A associação empresa-unidade para novas unidades vem da sessão autenticada no servidor; o identificador enviado pelo navegador é ignorado.
- Classificação e emissão têm validação de CEO no servidor; consultas têm autenticação e isolamento por empresa para colaboradores.
- CNPJ duplicado, inválido, ausência de vínculo ou sequência fora do limite bloqueiam a emissão.
- Após emissão, a classificação e o CNPJ da empresa ficam protegidos contra mudanças que invalidariam o código.
- Em 02/11/2026, o CEO confirmou que os CNPJs da base de desenvolvimento são fictícios e indicou preservar a identidade “Instituto Padua = Paduccia Clínica Médica = Clínica Padua”. A regra continua sendo preservar; qualquer exclusão precisa de autorização individual e confirmação final.
- A planilha foi lida diretamente do Google Drive. Foram atualizados, na base de desenvolvimento, os campos empresariais e fiscais correspondentes aos IDs 2, 3, 4, 5, 7, 8, 10, 11 e 12, com correspondência por nome e CNPJ anterior. Nenhum registro foi apagado.
- O CNPJ do ID 4 foi substituído pelo valor da planilha. O ID 9, `x`, foi excluído do banco de desenvolvimento após pedido explícito e confirmação final; a cópia de segurança anterior à exclusão foi preservada em `generated-artifacts/`.
- O ID 6 ainda contém o registro legado “PAXTER SERVICOS LTDA”, mas o CEO esclareceu que não existe como empresa médica atual. O registro está marcado como ativo e proprietário da plataforma; os IDs 5, 7 e 8 ainda apontam para ele em `empresa_mae_id`. Essa estrutura conflita com a direção atual e requer reconciliação; nenhum desses vínculos foi alterado nesta etapa. Os campos do esquema devem ser preservados.
- O nome fantasia “Clinica Padua” foi gravado na localização existente de Instituto Padua, ID 8, cuja empresa proprietária é o ID 5.
- A linha “Instituto Padilha” não teve correspondência segura com “INSTITUTO INTEGRATIVO”, ID 1; nenhum registro existente foi renomeado. Após pedido do CEO, foi criado no banco de desenvolvimento o cadastro empresarial ID 13 e uma unidade vinculada, ID 21, usando os dados da linha da planilha. O cadastro contém CNAE `86.30-5-03`, regime `lucro_real`, CNPJ `33.143.134/0001-10` e os dados de endereço e contato fornecidos. O CNPJ passou na validação de dígitos verificadores.
- A unidade de Instituto Padilha permanece sem código semântico. O código indicado na planilha não segue o formato aprovado. A relação com Instituto Padua também não foi aplicada: a instrução estrutural vigente identifica Paduzzi como a relação específica; a linha da planilha, isoladamente, não autoriza alterar essa hierarquia.
- O CEP informado para Paduzzi Guarulhos na planilha (`05577-88`) tem sete algarismos. O sistema preservou o CEP já existente, sem completar o número por suposição.
- Os regimes tributários e CNAEs foram preenchidos para nove empresas. A planilha contém códigos semânticos que não seguem o formato confirmado `BASE.VINC.CNPJ4.SEQ4`; esses códigos não foram importados.
- A coluna “EMPRESA MAE” não foi aplicada à hierarquia existente: os valores da planilha conflitam com a estrutura relatada pelo CEO e podem alterar relações de licenciamento. Cobranças e vínculos de licenciamento não foram alterados.
- A tela “Cadastro de Empresas” não possui campo próprio para todos os dados da planilha, especialmente nome fantasia e número do endereço. A recomendação visual está registrada, mas a consolidação dos campos e das telas ainda precisa ser construída.
- A ferramenta de revisão independente solicitada não estava disponível nesta execução. Foi feita revisão manual; por isso, o critério de revisão independente continua pendente.
- Os 12 testes específicos da importação anterior passaram; eles não foram repetidos após a exclusão do ID 9 e a criação do ID 13/unidade 21. A criação foi conferida diretamente no banco, incluindo o vínculo entre a empresa e a unidade.
- Ainda falta um teste concorrente integrado no banco para demonstrar duas emissões simultâneas; a proteção está implementada com transação e restrição única, mas essa evidência não foi produzida.
- A verificação geral de TypeScript continua falhando em 173 diagnósticos já existentes; o único apontamento em arquivo alterado está em um trecho antigo e não relacionado da rota empresarial.
- A imagem automática da página encontrou o acesso, mas não entrou na sessão; a tela autenticada não foi validada visualmente.
- Uma inicialização registrou limite temporário de leituras no serviço de planilhas; na última inicialização, o dicionário estava atualizado e o servidor ficou ativo.
- A unidade não está homologada. Permanecem pendentes a consolidação visual dos campos e das telas, a revisão independente e os testes próprios da nova inclusão. Nenhuma outra exclusão foi autorizada; o ID 6 continua preservado por ter três empresas vinculadas a ele.
