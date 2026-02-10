// ============================================
// In-Memory Data Store with Google Sheets Sync
// ============================================

import type { Pilot, Drone, Mission, PilotStatus, DroneStatus, MissionStatus } from './types';
import {
  isGoogleSheetsConfigured,
  readPilotsFromSheet,
  readDronesFromSheet,
  readMissionsFromSheet,
  updatePilotRow,
  updateDroneRow,
  updateMissionRow,
  syncPilotsToSheet,
  syncDronesToSheet,
  syncMissionsToSheet,
} from './googleSheets';

// ---- SEED DATA (fallback when Google Sheets is not configured) ----

const SEED_PILOTS: Pilot[] = [
  {
    pilot_id: 'P001', name: 'Arjun', skills: ['Mapping', 'Survey'],
    certifications: ['DGCA', 'Night Ops'], location: 'Bangalore',
    status: 'Available', current_assignment: '', available_from: '2026-02-05',
  },
  {
    pilot_id: 'P002', name: 'Neha', skills: ['Inspection'],
    certifications: ['DGCA'], location: 'Mumbai',
    status: 'Assigned', current_assignment: 'PRJ002', available_from: '2026-02-12',
  },
  {
    pilot_id: 'P003', name: 'Rohit', skills: ['Inspection', 'Mapping'],
    certifications: ['DGCA'], location: 'Mumbai',
    status: 'Available', current_assignment: '', available_from: '2026-02-05',
  },
  {
    pilot_id: 'P004', name: 'Sneha', skills: ['Survey', 'Thermal'],
    certifications: ['DGCA', 'Night Ops'], location: 'Bangalore',
    status: 'On Leave', current_assignment: '', available_from: '2026-02-15',
  },
  {
    pilot_id: 'P005', name: 'Vikram', skills: ['Survey', 'Mapping'],
    certifications: ['DGCA'], location: 'Delhi',
    status: 'Available', current_assignment: '', available_from: '2026-02-05',
  },
  {
    pilot_id: 'P006', name: 'Priya', skills: ['Thermal', 'Inspection'],
    certifications: ['DGCA', 'Night Ops'], location: 'Bangalore',
    status: 'Available', current_assignment: '', available_from: '2026-02-05',
  },
];

const SEED_DRONES: Drone[] = [
  {
    drone_id: 'D001', model: 'DJI M300', capabilities: ['LiDAR', 'RGB'],
    status: 'Available', location: 'Bangalore', current_assignment: '', maintenance_due: '2026-03-01',
  },
  {
    drone_id: 'D002', model: 'DJI Mavic 3', capabilities: ['RGB'],
    status: 'Maintenance', location: 'Mumbai', current_assignment: '', maintenance_due: '2026-02-01',
  },
  {
    drone_id: 'D003', model: 'DJI Mavic 3T', capabilities: ['Thermal'],
    status: 'Available', location: 'Mumbai', current_assignment: '', maintenance_due: '2026-04-01',
  },
  {
    drone_id: 'D004', model: 'Autel Evo II', capabilities: ['Thermal', 'RGB'],
    status: 'Available', location: 'Bangalore', current_assignment: '', maintenance_due: '2026-03-15',
  },
  {
    drone_id: 'D005', model: 'DJI Phantom 4', capabilities: ['RGB'],
    status: 'Available', location: 'Delhi', current_assignment: '', maintenance_due: '2026-03-20',
  },
  {
    drone_id: 'D006', model: 'DJI M30T', capabilities: ['Thermal', 'LiDAR'],
    status: 'Available', location: 'Bangalore', current_assignment: '', maintenance_due: '2026-04-15',
  },
];

const SEED_MISSIONS: Mission[] = [
  {
    project_id: 'PRJ001', client: 'Client A', location: 'Bangalore',
    required_skills: ['Mapping'], required_certs: ['DGCA'],
    start_date: '2026-02-06', end_date: '2026-02-08', priority: 'High',
    assigned_pilot: '', assigned_drone: '', mission_status: 'Planned',
  },
  {
    project_id: 'PRJ002', client: 'Client B', location: 'Mumbai',
    required_skills: ['Inspection'], required_certs: ['DGCA', 'Night Ops'],
    start_date: '2026-02-07', end_date: '2026-02-09', priority: 'Urgent',
    assigned_pilot: 'P002', assigned_drone: '', mission_status: 'Active',
  },
  {
    project_id: 'PRJ003', client: 'Client C', location: 'Bangalore',
    required_skills: ['Thermal'], required_certs: ['DGCA'],
    start_date: '2026-02-10', end_date: '2026-02-12', priority: 'Standard',
    assigned_pilot: '', assigned_drone: '', mission_status: 'Planned',
  },
  {
    project_id: 'PRJ004', client: 'Client D', location: 'Delhi',
    required_skills: ['Survey'], required_certs: ['DGCA'],
    start_date: '2026-02-11', end_date: '2026-02-14', priority: 'Standard',
    assigned_pilot: '', assigned_drone: '', mission_status: 'Planned',
  },
  {
    project_id: 'PRJ005', client: 'Client E', location: 'Mumbai',
    required_skills: ['Inspection', 'Thermal'], required_certs: ['DGCA', 'Night Ops'],
    start_date: '2026-02-08', end_date: '2026-02-10', priority: 'High',
    assigned_pilot: '', assigned_drone: '', mission_status: 'Planned',
  },
];

