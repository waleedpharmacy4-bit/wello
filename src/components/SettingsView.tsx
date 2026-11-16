import React, { useEffect, useState } from 'react';
import { Download, Save, Shield, Upload } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  restoreFromBackupPayload,
  updateSystemSettings,
  updateUserAccountRole,
  type BackupPayload,
} from '../services/firestoreService';
import type {
  AttendanceRecord,
  AuditLog,
  Employee,
  Holiday,
  SystemSettings,
  UserAccount,
  UserRole,
  WorkSchedule,
} from '../types/attendance';
import { ConfirmModal } from './ConfirmModal';

interface SettingsViewProps {
  settings: SystemSettings | null;
  usersList: UserAccount[];
  auditLogs: AuditLog[];
  employees: Employee[];
  schedules: WorkSchedule[];
  attendanceRecords: AttendanceRecord[];
  holidays: Holiday[];
  user: User;
  isAdmin: boolean;
  allowedEmails: string[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  usersList,
  auditLogs,
  employees,
  schedules,
  attendanceRecords,
  holidays,
  user,
  isAdmin,
  allowedEmails,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'backup' | 'audit'>('general');

  const [pharmacyName, setPharmacyName] = useState(
    settings?.pharmacyName || 'صيدلية الرعاية'
  );
  const [branchName, setBranchName] = useState(
    settings?.branchName || 'الفرع الرئيسي'
  );
  const [departmentsText, setDepartmentsText] = useState(
    (settings?.departments || ['صيدلي', 'مساعد صيدلي', 'كاشير', 'إدارة', 'توصيل']).join('، ')
  );
  const [authorizedEmailsText, setAuthorizedEmailsText] = useState(
    (settings?.authorizedEmails || [BOOTSTRAPPED_ADMIN_EMAIL]).join('\n')
  );
  const [nextEmployeeSeq, setNextEmployeeSeq] = useState(
    settings?.nextEmployeeSeq || 1
  );

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pendingRestore, setPendingRestore] = useState<BackupPayload | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPharmacyName(settings.pharmacyName);
    setBranchName(settings.branchName);
    setDepartmentsText((settings.departments || []).join('، '));
    setAuthorizedEmailsText((settings.authorizedEmails || []).join('\n'));
    setNextEmployeeSeq(settings.nextEmployeeSeq || 1);
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    setErrorMsg(null);

    const parsedDepts = departmentsText
      .split(/[،,\n]+/)
      .map((d) => d.trim())
      .filter(Boolean);

    const parsedEmails = authorizedEmailsText
      .split(/[\s,،\n]+/)
      .map((em) => em.trim().toLowerCase())
      .filter(Boolean);

