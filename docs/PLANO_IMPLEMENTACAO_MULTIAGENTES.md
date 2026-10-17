# Plano de implementação com multiagentes — 17/10/2026

Plano para retomar as entregas decididas em 17/10 (DP-29 opção B, DP-30 no
gestor, DP-31) usando agentes em paralelo, com revisão final da sessão
principal. Vincular cada entrega à DP e ao item do [roadmap](ROADMAP.md);
decisões em [DIRECAO_DO_PROJETO](DIRECAO_DO_PROJETO.md).

## Estado em 17/10

| ID | Entrega | DP / item | Estado |
|---|---|---|---|
| T1 | Histórico da WEG: WEGE4 até 31/05/2007, WEGE3 desde 01/06/2007 | DP-29 B / APP-03 | **Concluído 17/10**: WEGE3 desde 02/08/2004 (702 linhas de WEGE4), 0 conflitos; troca 16,10 → 16,70 |
| T2 | Gestor usa caixa com proventos recebidos | DP-30 / APP-05 | **Bloqueado por decisão de Lucas** (A ou B, ver T2); rastreio feito, nenhuma edição |
| T3 | Backtest de regras no Laboratório | DP-31 / Laboratório | Não iniciado (agente interrompido sem alterações) |
| T4 | Pesquisa "munição para os agentes" | DP-27, DP-31 | Não iniciado (agente interrompido sem alterações) |
| T5 | Docs, verificação integrada e commits | — | Após T1–T4 |

Último commit enviado ao PR #1: `947f7db` (proventos). DIRECAO v14 (DP-29 B e
DP-31) e T1 commitadas em 17/10.

## Regras para todos os agentes

- Ler `AGENTS.md` e as DPs citadas antes de editar; menor diff que resolve.
- Cada agente só edita os arquivos listados como seus; reler o arquivo antes
  de cada edição quando outro agente mexe no mesmo.
- Nunca commitar; nunca chamar inferência paga; rede só para as fontes
  autorizadas da tarefa.
- Fim de linha: corrigir para LF **somente** os arquivos que editou
  (`tr -cd '\r' < f | wc -c` deve dar 0; `sed -i 's/\r$//' f`). Nunca usar
  glob: parte do repositório é CRLF de propósito e há verificação por hash.
- Deixar um teste pequeno para lógica nova; testes nunca acessam a rede.
- Relatório final curto: arquivos e linhas, saídas dos checks, limites.

## Ondas

**Onda 1 (paralela, arquivos disjuntos):** T1 (Sonnet), T2 (Sonnet),
T3 (Sonnet), T4 (Opus, esforço alto, só documento).
**Onda 2:** revisão da sessão principal → T5 (Haiku para docs) → commits
separados por entrega e push.

Com orçamento curto, rodar na ordem T1 → T2 → T3 → T4, um por vez.

## T1 — WEG opção B (Sonnet)

Arquivos: `dashboard/market_base_api.py` (aliases/parse/plan/acquire/merged/
coverage), `tests/test_market_base.py`.

- Aliases com data de corte, como dados: ITAU4→ITUB4 até 19/05/2009 (sem
  mudança de comportamento) e WEGE4→WEGE3 até 31/05/2007 com
  `source_symbol`; linhas nativas de WEGE3 antes de 01/06/2007 excluídas na
  leitura (`merged`), registros gravados continuam imutáveis.
- Adquirir os suplementos WEGE4 (2004–2007) pelo `plan`/`acquire` existente
  (rede só para COTAHIST anuais da B3); idempotente.
- Esperado na base real: WEGE3 desde 02/08/2004, 0 conflitos; fechamentos
  16,10 (31/05/2007, WEGE4) → 16,70 (01/06/2007, WEGE3).
- Teste: corte por data, exclusão, ausência de conflito na data sobreposta,
  ITAU4 inalterado.

## T2 — Proventos no gestor (Sonnet)

Arquivos: `dashboard/wallet_manager_api.py`, `tests/test_wallet_manager.py`
(e só se necessário `dashboard/wallet-manager.js`).

- Rastrear contexto do gestor → `compile_proposal` → `application()` →
  `manual.batch`/replay: o livro rejeita compra acima do caixa do livro?
- Se não rejeitar: contexto e prévia usam `cash_available`; a receber
  aparece como não utilizável; caixa do livro visível à parte.
- Se rejeitar: **parar e reportar** as opções (A) lançar proventos recebidos
  no livro de forma idempotente, (B) manter caixa do livro com aviso na
  prévia. A escolha é de Lucas.
- Contextos selados antigos continuam válidos (`checked()`/`contracts()`).

**Achado de 17/10 (rastreio sem edição):** o livro recusa compra acima do
caixa do livro (`manual_portfolio_api.py:343-347`) e o invariante contábil
(`:259-278`) exige `caixa + recebível + custo das posições = capital +
resultado realizado`. `compile_proposal` usa o caixa do livro
(`wallet_manager_api.py:284`, recusa em `:315-316`). Usar `cash_available` só
na prévia faria a prévia aceitar o que a aplicação recusa. Opções:

- **A.** Lançar proventos recebidos no livro como entradas idempotentes
  (chave carteira, ativo, data-com, pagamento): novo tipo de lançamento no
  replay e no invariante; `portfolio_history_api` deixa de somar recebidos ao
  `cash_available` (evitar dupla contagem); muda a revisão da carteira e
  invalida propostas abertas. Correção definitiva; afasta-se do "calculado na
  leitura" da DP-30.
- **B.** Manter o gestor no caixa do livro e mostrar na prévia "proventos
  recebidos ainda não utilizáveis pelo gestor", com o valor informativo.
  Pequeno e consistente; a carteira subutiliza caixa até existir A.

