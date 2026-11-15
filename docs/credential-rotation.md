# Configuração e recuperação de integrações

`GET /api/integrations/health` é uma rota interna protegida por `x-api-key`. Retorna somente nomes das variáveis ausentes/inválidas, alertas e estados `disabled`, `incomplete`, `configured`. Não realiza chamadas externas nem retorna valores de variáveis.

`configured` significa configuração presente e validada estruturalmente; não comprova autorização no provedor. A credencial Google em arquivo ainda precisa ser legível e válida no momento da sincronização. Consulte a última sincronização do CRM e do Zoho e execute uma sincronização manual para verificar acesso. Uma sincronização anterior não garante que uma credencial recém-rotacionada funcione. O webhook Meta exige evento real com assinatura válida para comprovar recebimento. Ausência de configuração nunca habilita envio.

## Rotação e recuperação

1. Identifique a integração e os serviços consumidores, sem copiar valores para issues, logs, PRs ou chat. Se houver suspeita de vazamento, revogue a credencial imediatamente no provedor.
2. Crie uma credencial substituta com privilégio mínimo. Para Google Sheets, mantenha a planilha existente compartilhada como leitor; para Zoho, use senha de aplicativo; para Meta, mantenha o vínculo existente do número e do aplicativo.
3. Atualize somente as variáveis privadas do serviço API na Railway. Ao trocar `INTERNAL_API_KEY`, atualize também os consumidores internos (frontend e worker) em uma janela coordenada. Nunca use prefixo `NEXT_PUBLIC_` para segredos.
4. Reinicie os consumidores se necessário e confira o endpoint interno. Faça uma sincronização manual ou evento de teste autorizado e registre apenas horário, resultado e identificador não sensível. Não envie mensagens para testar esta rotina.
5. Revogue a chave antiga após validar a substituta, quando não tiver sido revogada no início. Remova cópias temporárias e revise o histórico de acesso do provedor.
6. Se falhar, mantenha a integração desabilitada e corrija permissões/configuração. Não restaure uma credencial comprometida. Uma nova credencial exige nova validação real.

Nunca registre JSON Google, tokens Meta, senha Zoho, cabeçalhos de autenticação ou URLs contendo segredos. O endpoint não retorna e-mails, IDs de planilha, caminhos de arquivos ou conteúdo do CRM.

## IA e variáveis públicas

O diagnóstico inclui `ai`: sem chave privada OpenAI, `disabled`; com chave,
`configured`. Confirme acesso usando o teste explícito de conexão da IA,
que pode consumir créditos. Este healthcheck não chama o provedor.

O alerta `public_secret_variable` detecta aliases dos segredos conhecidos com
prefixos `NEXT_PUBLIC_`, `VITE_` e `PUBLIC_`, sem retornar nomes dinâmicos ou
valores. Não habilita a integração nem corrige a exposição automaticamente.
Remova o alias público, revogue a chave exposta, configure a substituta apenas
no servidor e reconstrua o frontend para remover o valor do bundle novo.
Bundles antigos podem continuar em caches: apagar a variável não substitui a
revogação. A API enxerga apenas seu próprio ambiente; confira também frontend,
worker e histórico do repositório. Este checklist não é uma auditoria completa.
