# Regressão

## Validações anteriores à suíte completa

- `targeted_initial.txt`: **55 passed, 23 subtests passed**, 346,97 s. Inclui Chrome V7.6.2/V7.6.3/V7.6.4, proteção V1, APIs e contratos H2.
- `adapter_final.txt`: **12 passed**, versão final do adaptador e HTTP.
- `ui_final.json`: **36/36**, zero requisições bloqueadas/tentativas de escrita e zero exceções.
- Ruff e `node --check`: aprovados. Primeiras tentativas pytest/Chrome no sandbox falharam por permissão Windows para temporários/spawn; execuções com permissão de processo passaram.

## Por que 15 falhas viraram 14 na V7.6.3

Conferidos `hfl_radar_ux_v763/regression_final.txt`, `regression_comparison.json`, `ui_checks_release.json` e relatórios V7.6.2. V7.6.3 registra 1752 passed, 14 failed, 61 subtests passed; Chrome 53/53. As 61 são subtestes pytest, não 61 interações Chrome adicionais.

A falha não repetida foi `tests/pipeline/test_snapshot.py::test_manifest_adulterado_e_rejeitado[code]`. Não houve correção desse teste ou do código científico. A mutação fixa `git_dirty=False` precisa mudar o manifest. `_build` usa `repository_dir=tmp_path`; `_git_metadata` executa Git nesse diretório. Temporário **dentro** do repositório herda os metadados da árvore; se limpa, já é False e a mutação não altera nada. Temporário **fora** retorna `git_commit=None, git_dirty=None`, então a mutação altera o valor. V7.6.2 usou `.pytest_cache/tmp`; V7.6.3 usou temporário externo exclusivo. Portanto a redução é compatível com mudança ambiental, não correção definitiva. Consulta direta nesta entrega confirmou workspace com Git e TEMP externo sem Git.

O relatório final acrescentará comparação por nome da suíte completa e reprodução controlada. Não modificar o teste científico para tornar o número verde.

## Suíte completa

Pendente após commit da documentação. Árvore estável, saída bruta em diretório ignorado e temporário fora do repositório, como V7.6.3. `out.json` do operador será excluído somente da consulta Git do processo de teste via configuração temporária, sem editar/deletar/commitar o arquivo. Nenhum arquivo será editado durante a suíte.
