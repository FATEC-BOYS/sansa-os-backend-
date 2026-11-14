# Simulação interna de orçamento — PRICE-01

Estas rotas usam a chave interna da API. Valores de custo, imposto e margem devem ser informados pela fundadora; não há tabela padrão ou alíquota presumida. A referência de origem é uma declaração do operador, não comprovação de aprovação/autoria por usuário (SEC-02 continua pendente).

- `POST /api/sales/pricing/simulate`: calcula sem gravar.
- `POST /api/sales/pricing/estimates`: grava nova simulação pendente e auditoria na mesma transação. O ID e a data são retornados; o registro fica na fila `/api/approvals`. Cada salvamento cria outra versão, sem sobrescrever a anterior. As rotas de edição comercial não aceitam o tipo `pricing_simulation`.

Todos os campos são obrigatórios, incluindo zeros explícitos e `proposedPriceCents: null` se não houver preço para avaliar:

```json
{
  "parameterVersion": "exemplo-sintetico-v1",
  "scenario": "Exemplo de cálculo, não oferta SANSA",
  "sourceReference": "Dados fictícios para documentação",
  "disciplines": [{"name":"Design","minutes":120,"hourlyCostCents":5000}],
  "allocatedFixedCents":1000,
  "toolsCents":1000,
  "riskBps":0,
  "taxBps":1000,
  "targetMarginBps":2000,
  "proposedPriceCents":null,
  "requestedDiscountBps":0,
  "maxDiscountBps":500
}
```

Moeda: BRL em centavos inteiros. Tempo em minutos. Percentuais em pontos-base (100 bps = 1%). Custos por disciplina são arredondados para cima no centavo; risco incide sobre mão de obra + fixos alocados + ferramentas. Imposto é o percentual informado sobre o preço de venda. Margem também é percentual sobre o preço, sem confundir margem com acréscimo sobre custo.

- Custo da disciplina = teto(minutos × custo/hora ÷ 60).
- Custo total = mão de obra + fixos + ferramentas + reserva de risco.
- Preço mínimo de equilíbrio = teto(custo total ÷ (1 − imposto)).
- Preço alvo = teto(custo total ÷ (1 − imposto − margem alvo)).
- Simulação com desconto = piso(preço proposto × (1 − desconto solicitado)).
- Resultado proposto = preço − teto(imposto sobre preço) − custo total.

No exemplo, custo total = 12000 centavos, equilíbrio = 13334 e alvo = 17143. A reserva de risco é tratada como custo reservado. O preço mínimo não inclui lucro desejado. Custos zero geram alerta para revisão; imposto + margem ≥ 100% é inválido.

O resultado inclui parâmetros completos, versão da fórmula e hash SHA-256 dos parâmetros normalizados. Alertas sinalizam prejuízo e desconto acima do limite informado. O limite é uma referência de simulação, não autorização: qualquer desconto exige aprovação humana, mesmo abaixo dele. Aprovar o registro na fila significa revisão interna, não aplicação de preço, contrato ou desconto. Nenhum cálculo modifica propostas, envia mensagem, gera cobrança ou garante disponibilidade de agenda.

A interface da calculadora no painel e políticas comerciais reais ainda precisam ser definidas. O endpoint não valida legislação tributária nem substitui os parâmetros fornecidos pela fundadora/contabilidade.
