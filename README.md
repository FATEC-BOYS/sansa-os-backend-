# SANSA OS · Backend

API do sistema operacional da SANSA Oficina Digital, construída em **TypeScript + Fastify + Prisma + PostgreSQL**.

## Funcionalidades v0.1
- API autenticada com chave interna (mantida somente no servidor)
- Banco persistente para leads sincronizados, propostas de ações e trilha de auditoria
- Sincronização **manual e somente leitura** do CRM Google Sheets existente
- Fila de ações com revisão/aprovação/rejeição, **sem envio automático**
- Status explícito dos agentes; especificações no repositório `sansa-os-agents`
- Testes unitários da interpretação do CRM

## Inicialização local
```bash
cp .env.example .env
# Edite DATABASE_URL e INTERNAL_API_KEY. Use uma chave longa e aleatória.
docker compose up -d
npm install
npm run db:generate
npm run db:push
npm run dev
```

GET `http://localhost:3333/health` verifica aplicação e banco. Para as rotas `/api/*`, use o header `x-api-key: <INTERNAL_API_KEY>`.

## Conectar o CRM sem substituí-lo
Defina `GOOGLE_SHEET_ID` e `GOOGLE_APPLICATION_CREDENTIALS` no `.env`. Compartilhe a planilha com o e-mail da **service account** com acesso de leitor. O endpoint `POST /api/crm/sync` lê exclusivamente a aba `Prospeccao` e armazena uma projeção local de consulta. Nunca altera a planilha. Não usa scraping nem credenciais no código.

A sincronização não é agendada no MVP; requer chamada explícita. O painel mostra claramente a última sincronização. O CRM permanece a fonte principal.

## Aprovação é diferente de execução
- `POST /api/approvals`: registra um rascunho aguardando revisão.
- `PATCH /api/approvals/:id`: aprova ou rejeita internamente, com auditoria.
- **Nenhuma rota envia e-mail, publica conteúdo, executa pagamentos ou altera automações externas.**

## Rotas
| Método | Caminho | Ação |
|---|---|---|
| GET | `/health` | Saúde do serviço e DB |
| GET | `/api/overview` | Métricas, CRM, agentes, fila e histórico |
| GET | `/api/leads` | Leads do CRM sincronizado |
| GET | `/api/approvals` | Fila de revisão |
| POST | `/api/approvals` | Criar rascunho |
| PATCH | `/api/approvals/:id` | Aprovar ou rejeitar |
| POST | `/api/crm/sync` | Ler CRM existente e atualizar espelho local |

Não confunda integração do SANSA OS com tarefas externas do ChatGPT: as automações anteriores permanecem independentes.

## Segurança e deploy
Os repositórios foram identificados como **públicos** durante a criação inicial. Não comite `.env`, chaves de service account, conteúdo do CRM ou dados de clientes. Configure repositórios privados e autenticação real de usuário antes de um deploy aberto na internet. O `INTERNAL_API_KEY` é um controle interno para comunicação servidor-servidor, **não substitui login, RBAC ou proteção de acesso público**.

## Radar de comércios locais — v0.2

A aba **Radar local** pesquisa negócios numa área delimitada (padrão: Praça da Matriz, Centro de São Bernardo do Campo), prioriza oportunidades de investigação e prepara propostas específicas para revisão.

**Fluxo real:** busca manual OSM/Overpass → pontuação explicável baseada somente nos dados disponíveis → salvar na fila de pesquisa → gerar análise e rascunho (OpenAI opcional) → aprovação humana interna. Sem autoenvio, scraping de contatos ou mensagens em massa. O CRM Google Sheets continua sendo a fonte oficial de clientes; a fila `LocalProspect` é apenas para **pesquisa**, não substitui o CRM.

### API
- `POST /api/discovery/search` — dados públicos OSM em até 3 km de um ponto; mínimo 60s entre chamadas nesta instância; limite de resultados; nunca agenda buscas.
- `GET /api/discovery/prospects` — oportunidades escolhidas pela fundadora.
- `POST /api/discovery/prospects` — salva um estabelecimento selecionado para pesquisa, com deduplicação de ID OSM.
- `POST /api/discovery/prospects/:id/draft` — avalia a oportunidade e cria rascunho em Aprovações. Com `OPENAI_API_KEY`, usa Responses API e saída estruturada; sem chave, entrega uma versão conservadora por regras e sinaliza o modo. Se houver erro da API, não apresenta resposta fictícia como IA.

