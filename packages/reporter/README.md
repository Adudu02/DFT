# motor-agentico-report

Reporter de fugas de tokens para terminal/CI. Segundo consumidor de
[`motor-agentico-core`](../core): usa el mismo motor (ingesta solo-lectura,
costo equiv-API, detección de fugas) **sin servidor ni UI**, y devuelve un
exit-code por umbral para gatear un PR.

## Uso

```bash
motor-agentico-report                    # reporta sobre la DB existente
motor-agentico-report --ingest           # ingiere los transcripts primero
motor-agentico-report --data ./estado    # dónde vive la DB/estado (default: ./data)
motor-agentico-report --json             # salida machine-readable
motor-agentico-report --threshold 50     # exit 1 si la fuga estimada supera $50
```

Sin `--threshold` nunca falla (exit 0): solo informa. Con `--threshold` el
exit-code es 1 cuando el desperdicio estimado lo supera — eso es lo que un job de
CI evalúa.

## En CI (GitHub Actions)

```yaml
- run: npx motor-agentico-report --ingest --threshold 25
```

El job falla si el trabajo de agentes de la máquina/checkout desperdició más de
$25 estimados. Todo corre local en el runner: nada de la telemetría sale de él.
