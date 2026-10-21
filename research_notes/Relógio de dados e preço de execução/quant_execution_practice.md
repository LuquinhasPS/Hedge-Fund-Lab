# Execution-price and timing conventions in quantitative practice (decision moment → execution price)

Notation used in the inferences: `P_dec` = decision price (the price the decision was conditioned on; here the official close of session D-1), `P_arr` = arrival price (price observable when the approved order reaches the market), `P_exec` = fill price, `σ_d` = daily close-to-close return volatility, `h` = elapsed fraction of a trading day between `P_dec` and `P_arr`. All URLs accessed 2026-10-18. "Via search summary" marks claims that came from search-engine excerpts of the cited page. I could not open those pages directly, so check them before quoting.

Project context (local files, for the writer). `docs/evidence/hfl_experimental_protocol_v76/PAPER_TRADING_PROTOCOL.md:42` defines the "Preço de referência da decisão" as the "fechamento oficial (COTAHIST) da sessão t". `docs/EXPERIMENT_PROTOCOL.md:1498` records "Formação do preço de execução: OPENING_AUCTION_EXECUTION (decidido)". I saw these lines by grep only; I did not read the full documents.

## 1. Backtest conventions: signal at close t → execute at close t, open t+1, close t+1 or VWAP t+1?

### Takeaway
The main open-source engines do not fill an order at the same bar's close by default. Backtrader fills market orders at the next bar's open and allows a same-bar close fill only through a flag it calls "cheating". Zipline fills on the next bar at that bar's close (next day's close in daily mode). LEAN converts market orders sent while the market is closed into market-on-open orders. Academic backtesting guidance treats weights decided with information up to t as earning returns only from t+1, so using the same bar's close is look-ahead bias. The overfitting literature (Bailey et al.; Harvey & Liu) deals with multiple testing and selection bias. It does not set a fill-timing rule.