// ---- DATA STORE ----

let pilots: Pilot[] = [];
let drones: Drone[] = [];
let missions: Mission[] = [];
let initialized = false;
let lastSyncTime: Date | null = null;

export async function initializeData(): Promise<{ source: string }> {
  if (initialized && lastSyncTime) {
    const elapsed = Date.now() - lastSyncTime.getTime();
    // Re-sync from Sheets every 5 minutes
    if (elapsed < 5 * 60 * 1000) {
      return { source: isGoogleSheetsConfigured() ? 'google_sheets_cached' : 'local_cached' };
    }
  }

  if (isGoogleSheetsConfigured()) {
    try {
      pilots = await readPilotsFromSheet();
      drones = await readDronesFromSheet();
      missions = await readMissionsFromSheet();
      initialized = true;
      lastSyncTime = new Date();
      return { source: 'google_sheets' };
    } catch (error) {
      console.error('Failed to read from Google Sheets, falling back to seed data:', error);
      pilots = JSON.parse(JSON.stringify(SEED_PILOTS));
      drones = JSON.parse(JSON.stringify(SEED_DRONES));
      missions = JSON.parse(JSON.stringify(SEED_MISSIONS));
      initialized = true;
      lastSyncTime = new Date();
      return { source: 'seed_data_fallback' };
    }
  }

  pilots = JSON.parse(JSON.stringify(SEED_PILOTS));
  drones = JSON.parse(JSON.stringify(SEED_DRONES));
  missions = JSON.parse(JSON.stringify(SEED_MISSIONS));
  initialized = true;
  lastSyncTime = new Date();
  return { source: 'seed_data' };
}

export async function forceSync(): Promise<{ source: string; timestamp: string }> {
  initialized = false;
  lastSyncTime = null;
  const result = await initializeData();
  return { ...result, timestamp: new Date().toISOString() };
}

// ---- QUERIES ----

export async function getPilots(filters?: {
  skill?: string;
  certification?: string;
  location?: string;
  status?: string;
}): Promise<Pilot[]> {
  await initializeData();
  let result = [...pilots];

  if (filters?.skill) {
    const skill = filters.skill.toLowerCase();
    result = result.filter((p) =>
      p.skills.some((s) => s.toLowerCase().includes(skill))
    );
  }
  if (filters?.certification) {
    const cert = filters.certification.toLowerCase();
    result = result.filter((p) =>
      p.certifications.some((c) => c.toLowerCase().includes(cert))
    );
  }
  if (filters?.location) {
    const loc = filters.location.toLowerCase();
    result = result.filter((p) => p.location.toLowerCase().includes(loc));
  }
  if (filters?.status) {
    const status = filters.status.toLowerCase();
    result = result.filter((p) => p.status.toLowerCase() === status);
  }

  return result;
}

export async function getDrones(filters?: {
  capability?: string;
  status?: string;
  location?: string;
}): Promise<Drone[]> {
  await initializeData();
  let result = [...drones];

  if (filters?.capability) {
    const cap = filters.capability.toLowerCase();
    result = result.filter((d) =>
      d.capabilities.some((c) => c.toLowerCase().includes(cap))
    );
  }
  if (filters?.status) {
    const status = filters.status.toLowerCase();
    result = result.filter((d) => d.status.toLowerCase() === status);
  }
  if (filters?.location) {
    const loc = filters.location.toLowerCase();
    result = result.filter((d) => d.location.toLowerCase().includes(loc));
  }

  return result;
}

export async function getMissions(filters?: {
  priority?: string;
  location?: string;
  status?: string;
  skill?: string;
}): Promise<Mission[]> {
  await initializeData();
  let result = [...missions];

  if (filters?.priority) {
    const priority = filters.priority.toLowerCase();
    result = result.filter((m) => m.priority.toLowerCase() === priority);
  }
  if (filters?.location) {
    const loc = filters.location.toLowerCase();
    result = result.filter((m) => m.location.toLowerCase().includes(loc));
  }
  if (filters?.status) {
    const status = filters.status.toLowerCase();
    result = result.filter((m) => m.mission_status.toLowerCase() === status);
  }
  if (filters?.skill) {
    const skill = filters.skill.toLowerCase();
    result = result.filter((m) =>
      m.required_skills.some((s) => s.toLowerCase().includes(skill))
    );
  }

  return result;
}

export async function getPilotById(pilotId: string): Promise<Pilot | null> {
  await initializeData();
  return pilots.find((p) => p.pilot_id === pilotId) || null;
}

