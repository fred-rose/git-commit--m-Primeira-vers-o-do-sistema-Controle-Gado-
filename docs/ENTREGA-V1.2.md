# Entrega V1.2 — backup e Assistente da Fazenda

Implementação validada em 09/09/2026. Mantém HTML, CSS, JavaScript e localStorage, sem framework, autenticação, backend ou dependências de produção adicionais. O domínio, repositório, movimentações, fotos, financeiro e exportação SheetJS existentes foram reutilizados.

## Arquivos desta etapa

Criados:

- `js/storage/schema.js`: limites, tipos, validação estrutural e seleção explícita de campos.
- `js/storage/backup.js`: envelope identificado, serialização, leitura e resumo de restauração.
- `js/storage/migrations.js`: transformações sequenciais; adaptação V1 → schema 2 sem aplicar seed.
- `js/pages/configuracoes.js`: Gerenciamento de Dados.
- `js/components/dataManagement.js`: download, prévia de importação e confirmação de limpeza.
- `js/components/assistant.js`: painel, mensagens seguras, estado de consulta e controles do chat.
- `js/ai/contextBuilder.js`: DTO resumido a partir da base atual.
- `js/ai/localRuleEngine.js`: consultas determinísticas e instruções de uso.
- `js/ai/remoteProvider.js`: contrato de transporte para um endpoint futuro.
- `js/ai/aiAssistant.js`: seleção de provider e histórico limitado.
- `css/assistant.css`: configurações e assistente na paleta existente.
- `tests/backup-assistant.test.js` e `tests/browser-data.mjs`: testes da entrega.
- `docs/ENTREGA-V1.2.md`: esta documentação.

Modificados:

- `index.html`, `style.css`, `css/responsive.css`: botão flutuante, diálogo acessível e adaptação ao celular.
- `js/app.js`, `js/router.js`, `js/components/icons.js`: nova rota e integração das ações com o estado existente.
- `js/components/modal.js`: conteúdo pode ser um nó DOM criado explicitamente.
- `js/constants.js`, `package.json`: versão da aplicação 1.2.0 e comando de teste.
- `js/domain.js`: validação estrutural e de timestamps integrada às regras existentes.
- `js/storage.js`: exportação controlada, restauração validada e limpeza somente da base da fazenda.
- `js/finance.js`: migração de estrutura extraída para o módulo compartilhado.
- `README.md`: instruções, estrutura, validação e limites atualizados.

## Backup, restauração e limpeza

Em **Configurações → Gerenciamento de Dados**, exportar gera `controle-gado-backup-YYYY-MM-DD.json`. O arquivo contém `_meta.system = "controle-gado"`, `schemaVersion = 2`, `appVersion = "1.2.0"`, `exportedAt` ISO-8601 e um objeto `data` separado.

O objeto `data` preserva os nomes internos existentes: `owners`, `pastures`, `openingStock`, `movements`, `finances`, `photos`, além de `version`, `revision`, `seedVersion`, `appliedSeeds`, `demo` e `openingDate`. Cada coleção exporta somente campos conhecidos. Não há exportação de outras chaves do localStorage. Estoque, resumos e financeiro automático continuam sendo projeções dos registros, sem cópias redundantes.

A importação lê o arquivo em `try/catch` e valida todo o conteúdo antes de qualquer gravação: identificação, versões, campos obrigatórios, arrays, objetos, referências, IDs únicos, números finitos e inteiros quando necessário, datas civis/timestamps, strings, regras financeiras e disponibilidade cronológica do rebanho. Rejeita propriedades perigosas de protótipo e imagens fora dos formatos permitidos.

Limites: arquivo até 20 MiB, 20 mil elementos por array, profundidade 12, 300 mil nós e 40 campos por objeto. Textos gerais até 2 mil caracteres; nomes até 100 e descrições financeiras até 500. Imagem armazenada até 600 mil caracteres. A quota real do navegador pode ser menor que o limite do arquivo; falhas de gravação preservam o estado anterior.

