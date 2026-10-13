# Regressão geral

Testes direcionados: **43 passed, 59 subtests passed**, um teste de navegador
excluído porque sua jornada foi executada separadamente. Saída bruta: `targeted.txt`.
As primeiras tentativas no sandbox tiveram acesso negado à criação do diretório
temporário pelo Python 3.13/Windows; a repetição fora dessa restrição passou.

Chrome V7.6.3: **52/52**, `ui_checks_completed.json`. Os 113 checks V7.6.2
permanecem incluídos na suíte. Os resultados da regressão completa serão anexados
após sua execução, com arquivos e commits estabilizados e sem edição concorrente.

Baseline V7.6.2: 1750 aprovados e 15 falhas preexistentes efetivas (a saída
histórica bruta tem 16, incluindo uma edição concorrente de roadmap documentada).
Não ajustar selos, expectativas científicas ou baselines para tornar a suíte verde.

A saída completa deve ser gravada inicialmente em diretório ignorado, para não
sujar a árvore durante os testes que exigem Git limpo. `out.json`, já não rastreado
antes da entrega, será excluído somente da consulta de status do processo de
teste via configuração temporária de Git; não será removido, commitado ou alterado.
