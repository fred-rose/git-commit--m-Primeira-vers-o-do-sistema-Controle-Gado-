# Feedback visual das ações

Implementado em 10/09/2026, com JavaScript ESM e CSS. Não foram adicionadas dependências, migrations ou mudanças em cálculos, RPCs, políticas RLS e regras de idempotência.

## Componente e uso

`js/components/actionButton.js` centraliza idle, loading, progress, syncing, success, error e offline. O estado original, ícones, disabled e atributos ARIA são restaurados após o feedback. Sucesso/erro permanecem por 1 segundo; esse timer só controla a duração da mensagem, nunca simula progresso.

```js
await runButtonAction(button, async action => {
  action.loading('Preparando arquivo…');
  const file = await prepareFile();
  action.step('Enviando arquivo…');
  await sendFile(file);
}, { loading: 'Preparando…', success: 'Arquivo pronto' });
```

`action.step(label)` mostra etapa com barra indeterminada. `action.step(label, completed, total)` aceita contagem real de unidades concluídas; sem valores mensuráveis, não mostra percentual. Supabase Storage continua com barra indeterminada, pois a abstração atual não fornece progresso de upload.

`runButtonAction` bloqueia reentrância. Ações diretas recebem uma chave por conta, contexto, ação e registro; `bindActionButtons` reaplica o estado após os renders da aplicação. Assim, um novo elemento DOM não libera outra exportação ou retry enquanto a operação anterior está em andamento. O seletor de fazenda tem apenas disabled, aria-busy e texto discreto de carregamento.

## Modais

`openModal` usa feedback automático quando o submit retorna uma Promise. Consultas síncronas, como Fechar detalhes, continuam sem animação ou espera. Operações locais de gravação recebem configuração explícita de feedback.

```js
openModal({
  title: 'Salvar registro',
  content,
  feedback: { loading: 'Salvando…', success: 'Registro salvo' },
  async submit(values, form, action) {
    await save(values);
  }
});
```

O modal bloqueia submissões concorrentes inclusive por evento programático, preserva os valores dos campos e aguarda a operação antes de fechar. Durante processamento, cancelar/Escape e mudanças dos campos ficam bloqueados. Em falha, a mensagem detalhada continua no formulário e os controles voltam ao estado anterior após o feedback de erro.

Retornar `false` continua significando que o formulário exige outra confirmação, sem anunciar sucesso nem fechar. Para mudar o texto nessa situação, usar `setIdleButtonLabel(button, label)`, como na confirmação de excesso de capacidade. `feedback: false` permite desativar a apresentação em um formulário específico.

## Ações integradas

- Criação, edição e exclusão de movimentações, lançamentos financeiros e pastos, através dos submits e confirmações existentes.
- Criação de fazendas, configurações, capacidade, troca de modo e consolidação.
- Confirmação quick +/− com quantidade no rótulo; os pequenos botões que abrem o formulário continuam normais.
- Fotos e registros fotográficos, com distinção entre salvar localmente e enviar ao servidor.
- Migração: exportação da cópia primeiro, preparação da fazenda/dados, envio das fotos, migração e atualização do snapshot. Os rótulos correspondem às chamadas reais. O sistema solicita o download; não afirma que o usuário concluiu seu armazenamento em disco.
- Backup, validação de arquivo, restauração local/multifazenda, XLSX e CSV.
- Sincronização, retry, confirmação de registro e ignorar aviso; Informar valor usa o submit do modal existente.
- Leitura assíncrona da Administração, sem novas ações administrativas.
- Login, criação de conta e encaminhamento Google. Preservados métodos, argumentos e comportamento de sessão; acrescentados apenas bloqueio concorrente e apresentação. O fluxo de recuperação de senha não existia e continua informado como indisponível.

## Offline e sincronização

`syncFeedback.js` consulta a outbox para interpretar o resultado. O retorno de `manager.run()` sozinho não é tratado como sucesso, porque a fila pode conter conflitos ou falhas.

Quick só anuncia **Salvo offline** após a gravação no IndexedDB. Online, aguarda o ciclo existente de sincronização e verifica o registro: **Rebanho atualizado** exige status synced; pendências continuam identificadas como locais/aguardando sincronização. Se houver falha depois da gravação local, a operação fica na fila e a revisão ocorre em Alertas, evitando reapresentar o formulário como se nada tivesse sido registrado.

Registros visíveis na Central de Alertas usam syncing enquanto a linha da outbox é enviada. O indicador global informa quantas alterações aguardam envio. Não foram alterados client_mutation_id, mutation_receipts, limites de retry, conflitos ou transações. O repositório apenas passou a retornar o identificador local já criado e a aceitar callback de apresentação para a etapa de atualização após importação.

