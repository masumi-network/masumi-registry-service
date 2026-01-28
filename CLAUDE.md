# CLAUDE.md - Masumi Registry Service

A Registry Lookup service for MASUMI AI Nodes on the Cardano blockchain. Provides REST API for querying and filtering registered AI agents with health checking, uptime tracking, and blockchain synchronization.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Build for production (Prisma generate + tsc + pkgroll) |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run Jest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run prisma:generate` | Generate Prisma client types |
| `npm run prisma:migrate:dev` | Create new migration |
| `npm run prisma:migrate` | Apply migrations (production) |
| `npm run prisma:seed` | Seed the database |
| `npm run swagger-json` | Generate OpenAPI JSON |
| `npm run knip` | Find unused code/dependencies |

## Tech Stack

- **Runtime**: Node.js v20+, TypeScript 5.x, ES Modules (`"type": "module"`)
- **Framework**: Express 5 + express-zod-api (type-safe endpoints with auto OpenAPI)
- **Database**: PostgreSQL 15 + Prisma ORM 6.x
- **Validation**: Zod 3.x with @asteasolutions/zod-to-openapi
- **Blockchain**: Blockfrost API + @meshsdk/core for Cardano
- **Concurrency**: async-mutex for safe concurrent operations
- **Logging**: Winston (dev/prod configurations)
- **Testing**: Jest + ts-jest
- **Linting**: ESLint 9 (flat config) + Prettier
- **Git Hooks**: Husky + lint-staged + commitlint

## Project Structure

```
src/
├── index.ts                    # Entry point - server bootstrap
├── routes/
│   ├── index.ts                # Root router
│   └── api/
│       ├── index.ts            # API v1 route registry
│       ├── registry-entry/     # Agent registry endpoints
│       │   ├── index.ts        # Endpoint handlers
│       │   └── schemas.ts      # Zod input/output schemas
│       ├── registry-diff/      # Diff/sync endpoints
│       ├── api-key/            # API key management (admin)
│       ├── api-key-status/     # Key status check
│       ├── capability/         # Agent capabilities
│       ├── health/             # Health check endpoint
│       ├── payment-information/
│       └── registry-source/    # Registry source management
├── services/
│   ├── registry-entry/         # Registry query logic
│   ├── cardano-registry/       # Blockchain sync + parsing
│   ├── health-check/           # Agent availability verification
│   ├── api-key/                # API key operations
│   ├── api-key-status/
│   ├── capability/
│   ├── registry-source/
│   ├── token-credit/           # Usage tracking
│   └── schedules/              # Background job initialization
├── repositories/               # Data access layer (Prisma)
│   ├── registry-entry/
│   ├── api-key/
│   ├── capability/
│   ├── health/
│   ├── payment-information/
│   ├── registry-source/
│   └── creditTokens/
└── utils/
    ├── config/                 # Environment configuration
    ├── db/                     # Prisma client + connection
    ├── logger/                 # Winston logger (dev/prod)
    ├── endpoint-factory/       # Express-zod-api factories
    │   ├── authenticated/      # Requires API key
    │   ├── admin-authenticated/ # Requires admin API key
    │   └── unauthenticated/    # Public endpoints
    ├── middleware/
    │   └── auth-middleware/    # Token validation middleware
    ├── blockfrost/             # BlockFrostAPI instance cache
    ├── crypto/                 # SHA-256 token hashing
    ├── async-interval/         # Async-safe interval runner
    ├── metadata-string-convert/ # Blockchain metadata parsing
    ├── swagger-generator/      # OpenAPI doc generation
    └── zod-openapi.ts          # Zod + OpenAPI extensions
