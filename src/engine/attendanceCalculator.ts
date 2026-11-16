import type {
  AttendanceRecord,
  AttendanceStatus,
  CalculationInput,
  CalculationResult,
  ComparisonSortBy,
  DailyTrendPoint,
  Employee,
  MonthlyEmployeeSummary,
} from '../types/attendance';

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTimeFormat(timeStr: string): boolean {
  return TIME_PATTERN.test(timeStr);
}

export function timeToMinutes(timeStr: string): number {
  if (!isValidTimeFormat(timeStr)) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm`);
  }
  const [hoursStr, minsStr] = timeStr.split(':');
  return Number(hoursStr) * 60 + Number(minsStr);
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function computeScheduleMeta(
  checkInTime: string,
  checkOutTime: string
): { crossesMidnight: boolean; durationMinutes: number } {
  const inMin = timeToMinutes(checkInTime);
  const outMin = timeToMinutes(checkOutTime);
  const crossesMidnight = outMin <= inMin;
  const durationMinutes = crossesMidnight ? outMin + 1440 - inMin : outMin - inMin;
  return { crossesMidnight, durationMinutes };
}

/**
 * Pure integer-minute calculation engine.
 * Rules:
 * 1. Late minutes: if actualIn > scheduledIn -> diff in minutes.
 * 2. Early arrival: if actualIn < scheduledIn -> recorded independently, NEVER added to overtime.
 * 3. Early leave: if actualOut < scheduledOut -> diff in minutes.
 * 4. Overtime: if actualOut > scheduledOut -> diff in minutes.
 * 5. Actual worked: actualOut - actualIn.
 * 6. Net time diff: overtimeMinutes - lateMinutes.
 * 7. Late and overtime never cancel each other out; both stay independent with net diff as 3rd metric.
 * 8. Overnight / cross-midnight shifts are resolved in integer minutes without rounding drift.
 */
export function calculateAttendanceMetrics(input: CalculationInput): CalculationResult {
  const schedIn = timeToMinutes(input.scheduledCheckIn);
  const schedOutRaw = timeToMinutes(input.scheduledCheckOut);
  const crossesMidnight = schedOutRaw <= schedIn;
  const schedOutAbs = crossesMidnight ? schedOutRaw + 1440 : schedOutRaw;

  if (input.status !== 'present') {
    return {
      crossesMidnight,
      lateMinutes: 0,
      earlyArrivalMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      actualWorkedMinutes: 0,
      netTimeDiffMinutes: 0,
    };
  }

  if (!input.actualCheckIn || !isValidTimeFormat(input.actualCheckIn)) {
    return {
      crossesMidnight,
      lateMinutes: 0,
      earlyArrivalMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      actualWorkedMinutes: 0,
      netTimeDiffMinutes: 0,
    };
  }

  const rawIn = timeToMinutes(input.actualCheckIn);
  let actualInAbs = rawIn;

  // Normalize actual check-in to the nearest occurrence around scheduledCheckIn (±12h anchor)
  if (actualInAbs - schedIn > 720) {
    actualInAbs -= 1440;
  } else if (schedIn - actualInAbs > 720) {
    actualInAbs += 1440;
  }

  const lateMinutes = Math.max(0, actualInAbs - schedIn);
  const earlyArrivalMinutes = Math.max(0, schedIn - actualInAbs);

  if (!input.actualCheckOut || !isValidTimeFormat(input.actualCheckOut)) {
    return {
      crossesMidnight,
      lateMinutes,
      earlyArrivalMinutes,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      actualWorkedMinutes: 0,
      netTimeDiffMinutes: -lateMinutes,
    };
  }

  const rawOut = timeToMinutes(input.actualCheckOut);
  let actualOutAbs = rawOut;
  while (actualOutAbs < actualInAbs) {
    actualOutAbs += 1440;
  }

  const earlyLeaveMinutes = Math.max(0, schedOutAbs - actualOutAbs);
  const overtimeMinutes = Math.max(0, actualOutAbs - schedOutAbs);
  const actualWorkedMinutes = Math.max(0, actualOutAbs - actualInAbs);
  const netTimeDiffMinutes = overtimeMinutes - lateMinutes;

  return {
    crossesMidnight,
    lateMinutes,
    earlyArrivalMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    actualWorkedMinutes,
    netTimeDiffMinutes,
  };
}

export function formatDurationArabic(minutes: number, showSign = false): string {
  const rounded = Math.round(minutes);
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;

  let core = '';
  if (abs === 0) {
    core = '0 د';
  } else if (hours === 0) {
    core = `${mins} د`;
  } else if (mins === 0) {
    core = `${hours} س`;
  } else {
    core = `${hours} س ${mins} د`;
  }

  if (!showSign || rounded === 0) {
    return core;
  }
  return rounded > 0 ? `+${core}` : `-${core}`;
}

export function formatHoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

export function getStatusLabelArabic(status: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return 'حاضر';
    case 'absent':
      return 'غائب';
    case 'leave':
      return 'إجازة';
    case 'rest':
      return 'راحة أسبوعية';
  }
}

export function buildAttendanceRecordId(
  date: string,
  employeeId: string,
  scheduleId: string
): string {
  return `${date}_${employeeId}_${scheduleId}`;
}

export function buildMonthlyEmployeeSummary(
  employee: Employee,
  records: AttendanceRecord[]
): MonthlyEmployeeSummary {
  const empRecords = records.filter((r) => r.employeeId === employee.id);

  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let restDays = 0;
  let lateDays = 0;
  let onTimeDays = 0;
  let totalLateMinutes = 0;
  let totalEarlyArrivalMinutes = 0;
  let totalEarlyLeaveMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalActualWorkedMinutes = 0;
  let totalNetTimeDiffMinutes = 0;

  for (const r of empRecords) {
    if (r.status === 'present') {
      presentDays += 1;
      if (r.lateMinutes > 0) {
        lateDays += 1;
      } else {
        onTimeDays += 1;
      }
      totalLateMinutes += r.lateMinutes;
      totalEarlyArrivalMinutes += r.earlyArrivalMinutes;
      totalEarlyLeaveMinutes += r.earlyLeaveMinutes;
      totalOvertimeMinutes += r.overtimeMinutes;
      totalActualWorkedMinutes += r.actualWorkedMinutes;
      totalNetTimeDiffMinutes += r.netTimeDiffMinutes;
    } else if (r.status === 'absent') {
      absentDays += 1;
    } else if (r.status === 'leave') {
      leaveDays += 1;
    } else if (r.status === 'rest') {
      restDays += 1;
    }
  }

  const punctualityRate =
    presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 100;

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: employee.name,
    department: employee.department,
    employeeStatus: employee.status,
    presentDays,
    absentDays,
    leaveDays,
    restDays,
    lateDays,
    onTimeDays,
    totalLateMinutes,
    totalEarlyArrivalMinutes,
    totalEarlyLeaveMinutes,
    totalOvertimeMinutes,
    totalActualWorkedMinutes,
    totalNetTimeDiffMinutes,
    punctualityRate,
  };
}

export function buildEmployeeComparison(
  employees: Employee[],
  records: AttendanceRecord[],
  sortBy: ComparisonSortBy
): MonthlyEmployeeSummary[] {
  const summaries = employees.map((emp) => buildMonthlyEmployeeSummary(emp, records));

  return summaries.sort((a, b) => {
    switch (sortBy) {
      case 'least_late':
        return a.totalLateMinutes - b.totalLateMinutes || b.presentDays - a.presentDays;
      case 'most_late':
        return b.totalLateMinutes - a.totalLateMinutes || b.lateDays - a.lateDays;
      case 'most_overtime':
        return b.totalOvertimeMinutes - a.totalOvertimeMinutes || b.totalActualWorkedMinutes - a.totalActualWorkedMinutes;
      case 'most_worked':
        return b.totalActualWorkedMinutes - a.totalActualWorkedMinutes || b.presentDays - a.presentDays;
      case 'least_punctual':
        return (
          a.punctualityRate - b.punctualityRate ||
          b.totalLateMinutes - a.totalLateMinutes ||
          b.absentDays - a.absentDays
        );
    }
  });
}

export function buildDailyTrendSeries(
  records: AttendanceRecord[],
  year: number,
  month: number // 1..12
): DailyTrendPoint[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');
  const map = new Map<string, DailyTrendPoint>();

  for (let d = 1; d <= daysInMonth; d += 1) {
    const dayStr = String(d).padStart(2, '0');
    const date = `${year}-${monthStr}-${dayStr}`;
    map.set(date, {
      day: d,
      date,
      lateMinutes: 0,
      overtimeMinutes: 0,
      presentCount: 0,
    });
  }

  for (const r of records) {
    const point = map.get(r.date);
    if (!point) continue;
    if (r.status === 'present') {
      point.presentCount += 1;
      point.lateMinutes += r.lateMinutes;
      point.overtimeMinutes += r.overtimeMinutes;
    }
  }

  return Array.from(map.values());
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ARABIC_WEEKDAYS = [
  { index: 6, label: 'السبت', short: 'سبت' },
  { index: 0, label: 'الأحد', short: 'أحد' },
  { index: 1, label: 'الاثنين', short: 'اثنين' },
  { index: 2, label: 'الثلاثاء', short: 'ثلاثاء' },
  { index: 3, label: 'الأربعاء', short: 'أربعاء' },
  { index: 4, label: 'الخميس', short: 'خميس' },
  { index: 5, label: 'الجمعة', short: 'جمعة' },
] as const;

export const ARABIC_MONTHS = [
  { value: 1, label: 'يناير' },
  { value: 2, label: 'فبراير' },
  { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' },
  { value: 5, label: 'مايو' },
  { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' },
  { value: 8, label: 'أغسطس' },
  { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' },
  { value: 11, label: 'نوفمبر' },
  { value: 12, label: 'ديسمبر' },
] as const;
