Drone Operations Coordinator AI Agent


---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                     Frontend                          │
│  Next.js App Router + React + Tailwind CSS            │
│  Chat UI with useChat() hook (Vercel AI SDK)          │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP Stream (SSE)
┌──────────────────────▼───────────────────────────────┐
│                  API Route /api/chat                   │
│  Vercel AI SDK streamText() with 11 Tool Definitions  │
│  OpenAI GPT-4o / GPT-4o-mini (Function Calling)       │
└──────┬──────────────────────────────────┬────────────┘
       │                                  │
┌──────▼──────────┐            ┌──────────▼───────────┐
│   Data Store     │            │  Conflict Engine      │
│  In-memory cache │            │  Validation rules     │
│  CRUD operations │            │  Best-match scoring   │
└──────┬──────────┘            └──────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│              Google Sheets API (googleapis)           │
│  2-way sync: Read on init, Write on every update      │
│  Service Account authentication (JWT)                 │
└─────────────────────────────────────────────────────┘
```
