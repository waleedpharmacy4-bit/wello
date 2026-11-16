import React, { useMemo, useState } from 'react';
import { Download, Edit2, Search, Trash2, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  calculateAttendanceMetrics,
  formatDurationArabic,
  getStatusLabelArabic,
} from '../engine/attendanceCalculator';
import {
  deleteAttendanceRecord,
  saveAttendanceRecord,
} from '../services/firestoreService';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
} from '../types/attendance';
import { exportAttendanceLogToExcel } from '../utils/excelExport';
import { ConfirmModal } from './ConfirmModal';

interface AttendanceLogViewProps {
  records: AttendanceRecord[];
  employees: Employee[];
  departments: string[];
  user: User;
  canEdit: boolean;
  isAdmin: boolean;
  allowedEmails: string[];
}

export const AttendanceLogView: React.FC<AttendanceLogViewProps> = ({
  records,
  employees,
  departments,
  user,
  canEdit,
  isAdmin,
  allowedEmails,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');

  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('present');
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (departmentFilter !== 'all' && r.department !== departmentFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (employeeFilter !== 'all' && r.employeeId !== employeeFilter) return false;
      if (
        q &&
        !r.employeeName.toLowerCase().includes(q) &&
        !r.employeeCode.toLowerCase().includes(q) &&
        !r.scheduleName.toLowerCase().includes(q) &&
        !(r.notes || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    records,
    searchQuery,
    dateFrom,
    dateTo,
    departmentFilter,
    statusFilter,
    employeeFilter,
  ]);

  const openEdit = (r: AttendanceRecord) => {
    setEditingRecord(r);
    setEditStatus(r.status);
    setEditIn(r.actualCheckIn);
    setEditOut(r.actualCheckOut);
    setEditNotes(r.notes || '');
  };

  const editPreview = useMemo(() => {
    if (!editingRecord) return null;
    return calculateAttendanceMetrics({
      scheduledCheckIn: editingRecord.scheduledCheckIn,
      scheduledCheckOut: editingRecord.scheduledCheckOut,
      actualCheckIn: editStatus === 'present' ? editIn : '',
      actualCheckOut: editStatus === 'present' ? editOut : '',
      status: editStatus,
    });
  }, [editingRecord, editStatus, editIn, editOut]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const emp: Employee = employees.find((item) => item.id === editingRecord.employeeId) || {
      id: editingRecord.employeeId,
      employeeCode: editingRecord.employeeCode,
      name: editingRecord.employeeName,
      department: editingRecord.department,
      defaultScheduleId: editingRecord.scheduleId,
      defaultCheckIn: editingRecord.scheduledCheckIn,
      defaultCheckOut: editingRecord.scheduledCheckOut,
      workDays: [],
      restDays: [],
      startDate: editingRecord.date,
      status: 'active',
      ownerUid: editingRecord.ownerUid,
      allowedEmails: editingRecord.allowedEmails,
    };

    setSaving(true);
    try {
      await saveAttendanceRecord({
        date: editingRecord.date,
        employee: emp,
        scheduleId: editingRecord.scheduleId,
        scheduleName: editingRecord.scheduleName,
        scheduledCheckIn: editingRecord.scheduledCheckIn,
        scheduledCheckOut: editingRecord.scheduledCheckOut,
        actualCheckIn: editIn,
        actualCheckOut: editOut,
        status: editStatus,
        notes: editNotes,
        user,
        allowedEmails,
      });
      setEditingRecord(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">سجل الحضور والانصراف الكامل</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            عدد السجلات المطابقة:{' '}
            <span className="font-mono-num font-semibold text-slate-900">
              {filteredRecords.length}
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={filteredRecords.length === 0}
          onClick={() => exportAttendanceLogToExcel(filteredRecords)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4 text-teal-700" />
          <span>تصدير إلى Excel</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الرقم الوظيفي، الملاحظات..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-xs outline-none focus:border-teal-600 focus:bg-white"
          />
        </div>

        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-600"
        >
          <option value="all">جميع الموظفين</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-600"
        >
          <option value="all">جميع الأقسام</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="من تاريخ"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-xs outline-none focus:border-teal-600"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="إلى تاريخ"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-xs outline-none focus:border-teal-600"
        />

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 sm:col-span-2 lg:col-span-6">
          {(['all', 'present', 'absent', 'leave', 'rest'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'all' ? 'كل الحالات' : getStatusLabelArabic(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Records Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredRecords.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-800">لا توجد سجلات حضور مطابقة</p>
            <p className="mt-1 text-xs text-slate-500">
              ستظهر جميع السجلات المحفوظة هنا فور تسجيلها من شاشة "التسجيل اليومي".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">التاريخ</th>
                  <th className="px-3 py-3 whitespace-nowrap">الموظف</th>
                  <th className="px-3 py-3 whitespace-nowrap">الوردية</th>
                  <th className="px-3 py-3 whitespace-nowrap">الأساسي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">التأخير</th>
                  <th className="px-3 py-3 whitespace-nowrap">حضور مبكر</th>
                  <th className="px-3 py-3 whitespace-nowrap">انصراف مبكر</th>
                  <th className="px-3 py-3 whitespace-nowrap">إضافي</th>
                  <th className="px-3 py-3 whitespace-nowrap">العمل الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">صافي الفرق</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحالة</th>
                  <th className="px-3 py-3 whitespace-nowrap">المُعدِّل</th>
                  {(canEdit || isAdmin) && <th className="px-3 py-3 whitespace-nowrap">إجراء</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-800 whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{r.employeeName}</div>
                      <div className="font-mono-num text-[11px] text-slate-500">
                        {r.employeeCode} · {r.department}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                      {r.scheduleName}
                    </td>
                    <td className="px-3 py-3 font-mono-num text-slate-600 whitespace-nowrap">
                      {r.scheduledCheckIn} – {r.scheduledCheckOut}
                    </td>
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {r.status === 'present'
                        ? `${r.actualCheckIn || '—'} – ${r.actualCheckOut || '—'}`
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-3 font-mono-num font-semibold whitespace-nowrap ${
                        r.lateMinutes > 0 ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      {r.lateMinutes} د
                    </td>
                    <td className="px-3 py-3 font-mono-num text-teal-700 whitespace-nowrap">
                      {r.earlyArrivalMinutes} د
                    </td>
                    <td
                      className={`px-3 py-3 font-mono-num whitespace-nowrap ${
                        r.earlyLeaveMinutes > 0 ? 'font-semibold text-amber-600' : 'text-slate-500'
                      }`}
                    >
                      {r.earlyLeaveMinutes} د
                    </td>
                    <td
                      className={`px-3 py-3 font-mono-num font-semibold whitespace-nowrap ${
                        r.overtimeMinutes > 0 ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {r.overtimeMinutes} د
                    </td>
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-800 whitespace-nowrap">
                      {formatDurationArabic(r.actualWorkedMinutes)}
                    </td>
                    <td
                      className={`px-3 py-3 font-mono-num font-bold whitespace-nowrap ${
                        r.netTimeDiffMinutes > 0
                          ? 'text-emerald-700'
                          : r.netTimeDiffMinutes < 0
                          ? 'text-red-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {formatDurationArabic(r.netTimeDiffMinutes, true)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 font-semibold ${
                          r.status === 'present'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.status === 'absent'
                            ? 'bg-red-50 text-red-700'
                            : r.status === 'leave'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {getStatusLabelArabic(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                      {r.updatedByName || '—'}
                    </td>
                    {(canEdit || isAdmin) && (
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              title="تعديل السجل"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              title="حذف السجل"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Record Modal */}
      {editingRecord && editPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  تعديل سجل {editingRecord.employeeName}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  التاريخ: {editingRecord.date} · الأساسي التاريخي:{' '}
                  {editingRecord.scheduledCheckIn} – {editingRecord.scheduledCheckOut}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  حالة اليوم
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                >
                  <option value="present">حاضر</option>
                  <option value="absent">غائب</option>
                  <option value="leave">إجازة</option>
                  <option value="rest">راحة أسبوعية</option>
                </select>
              </div>

              {editStatus === 'present' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      الحضور الفعلي
                    </label>
                    <input
                      type="time"
                      required
                      value={editIn}
                      onChange={(e) => setEditIn(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                      الانصراف الفعلي
                    </label>
                    <input
                      type="time"
                      value={editOut}
                      onChange={(e) => setEditOut(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs">
                <div>
                  <div className="text-slate-500">التأخير</div>
                  <div className="font-mono-num font-bold text-red-600">
                    {editPreview.lateMinutes} د
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">الإضافي</div>
                  <div className="font-mono-num font-bold text-emerald-700">
                    {editPreview.overtimeMinutes} د
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">صافي الفرق</div>
                  <div className="font-mono-num font-bold text-slate-900">
                    {formatDurationArabic(editPreview.netTimeDiffMinutes, true)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ التعديل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف سجل الحضور"
        message={`هل أنت متأكد من حذف سجل "${deleteTarget?.employeeName || ''}" بتاريخ ${deleteTarget?.date || ''}؟`}
        confirmLabel="حذف"
        loading={saving}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setSaving(true);
          try {
            await deleteAttendanceRecord({ record: deleteTarget, user, allowedEmails });
            setDeleteTarget(null);
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
