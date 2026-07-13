"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isInstalled) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs font-bold text-success-bright">
        ✓ التطبيق مثبت على جهازك
      </div>
    );
  }

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      setInstallPrompt(null);
      return;
    }
    setShowIOSHelp(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className="group flex w-full items-center justify-center gap-3 rounded-[var(--radius-card)] border border-gold/30 bg-gradient-to-l from-gold/15 to-orange-500/5 p-4 text-sm font-extrabold text-gold transition-all hover:border-gold/55 hover:shadow-[0_0_28px_rgba(251,191,36,.14)]"
      >
        <Download className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
        تثبيت الموقع كتطبيق
      </button>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-void/80 p-5 pt-16 backdrop-blur-md">
          <div className="anim-rise relative w-full max-w-sm rounded-[var(--radius-card)] border border-gold/30 bg-void-2 p-6 text-center shadow-[var(--shadow-neon-strong)]">
            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              className="absolute left-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-mute"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
            <Share2 className="mx-auto h-10 w-10 text-gold" />
            <h3 className="mt-4 text-lg font-extrabold text-ink">
              تثبيت مسابقة عصومي
            </h3>
            <p className="mt-3 text-sm leading-7 text-ink-mute">
              {isIOS
                ? "من شريط Safari اضغط زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية»."
                : "افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
