# HFL V7.1 — runbook operacional

Executar no diretório do projeto, em PowerShell. Cada comando abaixo traz uma
classe:

| Classe | Significado |
|---|---|
| **CONSULTA** | Somente leitura, gratuita. Não baixa, não grava, não chama Gemini. |
| **GRAVA** | Gratuita, mas baixa dados e/ou escreve inputs, ledgers ou registros. Só por ação explícita. |
| **PAGA** | Chama Gemini. Exige preflight, token e autorização própria. |

Nenhum comando GRAVA ou PAGA foi executado para qualificar a V7.1.

## Iniciar e consultar

```powershell
.venv/Scripts/python.exe -B dashboard/server.py 8081          # serve a UI (loopback)
.venv/Scripts/python.exe -B scripts/check_platform.py         # CONSULTA, resumo por seção
.venv/Scripts/python.exe -B scripts/check_platform.py --json  # CONSULTA, visão completa
.venv/Scripts/python.exe -B scripts/run_h2_v6_supervised.py verify  # CONSULTA
git status --short                                            # CONSULTA
```

Abrir `http://localhost:8081/`. Se a porta estiver ocupada, usar outra e acessar
**todos os módulos na mesma base**. Não usar servidor estático genérico.

`check_platform.py` informa, por seção: H2 original (decisão e sessão-alvo),
supervisão (estado e prazo), carteiras e benchmarks (prontidão e posições),
Radar (estado por ticker e próxima ação), Global PM (pareceres e validade dos
contextos), mercado (última sessão observada), jobs incompletos/incertos/
bloqueados, integridade e ações manuais pendentes. Roda sob bloqueio de rede.
Código de saída 2 se a integridade H2 não puder ser verificada; conferir as
seções mesmo com código 0. A página `/` mostra as mesmas derivações no bloco
**Atenção necessária**.

## Fotografia em 12/10/2026 (feriado B3; próximo pregão 13/10)

- Última sessão observada **09/10**. Cinco carteiras de R$ 100.000 cada, em
  caixa, sem operações reconciliadas. Capitais independentes; não somar.
- Decisão original de 09/10: COMPRA PETR4, 5/5 votos, Risk aprovado, alvo 100%
  na abertura de **13/10 às 10h BRT**. Gerada em 10/10 15:17:04 BRT. SHA-256
  `27e51c949aebac155b1d890c6fff74d1a242852d7f5c8d3a30cdc602a6a09ddc`.
- Supervisionada: **AGUARDANDO_APROVACAO**, prazo **13/10 às 10h BRT**, auditoria
  íntegra (1 evento), nenhuma aprovação registrada.
- Ordens para 13/10: H2, Buy & Hold e SMA. Bollinger sem ordem. SMA/Bollinger
  comparáveis.
- Radar oficial 09/10: PETR4, VALE3, WEGE3, BBAS3 com input preparado e
  aguardando autorização; ITUB4 bloqueado na raiz oficial (causa e correção
  abaixo). Zero pareceres completos; Global PM oficial indisponível.

## Checklist A — 13/10, antes da abertura (até 10h BRT)

| # | Passo | Comando / local | Classe |
|---|---|---|---|
| 1 | Árvore e diagnóstico. Esperado: integridade íntegra, próxima ação = supervisão. | `git status --short` · `scripts/check_platform.py` | CONSULTA |
| 2 | Auditoria da supervisão. | `scripts/run_h2_v6_supervised.py verify` | CONSULTA |
| 3 | Conferir a decisão **já registrada** de 09/10 (SHA acima), quórum, Risk, PM e intenção. **Não clicar em executar agentes; não rodar `run_h2_v6_forward.py run`**: 09/10 já está decidida. | `/paper#sala` | CONSULTA |
| 4 | Conferir limites da supervisão e simular cenário (em memória). | `/paper#supervisao`, `/paper#mercado` | CONSULTA |
| 5 | Decisão humana, se o operador quiser: aprovar ou rejeitar antes de 10h. Write-once, sem Gemini. Sem ação tempestiva, expira; não inventar aprovação nem mudar prazo. | UI `/paper#supervisao` ou `scripts/run_h2_v6_supervised.py approve 2026-10-09 27e51c949aebac155b1d890c6fff74d1a242852d7f5c8d3a30cdc602a6a09ddc [--limit NOME=VALOR]` (ou `reject` com os mesmos argumentos) | GRAVA |
| 6 | Calendário: 13/10 é sessão regular (12/10 feriado). Previsão não confirma leilão; não há intradiário. | `/paper#mercado` | CONSULTA |
| 7 | **Não** preparar contexto Global PM agora: vale 24 h e não há pareceres oficiais. | — | — |

