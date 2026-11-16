import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Moon, Save, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  buildAttendanceRecordId,
  calculateAttendanceMetrics,
  formatDurationArabic,
  getStatusLabelArabic,
  getTodayIsoDate,
} from '../engine/attendanceCalculator';
import { saveAttendanceRecord } from '../services/firestoreService';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Holiday,
  WorkSchedule,
} from '../types/attendance';

interface DailyEntryViewProps {
  employees: Employee[];
  schedules: WorkSchedule[];
  attendanceRecords: AttendanceRecord[];
  holidays: Holiday[];
  user: User;
  canEdit: boolean;
  allowedEmails: string[];
}

interface BatchRowDraft {
  scheduleId: string;
  scheduledCheckIn: string;
  scheduledCheckOut: string;
  actualCheckIn: string;
  actualCheckOut: string;
  status: AttendanceStatus;
  notes: string;
  dirty: boolean;
  saving: boolean;
  savedNotice: boolean;
}

export const DailyEntryView: React.FC<DailyEntryViewProps> = ({
  employees,
  schedules,
  attendanceRecords,
  holidays,
  user,
  canEdit,
  allowedEmails,
}) => {
  const [entryMode, setEntryMode] = useState<'single' | 'multi'>('single');
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'active'),
    [employees]
  );

  // Single Entry State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [scheduledCheckIn, setScheduledCheckIn] = useState('09:00');
  const [scheduledCheckOut, setScheduledCheckOut] = useState('17:00');
  const [actualCheckIn, setActualCheckIn] = useState('');
  const [actualCheckOut, setActualCheckOut] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [notes, setNotes] = useState('');
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleToast, setSingleToast] = useState<string | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Ensure initial employee selection
  useEffect(() => {
    if (!selectedEmployeeId && activeEmployees.length > 0) {
      setSelectedEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  const selectedSchedule = useMemo(
    () => schedules.find((s) => s.id === selectedScheduleId) || null,
    [schedules, selectedScheduleId]
  );

  const holidayForDate = useMemo(() => {
    return holidays.find(
      (h) =>
        h.date === selectedDate &&
        (h.appliesToAll || h.employeeId === selectedEmployeeId)
    );
  }, [holidays, selectedDate, selectedEmployeeId]);

  const recordsById = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendanceRecords) {
      map.set(r.id, r);
    }
    return map;
  }, [attendanceRecords]);

  // Populate defaults when Employee or Date changes
  useEffect(() => {
    if (!selectedEmployee) return;
    const defaultSchedId = selectedEmployee.defaultScheduleId;
    setSelectedScheduleId(defaultSchedId);

    const recordId = buildAttendanceRecordId(
      selectedDate,
      selectedEmployee.id,
      defaultSchedId
    );
    const existing = recordsById.get(recordId);

    if (existing) {
      setScheduledCheckIn(existing.scheduledCheckIn);
      setScheduledCheckOut(existing.scheduledCheckOut);
      setActualCheckIn(existing.actualCheckIn);
      setActualCheckOut(existing.actualCheckOut);
      setStatus(existing.status);
      setNotes(existing.notes || '');
    } else {
      setScheduledCheckIn(selectedEmployee.defaultCheckIn);
      setScheduledCheckOut(selectedEmployee.defaultCheckOut);

      // Suggest status based on holiday or rest day
      const dateObj = new Date(`${selectedDate}T12:00:00`);
      const dayOfWeek = dateObj.getDay();
      const matchingHoliday = holidays.find(
        (h) =>
          h.date === selectedDate &&
          (h.appliesToAll || h.employeeId === selectedEmployee.id)
      );

      if (matchingHoliday) {
        setStatus('leave');
        setActualCheckIn('');
        setActualCheckOut('');
        setNotes(matchingHoliday.name);
      } else if ((selectedEmployee.restDays || []).includes(dayOfWeek)) {
        setStatus('rest');
        setActualCheckIn('');
        setActualCheckOut('');
        setNotes('');
      } else {
        setStatus('present');
        setActualCheckIn('');
        setActualCheckOut('');
        setNotes('');
      }
    }
    setSingleToast(null);
    setSingleError(null);
  }, [selectedEmployee, selectedDate, recordsById, holidays]);

  // When user overrides shift schedule for this specific day
  const handleSingleScheduleOverride = (newScheduleId: string) => {
    setSelectedScheduleId(newScheduleId);
    if (!selectedEmployee) return;

    const recordId = buildAttendanceRecordId(
      selectedDate,
      selectedEmployee.id,
      newScheduleId
    );
    const existing = recordsById.get(recordId);
    if (existing) {
      setScheduledCheckIn(existing.scheduledCheckIn);
      setScheduledCheckOut(existing.scheduledCheckOut);
      setActualCheckIn(existing.actualCheckIn);
      setActualCheckOut(existing.actualCheckOut);
      setStatus(existing.status);
      setNotes(existing.notes || '');
      return;
    }

    const sched = schedules.find((s) => s.id === newScheduleId);
    if (sched) {
      if (newScheduleId === selectedEmployee.defaultScheduleId) {
        setScheduledCheckIn(selectedEmployee.defaultCheckIn);
        setScheduledCheckOut(selectedEmployee.defaultCheckOut);
      } else {
        setScheduledCheckIn(sched.checkInTime);
        setScheduledCheckOut(sched.checkOutTime);
      }
    }
  };

  const existingSingleRecord = useMemo(() => {
    if (!selectedEmployee || !selectedScheduleId) return null;
    const id = buildAttendanceRecordId(selectedDate, selectedEmployee.id, selectedScheduleId);
    return recordsById.get(id) || null;
  }, [selectedDate, selectedEmployee, selectedScheduleId, recordsById]);

  const liveCalculation = useMemo(() => {
    return calculateAttendanceMetrics({
      scheduledCheckIn,
      scheduledCheckOut,
      actualCheckIn: status === 'present' ? actualCheckIn : '',
      actualCheckOut: status === 'present' ? actualCheckOut : '',
      status,
    });
  }, [scheduledCheckIn, scheduledCheckOut, actualCheckIn, actualCheckOut, status]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !selectedScheduleId) return;
    if (status === 'present' && !actualCheckIn) {
      setSingleError('يرجى إدخال موعد الحضور الفعلي عند اختيار حالة "حاضر".');
      return;
    }

    setSingleSaving(true);
    setSingleError(null);
    setSingleToast(null);
    try {
      await saveAttendanceRecord({
        date: selectedDate,
        employee: selectedEmployee,
        scheduleId: selectedScheduleId,
        scheduleName: selectedSchedule?.name || 'وردية مخصصة',
        scheduledCheckIn,
        scheduledCheckOut,
        actualCheckIn,
        actualCheckOut,
        status,
        notes,
        user,
        allowedEmails,
      });
      setSingleToast(
        existingSingleRecord
          ? `تم تحديث سجل ${selectedEmployee.name} بتاريخ ${selectedDate}`
          : `تم حفظ حضور ${selectedEmployee.name} بتاريخ ${selectedDate}`
      );
    } catch (err) {
      setSingleError(err instanceof Error ? err.message : 'تعذر حفظ السجل');
    } finally {
      setSingleSaving(false);
    }
  };

  // Multi-Employee Batch Grid State
  const [drafts, setDrafts] = useState<Record<string, BatchRowDraft>>({});
  const [batchSavingAll, setBatchSavingAll] = useState(false);

  useEffect(() => {
    const nextDrafts: Record<string, BatchRowDraft> = {};
    const dateObj = new Date(`${selectedDate}T12:00:00`);
    const dayOfWeek = dateObj.getDay();

    for (const emp of activeEmployees) {
      const existing = attendanceRecords.find(
        (r) => r.date === selectedDate && r.employeeId === emp.id
      );

      if (existing) {
        nextDrafts[emp.id] = {
          scheduleId: existing.scheduleId,
          scheduledCheckIn: existing.scheduledCheckIn,
          scheduledCheckOut: existing.scheduledCheckOut,
          actualCheckIn: existing.actualCheckIn,
          actualCheckOut: existing.actualCheckOut,
          status: existing.status,
          notes: existing.notes || '',
          dirty: false,
          saving: false,
          savedNotice: false,
        };
      } else {
        const matchingHol = holidays.find(
          (h) => h.date === selectedDate && (h.appliesToAll || h.employeeId === emp.id)
        );
        const isRest = (emp.restDays || []).includes(dayOfWeek);

        nextDrafts[emp.id] = {
          scheduleId: emp.defaultScheduleId,
          scheduledCheckIn: emp.defaultCheckIn,
          scheduledCheckOut: emp.defaultCheckOut,
          actualCheckIn: '',
          actualCheckOut: '',
          status: matchingHol ? 'leave' : isRest ? 'rest' : 'present',
          notes: matchingHol ? matchingHol.name : '',
          dirty: false,
          saving: false,
          savedNotice: false,
        };
      }
    }
    setDrafts(nextDrafts);
  }, [selectedDate, activeEmployees, attendanceRecords, holidays]);

  const updateRowDraft = (empId: string, patch: Partial<BatchRowDraft>) => {
    setDrafts((prev) => {
      const current = prev[empId];
      if (!current) return prev;
      return {
        ...prev,
        [empId]: { ...current, ...patch, dirty: true, savedNotice: false },
      };
    });
  };

  const handleRowScheduleChange = (emp: Employee, newSchedId: string) => {
    const existing = attendanceRecords.find(
      (r) =>
        r.date === selectedDate &&
        r.employeeId === emp.id &&
        r.scheduleId === newSchedId
    );
    if (existing) {
      updateRowDraft(emp.id, {
        scheduleId: existing.scheduleId,
        scheduledCheckIn: existing.scheduledCheckIn,
        scheduledCheckOut: existing.scheduledCheckOut,
        actualCheckIn: existing.actualCheckIn,
        actualCheckOut: existing.actualCheckOut,
        status: existing.status,
        notes: existing.notes || '',
      });
      return;
    }
    const sched = schedules.find((s) => s.id === newSchedId);
    updateRowDraft(emp.id, {
      scheduleId: newSchedId,
      scheduledCheckIn:
        newSchedId === emp.defaultScheduleId
          ? emp.defaultCheckIn
          : sched?.checkInTime || emp.defaultCheckIn,
      scheduledCheckOut:
        newSchedId === emp.defaultScheduleId
          ? emp.defaultCheckOut
          : sched?.checkOutTime || emp.defaultCheckOut,
    });
  };

  const saveSingleRowFromGrid = async (emp: Employee) => {
    const row = drafts[emp.id];
    if (!row) return;
    if (row.status === 'present' && !row.actualCheckIn) return;

    setDrafts((prev) => ({
      ...prev,
      [emp.id]: { ...prev[emp.id], saving: true },
    }));

    const sched = schedules.find((s) => s.id === row.scheduleId);
    try {
      await saveAttendanceRecord({
        date: selectedDate,
        employee: emp,
        scheduleId: row.scheduleId,
        scheduleName: sched?.name || 'وردية مخصصة',
        scheduledCheckIn: row.scheduledCheckIn,
        scheduledCheckOut: row.scheduledCheckOut,
        actualCheckIn: row.actualCheckIn,
        actualCheckOut: row.actualCheckOut,
        status: row.status,
        notes: row.notes,
        user,
        allowedEmails,
      });

      setDrafts((prev) => ({
        ...prev,
        [emp.id]: { ...prev[emp.id], saving: false, dirty: false, savedNotice: true },
      }));
    } catch {
      setDrafts((prev) => ({
        ...prev,
        [emp.id]: { ...prev[emp.id], saving: false },
      }));
    }
  };

  const handleSaveAllDirtyRows = async () => {
    const dirtyEmps = activeEmployees.filter((emp) => {
      const r = drafts[emp.id];
      if (!r || !r.dirty) return false;
      if (r.status === 'present' && !r.actualCheckIn) return false;
      return true;
    });
    if (dirtyEmps.length === 0) return;

    setBatchSavingAll(true);
    try {
      for (const emp of dirtyEmps) {
        await saveSingleRowFromGrid(emp);
      }
    } finally {
      setBatchSavingAll(false);
    }
  };

  if (activeEmployees.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-base font-bold text-slate-900">
          لا يوجد موظفون نشطون لتسجيل حضورهم
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          انتقل إلى قسم "إدارة الموظفين" لإضافة موظفي الصيدلية وتحديد وردياتهم أولاً.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Switcher + Date Picker */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setEntryMode('single')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'single'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تسجيل فردي سريع
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('multi')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              entryMode === 'multi'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            جدول تسجيل متعدد ({activeEmployees.length} موظف)
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            تاريخ اليوم:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-sm font-semibold text-slate-900 outline-none focus:border-teal-600 focus:bg-white"
          />
        </div>
      </div>

      {entryMode === 'single' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Entry Form */}
          <form
            onSubmit={handleSingleSubmit}
            className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">بيانات الحضور والانصراف</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  يتم جلب الموعد الأساسي تلقائياً وحساب كافة المؤشرات فور الإدخال.
                </p>
              </div>
              {existingSingleRecord && (
                <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  يوجد سجل مسجل مسبقاً — سيتم تحديثه دون تكرار
                </span>
              )}
            </div>

            {holidayForDate && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-medium text-teal-800">
                تنبيه تقويم: هذا التاريخ مسجل كـ "{holidayForDate.name}".
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  اسم الموظف *
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600"
                >
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode} · {emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  الوردية / جدول اليوم (قابل للتغيير لهذا اليوم)
                </label>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => handleSingleScheduleOverride(e.target.value)}
                  disabled={Boolean(existingSingleRecord)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 disabled:bg-slate-50"
                >
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.checkInTime} – {s.checkOutTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  موعد الحضور الأساسي (تلقائي)
                </label>
                <input
                  type="time"
                  value={scheduledCheckIn}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-num text-sm font-semibold text-slate-700"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  موعد الانصراف الأساسي (تلقائي)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={scheduledCheckOut}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono-num text-sm font-semibold text-slate-700"
                  />
                  {liveCalculation.crossesMidnight && (
                    <span
                      title="وردية تتجاوز منتصف الليل"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-700"
                    >
                      <Moon className="h-3.5 w-3.5" />
                      ليلي
                    </span>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  حالة اليوم *
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['present', 'absent', 'leave', 'rest'] as AttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${
                        status === st
                          ? 'border-teal-700 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {getStatusLabelArabic(st)}
                    </button>
                  ))}
                </div>
              </div>

              {status === 'present' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      موعد الحضور الفعلي *
                    </label>
                    <input
                      type="time"
                      required
                      value={actualCheckIn}
                      onChange={(e) => setActualCheckIn(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono-num text-sm font-semibold text-slate-900 outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      موعد الانصراف الفعلي
                    </label>
                    <input
                      type="time"
                      value={actualCheckOut}
                      onChange={(e) => setActualCheckOut(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono-num text-sm font-semibold text-slate-900 outline-none focus:border-teal-600"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أدخل أي ملاحظة حول سبب التأخير أو الإضافي أو الإجازة..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600"
                />
              </div>
            </div>

            {singleError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
                {singleError}
              </div>
            )}

            {singleToast && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{singleToast}</span>
              </div>
            )}

            {canEdit && (
              <div className="flex items-center justify-end border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={singleSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {singleSaving
                      ? 'جاري الحفظ...'
                      : existingSingleRecord
                      ? 'تحديث السجل'
                      : 'حفظ سجل الحضور'}
                  </span>
                </button>
              </div>
            )}
          </form>

          {/* Live Calculation Breakdown Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h4 className="text-sm font-bold text-slate-900">النتائج المحسوبة فوراً</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              تظهر النتائج لحظياً وبشكل مستقل لكل مؤشر
            </p>

            <div className="mt-5 divide-y divide-slate-100">
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-slate-600">التأخير</span>
                <span
                  className={`font-mono-num text-sm font-bold ${
                    liveCalculation.lateMinutes > 0 ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {liveCalculation.lateMinutes} دقيقة
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-slate-600">
                  الحضور المبكر (مستقل)
                </span>
                <span className="font-mono-num text-sm font-semibold text-teal-700">
                  {liveCalculation.earlyArrivalMinutes} دقيقة
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-slate-600">الانصراف المبكر</span>
                <span
                  className={`font-mono-num text-sm font-bold ${
                    liveCalculation.earlyLeaveMinutes > 0 ? 'text-amber-600' : 'text-slate-900'
                  }`}
                >
                  {liveCalculation.earlyLeaveMinutes} دقيقة
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-slate-600">الساعات الإضافية</span>
                <span
                  className={`font-mono-num text-sm font-bold ${
                    liveCalculation.overtimeMinutes > 0 ? 'text-emerald-700' : 'text-slate-900'
                  }`}
                >
                  {liveCalculation.overtimeMinutes} دقيقة (
                  {formatDurationArabic(liveCalculation.overtimeMinutes)})
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-slate-600">ساعات العمل الفعلية</span>
                <span className="font-mono-num text-sm font-bold text-slate-900">
                  {formatDurationArabic(liveCalculation.actualWorkedMinutes)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-4">
                <span className="text-xs font-bold text-slate-800">صافي فرق الوقت</span>
                <span
                  className={`font-mono-num text-base font-bold ${
                    liveCalculation.netTimeDiffMinutes > 0
                      ? 'text-emerald-700'
                      : liveCalculation.netTimeDiffMinutes < 0
                      ? 'text-red-600'
                      : 'text-slate-700'
                  }`}
                >
                  {formatDurationArabic(liveCalculation.netTimeDiffMinutes, true)}
                  {liveCalculation.netTimeDiffMinutes > 0
                    ? ' لصالح الموظف'
                    : liveCalculation.netTimeDiffMinutes < 0
                    ? ' على الموظف'
                    : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Multi-Employee Sheet */
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                التسجيل الجماعي ليوم{' '}
                <span className="font-mono-num text-teal-700">{selectedDate}</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                عدّل أي صف واحفظه بشكل مستقل، أو احفظ جميع الصفوف المعدّلة دفعة واحدة.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveAllDirtyRows}
                disabled={batchSavingAll}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{batchSavingAll ? 'جاري حفظ الكل...' : 'حفظ جميع التعديلات'}</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-y border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">الموظف</th>
                  <th className="px-3 py-3 whitespace-nowrap">الوردية</th>
                  <th className="px-3 py-3 whitespace-nowrap">الأساسي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحالة</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحضور الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الانصراف الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">تأخير</th>
                  <th className="px-3 py-3 whitespace-nowrap">إضافي</th>
                  <th className="px-3 py-3 whitespace-nowrap">العمل الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">صافي الفرق</th>
                  <th className="px-3 py-3 whitespace-nowrap">ملاحظات</th>
                  {canEdit && <th className="px-3 py-3 whitespace-nowrap">حفظ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeEmployees.map((emp) => {
                  const row = drafts[emp.id];
                  if (!row) return null;

                  const calc = calculateAttendanceMetrics({
                    scheduledCheckIn: row.scheduledCheckIn,
                    scheduledCheckOut: row.scheduledCheckOut,
                    actualCheckIn: row.status === 'present' ? row.actualCheckIn : '',
                    actualCheckOut: row.status === 'present' ? row.actualCheckOut : '',
                    status: row.status,
                  });

                  const canSaveRow =
                    row.status !== 'present' || Boolean(row.actualCheckIn);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        <div className="font-mono-num text-[11px] text-slate-500">
                          {emp.employeeCode} · {emp.department}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <select
                          value={row.scheduleId}
                          onChange={(e) => handleRowScheduleChange(emp, e.target.value)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-600"
                        >
                          {schedules.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 font-mono-num text-slate-700 whitespace-nowrap">
                        {row.scheduledCheckIn} – {row.scheduledCheckOut}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateRowDraft(emp.id, {
                              status: e.target.value as AttendanceStatus,
                            })
                          }
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-teal-600"
                        >
                          <option value="present">حاضر</option>
                          <option value="absent">غائب</option>
                          <option value="leave">إجازة</option>
                          <option value="rest">راحة أسبوعية</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <input
                          type="time"
                          disabled={row.status !== 'present'}
                          value={row.actualCheckIn}
                          onChange={(e) =>
                            updateRowDraft(emp.id, { actualCheckIn: e.target.value })
                          }
                          className="rounded-md border border-slate-200 px-2 py-1 font-mono-num text-xs outline-none focus:border-teal-600 disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <input
                          type="time"
                          disabled={row.status !== 'present'}
                          value={row.actualCheckOut}
                          onChange={(e) =>
                            updateRowDraft(emp.id, { actualCheckOut: e.target.value })
                          }
                          className="rounded-md border border-slate-200 px-2 py-1 font-mono-num text-xs outline-none focus:border-teal-600 disabled:bg-slate-100"
                        />
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono-num font-semibold whitespace-nowrap ${
                          calc.lateMinutes > 0 ? 'text-red-600' : 'text-slate-500'
                        }`}
                      >
                        {calc.lateMinutes} د
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono-num font-semibold whitespace-nowrap ${
                          calc.overtimeMinutes > 0 ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {calc.overtimeMinutes} د
                      </td>
                      <td className="px-3 py-2.5 font-mono-num font-semibold text-slate-800 whitespace-nowrap">
                        {formatDurationArabic(calc.actualWorkedMinutes)}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono-num font-bold whitespace-nowrap ${
                          calc.netTimeDiffMinutes > 0
                            ? 'text-emerald-700'
                            : calc.netTimeDiffMinutes < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatDurationArabic(calc.netTimeDiffMinutes, true)}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) =>
                            updateRowDraft(emp.id, { notes: e.target.value })
                          }
                          placeholder="ملاحظة..."
                          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-teal-600"
                        />
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!canSaveRow || row.saving}
                            onClick={() => saveSingleRowFromGrid(emp)}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                              row.savedNotice
                                ? 'bg-emerald-50 text-emerald-700'
                                : row.dirty
                                ? 'bg-teal-700 text-white hover:bg-teal-800'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            } disabled:opacity-40`}
                          >
                            {row.saving ? '...' : row.savedNotice ? 'تم الحفظ' : 'حفظ'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
