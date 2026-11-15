# Briefing, custos e versões de proposta

## Uso pelo painel

Em Propostas comerciais, a esteira principal tem três etapas:

1. Salvar o briefing (inclusive incompleto), com vínculo opcional a um contato
   existente do CRM. A planilha não é alterada. Para criar uma proposta, confirme
   empresa, objetivo com o cliente, público e entregáveis. Orçamento e referência
   são opcionais. Permissão de contato não equivale a opt-in de marketing.
2. Informar custos reais e confirmar os parâmetros. Cada cenário salvo contém
   horas por disciplina, custo/hora, despesas alocadas, ferramentas, impostos,
   reserva de risco e margem. Zeros são permitidos somente quando preenchidos.
3. Escolher um cenário da revisão atual, digitar investimento final, validade,
   prazo e condições. Conferir comercialmente e criar uma versão para revisão na
   Central de Aprovações. Desconto exige confirmação específica. Investimento
   abaixo do custo líquido é recusado: revise o escopo ou os parâmetros.

O PDF pode ser baixado como rascunho, identificado como tal. Depois da revisão
na Central de Aprovações, o cabeçalho indica aprovação **interna**, sem aceite
contratual. Atualize o status das versões para ver a decisão. Cada versão guarda
seu conteúdo e o briefing de origem; alterações exigem nova versão. A comparação
lado a lado permite conferir uma versão com a mais recente.

O formulário é mantido ao alternar abas do painel. O botão Salvar grava o
briefing no servidor; salvar é necessário antes de fechar/recarregar a página.
Uma revisão concorrente retorna 409, sem sobrescrever o trabalho de outra sessão.
Edição do briefing invalida os cenários antigos para novas propostas, mas não
apaga propostas nem PDFs anteriores.

## Cálculo v1

- Custo de cada disciplina = teto(minutos × custo/hora em centavos ÷ 60).
- Subtotal = soma das disciplinas + fixos alocados + ferramentas.
- Reserva = teto(subtotal × risco em pontos-base ÷ 10.000).
- Custo total = subtotal + reserva.
- Mínimo sem margem = teto(custo total ÷ (1 − imposto)).
- Recomendado = teto(custo total ÷ (1 − imposto − margem alvo)).

Todos os tetos são em centavos. A aritmética intermediária usa BigInt; resultados
acima de R$ 1 milhão são recusados. Imposto e margem somam menos de 100%. O risco
é sobre o custo; imposto/margem são sobre a receita. Não se trata de escolha de
alíquota nem recomendação fiscal: os parâmetros são informados pelo operador.

## Persistência e autorização

Modelos aditivos `Briefing`, `Estimate` e `ProposalVersion`; `Approval` ganha
referência opcional única à versão. Deploy usa o `prisma db push` já existente.
Antes dele, `commercial-preflight.sql` prepara a coluna nova e seu índice único
de forma idempotente em instalações existentes. Duplicatas causam falha; nenhum
registro é apagado e não se usa `--accept-data-loss`.
Nenhuma tabela antiga é removida. API continua protegida por `x-api-key`; proxy
do Next usa a credencial privada e o middleware do painel exige autenticação.
O sistema atual tem um painel administrativo único, sem acesso por cliente.

Snapshots não recebem PATCH/DELETE. A edição genérica de rascunhos não modifica
aprovações de versões. O número é alocado dentro da transação que bloqueia a
linha do briefing; falhas revertem a reserva de número. A estimativa é conferida
pelo servidor quanto ao briefing e à revisão. O cálculo é refeito a partir dos
parâmetros salvos, em vez de confiar em preço enviado pelo navegador.

O PDF usa texto selecionável, fontes PDF padrão e paginação A4. Não é PDF/UA
etiquetado nem assinatura digital; glifos fora do repertório padrão são
substituídos por `?`. Exportar não envia mensagem, não emite cobrança e não
atualiza um contrato. Fontes comerciais não são incluídas.

## Verificação

`node --import tsx --test src/lib/*.test.ts` cobre validação, cálculo, arredondamento,
limites, desconto e paginação PDF. Para teste integrado, em **banco de teste**:

```
DATABASE_URL=<postgresql-de-teste> npm run db:push
TEST_DATABASE_URL=<mesmo-banco> node --import tsx --test tests/commercial.integration.test.ts
```

O CI cria PostgreSQL descartável para esse teste. Cobertura: reabertura,
concorrência de revisão, desconto, margem negativa, versões simultâneas,
imutabilidade, PDF, cenário desatualizado e tentativa de usar cálculo de outro
briefing. O teste usa clientes fictícios e não chama provedores externos.
