# Fleet360 Source

The current source is a dependency-free Python foundation for the Fleet360
decision engine. It deliberately stops before implementing agents, correlation,
optimization, UI, MCP, or LLM integration.

```text
src/
  fleet360/
    domain.py       # Validated operational models and agent event contract
    config.py       # Environment-backed local settings
  data/
    fleet360_demo.json  # Small synthetic shipments and agent events
  .env.example
tests/
  test_domain.py
```

The domain models are standard-library dataclasses with explicit validation and
`to_dict()` serialization. Keeping the contract dependency-free makes it easy
for future agents and adapters to share the same types before a persistence or
API layer is selected.
