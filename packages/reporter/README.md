# how-much-did-u-waste-report

Reporter de fugas de tokens para terminal/CI. Segundo consumidor de
[`how-much-did-u-waste-core`](../core): usa el mismo motor (ingesta solo-lectura,
costo equiv-API, detección de fugas) **sin servidor ni UI**, y devuelve un
exit-code por umbral para gatear un PR.

## Uso

```bash
how-much-did-u-waste-report                    # reporta sobre la DB existente
how-much-did-u-waste-report --ingest           # ingiere los transcripts primero
how-much-did-u-waste-report --data ./estado    # dónde vive la DB/estado (default: ./data)
how-much-did-u-waste-report --json             # salida machine-readable
how-much-did-u-waste-report --threshold 50     # exit 1 si la fuga estimada supera $50
```

Sin `--threshold` nunca falla (exit 0): solo informa. Con `--threshold` el
exit-code es 1 cuando el desperdicio estimado lo supera — eso es lo que un job de
CI evalúa.

## En CI (GitHub Actions)

```yaml
- run: npx how-much-did-u-waste-report --ingest --threshold 25
```

El job falla si el trabajo de agentes de la máquina/checkout desperdició más de
$25 estimados. Todo corre local en el runner: nada de la telemetría sale de él.
