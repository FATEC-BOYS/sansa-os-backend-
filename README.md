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