### Cited Findings
- **Backtrader, market orders.** They execute at the "Opening price of the next set of Open/High/Low/Close prices". The docs say "The expectation CANNOT be that the order will be executed with the `close` price which is being examined in the logic" and "The current data has already happened and cannot be used to execcute an order" [sic]. — [Backtrader docs, "Order Creation/Execution" (backtrader.com)](https://www.backtrader.com/docu/order-creation-execution/order-creation-execution/)
- **Backtrader, other order types.** A `Close` order fills at "the `close` price of the next bar". A `Limit` buy becomes active on the next bar. If that bar opens through the limit, "the order executes immediately with the `open` price" (gap fill at the open). Otherwise it fills at the limit if the bar touches it. A Stop buy whose bar opens above the stop also fills at the open. — [Backtrader docs, "Order Creation/Execution"](https://www.backtrader.com/docu/order-creation-execution/order-creation-execution/)
- **Backtrader, `coc` (cheat-on-close) flag.** Default `False`. It enables "matching a Market order to the closing price of the bar in which the order was issued". The docs call this "actually cheating, because the bar is closed and any order should first be matched against the prices in the next bar". A matching `coo` (cheat-on-open) flag also exists, default `False`. — [Backtrader docs, "Broker"](https://www.backtrader.com/docu/broker/)
- **Zipline (Quantopian's engine, zipline-reloaded), order of operations.** In each bar, `blotter.get_transactions(current_data)` runs before `handle_data(...)`. The code comment reads "handle any transactions and commissions coming out new orders placed in the last bar". So an order placed in bar t is first processed in bar t+1. — [zipline-reloaded `gens/tradesimulation.py` (Quantopian 2015, Apache 2.0)](https://raw.githubusercontent.com/stefan-jansen/zipline-reloaded/main/src/zipline/gens/tradesimulation.py)
- **Zipline, fill price.** Fills are priced from the processing bar's close. The `VolumeShareSlippage` docstring says "`price` is the close price for the bar". `FixedBasisPointsSlippage` models slippage "as a fixed percentage difference from historical minutely close price". — [zipline-reloaded `finance/slippage.py`](https://raw.githubusercontent.com/stefan-jansen/zipline-reloaded/main/src/zipline/finance/slippage.py)
- **QuantConnect LEAN, closed-market orders.** "If you place a market order during pre-market or post-market hours, LEAN converts your order to market on open order." The docs' example fills a buy "at the ask close price" and a sell "at the bid close price". — [QuantConnect docs, "Market Orders"](https://www.quantconnect.com/docs/v2/writing-algorithms/trading-and-orders/order-types/market-orders)
- **QuantConnect LEAN, auctions and fill assumptions.** For US equities, "our built-in fill models can fill your orders at the official opening and closing auction prices". "In backtests, the pre-built fill models assume orders completely fill." — [QuantConnect docs, "Trade Fills – Key Concepts"](https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/trade-fills/key-concepts)
- **vectorbt.** The price passed to `Portfolio.from_signals` is user-supplied. The docs' examples set `price=ohlcv['Open']` and, in one example, shift the signal with the comment "Don't look into the future" (`fshift(1)`). — [vectorbt docs, `portfolio.base`](https://vectorbt.dev/api/portfolio/base/)
- **Palomar textbook, look-ahead bias and timing.** Look-ahead bias is "the bias created by using information or data that were unknown or unavailable" at decision time. Computing returns as R_t = w_tᵀr_t "would be totally incorrect" when w_t uses information up to t. The weights must use information only up to t-1, or the returns must be lagged. The book cites a moving-average strategy whose performance "vanishes completely under a proper backtest" (Zakamulin, 2018). — [D. P. Palomar, *Portfolio Optimization: Theory and Application*, §8.2 "The Seven Sins of Quantitative Investing"](https://portfoliooptimizationbook.com/book/8.2-seven-sins.html)
- **Origin of the "seven sins" list.** The list (survivorship bias, look-ahead bias, storytelling, data mining/snooping, transaction costs, outliers, shorting) comes from Luo, Alvarez, Wang, Jussa, Wang & Rohal (2014), *Seven Sins of Quantitative Investing*, Deutsche Bank Markets Research white paper. — cited in [Palomar §8.2](https://portfoliooptimizationbook.com/book/8.2-seven-sins.html); PDF located at [columbia.edu](https://columbia.edu/~nyc2107/papers/seven_sins_of_quantitative_investing.pdf) (not opened)
- **Academic practice for overnight execution (benchmark at prior close, execution at next open).** Frazzini, Israel & Moskowitz say the theoretical (benchmark) price "is often defined as the closing price at the time the strategy's desired holdings and trades are generated (e.g., prior day's closing price)". Market impact is measured from "the opening price on the day the strategy begins trading … (e.g., current day's opening price)". — [Frazzini, Israel & Moskowitz, "Trading Costs of Asset Pricing Anomalies", draft Dec 2012 (NBER conference paper)](https://conference.nber.org/conf_papers/f68262/f68262.pdf)
- **Skip-period convention (via search summaries; primary papers not opened).**
  - Jegadeesh & Titman (1993) introduced a skip period between formation and holding as a momentum variant. — [CXO Advisory](https://www.cxoadvisory.com/?p=2932)
  - Jegadeesh, Luo, Subrahmanyam & Titman (2024) report that momentum profits rise when a month is skipped. — [UCR working paper](https://business.ucr.edu/media/12028/download)
  - Heston, Korajczyk & Sadka find that microstructure-induced reversal is pronounced within 24 hours. — [NBER conference paper](https://conference.nber.org/confer/2008/mms08/korajczyk.pdf)
- **Overfitting literature (via search summaries).** Bailey, Borwein, López de Prado & Zhu (2014), "Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance", *Notices of the AMS* 61(5):458–471, deals with backtest overfitting. — [AMS Notices PDF](https://www.ams.org/notices/201405/rnoti-p458.pdf) (not opened)
- **Harvey & Liu (2015), "Backtesting" (via search summaries).** Published in *Journal of Portfolio Management* 41(1):13–28. The paper treats the common 50% Sharpe-ratio discount as a rule of thumb and replaces it with a multiple-testing "haircut" that is nonlinear: marginal Sharpe ratios are penalized heavily, high ones moderately. — [Duke PDF](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF) (not opened)

### Inferences
- **Engine defaults side by side (daily data).**

  | Engine | Default fill for a signal at close t | Optional or explicit alternative |
  |---|---|---|
  | Backtrader | open t+1 | close t+1 (`Close` order); close t only via `coc`, which the docs call cheating |
  | Zipline | close t+1 (derived from code order plus close-price fills; the docs do not say it outright) | — |
  | LEAN | open t+1 for orders placed while the market is closed (converted to MOO); official auction prices available | — |
  | vectorbt | no default; the user must choose the price and the lag | — |

  None of the documentation I read uses VWAP t+1 as a default fill. VWAP shows up as a TCA benchmark (see Q2), not as a backtest fill convention.
- **Filling at `P_dec` is the forbidden same-bar fill.** The TCC's LLM decides from data up to the D-1 close. Recording the trade at the D-1 close would be exactly Backtrader's "cheat-on-close": by the time the decision exists, that price can no longer be traded. `P_dec` is legitimate as a paper-portfolio benchmark (Q2), not as a fill price.
- **Short-horizon signals are most exposed.** The skip-period and microstructure-reversal evidence suggests that short-horizon signals benefit most from an unrealistic same-close fill. If the LLM's proposals react to the last day's move, a fill at the D-1 close would flatter results more than a slow-signal strategy would suggest.
- **"First auction strictly after approval" mirrors the engine defaults.** For a human who may approve before the open, during the session or after the close, this rule reproduces the conventions above (LEAN MOO, Backtrader open t+1, Zipline close t+1). It also stays reproducible from official auction prices.

### Gaps
- I did not access López de Prado's *Advances in Financial Machine Learning* (2018), so I have no verified quote from it on fill timing. Secondary sources only attribute to it the claim that most published backtests suffer from selection bias under multiple testing.
- I did not access Kissell's textbooks (*The Science of Algorithmic Trading and Portfolio Management*, 2013).
- I found no primary source stating VWAP t+1 as a standard backtest fill convention.
- I could not confirm vectorbt's global default for `price` (the docs say `None` pulls from `vbt.settings.portfolio`, and that part was not read).
- The Zipline daily-mode "close t+1" fill is inferred from code order and docstrings. The docs I read do not state it directly.

## 2. Implementation shortfall: decision price, arrival price, delay cost and opportunity cost

### Takeaway
Perold's (1988) implementation shortfall (IS) is the return gap between a "paper" portfolio, traded at the decision (benchmark) prices, and the real portfolio. The expanded version credited to Wagner (or Wagner & Edwards) splits it into delay cost (decision → order entry), trading/execution cost (entry → fills), opportunity cost (unfilled shares, marked at close or cancellation) and explicit fees. A human approving minutes after an LLM decision is exactly the delay component. Institutional data show that when the decision price is the prior close and trading starts at the open, the pre-trade move adds noise but little average cost.

### Cited Findings
- **Perold's definition.** Perold (1988) "defines implementation shortfall as the difference in return between a theoretical portfolio and the implemented portfolio". "When deciding to buy or sell stocks during portfolio construction, a portfolio manager looks at the prevailing prices (decision prices). However … the execution prices may be different from the decision prices." — [H. Mittal (ITG), "Implementation Shortfall – One Objective, Many Algorithms"](https://www.cis.upenn.edu/~mkearns/finread/impshort.pdf)
- **Paper vs actual portfolio (Hasbrouck's notes).** Hasbrouck states Perold's IS as "Return/profits on a paper portfolio – Return/profits on actual portfolio". The paper portfolio holds the same securities, but "All trades in the paper portfolio are assumed to be made at benchmark prices". Perold's original measure includes explicit costs, implicit costs (spread/impact), "Opportunity costs (the penalty associated with not completing intended trades)" and "Delay (failure to accomplish the trade immediately)". — [J. Hasbrouck, *Securities Trading: Principles and Procedures*, ch. 8 "Transaction costs", NYU Stern class notes (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)
- **IS as practiced today, and common benchmarks.**
  - IS is "Usually computed at the level of the order (not the overall portfolio)": trade price − benchmark price for a buy, the reverse for a sell. This form excludes commissions, delay and opportunity costs, which are "sometimes tabulated separately".
  - "The NBBO midpoint (BAM) at the time the trading or order submission decision was made is probably the most common benchmark". VWAP is "probably the second most common choice".
  - For orders worked over time, the execution price is the share-weighted average fill.

  — [Hasbrouck (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)
- **Delay is a real cost (Hasbrouck).** "When a large order is being worked over time, the price generally moves away from the order … If we could have done the full trade immediately, we'd have avoided this cost"; "By some estimates, the cost of delay is very high". — [Hasbrouck (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)
- **Pricing unfilled limit orders (Hasbrouck).** Ignoring unfilled limit orders makes them look artificially cheap. One fix: "Assume that unexecuted limit orders are replaced at the end of the day by market orders. We impute a fill at the closing price". He notes the Tokyo Stock Exchange's Funari order, a limit order that turns into market-on-close for any unexecuted part. — [Hasbrouck (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)
- **Expanded IS formulas (CFA Level III study notes, secondary).**
  - IS = Execution cost + Opportunity cost + Fees.
  - Expanded IS = Delay cost + Trading cost + Opportunity cost + Fees.
  - Delay cost = shares transacted × (price when the order was entered − decision price). "The delay cost shows us what we lost by waiting to enter an order into the market."
  - Trading cost = actual execution cost − shares transacted × price when entered.
  - Opportunity cost = unexecuted shares × (closing price − decision price).
  - The notes credit Wagner (1991) with adding the delay component.

  — [AnalystPrep, "Measurement and Determination of Cost of Trade" (CFA L3 notes)](https://analystprep.com/study-notes/cfa-level-iii/measurement-and-determination-of-cost-of-trade/)
- **Worked example in the same notes.** Decision at 9:00 a.m. at $50.00 to buy 100,000 shares. The order is entered at 10:30 a.m. at $50.10, 75,000 shares fill between $50.20 and $50.50, and the close is $50.65. Result: delay cost $7,500, trading cost $15,000, opportunity cost $16,250, fees $3,750, total IS $42,500 = 85 bps of the $5.0M paper portfolio. I re-checked the arithmetic. — [AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/measurement-and-determination-of-cost-of-trade/)
- **Who extended IS, and when (conflicting).** One academic source attributes the extension to Wagner & Edwards (1993), "Best Execution", *Financial Analysts Journal*, which added price impact, timing cost and opportunity cost to commissions. It says Kissell (2006) later reclassified the components. AnalystPrep says Wagner (1991). — [AUK, "Implementation Shortfall in Transaction Cost Analysis: A Further Extension"](https://dspace.auk.edu.kw/items/2142d1f7-0c12-42c4-8099-5c723ca8ad54) (via search summary), versus [AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/measurement-and-determination-of-cost-of-trade/)
- **Opportunity cost as risk (ITG).** The ITG article defines opportunity cost differently, as "the standard deviation of the trading cost", a function of the trade schedule, volatility and correlations. It calls VWAP "a more forgiving benchmark than arrival prices". — [Mittal (ITG)](https://www.cis.upenn.edu/~mkearns/finread/impshort.pdf)
- **Almgren & Chriss link IS to price risk.** They model prices as "the discrete arithmetic random walk S_k = S_{k−1} + σ τ^{1/2} ξ_k − τ g(n_k/τ)" with "no drift term … the assumption that we have no information about the direction of future price movements". The total trading cost X·S₀ − Σ n_k·S̃_k "is essentially what Perold (1988) calls implementation shortfall". Before trading, IS is a random variable with variance V(x) = σ² Σ τ x_k². — [R. Almgren & N. Chriss, "Optimal Execution of Portfolio Transactions", Dec 2000 version (later in *Journal of Risk*)](https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf)
- **IS vs market impact in AQR's live trades (Frazzini, Israel & Moskowitz, 2012 draft).**
  - IS is measured against the model (theoretical) price, which is typically the prior close. Market impact (MI) is measured against the arrival price, "the price that exists when a trade begins in the market". The gap between them "represents pre-trade moves that might occur from the time a model, or theoretical, portfolio is generated and the time trading begins".
  - "In expectation, IS and MI should be the same, since we assume that the pre-trade moves … are randomly distributed with expected mean of zero … we assume that the strategies are not forming opinions about the overnight moves".
  - Empirically (nearly $1 trillion of trades, 19 developed markets, 1998–2011): mean MI 12.18 bps vs mean IS 13 bps (a 0.82 bp gap); median 7.98 vs 10.34 bps; value-weighted 18.65 vs 20.20 bps.

  — [Frazzini, Israel & Moskowitz (2012 draft)](https://conference.nber.org/conf_papers/f68262/f68262.pdf)
- **Later version of the same study.** The 2018 version ("Trading Costs", SSRN 3229719) uses $1.7 trillion of live executions across 21 markets over 19 years. Its abstract says actual costs are much smaller than prior studies suggest. — [SSRN abstract](https://papers.ssrn.com/abstract=3229719) (via search summary)

### Inferences
- **Mapping the TCC onto IS.**
  - Decision price `P_dec` = D-1 official close. This is the same convention as AQR's "prior day's closing price" model price.
  - Arrival price `P_arr` = the price when the human-approved order can actually reach the market: the live quote if approved during the session, or the next opening auction if approved off-hours.
  - Delay cost = q·(`P_arr` − `P_dec`) for a buy. It includes the overnight gap plus intraday drift up to approval. The minutes of human review are only the last, small part.
  - Execution cost = q_filled·(`P_exec` − `P_arr`).
  - Opportunity cost = q_unfilled·(`P_close` or `P_cancel` − `P_dec`).
- **Recording `P_dec`, `P_arr` and `P_exec` with timestamps separates two questions.** The LLM's skill becomes paper-portfolio performance at `P_dec`, which is comparable to a close-to-close backtest. The cost of the human/operational process becomes the implementation shortfall. The movement since the decision is then measured, not hidden behind a tolerance.
- **The pre-trade move is variance, not bias.** Following Frazzini et al., if the LLM's proposals do not forecast the overnight or intraday move, the delay cost has roughly zero mean and adds variance. Its size grows with elapsed time (Almgren–Chriss variance ∝ σ²·τ). A fixed tolerance does not reduce this cost. It only decides which trades are recorded.
- **Recommended convention for the TCC.** The opportunity cost of rejected or unfilled orders should be booked, marked at the close of the day or at cancellation. Otherwise, rejecting trades after adverse moves creates a selection bias that flatters the simulated portfolio. That is Hasbrouck's limit-order problem.

### Gaps
- I did not obtain Perold (1988) itself (JPM 14(3):4–9) or Wagner & Edwards (1993); the definitions above come from faithful secondary sources and class notes.
- No source here quantifies delay cost for a minutes-long human approval specifically.
- The 2012 AQR figures are for institutional orders averaging 1.2% of daily volume (median 0.5%), not for small retail-size orders.

## 3. Pre-trade controls in brokers, OMS and exchanges: price collars, tolerance, fat-finger limits, staleness checks

### Takeaway
Regulators and industry bodies require or recommend price collars and price-tolerance checks against a current reference price, plus market-data staleness checks that block orders built on suspect data. Breaches are rejected or blocked, sometimes with a logged, authorized override. Published numbers are wide fat-finger bands, not cost tolerances:

- IBKR auto-rejects stock limit orders 10% through the NBBO.
- NYSE limit-order price protection is the greater of $0.15 or 3–10% depending on price.
- US LULD bands are 5% (Tier 1) or 10% (Tier 2) for stocks above $3.
- B3's April 2022 table set tiered "túneis": for IBOV/IBXX stocks, an auction tunnel of ±1.5% vs the last trade and ±2% vs a 15-second average; for less liquid stocks, about ±8.5–10%.

Industry guidance says bands should be calibrated to historical intraday price statistics, not set as one fixed number.

### Cited Findings
- **EU RTS 6, Art. 15(1).** Commission Delegated Regulation (EU) 2017/589 requires pre-trade controls on order entry for all instruments:
  - "price collars, which automatically block or cancel orders that do not meet set price parameters", differentiated by instrument, both per order and over a specified period;
  - maximum order values and volumes ("uncommonly large" orders);
  - maximum message limits.

  — [EUR-Lex, Reg. (EU) 2017/589 (RTS 6)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R0589)
- **RTS 6, override procedure.** Art. 15(6) requires procedures for submitting orders that were blocked. Overrides apply to a specific trade, are temporary and only for exceptional circumstances, need verification by the risk-management function, and need authorization by a designated individual. Art. 15(5) requires automatic blocking or cancellation when orders risk breaching the firm's risk thresholds. — [EUR-Lex RTS 6](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R0589)
- **ESMA reading of Art. 15 (law-firm summary).** ESMA treats Art. 15 as mandatory in full, for all orders sent to venues. It considers it "best practice" to apply the pre-trade-control requirements to non-algorithmic trading as well. — [CMS Law, "ESMA Supervisory Briefing on Algorithmic Trading in the EU"](https://cms.law/en/gbr/legal-updates/esma-supervisory-briefing-on-algorithmic-trading-in-the-eu-key-points-and-practical-implications) (secondary)
- **FIA (July 2024), price tolerance and fat-finger limits.**
  - "A price tolerance limit is the maximum amount an individual order's limit price may deviate from a reference price, such as the instrument's current market price, and is typically applied on orders generated from an automated trading system before the order is sent to the exchange."
  - "Errors may be prevented by rejecting orders with limit prices placed outside the acceptable range". The check applies to new and amended orders.
  - Maximum order size is "commonly referred to as 'fat-finger' limits". Limits should be set by authorized staff independent of trading.
  - The paper gives no numeric thresholds.

  — [FIA, *Best Practices for Automated Trading Risk Controls and System Safeguards* (July 2024)](https://fia.org/sites/default/files/2024-07/FIA_WP_AUTOMATED%20TRADING%20RISK%20CONTROLS_FINAL_0.pdf)
- **FIA (2024), exchange dynamic price collars.**
  - Orders outside the band "will be held or rejected by the exchange".
  - Bands "are generally based on the reference price plus or minus a fixed or variable increment … The size of the fixed increment, or the relative percentage of price range, should be reviewed regularly and calibrated based on historical intraday price statistics as well as current market conditions".
  - Bands "should be dynamic and regularly recalculated" and "may become stale (too narrow)".

  — [FIA (2024)](https://fia.org/sites/default/files/2024-07/FIA_WP_AUTOMATED%20TRADING%20RISK%20CONTROLS_FINAL_0.pdf)
- **FIA (2024), market-data reasonability (staleness) check.** Systems should check "whether actionable data is reasonable based on a variety of factors that may include the time since the last update was received, previous price, bid/offer spread or deviation from an average price". If there is a deviation, "an alert should be provided flagging market data may be stale, and any orders should be blocked while the deviation is investigated". Orders generated from aberrant data "should be cancelled or rejected prior to submission". — [FIA (2024)](https://fia.org/sites/default/files/2024-07/FIA_WP_AUTOMATED%20TRADING%20RISK%20CONTROLS_FINAL_0.pdf)
- **Older FIA guidance (via search summary).** "Trading systems should have upper and lower limits on the price of the orders they can send, configurable by product. They should prevent any order for a price outside of the 'price collar' from leaving the system." — [FIA Trading Best Practices (2020 PDF)](https://www.fia.org/sites/default/files/2020-04/Trading_Best_Pratices%20-%20published.pdf) (via search summary; which FIA document carries this wording is not confirmed)
- **QuantConnect LEAN, stale data in backtests.** "Stale fills occur when you fill an order with price data that is timestamped an hour or more into the past". The threshold is adjustable through `StalePriceTimeSpan`, and the docs' example sets 10 minutes. — [QuantConnect, "Trade Fills – Key Concepts"](https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/trade-fills/key-concepts)
- **Interactive Brokers (via search summaries; direct fetch returned HTTP 403).**
  - The TWS "precautionary settings" percentage is user-set and may be left blank. A limit order priced outside it triggers a confirmation warning that the trader can override. It does not hard-block.
  - Separately, IBKR automatically rejects stock buy orders priced 10% above the NBBO ask and sell orders 10% below the NBBO bid (20% for options).
  - IBKR may price-cap market orders within a % range of an IB-computed reference price.

  — [IBKR TWS guide, "Define Precautionary Settings"](https://www.interactivebrokers.co.uk/en/software/tws.bak/usersguidebook/configuretws/define_precautionary_settings.htm); [IBKR KB 838, "Order Price Relative to the Market"](https://ibkb.interactivebrokers.com/article/838); [IBKR KB 1299](https://ibkb.interactivebrokers.com/nl/node/1299)
- **NYSE limit order price protection (via search summary of SEC rule filings).** A buy (sell) limit order is rejected if priced at or above (below) "the greater of $0.15 or a specified percentage away from the NBO (NBB)". The NYSE National table sets 10% for reference prices up to $25, 5% for $25–$50 and 3% above $50. A 2024 NYSE American change uses the last consolidated round-lot price, or the prior official close, when there is no NBO/NBB. — [SEC filing 34-95333 ex.5](https://www.sec.gov/files/rules/sro/nysenat/2022/34-95333-ex5.pdf); [Federal Register 2024-04550](https://public-inspection.federalregister.gov/2024-04550.pdf)
- **US Limit Up-Limit Down (LULD) bands (via search summary).**
  - Bands: 5% for Tier 1 and 10% for Tier 2 stocks above $3; 20% for stocks priced $0.75–$3; the lesser of $0.15 or 75% below $0.75.
  - Reference price: after the open, the mean price of trades over the preceding 5 minutes.
  - A Limit State that is not cleared within 15 s leads to a 5-minute pause.
  - Sources disagree on when bands are doubled: the 2013 rule doubled the first 15 and last 25 minutes, while the current plan site describes doubling in the last 25 minutes for Tier 1 and for Tier 2 stocks below $3.

  — [luldplan.com](https://luldplan.com/); [Federal Register 2013-24019](https://www.govinfo.gov/content/pkg/FR-2013-10-02/pdf/2013-24019.pdf); [LULD 2025 Annual Report](https://cdn.luldplan.com/reports/LULD-2025-Annual-Report.pdf)
- **B3 tunnel definitions (PUMA trading system).**
  - Túnel de rejeição: "impedir o registro de ofertas de compra com preço acima de determinado valor e ofertas de venda com preço abaixo de determinado valor".
  - Túnel de leilão: "aciona, de forma automática, o procedimento de leilão, levando-se em consideração o preço ou a quantidade da oferta".
  - Túnel de proteção: "prorroga automaticamente o encerramento de um leilão" if a protection parameter is reached.
  - The tunnel base price can be LAST TRADED PRICE, C-LAST (last price bounded by the best bid/offer) or MOST RECENT.

  — [B3, "Túneis de negociação"](https://b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/regras-e-parametros-de-negociacao/tuneis-de-negociacao/)
- **B3 parameter table, "Mercado de Ações", dated 22/04/2022.** My column mapping comes from a layout-preserving text extraction of the PDF, so verify it against the PDF.

  | Mercadoria | Túnel de leilão vs last price | Túnel de preço médio (recalculated every 15 s; Ofício 030/2015-DP) | Proteção durante o leilão | Proteção durante os calls | After-market limit |
  |---|---|---|---|---|---|
  | IBOV e IBXX | ±1.5% | ±2% | ±6% | ±1.5% | ±2% |
  | Demais índices | ±3% | ±4% | ±6% | ±3% | ±2% |
  | Demais papéis | ±8.5% | ±10% | ±15% | ±3% | ±2% |
  | ETF | ±3% | ±3% | ±6% | ±3% | ±2% |

  Values shared by the whole cash-market ("Vista") group: limites de oscilação +100% / −50%; túnel de rejeição 20%; base price LTP. — [B3, "Parâmetros para os Túneis de Negociação – Mercado de Ações" (22/04/2022 PDF)](https://www.b3.com.br/data/files/59/E0/41/CF/373508104532BBF7AC094EA8/20220425.Segmento%20BOVESPA_Tuneis%20de%20Negociacao%20-%20portugues.pdf)
- **B3 parameters change.** An October 2021 table carries different values for the same groups. — [B3 202110 table](https://www.b3.com.br/data/files/19/91/68/16/F8C3C710107B2DB7AC094EA8/202110.Segmento%20BOVESPA_Tuneis%20de%20Negociacao.pdf) (via search summary)

### Inferences
- **Industry controls catch errors; they do not decide prices.** Real-world collars (10% at IBKR, 3–10% at NYSE, 5–10% LULD, 20% B3 rejection tunnel) are sized to catch errors (fat fingers, bad data), not to bound normal execution drift. A 1% cap is far tighter than any published error control. It behaves more like a strict limit price than a fat-finger check.
- **Bands are tiered by liquidity and price level, never one number for every asset.** The B3 auction tunnels for continuous trading (±1.5% for IBOV/IBXX vs 8.5% for other stocks) show the exchange itself grades tolerance by liquidity. FIA explicitly calls for calibration to "historical intraday price statistics".
- **B3 tunnels measure jumps, not drift since the decision.** They compare a new trade to the last trade or a short rolling average. They do not compare it to the prior close, so they are not a direct model for checking a decision made on D-1 data.
- **FIA's staleness check is the closest analog to the TCC problem.** "Time since the last update", "deviation from an average price", and blocking orders while the deviation is investigated map onto the LLM's D-1 decision being stale relative to the market at approval. RTS 6 Art. 15(6) suggests how to handle a breach: an explicit, logged, authorized override rather than a silent fill.

### Gaps
- SEC Rule 15c3-5 (Market Access Rule): eCFR redirected to a bot check, so its text was not verified here. It is widely described as requiring brokers to reject orders exceeding pre-set price or size parameters.
- I found no published numeric thresholds for broker-side price tolerance in Brazil (Brazilian brokers' or B3 participant-level pre-trade risk parameters).
- I found no current (2026) B3 tunnel table. The 2022 table may be out of date.
- The IBKR and NYSE figures come from search excerpts of primary pages that I could not open.

## 4. Principled tolerance bands instead of a fixed 1%, and what happens when the band is breached

### Takeaway
Practice and theory point to tolerances scaled to the asset and the time elapsed, rather than one fixed percentage:

- a volatility band k·σ·√(elapsed time), from the random-walk dynamics in Almgren–Chriss;
- an ATR multiple, which captures gaps;
- a spread multiple, useful only over seconds;
- a protected or limit order whose unfilled remainder becomes either a resting limit order or an opportunity cost.

On a breach, the observed practices are: reject or block (RTS 6, FIA, B3 rejection tunnel); warn with a documented override (IBKR precautionary settings, RTS 6 Art. 15(6)); auction or pause (B3 auction tunnel, LULD); or fill up to the band and leave the remainder resting (CME protection, IBKR market-to-limit). A fixed 1% anchored at the prior close confuses asset volatility with time of day.

### Cited Findings
- **Volatility scales with √time.** Almgren–Chriss's price model has increments σ·τ^{1/2}·ξ with zero drift, so the price change over a horizon τ has standard deviation σ√τ. The variance of the shortfall is σ²·Σ τ·x_k². — [Almgren & Chriss (Dec 2000)](https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf)
- **Collars should come from intraday statistics.** FIA says bands are "the reference price plus or minus a fixed or variable increment" and should be "calibrated based on historical intraday price statistics as well as current market conditions". — [FIA (2024)](https://fia.org/sites/default/files/2024-07/FIA_WP_AUTOMATED%20TRADING%20RISK%20CONTROLS_FINAL_0.pdf)
- **Overnight share of daily variance (via search summaries).**
  - S&P 500, 1996–2017: about 29.4% of daily variance occurred while the market was closed, rising from about 21% to nearly 40% over the sample. Friday-to-Monday and Thursday-to-Friday gaps had about 50% higher variance. — [PKU seminar abstract, "The Weekly Rhythm of Volatility"](https://econ.pku.edu.cn/ltjz/335073.htm)
  - Korean equities: the open-to-close / close-to-open variance ratio is above one, so intraday variance dominates. — [Park, Korean Academy of Finance](https://www.earticle.net/Article/A243180)
- **ATR.** Wilder (1978, *New Concepts in Technical Trading Systems*) defined True Range as the greatest of H−L, |H−C_prev| and |L−C_prev|, specifically to capture gap and limit moves. ATR is Wilder-smoothed, e.g. (13·ATR_prev + TR)/14. — [Wikipedia, "Average true range"](https://en.wikipedia.org/wiki/Average_true_range); [StockCharts article on ATR](https://articles.stockcharts.com/article/articles-chartwatchers-2011-12-average-true-range-comparison-shows-stockcharts-is-above-average/) (via search summary)
- **CME market-with-protection orders (via search summary of CME docs).** For a bid, protection points are added to the best offer to form a protection price limit, and the order fills at the best prices without crossing that limit. "If the entire order cannot be filled within the protected range immediately, the unfilled quantity remains in the order book as a limit order at the limit of the protected range". These orders are rejected if no opposing bid/offer exists or the market state is not Open. A third-party guide says protection points are typically 50% of the product's Non-Reviewable Range. — [CME Globex "Order Types for Futures and Options"](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/457087412/Order+Types+for+Futures+and+Options); [CME iLink Order Types](https://cmegroupclientsite.atlassian.net/wiki/spaces/EPICSANDBOX/pages/457227032/iLink+Order+Types); [NexusFi guide](https://nexusfi.com/a/exchanges/exchange-order-protections-price-banding) (secondary)
- **IBKR market-to-limit (via search summary).** If the order "is only partially filled, the remainder of the order is canceled and re-submitted as a limit order with the limit price equal to the price at which the filled portion of the order executed". A full fill is not guaranteed. — [IBKR, "Market-to-Limit Orders"](https://interactivebrokers.ie/en/trading/orders/mtl.php)
- **Breach outcomes in regulation and industry.**
  - RTS 6 collars "block or cancel" orders, with a verified and authorized one-off override. — [EUR-Lex RTS 6](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32017R0589)
  - FIA: reject at the firm level; the exchange holds or rejects; orders are blocked while stale data is investigated. — [FIA (2024)](https://fia.org/sites/default/files/2024-07/FIA_WP_AUTOMATED%20TRADING%20RISK%20CONTROLS_FINAL_0.pdf)
  - B3: the rejection tunnel prevents registration; the auction tunnel triggers an auction; the protection tunnel extends it. — [B3 túneis](https://b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/regras-e-parametros-de-negociacao/tuneis-de-negociacao/)
- **Simulation conventions for unfilled quantity.**
  - Backtrader: limit orders fill at the open if the bar gaps through, at the limit if touched, otherwise not at all. — [Backtrader](https://www.backtrader.com/docu/order-creation-execution/order-creation-execution/)
  - Zipline: a volume cap (default 10% of bar volume for `FixedBasisPointsSlippage`) leaves the remainder open for later bars. — [zipline slippage.py](https://raw.githubusercontent.com/stefan-jansen/zipline-reloaded/main/src/zipline/finance/slippage.py)
  - LEAN backtests "assume orders completely fill". — [QuantConnect](https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/trade-fills/key-concepts)
  - TCA marks unfilled shares at the close: opportunity cost = unexecuted shares × (close − decision price). — [AnalystPrep](https://analystprep.com/study-notes/cfa-level-iii/measurement-and-determination-of-cost-of-trade/); [Hasbrouck (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)

### Inferences
These are illustrative calculations with stated assumptions: normal returns, uniform intraday variance, σ_d = 2%, overnight variance share s = 0.3 (from the US figure above; B3 is unknown), and a session of about 420 minutes.

- **Elapsed-time volatility.** The standard deviation of the move from the D-1 close to a fraction f of session D is σ_h ≈ σ_d·√(s + (1−s)·f):

  | Approval time | σ_h | k=2 band | Share of trades breaching a fixed ±1% band anchored at `P_dec` |
  |---|---|---|---|
  | At the open (f=0) | ≈1.1% | ±2.2% | ≈36% |
  | Mid-session (f=0.5) | ≈1.6% | ±3.2% | ≈54% |
  | At the close (f=1) | 2% | ±4% | ≈62% |

  For a 1.2%-volatility stock at mid-session, about 30% of trades would breach. A fixed 1% therefore flags a large and time-of-day-dependent share of ordinary trades, more for volatile stocks and later approvals. Fat tails would raise these shares further.
- **A 10-minute approval delay alone** has σ ≈ σ_d·√(0.7·10/420) ≈ 0.26%, so k=2 gives about ±0.5%. Over minutes, a fixed 1% is loose. Measured from the prior close, it is tight. It mixes two different checks.
- **Spread-only bands are far too tight over minutes.** Assume one tick (R$0.01) on a R$30 stock: the half-spread is about 1.7 bps, against about 26 bps of 10-minute volatility. The tick size is my assumption and is not sourced here. Spread multiples suit execution protection over seconds, or a floor for a volatility band.
- **Design suggestion: two separate checks instead of one 1% rule.**
  1. **Decision staleness**, `P_arr` vs `P_dec`. Flag when |ln(`P_arr`/`P_dec`)| > k·σ̂_d·√h_eff. Here σ̂_d is, for example, a 20–60-day EWMA of close-to-close volatility, or ATR/price, which includes gaps. h_eff counts the overnight share plus the elapsed session fraction plus extra closed days (weekends and holidays add overnight variance). Choose k by the target false-alarm rate under normality: k=2 ≈ 5%, k=2.58 ≈ 1%, k=3 ≈ 0.3%. A breach then means "unusual for this asset over this horizon" (possible news or regime change), not "the price moved".
  2. **Execution protection**, `P_exec` vs `P_arr`. Use a marketable limit at `P_arr`·(1 ± max(c·half-spread, k′·σ̂_d·√(Δt/T_session)))`, following CME protection and IBKR market-to-limit. Alternatively, drop the tolerance from the fill rule: fill at the first official auction strictly after the approval timestamp (opening auction if approved before the open, closing call otherwise). The price then does not depend on when the human clicked, and it can be reproduced from official data.
- **Breach handling consistent with the cited practice.** Never silently fill at `P_dec` and never silently drop the trade.
  - Warn and require a logged human override with a reason (IBKR precautionary settings; RTS 6 Art. 15(6)).
  - Or re-quote, recompute quantities at `P_arr` for the same target weights, and have the human re-approve (FIA staleness check).
  - Or cancel and book the opportunity cost marked at the close (TCA convention).
  - Whichever option is chosen, record the breach event so rejected trades do not create survivorship-style selection in the results.
- **σ needs no new dependency.** A volatility-scaled band needs only σ̂ from the same daily close series the project already holds (COTAHIST); no intraday data is required for the staleness check.

### Gaps
- I found no source giving B3-specific overnight vs intraday variance shares, or the intraday volatility profile of B3 large caps. The s=0.3 above is borrowed from US data.
- I found no published industry standard for k (number of σ) in price-tolerance checks. FIA explicitly gives no numbers.
- I found no empirical study of tolerance bands for human-in-the-loop approval delays.
- The CME and IBKR order-type details are from search excerpts of their documentation pages.

## 5. Slippage and cost models for liquid large caps; conservative assumptions for small orders

### Takeaway
Engines ship simple defaults:

- Zipline: 5 bps fixed slippage, a 10%-of-bar-volume cap and $0.001/share commission.
- LEAN: zero slippage by default.
- Backtrader: zero slippage and zero commission by default.

Research uses the square-root impact law (impact ∝ σ·√(Q/V)). For institutional orders around 1% of daily volume, live data show about 8–13 bps mean impact in developed markets, around 11 bps for large caps. For small orders, impact is negligible and the floor is the half-spread plus explicit fees. A fixed-bps slippage of a few bps on top of fees is a defensible conservative choice.

### Cited Findings
- **Zipline defaults.** The default equity slippage is `FixedBasisPointsSlippage()` (`equity_slippage or FixedBasisPointsSlippage()`). It defaults to `basis_points=5.0` ("Default is 5 basis points") and `volume_limit=0.1` ("Default is 10% of trading volume" per minute). The default equity commission is `PerShare()`. — [zipline-reloaded `simulation_blotter.py`](https://raw.githubusercontent.com/stefan-jansen/zipline-reloaded/main/src/zipline/finance/blotter/simulation_blotter.py); [`slippage.py`](https://raw.githubusercontent.com/stefan-jansen/zipline-reloaded/main/src/zipline/finance/slippage.py)
- **Zipline `PerShare` commission.** `PerShare(cost=0.001, min_trade_cost=0.0)`, "zipline's default commission model for equities" (one tenth of a cent per share, no minimum). — [Zipline API reference](https://zipline.ml4trading.io/api-reference.html)
- **Zipline `VolumeShareSlippage`.** The buy fill is price·(1 + price_impact·volume_share²), the reverse for sells, with defaults `volume_limit=0.025` and `price_impact=0.1`. — [Zipline API reference](https://zipline.ml4trading.io/api-reference.html)
- **QuantConnect LEAN.** "The default brokerage model is the DefaultBrokerageModel … which uses the NullSlippageModel to model zero slippage for all securities". A `VolumeShareSlippageModel` is available. — [QuantConnect, "Slippage – Key Concepts"](https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/slippage/key-concepts)
- **Backtrader.** `slip_perc` and `slip_fixed` default to 0.0, and `slip_open` defaults to `False`. `slip_match=True` caps slipped prices at the bar's high/low. The default commission scheme is `CommInfoBase(percabs=True)`, and `setcommission` defaults to `commission=0.0`. — [Backtrader, "Broker"](https://www.backtrader.com/docu/broker/)
- **Textbook first approximation.** "As a first approximation, the transaction costs can be modeled as proportional to the turnover"; "If the liquidity is not enough compared to the size of the turnover, then slippage may have a significant effect". The book illustrates daily rebalancing with 60 bps fees. — [Palomar §8.2](https://portfoliooptimizationbook.com/book/8.2-seven-sins.html)
- **Square-root law (Bouchaud).** The price "on average moves up (down) by an amount proportional to sqrt(Q)" for a metaorder of size Q, "approximately independent of both N and of the total time T", "provided the participation rate is not too large". — [J.-P. Bouchaud, "The Square-Root Law of Market Impact" (Substack, Dec 2024)](https://bouchaud.substack.com/p/the-square-root-law-of-market-impact)
- **Square-root law, other references (via search summaries).**
  - The empirical form is usually written Y·σ·√(Q/V), with σ the daily volatility, V the daily volume and Y of order one. — [arXiv:1412.0141](https://arxiv.org/pdf/1412.0141)
  - Tóth, Eisler & Bouchaud find the law also holds in option markets. — [arXiv:1602.03043](https://arxiv.org/pdf/1602.03043)
  - Durin, Rosenbaum & Szymanski report "two square root laws". Smaller participation rates give a more linear dependence on participation. — [arXiv:2311.18283](https://arxiv.org/pdf/2311.18283)
- **Live-trade costs (Frazzini, Israel & Moskowitz, 2012 draft).**
  - The average (median) trade was 1.2% (0.5%) of daily volume.
  - Mean market impact was 12.18 bps (median 7.98; value-weighted 18.65).
  - Large-cap trades averaged 11.21 bps of impact vs 21.27 bps for small caps.
  - About 70% of impact was permanent: of an average 9 bps, only about 2.5 bps reversed within 24 hours (US 1-day trades).
  - "The variable with the largest impact on trading costs is the square root of the fraction of daily volume".

  — [Frazzini, Israel & Moskowitz (2012 draft)](https://conference.nber.org/conf_papers/f68262/f68262.pdf)
- **Secondary summary of the 2018 version (via search summary).** Average spread at arrival of about 21 bps. Average impact for trades completed within a day just under 9 bps, median just over 6 bps, dollar-weighted mean just over 15 bps. Most of AQR's trades used passive limit orders and so rarely paid the full or half spread. — [L. Swedroe, ETF.com, "Trading Cost Truths"](https://www.etf.com/sections/index-investor-corner/swedroe-trading-cost-truths) (secondary)
- **Small orders.** A marketable order pays the effective cost, trade price minus the prevailing midpoint, which is on average the half-spread for small market orders. For example, with a $0.10 spread, market orders pay "(on average) $0.05 above the midpoint". — [Hasbrouck (2015)](https://pages.stern.nyu.edu/~jhasbrou/Teaching/POST%202015%20Fall/classNotes/STPPTradingCosts.pdf)

### Inferences
- **Square-root impact is negligible at TCC order sizes.** Take Q/V = 10⁻⁵ (a small paper order in a B3 large cap; my assumption) and σ_d = 2%. Y·σ·√(Q/V) ≈ 2%·0.0032 ≈ 0.6 bps for Y = 1, below a one-tick half-spread. Impact modeling adds little; the half-spread plus explicit B3 fees (emolumentos and liquidação) plus any brokerage fee dominate.
- **A conservative default.** Charge (i) the half-spread observed at approval, if a live quote is recorded, or an assumed fixed 5 bps per side, mirroring Zipline's default, when only daily data exist; (ii) explicit fees; and (iii) the delay cost from Q2 reported as a separate line, not folded into slippage. AQR's institutional numbers (about 9–13 bps mean for orders around 1% of ADV) give an upper reference that small orders should not exceed in liquid names.
- **For auction fills (opening auction or closing call),** the spread does not apply in the same way, because every participant trades at a single auction price. A small fixed-bps charge plus fees remains the conservative choice.

### Gaps
- I found no source on current B3 quoted or effective spreads for IBOV large caps, nor on the current B3 fee schedule. Other research tracks may cover these.
- I did not verify the Almgren, Thum, Hauptmann & Li (2005) "Direct Estimation of Equity Market Impact" coefficients.
- I did not verify Novy-Marx & Velikov (2016) cost estimates.
- The 2018 Frazzini et al. figures come only from secondary summaries.
- I did not verify the original Tóth et al. (2011) PRX paper on the square-root law.
