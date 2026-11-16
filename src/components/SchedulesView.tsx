import React, { useState } from 'react';
import { CalendarOff, Clock, Edit2, Moon, Plus, Trash2, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  computeScheduleMeta,
  formatDurationArabic,
  getTodayIsoDate,
} from '../engine/attendanceCalculator';
import {
  createHoliday,
  createWorkSchedule,
  deleteHoliday,
  deleteWorkSchedule,
  updateWorkSchedule,
} from '../services/firestoreService';
import type { Employee, Holiday, HolidayType, WorkSchedule } from '../types/attendance';
import { ConfirmModal } from './ConfirmModal';

interface SchedulesViewProps {
  schedules: WorkSchedule[];
  holidays: Holiday[];
  employees: Employee[];
  user: User;
  canEdit: boolean;
  isAdmin: boolean;
  allowedEmails: string[];
}

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  schedules,
  holidays,
  employees,
  user,
  canEdit,
  isAdmin,
  allowedEmails,
}) => {
  const [activeTab, setActiveTab] = useState<'schedules' | 'holidays'>('schedules');
  const [schedModalOpen, setSchedModalOpen] = useState(false);
  const [editingSched, setEditingSched] = useState<WorkSchedule | null>(null);
  const [schedForm, setSchedForm] = useState({
    name: '',
    checkInTime: '09:00',
    checkOutTime: '17:00',
    description: '',
    isActive: true,
  });

  const [holModalOpen, setHolModalOpen] = useState(false);
  const [holForm, setHolForm] = useState({
    date: getTodayIsoDate(),
    name: '',
    type: 'official_holiday' as HolidayType,
    appliesToAll: true,
    employeeId: '',
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteSchedTarget, setDeleteSchedTarget] = useState<WorkSchedule | null>(null);
  const [deleteHolTarget, setDeleteHolTarget] = useState<Holiday | null>(null);

  const previewMeta = computeScheduleMeta(
    schedForm.checkInTime || '09:00',
    schedForm.checkOutTime || '17:00'
  );

  const openCreateSched = () => {
    setEditingSched(null);
    setErrorMsg(null);
    setSchedForm({
      name: '',
      checkInTime: '09:00',
      checkOutTime: '17:00',
      description: '',
      isActive: true,
    });
    setSchedModalOpen(true);
  };

  const openEditSched = (s: WorkSchedule) => {
    setEditingSched(s);
    setErrorMsg(null);
    setSchedForm({
      name: s.name,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      description: s.description || '',
      isActive: s.isActive,
    });
    setSchedModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedForm.name.trim() || schedForm.name.trim().length < 2) {
      setErrorMsg('يرجى كتابة اسم جدول العمل.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingSched) {
        await updateWorkSchedule({
          scheduleId: editingSched.id,
          name: schedForm.name,
          checkInTime: schedForm.checkInTime,
          checkOutTime: schedForm.checkOutTime,
          description: schedForm.description,
          isActive: schedForm.isActive,
          user,
          allowedEmails,
        });
      } else {
        await createWorkSchedule({
          name: schedForm.name,
          checkInTime: schedForm.checkInTime,
          checkOutTime: schedForm.checkOutTime,
          description: schedForm.description,
          isActive: schedForm.isActive,
          user,
          allowedEmails,
        });
      }
      setSchedModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ جدول العمل');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holForm.name.trim() || holForm.name.trim().length < 2) {
      setErrorMsg('يرجى كتابة اسم الإجازة أو العطلة.');
      return;
    }
    if (!holForm.appliesToAll && !holForm.employeeId) {
      setErrorMsg('يرجى اختيار الموظف المعني بالإجازة.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await createHoliday({
        date: holForm.date,
        name: holForm.name,
        type: holForm.type,
        appliesToAll: holForm.appliesToAll,
        employeeId: holForm.appliesToAll ? '' : holForm.employeeId,
        notes: holForm.notes,
        user,
        allowedEmails,
      });
      setHolModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ الإجازة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Tabs & Primary Button */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('schedules')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'schedules'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            جداول ومواعيد العمل ({schedules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('holidays')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'holidays'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الإجازات الرسمية والراحات ({holidays.length})
          </button>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              if (activeTab === 'schedules') openCreateSched();
              else {
                setHolForm({
                  date: getTodayIsoDate(),
                  name: '',
                  type: 'official_holiday',
                  appliesToAll: true,
                  employeeId: employees[0]?.id || '',
                  notes: '',
                });
                setHolModalOpen(true);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>
              {activeTab === 'schedules' ? 'إنشاء جدول عمل جديد' : 'إضافة إجازة / عطلة'}
            </span>
          </button>
        )}
      </div>

      {activeTab === 'schedules' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{s.name}</h4>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{s.isActive ? 'مفعّل' : 'متوقف'}</span>
                      <span aria-hidden="true">·</span>
                      <span>المدة: {formatDurationArabic(s.durationMinutes)}</span>
                    </div>
                  </div>
                  {s.crossesMidnight ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                      <Moon className="h-3 w-3" />
                      يتجاوز منتصف الليل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                      <Clock className="h-3 w-3" />
                      وردية يومية
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div>
                    <div className="text-[11px] text-slate-500">موعد الحضور</div>
                    <div className="mt-0.5 font-mono-num text-base font-bold text-slate-900">
                      {s.checkInTime}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">موعد الانصراف</div>
                    <div className="mt-0.5 font-mono-num text-base font-bold text-slate-900">
                      {s.checkOutTime}
                    </div>
                  </div>
                </div>

                {s.description && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-600">{s.description}</p>
                )}
              </div>

              {canEdit && (
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => openEditSched(s)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>تعديل</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeleteSchedTarget(s)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {holidays.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <CalendarOff className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                لا توجد إجازات أو عطلات مسجلة
              </p>
              <p className="mt-1 text-xs text-slate-500">
                أضف الإجازات الرسمية أو الإجازات الخاصة بالموظفين لتسهيل متابعتها في التقارير.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">المناسبة / السبب</th>
                    <th className="px-4 py-3">النوع</th>
                    <th className="px-4 py-3">النطاق</th>
                    <th className="px-4 py-3">ملاحظات</th>
                    {isAdmin && <th className="px-4 py-3">حذف</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map((h) => {
                    const empName = h.appliesToAll
                      ? 'جميع الموظفين'
                      : employees.find((e) => e.id === h.employeeId)?.name || 'موظف محدد';
                    const typeLabel =
                      h.type === 'official_holiday'
                        ? 'إجازة رسمية'
                        : h.type === 'weekly_rest'
                        ? 'راحة أسبوعية'
                        : 'إجازة خاصة';
                    return (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono-num text-xs font-semibold text-slate-800">
                          {h.date}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{h.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{typeLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{empName}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{h.notes || '—'}</td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setDeleteHolTarget(h)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {schedModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingSched ? 'تعديل جدول العمل' : 'إنشاء جدول عمل جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setSchedModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  اسم الوردية / الجدول *
                </label>
                <input
                  type="text"
                  required
                  value={schedForm.name}
                  onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })}
                  placeholder="مثال: الوردية الليلية (10 مساءً - 6 صباحاً)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    بداية الدوام *
                  </label>
                  <input
                    type="time"
                    required
                    value={schedForm.checkInTime}
                    onChange={(e) => setSchedForm({ ...schedForm, checkInTime: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    نهاية الدوام *
                  </label>
                  <input
                    type="time"
                    required
                    value={schedForm.checkOutTime}
                    onChange={(e) => setSchedForm({ ...schedForm, checkOutTime: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                المدة المحسوبة:{' '}
                <span className="font-semibold text-slate-900">
                  {formatDurationArabic(previewMeta.durationMinutes)}
                </span>
                {previewMeta.crossesMidnight && (
                  <span className="mr-2 font-semibold text-indigo-700">
                    (وردية ليلية تتجاوز منتصف الليل)
                  </span>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  وصف مختصر (اختياري)
                </label>
                <input
                  type="text"
                  value={schedForm.description}
                  onChange={(e) => setSchedForm({ ...schedForm, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={schedForm.isActive}
                  onChange={(e) => setSchedForm({ ...schedForm, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>الجدول مفعّل ومتاح للاختيار</span>
              </label>

              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setSchedModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ الجدول'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Holiday Modal */}
      {holModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900">إضافة إجازة أو عطلة</h3>
              <button
                type="button"
                onClick={() => setHolModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    التاريخ *
                  </label>
                  <input
                    type="date"
                    required
                    value={holForm.date}
                    onChange={(e) => setHolForm({ ...holForm, date: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    النوع *
                  </label>
                  <select
                    value={holForm.type}
                    onChange={(e) =>
                      setHolForm({ ...holForm, type: e.target.value as HolidayType })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  >
                    <option value="official_holiday">إجازة رسمية</option>
                    <option value="special_leave">إجازة خاصة لموظف</option>
                    <option value="weekly_rest">راحة أسبوعية استثنائية</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  اسم الإجازة / المناسبة *
                </label>
                <input
                  type="text"
                  required
                  value={holForm.name}
                  onChange={(e) => setHolForm({ ...holForm, name: e.target.value })}
                  placeholder="مثال: إجازة عيد الفطر"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={holForm.appliesToAll}
                  onChange={(e) => setHolForm({ ...holForm, appliesToAll: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                <span>تطبق على جميع موظفي الصيدلية</span>
              </label>

              {!holForm.appliesToAll && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    اختر الموظف *
                  </label>
                  <select
                    value={holForm.employeeId}
                    onChange={(e) => setHolForm({ ...holForm, employeeId: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  value={holForm.notes}
                  onChange={(e) => setHolForm({ ...holForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                />
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setHolModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteSchedTarget)}
        title="حذف جدول العمل"
        message={`هل تريد حذف جدول العمل "${deleteSchedTarget?.name || ''}"؟ لن تتأثر سجلات الحضور السابقة المحفوظة تاريخياً.`}
        confirmLabel="حذف"
        loading={saving}
        onConfirm={async () => {
          if (!deleteSchedTarget) return;
          setSaving(true);
          try {
            await deleteWorkSchedule({ schedule: deleteSchedTarget, user, allowedEmails });
            setDeleteSchedTarget(null);
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => setDeleteSchedTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteHolTarget)}
        title="حذف الإجازة"
        message={`هل تريد حذف "${deleteHolTarget?.name || ''}" بتاريخ ${deleteHolTarget?.date || ''}؟`}
        confirmLabel="حذف"
        loading={saving}
        onConfirm={async () => {
          if (!deleteHolTarget) return;
          setSaving(true);
          try {
            await deleteHoliday({ holiday: deleteHolTarget, user, allowedEmails });
            setDeleteHolTarget(null);
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => setDeleteHolTarget(null)}
      />
    </div>
  );
};
