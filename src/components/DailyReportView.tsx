import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  formatDurationArabic,
  getStatusLabelArabic,
  getTodayIsoDate,
} from '../engine/attendanceCalculator';
import type { AttendanceRecord } from '../types/attendance';
import { exportDailyReportToExcel } from '../utils/excelExport';

interface DailyReportViewProps {
  records: AttendanceRecord[];
  departments: string[];
}

export const DailyReportView: React.FC<DailyReportViewProps> = ({
  records,
  departments,
}) => {
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const dayRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (r.date !== selectedDate) return false;
        if (departmentFilter !== 'all' && r.department !== departmentFilter) return false;
        return true;
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [records, selectedDate, departmentFilter]);

  const totals = useMemo(() => {
    return dayRecords.reduce(
      (acc, r) => {
        acc.late += r.lateMinutes;
        acc.earlyArrival += r.earlyArrivalMinutes;
        acc.earlyLeave += r.earlyLeaveMinutes;
        acc.overtime += r.overtimeMinutes;
        acc.worked += r.actualWorkedMinutes;
        acc.net += r.netTimeDiffMinutes;
        return acc;
      },
      { late: 0, earlyArrival: 0, earlyLeave: 0, overtime: 0, worked: 0, net: 0 }
    );
  }, [dayRecords]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">التقرير اليومي للحضور والانصراف</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            عرض تفصيلي لجميع الموظفين مع إظهار التأخير والإضافي وصافي الفرق بشكل مستقل
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-xs font-semibold outline-none focus:border-teal-600"
          />
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
          <button
            type="button"
            disabled={dayRecords.length === 0}
            onClick={() => exportDailyReportToExcel(dayRecords, selectedDate)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {dayRecords.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-800">
              لا توجد سجلات حضور مسجلة بتاريخ {selectedDate}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              اختر تاريخاً آخر أو قم بتسجيل الحضور من شاشة التسجيل اليومي.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">اسم الموظف</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحضور الأساسي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحضور الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">مقدار التأخير</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحضور المبكر</th>
                  <th className="px-3 py-3 whitespace-nowrap">الانصراف الأساسي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الانصراف الفعلي</th>
                  <th className="px-3 py-3 whitespace-nowrap">الانصراف المبكر</th>
                  <th className="px-3 py-3 whitespace-nowrap">الساعات الإضافية</th>
                  <th className="px-3 py-3 whitespace-nowrap">ساعات العمل الفعلية</th>
                  <th className="px-3 py-3 whitespace-nowrap">صافي فرق الوقت</th>
                  <th className="px-3 py-3 whitespace-nowrap">حالة اليوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dayRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{r.employeeName}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.department} · {r.scheduleName}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono-num text-slate-700 whitespace-nowrap">
                      {r.scheduledCheckIn}
                    </td>
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {r.status === 'present' ? r.actualCheckIn || '—' : '—'}
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
                    <td className="px-3 py-3 font-mono-num text-slate-700 whitespace-nowrap">
                      {r.scheduledCheckOut}
                    </td>
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {r.status === 'present' ? r.actualCheckOut || '—' : '—'}
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
                    <td className="px-3 py-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
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
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td className="px-3 py-3" colSpan={3}>
                    الإجمالي ({dayRecords.length} موظف)
                  </td>
                  <td className="px-3 py-3 font-mono-num text-red-600">
                    {totals.late} د
                  </td>
                  <td className="px-3 py-3 font-mono-num text-teal-700">
                    {totals.earlyArrival} د
                  </td>
                  <td className="px-3 py-3" colSpan={2} />
                  <td className="px-3 py-3 font-mono-num text-amber-700">
                    {totals.earlyLeave} د
                  </td>
                  <td className="px-3 py-3 font-mono-num text-emerald-700">
                    {totals.overtime} د
                  </td>
                  <td className="px-3 py-3 font-mono-num">
                    {formatDurationArabic(totals.worked)}
                  </td>
                  <td
                    className={`px-3 py-3 font-mono-num ${
                      totals.net > 0
                        ? 'text-emerald-700'
                        : totals.net < 0
                        ? 'text-red-600'
                        : 'text-slate-700'
                    }`}
                  >
                    {formatDurationArabic(totals.net, true)}
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
