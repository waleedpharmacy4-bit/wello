import {
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  buildAttendanceRecordId,
  calculateAttendanceMetrics,
  computeScheduleMeta,
} from '../engine/attendanceCalculator';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AuditLog,
  Employee,
  EmployeeStatus,
  Holiday,
  HolidayType,
  SystemSettings,
  UserAccount,
  UserRole,
  WorkSchedule,
} from '../types/attendance';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'waleedpharmacy6@gmail.com';

const DEFAULT_DEPARTMENTS = ['صيدلي', 'مساعد صيدلي', 'كاشير', 'إدارة', 'توصيل'];

function normalizeAllowedEmails(emails: string[], currentEmail?: string | null): string[] {
  const set = new Set<string>([BOOTSTRAPPED_ADMIN_EMAIL]);
  if (currentEmail) {
    set.add(currentEmail.trim().toLowerCase());
  }
  for (const e of emails) {
    const clean = e.trim().toLowerCase();
    if (clean) set.add(clean);
  }
  return Array.from(set).slice(0, 10);
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserAccount(user: User): Promise<UserAccount> {
  const userRef = doc(db, 'users', user.uid);
  const path = `users/${user.uid}`;
  try {
    const snap = await getDoc(userRef);
    const email = (user.email || '').toLowerCase();
    const isBootstrap = email === BOOTSTRAPPED_ADMIN_EMAIL;

    if (snap.exists()) {
      const data = snap.data() as Omit<UserAccount, 'id'>;
      return { id: snap.id, ...data };
    }

    const newAccount = {
      uid: user.uid,
      email,
      displayName: (user.displayName || email.split('@')[0] || 'مستخدم').slice(0, 100),
      role: (isBootstrap ? 'admin' : 'viewer') as UserRole,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, newAccount);
    const createdSnap = await getDoc(userRef);
    return {
      id: user.uid,
      ...(createdSnap.data() as Omit<UserAccount, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bootstrapInitialDefaultsIfNeeded(user: User): Promise<void> {
  const email = (user.email || '').toLowerCase();
  if (email !== BOOTSTRAPPED_ADMIN_EMAIL) return;

  const settingsRef = doc(db, 'system_settings', 'main');
  try {
    const snap = await getDoc(settingsRef);
    if (snap.exists()) return;

    const allowedEmails = [BOOTSTRAPPED_ADMIN_EMAIL];
    const batch = writeBatch(db);

    batch.set(settingsRef, {
      pharmacyName: 'صيدلية الرعاية',
      branchName: 'الفرع الرئيسي',
      departments: DEFAULT_DEPARTMENTS,
      authorizedEmails: allowedEmails,
      nextEmployeeSeq: 1,
      ownerUid: user.uid,
      allowedEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const initialSchedules = [
      {
        id: 'sched-morning',
        name: 'الوردية الصباحية',
        checkInTime: '09:00',
        checkOutTime: '17:00',
        description: 'الدوام الصباحي القياسي (8 ساعات)',
      },
      {
        id: 'sched-evening',
        name: 'الوردية المسائية',
        checkInTime: '14:00',
        checkOutTime: '22:00',
        description: 'الدوام المسائي (8 ساعات)',
      },
      {
        id: 'sched-night',
        name: 'الوردية الليلية',
        checkInTime: '22:00',
        checkOutTime: '06:00',
        description: 'وردية ليلية تتجاوز منتصف الليل (8 ساعات)',
      },
    ];

    for (const s of initialSchedules) {
      const meta = computeScheduleMeta(s.checkInTime, s.checkOutTime);
      batch.set(doc(db, 'work_schedules', s.id), {
        name: s.name,
        checkInTime: s.checkInTime,
        checkOutTime: s.checkOutTime,
        crossesMidnight: meta.crossesMidnight,
        durationMinutes: meta.durationMinutes,
        description: s.description,
        isActive: true,
        ownerUid: user.uid,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'system_settings/main');
  }
}

async function writeAuditLog(params: {
  action: AuditLog['action'];
  entityType: AuditLog['entityType'];
  entityId: string;
  summary: string;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const logId = makeSafeId('log');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId.slice(0, 128),
      summary: params.summary.slice(0, 300),
      performedByUid: params.user.uid,
      performedByName: (params.user.displayName || params.user.email || 'مستخدم').slice(0, 100),
      performedByEmail: (params.user.email || '').slice(0, 120),
      ownerUid: params.user.uid,
      allowedEmails: normalizeAllowedEmails(params.allowedEmails, params.user.email),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

function buildAuthorizedCollectionQuery(colName: string, userEmail: string) {
  const cleanEmail = userEmail.toLowerCase();
  if (cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
    return collection(db, colName);
  }
  return query(
    collection(db, colName),
    where('allowedEmails', 'array-contains', cleanEmail)
  );
}

export function subscribeEmployees(
  userEmail: string,
  onData: (rows: Employee[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('employees', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: Employee[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Employee, 'id'>),
      }));
      rows.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'employees');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeSchedules(
  userEmail: string,
  onData: (rows: WorkSchedule[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('work_schedules', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: WorkSchedule[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WorkSchedule, 'id'>),
      }));
      rows.sort((a, b) => a.checkInTime.localeCompare(b.checkInTime));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'work_schedules');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeAttendanceRecords(
  userEmail: string,
  onData: (rows: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('attendance_records', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: AttendanceRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AttendanceRecord, 'id'>),
      }));
      rows.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'attendance_records');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeHolidays(
  userEmail: string,
  onData: (rows: Holiday[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('holidays', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: Holiday[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Holiday, 'id'>),
      }));
      rows.sort((a, b) => b.date.localeCompare(a.date));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'holidays');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeSystemSettings(
  userEmail: string,
  onData: (settings: SystemSettings | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('system_settings', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const d = snapshot.docs.find((docSnap) => docSnap.id === 'main') || snapshot.docs[0];
      onData({ id: d.id, ...(d.data() as Omit<SystemSettings, 'id'>) });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'system_settings');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeUsers(
  currentUser: User,
  isAdminUser: boolean,
  onData: (rows: UserAccount[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = (currentUser.email || '').toLowerCase();
  const q =
    cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL
      ? collection(db, 'users')
      : query(collection(db, 'users'), where('uid', '==', currentUser.uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: UserAccount[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UserAccount, 'id'>),
      }));
      if (!isAdminUser && rows.length > 1) {
        onData(rows.filter((r) => r.uid === currentUser.uid));
      } else {
        onData(rows);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeAuditLogs(
  userEmail: string,
  onData: (rows: AuditLog[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = buildAuthorizedCollectionQuery('audit_logs', userEmail);
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: AuditLog[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLog, 'id'>),
      }));
      rows.sort((a, b) => {
        const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
        const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
        return bSec - aSec;
      });
      onData(rows.slice(0, 150));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'audit_logs');
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

// ==========================================
// EMPLOYEES CRUD
// ==========================================

export async function createEmployee(params: {
  name: string;
  department: string;
  defaultScheduleId: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  workDays: number[];
  restDays: number[];
  hourlyRate?: number;
  startDate: string;
  status: EmployeeStatus;
  user: User;
  allowedEmails: string[];
}): Promise<string> {
  const settingsRef = doc(db, 'system_settings', 'main');
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);

  try {
    const newId = await runTransaction(db, async (tx) => {
      const settingsSnap = await tx.get(settingsRef);
      const currentSeq = settingsSnap.exists()
        ? Number((settingsSnap.data() as SystemSettings).nextEmployeeSeq || 1)
        : 1;
      const code = `EMP-${String(currentSeq).padStart(3, '0')}`;
      const empId = `emp-${String(currentSeq).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      const empRef = doc(db, 'employees', empId);

      const payload: Record<string, unknown> = {
        employeeCode: code,
        name: params.name.trim().slice(0, 100),
        department: params.department.trim().slice(0, 60),
        defaultScheduleId: params.defaultScheduleId,
        defaultCheckIn: params.defaultCheckIn,
        defaultCheckOut: params.defaultCheckOut,
        workDays: params.workDays,
        restDays: params.restDays,
        startDate: params.startDate,
        status: params.status,
        ownerUid: params.user.uid,
        allowedEmails: cleanEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (typeof params.hourlyRate === 'number' && !Number.isNaN(params.hourlyRate) && params.hourlyRate >= 0) {
        payload.hourlyRate = params.hourlyRate;
      }

      tx.set(empRef, payload);

      if (settingsSnap.exists()) {
        tx.update(settingsRef, {
          nextEmployeeSeq: currentSeq + 1,
          updatedAt: serverTimestamp(),
        });
      }

      return empId;
    });

    await writeAuditLog({
      action: 'create',
      entityType: 'employee',
      entityId: newId,
      summary: `إضافة الموظف ${params.name.trim()} (${params.department.trim()})`,
      user: params.user,
      allowedEmails: cleanEmails,
    });

    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'employees');
  }
}

export async function updateEmployee(params: {
  employeeId: string;
  name: string;
  department: string;
  defaultScheduleId: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  workDays: number[];
  restDays: number[];
  hourlyRate?: number;
  startDate: string;
  status: EmployeeStatus;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `employees/${params.employeeId}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);
  try {
    const updatePayload: Record<string, unknown> = {
      name: params.name.trim().slice(0, 100),
      department: params.department.trim().slice(0, 60),
      defaultScheduleId: params.defaultScheduleId,
      defaultCheckIn: params.defaultCheckIn,
      defaultCheckOut: params.defaultCheckOut,
      workDays: params.workDays,
      restDays: params.restDays,
      startDate: params.startDate,
      status: params.status,
      allowedEmails: cleanEmails,
      updatedAt: serverTimestamp(),
    };

    if (typeof params.hourlyRate === 'number' && !Number.isNaN(params.hourlyRate) && params.hourlyRate >= 0) {
      updatePayload.hourlyRate = params.hourlyRate;
    } else {
      updatePayload.hourlyRate = deleteField();
    }

    await updateDoc(doc(db, 'employees', params.employeeId), updatePayload);

    await writeAuditLog({
      action: 'update',
      entityType: 'employee',
      entityId: params.employeeId,
      summary: `تحديث بيانات/جدول الموظف ${params.name.trim()} (بدون تعديل السجلات السابقة)`,
      user: params.user,
      allowedEmails: cleanEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleEmployeeStatus(params: {
  employee: Employee;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const nextStatus: EmployeeStatus = params.employee.status === 'active' ? 'inactive' : 'active';
  const path = `employees/${params.employee.id}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);
  try {
    await updateDoc(doc(db, 'employees', params.employee.id), {
      status: nextStatus,
      allowedEmails: cleanEmails,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      action: 'status_change',
      entityType: 'employee',
      entityId: params.employee.id,
      summary: `تغيير حالة الموظف ${params.employee.name} إلى ${nextStatus === 'active' ? 'نشط' : 'غير نشط'}`,
      user: params.user,
      allowedEmails: cleanEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteEmployee(params: {
  employee: Employee;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `employees/${params.employee.id}`;
  try {
    await deleteDoc(doc(db, 'employees', params.employee.id));
    await writeAuditLog({
      action: 'delete',
      entityType: 'employee',
      entityId: params.employee.id,
      summary: `حذف ملف الموظف ${params.employee.name} (${params.employee.employeeCode})`,
      user: params.user,
      allowedEmails: params.allowedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// WORK SCHEDULES CRUD
// ==========================================

export async function createWorkSchedule(params: {
  name: string;
  checkInTime: string;
  checkOutTime: string;
  description: string;
  isActive: boolean;
  user: User;
  allowedEmails: string[];
}): Promise<string> {
  const scheduleId = makeSafeId('sched');
  const path = `work_schedules/${scheduleId}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);
  const meta = computeScheduleMeta(params.checkInTime, params.checkOutTime);

  try {
    await setDoc(doc(db, 'work_schedules', scheduleId), {
      name: params.name.trim().slice(0, 80),
      checkInTime: params.checkInTime,
      checkOutTime: params.checkOutTime,
      crossesMidnight: meta.crossesMidnight,
      durationMinutes: meta.durationMinutes,
      description: params.description.trim().slice(0, 200),
      isActive: params.isActive,
      ownerUid: params.user.uid,
      allowedEmails: cleanEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      action: 'create',
      entityType: 'schedule',
      entityId: scheduleId,
      summary: `إنشاء جدول عمل: ${params.name.trim()} (${params.checkInTime} - ${params.checkOutTime})`,
      user: params.user,
      allowedEmails: cleanEmails,
    });

    return scheduleId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWorkSchedule(params: {
  scheduleId: string;
  name: string;
  checkInTime: string;
  checkOutTime: string;
  description: string;
  isActive: boolean;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `work_schedules/${params.scheduleId}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);
  const meta = computeScheduleMeta(params.checkInTime, params.checkOutTime);

  try {
    await updateDoc(doc(db, 'work_schedules', params.scheduleId), {
      name: params.name.trim().slice(0, 80),
      checkInTime: params.checkInTime,
      checkOutTime: params.checkOutTime,
      crossesMidnight: meta.crossesMidnight,
      durationMinutes: meta.durationMinutes,
      description: params.description.trim().slice(0, 200),
      isActive: params.isActive,
      allowedEmails: cleanEmails,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      action: 'update',
      entityType: 'schedule',
      entityId: params.scheduleId,
      summary: `تعديل جدول العمل: ${params.name.trim()} (${params.checkInTime} - ${params.checkOutTime})`,
      user: params.user,
      allowedEmails: cleanEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWorkSchedule(params: {
  schedule: WorkSchedule;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `work_schedules/${params.schedule.id}`;
  try {
    await deleteDoc(doc(db, 'work_schedules', params.schedule.id));
    await writeAuditLog({
      action: 'delete',
      entityType: 'schedule',
      entityId: params.schedule.id,
      summary: `حذف جدول العمل: ${params.schedule.name}`,
      user: params.user,
      allowedEmails: params.allowedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// ATTENDANCE RECORDS CRUD
// ==========================================

export interface SaveAttendanceParams {
  date: string;
  employee: Employee;
  scheduleId: string;
  scheduleName: string;
  scheduledCheckIn: string;
  scheduledCheckOut: string;
  actualCheckIn: string;
  actualCheckOut: string;
  status: AttendanceStatus;
  notes: string;
  user: User;
  allowedEmails: string[];
}

export async function saveAttendanceRecord(params: SaveAttendanceParams): Promise<string> {
  const recordId = buildAttendanceRecordId(params.date, params.employee.id, params.scheduleId);
  const path = `attendance_records/${recordId}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);

  const cleanActualIn = params.status === 'present' ? params.actualCheckIn.trim() : '';
  const cleanActualOut = params.status === 'present' ? params.actualCheckOut.trim() : '';

  const metrics = calculateAttendanceMetrics({
    scheduledCheckIn: params.scheduledCheckIn,
    scheduledCheckOut: params.scheduledCheckOut,
    actualCheckIn: cleanActualIn,
    actualCheckOut: cleanActualOut,
    status: params.status,
  });

  const docRef = doc(db, 'attendance_records', recordId);

  try {
    const existingSnap = await getDoc(docRef);
    const updatedByName = (params.user.displayName || params.user.email || 'مستخدم').slice(0, 100);
    const updatedByEmail = (params.user.email || '').slice(0, 120);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        actualCheckIn: cleanActualIn,
        actualCheckOut: cleanActualOut,
        status: params.status,
        lateMinutes: Math.round(metrics.lateMinutes),
        earlyArrivalMinutes: Math.round(metrics.earlyArrivalMinutes),
        earlyLeaveMinutes: Math.round(metrics.earlyLeaveMinutes),
        overtimeMinutes: Math.round(metrics.overtimeMinutes),
        actualWorkedMinutes: Math.round(metrics.actualWorkedMinutes),
        netTimeDiffMinutes: Math.round(metrics.netTimeDiffMinutes),
        notes: params.notes.trim().slice(0, 300),
        updatedByName,
        updatedByEmail,
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: 'update',
        entityType: 'attendance',
        entityId: recordId,
        summary: `تعديل سجل حضور ${params.employee.name} بتاريخ ${params.date}`,
        user: params.user,
        allowedEmails: cleanEmails,
      });
    } else {
      await setDoc(docRef, {
        date: params.date,
        employeeId: params.employee.id,
        employeeCode: params.employee.employeeCode,
        employeeName: params.employee.name.slice(0, 100),
        department: params.employee.department.slice(0, 60),
        scheduleId: params.scheduleId,
        scheduleName: params.scheduleName.slice(0, 80),
        scheduledCheckIn: params.scheduledCheckIn,
        scheduledCheckOut: params.scheduledCheckOut,
        crossesMidnight: metrics.crossesMidnight,
        actualCheckIn: cleanActualIn,
        actualCheckOut: cleanActualOut,
        status: params.status,
        lateMinutes: Math.round(metrics.lateMinutes),
        earlyArrivalMinutes: Math.round(metrics.earlyArrivalMinutes),
        earlyLeaveMinutes: Math.round(metrics.earlyLeaveMinutes),
        overtimeMinutes: Math.round(metrics.overtimeMinutes),
        actualWorkedMinutes: Math.round(metrics.actualWorkedMinutes),
        netTimeDiffMinutes: Math.round(metrics.netTimeDiffMinutes),
        notes: params.notes.trim().slice(0, 300),
        updatedByName,
        updatedByEmail,
        ownerUid: params.user.uid,
        allowedEmails: cleanEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: 'create',
        entityType: 'attendance',
        entityId: recordId,
        summary: `تسجيل حضور ${params.employee.name} بتاريخ ${params.date} (${params.scheduleName})`,
        user: params.user,
        allowedEmails: cleanEmails,
      });
    }

    return recordId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAttendanceRecord(params: {
  record: AttendanceRecord;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `attendance_records/${params.record.id}`;
  try {
    await deleteDoc(doc(db, 'attendance_records', params.record.id));
    await writeAuditLog({
      action: 'delete',
      entityType: 'attendance',
      entityId: params.record.id,
      summary: `حذف سجل حضور ${params.record.employeeName} بتاريخ ${params.record.date}`,
      user: params.user,
      allowedEmails: params.allowedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// HOLIDAYS CRUD
// ==========================================

export async function createHoliday(params: {
  date: string;
  name: string;
  type: HolidayType;
  appliesToAll: boolean;
  employeeId: string;
  notes: string;
  user: User;
  allowedEmails: string[];
}): Promise<string> {
  const holidayId = makeSafeId('hol');
  const path = `holidays/${holidayId}`;
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);

  try {
    await setDoc(doc(db, 'holidays', holidayId), {
      date: params.date,
      name: params.name.trim().slice(0, 100),
      type: params.type,
      appliesToAll: params.appliesToAll,
      employeeId: params.appliesToAll ? '' : params.employeeId,
      notes: params.notes.trim().slice(0, 300),
      ownerUid: params.user.uid,
      allowedEmails: cleanEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      action: 'create',
      entityType: 'holiday',
      entityId: holidayId,
      summary: `إضافة إجازة/عطلة: ${params.name.trim()} (${params.date})`,
      user: params.user,
      allowedEmails: cleanEmails,
    });

    return holidayId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteHoliday(params: {
  holiday: Holiday;
  user: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `holidays/${params.holiday.id}`;
  try {
    await deleteDoc(doc(db, 'holidays', params.holiday.id));
    await writeAuditLog({
      action: 'delete',
      entityType: 'holiday',
      entityId: params.holiday.id,
      summary: `حذف الإجازة/العطلة: ${params.holiday.name} (${params.holiday.date})`,
      user: params.user,
      allowedEmails: params.allowedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// SETTINGS, USERS & BACKUP/RESTORE
// ==========================================

export async function updateSystemSettings(params: {
  pharmacyName: string;
  branchName: string;
  departments: string[];
  authorizedEmails: string[];
  nextEmployeeSeq: number;
  user: User;
}): Promise<void> {
  const cleanEmails = normalizeAllowedEmails(params.authorizedEmails, params.user.email);
  const path = 'system_settings/main';
  try {
    const ref = doc(db, 'system_settings', 'main');
    const snap = await getDoc(ref);
    const cleanDepts = params.departments
      .map((d) => d.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 20);

    if (snap.exists()) {
      await updateDoc(ref, {
        pharmacyName: params.pharmacyName.trim().slice(0, 100),
        branchName: params.branchName.trim().slice(0, 100),
        departments: cleanDepts.length > 0 ? cleanDepts : DEFAULT_DEPARTMENTS,
        authorizedEmails: cleanEmails,
        nextEmployeeSeq: Math.max(1, Math.round(params.nextEmployeeSeq)),
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        pharmacyName: params.pharmacyName.trim().slice(0, 100),
        branchName: params.branchName.trim().slice(0, 100),
        departments: cleanDepts.length > 0 ? cleanDepts : DEFAULT_DEPARTMENTS,
        authorizedEmails: cleanEmails,
        nextEmployeeSeq: Math.max(1, Math.round(params.nextEmployeeSeq)),
        ownerUid: params.user.uid,
        allowedEmails: cleanEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Sync allowedEmails across existing records so newly authorized team members can query them
    const collectionsToSync = ['employees', 'work_schedules', 'attendance_records', 'holidays'];
    for (const colName of collectionsToSync) {
      const docsSnap = await getDocs(buildAuthorizedCollectionQuery(colName, params.user.email || ''));
      const batch = writeBatch(db);
      let count = 0;
      for (const docSnap of docsSnap.docs) {
        batch.update(docSnap.ref, {
          allowedEmails: cleanEmails,
          updatedAt: serverTimestamp(),
        });
        count += 1;
        if (count >= 400) break;
      }
      if (count > 0) {
        await batch.commit();
      }
    }

    await writeAuditLog({
      action: 'update',
      entityType: 'settings',
      entityId: 'main',
      summary: `تحديث إعدادات النظام والصلاحيات (${params.pharmacyName.trim()})`,
      user: params.user,
      allowedEmails: cleanEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserAccountRole(params: {
  targetUser: UserAccount;
  role: UserRole;
  active: boolean;
  currentUser: User;
  allowedEmails: string[];
}): Promise<void> {
  const path = `users/${params.targetUser.id}`;
  try {
    await updateDoc(doc(db, 'users', params.targetUser.id), {
      role: params.role,
      active: params.active,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      action: 'update',
      entityType: 'user',
      entityId: params.targetUser.id,
      summary: `تحديث صلاحيات المستخدم ${params.targetUser.email} إلى ${params.role} (${params.active ? 'نشط' : 'موقوف'})`,
      user: params.currentUser,
      allowedEmails: params.allowedEmails,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  settings: SystemSettings | null;
  workSchedules: WorkSchedule[];
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  holidays: Holiday[];
}

export async function restoreFromBackupPayload(params: {
  payload: BackupPayload;
  user: User;
  allowedEmails: string[];
}): Promise<{ restoredCount: number }> {
  const cleanEmails = normalizeAllowedEmails(params.allowedEmails, params.user.email);
  let restoredCount = 0;

  try {
    // 1. Restore WorkSchedules first (foreign key target for Employees and AttendanceRecords)
    for (const s of params.payload.workSchedules || []) {
      const meta = computeScheduleMeta(s.checkInTime, s.checkOutTime);
      const ref = doc(db, 'work_schedules', s.id);
      const existingSnap = await getDoc(ref);
      const baseData = {
        name: s.name.slice(0, 80),
        checkInTime: s.checkInTime,
        checkOutTime: s.checkOutTime,
        crossesMidnight: meta.crossesMidnight,
        durationMinutes: meta.durationMinutes,
        description: (s.description || '').slice(0, 200),
        isActive: Boolean(s.isActive),
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      };
      if (existingSnap.exists()) {
        await updateDoc(ref, baseData);
      } else {
        await setDoc(ref, {
          ...baseData,
          ownerUid: params.user.uid,
          createdAt: serverTimestamp(),
        });
      }
      restoredCount += 1;
    }

    // 2. Restore Employees
    for (const emp of params.payload.employees || []) {
      const ref = doc(db, 'employees', emp.id);
      const existingSnap = await getDoc(ref);
      const empData: Record<string, unknown> = {
        employeeCode: emp.employeeCode,
        name: emp.name.slice(0, 100),
        department: emp.department.slice(0, 60),
        defaultScheduleId: emp.defaultScheduleId,
        defaultCheckIn: emp.defaultCheckIn,
        defaultCheckOut: emp.defaultCheckOut,
        workDays: emp.workDays || [0, 1, 2, 3, 4],
        restDays: emp.restDays || [5, 6],
        startDate: emp.startDate,
        status: emp.status,
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      };
      if (typeof emp.hourlyRate === 'number' && !Number.isNaN(emp.hourlyRate)) {
        empData.hourlyRate = emp.hourlyRate;
      }
      if (existingSnap.exists()) {
        await updateDoc(ref, empData);
      } else {
        await setDoc(ref, {
          ...empData,
          ownerUid: params.user.uid,
          createdAt: serverTimestamp(),
        });
      }
      restoredCount += 1;
    }

    // 3. Restore AttendanceRecords (preserving historical snapshot values)
    for (const rec of params.payload.attendanceRecords || []) {
      const recId = buildAttendanceRecordId(rec.date, rec.employeeId, rec.scheduleId);
      const ref = doc(db, 'attendance_records', recId);
      const existingSnap = await getDoc(ref);
      const recData = {
        date: rec.date,
        employeeId: rec.employeeId,
        employeeCode: rec.employeeCode,
        employeeName: rec.employeeName.slice(0, 100),
        department: rec.department.slice(0, 60),
        scheduleId: rec.scheduleId,
        scheduleName: rec.scheduleName.slice(0, 80),
        scheduledCheckIn: rec.scheduledCheckIn,
        scheduledCheckOut: rec.scheduledCheckOut,
        crossesMidnight: Boolean(rec.crossesMidnight),
        actualCheckIn: rec.actualCheckIn || '',
        actualCheckOut: rec.actualCheckOut || '',
        status: rec.status,
        lateMinutes: Math.round(rec.lateMinutes || 0),
        earlyArrivalMinutes: Math.round(rec.earlyArrivalMinutes || 0),
        earlyLeaveMinutes: Math.round(rec.earlyLeaveMinutes || 0),
        overtimeMinutes: Math.round(rec.overtimeMinutes || 0),
        actualWorkedMinutes: Math.round(rec.actualWorkedMinutes || 0),
        netTimeDiffMinutes: Math.round(rec.netTimeDiffMinutes || 0),
        notes: (rec.notes || '').slice(0, 300),
        updatedByName: (params.user.displayName || params.user.email || 'استعادة').slice(0, 100),
        updatedByEmail: (params.user.email || '').slice(0, 120),
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      };
      if (existingSnap.exists()) {
        await updateDoc(ref, recData);
      } else {
        await setDoc(ref, {
          ...recData,
          ownerUid: params.user.uid,
          createdAt: serverTimestamp(),
        });
      }
      restoredCount += 1;
    }

    // 4. Restore Holidays
    for (const h of params.payload.holidays || []) {
      const ref = doc(db, 'holidays', h.id);
      const existingSnap = await getDoc(ref);
      const hData = {
        date: h.date,
        name: h.name.slice(0, 100),
        type: h.type,
        appliesToAll: Boolean(h.appliesToAll),
        employeeId: h.employeeId || '',
        notes: (h.notes || '').slice(0, 300),
        allowedEmails: cleanEmails,
        updatedAt: serverTimestamp(),
      };
      if (existingSnap.exists()) {
        await updateDoc(ref, hData);
      } else {
        await setDoc(ref, {
          ...hData,
          ownerUid: params.user.uid,
          createdAt: serverTimestamp(),
        });
      }
      restoredCount += 1;
    }

    await writeAuditLog({
      action: 'restore',
      entityType: 'backup',
      entityId: 'backup_restore',
      summary: `استعادة نسخة احتياطية تحتوي على ${restoredCount} سجل`,
      user: params.user,
      allowedEmails: cleanEmails,
    });

    return { restoredCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'backup_restore');
  }
}
