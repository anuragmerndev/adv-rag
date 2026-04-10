# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev        # Run with tsx watch (hot reload)

# Build & Production
npm run build            # Compile TypeScript (tsc + tsc-alias for path resolution)
npm run start:prod       # Run compiled output (requires build first)

# Code quality
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format all src/**/*.ts

# Database migrations
npm run db:migrate:up     # Run all pending migrations
npm run db:migrate:down   # Rollback last migration
npm run db:migrate:status # Show migration status
npm run db:migrate:create # Create new migration file

# Infrastructure (Docker)
docker compose up -d     # Start PostgreSQL (pgvector) + Redis
```

Commits must follow Conventional Commits format (enforced by commitlint + husky).

## Workflow Requirements

After completing any code changes, always run the `/review` command and fix every issue it reports before considering the task done. Do not skip this step even for small changes.

## Architecture

This is an Express + TypeScript **RAG (Retrieval-Augmented Generation) API** that lets users upload PDF documents and query them using vector similarity search + LLM generation.

### Request Flow

**Upload:** `POST /v1/rag/upload` (multipart/form-data, field: `document`)
1. Multer saves file to `uploads/`
2. `LangchainService` loads PDF and splits into chunks (500 chars, 100 overlap)
3. `EmbeddingService` calls OpenAI to batch-embed all chunks
4. Document record saved via `databaseOperations`, chunks inserted via `PgVectorService.insertChunksBatch()`

**Query:** `POST /v1/rag/query` (`{ query, stream }`)
1. Query is normalized (lowercased, contractions expanded, stopwords removed) and SHA-256 fingerprinted
2. Full response cache checked in Redis (`resp:{fingerprint}`)
3. Query embedding fetched or cached in Redis (`emb:{fingerprint}`)
4. `PgVectorService.similaritySearch()` runs top-5 cosine similarity search against pgvector
5. Pre-filter scans retrieved docs for suspicious keywords; policy check returns `allow` or `partial`
6. `LLMService` generates answer (non-streaming) or streams SSE chunks (when `stream: true`)
7. Full response cached in Redis for future identical queries

### Services (all singletons via `getInstance()`)

| Service | Responsibility |
|---|---|
| `EmbeddingService` | OpenAI embeddings (`text-embedding-3-small`, 1536-dim) |
| `PgVectorService` | pgvector CRUD + cosine similarity search via `<=>` operator |
| `LangchainService` | PDF loading (`PDFLoader`) + text splitting (`RecursiveCharacterTextSplitter`) |
| `LLMService` | OpenAI chat completions (`gpt-4o-mini`), supports streaming |
| `CacheService` | Redis via ioredis (localhost:6379) |
| `RerankingService` | Similarity threshold filtering + keyword boosting (post-processing) |
| `RagService` | Orchestrates embedding → vector search → pre-filter → policy check |

### Database

- **PostgreSQL + pgvector** (`ankane/pgvector` Docker image): raw `pg` Pool, no ORM
- Connection singleton in `src/db/client.ts`; pool size: min 5, max 20
- Custom SQL migration system in `src/scripts/migrate.ts`; migration files in `src/db/migrations/*.sql`
- Migration file format: `-- UP` / `-- DOWN` sections in `.sql` files
- Embedding dimension is **hardcoded to 1536** throughout `PgVectorService`

### Path Aliases (tsconfig)

| Alias | Path |
|---|---|
| `@controllers/*` | `src/controllers/*` |
| `@services/*` | `src/services/*` |
| `@routes/*` | `src/routes/*` |
| `@middlewares/*` | `src/middlewares/*` |
| `@utils/*` | `src/utils/*` |
| `@logger/*` | `src/logging/*` |
| `@validators/*` | `src/validators/*` |

`tsc-alias` resolves these aliases in the compiled output; always run `npm run build` (not `tsc` alone) to get correct dist output.

### Key Utilities

- `src/utils/helper.ts`: `normalizeQuery()` (stopword removal + contraction expansion), `createShaFingerprint()` (SHA-256 for cache keys), and Multer `upload` instance
- `src/utils/apiResponse.ts` + `asyncHandler.ts`: standard response wrapper and async error propagation
- Production mode (`NODE_ENV=production`): Node.js cluster forks one worker per CPU core

### Required Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `OPENAI_API_KEY` — used by both `EmbeddingService` and `LLMService`
- `PORT` (optional, defaults to 8080)
- Redis is hardcoded to `localhost:6379` in `CacheService`
