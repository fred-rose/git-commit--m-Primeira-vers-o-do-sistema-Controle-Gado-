# Auditoria antes da V2

Git estava limpo. Aplicação estática ESM, sem framework. `app.js` coordena navegação hash, eventos, telas e repositório síncrono; `domain.js` valida e reconstrói estoque cronologicamente; financeiro automático é derivado das movimentações. `storage.js` mantém um documento local versionado com controle de revisão entre abas. Fotos são data URLs reduzidos. Backup valida, projeta campos e restaura; XLSX usa SheetJS local. Assistente recebe DTO limitado e não tem capacidade de escrita. CSS separa componentes, páginas e responsividade.

Telas existentes: dashboard, rebanho, movimentações, pastos, financeiro, fotos, relatórios e configurações. Todas recebem dados do repositório. Essa fronteira será preservada: o repositório remoto entrega uma projeção compatível, com contexto de fazenda e gravações assíncronas por RPC.

Antes de alterações: 38 testes, 22 aprovados, 15 falhas, 1 comparação com planilha indisponível. As falhas incluem fixtures ainda dependentes da antiga distribuição demonstrativa, `createSeed(false)` ignorado e endereços omitidos pelo backup. O seed atual contém 169 animais com proprietário/localização não informados e 44 registros financeiros. Nenhuma distribuição real será inventada para satisfazer testes.

Evolução: tabelas PostgreSQL com RLS; operações transacionais e idempotentes; Supabase Auth/Storage; IndexedDB para sessão, cache e outbox particionados por usuário; PWA somente para arquivos estáticos. Modo legado continua disponível quando Supabase não estiver configurado. Configuração remota nunca importa ou apaga dados locais automaticamente.
