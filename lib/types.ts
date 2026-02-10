// ============================================
// Skylark Drone Operations - Type Definitions
// ============================================

export type PilotStatus = 'Available' | 'Assigned' | 'On Leave' | 'Unavailable';
export type DroneStatus = 'Available' | 'Maintenance' | 'Deployed';
export type MissionStatus = 'Planned' | 'Active' | 'Completed' | 'Cancelled';
export type Priority = 'Urgent' | 'High' | 'Standard';
export type ConflictType =
  | 'double_booking_pilot'
  | 'double_booking_drone'
  | 'certification_mismatch'
  | 'skill_mismatch'
  | 'maintenance_issue'
  | 'location_mismatch'
  | 'unavailable_pilot';
export type ConflictSeverity = 'error' | 'warning';

export interface Pilot {
  pilot_id: string;
  name: string;
  skills: string[];
  certifications: string[];
  location: string;
  status: PilotStatus;
  current_assignment: string;
  available_from: string;
}

export interface Drone {
  drone_id: string;
  model: string;
  capabilities: string[];
  status: DroneStatus;
  location: string;
  current_assignment: string;
  maintenance_due: string;
}

export interface Mission {
  project_id: string;
  client: string;
  location: string;
  required_skills: string[];
  required_certs: string[];
  start_date: string;
  end_date: string;
  priority: Priority;
  assigned_pilot: string;
  assigned_drone: string;
  mission_status: MissionStatus;
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  entities: string[];
  mission_id?: string;
}

export interface ReassignmentPlan {
  affected_missions: Mission[];
  proposed_changes: ReassignmentChange[];
  unresolvable: string[];
}

export interface ReassignmentChange {
  mission_id: string;
  old_pilot?: string;
  new_pilot?: string;
  old_drone?: string;
  new_drone?: string;
  reason: string;
}
