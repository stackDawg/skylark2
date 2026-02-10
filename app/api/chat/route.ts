// ============================================
// Chat API Route - AI Agent with Tool Calling
// ============================================

import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import {
  getPilots,
  getDrones,
  getMissions,
  getPilotById,
  getDroneById,
  getMissionById,
  updatePilotStatus,
  updateDroneStatus,
  updateMissionStatus,
  getDataSummary,
  forceSync,
} from '@/lib/dataStore';
import { detectAllConflicts, validatePilotAssignment, validateDroneAssignment, findBestPilotForMission, findBestDroneForMission } from '@/lib/conflicts';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are **SkyOps**, the AI Drone Operations Coordinator for Skylark Drones. You help manage the company's fleet of drones, pilot roster, and mission assignments.

## Your Responsibilities
1. **Roster Management** — Query pilot availability by skill, certification, location. Update pilot statuses.
2. **Assignment Tracking** — Match pilots/drones to projects. Track and handle reassignments.
3. **Drone Inventory** — Query fleet by capability, availability, location. Track maintenance.
4. **Conflict Detection** — Identify double-bookings, skill/cert mismatches, location issues, and maintenance conflicts.

## Important Rules
- **Always check for conflicts** before confirming an assignment.
- When showing data, use clean **markdown tables** for clarity.
- For status updates, confirm the change and whether it was synced to Google Sheets.
- **Prioritize missions** by priority: Urgent > High > Standard.
- Be proactive: if you notice potential issues, flag them.
- When a user asks about "urgent reassignment," find all affected missions, propose replacements sorted by priority, and confirm before executing.
- Today's date is ${new Date().toISOString().split('T')[0]}.

## Conflict Rules
- A pilot cannot be assigned to overlapping date ranges across missions.
- A drone cannot be assigned to overlapping date ranges.
- Pilot must have ALL required certifications for a mission.
- Pilot must have ALL required skills for a mission.
- Pilot and drone locations must match the mission location.
- Drones in "Maintenance" status cannot be assigned.
- Pilots with "On Leave" or "Unavailable" status cannot be assigned.

## Urgent Reassignment Protocol
When a pilot or drone becomes unexpectedly unavailable:
1. Mark them as unavailable.
2. Identify all affected missions (sorted by priority).
3. Find suitable replacements (matching skills, certs, location, availability).
4. Present a reassignment plan with options ranked by suitability score.
5. Execute changes only after user confirms.

