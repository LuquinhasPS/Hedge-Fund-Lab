# Regressão V7.6.5

Baseline local confirmado nos artefatos V7.6.4: 1765 passed, 14 failed, 61 subtests; Chrome 36/36. Nenhum baseline foi modificado. Lista de falhas conhecida: sete PostgreSQL indisponível, três expectativas H2/registro, duas preservações legadas operacionais e duas expectativas Radar. O teste de snapshot dependente de Git usa TEMP externo como na V7.6.4.

Qualificação direcionada e lint concluídos antes da regressão geral. Roteiros Chrome V7.6.4 adaptados à mudança autorizada de H2 para /paper (assertions de identidade/saldo/execução mantidas). Arquivos congelados durante a execução geral; saída em `.pytest_cache/` ignorada por Git, copiada para evidência depois. `out.json` do operador excluído apenas da consulta Git do processo de teste por configuração temporária; não editado, removido ou commitado.

Resultado geral e comparação por nome serão anexados após a execução, sem reclassificar falhas para melhorar números. A presença das 14 falhas conhecidas significa suíte geral vermelha, mesmo que a qualificação nova passe.
