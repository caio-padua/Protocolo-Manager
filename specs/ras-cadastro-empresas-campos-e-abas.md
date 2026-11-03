# PAXTER Loop — Campos e abas do cadastro de empresas

**Estado:** IMPLEMENTADO EM DESENVOLVIMENTO; validação visual autenticada pendente  
**Ambiente de dados:** somente desenvolvimento do Replit  
**Execução:** sequência única; auditoria manual após a construção. A revisão independente automatizada não estava disponível nesta sessão.

## 1. Objetivo

Completar e reorganizar o formulário existente **Cadastro de Empresas** para representar corretamente os campos da planilha aprovada, sem mover a tela, misturar o cadastro empresarial com agendas ou alterar os dados institucionais usados nos documentos.

## 2. Escopo aprovado

1. Manter o cadastro no menu e na rota atuais.
2. Organizar os campos em abas superiores, com títulos curtos e grupos visuais coerentes.
3. Manter os quatro regimes tributários em seletor: Simples Nacional, Microempreendedor Individual (MEI), Lucro Presumido e Lucro Real.
4. Manter a validação do Cadastro Nacional de Atividades Econômicas (CNAE) com sete algarismos e máscara `00.00-0/00`.
5. Criar campos próprios e persistidos para nome fantasia e número do endereço; não reutilizar o apelido interno nem misturar número ao logradouro.
6. Mostrar os dados de origem “Número da empresa”, “Empresa mãe”, “Ação sugerida”, “Código semântico” e “CEP informado” em uma aba de referências, sem transformá-los em hierarquia, permissão, cobrança ou código oficial.
7. Preservar o código oficial no fluxo existente por unidade clínica; os códigos antigos da planilha são apenas referências, pois não obedecem ao formato aprovado `BASE.VINC.CNPJ4.SEQ4`.
8. Preservar o cadastro empresarial, o perfil institucional usado em documentos, as unidades de agenda, o histórico e todos os dados não abrangidos pela atualização.
9. Fazer a conferência e qualquer gravação somente no banco de desenvolvimento; não publicar, sincronizar com GitHub, enviar mensagens nem tocar em produção.

## 3. Abas do formulário

| Aba | Campos e finalidade |
|---|---|
| Dados | Nome no sistema, nome fantasia, razão social, apelido interno, CNPJ, tipo, categoria, situação e contatos principais. |
| Fiscal | Regime tributário, CNAE e descrição, natureza jurídica, inscrições, data de abertura, capital social e responsável legal/contador. |
| Endereço | Logradouro, número, complemento, CEP, bairro, cidade, estado e endereço fiscal. |
| Referências | Número original da empresa, empresa-mãe indicada, ação sugerida, código semântico sugerido e CEP de origem, todos informativos e sem efeito operacional. |
| Documentos | Dados de nota fiscal e certificado digital já existentes. |
| Integrações | Configurações já existentes de assinatura, mensagens, e-mail e Google. |
| Contratos | Documentos contratuais já existentes, sem alterar valores ou cobranças. |

As abas ficam no cabeçalho fixo do formulário. O rodapé de salvar e cancelar permanece fixo e alinhado à direita, como já funciona no cadastro.

## 4. Mapeamento e segurança dos dados

1. `nome` continua representando o nome no sistema; `nomeFantasia` passa a ser campo próprio.
2. `endereco` passa a guardar somente logradouro; `numero` será campo próprio; `complemento` continua separado.
3. `referenciaPlanilha.numeroEmpresa`, `empresaMae`, `acaoSugerida`, `codigoSemantico` e `cepInformado` são dados de origem, não relações ou permissões.
4. O campo legado `empresaMaeId` permanece sem gravação por este formulário e continua nulo.
5. A razão social, CNPJ, e-mail, telefone e CNAE não são alterados por regras genéricas de capitalização.
6. Valores vazios na planilha não apagam valores existentes.
7. CEP inválido não substitui um CEP já cadastrado.
8. Linhas marcadas `APAGAR` não causam exclusão. O registro técnico PAXTER continua arquivado; o cadastro `x` já autorizado e removido não será recriado.
9. A divergência de bairro/cidade de Instituto Padilha será mapeada pelos cabeçalhos corretos da planilha, sem alterar a unidade ou os vínculos clínicos.
10. O registro Genesis permanece com o tipo protegido “Template-Mestre”, mas fica visível no cadastro empresarial por constar como empresa ativa na planilha.
11. O CEP incompleto de Paduzzi Guarulhos permanece guardado como valor de origem e não substitui o CEP válido já cadastrado.

