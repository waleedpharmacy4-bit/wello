import React, { useState } from 'react';
import { Clock, ShieldCheck, LogIn } from 'lucide-react';
import { signInWithGoogle } from '../services/firestoreService';

export const LoginScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول';
      setError(`حدث خطأ أثناء تسجيل الدخول: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              نظام إدارة الحضور والانصراف
            </h1>
            <p className="text-sm text-slate-500">البوابة الداخلية لإدارة شؤون الصيدلية</p>
          </div>
        </div>

        <div className="my-6 border-t border-slate-100" />

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            سجّل الدخول باستخدام حساب Google المعتمد للوصول إلى سجل الموظفين، جداول الورديات،
            التسجيل اليومي، والتقارير التفصيلية.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <span>حماية البيانات والصلاحيات</span>
            </div>
            <p className="mt-1">
              يتم حفظ جميع السجلات سحابياً بشكل فوري ودائم مع تسجيل اسم المستخدم المسؤول عن كل تعديل.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            <span>{loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول بحساب Google'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