## Checklist B — depois da publicação do COTAHIST de 13/10

Os runners consideram a sessão encerrada a partir de **18h BRT**. Executar
quando a B3 tiver publicado os dados de 13/10; se o preparo não encontrar a
sessão, parar e tentar mais tarde. Nunca inventar preço.

| # | Passo | Comando | Classe |
|---|---|---|---|
| 1 | Diagnóstico: esperado "Preparar o fechamento oficial de 13/10/2026". | `scripts/check_platform.py` | CONSULTA |
| 2 | Congelar o input oficial de 13/10 (COTAHIST + fator yfinance). | `scripts/run_h2_v6_forward.py prepare` | GRAVA |
| 3 | Conferir offline: sessão 13/10, abertura bruta oficial, fator, custos, prévia de reconciliação (unidades, caixa, custos), hashes e identidade. | `scripts/run_h2_v6_forward.py preflight` | CONSULTA |
| 4 | Supervisionada: reconcilia a ordem de 13/10 **somente** se aprovada e válida; caso contrário registra o desfecho (rejeitada/expirada). | `scripts/run_h2_v6_supervised.py sync` e depois `verify` | GRAVA / CONSULTA |
| 5 | Benchmarks determinísticos: reconcilia a ordem SMA de 13/10 e marca Bollinger; podem criar ordens para 14/10. | `scripts/run_h2_v6_forward_benchmarks.py sma_regime_h2_proposed` · `… bollinger_state_h2_proposed` | GRAVA |
| 6 | H2 original + Buy & Hold: a reconciliação da intenção de 13/10 acontece **dentro** do `run`, que também decide 13/10 com Gemini. Só com autorização explícita, usando o token do passo 3. Sem autorização, essas duas carteiras permanecem marcadas em 09/10 com a intenção pendente (limitação deliberada: não há reconciliação H2 isolada). | `scripts/run_h2_v6_forward.py run --confirm <token>` | **PAGA** |
| 7 | Se o passo 6 ocorreu antes de 14/10 10h, sincronizar a supervisionada de novo para registrar a proposta de 13/10 (sem decisão gravada, `sync` não fecha a proposta antes do prazo). | `scripts/run_h2_v6_supervised.py sync` | GRAVA |
| 8 | Conferência final: carteiras, custos, posições, jobs e integridade. | `scripts/check_platform.py` · `/paper#carteiras` · `git status --short` | CONSULTA |

Benchmarks e supervisionada têm ledgers próprios; não copiar posições entre
carteiras. Não reconciliar manualmente nem editar ledgers.

## Radar → Gestor Global (laboratório, opcional)

Corrigido na V7.1: o preparo normalizado trata bonificações/desdobramentos que
o yfinance registra como split (ver "ITUB4" abaixo). Fluxo para uma sessão
encerrada `S` (por exemplo `2026-10-13`):

| # | Passo | Comando | Classe |
|---|---|---|---|
| 1 | Preparar inputs dos cinco tickers (baixa COTAHIST do ano e yfinance; pastas novas apenas). | `scripts/radar_corporate_events.py prepare --session S` | GRAVA |
| 2 | Conferir eventos corporativos, histórico, features e equivalência com o extrator original (lê yfinance; usa o COTAHIST baixado no passo 1). | `scripts/radar_corporate_events.py diagnose --session S` | CONSULTA (lê rede) |
| 3 | Preflight do lote Radar: estimativa, reserva, orçamento, token. | `/radar` ou `scripts/run_multiasset_radar.py preflight --session S` | CONSULTA |
| 4 | Autorizar o **lote Radar** (até 6 chamadas por ativo, sem retry). | `/radar` ou `scripts/run_multiasset_radar.py run --session S --confirm <token> --authorize-paid` | **PAGA** |
| 5 | Elegibilidade conjunta (mesma fonte/sessão, cinco pareceres). | `/portfolio#global-workflow` ou `scripts/check_platform.py` | CONSULTA |
| 6 | Preparar contexto com snapshot hipotético **perto do uso** (validade 24 h, sem renovação). | `/portfolio#global-workflow` | GRAVA |
| 7 | Preflight global (Risk conjunto, estimativa, teto US$ 0,159744). | idem | CONSULTA |
| 8 | Autorizar a **inferência Global PM**; a autorização Radar não vale aqui. | idem | **PAGA** |

