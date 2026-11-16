# Security Specification & Threat Model

## 1. Data Invariants
1. **Unique Attendance Key**: An `attendance_records` document ID must strictly equal `{date}_{employeeId}_{scheduleId}`, guaranteeing at most one record per employee per date per shift.
2. **Referential Integrity**: Every `employee` must reference an existing `work_schedules` document; every `attendance_record` must reference both an existing `employees` document and an existing `work_schedules` document.
3. **Historical Immutability**: Each `attendance_records` document snapshots `scheduledCheckIn`, `scheduledCheckOut`, and `crossesMidnight` at creation time. Updates to `work_schedules` or `employees` never mutate existing `attendance_records`.
4. **Privilege Escalation Prevention**: Users creating their own `users/{uid}` document cannot assign themselves `admin` or `supervisor` unless their verified email matches the bootstrapped admin (`waleedpharmacy6@gmail.com`). Only an active `admin` can modify user roles.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` (`serverTimestamp()`), and `createdAt` and `ownerUid` are immutable after creation.
6. **Audit Log Immutability**: `audit_logs` are append-only; updates and deletes are unconditionally denied.
7. **PII Isolation**: `users/{uid}` documents (containing email and role) are readable only by the document owner or an active `admin`.
8. **Query Enforcement**: `allow list` never invokes `get()` or `exists()`; it evaluates `resource.data.allowedEmails` or `resource.data.ownerUid` or `isBootstrappedAdmin()` directly.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Email Spoof**: Signed-in user with `email: 'waleedpharmacy6@gmail.com'` and `email_verified: false` attempts to read or write `employees`.
2. **Self-Assigned Admin**: Newly signed-in user creates `/users/{uid}` with `role: 'admin'`.
3. **Role Escalation Update**: User with `role: 'viewer'` updates their `/users/{uid}` doc to `role: 'admin'`.
4. **Ghost Field Injection (Shadow Update)**: Supervisor updates an `employees` doc with extra field `isSuperUser: true`.
5. **Client Timestamp Forgery**: Admin creates an `employees` doc with a backdated `createdAt` timestamp not equal to `request.time`.
6. **Orphan Attendance Record**: Supervisor creates an `attendance_records` doc referencing a non-existent `employeeId: 'emp-fake'`.
7. **Duplicate Attendance Bypass**: Supervisor creates an `attendance_records` doc with random ID `'custom-id-123'` instead of `{date}_{employeeId}_{scheduleId}`.
8. **ID Poisoning (Resource Exhaustion)**: Attacker targets `/employees/` with a 500-character document ID containing special characters (`../$hack`).
9. **String Size Overflow**: Attacker submits a 10KB string inside `attendance_records.notes`.
10. **Audit Log Tampering**: Admin attempts to `update` or `delete` an existing `/audit_logs/{logId}` entry.
11. **Blanket List Scraping**: Uninvited signed-in user runs `getDocs(collection(db, 'employees'))` without being in `allowedEmails`.
12. **PII Cross-Read**: User A (`viewer`) attempts `getDoc(doc(db, 'users', 'userB'))` to read User B's email and role.
