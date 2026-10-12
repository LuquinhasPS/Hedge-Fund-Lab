# HFL V7 — runbook operacional

Executar no diretório do projeto, em PowerShell. Este runbook distingue consulta,
preparo de dados, inferência paga e reconciliação. Nenhum comando mutável abaixo
foi executado para qualificar a V7.

## Iniciar e consultar

```powershell
.venv/Scripts/python.exe -B dashboard/server.py 8081
```

Abrir `http://localhost:8081/`. Se essa porta já estiver ocupada por outro
servidor, usar uma porta livre e acessar **todos os módulos nessa mesma base**.
O processo escuta somente loopback. Não usar um servidor estático genérico:
ele não fornece as APIs ou o shell compartilhado.

```powershell
.venv/Scripts/python.exe -B scripts/check_platform.py
.venv/Scripts/python.exe -B scripts/run_h2_v6_supervised.py verify
git status --short
```

O diagnóstico não grava arquivos, não inicializa carteiras, não baixa preços,
não reconcilia nem chama Gemini. Retorna JSON em stdout e código 2 se a
integridade H2 não puder ser verificada. Conferir os alertas de cada módulo
mesmo quando o código de saída for zero. Árvore limpa é exigida pelo preflight
científico original; alterações de desenvolvimento não devem ser ignoradas.

## Prontidão de 13/10/2026

Fotografia na qualificação de 11/10, baseada em registros locais:

- Última sessão observada: **09/10/2026**. Cinco carteiras prospectivas com
  patrimônio R$ 100.000 cada, caixa R$ 100.000, exposição zero, sem operações
  reconciliadas. São cinco capitais independentes.
- Decisão original: COMPRA, cinco votos, Risk aprovado, PM confirma alvo
  100% PETR4, abertura-alvo **13/10 às 10h BRT**. A decisão foi gerada em
  10/10 às 15:17:04 BRT e está preservada. Não repetir sua inferência.
- SHA-256 da decisão:
  `27e51c949aebac155b1d890c6fff74d1a242852d7f5c8d3a30cdc602a6a09ddc`.
- Supervisionada: **AGUARDANDO_APROVACAO**, prazo **13/10 às 10h BRT**,
  nenhuma aprovação gerada. A UI deve projetar expiração ao ultrapassar o prazo.
- Buy & Hold e SMA têm intenção para 13/10; Bollinger não tem ordem pendente.
  SMA/Bollinger passaram pelas verificações originais de comparabilidade.
- Radar oficial: quatro inputs preparados, cinco pareceres completos ausentes.
  ITUB4 tem divergência de fator/split entre fontes; conferir o erro original,
  sem substituir por um parecer sintético.
- Gestor oficial: não está pronto para inferência sem esses pareceres.
  A–F V6 são respostas fake; V5 é demonstração contábil. O contexto sintético V7
  de qualificação também não autoriza execução financeira ou custo real.

## Antes da abertura

1. Abrir `/`, conferir data de consulta, sessão observada, próximo pregão,
   alertas e processos. Calendário prevê a abertura, sem confirmar leilão.
2. Abrir `/paper#sala`, consultar a decisão de 09/10, quórum, razões, Risk,
   Portfolio e intenção. Não clicar em executar agentes para a decisão existente.
3. Em `/paper#supervisao`, o operador decide se aprova ou rejeita, confere os
   limites e a confirmação vinculada à decisão. Essas ações não chamam Gemini.
   Sem ação humana tempestiva, não inventar aprovação nem alterar o prazo.
4. Em `/paper#mercado`, cenários são hipotéticos. Preço de referência e previsão
   de calendário não são uma abertura oficial observada.

## Depois de dados oficiais do pregão disponíveis

O runner original prepara um input de **sessão encerrada**; a reconciliação
financeira da H2 é parte de sua rotina `run`, e não um novo botão V7 gratuito.
O preflight original mostra uma prévia sem gravar. Preparar e conferir:

```powershell
.venv/Scripts/python.exe -B scripts/run_h2_v6_forward.py prepare
.venv/Scripts/python.exe -B scripts/run_h2_v6_forward.py preflight
```

