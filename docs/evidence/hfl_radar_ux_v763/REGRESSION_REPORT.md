# Regressão geral

Testes direcionados: **43 passed, 59 subtests passed**, um teste de navegador
excluído porque sua jornada foi executada separadamente. Saída bruta: `targeted.txt`.
As primeiras tentativas no sandbox tiveram acesso negado à criação do diretório
temporário pelo Python 3.13/Windows; a repetição fora dessa restrição passou.

Chrome V7.6.3 estabilizado: **53/53**, `ui_checks_release.json`. Os 113 checks V7.6.2
permanecem incluídos na suíte. A primeira regressão completa, no commit `fa6384c`, terminou com **1749 passed,
17 failed, 61 subtests passed**, em 14 min 08 s. Saída bruta intacta:
`regression_initial.txt`. Não houve edição concorrente.

Das 17 falhas, 14 coincidem com o baseline efetivo anterior: 7 de PostgreSQL
local desligado, 3 de H2/registro, 2 de listas antigas de preservação e 2 de
expectativas do Radar anteriores à recovery-01. A falha anterior
`test_manifest_adulterado_e_rejeitado[code]` não se repetiu; nenhuma correção
científica foi feita para isso.

As outras três eram de infraestrutura de UI: dois mocks Node sem Window e sem
o novo componente compartilhado, e o download de 16 MB interrompido no Chrome.
Os mocks agora carregam o componente real mantendo as asserções; o export real
é entregue intacto via DevTools. Os três passaram na reexecução
(`ui_verified.txt`: **3 passed**). A regressão completa será repetida com esses
ajustes estabilizados; seu resultado será anexado separadamente.

Baseline V7.6.2: 1750 aprovados e 15 falhas preexistentes efetivas (a saída
histórica bruta tem 16, incluindo uma edição concorrente de roadmap documentada).
Não ajustar selos, expectativas científicas ou baselines para tornar a suíte verde.

A saída completa deve ser gravada inicialmente em diretório ignorado, para não
sujar a árvore durante os testes que exigem Git limpo. `out.json`, já não rastreado
antes da entrega, será excluído somente da consulta de status do processo de
teste via configuração temporária de Git; não será removido, commitado ou alterado.
