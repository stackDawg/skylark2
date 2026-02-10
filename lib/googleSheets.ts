// ============================================
// Google Sheets 2-Way Sync Integration
// ============================================

import { google } from 'googleapis';
import type { Pilot, Drone, Mission } from './types';

const SHEET_NAMES = {
  pilots: 'Pilot Roster',
  drones: 'Drone Fleet',
  missions: 'Missions',
};

function getAuth() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return { auth, spreadsheetId };
}

function getSheetsClient() {
  const config = getAuth();
  if (!config) return null;
  return {
    sheets: google.sheets({ version: 'v4', auth: config.auth }),
    spreadsheetId: config.spreadsheetId,
  };
}

export function isGoogleSheetsConfigured(): boolean {
  return getAuth() !== null;
}

// ---- READ OPERATIONS ----

async function readSheet(sheetName: string): Promise<string[][]> {
  const client = getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');

  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });

  return response.data.values || [];
}

function parseCSVField(field: string): string[] {
  if (!field || field === '–' || field === '-' || field === '') return [];
  return field.split(',').map((s) => s.trim()).filter(Boolean);
}

function cleanField(field: string | undefined): string {
  if (!field || field === '–' || field === '-' || field === 'undefined') return '';
  return field.trim();
}

export async function readPilotsFromSheet(): Promise<Pilot[]> {
  const rows = await readSheet(SHEET_NAMES.pilots);
  if (rows.length < 2) return [];

  return rows.slice(1).map((row) => ({
    pilot_id: cleanField(row[0]) || '',
    name: cleanField(row[1]) || '',
    skills: parseCSVField(row[2] || ''),
    certifications: parseCSVField(row[3] || ''),
    location: cleanField(row[4]) || '',
    status: (cleanField(row[5]) || 'Available') as Pilot['status'],
    current_assignment: cleanField(row[6]),
    available_from: cleanField(row[7]) || '',
  }));
}

export async function readDronesFromSheet(): Promise<Drone[]> {
  const rows = await readSheet(SHEET_NAMES.drones);
  if (rows.length < 2) return [];

  return rows.slice(1).map((row) => ({
    drone_id: cleanField(row[0]) || '',
    model: cleanField(row[1]) || '',
    capabilities: parseCSVField(row[2] || ''),
    status: (cleanField(row[3]) || 'Available') as Drone['status'],
    location: cleanField(row[4]) || '',
    current_assignment: cleanField(row[5]),
    maintenance_due: cleanField(row[6]) || '',
  }));
}

export async function readMissionsFromSheet(): Promise<Mission[]> {
  const rows = await readSheet(SHEET_NAMES.missions);
  if (rows.length < 2) return [];

  return rows.slice(1).map((row) => ({
    project_id: cleanField(row[0]) || '',
    client: cleanField(row[1]) || '',
    location: cleanField(row[2]) || '',
    required_skills: parseCSVField(row[3] || ''),
    required_certs: parseCSVField(row[4] || ''),
    start_date: cleanField(row[5]) || '',
    end_date: cleanField(row[6]) || '',
    priority: (cleanField(row[7]) || 'Standard') as Mission['priority'],
    assigned_pilot: cleanField(row[8]),
    assigned_drone: cleanField(row[9]),
    mission_status: (cleanField(row[10]) || 'Planned') as Mission['mission_status'],
  }));
}

// ---- WRITE OPERATIONS ----

function pilotToRow(pilot: Pilot): string[] {
  return [
    pilot.pilot_id,
    pilot.name,
    pilot.skills.join(', '),
    pilot.certifications.join(', '),
    pilot.location,
    pilot.status,
    pilot.current_assignment || '–',
    pilot.available_from,
  ];
}

function droneToRow(drone: Drone): string[] {
  return [
    drone.drone_id,
    drone.model,
    drone.capabilities.join(', '),
    drone.status,
    drone.location,
    drone.current_assignment || '–',
    drone.maintenance_due,
  ];
}

function missionToRow(mission: Mission): string[] {
  return [
    mission.project_id,
    mission.client,
    mission.location,
    mission.required_skills.join(', '),
    mission.required_certs.join(', '),
    mission.start_date,
    mission.end_date,
    mission.priority,
    mission.assigned_pilot || '–',
    mission.assigned_drone || '–',
    mission.mission_status,
  ];
}

async function writeFullSheet(sheetName: string, headers: string[], rows: string[][]): Promise<void> {
  const client = getSheetsClient();
  if (!client) throw new Error('Google Sheets not configured');

  const data = [headers, ...rows];

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: data },
  });
}

export async function syncPilotsToSheet(pilots: Pilot[]): Promise<void> {
  const headers = [
    'pilot_id', 'name', 'skills', 'certifications',
    'location', 'status', 'current_assignment', 'available_from',
  ];
  const rows = pilots.map(pilotToRow);
  await writeFullSheet(SHEET_NAMES.pilots, headers, rows);
}

export async function syncDronesToSheet(drones: Drone[]): Promise<void> {
  const headers = [
    'drone_id', 'model', 'capabilities', 'status',
    'location', 'current_assignment', 'maintenance_due',
  ];
  const rows = drones.map(droneToRow);
  await writeFullSheet(SHEET_NAMES.drones, headers, rows);
}

export async function syncMissionsToSheet(missions: Mission[]): Promise<void> {
  const headers = [
    'project_id', 'client', 'location', 'required_skills', 'required_certs',
    'start_date', 'end_date', 'priority', 'assigned_pilot', 'assigned_drone', 'mission_status',
  ];
  const rows = missions.map(missionToRow);
  await writeFullSheet(SHEET_NAMES.missions, headers, rows);
}

// ---- SINGLE ROW UPDATE (more efficient for individual changes) ----

export async function updatePilotRow(pilot: Pilot, rowIndex: number): Promise<void> {
  const client = getSheetsClient();
  if (!client) return;

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `'${SHEET_NAMES.pilots}'!A${rowIndex + 2}:H${rowIndex + 2}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [pilotToRow(pilot)] },
  });
}

export async function updateDroneRow(drone: Drone, rowIndex: number): Promise<void> {
  const client = getSheetsClient();
  if (!client) return;

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `'${SHEET_NAMES.drones}'!A${rowIndex + 2}:G${rowIndex + 2}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [droneToRow(drone)] },
  });
}

export async function updateMissionRow(mission: Mission, rowIndex: number): Promise<void> {
  const client = getSheetsClient();
  if (!client) return;

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `'${SHEET_NAMES.missions}'!A${rowIndex + 2}:K${rowIndex + 2}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [missionToRow(mission)] },
  });
}
