# LLM trading agents and benchmarks: data clock, decision moment and execution price (notes compiled 2026-10-18)

Method: papers read on arXiv (HTML/abs pages); code read directly from shallow clones of the repos: TradingAgents (main @ e8f5503, 2026-10-16), virattt/ai-hedge-fund (main @ 78b779c, 2026-10-02), FINSABER (main @ e72c262, 2026-09-17), FinMem (main), HKUDS/AI-Trader (main, plus the paper-era commit c3cefa3 of 2025-11-20), ulab-uiuc/live-trade-bench (main, last commit 2025-11-21), StockSim (main), FinRobot (main). "Stated" means the source says it. "Inference" means it is my reading and is listed under Inferences. Alpha Arena's official write-up returned HTTP 404 during this research, so its details come from secondary sources and are flagged as such.

## 1. System by system: what the agent sees, when it decides, and at what price the trade is executed or simulated

### Takeaway
Most academic LLM-trading papers never state the fill price. Where it can be recovered from code or return formulas, the 2023–2024 backtests (FinMem, InvestorBench and similar) decide with day-t data and book the close(t)→close(t+1) return. In other words, they "fill" at the same close the agent just observed. Newer systems (2025–2026) have converged on never assessing and executing at the same price:
- TradingAgents (2026) enters "at the first close after" the analysis date.
- ai-hedge-fund executes a decision taken at T's close at T+1's close.
- FINSABER defaults to the next open.
- StockBench and AI-Trader fill at the open.
- Live benchmarks fill at a live last quote (LiveTradeBench, 15:00 ET) or get real exchange fills (Alpha Arena).

### Cited Findings