export async function getDroneById(droneId: string): Promise<Drone | null> {
  await initializeData();
  return drones.find((d) => d.drone_id === droneId) || null;
}

export async function getMissionById(projectId: string): Promise<Mission | null> {
  await initializeData();
  return missions.find((m) => m.project_id === projectId) || null;
}

// ---- UPDATE OPERATIONS ----

export async function updatePilotStatus(
  pilotId: string,
  updates: {
    status?: PilotStatus;
    current_assignment?: string;
    available_from?: string;
    location?: string;
  }
): Promise<{ success: boolean; pilot?: Pilot; error?: string; synced_to_sheets?: boolean }> {
  await initializeData();

  const index = pilots.findIndex((p) => p.pilot_id === pilotId);
  if (index === -1) {
    return { success: false, error: `Pilot ${pilotId} not found` };
  }

  const pilot = pilots[index];
  if (updates.status) pilot.status = updates.status;
  if (updates.current_assignment !== undefined) pilot.current_assignment = updates.current_assignment;
  if (updates.available_from) pilot.available_from = updates.available_from;
  if (updates.location) pilot.location = updates.location;

  let synced = false;
  if (isGoogleSheetsConfigured()) {
    try {
      await updatePilotRow(pilot, index);
      synced = true;
    } catch (error) {
      console.error('Failed to sync pilot update to Sheets:', error);
    }
  }

  return { success: true, pilot, synced_to_sheets: synced };
}

export async function updateDroneStatus(
  droneId: string,
  updates: {
    status?: DroneStatus;
    current_assignment?: string;
    location?: string;
    maintenance_due?: string;
  }
): Promise<{ success: boolean; drone?: Drone; error?: string; synced_to_sheets?: boolean }> {
  await initializeData();

  const index = drones.findIndex((d) => d.drone_id === droneId);
  if (index === -1) {
    return { success: false, error: `Drone ${droneId} not found` };
  }

  const drone = drones[index];
  if (updates.status) drone.status = updates.status;
  if (updates.current_assignment !== undefined) drone.current_assignment = updates.current_assignment;
  if (updates.location) drone.location = updates.location;
  if (updates.maintenance_due) drone.maintenance_due = updates.maintenance_due;

  let synced = false;
  if (isGoogleSheetsConfigured()) {
    try {
      await updateDroneRow(drone, index);
      synced = true;
    } catch (error) {
      console.error('Failed to sync drone update to Sheets:', error);
    }
  }

  return { success: true, drone, synced_to_sheets: synced };
}

export async function updateMissionStatus(
  projectId: string,
  updates: {
    assigned_pilot?: string;
    assigned_drone?: string;
    mission_status?: MissionStatus;
  }
): Promise<{ success: boolean; mission?: Mission; error?: string; synced_to_sheets?: boolean }> {
  await initializeData();

  const index = missions.findIndex((m) => m.project_id === projectId);
  if (index === -1) {
    return { success: false, error: `Mission ${projectId} not found` };
  }

  const mission = missions[index];
  if (updates.assigned_pilot !== undefined) mission.assigned_pilot = updates.assigned_pilot;
  if (updates.assigned_drone !== undefined) mission.assigned_drone = updates.assigned_drone;
  if (updates.mission_status) mission.mission_status = updates.mission_status;

  let synced = false;
  if (isGoogleSheetsConfigured()) {
    try {
      await updateMissionRow(mission, index);
      synced = true;
    } catch (error) {
      console.error('Failed to sync mission update to Sheets:', error);
    }
  }

  return { success: true, mission, synced_to_sheets: synced };
}

// ---- FULL SYNC ----

export async function syncAllToSheets(): Promise<{ success: boolean; error?: string }> {
  if (!isGoogleSheetsConfigured()) {
    return { success: false, error: 'Google Sheets not configured' };
  }

  try {
    await syncPilotsToSheet(pilots);
    await syncDronesToSheet(drones);
    await syncMissionsToSheet(missions);
    return { success: true };
  } catch (error) {
    console.error('Failed to sync all data to Sheets:', error);
    return { success: false, error: String(error) };
  }
}

// ---- UTILITY ----

export async function getDataSummary(): Promise<{
  totalPilots: number;
  availablePilots: number;
  totalDrones: number;
  availableDrones: number;
  totalMissions: number;
  activeMissions: number;
  sheetsConfigured: boolean;
  lastSync: string | null;
}> {
  await initializeData();
  return {
    totalPilots: pilots.length,
    availablePilots: pilots.filter((p) => p.status === 'Available').length,
    totalDrones: drones.length,
    availableDrones: drones.filter((d) => d.status === 'Available').length,
    totalMissions: missions.length,
    activeMissions: missions.filter((m) => m.mission_status === 'Active' || m.mission_status === 'Planned').length,
    sheetsConfigured: isGoogleSheetsConfigured(),
    lastSync: lastSyncTime?.toISOString() || null,
  };
}
