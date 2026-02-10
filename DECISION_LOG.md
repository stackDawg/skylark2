Agentic Drone Operations Coordinator

## Key Assumptions

1. Certification mismatches (e.g., missing DGCA or Night Ops) block assignments as errors. Skill mismatches generate warnings but allow the assignment with a force flag—since a pilot might have transferable skills.

4. Location Matching: For drone operations, pilot and drone must be in the same city as the mission. Cross-city assignments are flagged as warnings (not blockers) since travel is theoretically possible.

5. Conflict testing: The seed data includes a built-in conflict: Neha (P002) is assigned to PRJ002 which requires "DGCA, Night Ops" certification, but she only has "DGCA". This is intentional to demonstrate conflict detection.


---

## Trade-offs Chosen

### 1. Module-level variables as the primary data store, with Google Sheets as the persistent backend instead of going with a conventional DB

Reason: For a 6-hour prototype, this avoids database setup complexity while still demonstrating 2-way sync. The trade-off is that data resets when the serverless function cold-starts (mitigated by re-reading from Sheets on init).

Alternative: SQLite/Turso for a lightweight database. Would be better for production but adds setup time.

### 2. Vercel AI SDK with Tool Calling (vs. Custom LLM Chain)

Vercel AI SDK's `streamText()` with `maxSteps: 10` for automatic tool-call loops.

Reason: The AI SDK handles the complex multi-step tool calling loop automatically, supports streaming, and provides the `useChat` React hook for seamless frontend integration. This saved significant development time.

Alernate approach: LangChain or custom OpenAI API integration. Both require more boilerplate for the same result.

### 3. GPT-5-nano Default 

GPT-5-nano provides excellent function calling at reasonable cost. For the types of structured queries and assignments in this domain, it performs comparably to GPT-5.


---

## What I'd Do Differently With More Time

1. Replace in-memory store with Supabase for true persistence across serverless invocations and multi-user support.

2. Use Google Sheets webhooks (or polling) for bi-directional real-time sync instead of sync-on-read.

3. Add authentication (e.g., NextAuth) and role-based permissions (admin vs. viewer).

4. Real time notification system - When urgent reassignments occur, send notifications via email/Slack to affected pilots and project managers.

5. Better visualization - A Gantt chart view showing pilot/drone assignments across time, making scheduling conflicts visually obvious.

6. Logging activity - Tracking all changes (who changed what, when) for accountability and rollback capabilities.

7. Implementing more comprehensive algorithm with more detailed data: Incorporate factors like pilot experience level, past performance on similar missions, travel time between locations, and drone battery/payload specifications.


---

## How I Interpreted "Urgent Reassignments"

"Urgent reassignment" means coordinating an emergency response when a critical resource (pilot or drone) becomes suddenly unavailable during or before an active mission. This is the most high-pressure scenario a could face I think and can possibly put critical missions at risk.

### Implementation

The `handleUrgentReassignment` tool implements a structured protocol:

Trigger (user reporting) --> Impact assessment (agent identifies missions affected by the trigger.) --> Resource search (run best match algo to find suitable replacements based on relevent metrics) --> Presentation and Confirmation (present the best approaches) --> Execution (once confirmed, the agent excecutes and makes the required changes, that is it updates pilot/drone status, assignments, etc.)


### Why This Approach

Real-world coordinators need speed (urgent = time-sensitive), visibility (what's affected?), and control (don't auto-assign without approval). The protocol balances automation (finding matches) with human oversight (confirming the plan), which is appropriate for a high-stakes operational environment.
