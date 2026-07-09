'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
      } else {
        setAuthenticated(true);
      }
    }
    checkAuth();
  }, [router]);

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-t-purple-500 border-white/5 animate-spin" />
          <p className="text-slate-400 text-sm">جاري التحقق من الهوية...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-950 text-slate-100 font-sans flex flex-col">
      <Navbar />
      <div className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
