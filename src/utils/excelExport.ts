import * as XLSX from 'xlsx';
import {
  formatDurationArabic,
  formatHoursDecimal,
  getStatusLabelArabic,
} from '../engine/attendanceCalculator';
import type {
  AttendanceRecord,
  MonthlyEmployeeSummary,
} from '../types/attendance';

function finalizeWorkbook(
  rows: Record<string, string | number>[],
  sheetName: string,
  fileName: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!views'] = [{ rightToLeft: true }];

  // Auto-fit column widths based on Arabic header & cell lengths
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet['!cols'] = keys.map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => String(r[key] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 4, 12), 36) };
  });

  const workbook = XLSX.utils.book_new();
  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{ RTL: true }];
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, fileName);
}

export function exportDailyReportToExcel(
  records: AttendanceRecord[],
  date: string
): void {
  const rows = records.map((r) => ({
    'رقم الموظف': r.employeeCode,
    'اسم الموظف': r.employeeName,
    'القسم': r.department,
    'الوردية': r.scheduleName,
    'الحضور الأساسي': r.scheduledCheckIn,
    'الحضور الفعلي': r.actualCheckIn || '—',
    'التأخير (دقيقة)': r.lateMinutes,
    'الحضور المبكر (دقيقة)': r.earlyArrivalMinutes,
    'الانصراف الأساسي': r.scheduledCheckOut,
    'الانصراف الفعلي': r.actualCheckOut || '—',
    'الانصراف المبكر (دقيقة)': r.earlyLeaveMinutes,
    'الساعات الإضافية (دقيقة)': r.overtimeMinutes,
    'ساعات العمل الفعلية': formatDurationArabic(r.actualWorkedMinutes),
    'ساعات العمل (ساعة عشرية)': Number(formatHoursDecimal(r.actualWorkedMinutes)),
    'صافي فرق الوقت (دقيقة)': r.netTimeDiffMinutes,
    'صافي فرق الوقت': formatDurationArabic(r.netTimeDiffMinutes, true),
    'حالة اليوم': getStatusLabelArabic(r.status),
    'ملاحظات': r.notes || '',
  }));

  finalizeWorkbook(rows, `تقرير_${date}`, `التقرير_اليومي_${date}.xlsx`);
}

export function exportMonthlyReportToExcel(
  summaries: MonthlyEmployeeSummary[],
  year: number,
  month: number
): void {
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
  const rows = summaries.map((s) => ({
    'رقم الموظف': s.employeeCode,
    'اسم الموظف': s.employeeName,
    'القسم': s.department,
    'أيام الحضور': s.presentDays,
    'أيام الغياب': s.absentDays,
    'أيام الإجازات': s.leaveDays,
    'أيام الراحة': s.restDays,
    'إجمالي التأخير (دقيقة)': s.totalLateMinutes,
    'إجمالي التأخير (ساعة:دقيقة)': formatDurationArabic(s.totalLateMinutes),
    'إجمالي الحضور المبكر (دقيقة)': s.totalEarlyArrivalMinutes,
    'إجمالي الانصراف المبكر (دقيقة)': s.totalEarlyLeaveMinutes,
    'إجمالي الساعات الإضافية (دقيقة)': s.totalOvertimeMinutes,
    'إجمالي الساعات الإضافية (ساعة:دقيقة)': formatDurationArabic(s.totalOvertimeMinutes),
    'إجمالي ساعات العمل الفعلية': formatDurationArabic(s.totalActualWorkedMinutes),
    'إجمالي ساعات العمل (ساعة عشرية)': Number(formatHoursDecimal(s.totalActualWorkedMinutes)),
    'صافي فرق الوقت (دقيقة)': s.totalNetTimeDiffMinutes,
    'صافي فرق الوقت': formatDurationArabic(s.totalNetTimeDiffMinutes, true),
    'نسبة الالتزام (%)': s.punctualityRate,
  }));

  finalizeWorkbook(rows, `التقرير_الشهري_${monthLabel}`, `التقرير_الشهري_${monthLabel}.xlsx`);
}

export function exportComparisonReportToExcel(
  summaries: MonthlyEmployeeSummary[],
  year: number,
  month: number,
  sortLabel: string
): void {
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
  const rows = summaries.map((s, idx) => ({
    'الترتيب': idx + 1,
    'رقم الموظف': s.employeeCode,
    'اسم الموظف': s.employeeName,
    'القسم': s.department,
    'أيام الحضور': s.presentDays,
    'أيام الغياب': s.absentDays,
    'نسبة الالتزام (%)': s.punctualityRate,
    'إجمالي التأخير (دقيقة)': s.totalLateMinutes,
    'إجمالي الإضافي (دقيقة)': s.totalOvertimeMinutes,
    'إجمالي ساعات العمل': formatDurationArabic(s.totalActualWorkedMinutes),
    'صافي فرق الوقت': formatDurationArabic(s.totalNetTimeDiffMinutes, true),
    'معيار الترتيب': sortLabel,
  }));

  finalizeWorkbook(rows, `مقارنة_${monthLabel}`, `مقارنة_الموظفين_${monthLabel}.xlsx`);
}

export function exportAttendanceLogToExcel(records: AttendanceRecord[]): void {
  const rows = records.map((r) => ({
    'التاريخ': r.date,
    'رقم الموظف': r.employeeCode,
    'اسم الموظف': r.employeeName,
    'القسم': r.department,
    'الوردية': r.scheduleName,
    'الحضور الأساسي': r.scheduledCheckIn,
    'الحضور الفعلي': r.actualCheckIn || '—',
    'الانصراف الأساسي': r.scheduledCheckOut,
    'الانصراف الفعلي': r.actualCheckOut || '—',
    'التأخير (دقيقة)': r.lateMinutes,
    'الحضور المبكر (دقيقة)': r.earlyArrivalMinutes,
    'الانصراف المبكر (دقيقة)': r.earlyLeaveMinutes,
    'الإضافي (دقيقة)': r.overtimeMinutes,
    'العمل الفعلي': formatDurationArabic(r.actualWorkedMinutes),
    'صافي الفرق (دقيقة)': r.netTimeDiffMinutes,
    'الحالة': getStatusLabelArabic(r.status),
    'آخر تعديل بواسطة': r.updatedByName,
    'ملاحظات': r.notes || '',
  }));

  finalizeWorkbook(rows, 'سجل_الحضور', `سجل_الحضور_والانصراف.xlsx`);
}
