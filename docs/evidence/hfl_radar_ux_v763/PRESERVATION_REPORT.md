# Preservação científica

Snapshot anterior à implementação: `preservation_before.json`, criado por
`scripts/check_preservation.py --snapshot`. Abrange Radar original, recovery-01,
registro e áreas prospectivas previstas pelo verificador existente.

Conferência antes da regressão completa: `changes: []`, `violations: []`.
`consolidation_v75.json` contém `ok: true`, sem missing, violações ou divergências;
`protocol_v76.json` contém `errors: []`. A conferência final será repetida após
a suíte, preservando ambas as evidências.

O diff de implementação se limita a apresentação, mapas de páginas/estáticos,
scripts de teste, teste de UI e documentação. Os handlers científicos de
`dashboard/server.py` não mudaram; `radar_api.py`, `platform_api.py`,
`global_pm_api.py`, `portfolio_api.py`, `src/`, runners, validadores e contratos
permanecem idênticos à base `a5c07fb`.

Dados oficiais conferidos por API de leitura com verificação de hashes:
recovery-01 COMPLETED/OFFICIAL; PETR4 COMPRA, VALE3 VENDA, ITUB4 COMPRA,
WEGE3 MANTER, BBAS3 MANTER por veto determinístico. V1 permanece
`REJECTED_BY_VALIDATOR`, V2 `VALID_PROPOSAL`. O incidente original mantém
identidade/classificação próprias. `official_results.json` é uma evidência
de leitura, não um novo resultado científico.

Não executados: chamadas Gemini, inferências pagas, reexecução real do Radar,
paper trading, operações financeiras, Final Test H2, campanhas/freeze V7.5/V7.6
ou push. Fluxos de escrita da UI só foram exercitados com respostas interceptadas
antes do transporte. Testes científicos existentes usam seus ambientes temporários
e doubles; seus resultados não são novos experimentos oficiais.
