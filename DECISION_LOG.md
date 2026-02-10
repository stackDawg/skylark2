# Decision Log – SkyOps Drone Operations Coordinator

## Key Assumptions

1. **Data Volume**: The prototype handles tens of records (pilots, drones, missions). For production scale (hundreds/thousands), a proper database (PostgreSQL, Supabase) would replace the in-memory store.

2. **Single Coordinator**: The agent serves one coordinator at a time. Multi-user concurrency (simultaneous updates from different users) is not handled in this prototype.

3. **Certification is Strict, Skills are Soft**: Certification mismatches (e.g., missing DGCA or Night Ops) block assignments as **errors**. Skill mismatches generate **warnings** but allow the assignment with a force flag—since a pilot might have transferable skills.

4. **Location Must Match**: For drone operations, pilot and drone must be in the same city as the mission. Cross-city assignments are flagged as warnings (not blockers) since travel is theoretically possible.

5. **Intentional Data Conflicts**: The seed data includes a built-in conflict: Neha (P002) is assigned to PRJ002 which requires "DGCA, Night Ops" certification, but she only has "DGCA". This is intentional to demonstrate conflict detection.

6. **Date Overlap = Any Day Overlap**: Two missions overlap if there is any calendar day that falls within both date ranges (inclusive on both ends).

---

## Trade-offs Chosen

### 1. In-Memory Store + Google Sheets (vs. Database)

**Chosen**: Module-level variables as the primary data store, with Google Sheets as the persistent backend.

**Why**: For a 6-hour prototype, this avoids database setup complexity while still demonstrating 2-way sync. The trade-off is that data resets when the serverless function cold-starts (mitigated by re-reading from Sheets on init).

**Alternative considered**: SQLite/Turso for a lightweight database. Would be better for production but adds setup time.

### 2. Vercel AI SDK with Tool Calling (vs. Custom LLM Chain)

**Chosen**: Vercel AI SDK's `streamText()` with `maxSteps: 10` for automatic tool-call loops.

**Why**: The AI SDK handles the complex multi-step tool calling loop automatically, supports streaming, and provides the `useChat` React hook for seamless frontend integration. This saved significant development time.

**Alternative considered**: LangChain or custom OpenAI API integration. Both require more boilerplate for the same result.

### 3. GPT-4o-mini Default (vs. GPT-4o)

**Chosen**: GPT-4o-mini as default, configurable via environment variable.

**Why**: GPT-4o-mini provides excellent function calling at ~10x lower cost. For the types of structured queries and assignments in this domain, it performs comparably to GPT-4o. Users can switch to GPT-4o for more nuanced responses.

### 4. Full Sheet Rewrite for Sync (vs. Cell-level Updates)

**Chosen**: Individual row updates for single changes; full sheet rewrite for bulk sync.

**Why**: Row-level updates are efficient for normal operations (changing one pilot's status). Full rewrite is used only for the manual "Sync All" operation, keeping Sheets in perfect sync.

### 5. Seed Data Embedded in Code (vs. Runtime CSV Parsing)

**Chosen**: TypeScript arrays as seed data, with CSV files as documentation/reference.

**Why**: Avoids file system dependencies in serverless environments. The app works identically on local dev and Vercel without needing to bundle CSV files. CSV files remain in the repo as the source of truth for initial data.

---

## What I'd Do Differently With More Time

1. **Persistent Database**: Replace in-memory store with Supabase or PlanetScale for true persistence across serverless invocations and multi-user support.

2. **Real-time Sync**: Use Google Sheets webhooks (or polling) for bi-directional real-time sync instead of sync-on-read.

3. **Role-Based Access**: Add authentication (e.g., NextAuth) and role-based permissions (admin vs. viewer).

4. **Notification System**: When urgent reassignments occur, send notifications via email/Slack to affected pilots and project managers.

5. **Mission Timeline Visualization**: A Gantt chart view showing pilot/drone assignments across time, making scheduling conflicts visually obvious.

6. **Audit Log**: Track all changes (who changed what, when) for accountability and rollback capabilities.

7. **More Robust Matching Algorithm**: Incorporate factors like pilot experience level, past performance on similar missions, travel time between locations, and drone battery/payload specifications.

8. **Automated Testing**: Unit tests for conflict detection logic, integration tests for the assignment workflow, and end-to-end tests for the chat interface.

---

## How I Interpreted "Urgent Reassignments"

### Interpretation

"Urgent reassignment" means coordinating an emergency response when a critical resource (pilot or drone) becomes **suddenly unavailable** during or before an active mission. This is the most high-pressure scenario a coordinator faces—things have gone wrong and missions are at risk.

### Implementation

The `handleUrgentReassignment` tool implements a structured protocol:

1. **Trigger**: User reports that a pilot or drone is unavailable (e.g., "Neha called in sick", "D003 has a malfunction").

2. **Impact Assessment**: The agent automatically identifies all missions affected by this unavailability, sorted by priority (Urgent → High → Standard).

3. **Resource Search**: For each affected mission, the system runs the best-match algorithm to find suitable replacements, considering:
   - Required skills and certifications
   - Location match
   - Current availability (no overlapping assignments)
   - Overall compatibility score

4. **Plan Presentation**: The agent presents a structured reassignment plan showing:
   - Which missions are affected and their priority
   - Top 3 replacement options per mission with scores
   - Any missions where no suitable replacement exists

5. **Confirmation-Based Execution**: The agent asks the user to confirm before making changes. Once confirmed, it updates pilot/drone statuses, mission assignments, and syncs everything to Google Sheets.

### Why This Approach

Real-world coordinators need **speed** (urgent = time-sensitive), **visibility** (what's affected?), and **control** (don't auto-assign without approval). The protocol balances automation (finding matches) with human oversight (confirming the plan), which is appropriate for a high-stakes operational environment.