## 5. Falhas previstas e barreiras

| Falha | Barreira |
|---|---|
| Fantasia sobrescreve nome no sistema ou apelido interno | Colunas e controles próprios, com testes de persistência. |
| Número continua embutido no logradouro | Campo separado e rótulo “Logradouro”; teste de leitura após salvar. |
| Referência de empresa-mãe cria hierarquia ativa | Campos de referência sem vínculo para `empresaMaeId`; teste de que o campo legado permanece nulo. |
| Código antigo da planilha é emitido como código oficial | Rótulo “referência da planilha”; não alimentar o gerente de códigos por unidade. |
| CEP malformado substitui dado válido | Validação de oito algarismos e preservação do valor já registrado. |
| Aba deixa campos inacessíveis em celular | Abas roláveis e captura em largura móvel. |
| Alteração afeta o perfil institucional de documentos | Não alterar as rotas ou configurações `/settings/company` e `/settings/clinics`. |
| Registro marcado para apagar é removido | Nenhuma exclusão será executada neste ciclo. |

## 6. Definição de pronto

1. A tela atual continua no mesmo lugar.
2. O formulário apresenta abas superiores nomeadas e agrupadas.
3. Cada coluna da planilha tem campo próprio ou referência visível e corretamente identificada.
4. Nome fantasia e número do endereço persistem em colunas próprias.
5. O regime tributário continua sendo um seletor das quatro opções aprovadas.
6. O CNAE aceita somente sete algarismos e é apresentado no formato aprovado.
7. Referências da planilha não alteram hierarquia, licenciamento ou código semântico oficial.
8. Os dez cadastros ativos da planilha são conciliados por CNPJ e número empresarial, sem excluir ou recriar cadastros.
9. Testes cobrem criar/editar/ler, CNAE e regime inválidos, campos de referência não operacionais e preservação de campos legados.
10. A revisão independente acontece após a construção e antes da homologação.
11. Há evidência de testes, banco de desenvolvimento e tela; a tela autenticada só é declarada visualmente conferida se a captura conseguir acessá-la.
12. Nenhum efeito externo é disparado.

## 7. Sequência do PAXTER Loop

```text
DESENHAR e fechar o mapeamento
        ↓
PREVER falhas e confirmar preservação
        ↓
CONSTRUIR campos, abas e persistência
        ↓
REVISAR de forma independente
        ↓
TESTAR API, banco de desenvolvimento e interface
        ↓
HOMOLOGAR com evidências
        ↓
APRENDER e registrar decisões duráveis
```

## 8. Evidências e limites da homologação

1. Os testes direcionados do cadastro empresarial passaram: 31 de 31.
2. As compilações do servidor e da interface passaram.
3. A verificação do banco de desenvolvimento encontrou dez registros da planilha com nome fantasia, número, CNAE e regime preenchidos; nenhum tem vínculo hierárquico ativo.
4. O código da interface não apresentou erro próprio no verificador de tipos; o verificador global continua falhando em outros arquivos do projeto, e o servidor aponta um erro de tipos preexistente em outra linha da rota de empresas.
5. A captura visual terminou na tela de login, sem sessão autenticada; por isso não certifica visualmente o formulário aberto.
6. A revisão independente automatizada não pôde ser executada; foi feita uma segunda auditoria manual do diff, das rotas, do esquema, da migração e dos testes.
7. Nenhuma alteração foi publicada, enviada ao GitHub ou gravada no banco de produção.
