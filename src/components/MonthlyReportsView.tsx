import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import {
  ARABIC_MONTHS,
  buildEmployeeComparison,
  buildMonthlyEmployeeSummary,
  formatDurationArabic,
  getStatusLabelArabic,
} from '../engine/attendanceCalculator';
import type {
  AttendanceRecord,
  ComparisonSortBy,
  Employee,
} from '../types/attendance';
import {
  exportComparisonReportToExcel,
  exportMonthlyReportToExcel,
} from '../utils/excelExport';

interface MonthlyReportsViewProps {
  employees: Employee[];
  records: AttendanceRecord[];
  departments: string[];
}

const SORT_OPTIONS: { value: ComparisonSortBy; label: string }[] = [
  { value: 'least_late', label: 'الأقل تأخيراً' },
  { value: 'most_late', label: 'الأكثر تأخيراً' },
  { value: 'most_overtime', label: 'الأعلى في الساعات الإضافية' },
  { value: 'most_worked', label: 'الأعلى في ساعات العمل' },
  { value: 'least_punctual', label: 'الأقل في الالتزام بمواعيد الحضور' },
];

export const MonthlyReportsView: React.FC<MonthlyReportsViewProps> = ({
  employees,
  records,
  departments,
}) => {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'monthly' | 'comparison'>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<ComparisonSortBy>('least_late');
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const availableYears = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    for (const r of records) {
      const y = Number(r.date.slice(0, 4));
      if (!Number.isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [records, now]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (departmentFilter !== 'all' && e.department !== departmentFilter) return false;
      if (employeeFilter !== 'all' && e.id !== employeeFilter) return false;
      return true;
    });
  }, [employees, departmentFilter, employeeFilter]);

  const monthRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(monthPrefix)),
    [records, monthPrefix]
  );

  const monthlySummaries = useMemo(
    () =>
      filteredEmployees.map((emp) => buildMonthlyEmployeeSummary(emp, monthRecords)),
    [filteredEmployees, monthRecords]
  );

  const comparisonRows = useMemo(
    () => buildEmployeeComparison(filteredEmployees, monthRecords, sortBy),
    [filteredEmployees, monthRecords, sortBy]
  );

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.label || '';

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'monthly'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            التقرير الشهري لكل موظف
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comparison')}
            className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تقرير مقارنة الموظفين
          </button>
        </div>

        <button
          type="button"
          disabled={
            activeTab === 'monthly'
              ? monthlySummaries.length === 0
              : comparisonRows.length === 0
          }
          onClick={() => {
            if (activeTab === 'monthly') {
              exportMonthlyReportToExcel(monthlySummaries, year, month);
            } else {
              exportComparisonReportToExcel(
                comparisonRows,
                year,
                month,
                currentSortLabel
              );
            }
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>تصدير التقرير إلى Excel</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium outline-none focus:border-teal-600"
        >
          {ARABIC_MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              شهر: {m.label}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-num text-xs font-medium outline-none focus:border-teal-600"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>
              سنة: {y}
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

        {activeTab === 'comparison' && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ComparisonSortBy)}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 outline-none focus:border-teal-600"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                الترتيب: {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Report Content */}
      {activeTab === 'monthly' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {monthlySummaries.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-600">
              لا يوجد موظفون مطابقون للفلاتر المحددة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-3 whitespace-nowrap">الموظف</th>
                    <th className="px-3 py-3 whitespace-nowrap">الحضور</th>
                    <th className="px-3 py-3 whitespace-nowrap">الغياب</th>
                    <th className="px-3 py-3 whitespace-nowrap">الإجازات</th>
                    <th className="px-3 py-3 whitespace-nowrap">التأخير (د / س)</th>
                    <th className="px-3 py-3 whitespace-nowrap">الانصراف المبكر</th>
                    <th className="px-3 py-3 whitespace-nowrap">الساعات الإضافية</th>
                    <th className="px-3 py-3 whitespace-nowrap">العمل الفعلي</th>
                    <th className="px-3 py-3 whitespace-nowrap">صافي فرق الوقت</th>
                    <th className="px-3 py-3 whitespace-nowrap">تفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlySummaries.map((s) => {
                    const isExpanded = expandedEmpId === s.employeeId;
                    const empDailyRows = monthRecords
                      .filter((r) => r.employeeId === s.employeeId)
                      .sort((a, b) => a.date.localeCompare(b.date));

                    return (
                      <React.Fragment key={s.employeeId}>
                        <tr className="hover:bg-slate-50/70">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {s.employeeName}
                            </div>
                            <div className="font-mono-num text-[11px] text-slate-500">
                              {s.employeeCode} · {s.department}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono-num font-semibold text-emerald-700">
                            {s.presentDays}
                          </td>
                          <td className="px-3 py-3 font-mono-num font-semibold text-red-600">
                            {s.absentDays}
                          </td>
                          <td className="px-3 py-3 font-mono-num text-amber-700">
                            {s.leaveDays}
                          </td>
                          <td
                            className={`px-3 py-3 font-mono-num whitespace-nowrap ${
                              s.totalLateMinutes > 0
                                ? 'font-semibold text-red-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {s.totalLateMinutes} د ({formatDurationArabic(s.totalLateMinutes)})
                          </td>
                          <td
                            className={`px-3 py-3 font-mono-num whitespace-nowrap ${
                              s.totalEarlyLeaveMinutes > 0
                                ? 'font-semibold text-amber-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatDurationArabic(s.totalEarlyLeaveMinutes)}
                          </td>
                          <td
                            className={`px-3 py-3 font-mono-num whitespace-nowrap ${
                              s.totalOvertimeMinutes > 0
                                ? 'font-semibold text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatDurationArabic(s.totalOvertimeMinutes)}
                          </td>
                          <td className="px-3 py-3 font-mono-num font-bold text-slate-900 whitespace-nowrap">
                            {formatDurationArabic(s.totalActualWorkedMinutes)}
                          </td>
                          <td
                            className={`px-3 py-3 font-mono-num font-bold whitespace-nowrap ${
                              s.totalNetTimeDiffMinutes > 0
                                ? 'text-emerald-700'
                                : s.totalNetTimeDiffMinutes < 0
                                ? 'text-red-600'
                                : 'text-slate-600'
                            }`}
                          >
                            {formatDurationArabic(s.totalNetTimeDiffMinutes, true)}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedEmpId(isExpanded ? null : s.employeeId)
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                  <span>إخفاء</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  <span>السجلات ({empDailyRows.length})</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-slate-50 px-6 py-4">
                              {empDailyRows.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  لا توجد سجلات حضور مسجلة لهذا الموظف في الشهر المحدد.
                                </p>
                              ) : (
                                <table className="w-full text-right text-[11px]">
                                  <thead className="border-b border-slate-200 text-slate-500">
                                    <tr>
                                      <th className="py-1.5">التاريخ</th>
                                      <th className="py-1.5">الوردية</th>
                                      <th className="py-1.5">الأساسي</th>
                                      <th className="py-1.5">الفعلي</th>
                                      <th className="py-1.5">التأخير</th>
                                      <th className="py-1.5">الإضافي</th>
                                      <th className="py-1.5">العمل</th>
                                      <th className="py-1.5">الصافي</th>
                                      <th className="py-1.5">الحالة</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/60">
                                    {empDailyRows.map((r) => (
                                      <tr key={r.id}>
                                        <td className="py-1.5 font-mono-num font-semibold">
                                          {r.date}
                                        </td>
                                        <td className="py-1.5">{r.scheduleName}</td>
                                        <td className="py-1.5 font-mono-num">
                                          {r.scheduledCheckIn} – {r.scheduledCheckOut}
                                        </td>
                                        <td className="py-1.5 font-mono-num">
                                          {r.status === 'present'
                                            ? `${r.actualCheckIn || '—'} – ${r.actualCheckOut || '—'}`
                                            : '—'}
                                        </td>
                                        <td className="py-1.5 font-mono-num text-red-600">
                                          {r.lateMinutes} د
                                        </td>
                                        <td className="py-1.5 font-mono-num text-emerald-700">
                                          {r.overtimeMinutes} د
                                        </td>
                                        <td className="py-1.5 font-mono-num">
                                          {formatDurationArabic(r.actualWorkedMinutes)}
                                        </td>
                                        <td className="py-1.5 font-mono-num font-bold">
                                          {formatDurationArabic(r.netTimeDiffMinutes, true)}
                                        </td>
                                        <td className="py-1.5">
                                          {getStatusLabelArabic(r.status)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Comparison Report */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-700">
            مرتّب حسب: <span className="text-teal-700">{currentSortLabel}</span>
          </div>
          {comparisonRows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-600">
              لا توجد بيانات للمقارنة ضمن الفلاتر المحددة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">الترتيب</th>
                    <th className="px-4 py-3 whitespace-nowrap">الموظف</th>
                    <th className="px-4 py-3 whitespace-nowrap">القسم</th>
                    <th className="px-4 py-3 whitespace-nowrap">أيام الحضور</th>
                    <th className="px-4 py-3 whitespace-nowrap">أيام الغياب</th>
                    <th className="px-4 py-3 whitespace-nowrap">نسبة الالتزام</th>
                    <th className="px-4 py-3 whitespace-nowrap">إجمالي التأخير</th>
                    <th className="px-4 py-3 whitespace-nowrap">إجمالي الإضافي</th>
                    <th className="px-4 py-3 whitespace-nowrap">ساعات العمل</th>
                    <th className="px-4 py-3 whitespace-nowrap">صافي الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row, idx) => (
                    <tr key={row.employeeId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono-num font-bold text-slate-900">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {row.employeeName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {row.department}
                      </td>
                      <td className="px-4 py-3 font-mono-num">{row.presentDays}</td>
                      <td className="px-4 py-3 font-mono-num text-red-600">
                        {row.absentDays}
                      </td>
                      <td className="px-4 py-3 font-mono-num font-semibold text-teal-700">
                        {row.punctualityRate}%
                      </td>
                      <td className="px-4 py-3 font-mono-num text-red-600 whitespace-nowrap">
                        {formatDurationArabic(row.totalLateMinutes)}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-emerald-700 whitespace-nowrap">
                        {formatDurationArabic(row.totalOvertimeMinutes)}
                      </td>
                      <td className="px-4 py-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                        {formatDurationArabic(row.totalActualWorkedMinutes)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono-num font-bold whitespace-nowrap ${
                          row.totalNetTimeDiffMinutes > 0
                            ? 'text-emerald-700'
                            : row.totalNetTimeDiffMinutes < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatDurationArabic(row.totalNetTimeDiffMinutes, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
