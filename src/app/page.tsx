import Link from 'next/link';
import { Trophy, ShieldCheck, Monitor, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-950 text-slate-100 font-sans">
      <div className="w-full max-w-lg p-10 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl relative text-center space-y-8">
        {/* Decorative glows */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-indigo-500/20 rounded-full blur-3xl" />

        {/* Title */}
        <div className="space-y-3 relative">
          <div className="inline-flex p-4 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
            <Trophy className="w-12 h-12 text-purple-400 animate-bounce" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-indigo-300 to-purple-400">
            مُسَابَقَة عَصُومِي
          </h1>
          <p className="text-slate-400 text-sm md:text-base mt-2">
            المنصة التفاعلية المتكاملة لإدارة التحديات والمسابقات العائلية بالوقت الفعلي
          </p>
        </div>

        {/* Portal Options */}
        <div className="flex flex-col gap-4 relative">
          {/* Option 1: Player client */}
          <Link
            href="/player"
            className="p-5 rounded-2xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 border border-purple-500/20 hover:border-purple-500/40 transition-all flex items-center justify-between text-right"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/15 text-purple-300">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-100 text-sm md:text-base">دخول كمتسابق 🎮</h4>
                <p className="text-slate-400 text-xs mt-1">انضم إلى الجلسة النشطة وأجب عن الأسئلة من هاتفك</p>
              </div>
            </div>
          </Link>

          {/* Option 2: Presenter auth portal */}
          <Link
            href="/dashboard"
            className="p-5 rounded-2xl bg-gradient-to-r from-slate-900/60 to-slate-900/40 hover:from-slate-900/80 hover:to-slate-900/60 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between text-right"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-300">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-100 text-sm md:text-base">لوحة تحكم مقدم اللعبة 🎙️</h4>
                <p className="text-slate-400 text-xs mt-1">سجل الدخول لإدارة بنك الأسئلة المركزي والتحكم بجلساتك</p>
              </div>
            </div>
          </Link>

          {/* Option 3: TV Display Screen instructions */}
          <div className="p-5 rounded-2xl bg-slate-900/30 border border-white/5 text-slate-400 text-xs text-center">
            لعرض النتيجة والأسئلة للجمهور على شاشة التلفزيون الكبيرة، يرجى التوجه إلى الرابط التالي مع كود الغرفة:
            <div className="mt-2 font-mono font-bold text-slate-300 select-all">
              /tv?code=رمز_الغرفة
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 relative">
          الإصدار 2.5.0 SaaS • مدعوم بـ Next.js و Supabase Realtime
        </div>
      </div>
    </main>
  );
}
