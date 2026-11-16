import React, { useMemo, useState } from 'react';
import {
  ARABIC_MONTHS,
  buildDailyTrendSeries,
  formatDurationArabic,
  getStatusLabelArabic,
  getTodayIsoDate,
} from '../engine/attendanceCalculator';
import type {
  AttendanceRecord,
  AuditLog,
  DailyTrendPoint,
  Employee,
} from '../types/attendance';
import type { NavSectionId } from './Layout';

interface DashboardViewProps {
  employees: Employee[];
  records: AttendanceRecord[];
  auditLogs: AuditLog[];
  onNavigate: (section: NavSectionId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  employees,
  records,
  auditLogs,
  onNavigate,
}) => {
  const todayIso = getTodayIsoDate();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const now = new Date();
  const [chartYear, setChartYear] = useState(now.getFullYear());
  const [chartMonth, setChartMonth] = useState(now.getMonth() + 1);
  const [hoveredPoint, setHoveredPoint] = useState<DailyTrendPoint | null>(null);

  const activeEmployeesCount = useMemo(
    () => employees.filter((e) => e.status === 'active').length,
    [employees]
  );

  const dayRecords = useMemo(
    () => records.filter((r) => r.date === selectedDate),
    [records, selectedDate]
  );

  const kpis = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let totalLateMinutes = 0;
    let totalOvertimeMinutes = 0;
    let netDiffMinutes = 0;

    for (const r of dayRecords) {
      if (r.status === 'present') {
        presentCount += 1;
        if (r.lateMinutes > 0) lateCount += 1;
        totalLateMinutes += r.lateMinutes;
        totalOvertimeMinutes += r.overtimeMinutes;
        netDiffMinutes += r.netTimeDiffMinutes;
      } else if (r.status === 'absent') {
        absentCount += 1;
      }
    }

    return {
      presentCount,
      lateCount,
      absentCount,
      totalLateMinutes,
      totalOvertimeMinutes,
      netDiffMinutes,
    };
  }, [dayRecords]);

  const monthRecords = useMemo(() => {
    const prefix = `${chartYear}-${String(chartMonth).padStart(2, '0')}`;
    return records.filter((r) => r.date.startsWith(prefix));
  }, [records, chartYear, chartMonth]);

  const trendSeries = useMemo(
    () => buildDailyTrendSeries(monthRecords, chartYear, chartMonth),
    [monthRecords, chartYear, chartMonth]
  );

  const maxChartMinutes = useMemo(() => {
    const maxVal = Math.max(
      60,
      ...trendSeries.map((p) => Math.max(p.lateMinutes, p.overtimeMinutes))
    );
    return Math.ceil(maxVal / 30) * 30;
  }, [trendSeries]);

  const availableYears = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    for (const r of records) {
      const y = Number(r.date.slice(0, 4));
      if (!Number.isNaN(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [records, now]);

  return (
    <div className="space-y-6">
      {/* Header Date Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">ملخص الأداء والحضور اليومي</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            إحصائيات فورية لليوم المحدد ومتابعة منحنى التأخير والساعات الإضافية الشهري
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">التاريخ المعروض:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono-num text-xs font-semibold text-slate-900 outline-none focus:border-teal-600"
          />
        </div>
      </div>

      {/* 7 Required KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">الموظفون النشطون</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900">
            {activeEmployeesCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">موظف على رأس العمل</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">الحاضرون اليوم</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-emerald-700">
            {kpis.presentCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">مسجل حضورهم</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">المتأخرون اليوم</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-amber-600">
            {kpis.lateCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">بعد الموعد الأساسي</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">الغائبون اليوم</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-red-600">
            {kpis.absentCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">حالة غياب مسجلة</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">إجمالي التأخير اليوم</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-red-600">
            {kpis.totalLateMinutes}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            دقيقة ({formatDurationArabic(kpis.totalLateMinutes)})
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">الساعات الإضافية اليوم</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-teal-700">
            {kpis.totalOvertimeMinutes}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            دقيقة ({formatDurationArabic(kpis.totalOvertimeMinutes)})
          </div>
        </div>

        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-4 lg:col-span-1">
          <div className="text-xs font-medium text-slate-500">صافي فرق الوقت اليوم</div>
          <div
            className={`mt-2 font-mono-num text-xl font-bold ${
              kpis.netDiffMinutes > 0
                ? 'text-emerald-700'
                : kpis.netDiffMinutes < 0
                ? 'text-red-600'
                : 'text-slate-700'
            }`}
          >
            {formatDurationArabic(kpis.netDiffMinutes, true)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">الإضافي − التأخير</div>
        </div>
      </div>

      {/* Monthly Late vs Overtime Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900">
              التأخير والساعات الإضافية على مدار الشهر
            </h4>
            <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-red-500" />
                دقائق التأخير
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-600" />
                دقائق الإضافي
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={chartMonth}
              onChange={(e) => setChartMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-teal-600"
            >
              {ARABIC_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={chartYear}
              onChange={(e) => setChartYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono-num text-xs font-medium outline-none focus:border-teal-600"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tooltip Strip */}
        <div className="mt-3 min-h-[24px] text-xs text-slate-600">
          {hoveredPoint ? (
            <div className="flex flex-wrap items-center gap-3 font-medium">
              <span className="font-mono-num font-bold text-slate-900">
                يوم {hoveredPoint.date}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                الحضور:{' '}
                <strong className="font-mono-num">{hoveredPoint.presentCount}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-red-600">
                التأخير:{' '}
                <strong className="font-mono-num">{hoveredPoint.lateMinutes} د</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-teal-700">
                الإضافي:{' '}
                <strong className="font-mono-num">{hoveredPoint.overtimeMinutes} د</strong>
              </span>
            </div>
          ) : (
            <span className="text-slate-400">مرّر المؤشر فوق أي يوم لعرض التفاصيل الرقمية</span>
          )}
        </div>

        {/* Responsive SVG Bar Chart */}
        <div className="mt-2 overflow-x-auto">
          <div className="min-w-[680px]">
            <svg
              viewBox="0 0 900 220"
              className="h-56 w-full select-none"
              role="img"
              aria-label="رسم بياني للتأخير والإضافي خلال الشهر"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = 180 - ratio * 155;
                const val = Math.round(ratio * maxChartMinutes);
                return (
                  <g key={ratio}>
                    <line
                      x1="40"
                      y1={y}
                      x2="890"
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x="32"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px]"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {trendSeries.map((pt, idx) => {
                const slotWidth = 840 / trendSeries.length;
                const xBase = 48 + idx * slotWidth;
                const barW = Math.max(4, Math.min(10, slotWidth * 0.34));
                const lateH = (pt.lateMinutes / maxChartMinutes) * 155;
                const overH = (pt.overtimeMinutes / maxChartMinutes) * 155;

                return (
                  <g
                    key={pt.date}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={xBase}
                      y={20}
                      width={slotWidth}
                      height={175}
                      fill="transparent"
                    />
                    {pt.lateMinutes > 0 && (
                      <rect
                        x={xBase + 2}
                        y={180 - lateH}
                        width={barW}
                        height={Math.max(2, lateH)}
                        rx="2"
                        fill="#DC2626"
                      />
                    )}
                    {pt.overtimeMinutes > 0 && (
                      <rect
                        x={xBase + barW + 4}
                        y={180 - overH}
                        width={barW}
                        height={Math.max(2, overH)}
                        rx="2"
                        fill="#0F766E"
                      />
                    )}
                    <text
                      x={xBase + barW + 2}
                      y="200"
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px]"
                    >
                      {pt.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Split: Today's Records & Recent Audit Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900">
              سجلات يوم <span className="font-mono-num">{selectedDate}</span>
            </h4>
            <button
              type="button"
              onClick={() => onNavigate('daily-report')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              عرض التقرير اليومي الكامل
            </button>
          </div>

          {dayRecords.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs font-semibold text-slate-700">
                لم يتم تسجيل حضور لهذا اليوم بعد
              </p>
              <button
                type="button"
                onClick={() => onNavigate('daily-entry')}
                className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                تسجيل حضور اليوم
              </button>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="py-2">الموظف</th>
                    <th className="py-2">الحضور الفعلي</th>
                    <th className="py-2">التأخير</th>
                    <th className="py-2">الإضافي</th>
                    <th className="py-2">الصافي</th>
                    <th className="py-2">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 font-semibold text-slate-900">
                        {r.employeeName}
                      </td>
                      <td className="py-2.5 font-mono-num text-slate-700">
                        {r.status === 'present'
                          ? `${r.actualCheckIn || '—'} – ${r.actualCheckOut || '—'}`
                          : '—'}
                      </td>
                      <td
                        className={`py-2.5 font-mono-num font-semibold ${
                          r.lateMinutes > 0 ? 'text-red-600' : 'text-slate-500'
                        }`}
                      >
                        {r.lateMinutes} د
                      </td>
                      <td
                        className={`py-2.5 font-mono-num font-semibold ${
                          r.overtimeMinutes > 0 ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {r.overtimeMinutes} د
                      </td>
                      <td
                        className={`py-2.5 font-mono-num font-bold ${
                          r.netTimeDiffMinutes > 0
                            ? 'text-emerald-700'
                            : r.netTimeDiffMinutes < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatDurationArabic(r.netTimeDiffMinutes, true)}
                      </td>
                      <td className="py-2.5 text-slate-700">
                        {getStatusLabelArabic(r.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900">آخر التعديلات</h4>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              السجل الكامل
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">لا توجد عمليات مسجلة بعد</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="py-2.5">
                  <div className="text-xs font-medium text-slate-800">{log.summary}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    بواسطة {log.performedByName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
