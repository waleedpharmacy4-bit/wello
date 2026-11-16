import React, { useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type { UserAccount } from '../types/attendance';

export type NavSectionId =
  | 'dashboard'
  | 'daily-entry'
  | 'attendance-log'
  | 'employees'
  | 'schedules'
  | 'daily-report'
  | 'monthly-reports'
  | 'settings';

interface LayoutProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  pharmacyName: string;
  branchName: string;
  userAccount: UserAccount;
  onSignOut: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: NavSectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'daily-entry', label: 'التسجيل اليومي', icon: ClipboardCheck },
  { id: 'attendance-log', label: 'سجل الحضور والانصراف', icon: History },
  { id: 'employees', label: 'إدارة الموظفين', icon: Users },
  { id: 'schedules', label: 'جداول العمل والإجازات', icon: CalendarClock },
  { id: 'daily-report', label: 'التقارير اليومية', icon: FileSpreadsheet },
  { id: 'monthly-reports', label: 'التقارير الشهرية والمقارنة', icon: BarChart3 },
  { id: 'settings', label: 'إعدادات النظام', icon: Settings },
];

function getRoleArabic(role: UserAccount['role']): string {
  switch (role) {
    case 'admin':
      return 'مدير النظام';
    case 'supervisor':
      return 'مشرف حضور';
    case 'viewer':
      return 'قراءة فقط';
  }
}

export const Layout: React.FC<LayoutProps> = ({
  activeSection,
  onSelectSection,
  pharmacyName,
  branchName,
  userAccount,
  onSignOut,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentItem = NAV_ITEMS.find((item) => item.id === activeSection) || NAV_ITEMS[0];

  const handleNavClick = (id: NavSectionId) => {
    onSelectSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-64 flex-col border-l border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-slate-900">
              {pharmacyName || 'نظام الصيدلية'}
            </div>
            <div className="truncate text-xs text-slate-500">
              {branchName || 'إدارة الحضور والانصراف'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-teal-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {userAccount.displayName}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span>{getRoleArabic(userAccount.role)}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{userAccount.email}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-red-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="فتح القائمة"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden text-slate-400 sm:inline whitespace-nowrap">
                {pharmacyName}
              </span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
                /
              </span>
              <h2 className="truncate text-base font-bold text-slate-900">
                {currentItem.label}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeSection !== 'daily-entry' && userAccount.role !== 'viewer' && (
              <button
                type="button"
                onClick={() => onSelectSection('daily-entry')}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                تسجيل حضور اليوم
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