#### TradingAgents (Yijia Xiao, Edward Sun, Di Luo, Wei Wang; arXiv 2412.20138; v1 28 Dec 2024, v7 3 Jun 2025; "Oral @ Multi-Agent AI in the Real World")
- Authors, dates and venue comment as listed on the abs page. — [arXiv abs 2412.20138](https://arxiv.org/abs/2412.20138)
- Paper data: OHLCV and adjusted close "from January 1st, 2024, to March 29th, 2024". News: "Daily news updates are gathered from diverse sources such as Bloomberg, Yahoo, EODHD, FinnHub, and Reddit". Also social posts with sentiment scores, "Sixty standard technical analysis indicators calculated for each asset", and fundamentals and insider transactions. No per-agent data timestamps are given. — [TradingAgents paper, HTML v7](https://arxiv.org/html/2412.20138)
- On timing, the paper says only: "Agents make decisions based solely on data available up to each trading day, ensuring no future data is used (eliminating look-ahead bias)". It does not say whether decisions are pre-open, intraday or at the close. Signals "are then executed" with no fill price stated, and transaction costs and slippage are not mentioned. — [TradingAgents paper, HTML v7](https://arxiv.org/html/2412.20138)
- Models: gpt-4o-mini and gpt-4o ("quick-thinking"), o1-preview ("deep-thinking"). The authors report about "11 LLM calls & 20+ tool calls" per prediction, which they say limits backtest length.
- Results over the 3-month window: cumulative return 23–27% and Sharpe ratio 5.6–8.2 (AAPL SR 8.21, MDD 0.91%). The authors themselves say the Sharpe ratio is above the expected range and attribute it to "few pullbacks".
- Section 5.1 names Apple, Nvidia, Microsoft, Meta and Google, but Table 1 reports AAPL, GOOGL and AMZN. — [TradingAgents paper, HTML v7](https://arxiv.org/html/2412.20138)
- Repo, v0.7.0 (Oct 2026), stated execution rule: "A decision is entered at the first close after its date, because a run reads news published after that day's close." — [TradingAgents README](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/README.md)
- The same rule appears in `fetch_returns`: "The position is entered at the first close after ``trade_date``: a run dated ``trade_date`` reads news published after that day's close (#1518)." Outcomes are measured over `holding_period_days = 5` trading days "from the first close after the analysis date" as alpha against a regional benchmark. B3 tickers are mapped `".SA": "^BVSP"` (Ibovespa). — [settlement.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/memory/settlement.py); [default_config.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/default_config.py)
- Point-in-time rules in the repo. The module docstring states that "data is served as of the run's date". Requested dates are clamped to the trade date. Dated news, StockTwits and Reddit items are trimmed with "timestamps normalized to UTC, the upper bound exclusive at midnight after ``end``". An undated item is "kept only when the window reaches the present, since a backtest cannot prove it is not from the future". `withhold_live_profile` "withholds present-day snapshots from historical runs." — [date_window.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/dataflows/date_window.py)
- The release history shows look-ahead leaks being fixed only in 2026 — [TradingAgents README](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/README.md):
  - v0.3.1 (2026-07): "Alpha Vantage look-ahead filtering"
  - v0.4.0 (2026-08): "look-ahead / point-in-time fixes across FRED macro, social sentiment, and the decision-log memory … Trader price grounding"
  - v0.5.0 (2026-09): "point-in-time integrity across every dated path, SEC EDGAR fundamentals served as filed"
  - v0.5.2: "backtests that see only data published by each analysis date"
  - v0.7.0 (2026-10): "backtests scored from the first close after each decision"
- Order fields. The Trader's structured proposal has an optional absolute `entry_price`, an optional `stop_loss` and free-text `position_sizing`. The Portfolio Manager emits a five-tier rating ("Buy / Overweight / Hold / …") and an optional `price_target`. Neither emits share quantities. — [schemas.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/agents/schemas.py)

#### FinMem (Yu et al.; arXiv 2311.13743, Nov 2023)
- Identity of the paper. — [arXiv abs 2311.13743](https://arxiv.org/abs/2311.13743)
- In the code, each environment `step()` pops `cur_date`, reads `cur_price = env_data[cur_date]["price"]` and `future_price = env_data[future_date]["price"]`, and builds the reward record as `future_price[symbol] - cur_price[symbol]`. The same step returns that date's news and 10-K/10-Q filings. — [FinMem environment.py](https://github.com/pipiku915/FinMem-LLM-StockTrading/blob/main/puppy/environment.py)
- The price series is Yahoo "Adj Close" ("Downloads adjusted close price data for given tickers"). — [FinMem 04-data_pipeline.py](https://github.com/pipiku915/FinMem-LLM-StockTrading/blob/main/data-pipeline/04-data_pipeline.py)

#### InvestorBench (Haohang Li, Yupeng Cao, Yangyang Yu et al., The Fin AI; arXiv 2412.18174v1, 24 Dec 2024)
- Test windows: stocks 2020-10-01 to 2021-05-06 (MSFT, JNJ, UVV, HON, TSLA, AAPL, NIO); crypto 2023-04-05 to 2023-11-05 (BTC, ETH); ETFs 2020-01-02 to 2020-09-21.
- Inputs: daily OHLCV, momentum (cumulative log returns over k days), news with sentiment labels made by gpt-3.5-turbo-0125, and filings.
- Cumulative return uses ln(p_{t+1}/p_t) times the action on day t (close-to-close).
- Transaction costs are not mentioned, LLM knowledge cutoffs are not discussed, and news/price timestamp alignment is not specified. — [InvestorBench, arXiv HTML](https://arxiv.org/html/2412.18174)

#### FinAgent (Wentao Zhang et al.; KDD '24; arXiv 2402.18485v3, 28 Jun 2024)
- Daily inputs: asset news, daily open/high/low/close/adjusted close, Kline and trading-chart images, Seeking Alpha "expert guidance", and monthly and quarterly reports.
- Train 2022-06-01→2023-06-01, test 2023-06-01→2024-01-01, with daily buy/sell/hold actions.
- The reward "accounts for a commission fee", but no rate is given. The fill price (same close or next open) is not stated in the part of the paper read, and leakage is not discussed. — [FinAgent, arXiv HTML](https://arxiv.org/html/2402.18485)

#### FinCon (Yangyang Yu, Zhiyuan Yao, Haohang Li et al.; arXiv 2407.06567v3, 7 Nov 2024)
- Inputs: prices, daily news, 10-Q/10-K filings and earnings-call audio (transcribed with Whisper), Jan 3, 2022 – Jun 10, 2023. Train Jan 3 – Oct 4, 2022; test Oct 5, 2022 – Jun 10, 2023. GPT-4-Turbo at temperature 0.3.
- Portfolio mode: the manager sets buy/sell/hold direction per stock, and weights come from an external mean-variance optimizer with shrinkage estimates, rebalanced daily.
- The main text gives no fill price and no transaction costs, and does not discuss leakage. — [FinCon, arXiv HTML](https://arxiv.org/html/2407.06567)

#### StockAgent (Chong Zhang et al.; arXiv 2407.18957 v5)
- Simulated market. Each day has pre-trading, trading-session and post-trading phases. Orders enter an order book, and a trade happens when a bid and an ask coincide. Agents set both price and quantity. "Stock prices are updated to the price of the last transaction in this session." The prompts include the current session's buy and sell orders.
- To block prior knowledge, the stocks are anonymized as "Stock A" and "Stock B".
- Fees: 0.005 per share, minimum 1, maximum 5.95. — [StockAgent, arXiv HTML](https://arxiv.org/html/2407.18957)

#### FinRobot (AI4Finance Foundation; arXiv 2405.14767)
- Its quantitative tool `BackTraderUtils.back_test` wraps Backtrader (Cerebro, a default `SMA_CrossOver` strategy, Sharpe, DrawDown and Returns analyzers). No `set_coc`/cheat-on-close call was found in the repo. — [FinRobot quantitative.py](https://github.com/AI4Finance-Foundation/FinRobot/blob/master/finrobot_autogen/finrobot/functional/quantitative.py)

#### QuantAgent (2025), renamed QuantHarness (Fei Xiong, Xiang Zhang, Aosong Feng, Siqi Sun, Chenyu You; arXiv 2509.09995)
- v3 was titled "QuantAgent: Price-Driven Multi-Agent LLMs for High-Frequency Trading". — [arXiv HTML v3](https://arxiv.org/html/2509.09995v3)
- v4 (27 Jul 2026) is titled "QuantHarness". Setup:
  - Data: 4-hour and 1-hour OHLC; 100 segments of 100 consecutive candles per asset, of which the model sees 97 ("the last three are withheld … to prevent test-time leakage").
  - Assets: BTC/USD, CL, DJI, ES, NQ, QQQ, SPX, VIX, plus DAX at 1h.
  - Scoring: against the next three candles, with a fixed 0.05% stop-loss and an LLM-set take-profit. The entry price is not stated and costs are not mentioned.
  - Design choice: price-only inputs, because text "lags price discovery". — [QuantHarness, arXiv HTML](https://arxiv.org/html/2509.09995)

#### TradExpert (Qianggang Ding, Haochen Shi, Jiadong Guo, Bang Liu; arXiv 2411.00782v2, 13 May 2025)
- Inputs: daily OHLCV for the past 20 days, news, 108 alpha factors and quarterly fundamentals. Labels are the day t+1 rise or fall.
- Trading simulation: "a Buy-and-Hold trading strategy on the Top-K stocks ranked by TradExpert" (DOW 30, 2023). No fill price and no costs are stated.
- The training rationales were "pre-generated by the OpenAI GPT-4 API using instructions and prompts that incorporate the actual stock movements". — [TradExpert, arXiv HTML](https://arxiv.org/html/2411.00782)

#### Alpha-GPT 2.0 (Hang Yuan, Saizhuo Wang, Jian Guo; arXiv 2402.09746, 15 Feb 2024)
- The abstract describes a "Human-in-the-Loop strategy throughout the entire quantitative investment pipeline" but gives no execution or cost conventions. — [arXiv abs 2402.09746](https://arxiv.org/abs/2402.09746)

#### LLM "portfolio manager" systems that size positions
- **ai-hedge-fund (virattt, 2026), timing rule:**
  - session.py states: "A decision assessed at session T's close is executed at the NEXT advanced session's close (T+1) … Nothing is ever assessed and executed against the same close."
  - Rebalance sessions are decided "from the session and the previous one only … the rule must be computable on a live tick, so backtest and paper agree by construction."
  - The backtest and paper-trading modes call the same `advance()` function. — [ai-hedge-fund session.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/pipeline/session.py)
- **ai-hedge-fund, fund backtest and broker:**
  - The fund backtest docstring lists "point-in-time data, next-close execution, reconciliation" as true "by construction — and identical to what a paper fund does". — [fund.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/backtesting/fund.py)
  - The SimBroker "Fills every order completely, exactly at the order's reference price … Slippage/costs are a declared future addition inside place_order". Also: "Margin is not modeled: cash may go negative and stays visible … floor-toward-zero sizing". — [sim.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/brokers/sim.py)
- **ai-hedge-fund, single-ticker alpha engine (contrast):** it uses "Fill a position at entry/exit closes with equal-dollar sizing", with the entry at the close of the same date `d` the model was called on. — [engine.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/backtesting/engine.py)
- Look-Ahead-Bench runs "the open-source AI Hedge Fund framework" with monthly portfolio decisions on AAPL, MSFT, GOOGL, NVDA and TSLA. — [Look-Ahead-Bench, arXiv 2601.13770](https://arxiv.org/html/2601.13770)
- StockBench converts "dollar targets into share quantities based on the opening price". — [StockBench, arXiv HTML](https://arxiv.org/html/2510.02209)
- LiveTradeBench agents output allocations. The code converts each target value to `quantity = target_value / price`, using a `price_map` built from `current_price`, which gives fractional shares. — [stock_account.py](https://github.com/ulab-uiuc/live-trade-bench/blob/main/live_trade_bench/accounts/stock_account.py); [stock_system.py](https://github.com/ulab-uiuc/live-trade-bench/blob/main/live_trade_bench/systems/stock_system.py)

#### Benchmarks that backtest inside post-cutoff windows
- **StockBench** (Yanxu Chen, Zijun Yao, Yantao Liu, Amy Xin, Jin Ye, Jianing Yu, Lei Hou, Juanzi Li; Tsinghua/BUPT; arXiv 2510.02209, v2 2 Mar 2026). Source for this whole entry: [StockBench, arXiv HTML](https://arxiv.org/html/2510.02209).
  - Universe and period: 20 DJIA stocks, Mar 3 – Jun 30, 2025 (82 trading days).
  - Timing: decisions are made "at market open" and sized with the opening price.
  - Inputs: "up to five recent news articles from the previous 48 hours"; market cap, P/E, dividend yield and the 52-week range; and the agent's own past 7 days of actions. "We also retain the timestamps of the collected data to prevent leakage of future information to the agent."
  - Leakage claim: "This period also falls after the knowledge cutoff of mainstream LLMs, ensuring no data leakage."
  - Limitations, as stated: no "trading costs, slippage, or liquidity limits, which makes trading easier than in real markets"; "intraday and event-driven strategies are not tested".
  - Results: equal-weight buy-and-hold returned 0.4% (MDD −15.2%). Kimi-K2 was best at 1.9% (MDD −11.8%) and GPT-5 returned 0.3%.
- **FINSABER** (Weixian Waylon Li, Hyeonjun Kim, Mihai Cucuringu, Tiejun Ma; arXiv 2505.07078v6; KDD '26):
  - Paper: commission at Moomoo's US rate, "$0.0049/share with a $0.99 minimum per order", and a risk-free rate of 0.03. The paper does not state the fill price. — [FINSABER, arXiv HTML](https://arxiv.org/html/2505.07078)
  - Repo `TradeConfig` defaults: `execution_timing: str = "next_open"` (only "same_close" or "next_open" are allowed), `slippage_perc: float = 0.0`, `slippage_impact: float = 0.0`, and a 1% maximum commission rate. — [trade_config.py](https://github.com/waylonli/FINSABER/blob/main/backtest/toolkit/trade_config.py)
  - "same_close" is implemented by turning on Backtrader's cheat-on-close (`cerebro.broker.set_coc(True)`). There is also an optional volume-based fill limit (`MovingAverageVolumePercFiller`). — [finsaber_bt.py](https://github.com/waylonli/FINSABER/blob/main/backtest/finsaber_bt.py)

#### Live and real-time evaluations
- **LiveTradeBench** (Haofei Yu, Fenghai Li, Jiaxuan You; UIUC; arXiv 2511.03628, 5 Nov 2025):
  - Paper: live run Aug 18 – Oct 24, 2025 (50 trading days) on 15 US stocks and ETFs plus cash, and 10 Polymarket markets. News comes from Google News (titles and abstracts). The paper says the stock inputs are closing prices. The portfolio is revalued at p_{t+1}, "without modeling low-level order execution mechanics". It does not account for "transaction fees, bid–ask spreads, liquidity constraints" and says this may overestimate returns, especially under frequent rebalancing. — [LiveTradeBench, arXiv HTML](https://arxiv.org/html/2511.03628)
  - Code config: `"trading_cycle": "daily_before_close"`, `"run_before_close_minutes": 60`, `"realtime_prices": 600` (10 minutes). — [config.py](https://github.com/ulab-uiuc/live-trade-bench/blob/main/backend/app/config.py)
  - Code schedule: a cron job runs Mon–Fri at "3:00 PM EDT/EST". — [main.py](https://github.com/ulab-uiuc/live-trade-bench/blob/main/backend/app/main.py)
  - Code price source: `get_current_price` returns yfinance `fast_info.last_price`. — [stock_fetcher.py](https://github.com/ulab-uiuc/live-trade-bench/blob/main/live_trade_bench/fetchers/stock_fetcher.py)
- **AI-Trader** (Tianyu Fan, Yuhao Yang, Yangqin Jiang, Yifei Zhang, Yuxuan Chen, Chao Huang; HKU; arXiv 2512.10971, 1 Dec 2025):
  - Paper: Nasdaq-100 at hourly frequency (Oct 1 – Nov 7, 2025), SSE-50 daily, and 10 crypto pairs daily (Nov 1–14, 2025). "Check Price" returns data "based on the current simulated time", and search is "strictly limited to information available up to the current simulated time". The Trade tool enforces lot sizes and rejects orders above available liquidity. The paper does not state the fill price or costs. — [AI-Trader, arXiv HTML](https://arxiv.org/html/2512.10971)
  - Code at the paper-era commit (2025-11-20): `tool_trade.py` says "Get stock opening price for the day" and calls `get_open_prices(today_date, …)`. — [tool_trade.py @ c3cefa3](https://github.com/HKUDS/AI-Trader/blob/c3cefa31ae85727746cd65296d276f4ff81fb062/agent_tools/tool_trade.py)
  - `get_open_prices` accepts "YYYY-MM-DD或YYYY-MM-DD HH:MM:SS" and reads the bar's `"1. buy price"` field, which its docstring calls the opening price (开盘价). — [price_tools.py @ c3cefa3](https://github.com/HKUDS/AI-Trader/blob/c3cefa31ae85727746cd65296d276f4ff81fb062/tools/price_tools.py)
  - The README at that commit says: "AI can only access market data from current time and before. No future information allowed." — [README @ c3cefa3](https://github.com/HKUDS/AI-Trader/blob/c3cefa31ae85727746cd65296d276f4ff81fb062/README.md)
  - The 2026 live platform charges `TRADE_FEE_RATE = 0.001` per trade. — [fees.py](https://github.com/HKUDS/AI-Trader/blob/main/service/server/fees.py)
- **Agent Market Arena** (Lingfei Qian … Alejandro Lopez-Lira … Jimin Huang, Sophia Ananiadou; arXiv 2510.11695v2, 30 Oct 2025). Source for this entry: [AMA, arXiv HTML](https://arxiv.org/html/2510.11695).
  - Setup: live Aug 1 – Sep 30, 2025 on BTC, ETH, TSLA and BMRN. Agents get identical daily inputs ("verified market data and the summarized news") and trade daily at "the same fixed time" (time of day not given).
  - Pricing: returns are computed from daily closes, and no fee or slippage model is given; the dashboard shows returns "with and without fees".
  - Agents: InvestorAgent, TradeAgent, HedgeFundAgent (with portfolio and risk managers) and DeepFundAgent.
- **DeepFund** (Changlun Li, Yao Shi, Yuyu Luo, Nan Tang; HKUST-GZ; arXiv 2503.18313v2, 26 Jun 2025, titled "Will LLMs be Professional at Fund Investment? DeepFund: A Live Arena Perspective"):
  - The environment serves "current market data, news, and financial information on a day-by-day basis". A planner, four analysts and a manager produce buy/hold/sell.
  - Decision time, fill price and costs are not specified, and the version read reports no results. — [DeepFund, arXiv HTML](https://arxiv.org/html/2503.18313)
- **Alpha Arena (nof1.ai), from secondary sources only.** The official post "Exploring the Limits of Large Language Models as Quant Traders" (Oct 20, 2025) is listed at nof1.ai/blog/TechPost1. — [awesome-alpha-arena list](https://github.com/kukapay/awesome-alpha-arena)
  - That URL and nof1.ai/blog both returned HTTP 404 during this research.
  - Season 1: about Oct 18 – Nov 3, 2025, with $10,000 of real capital per model in crypto perpetuals on Hyperliquid. — [ForkLog, via search summary](https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/amp)
  - The assets were BTC, ETH, SOL, BNB, DOGE and XRP. — [awesome-alpha-arena list](https://github.com/kukapay/awesome-alpha-arena)
- **StockSim** (Charidimos Papadakis et al., NTUA; arXiv 2507.09255, 12 Jul 2025):
  - In the LLM experiment, GPT-o4-mini and GPT-o3 traded NVDA daily, Apr 28 – Jun 28, 2025, "with orders placed before market open", in candlestick mode.
  - In candlestick mode an order fills only if its price lies within the bar's range. — [StockSim, arXiv HTML](https://arxiv.org/html/2507.09255)

#### Reference convention from the finance literature (Lopez-Lira & Tang, arXiv 2304.07619, v1 Apr 2023, v6 28 Oct 2025)
- News is classed as overnight when released "either before 9 a.m. or after 4 p.m. on a trading day" (about 82% of headlines) or intraday (18%).
- Fill rule: "if a piece of news is released before 9 a.m. on a trading day, we enter the position at the market opening and exit at the close of the same day. If the news is announced after the market closes, we assume we enter the position at the next opening price and exit at the close of the next trading day. All strategies are rebalanced daily."
- The abstract reports about 90% hit rates for "the non-tradable initial reaction". — [Lopez-Lira & Tang, arXiv 2304.07619 (PDF v6)](https://arxiv.org/abs/2304.07619)

### Inferences
- Five conventions appear in the sources:

| Convention | Who uses it (evidence above) | Main problem |
|---|---|---|
| A. Decide with data through close(t), fill at close(t) | FinMem (reward close(t)→close(t+1)); InvestorBench (CR formula); FINSABER `same_close` option; ai-hedge-fund single-ticker engine | The fill is a price the agent already saw. It is unattainable once the decision takes time to make. |
| B. Decide after close(t), fill at open(t+1) | FINSABER default; Lopez-Lira & Tang (overnight news); StockSim (orders before the open); Backtrader-based tools (FinRobot), assuming Backtrader's default next-bar fill (not re-checked here) | Gap risk is real, but the fill is tradable and reproducible from daily bars. |
| C. Decide at/after close(t), fill at close(t+1) ("first close after") | TradingAgents v0.7.0; ai-hedge-fund fund pipeline | Conservative; the decision can be made at any time during t+1; reproducible from daily bars. |
| D. Decide at open(t), fill at open(t) | StockBench; AI-Trader (open of the current daily or hourly bar) | Only valid if the agent saw nothing after the open. In hourly mode it is unclear whether the bar's later prices were visible. |
| E. Decide intraday with a live quote, fill at that quote (or a real fill) | LiveTradeBench (15:00 ET, yfinance last price); Alpha Arena (Hyperliquid); AI-Trader 2026 platform | Realistic, but not reproducible unless the quote and its timestamp are archived. Latency and staleness are unmodeled. |

- The TCC's current rule (features from closes up to t−1, trade recorded at close(t−1)) is convention A applied to the previous session. The last data point in the features is also the fill price. ai-hedge-fund explicitly forbids exactly this ("Nothing is ever assessed and executed against the same close"), and FINSABER offers it only as the non-default cheat-on-close mode.
- In forward use, close(t−1) can no longer be traded when the human approves during session t. Booking at it also credits the portfolio with the overnight gap, which Lopez-Lira & Tang explicitly treat as "non-tradable". It also gives the approver a way to select trades: they can see day t's move and still "buy at yesterday's close".
- Conventions B (open(t)) and C (close(t)) both fit a daily-feature pipeline. Both are reproducible from the same Yahoo daily bars used to compute the features, and both have strong precedents: B in FINSABER and Lopez-Lira; C in TradingAgents and ai-hedge-fund. Convention E (the ~15-minute-delayed Yahoo quote at approval time) mirrors LiveTradeBench. It needs the quote, the quote timestamp and the approval timestamp stored, because it cannot be reconstructed from daily bars afterwards.
- TradingAgents' midnight-UTC news cutoff is evening in Brasília (UTC−3, general knowledge, not sourced here). Any future news input for B3 would need a cutoff tied to the decision time, not to the calendar date.
- The FinMem convention (A) is the code of an agent that later benchmarks (FINSABER, Profit Mirage) found to collapse out of sample. This is consistent with, but does not prove, the claim that convention A plus pre-cutoff windows inflated early results.

### Gaps
- FinAgent, FinCon and StockAgent pages were truncated in the appendices, so their implementation appendices (possible fill prices and fee rates) were not read. FinMem's paper text was not fetched; its convention comes from code only.
- I did not read the papers for QuantAgent 2024 ("Seeking Holy Grail in Trading by Self-Improving LLM", arXiv 2402.03755), Alpha-GPT v1 (arXiv 2308.00016) or FinRobot (arXiv 2405.14767). Their abstracts did not give execution conventions.
- MarketSenseAI and other monthly LLM stock-selection papers were not covered.
- Whether the ai-hedge-fund portfolio manager sizes orders at T's close (decision) or T+1's close (fill) was not traced. Its broker docstring only says fills are exact at the order's reference price.
- The fill price FINSABER used for the published paper runs is not stated in the paper. The repo default (`next_open`, as of Sep 2026) may postdate the runs.
- Alpha Arena's official methodology could not be retrieved (404).
- No LLM-agent study on B3 or Brazilian equities was searched for or found. TradingAgents only maps `.SA` tickers to the ^BVSP benchmark.

## 2. Which systems feed intraday or real-time prices to the LLM, and what they observed

### Takeaway
Only a minority of systems give the LLM intraday or real-time prices: Alpha Arena (3-minute plus 4-hour series, per reconstructions), QuantAgent/QuantHarness (1h and 4h bars), AI-Trader (hourly US stocks), LiveTradeBench (a live last price about one hour before the close) and StockAgent (intraday order-flow in a simulated market). What they report is mostly negative or neutral: numeric time series are hard for LLMs, overtrading and fees hurt, inference latency rules out short horizons, and accuracy degrades on very short candles. None shows a clean benefit of intraday price input over daily input.

### Cited Findings
- **Alpha Arena, prompt contents (third-party reconstructions, not verified against an official source):**
  - Intraday series "at 3-minute intervals" plus a separate 4-hour section, open interest and funding rate. — [kukapay/alpha-arena-mcp (community reconstruction)](https://github.com/kukapay/alpha-arena-mcp)
  - A replication computes EMA20, MACD and RSI(7/14) on 3-minute candles and EMA20/50, MACD, RSI14 and ATR on 4-hour candles. — [FMZ replication guide](https://www.fmz.com/digest-topic/10777)
  - A reconstructed system prompt claims a 2–3 minute decision cadence and 1x–20x leverage (explicitly unverified). — [gitcode reconstruction (Chinese)](https://gitcode.csdn.net/6a2c18e1662f9a54cb7dd917.html)
- **Alpha Arena, design intent:** founder Jay Azhang said the team intentionally put the models in a hard position, since LLMs do not handle numerical time series data well, "but that was the entire context provided", with a limited asset set and a narrow action space. — [ForkLog, via search summary](https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/amp)
- **Alpha Arena, Season 1 results:** Qwen3 Max +22.3% and DeepSeek V3.1 +4.9%; Claude Sonnet 4.5 −30.8%, Grok 4 −45.3%, Gemini 2.5 Pro −56.7%, GPT-5 −62.7%. Gemini 2.5 Pro made 238 trades and paid about $1,331 in fees (over 13% of starting capital); Qwen made 43 trades. — [buildix (secondary)](https://www.buildix.trade/blog/nof1-alpha-arena-lessons-ai-trading-byok-strategy-advisor-2026)
  - Conflict: ForkLog reports Claude Sonnet 4.5 ending at $5,799 (about −42%), not −30.8%. — [ForkLog](https://forklog.com/en/four-out-of-six-ai-models-suffer-losses-in-trading-tournament/amp)
- **Alpha Arena, interpretation:** one commentator says the leaders were hurt by excessive leverage and the weaker models by overtrading, and argues that risk limits should be hard-coded outside the model. — [upscale.trade (secondary)](https://upscale.trade/blog/ai-trading-alpha-arena)
- **Alpha Arena, Season 1.5:** moved to US equities with $320,000 in total capital. — [MEXC/PANews (secondary)](https://www.mexc.com/news/175563)
- **QuantHarness (1h/4h bars):**
  - The limitations section says the system "is not truly real-time", because each cycle involves an LLM call and several tool calls, which can exceed the window for a 1-minute opportunity.
  - Accuracy degrades on ultra-short candles (about 1–15 minutes) compared with 30-minute to 4-hour bars. — [QuantHarness, arXiv HTML](https://arxiv.org/html/2509.09995)
- **AI-Trader (US hourly):**
  - MiniMax-M2 returned 9.56% against 1.87% for QQQ (MDD −4.92%), and no agent beat the SSE-50 in A-shares.
  - "Risk control capability is the key determinant of an AI agent's cross-market robustness." — [AI-Trader, arXiv HTML](https://arxiv.org/html/2512.10971)
  - The abstract says excess returns were easier to obtain in highly liquid markets. — [AI-Trader abs](https://arxiv.org/abs/2512.10971v1)
- **LiveTradeBench:**
  - The code runs the stock decision at 15:00 ET using yfinance `fast_info.last_price` (see Q1).
  - The paper finds that "high benchmark scores in general reasoning do not translate to superior trading outcomes". The Spearman correlation between LMArena score and return is 0.054 for stocks and −0.38 for Polymarket. News was the factor agents cited most, ahead of price history. — [LiveTradeBench, arXiv HTML](https://arxiv.org/html/2511.03628)
- **StockAgent:** each session's prompt includes the current buy and sell orders, so agents react to intraday order flow in a closed simulated market. Gemini agents herded and leaned short; GPT agents leaned long and traded larger volumes less often. — [StockAgent, arXiv HTML](https://arxiv.org/html/2407.18957)
- **StockSim:** it supports OHLCV bars "from one minute to one day" and order-level LOBSTER data, but its reported LLM experiment used daily candles only. — [StockSim, arXiv HTML](https://arxiv.org/html/2507.09255)
- **Agentic Trading survey (Yihan Xia et al., Shenzhen University; arXiv 2605.19337, 19 May 2026):**
  - "the latency of even lightweight LLMs (hundreds of milliseconds) exceeds the budgets of high-frequency trading", which places LLM methods in a "reflective, second-scale" category.
  - Reasoning depth "must match the market timescale". — [Agentic Trading survey, arXiv HTML](https://arxiv.org/html/2605.19337v1)
- **Intraday news timing (no LLM price input), Lopez-Lira & Tang** — [Lopez-Lira & Tang](https://arxiv.org/abs/2304.07619):
  - For intraday headlines, the GPT-4 score is insignificant for the 1–15 minute post-release return.
  - It is significant from 15 minutes post-release to the close (coefficient 0.189, t = 5.12) and close-to-close (0.116, t = 2.31): "it adds significant value to trade on intraday news headlines quickly (within 15 minutes) after the news release".

### Inferences
- The evidence does not support feeding intraday prices to the LLM for a 5-stock daily portfolio. The reported costs (overtrading, fees, numeric-series confusion, latency) are concrete. The reported benefits are confounded (AI-Trader mixes frequency with market) or come from price-only directional scoring without costs (QuantHarness).
- Using an intraday quote only for execution and marking, while keeping the LLM's inputs daily, is consistent with how LiveTradeBench operates in its code (daily inputs, live last price at decision time).
- Lopez-Lira & Tang's result implies that for daily-horizon signals the tradable value lies after the first minutes, not in instantaneous reaction. That fits a human-approval loop with minutes to hours of delay, provided the fill price is the price available after approval.

### Gaps
- No primary nof1 document confirming the Alpha Arena prompt (3-minute and 4-hour series), the invocation cadence, the order types or the fees was retrievable. All Alpha Arena details are secondary.
- None of the sources reports a measured benefit of intraday price input with costs included.
- I found nothing on 15-minute-delayed quotes specifically (as opposed to real-time feeds) used by an LLM agent.

## 3. Execution price drift, re-quoting, tolerance bands and limit orders for LLM agents

### Takeaway
No LLM-trading paper found models the gap between an agent's (or a human approver's) decision and the fill with re-quoting or tolerance bands. Each of the following covers one piece:
- StockSim simulates latency, slippage and limit, market and stop orders.
- StockAgent lets agents post limit-priced orders into a simulated book.
- TradingAgents' Trader may propose an entry price and stop-loss, but its backtest ignores them and fills at the first close.
- FINSABER has optional percentage and volume-impact slippage plus liquidity caps, defaulting to zero.
- ai-hedge-fund absorbs decision-to-fill drift by filling at the next close and letting cash go negative.
- A May 2026 survey names "implicit execution" at the close as a common flaw.

### Cited Findings
- **StockSim:**
  - Order-level mode matches orders on price-time priority with MARKET, LIMIT and STOP types. The engine models the delay between an agent's action and the book update. Slippage is the gap between the submitted price and the fill price, attributed to latency and market impact.
  - Candlestick mode fills an order only if its price lies within the bar, and simulates intra-bar paths so that stops trigger plausibly.
  - No experiment measures how latency or slippage changes LLM performance. — [StockSim, arXiv HTML](https://arxiv.org/html/2507.09255)
  - The repo describes "latency simulation for studying LLM response time effects on execution quality". — [StockSim repo](https://github.com/harrypapa2002/StockSim)
- **StockAgent:** agents set both price and quantity; a trade happens only when a bid and an ask coincide; the price updates to the last transaction. — [StockAgent, arXiv HTML](https://arxiv.org/html/2407.18957)
- **TradingAgents:**
  - The `TraderProposal` has an optional "entry price target as an absolute number" and a "stop-loss as an absolute price". — [schemas.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/agents/schemas.py)
  - Settlement nonetheless always enters "at the first close after `trade_date`". — [settlement.py](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/tradingagents/memory/settlement.py)
- **ai-hedge-fund:**
  - Decision at T's close, execution at T+1's close; fills are "exactly at the order's reference price".
  - "cash may go negative and stays visible", with sells-before-buys and floor-toward-zero sizing, so a long book "won't get there". — [session.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/pipeline/session.py); [sim.py](https://github.com/virattt/ai-hedge-fund/blob/78b779c1389e2d1452dc29606d2c4126d859b964/hedge_fund/brokers/sim.py)
- **FINSABER:** the repo has `apply_slippage(price, side, quantity, average_volume=None, slippage_perc=0.0, slippage_impact=0.0)` and `apply_liquidity_cap(quantity, average_volume, cap_pct, …)` using average prior volume. The defaults are zero slippage. — [execution.py](https://github.com/waylonli/FINSABER/blob/main/backtest/toolkit/execution.py); [trade_config.py](https://github.com/waylonli/FINSABER/blob/main/backtest/toolkit/trade_config.py)
- **AI-Trader:** the Trade tool rejects orders above available liquidity and enforces A-share 100-share lots. — [AI-Trader, arXiv HTML](https://arxiv.org/html/2512.10971)
- **QuantHarness:** trades exit at the first of the next three candles that hits a fixed 0.05% stop or the LLM-set take-profit. The entry price is not stated. — [QuantHarness, arXiv HTML](https://arxiv.org/html/2509.09995)
- **LiveTradeBench:** operates "without modeling low-level order execution mechanics" and does not discuss decision-to-execution latency. — [LiveTradeBench, arXiv HTML](https://arxiv.org/html/2511.03628)
- **Agentic Trading survey (2026)** — [Agentic Trading survey, arXiv HTML](https://arxiv.org/html/2605.19337v1):
  - Treats the action interface as a typed contract.
  - Warns against "implicit execution", where agents are assumed to trade at the close without order-generation delays.
  - Lists rejection, partial fill and timeout (latency violation) as failure modes.
  - States that "Many papers omit order timing, fill assumptions, cost models, and rejection handling".
- **ATLAS** (arXiv 2510.15949): a central agent emits limit, market or stop orders. I saw this only in a search summary and found no drift analysis. — [ATLAS, arXiv HTML](https://arxiv.org/html/2510.15949v1)
- **Classical background (non-LLM, seen via search summaries only):**
  - Under latency, a seller must add a safety margin and lower the limit price, which creates a value loss. — [Moallemi et al., "The Cost of Latency in High-Frequency Trading"](https://moallemi.com/ciamac/papers/latency-2009.pdf)
  - Liquidity takers risk that the targeted quotes are stale by the time the order is processed. — ["Optimal execution with stochastic delay", Finance & Stochastics](https://link.springer.com/article/10.1007/s00780-022-00491-w)
  - Trade-off between unfilled limit orders and limit orders that execute as market orders, under submission latency. — [arXiv 2504.00846](https://arxiv.org/html/2504.00846)

### Inferences
- For a human-approval flow with a ~15-minute-delayed quote, the closest published patterns combine as follows. Treat the proposal as a limit-style intent (TradingAgents' optional entry price, StockSim's LIMIT orders). Define the fill by a rule that is observable after approval (StockSim's "fill only if within the bar's range"; ai-hedge-fund and TradingAgents filling at the next close). Store the decision, quote and approval timestamps separately, as the survey's "typed action contract" with rejection and timeout suggests.
- A concrete band-and-re-quote rule (for example, re-quote if price drift exceeds X% between proposal and approval) would be original to the project. I found no LLM-specific precedent.
- If sizing uses the proposal-time price and the fill uses a later price, cash can drift. ai-hedge-fund accepts this and keeps it visible instead of re-quoting.

### Gaps
- I found no paper on human-in-the-loop approval latency for LLM trades. The survey's dedicated Human-in-the-Loop section (13.2) was beyond the portion fetched.
- I found no published tolerance-band or re-quote protocol for LLM agents.
- I found no study quantifying how slippage or latency assumptions change LLM agent rankings.

## 4. Critiques of LLM-trading evaluations: look-ahead and memorization, survivorship, fills at the close, ignored costs

### Takeaway
The 2025–2026 critique literature is consistent. Pre-cutoff backtests are contaminated: LLMs recall prices and events, and prompts or masking do not undo it. Returns of classic agents roughly halve after the cutoff. Short windows on famous stocks embed survivorship and look-ahead bias, and over two decades LLM agents do not beat buy-and-hold on a risk-adjusted basis. Most studies omit costs, fill timing and survivorship handling. The proposed remedies are post-cutoff or live evaluation, point-in-time models, explicit costs and fill rules, and broad, long, walk-forward tests.

### Cited Findings
- **FINSABER** (KDD '26) — [FINSABER, arXiv HTML](https://arxiv.org/html/2505.07078):
  - Prior evaluations are "conducted on narrow timeframes and limited stock universes", which inflates results through survivorship, look-ahead and data-snooping bias, and they "omit key details such as exact risk-free rates and transaction costs".
  - In the bias-mitigated composite test, buy-and-hold had a Sharpe ratio of 0.703 against 0.241 for FinAgent and −0.228 for FinMem (volatility-effect selection). Neither LLM agent produced significant alpha (p > 0.34).
  - Over bull years buy-and-hold had a Sharpe ratio of 0.61 against FinAgent 0.12 and FinMem −0.19 ("overly conservative"); over bear years LLMs were "too aggressive".
  - The authors concede the evaluation "has not fully eliminated look-ahead bias".
- **Profit Mirage** (Xiangyu Li, Yawen Zeng, Xiaofen Xing, Jin Xu, Xiangmin Xu; arXiv 2510.07920, 9 Oct 2025) — [Profit Mirage, arXiv HTML](https://arxiv.org/html/2510.07920):
  - Setup: GPT-4o (cutoff October 2023) on NASDAQ-100, Q2–Q3 2021 versus Q3–Q4 2024.
  - Sharpe ratio decay ranged from 51.48% (QuantAgent) to 62.23% (FinCon). Total-return decay ranged from 50.18% (TradingAgents) to 71.85% (FinMem). "FinMem exhibits the most severe degradation, indicating a strong reliance on memorized historical patterns."
  - The FinLeak-Bench audit (2,000 QA pairs, Jan 2022 – Jun 2023) found memorization scores of 85–93% by category for GPT-4o, Claude-Sonnet-3.7 and Grok-3.
  - Their remedy, FactFin, uses LLMs as strategy generators with counterfactual perturbations. They claim "standard transaction costs and realistic slippage models" but give no figures.
- **Lopez-Lira, Tang & Zhu, "The Memorization Problem"** (arXiv 2504.14765, v1 15 Apr 2025, v2 15 Dec 2025) — [Memorization Problem, arXiv HTML](https://arxiv.org/html/2504.14765):
  - GPT-4o recalls S&P 500 closes with 0.61% mean absolute percent error and 80.6% directional accuracy before its October 2023 cutoff, against 16.9% and 45.7% after.
  - Instructions do not help: told to use only pre-2010 data, the model scored 97.6% before the artificial cutoff and 98.0% after. Prompts "cannot change what information is encoded in the model's parameters".
  - Masking fails: the model identified the firm in 100% of anonymized Apple, Meta and Microsoft earnings calls.
- **Look-Ahead-Bench** (Mostapha Benhenda; arXiv 2601.13770, 20 Jan 2026), run in the AI Hedge Fund framework — [Look-Ahead-Bench, arXiv HTML](https://arxiv.org/html/2601.13770):
  - Standard LLMs show alpha decay between Apr–Sep 2021 and Jul–Dec 2024: Llama 3.1 8B −17.23 pp, 70B −15.25 pp, DeepSeek 3.2 −21.77 pp.
  - Point-in-time "Pitinf" models show +0.31 to +1.30 pp.
  - Caveat: baselines also moved (mean reversion −10.78 pp, random −10.30 pp), so decay is a noisy signal in this small 5-stock test.
- **Glasserman & Lin** (arXiv 2309.17322, 29 Sep 2023): they separate look-ahead bias from a "distraction effect". Within the training window, anonymized headlines performed better, so distraction mattered more than look-ahead, especially for large firms. — [Glasserman & Lin, arXiv abs](https://arxiv.org/abs/2309.17322)
- **ChronoBERT/ChronoGPT** (Songrun He, Linying Lv, Asaf Manela, Jimmy Wu; arXiv 2502.21206, v3 6 Jul 2025). This is a counterpoint: chronologically consistent models reach Sharpe ratios comparable to a much larger Llama in next-day news-return prediction, so lookahead bias was "modest" in that setting. — [ChronoGPT, arXiv abs](https://arxiv.org/abs/2502.21206)
- **Lopez-Lira & Tang** — [Lopez-Lira & Tang](https://arxiv.org/abs/2304.07619):
  - Footnote 4: Sarkar & Vafa (2024) and Lopez-Lira, Tang & Zhu (2025) "provide strong evidence that one must use a sample period after an LLM's knowledge cutoff date to avoid lookahead bias and memorization problems".
  - Footnote 18 gives Llama-2's cutoff as September 2022.
  - Cost sensitivity: 5, 10 and 20 bps round-trip; "A transaction cost of 20 bps round-trip makes the strategy unprofitable."
- **StockBench:** Appendix A reports that GPT-5, queried without search, appeared to predict AAPL's 2021 trend. This motivated a window after mainstream cutoffs. — [StockBench, arXiv HTML](https://arxiv.org/html/2510.02209)
- **Agentic Trading survey** (77 studies, 19 in the primary empirical subset) — [Agentic Trading survey, arXiv HTML](https://arxiv.org/html/2605.19337v1):
  - Only 1 of 19 primary studies reports an explicit transaction-cost model, and only 1 of 19 documents universe or survivorship handling.
  - News timestamps often reflect publication rather than availability, which inflates backtests that lack ingestion-lag modeling.
  - Using "retrospectively cleaned or final versions" of data introduces leakage.
  - Proposes an "Outcome Embargo" for retrieval memory, reporting of "Search Budget", and "Walk-Forward Validation".
- **StockSim:** Backtrader and FinRL "abstract away crucial trading microstructure aspects like latency"; TradingAgents uses "highly simplified market representations based solely on coarse historical data"; candlestick evaluation "fails to capture critical dynamics, such as latency". — [StockSim, arXiv HTML](https://arxiv.org/html/2507.09255)
- **LiveTradeBench:** static benchmarks evaluate "fixed inputs with single-turn reasoning", and omitting fees, spreads and liquidity may overestimate returns, "especially for frequent rebalancing". — [LiveTradeBench, arXiv HTML](https://arxiv.org/html/2511.03628)
- **DeepFund:** "pre-training contamination emerges because LLMs are typically trained on vast internet corpora", and different cutoffs make cross-model comparisons unfair. — [DeepFund, arXiv HTML](https://arxiv.org/html/2503.18313)
- **TradingAgents README:** non-archived feeds make historical runs irreproducible. "Pin the analysis date to hold the price and indicator window fixed, but the social and news sources still reflect 'now'." — [TradingAgents README](https://github.com/TauricResearch/TradingAgents/blob/e8f5503e9b86d5c2710b0c76b1f686703968c9df/README.md)
- **Agent Market Arena:** over two live months, buy-and-hold beat most agent configurations on TSLA (46.88%) and BTC (18.56%). The rendered table shows identical HedgeFundAgent rows across the five backbones, which suggests a pipeline or logging issue. — [AMA, arXiv HTML](https://arxiv.org/html/2510.11695)
- **"All Leaks Count"** (Zhang, Chen & Stadie; arXiv 2602.17234, 2026): decomposes rationales into claims scored by temporal verifiability with Shapley weights, and reports substantial leakage in standard prompting across 350 instances. Seen via search summary only. — [arXiv HTML](https://arxiv.org/html/2602.17234v1)

### Inferences
- A forward, daily, live paper portfolio such as the TCC's is post-cutoff by construction, like LiveTradeBench, AMA, AI-Trader, DeepFund and Alpha Arena. So memorization mainly threatens any historical LLM backtest of B3 stocks, not the daily operation.
- Even in live operation, "unrealistic fills at the close" and "no costs" remain the dominant evaluation flaws, according to the survey (1/19 with costs) and the benchmark limitation statements.
- If any historical LLM replay is run, evidence favours post-cutoff windows over anonymization. Lopez-Lira, Tang & Zhu show masking fails, and the remaining value of anonymization is against Glasserman & Lin's distraction effect.
- Comparing several carteiras (portfolios) needs one shared fill and cost rule. LiveTradeBench and AMA show that rankings and reported outperformance shift with fees and buy-and-hold baselines.

### Gaps
- I could not verify Sarkar & Vafa (2024, "Lookahead Bias in Pretrained Language Models") directly; it is cited only through Lopez-Lira & Tang's footnote.
- DatedGPT (yearly-cutoff 1.3B models for 2013–2024) and "Temporal Leakage in LLM Backtesting" (arXiv 2608.02985) were seen only in search snippets, and their exact IDs and findings are unverified.
- None of the critiques addresses B3 or emerging markets specifically.

## 5. Work comparing LLM decisions made with daily versus intraday information

### Takeaway
I found no controlled head-to-head study of LLM agents using daily versus intraday information on the same assets, period, prompts and costs. The available evidence is indirect:
- StockBench explicitly did not test intraday.
- AI-Trader confounds frequency with market.
- QuantHarness tests only 1h and 4h bars and reports degradation below about 30 minutes.
- Lopez-Lira & Tang show where intraday news value lies in time.
- Alpha Arena's minute-level setup produced overtrading and fee drag (secondary sources).

### Cited Findings
- **StockBench** trades once per day; "intraday and event-driven strategies are not tested". — [StockBench, arXiv HTML](https://arxiv.org/html/2510.02209)
- **AI-Trader** uses hourly for US stocks and daily for A-shares and crypto. Each market has one frequency, so frequency is confounded with market. — [AI-Trader, arXiv HTML](https://arxiv.org/html/2512.10971)
- **QuantHarness:** accuracy drops on roughly 1–15 minute candles compared with 30-minute to 4-hour bars, and an LLM cycle can exceed a 1-minute opportunity window. — [QuantHarness, arXiv HTML](https://arxiv.org/html/2509.09995)
- **LiveTradeBench** tests rebalancing intervals of 1, 2, 4, 8 and 16 days (a daily-and-longer frequency comparison). The results of this analysis were not captured in the portion read. — [LiveTradeBench, arXiv HTML](https://arxiv.org/html/2511.03628)
- **Lopez-Lira & Tang:** on intraday news, the GPT-4 score is insignificant for 1–15 minutes after release and significant from 15 minutes after release to the close and close-to-close. Overnight news is handled with open/close fills. — [Lopez-Lira & Tang](https://arxiv.org/abs/2304.07619)
- **Agent Market Arena:** daily decisions at one fixed time for all agents. — [AMA, arXiv HTML](https://arxiv.org/html/2510.11695)
- **Agentic Trading survey:** reasoning depth "must match the market timescale (event-driven vs. microstructure)"; no direct comparison is given. — [Agentic Trading survey, arXiv HTML](https://arxiv.org/html/2605.19337v1)
- **Alpha Arena (minute-level inputs, real fills):** the most active model made 238 trades and paid fees above 13% of capital (secondary source). — [buildix](https://www.buildix.trade/blog/nof1-alpha-arena-lessons-ai-trading-byok-strategy-advisor-2026)

### Inferences
- Without a controlled comparison, the burden of proof sits with intraday input. The documented costs (latency, overtrading, fees, noise in numeric series) are concrete; the benefits are unmeasured.
- For the TCC, a defensible split is daily features for the LLM, and an intraday or delayed quote only for execution and monitoring. A daily-versus-intraday-input comparison could be a small original contribution if run forward with identical prompts and costs.

### Gaps
- I did not find the "TradeArena" hourly study (51 US equities) mentioned in a search snippet, nor the results of LiveTradeBench's rolling-k analysis.
- I found no study on emerging-market (B3) intraday data for LLM agents.
