# B3 microstructure for execution timing and a preview-to-approval price tolerance (PETR4, VALE3, ITUB4, WEGE3, BBAS3)

Research date: 18/10/2026 (Sunday; last session in the data is Fri 16/10/2026). Rules are tagged with the date
of the document they come from. **[COMPUTED]** marks numbers I calculated from public data. They are not quotes
from a source. The data source is linked, and the method is in section 4 ("Method"). Everything under
"Inferences" is my reasoning and is not a source statement. Scripts and raw outputs are kept outside the repo, in
`C:\Users\LUCAS\AppData\Local\Temp\claude\c--Users-LUCAS-Meu-Canto-TCC-Hedge-Fund-Lab\09d45f7d-1459-413b-8cd5-c0848619d502\scratchpad\`
(`b3stats.py`, `cotahist_stats.py`, `extra_stats.py`, outputs in `out\`). That scratchpad is temporary.

## 1. Session schedule (incl. seasonal shifts) and how the official opening and closing prices are formed

### Takeaway
In the current (US-summer) regime, B3 cash equities run a 09:45–10:00 opening call, continuous trading 10:00–16:55,
a closing call 16:55–17:00 (extendable), and an after-market 17:30–18:00. B3 shifts the session one hour later
while the US is on standard time. In 2025/26 that meant continuous trading until 17:55 and no equity after-market
from 03/11/2025 to early March 2026. Both official prices come from single-price call auctions: the price that
maximizes executed quantity. Yahoo's daily Open/Close matched B3's official file on about 99% of sessions.
Yahoo's intraday bars do not contain the closing-call print.

### Cited Findings
- Current B3 equities trading-hours table (page shows no effective date; read 18/10/2026). Cash market, fractional market, organized OTC and funds: offer cancellation 09:30–09:45; **pre-opening (opening call) 09:45–10:00; continuous trading 10:00–16:55; closing call 16:55–17:00**; after-market: cancellation 17:25–17:30, **trading 17:30–18:00**, cancellation 18:25–18:45. Forward market 10:00–17:25. Block trades ("Grandes Lotes") 10:00–16:55. Options: closing call 16:55–17:15. Equity ETFs: pre-opening 09:45–10:05, trading 10:05–16:55, call 16:55–17:15. Trade corrections are allowed until 19:00. Expiring option series stop at 15:45 on expiry day — [B3, Horário de negociação – Ações](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/horario-de-negociacao/acoes/)
- US-winter shift, 2025/26 precedent: B3 extended hours "para acompanhar o fim do horário de verão em Nova York a partir de 3 de novembro" (2025). The cash and fractional markets opened at 10:00 and closed at **17:55** instead of 17:00 — [BP Money/Broadcast, 15/10/2025](https://bpmoney.com.br/?p=381211). The new hours ran from Mon 03/11/2025 "até o início de março de 2026". There was **no equity after-market except on option-expiry days**. Offer cancellation windows were 09:30–09:45 and 18:25–18:45 — [Money Times, 03/11/2025](https://www.moneytimes.com.br/de-olho-no-relogio-b3-opera-em-novo-horario-a-partir-desta-segunda-feira-3-lils/)
- Since 09/03/2026 the grid follows US summer time again: pre-opening 9:45–10:00, regular session 10:00–16:55, closing call 16:55–17:00, after-market 17:30–18:00 — [Renova Invest (secondary), 2026](https://renovainvest.com.br/blog/horario-da-bolsa-quando-abre-e-fecha-o-pregao-na-b3/). This matches B3's table above.
- Nov/2026: secondary sources only. One says the session "deve voltar a fechar às 18h" in November 2026 — [Renova Invest](https://renovainvest.com.br/blog/horario-da-bolsa-quando-abre-e-fecha-o-pregao-na-b3/). A Suno article says "a partir de 8 de novembro" the session runs until 18h with the after-market suspended, but it does not state the year — [Suno](https://www.suno.com.br/noticias/b3-b3sa3-agenda-negociacao-horario-de-verao/amp/). I found no B3 circular for Nov/2026.
- Brazil has no DST in 2026/2027. The Ministry of Mines and Energy keeps it suspended (energy agenda monitoring report of 31/08/2026; press note of 21/09/2026). It has been suspended since 2019 — [Jornal do Brasil, 05/10/2026](https://www.jb.com.br/editorias/2026/10/05/horario-de-verao-2026.html)
- Auction price-formation rules (B3 "Regras de Pré-Abertura/Pré-Fechamento/Fixing", file 202512, i.e. Dec/2025). The theoretical price is set by three criteria in order:
  1. The price at which the largest quantity trades.
  2. If tied, the prices with the smallest buy and sell imbalance; within that range, the price closest to the last trade (or, if there is none, the adjusted close or settlement).
  3. A further tie-break, again closest to the last trade.

  The system uses a price scale. There is no pro-rata at the same price. Buy orders above and sell orders below the theoretical price fill completely; orders at the price may fill fully, partly or not at all — [B3, Regras de Pré-Abertura/Pré-Fechamento/Fixing (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF)
- Priority in auctions: market orders for the auction (MOA) and market-on-close orders for the closing call (**MOC**) are filled first. If they are not fully filled when the auction opens, the remainder is eliminated. Limit orders follow time priority at the same price. After the free-cancellation period, orders that take part in the theoretical price can only improve price or add quantity — [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF)
- Auction extensions ("prorrogação") are triggered by changes in: the theoretical price; the theoretical quantity; a new order that changes the fill of an earlier one; or the unmatched balance. The protection tunnel or a B3 decision can also trigger one. The schedule:

  | Extension | Triggered when a criterion changes in the last… | Extension length |
  |---|---|---|
  | 1st | 3 min (inclusive) | **1 min (opening call) / 5 min (closing call)** |
  | 2nd | 30 s | 1 min |
  | 3rd | 15 s | 1 min |
  | 4th | 15 s | **random close between 30 and 60 s** |

  After the 3rd extension the cycle repeats indefinitely. For ETFs and options, the 1st closing-call extension is 1 min — [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF). The Aug/2023 version has the same table — [B3 Regras (202308)](https://www.b3.com.br/data/files/65/22/B2/BD/62CD9810746C7D98AC094EA8/202308%20-%20Regras%20de%20Pre-Abertura_%20Pre-fechamento_%20Fixing.pdf)
- The pre-opening auctions of the instruments B3 defines are **synchronized**: they start and end together, "ainda que o encerramento seja realizado de forma randômica todos os dias" — [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF)
- Closing auction, from B3's investor-education site (19/11/2025): it takes place in the last five minutes of the regular session, "geralmente entre 16h55 e 17h". The system continuously computes the equilibrium price that allows the largest volume. At the end, compatible orders execute simultaneously at that price, "que vira o preço oficial de fechamento do dia". Orders without a match stay pending for the next session. The auction "serve como referência para diversos índices e fundos de investimento". Eligible assets are set by B3 criteria, e.g. Ibovespa members — [B3 Bora Investir, "Leilão de fechamento"](https://borainvestir.b3.com.br/glossario/leilao-de-fechamento/)
- After-market: only stocks in B3 benchmark indices (Ibovespa, IBrX-50, IBrX-100) may trade, with a maximum move of **±2%** relative to the regular-session close. One source puts the reference at the last regular-session trade — [Renova Invest, After Market B3](https://renovainvest.com.br/blog/after-market/). B3's 22/04/2022 tunnel table also lists "Limite de Oscilação no After Market" at ±2% — [B3 tunnel table 22/04/2022](https://www.b3.com.br/data/files/59/E0/41/CF/373508104532BBF7AC094EA8/20220425.Segmento%20BOVESPA_Tuneis%20de%20Negociacao%20-%20portugues.pdf)
- Official daily file (COTAHIST) field definitions: PREABE = opening price; **PREULT = "preço do último negócio do papel-mercado no pregão"**; **PREMED = "preço médio do papel-mercado no pregão"**; PREOFC/PREOFV = best bid/ask ("melhor oferta de compra/venda"); TOTNEG = number of trades; VOLTOT = turnover in R$. TPMERC 010 = cash (round lot), 020 = fractional — [B3, Layout COTAHIST v2.0, 05/10/2020](https://www.b3.com.br/data/files/33/67/B9/50/D84057102C784E47AC094EA8/SeriesHistoricas_Layout.pdf)
- **[COMPUTED]** PREMED equals VOLTOT/QUATOT, i.e. it is the session VWAP. Example: PETR4F on 16/10/2026, R$8,285,345.15 / 141,502 shares = 58.55 = PREMED — data [B3 COTAHIST 2026](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP)
- **[COMPUTED]** Yahoo vs B3 official, 448 sessions (02/01/2025–16/10/2026):
  - Yahoo daily Close = B3 PREULT (within R$0.005) on 98.7% of sessions (PETR4, VALE3), 99.6% (WEGE3) and 99.3% (BBAS3).
  - Yahoo daily Open = B3 PREABE on 99.3–99.8% of sessions.
  - Mismatches reached 61 bp: PETR4 16/03/2026, B3 45.58 vs Yahoo 45.86.
  - ITUB4 matched on only 44.6% of sessions. The reason: Yahoo's "unadjusted" (auto_adjust=False) series is back-adjusted for bonus issues. B3/Yahoo price ratio was 1.133 until 17/03/2025, 1.030 from 18/03/2025 to 23/12/2025, and 1.000 from 26/12/2025 — data [B3 COTAHIST 2025](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2025.ZIP), [B3 COTAHIST 2026](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP), [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/ITUB4.SA/history/)
- **[COMPUTED]** Yahoo 5-min bars (`prepost=False`, last 60 sessions ≈ 21/07–16/10/2026) end with the **16:50 bar**. There is no 16:55 closing-call bar on at least 56 of 57 sessions. The first 5-min bar's Open equals the official open on only 61% (ITUB4) to 79% (VALE3, WEGE3) of days — data [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/PETR4.SA/)
- **[COMPUTED]** Closing-call move = official close vs the last continuous price (close of the 16:50–16:55 bar), 57 sessions Jul–Oct/2026 — data [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/PETR4.SA/):

  | | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | mean \|Δ\| (bp) | 16 | 16 | 20 | 20 | 22 |
  | median \|Δ\| (bp) | 13 | 15 | 18 | 14 | 20 |
  | p90 \|Δ\| (bp) | 35 | 33 | 42 | 39 | 43 |

### Inferences
- Several official, auditable daily prices exist: the opening-call price (PREABE / Yahoo Open), the closing-call price (PREULT / Yahoo Close), the session VWAP (PREMED, end of day only) and High/Low. A "last quote" is not an official price.
- Execution windows for an approval at time t (Mar–Nov regime):
  - before 16:55: continuous trading;
  - until the call ends (≥17:00, later with extensions): the closing call, via MOC/limit order;
  - 17:30–18:00: after-market only (index stocks, ±2% band, thin);
  - otherwise: the next day's opening call (orders accepted from 09:45).

  In the winter regime every cut-off moves +1 h (2025/26 precedent).
- Brasília time stays UTC−3 all year (no Brazilian DST in 2026/27), but B3 moves its grid twice a year with US DST. The app clock should read cut-offs from a B3 calendar or config, not hard-code 16:55/17:00. US DST ends Sun 01/11/2026 (first Sunday of November), and 02/11 is the Finados holiday, so the next shift would plausibly start Tue 03/11/2026. This is unconfirmed.
- The Suno "8 de novembro" date matches the US DST calendar of 2021 (DST ended 07/11/2021), not 2026. It is probably an old article.
- The intraday last price (16:50 bar) differs from the official close by about 16–22 bp on average. A chart or "current price" built from Yahoo intraday bars will not land on the official close. Always use the daily Close (or COTAHIST PREULT) as the official close. That is already the project's marking source (DP-27).
- All five tickers are Ibovespa members, so all should take part in the closing call. I did not re-check this against B3's current theoretical portfolio.

### Gaps
- No B3 primary source (ofício/comunicado) found for the Nov/2026 schedule shift. The winter-regime closing-call times (presumably 17:55–18:00) are not confirmed from a primary source.
- I did not retrieve the formal definition of "preço de fechamento" in B3's Manual de Procedimentos Operacionais. Whether COTAHIST PREULT/PREMED include after-market trades is unconfirmed. The ~1% of sessions where Yahoo Close ≠ PREULT might be after-market prints or data corrections; not verified.
- I did not test whether Yahoo returns closing-call or after-market bars with `prepost=True`.

## 2. Price-protection mechanisms: tunnels, auction extensions, circuit breaker; typical widths for liquid stocks

### Takeaway
B3 protects prices in three ways:
- **Rejection tunnels:** orders outside them are refused.
- **Auction tunnels:** a trade outside them sends the stock into an auction.
- **Protection tunnels during auctions and calls:** these extend the auction instead of printing.

In the latest public equities table (22/04/2022), IBOV/IBrX stocks had auction tunnels of ±1.5% vs the last trade and ±2% vs a 15-second average price, ±1.5% protection during the calls, and a ±2% after-market limit. A market-wide circuit breaker halts trading at Ibovespa −10% (30 min), −15% (1 h) and −20% (halt length set by B3).

### Cited Findings
- Tunnel classes. Static tunnels have limits fixed by B3. Dynamic tunnels move during the session, either synchronous (tied to a real-time reference price) or asynchronous. Tunnel types:
  - rejection tunnels block orders beyond a limit;
  - auction tunnels trigger an auction automatically, by price or quantity;
  - protection tunnels during auctions and calls "automatically extend" the auction when hit.

  Reference-price methods: LAST TRADED PRICE, C-LAST (last price bounded by best bid/ask), MOST RECENT. The page's ±2% example is illustrative only — [B3, Túneis de negociação](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/regras-e-parametros-de-negociacao/tuneis-de-negociacao/)
- B3 "Parâmetros para os Túneis de Negociação – Mercado de Ações", 22/04/2022, the latest equities table I found. **Cash market, IBOV and IBXX stocks:**
  - rejection tunnel 20%, base price LTP;
  - **auction tunnel vs last price ±1.5%**;
  - **average-price tunnel ±2%**, recalculated every 15 s (OC 030/2015-DP);
  - protection during auctions ±6%;
  - **protection during the calls ±1.5%**;
  - after-market limit ±2%.

  The table lists "Limites de Oscilação" as +100/−50; my reading is that this applies to the cash block.

  | Group | Last-price tunnel | Avg-price tunnel | Protection in auctions | Protection in calls | After-market |
  |---|---|---|---|---|---|
  | Cash, other-index stocks | 3% | 4% | 6% | 3% | 2% |
  | Cash, other stocks | 8.5% | 10% | 15% | 3% | 2% |
  | **Fractional, IBOV/IBXX** | 7.5% | 7.5% | 10% | 7.5% | 2% |

  Source: [B3 tunnel table 22/04/2022](https://www.b3.com.br/data/files/59/E0/41/CF/373508104532BBF7AC094EA8/20220425.Segmento%20BOVESPA_Tuneis%20de%20Negociacao%20-%20portugues.pdf). The PDF columns are garbled in extraction. I mapped them by position, and the news item below confirms the mapping.
- B3 temporarily widened the IBOV/IBrX tunnels for the 2022 election, "para manter a fluidez do mercado durante o período eleitoral": auction tunnel on the last trade price **1.5% → 2.0%**, average-price auction tunnel **2.0% → 3.0%**, and options' underlying shock 1.5% → 2.0%. Effective from publication (27/09/2022) until 09/12/2022, extendable — [Monitor Mercantil, 27/09/2022](https://monitormercantil.com.br/b3-revisao-dos-parametros-dos-tuneis-de-negociacao/)
- Options-on-stocks tunnel table, 02/10/2023: maximum auction volatility shock 45% for liquid assets and 50% for illiquid ones (OC 089/2023-VNC). The underlying-asset shock is 1.5% for IBOV/IBRX underlyings — [B3 options tunnel table 02/10/2023](https://www.b3.com.br/data/files/47/B4/72/92/DC0FA810DCC989A88C094EA8/20231002.Segmento%20BOVESPA_Tuneis%20de%20Negociacao%20-%20Novo_PT_.pdf)
- B3 OC 032/2018-PRE introduced concentration and quantity protection tunnels during auctions and the opening and closing calls. I saw the document title only — [B3 OC 032/2018-PRE](https://www.b3.com.br/data/files/9A/D1/48/CC/046846109988C646AC094EA8/OC%20032-2018-PRE%20Implementacao%20dos%20Tuneis%20de%20Protecao%20por%20Concentracao%20e%20por%20Quantidade%20durante%20Leiloes%20e%20Calls%20de%20Abertura%20e%20Fechamento.pdf)
- Auction extension schedule: see section 1. The 1st closing-call extension is 5 min, then 1 min, 1 min, then a random 30–60 s close — [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF)
- Circuit breaker (B3 page dated 03/11/2020), measured against the previous Ibovespa close:
  - (i) Ibovespa −10%: all trading in assets, derivatives and private fixed income is interrupted for **30 minutes**;
  - (ii) after resuming, −15%: halted for **one hour**;
  - (iii) after resuming, −20%: B3 may suspend trading for a period it announces.

  (i)–(iii) do not apply in the last 30 minutes of the session. If the breaker triggers in the last hour, the session end is postponed by at most 30 minutes — [B3, Circuit breaker](https://www.b3.com.br/en_us/news/circuit-breaker.htm)
- B3's investor glossary says intraday auctions are "acionado[s] em situações de alta volatilidade ou baixa liquidez" and can be extended if the theoretical price or volume changes significantly. It gives no numbers — [B3 Bora Investir, "Leilão de ações"](https://borainvestir.b3.com.br/glossario/leilao-de-acoes/)

### Inferences
- Under the 2022 parameters, a single aggressive order for these five stocks that would print more than about 1.5% from the last trade, or more than about 2% from the 15-s average price, sends the stock into an auction. B3 treats moves above roughly 1.5–2% within seconds as abnormal and needing price discovery. That makes 1.5–2% a natural upper anchor for a preview→approval tolerance.
- The tunnels are instantaneous, not 15–30-minute caps. Prices can drift beyond 2% over an hour through many small trades. Section 4 shows this is rare for these names: under 1% of 60-min windows for PETR4, ITUB4 and WEGE3; 1.2% for VALE3 and 1.4% for BBAS3.
- Protection during the calls is ±1.5%. A large imbalance therefore produces closing-call extensions, which can push the official close past 17:00 (17:05+ after the 1st extension), rather than a jump. The approval cut-off for "fill at today's close" should leave margin before 16:55.
- A stock in an intraday auction, or the market in a circuit-breaker halt, has no executable price. The simulator should treat such moments as "not executable now" or defer to the next auction, not use the stale last quote.
- 2026 is also an election year (1st round Sun 04/10/2026, run-off 25/10/2026). B3 may have widened tunnels again, as in 2022. Not verified.

### Gaps
- Current (2026) equities tunnel parameters were not retrievable. B3's "Parâmetros dos túneis de negociação" page returned HTTP 500, and the newest equities table I found is dated 22/04/2022. B3 states parameters can change without notice.
- No primary source found for the minimum duration of an intraday stock auction.
- The "Limites de Oscilação 100/−50" reading is uncertain.

## 3. Tick size, lot size, bid-ask spreads (bps) and turnover

### Takeaway
The tick is R$0.01, so the minimum possible spread is 1.5–4.2 bp at current prices (WEGE3 and ITUB4 ≈2.1 bp; BBAS3 is the coarsest at 4.2 bp). B3's end-of-day best bid/ask gives median quoted spreads of 3.3–8.4 bp. Older order-book research found effective spreads of about 0.07–0.13% for liquid stocks. Average daily turnover is R$0.4–2.1 bn, so an order of a few thousand reais is far smaller than one average trade (R$17–43k). The practical issue is the **round lot of 100 shares** (R$2.4–6.6k per lot today). Odd lots go to the fractional market, where prices differ from the lot market by about 13–22 bp at the close.

### Cited Findings
- Tick: one cent of real. Araújo, Barbedo and Vicente (BCB WP 263) note stocks with spreads "greater than the minimum tick (one cent of real)" — [BCB Working Paper 263, Nov/2011](https://www.bcb.gov.br/pec/wps/ingl/wps263.pdf). A Capital Aberto column (06/03/2026) says that in the most liquid assets the nominal spread equals one tick, with bid and ask "distantes por apenas R$ 0,01", so the tick acts as a floor. It notes the CVM AIR report recommends studying tick size, and describes no concrete B3 change — [Capital Aberto, Aline Menezes, 06/03/2026](https://capitalaberto.com.br/colunistas/2026/03/o-diabo-mora-nos-detalhes-e-cobra-spread)
- Lots: the standard lot is typically 100 shares; trades must be multiples of 100. The fractional market trades 1–99 shares, in the same environment as the cash market. Fractional prices can differ slightly because of lower liquidity — [Suno, Lote padrão](https://www.suno.com.br/artigos/lote-padrao/amp/)
- Academic spreads, BCB WP 263 (BM&FBovespa order and trade data, 18/10/2007–24/04/2008, trades 10:05–16:55 only, so auctions excluded):
  - mean spread 3.82 cents = **0.11% of price**; median 0.09%; quartiles 0.07%–0.13% (second period: 3.31 cents, 0.10%);
  - PETR4 had the lowest percentage spread and VALE5 the lowest absolute spread;
  - the adverse-selection component is about 65% of the spread;
  - spreads are U-shaped across trade sizes (lowest for medium trades); adverse selection is U-shaped across the day — [BCB WP 263](https://www.bcb.gov.br/pec/wps/ingl/wps263.pdf)
- **[COMPUTED]** Tick floor at the 16/10/2026 close and the cost of one 100-share lot — data [B3 COTAHIST 2026](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP):

  | | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | close (R$) | 59.68 | 66.21 | 48.09 | 47.99 | 23.63 |
  | 1 tick (bp) | 1.68 | 1.51 | 2.08 | 2.08 | 4.23 |
  | 100-share lot (R$) | 5,968 | 6,621 | 4,809 | 4,799 | 2,363 |

- **[COMPUTED]** Quoted spread from B3's **end-of-session** best bid/ask (PREOFC/PREOFV), 448 sessions 02/01/2025–16/10/2026 — data [B3 COTAHIST](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP). This is a snapshot after the closing call, not the continuous-session spread:

  | | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | median (bp) | 3.3 | 3.8 | 7.1 | 8.4 | 7.1 |
  | mean (bp) | 5.4 | 5.7 | 9.5 | 11.3 | 9.4 |
  | p90 (bp) | 10 | 12 | 20 | 26 | 18 |
  | share at 1 tick | 52% | 31% | 27% | 19% | 48% |
  | share ≤ 2 ticks | 78% | 50% | 47% | 34% | 73% |

- **[COMPUTED]** Turnover and trade counts, B3 lot market (VOLTOT/TOTNEG) — data [B3 COTAHIST](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP):

  | | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | ADTV, last 252 sessions (R$) | 1.83 bn | 1.75 bn | 1.16 bn | 394 mn | 637 mn |
  | ADTV, last 60 sessions (R$) | 2.14 bn | 1.63 bn | 1.25 bn | 426 mn | 801 mn |
  | trades/day | 50.5k | 40.8k | 39.8k | 23.4k | 33.4k |
  | average trade (R$) | 36.3k | 42.8k | 29.1k | 16.8k | 19.1k |

  Yahoo-based ADTV for the same year matches within 0.1% (e.g., PETR4 R$1,835.5 mn).
- **[COMPUTED]** Fractional market (PETR4F etc., TPMERC 020), last 252 sessions — data [B3 COTAHIST](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP):

  | | PETR4F | VALE3F | ITUB4F | WEGE3F | BBAS3F |
  |---|---|---|---|---|---|
  | share of combined turnover | 0.34% | 0.37% | 0.27% | 0.50% | 0.74% |
  | ADTV (R$ mn) | 6.3 | 6.5 | 3.1 | 2.0 | 4.8 |
  | fractional vs lot close, mean \|Δ\| (bp) | 13 | 14 | 21 | 22 | 15 |
  | fractional vs lot VWAP, mean \|Δ\| (bp) | 12 | 12 | 13 | 15 | 16 |
  | end-of-session quoted spread, median (bp) | 6.1 | 6.7 | 15.4 | 13.6 | 5.3 |

### Inferences
- An order of R$1–10k is at most about 0.003% of ADTV (R$10k vs WEGE3's R$394 mn) and smaller than one average trade, so market impact is effectively zero. The relevant explicit cost per side is about half a spread: about 1–4 bp in the lot market during continuous trading. That comes from the 1-tick floor and the 0.07–0.13% effective spreads in WP 263, which predate the current HFT-heavy market. B3 fees and brokerage are outside this note. All of these are an order of magnitude below the 15–30-minute price noise in section 4.
- Lot granularity matters more than impact. Example: R$5,000 buys 83 PETR4 shares at R$59.68, all in the fractional market. The simulator should state whether it fills odd lots at the lot-market reference price. The deviation is about 13–22 bp mean at the close. If it does not, it should require multiples of 100 (DP-20 already keeps "ações inteiras e sobra em caixa").
- If a spread cost is modelled, a defensible simple assumption is half-spread = max(1 tick, about 2–5 bp) for these five names. Close-of-session spreads from COTAHIST would overstate continuous-session spreads.

### Gaps
- I found no recent (2020s) public study with quoted or effective spreads in bp specifically for PETR4, VALE3, ITUB4, WEGE3 and BBAS3. WP 263 data is from 2007–08.
- No free source of continuous-session bid/ask history was found. Yahoo intraday bars carry no quotes, and COTAHIST has only the end-of-session best bid/ask.

## 4. Volatility: daily, ATR, overnight vs intraday, and expected moves over 15–60 minutes

### Takeaway
Over the last year these stocks had daily close-to-close σ of about 1.7–2.0% (26–32% annualized) and ATR(14) of about 2.3–2.8%. The mean overnight gap |open/prev close − 1| was 0.6–0.8%, and the mean |open→close| was 1.0–1.3%. The overnight leg is 26–44% of daily variance.

Intraday, the empirical RMS move over h minutes is close to σ_open→close × √(h/415). The tails are fatter than normal, and the first 30 minutes are about twice as volatile:
- over **15 min**: median |move| 13–17 bp, p95 56–72 bp;
- over **30 min**: median 19–25 bp, p95 79–97 bp;
- over **60 min**: p95 102–139 bp.

#### Method (computations, not source statements)
- Python 3.13 with yfinance 1.5.1 (pandas 3.0.3) from the repo `.venv`; scripts run from the scratchpad, nothing written to the repo.
- **Daily:** Yahoo daily OHLC with `auto_adjust=True`, which removes dividend and split jumps from gaps. 3y window = 2023-10-16→2026-10-16 (749 returns); 1y window = last 252 returns (2025-10-10→2026-10-16). Turnover uses unadjusted Close×Volume.
- **Definitions:** gap = Open_t/Close_{t−1} − 1 (close-to-open); oc = Close/Open − 1; range = (High−Low)/Close_{t−1}; ATR(14) = 14-day mean true range / Close.
- **Intraday:** Yahoo 5-min bars, last 60 sessions (≈21/07–16/10/2026), continuous session only (bars 10:00–16:50, BRT). Horizon-h returns are log(C_{t+h}/C_t) between bar closes inside the same session, pooled over every start bar. That pooling is equivalent to a uniformly random approval time.
- **Benchmark:** σ√t uses σ_oc = std of daily log(Close/Open) over 1y (or 60d), scaled by √(h/415), where 415 min is the 10:00–16:55 continuous session.
- **Official cross-check:** B3 COTAHIST.

### Cited Findings
- **[COMPUTED]** Daily statistics, last 1y (252 sessions to 16/10/2026) — data [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/PETR4.SA/history/):

  | 1y | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | σ daily close-to-close | 1.78% | 1.69% | 1.68% | 1.82% | 1.99% |
  | annualized vol | 28.2% | 26.8% | 26.6% | 28.9% | 31.6% |
  | \|close-to-close\| p50 / p95 / p99 (bp) | 104/357/472 | 94/362/466 | 89/334/450 | 101/359/480 | 110/393/597 |
  | Parkinson σ (High/Low) | 1.47% | 1.43% | 1.36% | 1.69% | 1.73% |
  | ATR14 mean / at 16/10/2026 | 2.51/2.87% | 2.45/2.84% | 2.29/**3.63%** | 2.71/2.98% | 2.75/**4.27%** |
  | (H−L)/prev close, mean / median | 2.26/2.07% | 2.20/2.08% | 2.11/2.01% | 2.62/2.43% | 2.60/2.28% |
  | overnight gap \|O/C₋₁−1\|, mean / median | 0.83/0.57% | 0.71/0.59% | 0.68/0.48% | 0.63/0.43% | 0.64/0.41% |
  | gap p90 / p95 | 1.97/2.52% | 1.55/1.89% | 1.39/1.86% | 1.40/1.75% | 1.34/2.09% |
  | share of days with \|gap\| > 1% | 27% | 24% | 20% | 20% | 17% |
  | \|open→close\|, mean / median | 1.08/0.83% | 1.08/0.80% | 0.99/0.83% | 1.24/1.02% | 1.30/0.97% |
  | σ open→close (log) | 1.42% | 1.40% | 1.30% | 1.58% | 1.72% |
  | overnight share of daily variance | 44% | 32% | 38% | 26% | 27% |

- **[COMPUTED]** Over 3y (2023-10-16→2026-10-16), volatility was lower:
  - σ close-to-close: PETR4 1.65%, VALE3 1.53%, ITUB4 1.39%, WEGE3 1.83%, BBAS3 1.65% (22–29% annualized);
  - mean |gap|: 0.65 / 0.68 / 0.49 / 0.52 / 0.44%; gap p95: 2.19 / 1.86 / 1.43 / 1.48 / 1.28%;
  - mean |open→close|: 1.03 / 0.91 / 0.90 / 1.14 / 1.04%;
  - ATR14 mean: 2.27 / 2.11 / 1.98 / 2.47 / 2.23%.

  Source: [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/VALE3.SA/history/)
- **[COMPUTED]** |log return| over h minutes inside the continuous session (bp), 60 sessions Jul–Oct/2026, ≈4,200–4,750 windows per cell. "RMS" is the empirical root-mean-square; "σ√t" is the 1y σ_oc × √(h/415) benchmark — data [Yahoo Finance 5-min via yfinance](https://finance.yahoo.com/quote/BBAS3.SA/):

  | h | stat | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|---|
  | 5 min | median / p95 | 8 / 34 | 8 / 32 | 8 / 33 | 8 / 38 | 10 / 42 |
  | 15 min | median / p90 / p95 / p99 | 14 / 44 / 59 / 92 | 13 / 41 / 56 / 105 | 14 / 42 / 57 / 96 | 15 / 46 / 63 / 103 | 17 / 54 / 72 / 124 |
  | 15 min | RMS vs σ√t | 27.8 vs 26.9 | 28.8 vs 26.6 | 28.4 vs 24.7 | 29.9 vs 30.1 | 35.7 vs 32.8 |
  | 30 min | median / p90 / p95 / p99 | 21 / 63 / 83 / 125 | 19 / 59 / 79 / 172 | 19 / 59 / 79 / 127 | 21 / 62 / 81 / 132 | 25 / 75 / 97 / 166 |
  | 30 min | RMS vs σ√t | 39.1 vs 38.0 | 41.0 vs 37.6 | 38.7 vs 34.9 | 40.2 vs 42.5 | 49.9 vs 46.4 |
  | 45 min | median / p95 / p99 | 25 / 98 / 145 | 24 / 93 / 198 | 23 / 95 / 145 | 25 / 92 / 154 | 31 / 118 / 199 |
  | 60 min | median / p90 / p95 / p99 | 29 / 89 / 111 / 155 | 27 / 80 / 104 / 217 | 28 / 82 / 111 / 162 | 29 / 79 / 102 / 168 | 36 / 107 / 139 / 224 |
  | 60 min | RMS vs σ√t | 53.5 vs 53.8 | 55.9 vs 53.1 | 52.1 vs 49.4 | 53.0 vs 60.1 | 68.3 vs 65.5 |
  | 120 min | median / p95 / p99 | 42 / 150 / 223 | 42 / 146 / 249 | 40 / 154 / 214 | 42 / 132 / 209 | 53 / 195 / 306 |

- **[COMPUTED]** Share of h-minute windows whose |move| exceeds a fixed band — same data:

  | | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | 15 min > 0.5% | 7.6% | 6.6% | 7.0% | 8.6% | 11.6% |
  | 15 min > 1% | 0.7% | 1.2% | 0.8% | 1.2% | 1.9% |
  | 30 min > 1% | 2.8% | 2.9% | 2.5% | 2.6% | 4.6% |
  | 30 min > 1.5% | 0.3% | 1.2% | 0.5% | 0.6% | 1.4% |
  | 60 min > 1% | 6.8% | 5.6% | 6.6% | 5.5% | 11.7% |
  | 60 min > 1.5% | 1.3% | 2.1% | 1.4% | 1.3% | 3.8% |
  | 60 min > 2% | 0.4% | 1.2% | 0.3% | 0.7% | 1.4% |
  | 120 min > 2% | 1.9% | 1.9% | 1.5% | 1.1% | 4.5% |

- **[COMPUTED]** Tail shape:
  - p95/RMS ≈ 1.9–2.1 (normal: 1.96);
  - p99/RMS ≈ 3.2–3.3 for PETR4, ITUB4, WEGE3 and BBAS3 at 30 min, and 4.2 for VALE3 (normal: 2.58);
  - RMS/(σ_oc√(h/415)) is 0.88–1.15 for h = 15–60 min across names. The extremes are 0.80 (WEGE3, 120 min) and 1.17 (ITUB4, 5 min).

  Data: [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/WEGE3.SA/)
- **[COMPUTED]** Intraday seasonality. Mean |5-min return| by time of day relative to the day's average:

  | | 10:00–10:30 | 10:30–12:00 | 12:00–14:00 | 14:00–16:00 | 16:00–16:55 |
  |---|---|---|---|---|---|
  | relative to day average | ≈2.0–2.1× | 1.3–1.5× | 0.8–0.9× | 0.67–0.73× | 0.72–0.84× |

  30-min windows starting 10:00–10:30 have median 42–49 bp and p95 129–197 bp. Windows starting 11:00–16:25 have median 17–22 bp and p95 63–83 bp — data [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/ITUB4.SA/)
- **[COMPUTED]** Previous official close → price at a random intraday time, which is the decision-price-to-approval-price gap. 60 sessions, Jul–Oct/2026, unadjusted:
  - p50 77–123 bp; p90 195–299 bp; p95 230–426 bp;
  - p99 345–1,175 bp. The p99 is driven by real events: on **05/10/2026** B3 official opens vs the prior close were ITUB4 +8.5% (44.83→48.80), BBAS3 +6.0% (23.72→25.19) and PETR4 +3.8% (51.17→53.16). PETR4 on 24/08/2026 had a −3.9% raw gap but only −0.8% after dividend adjustment, i.e. an ex-dividend day.

  Data: [B3 COTAHIST 2026](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP), [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/BBAS3.SA/history/)

### Inferences
- **Rules of thumb (current regime):**
  - σ(15 min) ≈ 0.19·σ_oc,day, about 25–35 bp;
  - σ(30 min) ≈ 0.27·σ_oc,day, about 35–50 bp;
  - σ(60 min) ≈ 0.38·σ_oc,day, about 50–70 bp.

  A ±2σ band covers about 95% of windows. A ±3.3σ band covers about 99%, except for VALE3's jumpier tail.
- Volatility is regime-dependent. ATR14 on 16/10/2026 was well above its 1y mean for ITUB4 (3.63% vs 2.29%) and BBAS3 (4.27% vs 2.75%). The 05/10/2026 jump coincides with the Monday after the 1st round of the general election (04/10/2026); the cause is not verified. A fixed tolerance calibrated in calm months will trigger more often now. A tolerance scaled by rolling σ adapts on its own.
- Approvals in the first 30 minutes face about twice the noise. Either widen the band there or avoid using the 10:00–10:30 quotes. Those quotes, delayed 15 min, are not available before about 10:15 anyway.
- On ex-dividend dates, raw prices fall by the dividend. A tolerance test against the previous close must use the dividend-adjusted reference, or it will raise false alarms (PETR4 24/08/2026: −3.9% raw vs −0.8% adjusted). This ties in with DP-30.

### Gaps
- The intraday sample is one 60-session window (Yahoo keeps only about 60 days of 5-min bars). Its volatility was above the 1y average for PETR4, VALE3, ITUB4 and BBAS3 (60d σ_oc above 1y σ_oc; most for BBAS3 and PETR4) and below it for WEGE3. A longer intraday history needs the project's own archive (DP-26) or paid data.
- I did not compute statistics for the opening-call jump itself (official open vs first continuous trades) or for 1-minute bars.

## 5. Public market-data delay rules: what "current price" means with Yahoo or B3 delayed data

### Takeaway
B3 defines delayed data as distribution **≥15 minutes** after B3's transmission. Yahoo lists São Paulo (.SA) quotes as 15-min delayed, supplied by ICE, and "not intended for trading". A free "current price" is therefore a price that is already at least 15 minutes old. Its error against the true price follows the 15-min move distribution: median about 13–17 bp, p95 about 56–72 bp, p99 about 92–124 bp. A new B3 policy from 01/11/2026 relaxes the update-frequency rule for open websites but keeps the delay concept.

### Cited Findings
- B3 Política de Consumo de Market Data (V1.1; the document carries dates 01/01/2026, 31/10/2026 and 01/11/2026):
  - "**Atraso**: significa a Distribuição de informações em período igual ou superior a 15 (quinze) minutos após a transmissão dos Dados constantes do Market Data B3 pela B3, incluindo Dados de Fim de Dia B3";
  - "Atraso Contínuo" is delayed and dynamic distribution;
  - "Atraso Snapshot" is delayed and static distribution.

  Source: [B3, Política de Consumo de Market Data V1.1](https://www.b3.com.br/data/files/0D/97/1F/B7/4CCFF91094DCD8F9AC094EA8/Politica%20de%20Consumo%20de%20Market%20Data%20B3%20V1.1.pdf). A search excerpt adds that snapshot data "podem ser atualizadas a cada 15 minutos ou período superior"; my PDF extraction of that sentence was garbled.
- B3 FAQ for distributors: Market Data B3 is distributed over UMDF "em tempo real ou com atraso (15 minutos)" — [B3, Perguntas frequentes – distribuidores](https://b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/distribuidores/perguntas-frequentes/)
- B3 Política Comercial de Market Data suggests delayed distribution ("cotações 15 minutos após a transmissão") for distributors of real-time simulators who do not want the end-user costs, "a qual não possui obrigações de reporte e custos adicionais". This comes from a search excerpt; I did not re-verify the wording in the PDF — [B3, Política Comercial de Market Data v3.0.4.1](https://b3.com.br/data/files/6D/77/9D/65/0AB929106EEC8429AC094EA8/Politica%20Comercial%20de%20Market%20Data%20v3.0.4.1.pdf)
- **OC 036/2026-PRE (13/08/2026):** updated Consumption and Commercial policies take effect **01/11/2026**. Among the changes is "a possibilidade de distribuição em atraso contínuo e/ou snapshot em websites abertos, sem a restrição anterior que permitia atualizações somente a cada 15 (quinze) minutos" — [B3, Ofício Circular 036/2026-PRE](https://www.b3.com.br/data/files/52/45/4B/4E/BACFF91094DCD8F9AC094EA8/OC%20036-2026%20PRE%20Vers%C3%A3o%20Atualizada%20Pol%C3%ADtica%20de%20Market%20Data%20(PT)%20V1.2.pdf)
- Yahoo: "Brazil – Sao Paolo Stock Exchange (BOVESPA) – .SA – 15 min – ICE Data Services". Information is "provided for informational purposes only, and is not intended for trading or investing purposes"; redistribution is not allowed — [Yahoo Help, Exchanges and data providers on Yahoo Finance](https://help.yahoo.com/kb/finance/SLN2310.html)
- **[COMPUTED]** The error of a 15-min-stale quote against the true price is the 15-min move. See section 4: median 13–17 bp, p95 56–72 bp, p99 92–124 bp. In 10:00–10:30 it is about twice as large — data [Yahoo Finance via yfinance](https://finance.yahoo.com/quote/PETR4.SA/)

### Inferences
- With free data, "current price" at wall-clock time T means "the last trade at or before T − 15 min" (Yahoo, and the project's DP-26 intraday feed). Consequences:
  - Before about 10:15, there is no same-day continuous price.
  - About 17:15 is the earliest time the official close can appear (Mar–Nov regime; 18:15 in winter), and later still if the closing call is extended.
  - During the after-market (17:30–18:00), Yahoo's "regular market price" behaviour for .SA is unknown; it may show the official close or after-market prints.
- At approval, two comparisons are possible. Preview quote vs approval quote, both delayed, Δ minutes apart: the error is the Δ-minute move. Preview quote vs the true price at approval: the error is the (Δ+15)-minute move. A tolerance rule should name which one it implements.
- The 01/11/2026 policy change is about how often delayed data may be refreshed on websites. It does not make Yahoo real-time. The 15-min floor still defines "delayed".

### Gaps
- I did not verify the exact latency of Yahoo's .SA feed beyond the stated 15 min. Real staleness can be larger between refreshes or when no trades occur.
- Not verified: whether Yahoo's daily bar for "today" switches to the official close at about 17:15 or only after reprocessing.

## 6. Brazilian academic and institutional work on spreads, transaction costs, intraday patterns and auctions

### Takeaway
The Brazilian literature I found confirms the stylized facts: tick-bounded spreads of about 0.1% (2007–08 data), U-shaped intraday spreads, volume and volatility, and end-of-day distortions with next-morning reversals around the closing auction. It is dated, and I found no recent public study with stock-level spread numbers for the five tickers.

### Cited Findings
- Araújo, G. S.; Barbedo, C. H. S.; Vicente, J. V. M. "The Adverse Selection Cost Component of the Spread of Brazilian Stocks". Banco Central do Brasil Working Paper 263, Nov/2011. Data: BM&FBovespa-built order and trade database, 18/10/2007–18/01/2008 and 28/01–24/04/2008, trades 10:05–16:55 (auctions removed). Findings:
  - adverse-selection cost is higher than in the US and U-shaped intraday;
  - mean spread 0.10–0.11% of price;
  - PETR4 had the lowest percentage spread;
  - liquidity, trade size and market value are correlated with the cost;
  - the top governance tiers do not have the lowest costs.

  Source: [BCB WP 263](https://www.bcb.gov.br/pec/wps/ingl/wps263.pdf)
- Lowenkron (FGV EESP, 2011), "Distorções no leilão de fechamento de ações da BM&FBOVESPA", a dissertation. It studies all intraday trades 2006–2011 and finds end-of-day volume and volatility distortions and next-morning price reversals. It links their size to incentives to manipulate the close, the main fair-value reference. The abstract was seen only via a search snippet, because the repository page is bot-protected — [FGV Repositório](https://repositorio.fgv.br/items/6802800e-5d00-4422-83cc-026aba597c7c)
- Ruilova Terán & Macret (FGV EESP, 2018), "Relação entre volume e volatilidade no mercado acionário brasileiro". It finds U-shaped intraday volume for Ibovespa stocks and proposes selling volatility early and buying mid-day with strangles. Also seen via search snippet only — [FGV Repositório](https://repositorio.fgv.br/items/260f7c4e-dec9-4bd1-903f-4aafe4a0e242)
- Moreira, J. M. S.; Lemgruber, E. F. "… da Volatilidade e do Valor em Risco para o Ibovespa" (part of the title was lost in PDF extraction). BCB Trabalhos para Discussão 61, Dec/2002. Uses high-frequency data for daily and intraday Ibovespa volatility and VaR. Filtering the intraday seasonal pattern "é indispensável à obtenção de medidas úteis de volatilidades" — [BCB TD 61](https://www.bcb.gov.br/pec/wps/port/wps61.pdf)
- Ripamonti, A. (2016) "Corwin-Schultz Bid-ask Spread Estimator in the Brazilian Stock Market", BAR – Brazilian Administration Review. Ibovespa firms 1986–2014; the high-low spread estimator is a valid, reliable measure for aggregate analyses; results vary by period, industry and listing segment — [BAR/ANPAD](https://bar.anpad.org.br/index.php/bar/article/view/291)
- Carvalho, Pala & Sáfadi (Semina: Ciências Exatas e Tecnológicas, 2021): intraday Ibovespa volatility with ARIMA-APARCH and wavelet decomposition during COVID-19 — [UEL/Semina](https://ojs.uel.br/revistas/uel/index.php/semexatas/article/download/41776/30291/225550)
- Practitioner and regulatory context: in liquid B3 stocks the spread is often one tick (R$0.01). 46.4% of RLP (retail liquidity provider) executions in 2023 gave no price improvement over the central book, and the average improvement was about 33–35% of the nominal spread (as reported from the CVM AIR on internalization) — [Capital Aberto, 06/03/2026](https://capitalaberto.com.br/colunistas/2026/03/o-diabo-mora-nos-detalhes-e-cobra-spread)

### Inferences
- The literature supports two design choices:
  1. Treating the closing auction as the market's own "fair value" reference. Indices and funds use it, and it concentrates liquidity. Lowenkron's evidence of close distortions mostly concerns manipulation incentives around the close, which do not affect a price-taker simulation.
  2. Expecting U-shaped intraday noise.
- For a TCC, WP 263 plus the computed COTAHIST numbers and the 1-tick floor are probably enough to justify "spread cost ≈ a few bp, negligible against the tolerance band".

### Gaps
- I found no RBFin paper specifically on the B3 closing call or intraday spreads in this pass, and no B3 institutional study with spread statistics for these tickers.
- The Lowenkron and Ruilova Terán & Macret abstracts could not be read directly (FGV repository bot protection). Their magnitudes are unknown.

## 7. Synthesis for the project decisions: (a) best execution reference and (b) a defensible preview→approval tolerance

### Takeaway
- **(a) Execution reference:** the strongest choice is **the next official auction price after approval**. That is today's closing-call price if the approval arrives before the closing call (cut-off about 16:50 BRT in the Mar–Nov regime, about 17:50 in winter), otherwise the next session's close (or open). It is official, single-priced, achievable in reality with MOC/MOA orders, already stored (COTAHIST PREULT/PREABE, DP-27), matched by Yahoo on about 99% of days, and independent of when the human happens to click. VWAP (PREMED) is a defensible alternative, but it is known only at end of day and sits 32–47 bp from the close on average. A delayed last quote is the weakest reference: not official, at least 15 min stale, and dependent on approval time.
- **(b) Tolerance:** calibrate it to the measured noise. A fixed **±1%** suits gaps of 15–30 min between preview and approval: exceeded in about 0.7–1.9% of 15-min windows and 2.5–4.6% of 30-min windows. Use ±1.5% up to about 60 min (exceeded in 1.3–3.8% of windows). Better, use a σ-scaled band k·σ_oc·√(h/415) with k ≈ 2 (≈p95) to 3.3 (≈p99), floor at about 0.5%, capped near the B3 auction-tunnel scale (≈1.5–2%). Widen it in the first 30 minutes, and use dividend-adjusted references on ex-dates.

### Cited Findings
- Official close = closing-call single price that maximizes traded quantity; it is "o preço oficial de fechamento do dia" and a reference for indices and funds — [B3 Bora Investir](https://borainvestir.b3.com.br/glossario/leilao-de-fechamento/); [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF). MOC and MOA market orders get priority in calls — [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF)
- Current cut-offs: continuous trading until 16:55, closing call 16:55–17:00 with extensions (1st +5 min) — [B3 hours](https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/horario-de-negociacao/acoes/); [B3 Regras (202512)](https://www.b3.com.br/data/files/02/30/6E/FC/8240B9105B12E5A9AC094EA8/202512_1.PDF). Winter precedent: continuous trading until 17:55 — [Money Times](https://www.moneytimes.com.br/de-olho-no-relogio-b3-opera-em-novo-horario-a-partir-desta-segunda-feira-3-lils/)
- Free quotes are at least 15 min delayed — [B3 Política de Consumo](https://www.b3.com.br/data/files/0D/97/1F/B7/4CCFF91094DCD8F9AC094EA8/Politica%20de%20Consumo%20de%20Market%20Data%20B3%20V1.1.pdf); [Yahoo Help](https://help.yahoo.com/kb/finance/SLN2310.html)
- B3's own "abnormal instantaneous move" thresholds for IBOV/IBrX stocks, in the 2022 table: 1.5% vs the last trade, 2% vs the 15-s average, 1.5% protection during calls. They were widened to 2% and 3% in the 2022 election period — [B3 table 22/04/2022](https://www.b3.com.br/data/files/59/E0/41/CF/373508104532BBF7AC094EA8/20220425.Segmento%20BOVESPA_Tuneis%20de%20Negociacao%20-%20portugues.pdf); [Monitor Mercantil](https://monitormercantil.com.br/b3-revisao-dos-parametros-dos-tuneis-de-negociacao/)
- **[COMPUTED]** Distances between candidate references, 448 sessions 2025–2026 and Jul–Oct/2026 — data [B3 COTAHIST](https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP), [Yahoo via yfinance](https://finance.yahoo.com/quote/PETR4.SA/):

  | distance | PETR4 | VALE3 | ITUB4 | WEGE3 | BBAS3 |
  |---|---|---|---|---|---|
  | VWAP vs close, mean / median / p90 \|Δ\| (bp) | 38/26/83 | 37/29/78 | 32/24/68 | 41/31/87 | 47/35/101 |
  | VWAP vs open, mean \|Δ\| (bp) | 78 | 77 | 80 | 99 | 93 |
  | close vs last continuous, mean \|Δ\| (bp) | 16 | 16 | 20 | 20 | 22 |
  | overnight gap, 1y mean \|Δ\| (bp) | 83 | 71 | 68 | 63 | 64 |

### Inferences
- **Comparison of execution references** for a daily simulation that decides on data up to D−1 and is approved at an arbitrary time:

  | Reference | Known when (free data) | Official / reproducible | Approval-time dependence | Typical distance from decision price (prev close) | Fit |
  |---|---|---|---|---|---|
  | **Closing call (D, or next session if approved after cut-off)** | ≈17:15 (Yahoo) / COTAHIST end of day | Yes: PREULT; Yahoo ≈99% match; MOC makes it achievable | Only through the cut-off rule | \|close-to-close\| p50 ≈ 0.9–1.1%, p95 ≈ 3.3–3.9% | **Best**: equals the marking price (DP-27), so trade-day P&L has no mark/fill mismatch; simple to audit |
  | Opening call (next session) | ≈10:15 (Yahoo) | Yes: PREABE; MOA | Low | overnight gap mean 0.6–0.8%, p95 1.8–2.5% | Good for approvals made after the close or overnight; the gap is pure overnight risk |
  | VWAP (D) | End of day only (COTAHIST PREMED) | Yes, official average | Low | ≈ close ± 32–47 bp mean | Defensible ("a passive all-day order"), but the fill is unknown at approval, and the Yahoo intraday proxy lacks the call volume |
  | Delayed last quote at approval | At approval, ≥15 min stale | No: not official, Yahoo-dependent, not reproducible from B3 files | High: a different click time gives a different fill | path-dependent | Weakest. Usable only as a display or sanity check (DP-24 already forbids presenting the previous close as live) |

- **Tolerance design.** Define h as the minutes between the two quotes being compared: Δ if both are delayed quotes, Δ+15 if the approval-time real price is used.
  1. **Simple fixed rule:** ±1% for h ≤ 30 min (exceeded in 0.7–1.9% of 15-min windows, 2.5–4.6% of 30-min windows); ±1.5% for h ≤ 60 min (exceeded in 1.3–3.8%); ±2% beyond that or across sessions. BBAS3 sits at the top of each range.
  2. **σ-scaled rule (more defensible):** tol = clamp(k·σ_oc·√(h/415), 0.5%, 2%), with σ_oc a rolling std of daily log(Close/Open) (e.g. 60 sessions) and k = 3. That is about p99 for four names; VALE3 tails are fatter. With the 1y σ_oc it gives ≈0.75–1.0% for h = 15 and ≈1.05–1.4% for h = 30. With the 60-day σ_oc (Jul–Oct/2026) it gives ≈0.75–1.2% and ≈1.05–1.7%, BBAS3 highest. Multiply σ by about 2 if h starts in 10:00–10:30.
  3. If the quote moves beyond the tolerance, re-preview (show the new quote and ask for confirmation again) rather than silently filling. Treat "stock in auction" or "circuit breaker" as non-executable.
- **Decision-price staleness is a separate dimension.** If decisions use D−1 close and the fill is at D close, the expected |difference| is about 1% (p95 about 3.5%), driven by real information such as the 05/10/2026 gaps of +6–8.5%. That is not noise to be "tolerated". It is the economic risk the simulation should record, as decision price vs execution price, rather than block.
- **Cost sanity check:** half-spread (about 1–4 bp) plus closing-call vs continuous differences (about 16–22 bp) are both well inside any tolerance above 0.5%. The tolerance is driven by time between quotes, not by microstructure costs.

### Gaps
- Current (2026) B3 tunnel parameters and the official Nov/2026 schedule were not confirmed (see sections 1 and 2).
- The intraday statistics come from a single 60-session window in a volatile period (election, elevated ATR). They should be re-estimated on the project's own intraday archive (DP-26) over a longer span before thresholds are frozen.
- No source was found on how other paper-trading platforms (e.g., B3/broker simulators) set fills or tolerances. The recommendations above are my synthesis.
