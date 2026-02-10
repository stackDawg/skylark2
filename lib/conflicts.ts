// ============================================
// Conflict Detection Engine
// ============================================

import type { Pilot, Drone, Mission, Conflict } from './types';
import { getPilots, getDrones, getMissions, getPilotById, getDroneById } from './dataStore';

// Check if two date ranges overlap
function datesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = new Date(start1);
  const e1 = new Date(end1);
  const s2 = new Date(start2);
  const e2 = new Date(end2);
  return s1 <= e2 && s2 <= e1;
}

// Check if a pilot has all required certifications
function hasCertifications(pilot: Pilot, requiredCerts: string[]): boolean {
  return requiredCerts.every((cert) =>
    pilot.certifications.some((pc) => pc.toLowerCase() === cert.toLowerCase())
  );
}

// Check if a pilot has at least one required skill
function hasSkills(pilot: Pilot, requiredSkills: string[]): boolean {
  return requiredSkills.every((skill) =>
    pilot.skills.some((ps) => ps.toLowerCase() === skill.toLowerCase())
  );
}

// ---- CONFLICT DETECTION ----

export async function detectAllConflicts(): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];
  const allPilots = await getPilots();
  const allDrones = await getDrones();
  const allMissions = await getMissions();

  const activeMissions = allMissions.filter(
    (m) => m.mission_status === 'Active' || m.mission_status === 'Planned'
  );

  // 1. Double-booking detection for pilots
  for (let i = 0; i < activeMissions.length; i++) {
    for (let j = i + 1; j < activeMissions.length; j++) {
      const m1 = activeMissions[i];
      const m2 = activeMissions[j];

      if (
        m1.assigned_pilot &&
        m1.assigned_pilot === m2.assigned_pilot &&
        datesOverlap(m1.start_date, m1.end_date, m2.start_date, m2.end_date)
      ) {
        const pilot = allPilots.find((p) => p.pilot_id === m1.assigned_pilot);
        conflicts.push({
          type: 'double_booking_pilot',
          severity: 'error',
          message: `Pilot ${pilot?.name || m1.assigned_pilot} (${m1.assigned_pilot}) is double-booked: ${m1.project_id} (${m1.start_date} to ${m1.end_date}) overlaps with ${m2.project_id} (${m2.start_date} to ${m2.end_date})`,
          entities: [m1.assigned_pilot, m1.project_id, m2.project_id],
          mission_id: m1.project_id,
        });
      }
    }
  }

  // 2. Double-booking detection for drones
  for (let i = 0; i < activeMissions.length; i++) {
    for (let j = i + 1; j < activeMissions.length; j++) {
      const m1 = activeMissions[i];
      const m2 = activeMissions[j];

      if (
        m1.assigned_drone &&
        m1.assigned_drone === m2.assigned_drone &&
        datesOverlap(m1.start_date, m1.end_date, m2.start_date, m2.end_date)
      ) {
        const drone = allDrones.find((d) => d.drone_id === m1.assigned_drone);
        conflicts.push({
          type: 'double_booking_drone',
          severity: 'error',
          message: `Drone ${drone?.model || m1.assigned_drone} (${m1.assigned_drone}) is double-booked: ${m1.project_id} overlaps with ${m2.project_id}`,
          entities: [m1.assigned_drone, m1.project_id, m2.project_id],
          mission_id: m1.project_id,
        });
      }
    }
  }

  // 3. Certification mismatch
  for (const mission of activeMissions) {
    if (mission.assigned_pilot) {
      const pilot = allPilots.find((p) => p.pilot_id === mission.assigned_pilot);
      if (pilot && !hasCertifications(pilot, mission.required_certs)) {
        const missing = mission.required_certs.filter(
          (cert) => !pilot.certifications.some((pc) => pc.toLowerCase() === cert.toLowerCase())
        );
        conflicts.push({
          type: 'certification_mismatch',
          severity: 'error',
          message: `Pilot ${pilot.name} (${pilot.pilot_id}) assigned to ${mission.project_id} lacks required certifications: ${missing.join(', ')}`,
          entities: [pilot.pilot_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }
  }

  // 4. Skill mismatch
  for (const mission of activeMissions) {
    if (mission.assigned_pilot) {
      const pilot = allPilots.find((p) => p.pilot_id === mission.assigned_pilot);
      if (pilot && !hasSkills(pilot, mission.required_skills)) {
        const missing = mission.required_skills.filter(
          (skill) => !pilot.skills.some((ps) => ps.toLowerCase() === skill.toLowerCase())
        );
        conflicts.push({
          type: 'skill_mismatch',
          severity: 'warning',
          message: `Pilot ${pilot.name} (${pilot.pilot_id}) assigned to ${mission.project_id} lacks required skills: ${missing.join(', ')}`,
          entities: [pilot.pilot_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }
  }

  // 5. Maintenance issues - Drone assigned but in maintenance
  for (const mission of activeMissions) {
    if (mission.assigned_drone) {
      const drone = allDrones.find((d) => d.drone_id === mission.assigned_drone);
      if (drone && drone.status === 'Maintenance') {
        conflicts.push({
          type: 'maintenance_issue',
          severity: 'error',
          message: `Drone ${drone.model} (${drone.drone_id}) assigned to ${mission.project_id} is currently in Maintenance (due: ${drone.maintenance_due})`,
          entities: [drone.drone_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }
  }

  // 6. Location mismatch - Pilot location vs mission location
  for (const mission of activeMissions) {
    if (mission.assigned_pilot) {
      const pilot = allPilots.find((p) => p.pilot_id === mission.assigned_pilot);
      if (pilot && pilot.location.toLowerCase() !== mission.location.toLowerCase()) {
        conflicts.push({
          type: 'location_mismatch',
          severity: 'warning',
          message: `Pilot ${pilot.name} (${pilot.pilot_id}) is in ${pilot.location} but ${mission.project_id} is in ${mission.location}`,
          entities: [pilot.pilot_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }

    // Drone location vs mission location
    if (mission.assigned_drone) {
      const drone = allDrones.find((d) => d.drone_id === mission.assigned_drone);
      if (drone && drone.location.toLowerCase() !== mission.location.toLowerCase()) {
        conflicts.push({
          type: 'location_mismatch',
          severity: 'warning',
          message: `Drone ${drone.model} (${drone.drone_id}) is in ${drone.location} but ${mission.project_id} is in ${mission.location}`,
          entities: [drone.drone_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }
  }

  // 7. Unavailable pilot assigned to mission
  for (const mission of activeMissions) {
    if (mission.assigned_pilot) {
      const pilot = allPilots.find((p) => p.pilot_id === mission.assigned_pilot);
      if (pilot && (pilot.status === 'On Leave' || pilot.status === 'Unavailable')) {
        conflicts.push({
          type: 'unavailable_pilot',
          severity: 'error',
          message: `Pilot ${pilot.name} (${pilot.pilot_id}) is ${pilot.status} but assigned to ${mission.project_id}`,
          entities: [pilot.pilot_id, mission.project_id],
          mission_id: mission.project_id,
        });
      }
    }
  }

  return conflicts;
}

// ---- ASSIGNMENT VALIDATION ----

export async function validatePilotAssignment(
  pilotId: string,
  projectId: string
): Promise<{ valid: boolean; conflicts: Conflict[] }> {
  const conflicts: Conflict[] = [];
  const pilot = await getPilotById(pilotId);
  const mission = (await getMissions()).find((m) => m.project_id === projectId);

  if (!pilot) {
    conflicts.push({
      type: 'skill_mismatch',
      severity: 'error',
      message: `Pilot ${pilotId} not found`,
      entities: [pilotId],
    });
    return { valid: false, conflicts };
  }

  if (!mission) {
    conflicts.push({
      type: 'skill_mismatch',
      severity: 'error',
      message: `Mission ${projectId} not found`,
      entities: [projectId],
    });
    return { valid: false, conflicts };
  }

  // Check pilot status
  if (pilot.status === 'On Leave' || pilot.status === 'Unavailable') {
    conflicts.push({
      type: 'unavailable_pilot',
      severity: 'error',
      message: `Pilot ${pilot.name} is currently ${pilot.status}`,
      entities: [pilotId, projectId],
      mission_id: projectId,
    });
  }

  // Check skills
  if (!hasSkills(pilot, mission.required_skills)) {
    const missing = mission.required_skills.filter(
      (s) => !pilot.skills.some((ps) => ps.toLowerCase() === s.toLowerCase())
    );
    conflicts.push({
      type: 'skill_mismatch',
      severity: 'warning',
      message: `Pilot ${pilot.name} lacks required skills: ${missing.join(', ')}`,
      entities: [pilotId, projectId],
      mission_id: projectId,
    });
  }

  // Check certifications
  if (!hasCertifications(pilot, mission.required_certs)) {
    const missing = mission.required_certs.filter(
      (c) => !pilot.certifications.some((pc) => pc.toLowerCase() === c.toLowerCase())
    );
    conflicts.push({
      type: 'certification_mismatch',
      severity: 'error',
      message: `Pilot ${pilot.name} lacks required certifications: ${missing.join(', ')}`,
      entities: [pilotId, projectId],
      mission_id: projectId,
    });
  }

  // Check location
  if (pilot.location.toLowerCase() !== mission.location.toLowerCase()) {
    conflicts.push({
      type: 'location_mismatch',
      severity: 'warning',
      message: `Pilot ${pilot.name} is in ${pilot.location} but mission is in ${mission.location}`,
      entities: [pilotId, projectId],
      mission_id: projectId,
    });
  }

  // Check for overlapping assignments
  const allMissions = await getMissions();
  const pilotMissions = allMissions.filter(
    (m) =>
      m.assigned_pilot === pilotId &&
      m.project_id !== projectId &&
      (m.mission_status === 'Active' || m.mission_status === 'Planned')
  );

  for (const existing of pilotMissions) {
    if (datesOverlap(mission.start_date, mission.end_date, existing.start_date, existing.end_date)) {
      conflicts.push({
        type: 'double_booking_pilot',
        severity: 'error',
        message: `Pilot ${pilot.name} is already assigned to ${existing.project_id} (${existing.start_date} to ${existing.end_date}) which overlaps with ${projectId}`,
        entities: [pilotId, projectId, existing.project_id],
        mission_id: projectId,
      });
    }
  }

  const hasErrors = conflicts.some((c) => c.severity === 'error');
  return { valid: !hasErrors, conflicts };
}

export async function validateDroneAssignment(
  droneId: string,
  projectId: string
): Promise<{ valid: boolean; conflicts: Conflict[] }> {
  const conflicts: Conflict[] = [];
  const drone = await getDroneById(droneId);
  const mission = (await getMissions()).find((m) => m.project_id === projectId);

  if (!drone) {
    conflicts.push({
      type: 'maintenance_issue',
      severity: 'error',
      message: `Drone ${droneId} not found`,
      entities: [droneId],
    });
    return { valid: false, conflicts };
  }

  if (!mission) {
    conflicts.push({
      type: 'maintenance_issue',
      severity: 'error',
      message: `Mission ${projectId} not found`,
      entities: [projectId],
    });
    return { valid: false, conflicts };
  }

  // Check drone status
  if (drone.status === 'Maintenance') {
    conflicts.push({
      type: 'maintenance_issue',
      severity: 'error',
      message: `Drone ${drone.model} (${drone.drone_id}) is currently in Maintenance`,
      entities: [droneId, projectId],
      mission_id: projectId,
    });
  }

  // Check location
  if (drone.location.toLowerCase() !== mission.location.toLowerCase()) {
    conflicts.push({
      type: 'location_mismatch',
      severity: 'warning',
      message: `Drone ${drone.model} is in ${drone.location} but mission is in ${mission.location}`,
      entities: [droneId, projectId],
      mission_id: projectId,
    });
  }

  // Check for overlapping assignments
  const allMissions = await getMissions();
  const droneMissions = allMissions.filter(
    (m) =>
      m.assigned_drone === droneId &&
      m.project_id !== projectId &&
      (m.mission_status === 'Active' || m.mission_status === 'Planned')
  );

  for (const existing of droneMissions) {
    if (datesOverlap(mission.start_date, mission.end_date, existing.start_date, existing.end_date)) {
      conflicts.push({
        type: 'double_booking_drone',
        severity: 'error',
        message: `Drone ${drone.model} is already assigned to ${existing.project_id} (${existing.start_date} to ${existing.end_date}) which overlaps`,
        entities: [droneId, projectId, existing.project_id],
        mission_id: projectId,
      });
    }
  }

  const hasErrors = conflicts.some((c) => c.severity === 'error');
  return { valid: !hasErrors, conflicts };
}

// ---- BEST MATCH FINDING ----

export async function findBestPilotForMission(
  projectId: string
): Promise<{ matches: Array<{ pilot: Pilot; score: number; issues: string[] }> }> {
  const mission = (await getMissions()).find((m) => m.project_id === projectId);
  if (!mission) return { matches: [] };

  const allPilots = await getPilots();
  const allMissions = await getMissions();
  const scored: Array<{ pilot: Pilot; score: number; issues: string[] }> = [];

  for (const pilot of allPilots) {
    let score = 0;
    const issues: string[] = [];

    // Status check (available is best)
    if (pilot.status === 'Available') {
      score += 30;
    } else if (pilot.status === 'Assigned') {
      // Check if their assignment overlaps
      const existing = allMissions.filter(
        (m) =>
          m.assigned_pilot === pilot.pilot_id &&
          (m.mission_status === 'Active' || m.mission_status === 'Planned')
      );
      const hasOverlap = existing.some((m) =>
        datesOverlap(mission.start_date, mission.end_date, m.start_date, m.end_date)
      );
      if (hasOverlap) {
        issues.push('Has overlapping assignment');
        score -= 50;
      } else {
        score += 20;
      }
    } else {
      issues.push(`Status: ${pilot.status}`);
      score -= 100;
    }

    // Skills match
    const skillMatch = mission.required_skills.every((s) =>
      pilot.skills.some((ps) => ps.toLowerCase() === s.toLowerCase())
    );
    if (skillMatch) {
      score += 25;
    } else {
      const missing = mission.required_skills.filter(
        (s) => !pilot.skills.some((ps) => ps.toLowerCase() === s.toLowerCase())
      );
      issues.push(`Missing skills: ${missing.join(', ')}`);
      score -= 20;
    }

    // Certifications match
    const certMatch = mission.required_certs.every((c) =>
      pilot.certifications.some((pc) => pc.toLowerCase() === c.toLowerCase())
    );
    if (certMatch) {
      score += 25;
    } else {
      const missing = mission.required_certs.filter(
        (c) => !pilot.certifications.some((pc) => pc.toLowerCase() === c.toLowerCase())
      );
      issues.push(`Missing certs: ${missing.join(', ')}`);
      score -= 30;
    }

    // Location match
    if (pilot.location.toLowerCase() === mission.location.toLowerCase()) {
      score += 20;
    } else {
      issues.push(`Location: ${pilot.location} (mission in ${mission.location})`);
      score -= 10;
    }

    scored.push({ pilot, score, issues });
  }

  scored.sort((a, b) => b.score - a.score);
  return { matches: scored };
}

export async function findBestDroneForMission(
  projectId: string
): Promise<{ matches: Array<{ drone: Drone; score: number; issues: string[] }> }> {
  const mission = (await getMissions()).find((m) => m.project_id === projectId);
  if (!mission) return { matches: [] };

  const allDrones = await getDrones();
  const allMissions = await getMissions();
  const scored: Array<{ drone: Drone; score: number; issues: string[] }> = [];

  for (const drone of allDrones) {
    let score = 0;
    const issues: string[] = [];

    // Status check
    if (drone.status === 'Available') {
      score += 30;
    } else if (drone.status === 'Deployed') {
      const existing = allMissions.filter(
        (m) =>
          m.assigned_drone === drone.drone_id &&
          (m.mission_status === 'Active' || m.mission_status === 'Planned')
      );
      const hasOverlap = existing.some((m) =>
        datesOverlap(mission.start_date, mission.end_date, m.start_date, m.end_date)
      );
      if (hasOverlap) {
        issues.push('Has overlapping deployment');
        score -= 50;
      } else {
        score += 15;
      }
    } else {
      issues.push(`Status: ${drone.status}`);
      score -= 100;
    }

    // Location match
    if (drone.location.toLowerCase() === mission.location.toLowerCase()) {
      score += 30;
    } else {
      issues.push(`Location: ${drone.location} (mission in ${mission.location})`);
      score -= 15;
    }

    // Capability check (drones don't have "skills" per se, but missions may need specific capabilities)
    // We check if the drone has any capability that could be useful
    // This is a soft check - drones are more generic than pilot skills
    const missionNeedsThermal = mission.required_skills.some((s) => s.toLowerCase() === 'thermal');
    const missionNeedsMapping = mission.required_skills.some(
      (s) => s.toLowerCase() === 'mapping' || s.toLowerCase() === 'survey'
    );

    if (missionNeedsThermal && drone.capabilities.some((c) => c.toLowerCase() === 'thermal')) {
      score += 20;
    } else if (missionNeedsThermal) {
      issues.push('No thermal capability');
      score -= 15;
    }

    if (missionNeedsMapping && drone.capabilities.some((c) => c.toLowerCase() === 'lidar')) {
      score += 20;
    } else if (missionNeedsMapping && drone.capabilities.some((c) => c.toLowerCase() === 'rgb')) {
      score += 10;
    }

    // Maintenance due check
    const maintenanceDue = new Date(drone.maintenance_due);
    const missionEnd = new Date(mission.end_date);
    if (maintenanceDue <= missionEnd) {
      issues.push(`Maintenance due ${drone.maintenance_due} (before mission ends)`);
      score -= 10;
    }

    scored.push({ drone, score, issues });
  }

  scored.sort((a, b) => b.score - a.score);
  return { matches: scored };
}