Recomendação do rastreio: B agora, A depois.

## T3 — Backtest de regras (Sonnet)

Arquivos: novo `dashboard/backtest_api.py`, `tests/test_backtest.py`, rota
GET em `dashboard/server.py`, painel no Laboratório (`platform.html` ~linha
78, `product.js` view `laboratory`), `product.css`, bumps `?v=` em
`shell.html` + `tests/test_legacy_web.py`, novo
`tests/backtest_browser_check.mjs`. Pode importar (nunca editar)
`src/backtesting/metrics.py`.

- `GET /api/lab/backtest`: tickers (1–5 dos cinco), pesos (padrão iguais,
  soma 1), início/fim (fim ≤ último pregão fechado), rebalanceamento
  none|monthly|quarterly|annual, custo em bps (0–200), capital (100 mil).
  Validação estrita, 400 com mensagem.
- Preço: `adjusted_close` da base (proventos reinvestidos). Início anterior
  ao primeiro dado de um ativo → 400 nomeando ativo e data. Dias sem negócio
  repetem o último preço e são contados (`stale_days`).
- Simulação com frações, alocação no fechamento do 1º pregão, rebalanceamento
  no 1º pregão de cada período, custo sobre o valor negociado.
- Referências no mesmo período: Ibovespa (normalizado no 1º pregão) e CDI
  (índice 1,0 no 1º pregão); ausente → null com motivo, nunca zero.
- Métricas: retorno total e anualizado, volatilidade, drawdown máximo com
  datas, Sharpe com CDI como livre de risco, rebalanceamentos, custos,
  giro. Mais de 5.000 pontos: gráfico semanal, métricas diárias.
- UI: formulário (padrão: últimos 10 anos), gráfico de retorno acumulado
  (estratégia, Ibovespa tracejado `#58647b`, CDI pontilhado `#85570c`),
  tabela de métricas, notas neutras ("histórico, não previsão; não altera
  carteiras nem o piloto"), tabela acessível, sem rolagem horizontal em 390 px.
- Testes: sem rebalanceamento = buy & hold ponderado; rebalanceamento mensal
  repõe pesos; custo reduz o valor esperado; validações → 400.

## T4 — Pesquisa da munição dos agentes (Opus, esforço alto)

Arquivo único: `docs/PESQUISA_MUNICAO_AGENTES.md` (pt-BR, ~2.500–5.000
palavras). Sem código, sem baixar dados para o repositório, sondagens leves
de APIs públicas permitidas.

Ler antes: DIRECAO inteira (DP-27, DP-31, "Fora do foco"), `src/agents/`,
`scripts/multiasset_radar.py` (`technical_input`), `radar_analysis_api.py`,
`wallet_manager_api.py`, base local (`market_base_api`, `reference_rates_api`,
`dividends_api`).

Responder:
1. Inventário de tópicos com fonte pública, profundidade, defasagem e
   semântica de data (referência × publicação): Copom/Selic, IPCA, PTAX,
   Focus, curva DI; eleições (TSE); resultados e fatos relevantes (CVM);
   proventos; commodities e mercado externo; microestrutura da própria base;
   estatísticas de padrões de preço; setor/pares. Indicar o que foi
   verificado e o que é suposição.
2. Recortes temporais: como definir eventos e quando o rótulo se tornou
   conhecível (eleição é previsível; "crise" quase nunca).
3. Estatística de padrões ("5 de 6 vezes"): definições precisas, taxa base,
   tamanho de amostra, intervalo de Wilson, risco de mineração de dados,
   checagem fora da amostra, cálculo "as-of".
4. Consumo pelos agentes: (A) resumos selados por sessão no input
   congelado, (B) ferramenta sobre API local com corte por data, (C) notas
   curadas — reprodutibilidade, custo, latência, risco de antecipação,
   esforço. Contaminação pelo conhecimento do modelo.
5. Avaliação no TCC: A/B prospectivo com e sem resumos, métricas
   pré-registradas, limites de amostra.
6. Caminho em fases e lista "Decisões para Lucas".

## T5 — Integração (sessão principal + Haiku)

1. Revisar cada diff contra AGENTS.md e as DPs; rodar
   `poetry run pytest tests/test_market_base.py tests/test_reference_rates.py tests/test_dividends.py tests/test_portfolio_history.py tests/test_legacy_web.py tests/test_wallet_manager.py tests/test_manual_portfolio.py tests/test_market_update.py tests/test_radar_network_isolation.py tests/test_stock_history.py tests/test_backtest.py -q`.
2. Servidor de teste: `HFL_MARKET_BASE_AUTOUPDATE=0 poetry run python dashboard/server.py <porta>`;
   rodar `node tests/<x>_browser_check.mjs http://127.0.0.1:<porta> <saída>`
   para personal_charts, comparison, dividends, market_update e backtest;
   revisar capturas desktop e 390 px.
3. Haiku atualiza `docs/ROADMAP.md` e `docs/ESTADO_ATUAL.md` (só acréscimos).
4. Commits separados (WEG; gestor; backtest; pesquisa + DIRECAO v14), sem
   linha de coautoria, e push para o branch do PR #1. Para separar trechos
   misturados no mesmo arquivo, gravar no índice versões filtradas
   (`git hash-object -w` + `git update-index --cacheinfo`).

## Para Lucas

- Agentes de IA rodam pela tela (DP-13); se algo falhar no preparo ou na
  análise, sinalizar para correção.
- Reiniciar o servidor após cada entrega para carregar o código Python novo.
