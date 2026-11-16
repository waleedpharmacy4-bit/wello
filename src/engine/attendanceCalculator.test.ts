import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendanceRecordId,
  buildEmployeeComparison,
  buildMonthlyEmployeeSummary,
  calculateAttendanceMetrics,
  computeScheduleMeta,
  formatDurationArabic,
} from './attendanceCalculator.ts';
import type { AttendanceRecord, Employee } from '../types/attendance.ts';

test('1. Exact on-time arrival and departure (09:00 - 17:00)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:00',
    actualCheckOut: '17:00',
    status: 'present',
  });
  assert.deepEqual(res, {
    crossesMidnight: false,
    lateMinutes: 0,
    earlyArrivalMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    actualWorkedMinutes: 480,
    netTimeDiffMinutes: 0,
  });
});

test('2. Late arrival without overtime (09:25 - 17:00)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:25',
    actualCheckOut: '17:00',
    status: 'present',
  });
  assert.equal(res.lateMinutes, 25);
  assert.equal(res.overtimeMinutes, 0);
  assert.equal(res.actualWorkedMinutes, 455);
  assert.equal(res.netTimeDiffMinutes, -25);
});

test('3. Late arrival WITH overtime — neither cancels the other (09:30 - 17:45)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:30',
    actualCheckOut: '17:45',
    status: 'present',
  });
  assert.equal(res.lateMinutes, 30);
  assert.equal(res.overtimeMinutes, 45);
  assert.equal(res.actualWorkedMinutes, 495); // 8h 15m
  assert.equal(res.netTimeDiffMinutes, 15); // +15m for employee
});

test('4. Early arrival is tracked independently and does NOT count as overtime (08:30 - 17:00)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '08:30',
    actualCheckOut: '17:00',
    status: 'present',
  });
  assert.equal(res.earlyArrivalMinutes, 30);
  assert.equal(res.lateMinutes, 0);
  assert.equal(res.overtimeMinutes, 0);
  assert.equal(res.actualWorkedMinutes, 510);
  assert.equal(res.netTimeDiffMinutes, 0);
});

test('5. Early departure (09:00 - 16:15)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:00',
    actualCheckOut: '16:15',
    status: 'present',
  });
  assert.equal(res.earlyLeaveMinutes, 45);
  assert.equal(res.overtimeMinutes, 0);
  assert.equal(res.lateMinutes, 0);
  assert.equal(res.actualWorkedMinutes, 435);
  assert.equal(res.netTimeDiffMinutes, 0);
});

test('6. Overtime without late arrival (09:00 - 18:30)', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:00',
    actualCheckOut: '18:30',
    status: 'present',
  });
  assert.equal(res.lateMinutes, 0);
  assert.equal(res.overtimeMinutes, 90);
  assert.equal(res.actualWorkedMinutes, 570);
  assert.equal(res.netTimeDiffMinutes, 90);
});

test('7. Absent status zeroes all time metrics', () => {
  const res = calculateAttendanceMetrics({
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    actualCheckIn: '09:30',
    actualCheckOut: '17:30',
    status: 'absent',
  });
  assert.deepEqual(res, {
    crossesMidnight: false,
    lateMinutes: 0,
    earlyArrivalMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    actualWorkedMinutes: 0,
    netTimeDiffMinutes: 0,
  });
});

test('8. Leave and weekly rest statuses zero all time metrics', () => {
  const leaveRes = calculateAttendanceMetrics({
    scheduledCheckIn: '14:00',
    scheduledCheckOut: '22:00',
    actualCheckIn: '',
    actualCheckOut: '',
    status: 'leave',
  });
  const restRes = calculateAttendanceMetrics({
    scheduledCheckIn: '22:00',
    scheduledCheckOut: '06:00',
    actualCheckIn: '',
    actualCheckOut: '',
    status: 'rest',
  });
  assert.equal(leaveRes.actualWorkedMinutes, 0);
  assert.equal(restRes.crossesMidnight, true);
  assert.equal(restRes.actualWorkedMinutes, 0);
});

