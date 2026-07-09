'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LogOut, BookOpen, Layers, Trophy, Sparkles, User, ShieldCheck, Home } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }

      const { data } = await supabase.from('profiles').select('username, role').eq('id', user.id).single();
      if (data) {
        setProfile(data);
      }
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
    <nav className="w-full bg-slate-950/40 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      {/* Brand Logo */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-7 h-7 text-purple-400 animate-pulse" />
        <span className="font-extrabold text-xl bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
          منصة مسابقة عصومي
        </span>
      </div>

      {/* Navigation Links */}
      <div className="hidden md:flex items-center gap-6">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-4">
        {profile && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/5">
            <User className="w-4 h-4 text-slate-300" />
            <span className="text-xs text-slate-300 font-medium">{profile.username}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
              profile.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
            }`}>
              {profile.role === 'admin' ? 'أدمن' : 'مقدم'}
            </span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 text-red-400 transition-all hover:scale-105"
          title="تسجيل الخروج"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
