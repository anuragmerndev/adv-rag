# AdvChat — Backend API

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)
![Pinecone](https://img.shields.io/badge/Pinecone-000000?logo=pinecone&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

RAG-powered document Q&A API with streaming responses, dual-layer caching, multi-tenant vector search, and pre-LLM content redaction.

**[Live Demo](https://adv-rag-ui.vercel.app)** | **[Frontend Repo](https://github.com/anuragmerndev/adv-rag-ui)** | **[Case Study](https://dev.to/anuragmerndev/i-built-a-production-rag-pipeline-heres-what-most-tutorials-skip-272n)**

---

## Architecture

![Architecture](docs/architecture.drawio.png)

**Upload path:** PDF → parse (LangChain) → chunk (500 tokens, 100 overlap) → embed (OpenAI text-embedding-3-small) → store (Pinecone, namespaced per user)

**Query path:** Question → normalize → SHA-256 fingerprint → check embedding cache (Redis) → embed if miss → similarity search (Pinecone) → redact suspicious context → stream answer (GPT-4o-mini) → persist (Postgres)

---

## Features

- **RAG Pipeline** — PDF upload, chunking, embedding, vector search, LLM answer generation
- **SSE Streaming** — real-time response streaming with a two-event protocol (chunks + done with provenance)
- **Dual-Layer Caching** — embedding cache (`emb:`) saves OpenAI calls; response cache (`resp:`) for standalone queries
- **Query Fingerprinting** — normalizes queries (contractions, stopwords, punctuation) then SHA-256 hashes for cache deduplication
- **Pre-LLM Redaction** — scans retrieved context for suspicious terms, redacts before LLM sees it, returns policy decision
- **Multi-Tenant Isolation** — Pinecone namespaces per user, infrastructure-level data separation
- **Multi-Turn Conversations** — persists messages, injects last 6 messages as chat history
- **Auto-Titling** — conversations auto-titled from first user message
- **Document Management** — list, delete (with Pinecone vector cleanup), download
- **Health Checks** — `/health` pings Postgres, Redis, Pinecone in parallel
- **Clerk Auth** — OAuth middleware + webhook sync for user creation/deletion
- **Graceful Shutdown** — SIGTERM handler with 10s timeout, closes all connections

---

## Tech Stack

| Technology | Purpose             | Why                                                         |
| ---------- | ------------------- | ----------------------------------------------------------- |
| Express    | API framework       | Lightweight, full control over SSE and middleware chain     |
| TypeScript | Language            | Type safety across services                                 |
| Prisma     | ORM                 | Type-safe queries, migrations, schema-first                 |
| OpenAI     | LLM + Embeddings    | GPT-4o-mini for answers, text-embedding-3-small for vectors |
| Pinecone   | Vector database     | Managed, namespace isolation, batch upsert                  |
| Redis      | Caching             | Embedding + response cache, sub-ms reads                    |
| PostgreSQL | Relational database | Users, conversations, messages, document metadata           |
| Clerk      | Authentication      | OAuth, webhook-based user sync                              |
| LangChain  | Document processing | PDF parsing, recursive text splitting                       |
| Zod        | Validation          | Request body validation at API boundary                     |

---

## API Endpoints

All endpoints except `/health` and `/v1/webhooks/clerk` require Clerk authentication.

| Method   | Path                         | Description                              |
| -------- | ---------------------------- | ---------------------------------------- |
| `POST`   | `/v1/rag/upload`             | Upload and index a PDF document          |
| `POST`   | `/v1/rag/query`              | Query documents (supports streaming)     |
| `GET`    | `/v1/conversations`          | List user conversations                  |
| `POST`   | `/v1/conversations`          | Create a new conversation                |
| `GET`    | `/v1/conversations/:id`      | Get conversation with messages           |
| `PATCH`  | `/v1/conversations/:id`      | Update conversation title                |
| `DELETE` | `/v1/conversations/:id`      | Delete conversation                      |
| `GET`    | `/v1/documents`              | List user documents                      |
| `DELETE` | `/v1/documents/:id`          | Delete document + vectors                |
| `GET`    | `/v1/documents/:id/download` | Download document                        |
| `POST`   | `/v1/webhooks/clerk`         | Clerk user sync webhook                  |
| `GET`    | `/health`                   | Health check (Postgres, Redis, Pinecone) |

---

## Project Structure

```
src/
├── config/
│   └── env.ts                  # Centralized env var validation
├── controllers/
│   ├── conversation.controllers.ts
│   ├── document.controllers.ts
│   ├── rag.controllers.ts      # Upload + query (streaming + non-streaming)
│   └── webhook.controllers.ts  # Clerk webhook handler
├── db/
│   └── prisma.ts               # Prisma client singleton
├── logging/
│   └── logger.ts               # Winston logger
├── middlewares/
│   ├── auth.middleware.ts       # Clerk auth + requireAuth guard
│   ├── globalErrorHandler.ts
│   └── validateBody.ts         # Zod validation middleware
├── routes/
│   ├── conversation.routes.ts
│   ├── document.routes.ts
│   ├── rag.routes.ts
│   ├── webhook.routes.ts
│   └── index.ts                # Root router
├── services/
│   ├── cache.service.ts        # Redis wrapper (get/set/delete)
│   ├── embedding.services.ts   # OpenAI embeddings (single + batch)
│   ├── langchain.services.ts   # PDF loading + text splitting
│   ├── llm.service.ts          # OpenAI chat completions (generate + stream)
│   ├── pinecone.service.ts     # Vector upsert/search/delete with namespaces
│   ├── rag.service.ts          # RAG pipeline orchestration
│   └── reranking.service.ts    # Cross-encoder reranking (experimental)
├── utils/
│   ├── apiError.ts
│   ├── apiResponse.ts
│   ├── asyncHandler.ts
│   ├── helper.ts               # Multer config + query normalization + SHA fingerprint
│   ├── responseMessage.ts
│   └── responseStatus.ts
├── validators/
│   └── rag.validators.ts       # Zod schemas for query endpoint
├── app.ts                      # Express app setup (CORS, middleware, routes)
└── server.ts                   # HTTP server + clustering + graceful shutdown
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- Pinecone account (free tier works)
- OpenAI API key
- Clerk account

### Setup

```bash
git clone https://github.com/anuragmerndev/adv-rag.git
cd adv-rag
npm ci
```

### Environment Variables

Create a `.env` file:

```env
# Server
PORT=8080
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/advchat

# AI
OPENAI_API_KEY=sk-...

# Vector DB
PINECONE_API_KEY=...
PINECONE_INDEX=ai-document

# Cache
REDIS_URL=redis://localhost:6379

# Auth
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

### Run

```bash
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Server starts at `http://localhost:8080`.

---

## Deployment

Deployed on **Railway** with Postgres and Redis plugins.

- **Dockerfile** — multi-stage build (compile TypeScript → production image with only compiled output)
- **railway.toml** — runs `prisma migrate deploy` before start, health check on `/health`
- **Auto-deploy** — pushes to `main` trigger automatic redeployment
- **CI** — GitHub Actions runs lint → type check → build on every push

---

## License

MIT