Depois de validar, a prévia mostra a data do backup e as contagens de animais, movimentações, registros financeiros, pastos ativos e fotos. Cancelar não altera a base. Confirmar prepara o download de uma cópia atual e restaura com uma gravação do documento. O repositório notifica as telas, sem reload. A conversa é zerada para não misturar respostas da base anterior. A aplicação consegue preparar o download, mas não garantir que o usuário guardou o arquivo.

Backups completos emitidos pelas V1/V1.1, sem envelope, são aceitos como **legados** somente após validar sua estrutura conhecida. A prévia informa que a data de exportação não está disponível. Novos arquivos exigem metadados válidos; versões futuras desconhecidas são rejeitadas. O módulo de migrations oferece etapas por versão para futuras mudanças; migrar não aplica o seed financeiro.

**Limpar dados locais** exige digitar exatamente `LIMPAR`. Esvazia estoque, movimentações, pastos, financeiro e fotos, e mantém os cinco proprietários padrão como configuração necessária para novos cadastros. Grava uma base vazia na chave própria `controle-gado:v1`: isso impede que o seed reapareça ao reabrir. Outras chaves permanecem intactas; não usa `localStorage.clear()`.

## Planilha, financeiro e XLSX

Foram mantidos e reconferidos os **44 lançamentos reais** de `Controle do Gado V2.xlsx`:

| Aba exata | Registros |
| --- | ---: |
| Movimentação Financeira - Varia | 11 |
| Movimentação Financeira - Apênd | 33 |

Entradas: **R$ 176.570,02**; despesas: **R$ 118.084,21**; saldo: **R$ 58.485,81**. Datas civis e descrições originais preservadas; Saída normalizada para Despesa; valores convertidos para centavos; saldo acumulado guardado apenas como referência. A comissão `848.6568` vira R$ 848,66, mantendo o valor original na proveniência. Campos ausentes ficam vazios; categorias são sugestões conservadoras. Cabeçalhos e linhas sem lançamento são ignorados; nenhum lançamento duplicado foi identificado entre essas duas abas.

O seed entra somente quando a chave da base não existe. Reabrir, atualizar a aplicação ou importar backup preserva os registros existentes. Bases anteriores podem receber a carga explicitamente por Financeiro, com controle de proveniência e `appliedSeeds` contra repetição.

Compras e vendas continuam gerando projeções financeiras com `movementId`; edição e exclusão da movimentação atualizam essas projeções. Manuais e migrados são independentes. Dashboard, Financeiro, Relatórios e assistente usam as mesmas funções de resumo.

O XLSX real usa a cópia local de SheetJS. Rebanho, Movimentações, Pastos e Financeiro exportam seus recortes; o relatório geral tem **Resumo, Rebanho, Movimentações, Pastos e Financeiro**. Valores e datas são células numéricas formatadas; textos externos não viram fórmulas. Os arquivos refletem também dados restaurados, sem precisar recarregar a página.

O histórico misto de 2021–2022 continua fora do saldo: há valores unitários/totais e recebimentos a confirmar, além de possível sobreposição com o saldo inicial de 2026. Todas as linhas pendentes permanecem na [auditoria financeira](MIGRACAO-FINANCEIRA.md). A planilha original não foi modificada.

## Assistente local

O botão com cabeça de gado aparece no canto inferior direito das oito telas. Abre um painel lateral no desktop e quase toda a tela no celular, com fechar, Enter para enviar, estado de consulta, perguntas sugeridas e Limpar conversa. O diálogo mantém o foco e fecha com Escape. Há espaço inferior reservado nas páginas para o botão não encobrir as últimas ações.

