import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2, UserCheck, UserX, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { ARABIC_WEEKDAYS, getTodayIsoDate } from '../engine/attendanceCalculator';
import {
  createEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
  updateEmployee,
} from '../services/firestoreService';
import type { Employee, EmployeeStatus, WorkSchedule } from '../types/attendance';
import { ConfirmModal } from './ConfirmModal';

interface EmployeesViewProps {
  employees: Employee[];
  schedules: WorkSchedule[];
  departments: string[];
  user: User;
  canEdit: boolean;
  isAdmin: boolean;
  allowedEmails: string[];
}

interface EmployeeFormState {
  name: string;
  department: string;
  defaultScheduleId: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  workDays: number[];
  restDays: number[];
  hourlyRate: string;
  startDate: string;
  status: EmployeeStatus;
}

const DEFAULT_WORK_DAYS = [6, 0, 1, 2, 3, 4]; // السبت - الخميس
const DEFAULT_REST_DAYS = [5]; // الجمعة

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  schedules,
  departments,
  user,
  canEdit,
  isAdmin,
  allowedEmails,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const activeSchedules = useMemo(
    () => schedules.filter((s) => s.isActive),
    [schedules]
  );

  const defaultSched = activeSchedules[0] || schedules[0];

  const [form, setForm] = useState<EmployeeFormState>({
    name: '',
    department: departments[0] || 'صيدلي',
    defaultScheduleId: defaultSched?.id || '',
    defaultCheckIn: defaultSched?.checkInTime || '09:00',
    defaultCheckOut: defaultSched?.checkOutTime || '17:00',
    workDays: DEFAULT_WORK_DAYS,
    restDays: DEFAULT_REST_DAYS,
    hourlyRate: '',
    startDate: getTodayIsoDate(),
    status: 'active',
  });

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
      if (
        q &&
        !emp.name.toLowerCase().includes(q) &&
        !emp.employeeCode.toLowerCase().includes(q) &&
        !emp.department.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [employees, searchQuery, departmentFilter, statusFilter]);

  const scheduleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schedules) {
      map.set(s.id, s.name);
    }
    return map;
  }, [schedules]);

  const openCreateModal = () => {
    const firstSched = activeSchedules[0] || schedules[0];
    setEditingEmployee(null);
    setFormError(null);
    setForm({
      name: '',
      department: departments[0] || 'صيدلي',
      defaultScheduleId: firstSched?.id || '',
      defaultCheckIn: firstSched?.checkInTime || '09:00',
      defaultCheckOut: firstSched?.checkOutTime || '17:00',
      workDays: DEFAULT_WORK_DAYS,
      restDays: DEFAULT_REST_DAYS,
      hourlyRate: '',
      startDate: getTodayIsoDate(),
      status: 'active',
    });
    setModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormError(null);
    setForm({
      name: emp.name,
      department: emp.department,
      defaultScheduleId: emp.defaultScheduleId,
      defaultCheckIn: emp.defaultCheckIn,
      defaultCheckOut: emp.defaultCheckOut,
      workDays: emp.workDays || DEFAULT_WORK_DAYS,
      restDays: emp.restDays || DEFAULT_REST_DAYS,
      hourlyRate: emp.hourlyRate !== undefined ? String(emp.hourlyRate) : '',
      startDate: emp.startDate,
      status: emp.status,
    });
    setModalOpen(true);
  };

  const handleScheduleSelect = (scheduleId: string) => {
    const found = schedules.find((s) => s.id === scheduleId);
    setForm((prev) => ({
      ...prev,
      defaultScheduleId: scheduleId,
      defaultCheckIn: found ? found.checkInTime : prev.defaultCheckIn,
      defaultCheckOut: found ? found.checkOutTime : prev.defaultCheckOut,
    }));
  };

  const toggleDayAssignment = (dayIndex: number, targetType: 'work' | 'rest') => {
    setForm((prev) => {
      if (targetType === 'work') {
        const exists = prev.workDays.includes(dayIndex);
        const nextWork = exists
          ? prev.workDays.filter((d) => d !== dayIndex)
          : [...prev.workDays, dayIndex];
        const nextRest = exists
          ? Array.from(new Set([...prev.restDays, dayIndex]))
          : prev.restDays.filter((d) => d !== dayIndex);
        return { ...prev, workDays: nextWork, restDays: nextRest };
      } else {
        const exists = prev.restDays.includes(dayIndex);
        const nextRest = exists
          ? prev.restDays.filter((d) => d !== dayIndex)
          : [...prev.restDays, dayIndex];
        const nextWork = exists
          ? Array.from(new Set([...prev.workDays, dayIndex]))
          : prev.workDays.filter((d) => d !== dayIndex);
        return { ...prev, workDays: nextWork, restDays: nextRest };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.name.trim().length < 2) {
      setFormError('يرجى إدخال اسم الموظف بشكل صحيح (حرفان على الأقل).');
      return;
    }
    if (!form.defaultScheduleId) {
      setFormError('يرجى اختيار جدول العمل الأساسي للموظف (أنشئ جدول عمل أولاً إن لم يوجد).');
      return;
    }

    const parsedRate =
      form.hourlyRate.trim() !== '' ? Number(form.hourlyRate.trim()) : undefined;
    if (parsedRate !== undefined && (Number.isNaN(parsedRate) || parsedRate < 0)) {
      setFormError('سعر الساعة يجب أن يكون رقماً موجباً أو يُترك فارغاً.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingEmployee) {
        await updateEmployee({
          employeeId: editingEmployee.id,
          name: form.name,
          department: form.department,
          defaultScheduleId: form.defaultScheduleId,
          defaultCheckIn: form.defaultCheckIn,
          defaultCheckOut: form.defaultCheckOut,
          workDays: form.workDays,
          restDays: form.restDays,
          hourlyRate: parsedRate,
          startDate: form.startDate,
          status: form.status,
          user,
          allowedEmails,
        });
      } else {
        await createEmployee({
          name: form.name,
          department: form.department,
          defaultScheduleId: form.defaultScheduleId,
          defaultCheckIn: form.defaultCheckIn,
          defaultCheckOut: form.defaultCheckOut,
          workDays: form.workDays,
          restDays: form.restDays,
          hourlyRate: parsedRate,
          startDate: form.startDate,
          status: form.status,
          user,
          allowedEmails,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر حفظ بيانات الموظف');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    await toggleEmployeeStatus({ employee: emp, user, allowedEmails });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteEmployee({ employee: deleteTarget, user, allowedEmails });
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">دليل الموظفين</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            إجمالي الموظفين: <span className="font-mono-num font-semibold">{employees.length}</span>{' '}
            · النشطون:{' '}
            <span className="font-mono-num font-semibold text-teal-700">
              {employees.filter((e) => e.status === 'active').length}
            </span>
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة موظف جديد</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الرقم الوظيفي أو القسم..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:bg-white"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:bg-white"
        >
          <option value="all">جميع الأقسام والوظائف</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'all' ? 'الكل' : st === 'active' ? 'نشط' : 'موقوف'}
            </button>
          ))}
        </div>
      </div>

      {/* Employees Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-800">
              {employees.length === 0
                ? 'لا يوجد موظفون مسجلون حتى الآن'
                : 'لا توجد نتائج مطابقة للبحث'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {employees.length === 0
                ? 'ابدأ بإضافة موظفي الصيدلية وتحديد جداول العمل وأيام الراحة لكل موظف.'
                : 'جرّب تغيير كلمات البحث أو إزالة الفلاتر.'}
            </p>
            {employees.length === 0 && canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                إضافة أول موظف
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">الرقم الوظيفي</th>
                  <th className="px-4 py-3 whitespace-nowrap">اسم الموظف</th>
                  <th className="px-4 py-3 whitespace-nowrap">القسم / الوظيفة</th>
                  <th className="px-4 py-3 whitespace-nowrap">الوردية الأساسية</th>
                  <th className="px-4 py-3 whitespace-nowrap">الموعد الأساسي</th>
                  <th className="px-4 py-3 whitespace-nowrap">أيام الراحة</th>
                  <th className="px-4 py-3 whitespace-nowrap">تاريخ البداية</th>
                  <th className="px-4 py-3 whitespace-nowrap">الحالة</th>
                  {canEdit && <th className="px-4 py-3 whitespace-nowrap">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const restLabels = (emp.restDays || [])
                    .map((idx) => ARABIC_WEEKDAYS.find((w) => w.index === idx)?.short)
                    .filter(Boolean)
                    .join('، ');
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono-num text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {emp.employeeCode}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {emp.name}
                        {emp.hourlyRate !== undefined && (
                          <div className="mt-0.5 font-mono-num text-xs font-normal text-slate-500">
                            سعر الساعة: {emp.hourlyRate}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {emp.department}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {scheduleNameMap.get(emp.defaultScheduleId) || 'جدول مخصص'}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs text-slate-800 whitespace-nowrap">
                        {emp.defaultCheckIn} – {emp.defaultCheckOut}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {restLabels || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                        {emp.startDate}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                            emp.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {emp.status === 'active' ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(emp)}
                              title="تعديل بيانات وجدول الموظف"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(emp)}
                              title={
                                emp.status === 'active'
                                  ? 'إيقاف الموظف (تحتفظ السجلات السابقة)'
                                  : 'إعادة تنشيط الموظف'
                              }
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-700"
                            >
                              {emp.status === 'active' ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )}
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(emp)}
                                title="حذف نهائي"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
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

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingEmployee
                    ? `تعديل بيانات الموظف (${editingEmployee.employeeCode})`
                    : 'إضافة موظف جديد'}
                </h3>
                {editingEmployee && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    ملاحظة: تعديل مواعيد العمل الأساسية يطبق على التسجيلات الجديدة فقط ولا يغيّر السجلات السابقة.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    اسم الموظف الكامل *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: د. أحمد محمد علي"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    القسم / الوظيفة *
                  </label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    جدول العمل الأساسي *
                  </label>
                  <select
                    value={form.defaultScheduleId}
                    onChange={(e) => handleScheduleSelect(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
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
                    موعد الحضور الأساسي *
                  </label>
                  <input
                    type="time"
                    required
                    value={form.defaultCheckIn}
                    onChange={(e) => setForm({ ...form, defaultCheckIn: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    موعد الانصراف الأساسي *
                  </label>
                  <input
                    type="time"
                    required
                    value={form.defaultCheckOut}
                    onChange={(e) => setForm({ ...form, defaultCheckOut: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    تاريخ بداية العمل *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    سعر ساعة العمل (اختياري)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.hourlyRate}
                    onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                    placeholder="اختياري للحسابات المالية"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              {/* Work Days & Rest Days */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-xs font-semibold text-slate-800">
                  توزيع أيام العمل وأيام الراحة الأسبوعية
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                  {ARABIC_WEEKDAYS.map((day) => {
                    const isWork = form.workDays.includes(day.index);
                    return (
                      <button
                        key={day.index}
                        type="button"
                        onClick={() =>
                          toggleDayAssignment(day.index, isWork ? 'rest' : 'work')
                        }
                        className={`rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
                          isWork
                            ? 'border-teal-600 bg-teal-50 text-teal-800 font-semibold'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <div>{day.label}</div>
                        <div className="mt-0.5 text-[11px]">
                          {isWork ? 'عمل' : 'راحة'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  حالة الموظف
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: 'active' })}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                      form.status === 'active'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    نشط
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: 'inactive' })}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                      form.status === 'inactive'
                        ? 'border-slate-600 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    غير نشط (موقوف)
                  </button>
                </div>
              </div>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : editingEmployee ? 'حفظ التعديلات' : 'حفظ الموظف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف ملف الموظف"
        message={`هل أنت متأكد من حذف ملف الموظف "${deleteTarget?.name || ''}"؟ إذا أردت الاحتفاظ بسجلاته وإيقافه عن العمل، يُفضل تغيير حالته إلى "غير نشط" بدلاً من الحذف.`}
        confirmLabel="حذف نهائي"
        loading={saving}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
