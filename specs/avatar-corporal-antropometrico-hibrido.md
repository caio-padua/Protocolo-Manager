# Avatar corporal antropométrico híbrido

**Estado:** especificação e plano para revisão; implementação não iniciada.
**Data:** 22/11/2026.
**Origem:** escolhas e requisitos do documento e das duas imagens anexadas pelo Dr. Caio.
**Vocabulário:** cliente é a pessoa atendida; clínica é a empresa autorizada.

## 1. Objetivo e limites

Oferecer uma representação corporal opcional, personalizável e respeitosa, associada ao cliente existente, com modelo tridimensional interativo e quatro imagens bidimensionais sincronizadas, permitindo acompanhar avaliações no tempo.

O avatar é **ilustração aproximada**, não uma reconstrução do corpo, diagnóstico, instrumento de medição nem prova de resultado terapêutico. Peso e altura não identificam distribuição de gordura, massa muscular ou formato. Os três biotipos são controles visuais, não categorias diagnósticas. Nenhuma medida inferida pode aparecer como medição real; inexistência de dado não vira zero. Fotografias, escaneamento corporal, treinamento de inteligência artificial e compartilhamento externo não fazem parte desta entrega.

As imagens fornecidas são referências visuais planas, não são malhas tridimensionais nem autorizam copiar modelos de terceiros. Não constituem prova de capacidade anatômica ou de licença de uso.

## 2. Auditoria da base atual

| Item | Observado na fonte | Limite da verificação |
|---|---|---|
| Cadastro | `lib/db/src/schema/clients.ts` possui identificador do cliente, empresa e exclusão lógica. | Não foi auditada toda a governança multiclínica. |
| Antropometria | `lib/avaliacoes-corporais/src/index.ts` define peso, altura, tórax, cintura, abdômen, quadril e braços, coxas e panturrilhas separadamente por lado; limites definidos no catálogo. | Ombros, tronco e comprimento de membros não estão nesse catálogo. Cintura e abdômen são campos distintos. |
| Índice de massa corporal | O catálogo calcula peso dividido pelo quadrado da altura em metros, na leitura, com uma casa na exibição; não grava derivados. | O exemplo do anexo usa duas casas: 80 kg e 170 cm resultam em aproximadamente 27,68 kg/m². A precisão exibida no novo módulo deve ser explicitada, sem modificar o catálogo por efeito indireto. |
| Avaliações e histórico | `lib/db/src/schema/client-avaliacoes.ts` guarda cliente, empresa, data, valores e `deleted_at`; `artifacts/api-server/src/routes/avaliacoes-corporais.ts` cria linhas e marca remoção lógica. | Isso não comprova imutabilidade geral do banco, preservação de imagens ou histórico do avatar. |
| Acesso profissional | As rotas de avaliações verificam sessão profissional, cliente e empresa; escrita usa permissão específica. | Verificação estática, sem teste de invasão nem certificação global entre clínicas. |
| Acesso do cliente | `portal-token.ts` distingue verificação de acesso do cliente e prévia administrativa: a verificação genérica aceita prévia; a específica do cliente rejeita prévia. | As rotas de avaliações consultadas são profissionais; não foi identificada aqui uma rota do cliente para essas avaliações. Acesso e gravação do avatar exigem contrato próprio e testes. |
| Arquivos privados | `fotos-corpo.ts` usa armazenamento privado, vincula fotos a cliente e empresa e possui controles para as quatro orientações. | É referência de integração, não prova de que qualquer caminho de arquivo possa ser reutilizado sem novas verificações de acesso e consentimento. |
| Interface | Formulário e gráficos de avaliações já existem no cockpit. React 19.1.4 está declarado no aplicativo. | A pesquisa concentrou-se nesses caminhos, não em cada tela do sistema. |
| Motor gráfico | `artifacts/padcom/package.json` não declara diretamente Three.js nem React Three Fiber. | Isso não prova ausência de dependências transitivas nem funcionamento em algum outro artefato. |