## Acessibilidade e desempenho

Barra de 3 px dentro do botão, animada por transform, sem modificar suas dimensões. Os testes comparam altura/largura antes e durante loading. Rótulos textuais, marca de sucesso/erro, aria-busy, nome acessível e região de anúncio não dependem apenas da cor. Toasts e erros existentes continuam disponíveis.

`prefers-reduced-motion` remove animações e transições, mantendo rótulos e barra estática. Não há Canvas, WebGL, vídeos, imagens decorativas, frameworks ou bibliotecas de animação. A espera por uma oportunidade de pintura tem fallback para não prender operações em abas em segundo plano.

## Arquivos

Criados: `js/components/actionButton.js`, `js/components/syncFeedback.js`, `css/action-button.css`, `tests/browser-feedback.mjs`, `tests/run-local-browser.mjs` e este documento.

Integrados: `js/components/modal.js`, `forms.js`, `cloudForms.js`, `cloudMovementForm.js`, `cloudShell.js`, `dataManagement.js`; `js/app.js`, `js/auth/auth.js`, `js/repositories/cloudRepository.js`, `js/migration/localMigration.js`, `cloudBackup.js`, `css/auth.css`, `style.css`, `package.json`, testes cloud e dados. O build regenera o SDK local e `sw.js`.

## Verificação

- `npm.cmd test`: 57 testes aprovados, 1 comparação opcional com planilha pulada por ausência do arquivo.
- `npm.cmd run test:sql`: RLS, estoque, financeiro, idempotência, modos, administração e migração aprovados em PostgreSQL local.
- `npm.cmd run test:feedback`: loading, dupla submissão por evento, erro/retry, preservação de campos, retenção do sucesso, confirmação sem gravação, render durante ação, progresso real estável, reduced motion e seis larguras.
- `npm.cmd run test:auth`: login/cadastro/Google simulados, teclado, senha visível e responsividade.
- `npm.cmd run test:cloud`: fluxo multifazenda e outbox, incluindo novo assert do estado Salvo offline e reconexão repetida sem duplicação.
- `npm.cmd run test:browser:local`: servidor de teste efêmero para as suítes legadas, financeiro, dados/backup e PWA, sem editar as credenciais reais. Aceita nomes específicos de suítes na linha de comando para repetir apenas verificações necessárias.
- `npm.cmd run build`: 60 módulos e cache PWA atualizados.

Autenticação e Storage hospedados não foram exercitados com contas reais nesta tarefa; os testes cloud/Auth usam respostas HTTP simuladas. O teste de restauração foi adaptado para aguardar o fim do estado visual antes de selecionar novamente um arquivo, respeitando a disponibilidade do botão.

## Continuação e revisão em 14/09/2026

A revisão encontrou o componente central, CSS, integrações e suítes acima já presentes. Foram completados os seguintes pontos:

- Migração bloqueada por fazenda ocupada: a mensagem agora explica o bloqueio e enumera as quantidades disponíveis no snapshot carregado (movimentações, estoque inicial, financeiro, pastos, fotos e proprietários). Não apresenta esses números como uma nova consulta ao servidor. A rejeição continua sendo decidida pela RPC; uma retomada idempotente continua permitida mesmo quando já há registros. Nenhum dado é apagado.
- `feedback: false` passa a desativar apenas a apresentação: modais assíncronos continuam bloqueando os campos, cancelamento e substituição do formulário durante a operação. A falha restaura os estados disabled originais e conserva os valores.
- Importação do histórico financeiro, início de inventário e limpeza local receberam configuração explícita de feedback para suas gravações síncronas.
- `test:feedback`, `test:auth` e `test:cloud` iniciam um servidor temporário isolado e o encerram ao finalizar. Não dependem de um servidor previamente aberto na porta 4173.
- Testes legados de exclusão bloqueada e conflito entre abas aguardam a mensagem de erro ficar visível, em vez de pressupor resultado síncrono após o clique.

Arquivo criado nesta continuação: `tests/migration-feedback.test.js`, cobrindo mensagem com contagens, preservação de erros e retomada com o mesmo identificador.

Arquivos alterados nesta continuação: `js/app.js`, `js/components/modal.js`, `js/components/dataManagement.js`, `js/migration/localMigration.js`, `tests/browser-feedback.mjs`, `tests/browser.mjs`, `tests/run-local-browser.mjs`, `package.json`, `README.md` e este documento. `sw.js` foi regenerado pelo build. Não foram adicionadas dependências nem modificadas regras SQL, Auth ou outbox.
