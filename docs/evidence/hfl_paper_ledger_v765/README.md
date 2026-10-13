# HFL Premium V7.6.5 — Persistent Paper Ledger

Fundação multiativos com identidade própria e contabilidade V5 reutilizada, qualificada exclusivamente em SQLite temporário/sintético. **Execução paper oficial desabilitada.** Não há inferência paga, ordem real ou promoção de snapshot consultivo. O estado final de aceite será registrado após a regressão geral e preservação final.

| Entrega | Evidência |
|---|---|
| Infraestrutura encontrada/reutilizada | [EXISTING_FINANCIAL_INFRASTRUCTURE.md](EXISTING_FINANCIAL_INFRASTRUCTURE.md) |
| Modelo, eventos, identidades/classificações | [LEDGER_ARCHITECTURE.md](LEDGER_ARCHITECTURE.md), inclui EVENT_SCHEMA |
| SQLite, locks, idempotência, recuperação | [PERSISTENCE_AND_RECOVERY.md](PERSISTENCE_AND_RECOVERY.md) |
| Contabilidade/reconciliação/mutações | [ACCOUNTING_INVARIANTS.md](ACCOUNTING_INVARIANTS.md), inclui RECONCILIATION |
| D+2/calendário/proveniência/valorização | [SETTLEMENT_AND_CALENDAR.md](SETTLEMENT_AND_CALENDAR.md), inclui MARKET_DATA_AND_VALUATION |
| Global PM e fluxo de autorização futuro | [GLOBAL_PM_INTEGRATION.md](GLOBAL_PM_INTEGRATION.md), inclui PAPER_AUTHORIZATION_DESIGN |
| H2 original/supervisionada e jobs | [H2_PENDING_STATE_AUDIT.md](H2_PENDING_STATE_AUDIT.md) |
| GET, páginas, sessões e dashboard | [API_READ_MODELS.md](API_READ_MODELS.md), inclui DASHBOARD_INTEGRATION |
| Testes e capturas reais | [INTERACTION_TESTS.md](INTERACTION_TESTS.md), [VISUAL_REGRESSION.md](VISUAL_REGRESSION.md) |
| Regressão/preservação | [REGRESSION_REPORT.md](REGRESSION_REPORT.md), [PRESERVATION_REPORT.md](PRESERVATION_REPORT.md) |
| Bloqueios/custos futuros/riscos/próxima etapa | [LIMITATIONS.md](LIMITATIONS.md), inclui NEXT_STEPS |

Documentos do pedido foram consolidados por assunto para evitar repetição; todos os contratos e limites estão nos arquivos acima.

Demo: em `/portfolio`, selecionar "Explorar demonstração do ledger persistente · dados sintéticos" ou abrir `/portfolio?demo=1&wallet=synthetic-v765#posicoes`. Cinco sessões históricas de 17–24/04/2026: duas compras, uma venda parcial, três liquidações D+2, patrimônios/posições/caixa por sessão, eventos paginados. Valores finais sintéticos: patrimônio R$ 100.168,28, caixa R$ 91.708,28, custos R$ 11,72, realizado R$ 116,68 e não realizado R$ 51,60. Reinício de processo e servidor preservam dados; GET apenas lê exportação verificada.

H2 em 13/10: original PENDENTE por ausência de processamento/reconciliação da abertura-alvo; não é uma aprovação humana expirada segundo seu contrato. Supervisionada EXPIRADA sem aprovação; ambas sem compra registrada. Não se alterou resultado ou política H2.

Novos componentes: `scripts/paper_ledger.py`, `scripts/qualify_paper_ledger.py`, `dashboard/paper_ledger_api.py`, `tests/test_paper_ledger_v765.py`, `tests/test_ui_v765.py`, `scripts/ui_check_v765.mjs`. Alterações: rota GET em server.py, monitoring.js/css, portfolio.html, texto de monitoring_api.py e jornada Chrome V7.6.4. Nenhum src/ ou arquivo científico selado foi editado.

Commits locais e resultado final da regressão/preservação serão acrescentados após a qualificação; não haverá push. `out.json` não rastreado é do operador e permanece intacto.