Não foram consultados prontuários, banco real ou produção; não foram executados testes de autenticação. Diagnóstico de código não equivale a segurança comprovada.

## 3. Referências externas e escolha condicionada

Pesquisadas em 22/11/2026; confirmar termos atuais antes de qualquer contratação:

| Candidato | Informação consultada | Implicação e pendência |
|---|---|---|
| [MakeHuman / MPFB](https://static.makehumancommunity.org/about/license.html) | O projeto descreve os recursos centrais sob Creative Commons Zero (CC0); código do MakeHuman sob licença pública geral Affero e código do MPFB sob licença pública geral. | Candidato inicial para estudo de viabilidade; não confirma licença de cabelo, roupa ou recurso de terceiros, nem capacidade de reproduzir todos os controles. Avaliar cada recurso e o caminho de exportação separadamente. |
| [MB-Lab](https://mb-lab-docs.readthedocs.io/en/latest/license.html) | A documentação afirma que dados e modelos gerados seguem licença pública geral Affero versão 3, enquanto imagens bidimensionais têm tratamento distinto. | Alto risco de incompatibilidade com distribuição pretendida; não escolher sem revisão jurídica específica. |
| [Daz 3D](https://www.daz3d.com/interactive-license-info) | O fornecedor informa que uso de conteúdo tridimensional em aplicações exige licença interativa e que alguns itens não a oferecem. | Conferir licença e preço de cada corpo, roupa, cabelo e deformação, inclusive distribuição no navegador e uso em serviço. Valores totais não foram cotados. |
| [SMPL-X, modelo corporal estatístico](https://smpl-x.is.tue.mpg.de/modellicense.html) | A licença apresentada é para pesquisa não comercial; a página aponta possibilidade de licenciamento comercial separado. | Não usar em produto comercial com a licença acadêmica; preço e escopo de uso comercial dependem de proposta. |
| [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) | A documentação relaciona a versão principal 9 do adaptador à versão principal 19 do React. | Compatibilidade declarada não comprova integração, desempenho ou licença do modelo; testar versões concretas antes de adotar. |

**Recomendação:** investigar primeiro recursos centrais MakeHuman e suas peças compatíveis, sem fechar a escolha. Aprovação exige demonstrar deformações, materiais, cobertura de roupa, diversidade e direitos para cada arquivo. Nenhum modelo foi baixado, adquirido ou testado; preço de trabalho artístico, licenças adicionais e custo operacional são **desconhecidos**, não zero.

## 4. Requisitos de experiência

1. O uso é opcional. Na primeira entrada explicar que a representação é aproximada; permitir não criar, ocultar e voltar às medidas sem bloquear atendimento.
2. Escolher apresentação corporal feminina ou masculina sem inferir gênero, identidade ou diagnóstico do cadastro. O modelo inicial usa biquíni ou sunga respectivamente; suas cores e recursos devem estar licenciados.
3. Permitir combinações independentes: pelo menos quatro tons de pele; cabelo curto, médio e longo; cores preto, castanho, loiro, grisalho e branco; aparência jovem, adulta e madura; barba ausente, curta ou cheia quando disponível. Não vincular aparência ao biotipo.
4. Capturar altura e peso obrigatórios somente para criar uma versão do avatar. Avaliações existentes continuam aceitando os campos opcionais atuais, sem alteração retroativa.
5. Receber opcionalmente abdômen, quadril, tórax, braços, coxas, panturrilhas, ombros, tronco e membros inferiores. Preservar lateralidade quando existente; não inventar o lado ausente. Se o modelo não aceitar assimetria, indicar explicitamente a limitação, nunca duplicar valores clínicos.
6. Permitir misturar ectomorfia, mesomorfia e endomorfia de 0 a 100%, com soma exatamente 100%. Apresentar nomes como referências visuais, não diagnóstico.
7. Permitir ajustes manuais independentes para ombros, tórax, abdômen, cintura, quadris, glúteos, braços, coxas, membros inferiores e tronco, dentro de limites seguros definidos para o modelo aprovado. Não converter ajustes em centímetros apresentados como se fossem medidos.
8. Mostrar rotação de 360 graus e simultaneamente frente, costas, perfil esquerdo e direito quando houver espaço; em telas menores, organizar sem perder qualquer vista e sem supor que quatro imagens caibam lado a lado.
9. Permitir confirmação, salvamento e comparação de duas versões. Identificar data, medidas efetivas e caráter aproximado em tela e nas imagens exportadas; não simular futuro ou promessa de resultado.
10. Permitir operar controles com teclado e leitor de tela, identificação por texto dos estados, contraste e alternativas textuais quando a visualização tridimensional não funcionar. Em televisão manter moldura e área segura nos quatro lados; validar também em computador e celular reais ou simulados.

## 5. Contrato de medidas, cálculo e morfologia

### 5.1 Origem dos valores

Cada medida usada em uma versão deve registrar valor, unidade, origem (`avaliacao_existente` ou `informada_para_avatar`), identificador e data da avaliação quando houver, autor e data de confirmação. O usuário escolhe explicitamente a avaliação de origem; não misturar automaticamente medições de datas diferentes. Uma versão antiga mantém cópia dos valores usados mesmo se a avaliação original for posteriormente marcada como removida. Isso não altera nem duplica o registro clínico.

Medidas ausentes permanecem ausentes. Parâmetros não medidos são designados `ajuste_visual` ou `estimativa_visual`; nunca são gravados de volta como medida. O sistema deve indicar quando um valor não pode ser representado pelo modelo. Um profissional não pode confirmar consentimento do cliente em nome dele sem regra e autorização próprias aprovadas.

### 5.2 Validação

- Aplicar no servidor os limites do catálogo atual para campos equivalentes: peso 2–400 kg; altura 40–250 cm; tórax 40–200 cm; cintura e abdômen 30–220 cm; quadril 40–220 cm; braço 10–80 cm; coxa 20–120 cm; panturrilha 15–80 cm. São limites existentes de entrada, não garantia de que o modelo represente toda essa faixa.
- Para ombros, tronco e membros inferiores, não inventar limites clínicos: definir critérios com responsável clínico e capacidade comprovada do modelo antes da implementação. Valores inexistentes não impedem uso; números inválidos ou fora do suporte visual devem gerar mensagem explícita.
- O anexo ilustra 150–210 cm e 40–180 kg, mas isso não revoga os limites atuais. Se o modelo inicial não cobrir toda a faixa, informar o intervalo efetivamente testado e bloquear apenas a geração não suportada, preservando as avaliações existentes. Não extrapolar silenciosamente.
- Índice de massa corporal = peso em quilogramas / (altura em centímetros / 100)². Calcular a partir dos valores reais; preservar precisão interna e apresentar duas casas no avatar, sem substituir o cálculo atual do catálogo.
- Ao alterar um componente de biotipo, redistribuir o restante proporcionalmente entre os outros dois; se ambos forem zero, dividir igualmente. Guardar valores com precisão suficiente e normalizar com regra de arredondamento determinística para soma exibida de 100%. Valores negativos, não numéricos ou composição sem soma válida são recusados no servidor.

### 5.3 Parâmetros e causalidade

O modelo deve separar medidas informadas, mistura de referências e ajustes visuais. Uma medida presente pode orientar um parâmetro somente quando existir calibração documentada; a relação deve registrar versão, domínio testado, erros e casos em que o ajuste é indisponível. Sem calibração, apresentar controle manual e aviso, não alegar que a circunferência visual corresponde à medida. Valores de peso e altura não determinam automaticamente musculatura ou gordura. Não usar o termo “preciso” sem estudo e validação.

## 6. Arquitetura e contrato de renderização

Proposta: um único modelo tridimensional por versão, com geometria, vestimenta e cabelo ligados aos mesmos parâmetros, materiais independentes e deformações controladas. Three.js é o motor gráfico recomendado pelo anexo; React Three Fiber é o adaptador recomendado, condicionado à compatibilidade real e aos testes. A biblioteca, versões, formato e política de entrega são decisões da prova de viabilidade; não foram instaladas.

Usar quatro câmeras ortográficas calibradas em torno do mesmo centro, nas posições frontal, posterior, esquerda e direita, separadas por 90 graus. Definir esquerda e direita **do corpo do avatar**, não do observador; incluir marcador assimétrico sintético nos testes para evitar espelhamento ou imagens idênticas. Mesma postura, escala física, recorte, iluminação, fundo branco, resolução e versão para todas as vistas. A rotação interativa não altera a posição das câmeras de exportação.

O enquadramento deve comportar cabeça, cabelos, pés e corpo nos extremos suportados sem corte. A exportação usa a mesma cena e uma cópia congelada dos parâmetros, não quatro ilustrações. Registar configuração de câmera, iluminação, modelo, materiais e motor; exportação inválida ou arquivo ausente falha claramente, sem substituir imagem antiga. Para comparação, manter escala e câmera comuns ou informar que versões incompatíveis não são visualmente comparáveis.

Se o dispositivo não suportar aceleração gráfica, perder contexto gráfico ou não carregar recursos, informar indisponibilidade e permitir consultar dados e vistas já geradas, quando autorizadas; nunca mostrar imagem inventada como geração atual. A exportação e cada arquivo privado dependem de autorização no servidor.

## 7. Identidade, autorização, privacidade e histórico

### 7.1 Modelo lógico proposto, não migração

- **Configuração corrente:** vínculo com `client_id` e `empresa_id` existentes; estado de visibilidade e preferências atuais; responsável e datas.
- **Versão imutável:** identificador próprio, sequência, origem das medidas e seus valores congelados, apresentação, aparência, proporções, ajustes, índice calculado, versões e identificadores do modelo, materiais, câmeras e algoritmo, autor, data, estado de aprovação e referência às vistas.
- **Quatro arquivos privados:** cada arquivo associado à mesma versão, vista, armazenamento privado, tipo, dimensões e verificação de integridade. Identificador de armazenamento não é autorização; nunca entregar caminho público como acesso irrestrito.
- **Eventos separados:** registro de criação, confirmação, visualização, exportação, mudança de permissão, ocultação e revogação, sem anotar valores clínicos ou credenciais em registros operacionais.

Salvar nova versão por operação atômica e resistente a repetição: falha entre banco e armazenamento mantém estado pendente ou recuperável, não publica conjunto incompleto; não sobrescrever versões antigas. Concorrência detectada por versão da configuração; conflito deve pedir atualização em vez de apagar a alteração de outra pessoa. Criar migração aditiva apenas na fase autorizada, com plano de reversão que preserve dados. A política de retenção e solicitações legais de exclusão exigem revisão jurídica; imutabilidade histórica não elimina obrigações legais.

### 7.2 Controle de acesso

Profissional: autenticação ativa, empresa autorizada, relação válida com o cliente e permissão explícita para visualizar, alterar ou exportar. Cliente: identidade derivada da sessão efetiva, nunca de identificador enviado pelo navegador; prévia administrativa não pode criar, alterar, consentir ou exportar como se fosse o cliente. Avaliar separadamente se alguma leitura de prévia é permitida, sem presumir autorização. A cada leitura de configuração ou arquivo, verificar cliente, clínica, autorização vigente e preferência de exibição; não confiar apenas em caminho aleatório ou ligação anterior. Isolamento da avaliação e do arquivo deve ser testado em conjunto.

### 7.3 Escolha e revogação

Registrar escolha voluntária e informada específica para criar/exibir o avatar e suas vistas, versão do texto, autor, data e escopo. Não presumir que autorização de fotos ou contrato da clínica cobre o avatar. Diferenciar: ocultar para uma apresentação; suspender novas gerações e acessos após revogação; retenção clínica ou exclusão conforme fundamento e política aprovados. Revogação deve impedir imediatamente usos futuros sujeitos a ela, inclusive geração e exportação, sem apagar automaticamente registros existentes. Não prometer apagar cópias já exportadas. Direito de acesso profissional e retenção após revogação dependem de política jurídica e governança a definir antes de operar; registrar acesso excepcional quando autorizado.

## 8. Riscos e respostas

| Risco | Consequência | Prevenção / recuperação | Verificação futura |
|---|---|---|---|
| Inferir forma por peso ou sem calibração | Representação enganosa e dano à confiança | Rótulo de aproximação, ajustes manuais e fontes distintas; sem diagnóstico | Mesmo peso e altura com morfologias diferentes; ausência explícita |
| Arquivo de outro cliente ou clínica | Exposição de dado sensível | Checagem por identidade, vínculo, permissão e autorização em cada acesso | Dois clientes e duas clínicas sintéticos; leitura e exportação negadas |
| Prévia usada como cliente | Consentimento ou gravação indevida | Sessão efetiva do cliente para ações pessoais | Prévia recusada para gravar, consentir e exportar |
| Falha durante salvamento | Quatro vistas incompletas ou histórico inconsistente | Estados pendentes, publicação atômica e recuperação | Falhas de banco, rede e armazenamento; repetir operação |
| Duas edições simultâneas | Perda de ajustes ou versões | Controle de versão e aviso de conflito | Duas sessões sintéticas concorrentes |
| Câmeras ou versão divergentes | Comparação visual enganosa | Congelar versões e escala; bloquear comparação incompatível | Marcador assimétrico, proporções e enquadramento conferidos |
| Modelo ou roupa sem direito | Risco de uso indevido ou indisponibilidade comercial | Inventário de licença por recurso e revisão antes da adoção | Registrar origem, versão, licença e autorização de distribuição |
| Recurso gráfico indisponível | Tela vazia ou perda da jornada | Mensagem clara e dados disponíveis sem avatar | Celular, navegador sem suporte e perda do contexto |
| Revogação ou sessão expirada | Continuidade de acesso indevido | Revalidar autorização e sessão no servidor | Revogar durante geração, exportação e leitura |
| Malha ou vestimenta deformada | Corpo cortado ou roupa atravessada | Limites verificados; não publicar resultado inválido | Testar combinações extremas para todas as apresentações |

## 9. Etapas e condições de passagem

**Nenhuma etapa abaixo está autorizada pela elaboração desta especificação.** A construção é sequencial e exige escolha do responsável; nenhuma aprovação clínica é presumida.

| Etapa | Entrega proposta | Condição para avançar |
|---|---|---|
| 0. Escolha técnica | Confirmar licença, custos, cobertura e recursos do candidato; orçamento e responsáveis. | Aprovação da escolha e de eventual custo; sem aquisição automática. |
| 1. Viabilidade anatômica | Modelo interativo com vestimenta e parâmetros essenciais, somente dados sintéticos, quatro câmeras e avaliação de deformações. | Revisão visual e técnica independente e aceite da qualidade pelo responsável; bloquear se não suportar requisitos ou licença. |
| 2. Medidas e personalização | Controles, mistura, proveniência e limites; sem diagnosticar nem inventar medidas. | Testes de limites, calibração honesta, acessibilidade e validação clínica do texto. |
| 3. Vistas e histórico | Exportação coerente, versões imutáveis e comparação, usando armazenamento privado. | Testes de concorrência, falhas, reprodutibilidade e preservação. |
| 4. Integração segura | Encaixe nas avaliações e no acesso do cliente e profissional, preferências e auditoria. | Testes de isolamento, consentimento, revogação e autenticação com dados sintéticos; revisão independente. |
| 5. Homologação | Testes ponta a ponta e visuais em computador, celular e televisão, com limitações explícitas. | Aceite do responsável e inexistência de impedimentos; publicar somente com autorização específica. |

**Estimativa inicial não contratual:** viabilidade e seleção do modelo podem consumir aproximadamente 1–3 semanas; módulo completo, 6–14 semanas adicionais de trabalho especializado, sem incluir aquisição, negociação de licença, validação jurídica ou atrasos externos. Faixas são hipóteses de planejamento, não orçamento, promessa ou medição do esforço; recalcular após a etapa 0. Custos de licenças, modelagem, armazenamento e operação permanecem sem cotação.

## 10. Plano de testes e critérios de aceite

Todos os testes destrutivos, de autorização, concorrência e regressão usarão ambiente isolado, dados sintéticos e serviços externos simulados; não copiar prontuários.

1. **Medidas:** altura/peso obrigatórios apenas para o avatar; campos ausentes, extremos do catálogo e limites do modelo; lateralidade e diferenciação entre abdômen e cintura; cálculo do índice e arredondamento; dados inválidos recusados no servidor.
2. **Morfologia:** três componentes somam 100%, inclusive zeros, decimais e repetição; alterações manuais não viram medidas clínicas; mesmo peso/altura permitem corpos distintos.
3. **Representação:** quatro saídas da mesma versão; marcador assimétrico prova perfis opostos; teste de câmera, mesma escala e luz, enquadramento, fundo e vestimenta em combinações extremas; rotação livre não muda exportação.
4. **Segurança:** cliente e clínica corretos; cliente errado, clínica errada, profissional não autorizado, prévia administrativa, sessão vencida, arquivo adivinhado, revogação durante acesso e resposta atrasada; conferir tanto metadados quanto bytes exportados.
5. **Histórico:** salvar, recarregar, comparar e exportar; nova versão não altera anterior; avaliação original ocultada não modifica reprodução histórica; falhas de banco ou armazenamento e solicitações repetidas não criam versões parciais.
6. **Experiência:** verificar funcionalidade em celular e computador, teclado, leitor de tela, zoom, ausência de suporte gráfico e tela de televisão com margem segura; avaliar tempos e memória em dispositivos definidos antes da implementação.
7. **Revisão:** relacionar evidência à revisão examinada, registrar limitações e pedir revisão independente sequencial. Nenhuma imagem ilustrativa estática substitui o motor; testes visuais não provam segurança ou fidelidade anatômica.

## 11. Decisões pendentes antes da implementação

1. Selecionar e licenciar o modelo e cada componente após a prova de viabilidade, com preço e custo de adaptação conhecidos.
2. Definir faixa de clientes e dimensões representáveis com base em testes, sem excluir nem alterar registros clínicos existentes; decidir limites de medidas novas com responsável clínico.
3. Aprovar política de consentimento, leitura profissional, retenção e revogação, inclusive eventuais exigências legais e comerciais entre clínicas.
4. Definir padrão de resolução e tamanho dos arquivos, prazo de retenção, orçamento de desempenho e aparelhos para testes, em vez de afirmar metas não medidas.
5. Definir como tratar assimetria, aparência e limites de representação quando o modelo não suportar a combinação, sem prometer fidelidade.
6. Definir se versões de modelos antigos continuarão disponíveis para reprodução ou se apenas imagens congeladas serão usadas; comparação com modelos incompatíveis deve ser explicitamente sinalizada.

## 12. Linhas vermelhas

Não criar novo cadastro de cliente; não substituir avaliações existentes; não modificar o motor de orçamentos; não alterar contratos existentes sem análise de impacto; não tratar biotipo como diagnóstico; não enviar dados clínicos a serviço externo sem autorização e avaliação de segurança; não usar imagens de exemplo como resultado real; não comprar, publicar ou operar com dados reais sem autorização expressa.