## Response Style
- Be concise but thorough.
- Use emoji sparingly for visual clarity (✅ ❌ ⚠️ 📋).
- Format data as tables when showing lists.
- Always mention the Google Sheets sync status when making changes.`;

export async function POST(req: Request) {
  try {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY is not configured. Add it to your environment variables.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages } = await req.json();
  const model = process.env.OPENAI_MODEL || 'gpt-5-nano';

  const result = streamText({
    model: openai(model, { structuredOutputs: true }),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      // ---- QUERY TOOLS ----
      queryPilots: tool({
        description: 'Query the pilot roster with optional filters. Returns a list of pilots matching the criteria. Pass null to skip a filter.',
        parameters: z.object({
          skill: z.string().nullable().describe('Filter by skill (e.g., Mapping, Survey, Inspection, Thermal). Pass null to skip.'),
          certification: z.string().nullable().describe('Filter by certification (e.g., DGCA, Night Ops). Pass null to skip.'),
          location: z.string().nullable().describe('Filter by location (e.g., Bangalore, Mumbai, Delhi). Pass null to skip.'),
          status: z.string().nullable().describe('Filter by status (Available, Assigned, On Leave, Unavailable). Pass null to skip.'),
        }),
        execute: async (params) => {
          const filters = {
            skill: params.skill || undefined,
            certification: params.certification || undefined,
            location: params.location || undefined,
            status: params.status || undefined,
          };
          const pilots = await getPilots(filters);
          return {
            count: pilots.length,
            pilots: pilots.map((p) => ({
              id: p.pilot_id,
              name: p.name,
              skills: p.skills.join(', '),
              certifications: p.certifications.join(', '),
              location: p.location,
              status: p.status,
              current_assignment: p.current_assignment || 'None',
              available_from: p.available_from,
            })),
          };
        },
      }),

      queryDrones: tool({
        description: 'Query the drone fleet with optional filters. Returns a list of drones matching the criteria. Pass null to skip a filter.',
        parameters: z.object({
          capability: z.string().nullable().describe('Filter by capability (e.g., LiDAR, RGB, Thermal). Pass null to skip.'),
          status: z.string().nullable().describe('Filter by status (Available, Maintenance, Deployed). Pass null to skip.'),
          location: z.string().nullable().describe('Filter by location (e.g., Bangalore, Mumbai, Delhi). Pass null to skip.'),
        }),
        execute: async (params) => {
          const filters = {
            capability: params.capability || undefined,
            status: params.status || undefined,
            location: params.location || undefined,
          };
          const drones = await getDrones(filters);
          return {
            count: drones.length,
            drones: drones.map((d) => ({
              id: d.drone_id,
              model: d.model,
              capabilities: d.capabilities.join(', '),
              status: d.status,
              location: d.location,
              current_assignment: d.current_assignment || 'None',
              maintenance_due: d.maintenance_due,
            })),
          };
        },
      }),

      queryMissions: tool({
        description: 'Query missions/projects with optional filters. Returns a list of missions matching the criteria. Pass null to skip a filter.',
        parameters: z.object({
          priority: z.string().nullable().describe('Filter by priority (Urgent, High, Standard). Pass null to skip.'),
          location: z.string().nullable().describe('Filter by location. Pass null to skip.'),
          status: z.string().nullable().describe('Filter by mission status (Planned, Active, Completed, Cancelled). Pass null to skip.'),
          skill: z.string().nullable().describe('Filter by required skill. Pass null to skip.'),
        }),
        execute: async (params) => {
          const filters = {
            priority: params.priority || undefined,
            location: params.location || undefined,
            status: params.status || undefined,
            skill: params.skill || undefined,
          };
          const missions = await getMissions(filters);
          return {
            count: missions.length,
            missions: missions.map((m) => ({
              id: m.project_id,
              client: m.client,
              location: m.location,
              required_skills: m.required_skills.join(', '),
              required_certs: m.required_certs.join(', '),
              dates: `${m.start_date} to ${m.end_date}`,
              priority: m.priority,
              assigned_pilot: m.assigned_pilot || 'Unassigned',
              assigned_drone: m.assigned_drone || 'Unassigned',
              status: m.mission_status,
            })),
          };
        },
      }),

      // ---- STATUS UPDATE TOOLS ----
      updatePilotStatus: tool({
        description: 'Update a pilot\'s status. This syncs back to Google Sheets. Use this for marking pilots Available, On Leave, Unavailable, etc.',
        parameters: z.object({
          pilot_id: z.string().describe('The pilot ID (e.g., P001)'),
          status: z.enum(['Available', 'Assigned', 'On Leave', 'Unavailable']).describe('New status'),
          current_assignment: z.string().nullable().describe('New assignment (project ID). Pass null to keep unchanged.'),
          available_from: z.string().nullable().describe('Date when pilot will be available (YYYY-MM-DD). Pass null to keep unchanged.'),
          location: z.string().nullable().describe('Update pilot location. Pass null to keep unchanged.'),
        }),
        execute: async (params) => {
          const result = await updatePilotStatus(params.pilot_id, {
            status: params.status,
            current_assignment: params.current_assignment ?? undefined,
            available_from: params.available_from ?? undefined,
            location: params.location ?? undefined,
          });
          return result;
        },
      }),

      updateDroneStatus: tool({
        description: 'Update a drone\'s status. This syncs back to Google Sheets. Use this for marking drones Available, in Maintenance, or Deployed.',
        parameters: z.object({
          drone_id: z.string().describe('The drone ID (e.g., D001)'),
          status: z.enum(['Available', 'Maintenance', 'Deployed']).describe('New status'),
          current_assignment: z.string().nullable().describe('New assignment (project ID). Pass null to keep unchanged.'),
          location: z.string().nullable().describe('Update drone location. Pass null to keep unchanged.'),
          maintenance_due: z.string().nullable().describe('New maintenance due date (YYYY-MM-DD). Pass null to keep unchanged.'),
        }),
        execute: async (params) => {
          const result = await updateDroneStatus(params.drone_id, {
            status: params.status,
            current_assignment: params.current_assignment ?? undefined,
            location: params.location ?? undefined,
            maintenance_due: params.maintenance_due ?? undefined,
          });
          return result;
        },
      }),

      // ---- ASSIGNMENT TOOLS ----
      assignPilotToMission: tool({
        description: 'Assign a pilot to a mission. Automatically checks for conflicts (double-booking, skill/cert mismatch, location). Updates both pilot status and mission record.',
        parameters: z.object({
          pilot_id: z.string().describe('The pilot ID (e.g., P001)'),
          project_id: z.string().describe('The project/mission ID (e.g., PRJ001)'),
          force: z.boolean().describe('Force assignment even with warnings (not errors). Pass false normally.'),
        }),
        execute: async (params) => {
          // Validate first
          const validation = await validatePilotAssignment(params.pilot_id, params.project_id);

          if (!validation.valid && !params.force) {
            return {
              success: false,
              message: 'Assignment blocked due to conflicts',
              conflicts: validation.conflicts,
            };
          }

          // Perform the assignment
          const pilotResult = await updatePilotStatus(params.pilot_id, {
            status: 'Assigned',
            current_assignment: params.project_id,
          });

          const missionResult = await updateMissionStatus(params.project_id, {
            assigned_pilot: params.pilot_id,
            mission_status: 'Active',
          });

          return {
            success: true,
            pilot_updated: pilotResult.success,
            mission_updated: missionResult.success,
            synced_to_sheets: pilotResult.synced_to_sheets || false,
            warnings: validation.conflicts.filter((c) => c.severity === 'warning'),
          };
        },
      }),

      assignDroneToMission: tool({
        description: 'Assign a drone to a mission. Automatically checks for conflicts (double-booking, maintenance, location). Updates both drone status and mission record.',
        parameters: z.object({
          drone_id: z.string().describe('The drone ID (e.g., D001)'),
          project_id: z.string().describe('The project/mission ID (e.g., PRJ001)'),
          force: z.boolean().describe('Force assignment even with warnings (not errors). Pass false normally.'),
        }),
        execute: async (params) => {
          const validation = await validateDroneAssignment(params.drone_id, params.project_id);

          if (!validation.valid && !params.force) {
            return {
              success: false,
              message: 'Assignment blocked due to conflicts',
              conflicts: validation.conflicts,
            };
          }

          const droneResult = await updateDroneStatus(params.drone_id, {
            status: 'Deployed',
            current_assignment: params.project_id,
          });

          const missionResult = await updateMissionStatus(params.project_id, {
            assigned_drone: params.drone_id,
          });

          return {
            success: true,
            drone_updated: droneResult.success,
            mission_updated: missionResult.success,
            synced_to_sheets: droneResult.synced_to_sheets || false,
            warnings: validation.conflicts.filter((c) => c.severity === 'warning'),
          };
        },
      }),

      unassignFromMission: tool({
        description: 'Remove a pilot or drone assignment from a mission. Frees up the resource.',
        parameters: z.object({
          project_id: z.string().describe('The project/mission ID'),
          unassign_pilot: z.boolean().describe('Whether to unassign the pilot. Pass true to unassign, false to keep.'),
          unassign_drone: z.boolean().describe('Whether to unassign the drone. Pass true to unassign, false to keep.'),
        }),
        execute: async (params) => {
          const mission = await getMissionById(params.project_id);
          if (!mission) return { success: false, error: 'Mission not found' };

          const results: Record<string, unknown> = {};

          if (params.unassign_pilot && mission.assigned_pilot) {
            await updatePilotStatus(mission.assigned_pilot, {
              status: 'Available',
              current_assignment: '',
            });
            results.pilot_freed = mission.assigned_pilot;
          }

          if (params.unassign_drone && mission.assigned_drone) {
            await updateDroneStatus(mission.assigned_drone, {
              status: 'Available',
              current_assignment: '',
            });
            results.drone_freed = mission.assigned_drone;
          }

          await updateMissionStatus(params.project_id, {
            assigned_pilot: params.unassign_pilot ? '' : undefined,
            assigned_drone: params.unassign_drone ? '' : undefined,
          });

          return { success: true, ...results };
        },
      }),

      // ---- CONFLICT DETECTION ----
      detectConflicts: tool({
        description: 'Run a comprehensive conflict detection scan across all active assignments. Checks for double-bookings, skill/cert mismatches, location issues, and maintenance problems.',
        parameters: z.object({}),
        execute: async () => {
          const conflicts = await detectAllConflicts();
          const errors = conflicts.filter((c) => c.severity === 'error');
          const warnings = conflicts.filter((c) => c.severity === 'warning');
          return {
            total_conflicts: conflicts.length,
            errors: errors.length,
            warnings: warnings.length,
            conflict_details: conflicts.map((c) => ({
              type: c.type,
              severity: c.severity,
              message: c.message,
              affected: c.entities.join(', '),
            })),
          };
        },
      }),

      // ---- MATCHING TOOLS ----
      findBestMatch: tool({
        description: 'Find the best-matching pilot and/or drone for a specific mission. Returns ranked suggestions with compatibility scores.',
        parameters: z.object({
          project_id: z.string().describe('The project/mission ID to find matches for'),
          match_type: z.enum(['pilot', 'drone', 'both']).describe('What to match: pilot, drone, or both'),
        }),
        execute: async (params) => {
          const results: Record<string, unknown> = {};

          if (params.match_type === 'pilot' || params.match_type === 'both') {
            const pilotMatches = await findBestPilotForMission(params.project_id);
            results.pilot_matches = pilotMatches.matches.slice(0, 5).map((m) => ({
              id: m.pilot.pilot_id,
              name: m.pilot.name,
              score: m.score,
              skills: m.pilot.skills.join(', '),
              certifications: m.pilot.certifications.join(', '),
              location: m.pilot.location,
              status: m.pilot.status,
              issues: m.issues.length > 0 ? m.issues.join('; ') : 'None',
            }));
          }

          if (params.match_type === 'drone' || params.match_type === 'both') {
            const droneMatches = await findBestDroneForMission(params.project_id);
            results.drone_matches = droneMatches.matches.slice(0, 5).map((m) => ({
              id: m.drone.drone_id,
              model: m.drone.model,
              score: m.score,
              capabilities: m.drone.capabilities.join(', '),
              location: m.drone.location,
              status: m.drone.status,
              issues: m.issues.length > 0 ? m.issues.join('; ') : 'None',
            }));
          }

          return results;
        },
      }),

      // ---- URGENT REASSIGNMENT ----
      handleUrgentReassignment: tool({
        description: 'Handle an urgent reassignment when a pilot or drone becomes suddenly unavailable. Finds all affected missions and proposes replacement options.',
        parameters: z.object({
          pilot_id: z.string().nullable().describe('The pilot ID that became unavailable. Pass null if not applicable.'),
          drone_id: z.string().nullable().describe('The drone ID that became unavailable. Pass null if not applicable.'),
          reason: z.string().describe('Reason for unavailability (e.g., "sick leave", "drone malfunction")'),
          auto_mark_unavailable: z.boolean().describe('Whether to automatically mark the resource as unavailable. Pass true to auto-mark.'),
        }),
        execute: async (params) => {
          const allMissions = await getMissions();
          const affectedMissions: Array<Record<string, unknown>> = [];
          const reassignmentOptions: Array<Record<string, unknown>> = [];

          // Mark as unavailable if requested
          if (params.auto_mark_unavailable) {
            if (params.pilot_id) {
              await updatePilotStatus(params.pilot_id, {
                status: 'Unavailable',
                current_assignment: '',
              });
            }
            if (params.drone_id) {
              await updateDroneStatus(params.drone_id, {
                status: 'Maintenance',
                current_assignment: '',
              });
            }
          }

          // Find affected missions
          if (params.pilot_id) {
            const affected = allMissions.filter(
              (m) =>
                m.assigned_pilot === params.pilot_id &&
                (m.mission_status === 'Active' || m.mission_status === 'Planned')
            );

            // Sort by priority: Urgent > High > Standard
            const priorityOrder = { Urgent: 0, High: 1, Standard: 2 };
            affected.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

            for (const mission of affected) {
              affectedMissions.push({
                project_id: mission.project_id,
                client: mission.client,
                priority: mission.priority,
                dates: `${mission.start_date} to ${mission.end_date}`,
                location: mission.location,
              });

              // Find replacement pilots
              const matches = await findBestPilotForMission(mission.project_id);
              const viable = matches.matches.filter(
                (m) => m.score > 0 && m.pilot.pilot_id !== params.pilot_id
              );

              reassignmentOptions.push({
                mission: mission.project_id,
                priority: mission.priority,
                replacements: viable.slice(0, 3).map((m) => ({
                  id: m.pilot.pilot_id,
                  name: m.pilot.name,
                  score: m.score,
                  issues: m.issues,
                })),
                no_replacement: viable.length === 0,
              });
            }
          }

          if (params.drone_id) {
            const affected = allMissions.filter(
              (m) =>
                m.assigned_drone === params.drone_id &&
                (m.mission_status === 'Active' || m.mission_status === 'Planned')
            );

            const priorityOrder = { Urgent: 0, High: 1, Standard: 2 };
            affected.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

            for (const mission of affected) {
              if (!affectedMissions.some((am) => am.project_id === mission.project_id)) {
                affectedMissions.push({
                  project_id: mission.project_id,
                  client: mission.client,
                  priority: mission.priority,
                  dates: `${mission.start_date} to ${mission.end_date}`,
                  location: mission.location,
                });
              }

              const matches = await findBestDroneForMission(mission.project_id);
              const viable = matches.matches.filter(
                (m) => m.score > 0 && m.drone.drone_id !== params.drone_id
              );

              reassignmentOptions.push({
                mission: mission.project_id,
                priority: mission.priority,
                drone_replacements: viable.slice(0, 3).map((m) => ({
                  id: m.drone.drone_id,
                  model: m.drone.model,
                  score: m.score,
                  issues: m.issues,
                })),
                no_replacement: viable.length === 0,
              });
            }
          }

          return {
            reason: params.reason,
            unavailable_pilot: params.pilot_id || null,
            unavailable_drone: params.drone_id || null,
            marked_unavailable: params.auto_mark_unavailable || false,
            affected_missions_count: affectedMissions.length,
            affected_missions: affectedMissions,
            reassignment_options: reassignmentOptions,
            action_required: affectedMissions.length > 0
              ? 'Review the proposed replacements and confirm which ones to execute.'
              : 'No active missions affected.',
          };
        },
      }),

      // ---- DATA OVERVIEW ----
      getOverview: tool({
        description: 'Get a high-level overview/summary of the current operations data including counts of pilots, drones, missions, and sync status.',
        parameters: z.object({}),
        execute: async () => {
          const summary = await getDataSummary();
          const allMissions = await getMissions();
          const urgentMissions = allMissions.filter((m) => m.priority === 'Urgent' && m.mission_status !== 'Completed' && m.mission_status !== 'Cancelled');
          const unassignedMissions = allMissions.filter(
            (m) =>
              (!m.assigned_pilot || !m.assigned_drone) &&
              m.mission_status !== 'Completed' &&
              m.mission_status !== 'Cancelled'
          );

          return {
            ...summary,
            urgentMissions: urgentMissions.length,
            unassignedMissions: unassignedMissions.length,
            unassigned_details: unassignedMissions.map((m) => ({
              id: m.project_id,
              needs_pilot: !m.assigned_pilot,
              needs_drone: !m.assigned_drone,
              priority: m.priority,
            })),
          };
        },
      }),

      syncWithSheets: tool({
        description: 'Force a full resync with Google Sheets. Reads the latest data from Sheets.',
        parameters: z.object({}),
        execute: async () => {
          const result = await forceSync();
          return result;
        },
      }),
    },
    maxSteps: 10,
    onError: (error) => {
      console.error('[SkyOps] AI SDK stream error:', error);
    },
  });

  return result.toDataStreamResponse();
  } catch (error) {
    console.error('[SkyOps] Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Chat API failed', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