test('9. Cross-midnight shift (22:00 - 06:00) handles late, early arrival, overtime, and pre-midnight departure', () => {
  const meta = computeScheduleMeta('22:00', '06:00');
  assert.equal(meta.crossesMidnight, true);
  assert.equal(meta.durationMinutes, 480);

  // Late 20 min, overtime 45 min
  const caseA = calculateAttendanceMetrics({
    scheduledCheckIn: '22:00',
    scheduledCheckOut: '06:00',
    actualCheckIn: '22:20',
    actualCheckOut: '06:45',
    status: 'present',
  });
  assert.equal(caseA.crossesMidnight, true);
  assert.equal(caseA.lateMinutes, 20);
  assert.equal(caseA.overtimeMinutes, 45);
  assert.equal(caseA.actualWorkedMinutes, 505);
  assert.equal(caseA.netTimeDiffMinutes, 25);

  // Arrived AFTER midnight at 00:15 for 22:00 shift (135 min late)
  const caseB = calculateAttendanceMetrics({
    scheduledCheckIn: '22:00',
    scheduledCheckOut: '06:00',
    actualCheckIn: '00:15',
    actualCheckOut: '06:00',
    status: 'present',
  });
  assert.equal(caseB.lateMinutes, 135);
  assert.equal(caseB.actualWorkedMinutes, 345);
  assert.equal(caseB.netTimeDiffMinutes, -135);

  // Left early BEFORE midnight at 23:30
  const caseC = calculateAttendanceMetrics({
    scheduledCheckIn: '22:00',
    scheduledCheckOut: '06:00',
    actualCheckIn: '22:00',
    actualCheckOut: '23:30',
    status: 'present',
  });
  assert.equal(caseC.earlyLeaveMinutes, 390);
  assert.equal(caseC.actualWorkedMinutes, 90);
});

test('10. Monthly summary & comparison sorting preserve historical snapshot metrics', () => {
  const emp1: Employee = {
    id: 'emp-1',
    employeeCode: 'EMP-001',
    name: 'أحمد علي',
    department: 'صيدلي',
    defaultScheduleId: 'sched-evening',
    defaultCheckIn: '14:00', // Changed later; old records kept 09:00!
    defaultCheckOut: '22:00',
    workDays: [0, 1, 2, 3, 4],
    restDays: [5, 6],
    startDate: '2025-01-01',
    status: 'active',
    ownerUid: 'u1',
    allowedEmails: ['waleedpharmacy6@gmail.com'],
  };
  const emp2: Employee = {
    ...emp1,
    id: 'emp-2',
    employeeCode: 'EMP-002',
    name: 'سارة محمد',
  };

  const r1: AttendanceRecord = {
    id: buildAttendanceRecordId('2026-11-01', 'emp-1', 'sched-morning'),
    date: '2026-11-01',
    employeeId: 'emp-1',
    employeeCode: 'EMP-001',
    employeeName: 'أحمد علي',
    department: 'صيدلي',
    scheduleId: 'sched-morning',
    scheduleName: 'الصباحية',
    scheduledCheckIn: '09:00',
    scheduledCheckOut: '17:00',
    crossesMidnight: false,
    actualCheckIn: '09:30',
    actualCheckOut: '17:45',
    status: 'present',
    lateMinutes: 30,
    earlyArrivalMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 45,
    actualWorkedMinutes: 495,
    netTimeDiffMinutes: 15,
    notes: '',
    updatedByName: 'Admin',
    updatedByEmail: 'waleedpharmacy6@gmail.com',
    ownerUid: 'u1',
    allowedEmails: ['waleedpharmacy6@gmail.com'],
  };

  const r2: AttendanceRecord = {
    ...r1,
    id: buildAttendanceRecordId('2026-11-01', 'emp-2', 'sched-morning'),
    employeeId: 'emp-2',
    employeeCode: 'EMP-002',
    employeeName: 'سارة محمد',
    actualCheckIn: '09:00',
    actualCheckOut: '17:00',
    lateMinutes: 0,
    overtimeMinutes: 0,
    actualWorkedMinutes: 480,
    netTimeDiffMinutes: 0,
  };

  const sum1 = buildMonthlyEmployeeSummary(emp1, [r1, r2]);
  assert.equal(sum1.presentDays, 1);
  assert.equal(sum1.totalLateMinutes, 30);
  assert.equal(sum1.totalOvertimeMinutes, 45);
  assert.equal(sum1.totalNetTimeDiffMinutes, 15);
  assert.equal(sum1.punctualityRate, 0);

  const byLeastLate = buildEmployeeComparison([emp1, emp2], [r1, r2], 'least_late');
  assert.equal(byLeastLate[0].employeeId, 'emp-2');

  const byMostOvertime = buildEmployeeComparison([emp1, emp2], [r1, r2], 'most_overtime');
  assert.equal(byMostOvertime[0].employeeId, 'emp-1');

  assert.equal(formatDurationArabic(495), '8 س 15 د');
  assert.equal(formatDurationArabic(15, true), '+15 د');
  assert.equal(formatDurationArabic(-20, true), '-20 د');
});
