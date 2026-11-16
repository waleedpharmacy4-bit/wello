export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'rest';

export type EmployeeStatus = 'active' | 'inactive';

export type UserRole = 'admin' | 'supervisor' | 'viewer';

export type HolidayType = 'official_holiday' | 'weekly_rest' | 'special_leave';

export type ComparisonSortBy =
  | 'least_late'
  | 'most_late'
  | 'most_overtime'
  | 'most_worked'
  | 'least_punctual';

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  defaultScheduleId: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  workDays: number[]; // 0 (Sunday) .. 6 (Saturday)
  restDays: number[]; // 0 (Sunday) .. 6 (Saturday)
  hourlyRate?: number;
  startDate: string; // YYYY-MM-DD
  status: EmployeeStatus;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorkSchedule {
  id: string;
  name: string;
  checkInTime: string;
  checkOutTime: string;
  crossesMidnight: boolean;
  durationMinutes: number;
  description: string;
  isActive: boolean;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttendanceRecord {
  id: string; // `${date}_${employeeId}_${scheduleId}`
  date: string; // YYYY-MM-DD
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  scheduleId: string;
  scheduleName: string;
  scheduledCheckIn: string;
  scheduledCheckOut: string;
  crossesMidnight: boolean;
  actualCheckIn: string;
  actualCheckOut: string;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  actualWorkedMinutes: number;
  netTimeDiffMinutes: number;
  notes: string;
  updatedByName: string;
  updatedByEmail: string;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  appliesToAll: boolean;
  employeeId: string;
  notes: string;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserAccount {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'status_change' | 'restore';
  entityType: 'employee' | 'schedule' | 'attendance' | 'holiday' | 'user' | 'settings' | 'backup';
  entityId: string;
  summary: string;
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
}

export interface SystemSettings {
  id: string;
  pharmacyName: string;
  branchName: string;
  departments: string[];
  authorizedEmails: string[];
  nextEmployeeSeq: number;
  ownerUid: string;
  allowedEmails: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CalculationInput {
  scheduledCheckIn: string;
  scheduledCheckOut: string;
  actualCheckIn: string;
  actualCheckOut: string;
  status: AttendanceStatus;
}

export interface CalculationResult {
  crossesMidnight: boolean;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  actualWorkedMinutes: number;
  netTimeDiffMinutes: number;
}

export interface MonthlyEmployeeSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  employeeStatus: EmployeeStatus;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  restDays: number;
  lateDays: number;
  onTimeDays: number;
  totalLateMinutes: number;
  totalEarlyArrivalMinutes: number;
  totalEarlyLeaveMinutes: number;
  totalOvertimeMinutes: number;
  totalActualWorkedMinutes: number;
  totalNetTimeDiffMinutes: number;
  punctualityRate: number; // 0..100
}

export interface DailyTrendPoint {
  day: number;
  date: string;
  lateMinutes: number;
  overtimeMinutes: number;
  presentCount: number;
}
