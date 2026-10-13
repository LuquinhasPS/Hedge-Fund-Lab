# HFL Premium V7.6.4 — Portfolio UX & Paper Monitoring Foundation

Implementação funcional de UX-M5 e da consulta HFL-PAPER-001, em 13/10/2026.
A carteira multiativos oficial ainda é um **snapshot hipotético consultivo**, não um ledger prospectivo. O acompanhamento H2 lê cinco carteiras persistidas independentes. Nenhuma operação ou inferência foi executada por esta entrega.

## Uso

```powershell
.venv/Scripts/python.exe -B scripts/serve_dashboard_keyless.py 8116
```

- `/portfolio#visao-geral`: patrimônio e caixa da fonte selecionada.
- `/portfolio#posicoes`: posições e sessões reconciliadas.
- `/portfolio#global-workflow`: inferências oficiais V1/V2, motivos, projeção, evidências.
- `/portfolio#simulador`: fixtures V5/V6 isoladas.
- `/portfolio#evidencias`: operações e linha do tempo da carteira selecionada.
- `/paper?wallet=h2%3Aai#acompanhamento`: acompanhamento H2 somente leitura.
- `?analysis=<registro>` abre a decisão; `?wallet=<id>` seleciona a carteira. `?run=` do Radar permanece na URL.

V1: **REJECTED_BY_VALIDATOR**. V2: **VALID_PROPOSAL**, caixa-alvo 100%, zero operações. H2 supervisionada: **EXPIRADA** após 10h BRT de 13/10, sem aprovação ou execução registrada. H2 original: intenção pendente, última marcação 09/10. Não houve compra retroativa.

## Documentação

| Documento | Conteúdo |
|---|---|
| [PORTFOLIO_ARCHITECTURE.md](PORTFOLIO_ARCHITECTURE.md) | arquitetura anterior/nova e contrato GET |
| [GLOBAL_PM_HISTORY.md](GLOBAL_PM_HISTORY.md) | registros primários V1/V2 e datas |
| [PORTFOLIO_INFORMATION_HIERARCHY.md](PORTFOLIO_INFORMATION_HIERARCHY.md) | navegação e divulgação progressiva |
| [PAPER_MONITORING.md](PAPER_MONITORING.md) | consulta implementada e bloqueios operacionais |
| [PAPER_DATA_SOURCE_AUDIT.md](PAPER_DATA_SOURCE_AUDIT.md) | inventário por recurso, persistência e efeitos |
| [PORTFOLIO_PROVENANCE.md](PORTFOLIO_PROVENANCE.md) | isolamento, preços e datas |
| [DEMONSTRATION_SEPARATION.md](DEMONSTRATION_SEPARATION.md) | cenários didáticos independentes |
| [COMPONENT_CATALOG.md](COMPONENT_CATALOG.md) | componentes compartilhados |
| [INTERACTION_TESTS.md](INTERACTION_TESTS.md) | testes funcionais e Chrome |
| [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md) | verificações e limites WCAG |
| [VISUAL_REGRESSION.md](VISUAL_REGRESSION.md) | capturas reais e correções |
| [REGRESSION_REPORT.md](REGRESSION_REPORT.md) | suíte, baseline e diferença 15/14 |
| [PRESERVATION_REPORT.md](PRESERVATION_REPORT.md) | snapshots e preservação |
| [NEXT_STEPS.md](NEXT_STEPS.md) | contrato operacional futuro e pendências |

Validação direcionada: **55 passed, 23 subtests passed**. Adaptador final: **12 passed**. Chrome V7.6.4: **36/36**. A suíte completa será registrada em REGRESSION_REPORT após sua execução, sem edições concorrentes.

Implementado: consulta persistente, seletor, atualização GET, posições, histórico, decisões, proveniência e estados vazios/erro. Pendente: execução prospectiva multiativos, atualização automática e campos financeiros que o ledger H2 não publica. Não se declara monitoramento automático completo.

Base inicial: `888c8d7`. `out.json` já existia não rastreado e permanece do operador. Commits locais de implementação: `e7fa1f1`, `07cecc3`, `41d8cb1`. Sem push.