`prepare` baixa/congela dados e é mutável; executar somente por ação explícita.
Conferir sessão, abertura bruta oficial, fatores, custos, hashes, prévia de
reconciliação e integridade. Se só houver o input de 09/10, a intenção de 13/10
continua pendente: não inventar preço ou antecipar execução.

Para uma nova decisão do novo fechamento, a UI original exige seu preflight
e confirmação paga própria. O comando original `run --confirm <token>` só deve
ser usado pelo operador após essa autorização. Não há comando V7 para
reconciliar H2 isoladamente da rotina original; esta limitação é deliberada.

Sincronizações determinísticas também escrevem e devem ser explícitas:

```powershell
.venv/Scripts/python.exe -B scripts/run_h2_v6_forward_benchmarks.py sma_regime_h2_proposed
.venv/Scripts/python.exe -B scripts/run_h2_v6_forward_benchmarks.py bollinger_state_h2_proposed
.venv/Scripts/python.exe -B scripts/run_h2_v6_supervised.py sync
```

Conferir novamente `/paper#carteiras` e o diagnóstico. A supervisionada só
reconcilia uma ordem aprovada e válida segundo seus próprios registros.
Benchmarks mantêm seus próprios ledgers; não copiar posições entre carteiras.

## Radar → proposta global

1. `/radar`: fonte oficial, até cinco tickers, sessão encerrada. Preparar os
   dados explicitamente. Resolver qualquer bloqueio de input antes de seguir.
2. Fazer preflight Radar, conferir estimativa, reserva, orçamento e token.
   Autorizar explicitamente o **lote Radar**. Até seis chamadas por ativo;
   sem retries automáticos. Abrir a página ou transferir seleção é gratuito.
3. Levar seleção ao Gestor Global. Conferir os pareceres da mesma fonte/sessão,
   geração, integridade e histórico. A ausência de qualquer parecer bloqueia
   o preparo; não dispara um comitê a partir do botão global.
4. Informar caixa e reconhecer o **snapshot hipotético**, sem posições e sem
   herdar aprovações. Preparar contexto somente próximo à utilização: validade
   de 24 horas, sem renovação automática. CLI V6 permite snapshots completos.
5. Fazer preflight global. Conferir contexto, Risk conjunto, modelo, estimativa,
   teto reservado, orçamento global e validade. A reserva conservadora de uma
   chamada oficial é US$ 0,159744 segundo a configuração V6 congelada; a
   estimativa efetiva depende do contexto, e preços/modelo não são atualizados
   pela V7. O custo observado só existe após uso registrado.
6. Confirmar separadamente a inferência **Global PM**. A autorização Radar
   não serve para esse passo. Chave somente no backend. Não realizar novas
   chamadas para um ID com claim já existente.
7. Consultar pesos, caixa, ativos não escolhidos, redução/concentração,
   liquidação, motivos e validação. Simular apenas em memória. Nenhuma operação
   financeira multiativos está habilitada.

No seletor sintético do Radar, V4 é somente leitura. Sua transferência permite
qualificar o fluxo Global com fake E (manter caixa), custo zero e confirmação
explícita. O resultado não é uma análise real do Gemini.

## Jobs interrompidos ou erro

Consultar `/#audit`, `/api/platform/jobs` e o detalhe da análise. Custo N/D não
significa zero. Se houver claim/journal e nenhum resultado, usar **Recuperar
somente offline** uma única vez, ou o CLI V6 já documentado. O replay lê o
envelope existente; ausência de resposta permanece bloqueada. Nunca apagar
claim, journal ou lock para forçar nova chamada. Falhas de integridade exigem
investigação local; não substituir hashes ou ressuscitar contexto expirado.

Logs brutos ficam locais; não publicar chaves, prompts privados ou envelopes.
Os endpoints V7 publicam apenas projeções permitidas e códigos genéricos.

## Qualificação

Ver [evidências V7](evidence/hfl_platform_v7/README.md),
[arquitetura](HFL_PLATFORM_ARCHITECTURE.md) e
[auditoria inicial](HFL_PLATFORM_AUDIT_V7.md). Nenhum passo desta entrega executou
Gemini, Validation, Final Test, aprovação humana ou operação financeira.