Chave: o runner H2 lê `GEMINI_API_KEY` do `.env`; Radar e Global PM leem
**somente o ambiente do processo** e reportam `gemini_api_key_missing` sem ela.
Antes dos passos PAGOS, definir `$env:GEMINI_API_KEY` no terminal que inicia o
servidor ou o CLI (nunca colar a chave em comandos registrados ou na UI).

O botão "Preparar" da página `/radar` continua usando o extrator original
(selado) e bloqueia tickers com bonificação na janela; a página indica o comando
normalizado. A raiz oficial do Radar tem `last_prepare.json` e o COTAHIST em
cache inventariados no baseline V7: o preparo (passo 1) os atualiza.
Nenhuma operação financeira multiativos existe.

## ITUB4 — causa-raiz e correção

Bloqueio original: `split-like mismatch between yfinance and B3 closes:
{2025: 0.97087, 2026: 1.0}`. Evidência (`docs/evidence/hfl_platform_v71`):

- yfinance registra **Stock Split 1.03 em 26/12/2025** para ITUB4.SA e, mesmo com
  `auto_adjust=False`, devolve `Close` retroajustado por splits. COTAHIST é
  nominal. Antes de 26/12, `Close(yf)/fechamento B3 = 1/1,03 = 0,970874`
  exatamente; depois, 1,000000. `Adj Close/Close` (fator de proventos) é contínuo
  no evento (0,978753 dos dois lados).
- A B3 corrobora: em 26/12/2025 o COTAHIST marca ITUB4 `PN EB N1`
  (**ex-bonificação**) e o número de distribuição DISMES muda 362→363; fechamento
  40,26 → 39,10. Mesmo padrão em 18/03/2025 (bonificação de 10%).
- Não é exclusivo de ITUB4: 40 ativos à vista têm marca de ex-bonificação na
  janela de 450 dias. Amostra verificada: ITUB3 1,03; MGLU3 1,05; RADL3 1,02;
  KLBN4 1,01; EGIE3 1,40. Todos bloqueados pelo extrator original e corrigidos.
  PETR4, VALE3, WEGE3 e BBAS3 não têm evento na janela.

Correção (`scripts/radar_corporate_events.py`, camada exploratória; `src/` e os
arquivos selados do Radar inalterados): restaura o `Close` nominal do yfinance
**apenas** para splits que a B3 corrobora com mudança de DISMES na mesma sessão
e confere as sessões vizinhas ao evento; depois aplica a mesma guarda anual e a
mesma tolerância (1e-3) do original. `Adj Close` não é alterado, então o fator
passa a incluir o evento (retorno total contínuo). Divergência sem evento
corroborado continua bloqueando. Sem evento, o resultado é idêntico bit a bit ao
extrator original. O input registra eventos e hash do módulo em
`source.corporate_events`; o manifesto Radar não muda, logo os pareceres
continuam compatíveis com o Global PM.

## Jobs interrompidos ou erro

Consultar `/#audit`, `/api/platform/jobs`, `check_platform.py` e o detalhe da
análise. Custo N/D não significa zero. Com claim/journal e sem resultado,
**Recuperar somente offline** uma única vez. Nunca apagar claim, journal ou lock
para forçar nova chamada; não ressuscitar contexto expirado nem substituir
hashes. Logs brutos ficam locais.

## Qualificação

Ver [evidências V7.1](evidence/hfl_platform_v71/README.md),
[evidências V7](evidence/hfl_platform_v7/README.md) e
[arquitetura](HFL_PLATFORM_ARCHITECTURE.md). Nenhum passo desta entrega executou
Gemini, Validation, Final Test, aprovação humana, reconciliação ou operação
financeira.