prisma/
├── schema.prisma               # Database schema (source of truth)
├── migrations/                 # SQL migrations
└── seed.ts                     # Database seeding
```

## Architecture Patterns

### Layered Architecture
```
Routes (HTTP) → Services (Business Logic) → Repositories (Data Access)
```

- **Routes**: Define endpoints using express-zod-api factories, handle validation
- **Services**: Contain business logic, orchestrate repositories, no HTTP types
- **Repositories**: Pure Prisma queries, return database types

### Endpoint Factory Pattern
```typescript
// Use authenticatedEndpointFactory for protected routes
export const queryRegistryEntryPost = authenticatedEndpointFactory.build({
  method: 'post',
  input: inputSchema,
  output: outputSchema,
  handler: async ({ input, options }) => { ... }
});
```

Three factories available:
- `authenticatedEndpointFactory` - Requires valid API key
- `adminAuthenticatedEndpointFactory` - Requires admin API key
- `unauthenticatedEndpointFactory` - Public access

### Singleton Export Pattern
```typescript
// Services and repositories export as singleton objects
export const registryEntryService = {
  getRegistryEntries,
  getRegistryDiffEntries,
};
```

### Mutex Pattern for Concurrency
```typescript
// Use async-mutex for operations that shouldn't run concurrently
const updateMutex = new Mutex();
let release = await tryAcquire(updateMutex).acquire();
try {
  // ... operation
} finally {
  release();
}
```

## Key Principles

- Use path aliases: `@/routes/*`, `@/services/*`, `@/repositories/*`, `@/utils/*`
- Import Zod from `@/utils/zod-openapi` (includes OpenAPI extensions)
- Use `z.nativeEnum()` for Prisma enums
- Use cursor-based pagination with `cursorId` parameter
- Handle blockchain metadata strings with `metadataStringConvert()` (handles string arrays)
- Cache BlockFrost instances via `getBlockfrostInstance()` to prevent memory leaks

## Critical Guidelines

### Always Do
- Define Zod schemas for all API inputs/outputs
- Add `.openapi('SchemaName')` to output schemas for docs
- Use `http-errors` for error responses (createHttpError)
- Hash API tokens before database storage/lookup
- Use `Promise.allSettled()` for parallel operations that can fail independently
- Clean up resources in `finally` blocks (AbortController, timeouts)
- Log errors with context using Winston structured logging

### Never Do
- Commit `.env` files or API keys
- Push directly to `main` or `dev` branches
- Use raw SQL instead of Prisma queries
- Store plaintext API tokens
- Use `any` type without explicit justification
- Skip health check verification for registry entries
- Create new BlockFrost instances per-request (use cache)

## Formatting Standards

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

## Commit Standards

Conventional commits with commitlint:

```
<type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, revert, build
```

- Max header: 72 characters
- Type: lowercase, required
- No period at end of subject

## Domain Concepts

| Concept | Description |
|---------|-------------|
| **RegistryEntry** | An AI agent registered on Cardano via NFT metadata |
| **RegistrySource** | Configuration for a policy ID to scan for agents |
| **Capability** | Named capability with version (e.g., "text-generation", "1.0") |
| **AgentPricing** | Payment model: Fixed (with amounts) or Free |
| **Status** | Agent state: Online, Offline, Deregistered, Invalid |
| **Network** | Cardano network: Preprod or Mainnet |
| **ApiKey** | Auth token with permission (User/Admin) and usage tracking |
| **AssetIdentifier** | Unique blockchain asset ID (policyId + assetName) |

## Background Jobs

Two scheduled tasks run via `AsyncInterval`:
1. **Registry Sync** (`UPDATE_CARDANO_REGISTRY_INTERVAL`): Scans blockchain for new/burned agent NFTs
2. **Health Check** (`UPDATE_HEALTH_CHECK_INTERVAL`): Verifies agent endpoint availability

## Health Check Logic

Agents are verified by:
1. Calling `{apiBaseUrl}/availability` endpoint
2. Checking response includes matching `agentIdentifier`
3. Updating status: Online (verified), Offline (unreachable), Invalid (wrong identifier)

## API Authentication

- Token passed via `token` header
- Tokens hashed with SHA-256 before database lookup
- Middleware returns user context in `options` parameter:
  ```typescript
  { id, permissions, accumulatedUsageCredits, maxUsageCredits, usageLimited }
  ```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `express-zod-api` | Type-safe REST endpoints with validation |
| `@prisma/client` | Database ORM |
| `zod` | Schema validation and type inference |
| `@blockfrost/blockfrost-js` | Cardano blockchain API |
| `@meshsdk/core` | Cardano utilities |
| `async-mutex` | Concurrency control |
| `winston` | Structured logging |
| `http-errors` | HTTP error responses |
| `@paralleldrive/cuid2` | ID generation |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `Admin_KEY` | Yes | Admin API key for bootstrapping |
| `Blockfrost_API_KEY` | Yes | Blockfrost API key |
| `PORT` | No | Server port (default: 3000) |
| `UPDATE_CARDANO_REGISTRY_INTERVAL` | No | Sync interval in seconds (default: 50) |
| `UPDATE_HEALTH_CHECK_INTERVAL` | No | Health check interval (default: 100) |

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Application bootstrap, Express setup |
| `prisma/schema.prisma` | Database models (source of truth) |
| `src/routes/api/index.ts` | API route registry |
| `src/utils/config/index.ts` | Environment config + defaults |
| `src/services/cardano-registry/cardano-registry.service.ts` | Blockchain sync logic |
| `src/services/health-check/health-check.service.ts` | Agent verification |
| `src/utils/middleware/auth-middleware/index.ts` | Auth implementation |

## Testing

- Test files: `*.spec.ts` alongside source files
- Mock `global.fetch` for external API calls
- Use `jest.clearAllMocks()` in `beforeEach`
- Test both success and error paths

## API Documentation

- Development: http://localhost:3000/docs
- Production: https://registry.masumi.network/docs/
- OpenAPI JSON: `/api-docs` endpoint
