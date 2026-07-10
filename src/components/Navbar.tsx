'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  LogOut,
  BookOpen,
  Layers,
  Trophy,
  User,
  Home,
  Menu,
  X,
  Zap,
} from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      const { data } = await supabase.from('profiles').select('username, role').eq('id', user.id).single();
      if (data) setProfile(data);
    }
    fetchProfile();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  const navLinks = [
    { href: '/dashboard', label: 'الرئيسية', icon: Home },
    { href: '/dashboard/questions', label: 'بنك الأسئلة', icon: BookOpen },
    { href: '/dashboard/sessions', label: 'الجلسات', icon: Layers },
    { href: '/dashboard/winners', label: 'أرشيف الفائزين', icon: Trophy },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-line bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        {/* Brand */}
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon)]">
            <Zap className="h-5 w-5 text-white" fill="currentColor" />
          </span>
          <span className="font-brand hidden text-2xl text-gradient sm:inline">
            عَصُومِي
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-neon/10 text-neon-bright'
                    : 'text-ink-mute hover:bg-white/5 hover:text-ink'
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-l from-transparent via-neon to-transparent" />
                )}
              </Link>
            );
          })}
        </div>

        {/* User + actions */}
        <div className="flex items-center gap-2">
          {profile && (
            <div className="hidden items-center gap-2 rounded-full border border-line bg-white/5 py-1 pl-1 pr-3 sm:flex">
              <User className="h-4 w-4 text-ink-mute" />
              <span className="text-xs font-medium text-ink-soft">{profile.username}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  profile.role === 'admin'
                    ? 'bg-neon/20 text-neon-bright'
                    : 'bg-cyan/20 text-cyan'
                )}
              >
                {profile.role === 'admin' ? 'أدمن' : 'مقدم'}
              </span>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger-bright transition-all hover:bg-danger/20 hover:shadow-[var(--shadow-danger)]"
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="h-4 w-4" />
          </button>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-line bg-white/5 text-ink-soft md:hidden"
            aria-label="القائمة"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-line bg-void-2/95 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive ? 'bg-neon/10 text-neon-bright' : 'text-ink-mute hover:bg-white/5'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
            {profile && (
              <div className="mt-2 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-mute">
                <User className="h-4 w-4" />
                {profile.username}
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-bold">
                  {profile.role === 'admin' ? 'أدمن' : 'مقدم'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