Responde a perguntas como “Quantas vacas temos?”, “Quantos animais estão no pasto Barragem?”, “Quantos animais são do Bruno?”, “Qual o saldo?”, “Quanto entrou este mês?” e “Quanto foi gasto este mês?”. Explica venda, compra, morte, nascimento, transferência e backup. A informação é calculada novamente a cada pergunta. Perguntas fora das regras recebem orientação sobre os limites e os filtros das telas.

O provider recebe apenas agregações: totais de animais por categoria, proprietário e pasto, financeiro geral e mensal e um recorte da pergunta. No máximo 20 grupos por tipo, quatro nomes selecionados por tipo e cinco movimentações recentes relevantes, apenas quando solicitadas. O DTO é limitado a 12 mil bytes. Não inclui fotos, notas, descrições financeiras, IDs internos nem histórico completo. A construção do resumo ainda percorre a base local; o limite controla o conteúdo entregue ao provider.

O assistente é **somente de consulta**: não recebe o repositório nem funções de mutação. “Venda 5 vacas” responde com instruções, sem executar. Mensagens são renderizadas com `textContent`; respostas remotas futuras são tratadas apenas como texto, sem executar ações. Histórico limitado a **20 mensagens no total**, em memória; fechar o painel mantém a conversa da sessão, recarregar ou limpar a conversa a remove. Nenhuma mensagem é salva no localStorage.

`RemoteProvider` está desativado. Seu contrato aceita um endpoint relativo em `/api/` e um transporte explicitamente injetado. Não implementa chamadas de rede nem guarda chaves. Uma integração futura deve usar backend/proxy seguro e recebe somente pergunta atual e DTO, sem as 20 mensagens por padrão. Perguntas já resolvidas pelo motor local não passam ao remoto; falhas do remoto retornam à orientação local.

## Validação executada

- **38 testes aprovados**, incluindo extração reproduzida a partir da planilha original, backup válido/aleatório/corrompido/incompatível, tipos e tamanhos, ausência de gravação em arquivos inválidos, quota, compatibilidade e limpeza com preservação de chave alheia.
- **Três suítes Edge/Playwright aprovadas**, em contextos isolados do perfil pessoal: `test:browser`, `test:browser:finance`, `test:browser:data`.
- Venda de 10 vacas por R$ 40 mil, compra de cinco bois por R$ 20 mil, edição/exclusão e financeiro vinculado; fotos, filtros, relatórios e persistência.
- Exportar → limpar → reabrir vazio → importar → restaurar os registros; confirmação cancelável e atualização sem reload.
- Assistente sem rede após a carga inicial: respostas atuais, nenhuma venda executada, nenhuma requisição de consulta, limite de mensagens e textos HTML exibidos como texto.
- Oito telas e painel entre **320, 390, 768, 1024 e 1440 px**, sem transbordamento horizontal; capturas revisadas; console sem erros. XLSX gerado e relido com as cinco abas e 46 registros financeiros no cenário restaurado com compra e venda.

Evidências em `tests/artifacts/`: `configuracoes-desktop.png`, `configuracoes-mobile.png`, `assistente-desktop.png`, `assistente-mobile.png`, `backup-estruturado.json` e `restaurado-geral.xlsx`, além dos artefatos das suítes anteriores.

## Limitações e próximo passo

Sem sincronização entre aparelhos, backend ou IA externa ativa. O motor local não interpreta linguagem livre como uma LLM; totais históricos e recortes financeiros específicos usam os filtros existentes. A aplicação ainda precisa acessar seus arquivos para abrir/recarregar; o assistente funciona offline depois da carga inicial. Quota de armazenamento e fotos limitam o volume local. A responsividade foi emulada no Edge, sem teste em aparelhos físicos, Safari ou Firefox.

O próximo passo técnico recomendado é **cache offline versionado via PWA**, acompanhado de teste em um celular usado na fazenda, para reabrir o sistema sem rede. Antes do uso operacional, conferir o inventário demonstrativo e os valores históricos pendentes com o responsável. Sincronização e IA remota ficam para uma etapa posterior.