    try {
      await updateSystemSettings({
        pharmacyName,
        branchName,
        departments: parsedDepts,
        authorizedEmails: parsedEmails,
        nextEmployeeSeq,
        user,
      });
      setToast('تم حفظ إعدادات النظام ومزامنة الصلاحيات بنجاح.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = () => {
    const payload: BackupPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      workSchedules: schedules,
      employees,
      attendanceRecords,
      holidays,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacy_attendance_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BackupPayload;
        if (
          !parsed ||
          !Array.isArray(parsed.workSchedules) ||
          !Array.isArray(parsed.employees) ||
          !Array.isArray(parsed.attendanceRecords)
        ) {
          setErrorMsg('ملف النسخة الاحتياطية غير صالح أو ينقصه البيانات الأساسية.');
          return;
        }
        setErrorMsg(null);
        setPendingRestore(parsed);
      } catch {
        setErrorMsg('تعذر قراءة ملف JSON. تأكد من صحة الملف.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setSaving(true);
    setErrorMsg(null);
    setToast(null);
    try {
      const res = await restoreFromBackupPayload({
        payload: pendingRestore,
        user,
        allowedEmails,
      });
      setToast(`تمت استعادة ${res.restoredCount} سجل من النسخة الاحتياطية بنجاح.`);
      setPendingRestore(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشلت عملية الاستعادة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-2">
        {(
          [
            { id: 'general', label: 'إعدادات الصيدلية والأقسام' },
            { id: 'users', label: 'مستخدمو النظام والصلاحيات' },
            { id: 'backup', label: 'النسخ الاحتياطي والاستعادة' },
            { id: 'audit', label: `سجل التعديلات (${auditLogs.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-teal-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {toast}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {errorMsg}
        </div>
      )}

      {activeTab === 'general' && (
        <form
          onSubmit={handleSaveSettings}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                اسم الصيدلية
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                الفرع / الموقع
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                الأقسام والوظائف المتاحة (افصل بينها بفاصلة)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={departmentsText}
                onChange={(e) => setDepartmentsText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                التسلسل التالي لأرقام الموظفين (EMP-xxx)
              </label>
              <input
                type="number"
                min={1}
                disabled={!isAdmin}
                value={nextEmployeeSeq}
                onChange={(e) => setNextEmployeeSeq(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-sm outline-none focus:border-teal-600 disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                البريد الإلكتروني للمصرح لهم بالوصول إلى بيانات الصيدلية (بريد في كل سطر)
              </label>
              <textarea
                rows={3}
                disabled={!isAdmin}
                value={authorizedEmailsText}
                onChange={(e) => setAuthorizedEmailsText(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono-num text-xs outline-none focus:border-teal-600 disabled:bg-slate-50"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {activeTab === 'users' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Shield className="h-4 w-4 text-teal-700" />
              <span>صلاحيات المستخدمين</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              يمكن للمدير تحديد دور كل مستخدم مسجل (مدير النظام، مشرف حضور، قراءة فقط) مع إضافة بريده في قائمة المصرح لهم.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">الاسم</th>
                  <th className="px-4 py-3">البريد الإلكتروني</th>
                  <th className="px-4 py-3">الصلاحية</th>
                  <th className="px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => {
                  const isBootstrap = u.email === BOOTSTRAPPED_ADMIN_EMAIL;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {u.displayName}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-slate-600" dir="ltr">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={!isAdmin || isBootstrap}
                          value={u.role}
                          onChange={(e) =>
                            updateUserAccountRole({
                              targetUser: u,
                              role: e.target.value as UserRole,
                              active: u.active,
                              currentUser: user,
                              allowedEmails,
                            })
                          }
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-teal-600 disabled:bg-slate-50"
                        >
                          <option value="admin">مدير النظام</option>
                          <option value="supervisor">مشرف حضور</option>
                          <option value="viewer">قراءة فقط</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!isAdmin || isBootstrap}
                          onClick={() =>
                            updateUserAccountRole({
                              targetUser: u,
                              role: u.role,
                              active: !u.active,
                              currentUser: user,
                              allowedEmails,
                            })
                          }
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          } disabled:opacity-60`}
                        >
                          {u.active ? 'نشط' : 'موقوف'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h4 className="text-base font-bold text-slate-900">تنزيل نسخة احتياطية كاملة</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              يتم تصدير جميع الموظفين، جداول العمل، سجلات الحضور التاريخية، الإجازات، والإعدادات في ملف JSON منظم.
            </p>
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono-num text-xs text-slate-600">
              الموظفون: {employees.length} · الجداول: {schedules.length} · السجلات:{' '}
              {attendanceRecords.length}
            </div>
            <button
              type="button"
              onClick={handleExportBackup}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Download className="h-4 w-4" />
              <span>تنزيل نسخة احتياطية الآن</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h4 className="text-base font-bold text-slate-900">استعادة من نسخة احتياطية</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              اختر ملف JSON سابقاً لاستعادة البيانات إلى قاعدة البيانات السحابية مع الحفاظ على السجلات التاريخية.
            </p>
            {isAdmin ? (
              <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4 text-teal-700" />
                <span>اختيار ملف نسخة احتياطية (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleBackupFilePick}
                  className="hidden"
                />
              </label>
            ) : (
              <p className="mt-4 text-xs font-medium text-amber-700">
                الاستعادة متاحة لمدير النظام فقط.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <h4 className="text-base font-bold text-slate-900">سجل التعديلات والمراجعة</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              سجل غير قابل للتعديل يوثّق كل إضافة أو تعديل أو حذف باسم المستخدم والتوقيت.
            </p>
          </div>
          {auditLogs.length === 0 ? (
            <div className="py-14 text-center text-xs text-slate-500">
              لا توجد عمليات مسجلة بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">العملية</th>
                    <th className="px-4 py-3">التفاصيل</th>
                    <th className="px-4 py-3">المستخدم</th>
                    <th className="px-4 py-3">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => {
                    const sec = (log.createdAt as { seconds?: number } | undefined)?.seconds;
                    const formattedDate = sec
                      ? new Date(sec * 1000).toLocaleString('ar-EG')
                      : 'الآن';
                    return (
                      <tr key={log.id}>
                        <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                          {log.action === 'create'
                            ? 'إضافة'
                            : log.action === 'update'
                            ? 'تعديل'
                            : log.action === 'delete'
                            ? 'حذف'
                            : log.action === 'restore'
                            ? 'استعادة'
                            : 'تغيير حالة'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{log.summary}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-slate-800">
                            {log.performedByName}
                          </div>
                          <div className="font-mono-num text-[11px] text-slate-500">
                            {log.performedByEmail}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono-num text-slate-500 whitespace-nowrap">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title="تأكيد استعادة النسخة الاحتياطية"
        message={`سيتم استعادة ${pendingRestore?.workSchedules.length || 0} جدول عمل، و${
          pendingRestore?.employees.length || 0
        } موظف، و${pendingRestore?.attendanceRecords.length || 0} سجل حضور. هل تريد المتابعة؟`}
        confirmLabel="بدء الاستعادة"
        variant="primary"
        loading={saving}
        onConfirm={handleConfirmRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
};
