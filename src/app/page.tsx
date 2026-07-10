import Link from 'next/link';
import { Trophy, ShieldCheck, Monitor, Gamepad2 } from 'lucide-react';
import Background from '@/components/ui/Background';

export default function Home() {
  return (
    <Background className="grid place-items-center p-4 md:p-6">
      <div className="anim-rise w-full max-w-xl">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="anim-float mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <h1 className="font-brand text-5xl text-gradient md:text-6xl">
            مُسَابَقَة عَصُومِي
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-ink-mute md:text-base">
            المنصة التفاعلية المتكاملة لإدارة التحديات والمسابقات العائلية بالوقت الفعلي
          </p>
        </div>

        {/* Portal cards */}
        <div className="flex flex-col gap-4">
          <PortalCard
            href="/player"
            icon={<Gamepad2 className="h-6 w-6" />}
            title="دخول كمتسابق"
            desc="انضم إلى الجلسة النشطة وأجب عن الأسئلة من هاتفك"
            tone="neon"
          />
          <PortalCard
            href="/dashboard"
            icon={<ShieldCheck className="h-6 w-6" />}
            title="لوحة تحكم مقدم اللعبة"
            desc="سجل الدخول لإدارة بنك الأسئلة المركزي والتحكم بجلساتك"
            tone="cyan"
          />

          {/* TV hint */}
          <div className="glass flex items-center gap-4 rounded-[var(--radius-card)] p-5 text-right">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <Monitor className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">شاشة التلفزيون للجمهور</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                لعرض الأسئلة والنتيجة على الشاشة الكبيرة، استخدم الرابط مع كود الغرفة:
              </p>
              <code dir="ltr" className="mt-2 inline-block rounded-lg border border-line bg-void/60 px-3 py-1 font-display text-xs font-bold text-gold select-all">
                /tv?code=XXXX
              </code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-ink-faint">
          الإصدار 2.5.0 SaaS • مدعوم بـ Next.js و Supabase Realtime
        </p>
      </div>
    </Background>
  );
}

function PortalCard({
  href,
  icon,
  title,
  desc,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: 'neon' | 'cyan';
}) {
  const toneClasses =
    tone === 'neon'
      ? 'from-neon/15 to-neon-deep/5 border-neon/20 hover:border-neon/40 text-neon-bright'
      : 'from-cyan/15 to-cyan-deep/5 border-cyan/20 hover:border-cyan/40 text-cyan';

  return (
    <Link
      href={href}
      className={`group glass rounded-[var(--radius-card)] border bg-gradient-to-l p-5 transition-all duration-300 hover:shadow-[var(--shadow-neon)] ${toneClasses}`}
    >
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 ${tone === 'neon' ? 'text-neon-bright' : 'text-cyan'} transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-extrabold text-ink">{title}</h4>
          <p className="mt-0.5 text-xs text-ink-mute">{desc}</p>
        </div>
      </div>
    </Link>
  );
}
