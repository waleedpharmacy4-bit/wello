/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  bootstrapInitialDefaultsIfNeeded,
  ensureUserAccount,
  signOutUser,
  subscribeAttendanceRecords,
  subscribeAuditLogs,
  subscribeEmployees,
  subscribeHolidays,
  subscribeSchedules,
  subscribeSystemSettings,
  subscribeUsers,
} from './services/firestoreService';
import type {
  AttendanceRecord,
  AuditLog,
  Employee,
  Holiday,
  SystemSettings,
  UserAccount,
  WorkSchedule,
} from './types/attendance';
import { Layout, type NavSectionId } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { SchedulesView } from './components/SchedulesView';
import { DailyEntryView } from './components/DailyEntryView';
import { AttendanceLogView } from './components/AttendanceLogView';
import { DailyReportView } from './components/DailyReportView';
import { MonthlyReportsView } from './components/MonthlyReportsView';
import { SettingsView } from './components/SettingsView';

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg rounded-xl border border-red-200 bg-white p-6 text-right">
            <h2 className="text-base font-bold text-red-700">حدث خطأ في الاتصال أو الصلاحيات</h2>
            <p className="mt-2 break-words text-xs leading-relaxed text-slate-600">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AttendanceApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  // Auth lifecycle
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setUserAccount(null);
        setAuthReady(true);
        return;
      }

      try {
        setAuthError(null);
        const account = await ensureUserAccount(user);
        await bootstrapInitialDefaultsIfNeeded(user);
        setFirebaseUser(user);
        setUserAccount(account);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'تعذر التحقق من حساب المستخدم');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Firestore real-time subscriptions when authenticated and active
  useEffect(() => {
    if (!firebaseUser || !userAccount || !userAccount.active) return;
    const email = (firebaseUser.email || '').toLowerCase();
    const isAdminUser =
      userAccount.role === 'admin' || email === BOOTSTRAPPED_ADMIN_EMAIL;

    const handleErr = (err: Error) => {
      setDataError(err.message);
    };

    const unsubs = [
      subscribeEmployees(email, setEmployees, handleErr),
      subscribeSchedules(email, setSchedules, handleErr),
      subscribeAttendanceRecords(email, setAttendanceRecords, handleErr),
      subscribeHolidays(email, setHolidays, handleErr),
      subscribeSystemSettings(email, setSettings, handleErr),
      subscribeUsers(firebaseUser, isAdminUser, setUsersList, handleErr),
      subscribeAuditLogs(email, setAuditLogs, handleErr),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [firebaseUser, userAccount]);

  const allowedEmails = useMemo(() => {
    const list = settings?.authorizedEmails || [BOOTSTRAPPED_ADMIN_EMAIL];
    if (firebaseUser?.email && !list.includes(firebaseUser.email.toLowerCase())) {
      return Array.from(new Set([...list, firebaseUser.email.toLowerCase()]));
    }
    return list;
  }, [settings, firebaseUser]);

  const departments = useMemo(
    () =>
      settings?.departments && settings.departments.length > 0
        ? settings.departments
        : ['صيدلي', 'مساعد صيدلي', 'كاشير', 'إدارة', 'توصيل'],
    [settings]
  );

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">جاري الاتصال بقاعدة البيانات...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !userAccount) {
    return <LoginScreen />;
  }

  if (!userAccount.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <h2 className="text-base font-bold text-slate-900">الحساب موقوف مؤقتاً</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            تم إيقاف صلاحية الوصول لهذا الحساب ({userAccount.email}). يرجى مراجعة مدير الصيدلية.
          </p>
          <button
            type="button"
            onClick={signOutUser}
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  const isAdmin =
    userAccount.role === 'admin' ||
    (firebaseUser.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
  const canEdit = isAdmin || userAccount.role === 'supervisor';

  return (
    <Layout
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      pharmacyName={settings?.pharmacyName || 'صيدلية الرعاية'}
      branchName={settings?.branchName || 'الفرع الرئيسي'}
      userAccount={userAccount}
      onSignOut={signOutUser}
    >
      {(authError || dataError) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {authError || dataError}
        </div>
      )}

      {userAccount.role === 'viewer' && !isAdmin && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          صلاحيتك الحالية هي "قراءة فقط". إذا كنت بحاجة لتسجيل الحضور أو تعديل البيانات، اطلب من
          مدير النظام ترقية حسابك ({userAccount.email}) وإضافته في الإعدادات.
        </div>
      )}

      {activeSection === 'dashboard' && (
        <DashboardView
          employees={employees}
          records={attendanceRecords}
          auditLogs={auditLogs}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'daily-entry' && (
        <DailyEntryView
          employees={employees}
          schedules={schedules}
          attendanceRecords={attendanceRecords}
          holidays={holidays}
          user={firebaseUser}
          canEdit={canEdit}
          allowedEmails={allowedEmails}
        />
      )}

      {activeSection === 'attendance-log' && (
        <AttendanceLogView
          records={attendanceRecords}
          employees={employees}
          departments={departments}
          user={firebaseUser}
          canEdit={canEdit}
          isAdmin={isAdmin}
          allowedEmails={allowedEmails}
        />
      )}

      {activeSection === 'employees' && (
        <EmployeesView
          employees={employees}
          schedules={schedules}
          departments={departments}
          user={firebaseUser}
          canEdit={canEdit}
          isAdmin={isAdmin}
          allowedEmails={allowedEmails}
        />
      )}

      {activeSection === 'schedules' && (
        <SchedulesView
          schedules={schedules}
          holidays={holidays}
          employees={employees}
          user={firebaseUser}
          canEdit={canEdit}
          isAdmin={isAdmin}
          allowedEmails={allowedEmails}
        />
      )}

      {activeSection === 'daily-report' && (
        <DailyReportView
          records={attendanceRecords}
          departments={departments}
        />
      )}

      {activeSection === 'monthly-reports' && (
        <MonthlyReportsView
          employees={employees}
          records={attendanceRecords}
          departments={departments}
        />
      )}

      {activeSection === 'settings' && (
        <SettingsView
          settings={settings}
          usersList={usersList}
          auditLogs={auditLogs}
          employees={employees}
          schedules={schedules}
          attendanceRecords={attendanceRecords}
          holidays={holidays}
          user={firebaseUser}
          isAdmin={isAdmin}
          allowedEmails={allowedEmails}
        />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AttendanceApp />
    </AppErrorBoundary>
  );
}