Campos de `website` vazios no OSM **não comprovam que a empresa não tenha site**; a pontuação é prioridade preliminar de pesquisa, não avaliação de qualidade. A eventual proposta não afirma falhas ou benefícios que não foram comprovados. Dados OSM: © OpenStreetMap contributors, ODbL. Consulte a política do provedor Overpass; instâncias públicas servem a consultas moderadas, não prospecção contínua em escala. Para produção, use instância própria ou serviço comercial adequado. Referências: https://wiki.openstreetmap.org/wiki/Overpass_API e https://osmfoundation.org/wiki/Attribution_Guidelines.

Não há integração automática com Gmail ou automações do ChatGPT. Antes de publicar dados internos, configure login/RBAC e deixe os repositórios privados.

## Propostas por WhatsApp ou e-mail (v0.3)
- `PATCH /api/discovery/prospects/:id/contacts` — cadastrar/alterar/apagar `email` e/ou `whatsapp` de um comércio já salvo para investigação. Apenas contatos comerciais, informados manualmente. Número brasileiro com DDD; armazenado em E.164.
- `POST /api/discovery/prospects/:id/draft` — exige `{"channel":"email"}` ou `{"channel":"whatsapp"}` e contato correspondente previamente registrado. Cria rascunho específico ao canal; nunca envia.
- `GET /api/approvals` e `GET /api/overview` — incluem canal e contato comercial atual do prospect para montar o link de envio manual **após aprovação**.
- O frontend abre `https://wa.me/<número>?text=<mensagem>` ou `mailto:` com assunto e corpo preenchidos. O clique não prova envio e não atualiza status automaticamente.
- Ao alterar o número/e-mail, o botão de abertura usa o endereço atualizado, sem reescrever o corpo do rascunho. Revise sempre antes de enviar.
- O CRM principal no Google Sheets não é alterado; a fila local armazena esses contatos apenas na base protegida do SANSA OS.
- Não existe integração com WhatsApp Business API nem Gmail SMTP/API para enviar automaticamente. São necessárias integrações, consentimento, política antispam e logs para isso.

## Integração Claude + GPT (v0.4)
A API suporta os dois fornecedores, selecionáveis por rascunho: `provider: "auto"|"anthropic"|"openai"|"rules"` junto de `channel` no endpoint `/api/discovery/prospects/:id/draft`.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`);
- `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão `gpt-5-mini`);
- `AI_PROVIDER=auto`: usa Claude se configurado, senão GPT, senão regras. A seleção explícita de Claude/GPT sem chave retorna erro, sem fingir análise por IA.
- Saída JSON estruturada e validada por Zod para ambos. Nenhuma chamada de IA aciona e-mail ou WhatsApp.
- Crie chaves no Console Anthropic e na plataforma de API da OpenAI; assinatura de chat não é chave de API, e cobranças são independentes. Configure apenas em **Railway → sansa-os → sansa-os-api → Variables**.
- Segurança: modelos recebem nome, segmento, sinais gerais e canal, não telefone/e-mail do contato. Trate nomes públicos como dados não confiáveis.

## CRM Google Sheets na Railway (sem arquivo)
A aplicação também aceita `GOOGLE_SERVICE_ACCOUNT_JSON` como variável de ambiente privada contendo o JSON integral de uma service account Google Cloud. Compartilhe a planilha original com **somente leitor** para o `client_email` da service account; habilite a Google Sheets API no projeto Google Cloud.
Mantenha `GOOGLE_SHEET_ID` apontando para a planilha existente. A sincronização continua somente leitura e executada manualmente pelo painel em `POST /api/crm/sync`. Não comite o JSON, não o compartilhe neste chat e não cole credenciais em `.env.example`.

## Runtime de agentes — worker separado da API
O serviço Railway `sansa-os-agents` executa duas rotinas em ciclo diário e faz chamadas **somente pela rede privada** da Railway:
- `GET /api/agents/work-items`: fila elegível, somente depois de uma sincronização recente (até 7 dias) do CRM oficial. Não retorna contatos do CRM para o worker. Exclui empresas já cadastradas no CRM, recusas sem tratamento, e oportunidades com alguma proposta anterior.
- `POST /api/agents/run-report`: registra o status diário (concluído, bloqueado ou falha) do Comercial ou de Operações, com contagens e auditoria.
- `GET /api/agents/runs`: últimas execuções reais.

O worker pode gerar **no máximo três rascunhos por execução** para empresas já selecionadas manualmente no Radar e com canal comercial cadastrado. Usa o endpoint de propostas do backend, que aplica Claude/GPT se houver chaves ou regras se não houver. **Não envia WhatsApp, e-mails, nem faz uma nova busca externa**, e não interfere na automação diária já existente no ChatGPT. Sem CRM autorizado e recente, é bloqueado por segurança. A aba Agentes reflete a última execução verificada, não o fato de haver prompts em um repositório.
