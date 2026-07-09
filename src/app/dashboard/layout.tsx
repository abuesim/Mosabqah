'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Background from '@/components/ui/Background';
import Spinner from '@/components/ui/Spinner';

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
      <div className="grid min-h-screen place-items-center">
        <Spinner size="lg" label="جاري التحقق من الهوية..." />
      </div>
    );
  }

  return (
    <Background variant="subtle" className="flex flex-col">
      <Navbar />
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</div>
    </Background>
  );
}
