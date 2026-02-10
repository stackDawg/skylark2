# SkyOps – Drone Operations Coordinator AI Agent

An AI-powered conversational agent that handles the core responsibilities of a drone operations coordinator for Skylark Drones: managing pilot rosters, drone fleet, mission assignments, and conflict detection—all with 2-way Google Sheets sync.

![SkyOps](https://img.shields.io/badge/SkyOps-AI_Agent-blue) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue) ![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-green)

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

### Key Components

| Component | File(s) | Purpose |
|-----------|---------|---------|
| **Chat UI** | `app/page.tsx` | Conversational interface with markdown rendering, suggested prompts, sidebar dashboard |
| **Chat API** | `app/api/chat/route.ts` | AI agent with 11 tools, streaming responses via Vercel AI SDK |
| **Data Store** | `lib/dataStore.ts` | In-memory data management with seed data fallback |
| **Google Sheets** | `lib/googleSheets.ts` | 2-way sync: read all sheets, write individual row updates |
| **Conflict Engine** | `lib/conflicts.ts` | Conflict detection, assignment validation, best-match scoring |
| **Types** | `lib/types.ts` | TypeScript type definitions for all domain entities |

### AI Agent Tools (11 tools)

1. `queryPilots` – Filter pilots by skill, certification, location, status
2. `queryDrones` – Filter drones by capability, status, location
3. `queryMissions` – Filter missions by priority, location, status, skill
4. `updatePilotStatus` – Update pilot status → syncs to Google Sheets
5. `updateDroneStatus` – Update drone status → syncs to Google Sheets
6. `assignPilotToMission` – Assign pilot with automatic conflict checking
7. `assignDroneToMission` – Assign drone with automatic conflict checking
8. `unassignFromMission` – Remove pilot/drone from mission
9. `detectConflicts` – Full conflict scan across all assignments
10. `findBestMatch` – Ranked pilot/drone suggestions for a mission
11. `handleUrgentReassignment` – Coordinate emergency reassignments
12. `getOverview` – Dashboard summary of operations
13. `syncWithSheets` – Force resync with Google Sheets

---

## Setup & Run Locally

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- (Optional) Google Cloud service account with Sheets API enabled

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional: defaults to gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini

# Optional: Google Sheets (2-way sync)
GOOGLE_SHEETS_CLIENT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

### 3. Google Sheets Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project & enable the **Google Sheets API**
3. Create a **Service Account** → download the JSON key
4. Create a Google Spreadsheet with 3 sheets named:
   - `Pilot Roster`
   - `Drone Fleet`
   - `Missions`
5. Copy the CSV data into each sheet (headers in row 1)
6. **Share** the spreadsheet with the service account email
7. Add the credentials to `.env.local`

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Features Demonstrated

### Roster Management
- "Show all available pilots in Bangalore"
- "Mark pilot P004 as Available"
- "Which pilots have Night Ops certification?"

### Assignment Tracking
- "Assign Arjun to mission PRJ001"
- "Find the best pilot for PRJ003"
- "Show all active assignments"

### Drone Inventory
- "Which drones are available in Mumbai?"
- "Mark D002 as Available after maintenance"
- "Show all thermal-capable drones"

### Conflict Detection
- "Run a full conflict detection scan"
- "Can I assign P002 to PRJ005?" (detects date overlap + cert mismatch)
- "What happens if I assign D002 to PRJ002?" (detects maintenance issue)

### Urgent Reassignment
- "Neha (P002) called in sick. Handle the urgent reassignment."
- The agent identifies affected missions, finds replacements, and proposes a plan.

### Edge Cases Handled
- ✅ Pilot assigned to overlapping project dates
- ✅ Pilot assigned to job requiring certification they lack
- ✅ Drone assigned but currently in maintenance
- ✅ Pilot and assigned drone in different locations

---

## Tech Stack Justification

| Choice | Why |
|--------|-----|
| **Next.js 15** | Full-stack React framework; API routes + SSR + easy Vercel deployment |
| **Vercel AI SDK** | First-class streaming + tool calling support; `useChat` hook for seamless frontend integration |
| **OpenAI GPT-4o-mini** | Best balance of cost/speed/quality for function calling |
| **Google Sheets API** | Direct API via `googleapis` for reliable 2-way sync |
| **TypeScript** | Type safety across the entire stack |
| **Tailwind CSS** | Rapid, consistent UI development |
| **In-memory data store** | Fast queries for prototype; Google Sheets as persistent backend |

---

## Project Structure

```
SkylarDrone/
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # AI agent API
│   │   └── sync/route.ts      # Sync status & manual sync
│   ├── globals.css             # Tailwind + custom styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Chat UI
├── lib/
│   ├── types.ts                # Type definitions
│   ├── dataStore.ts            # Data management + sync
│   ├── googleSheets.ts         # Google Sheets integration
│   └── conflicts.ts            # Conflict detection engine
├── pilot_roster.csv            # Reference data
├── drone_fleet.csv             # Reference data
├── missions.csv                # Reference data
├── DECISION_LOG.md             # Design decisions
├── package.json
└── README.md
```
