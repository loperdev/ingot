# Ingot

Generate production-ready, typed SDKs from OpenAPI specifications.

```
ingot generate --spec api.yaml --lang typescript --out ./sdk-ts
ingot generate --spec api.yaml --lang python --out ./sdk-py
```

## What it does

Point Ingot at any OpenAPI 3.x spec. It produces clean, publishable client SDKs with:

- **Typed models** — interfaces/classes matching every schema
- **API client** — one method per endpoint, fully typed
- **Auth handling** — API key, Bearer, Basic
- **Retry logic** — exponential backoff for 5xx and 429
- **Package scaffolding** — ready for npm or PyPI

## Supported languages

| Language | Status |
|---|---|
| TypeScript | ✅ |
| Python | ✅ |
| Go | Planned |
| Java | Planned |
| Kotlin | Planned |

## Quick start

```bash
npm install -g ingot

ingot generate --spec ./your-api.yaml --lang typescript --out ./sdk
```

## From source

```bash
git clone https://github.com/YOUR_ORG/ingot.git
cd ingot
npm install
npm run build
node dist/cli.js generate --spec fixtures/petstore.yaml --lang typescript --out ./out/ts
```

## Architecture

```
OpenAPI 3.x Spec
       ↓
   ┌────────┐
   │ Parser │  → reads + validates the spec
   └───┬────┘
       ↓
   ┌────┐
   │ IR │  → language-agnostic intermediate representation
   └─┬──┘
     ↓
   ┌────────────────────┐
   │ Language Generators │
   │  ├── TypeScript     │
   │  ├── Python         │
   │  └── (add your own) │
   └────────────────────┘
       ↓
   Clean SDK output
```

Adding a new language means writing a single generator file against the IR. No need to understand OpenAPI parsing.

## Generated output

The generated code looks hand-written. No template artifacts, no bloated dependencies.

**TypeScript:**
```typescript
import { IngotClient } from "./client.js";

const client = new IngotClient({ apiKey: "sk-..." });
const pets = await client.pets.listPets({ limit: 10 });
```

**Python:**
```python
from petstore import IngotClient

client = IngotClient(api_key="sk-...")
pets = client.pets.list_pets(limit=10)
```

## Testing

```bash
npm test
```

## License

MIT
