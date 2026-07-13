"use client";

import { useMemo, useState } from "react";
import { Check, Search, Shuffle } from "lucide-react";
import type { Top10Question } from "@/lib/db";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

export type Top10SelectionMode = "random" | "custom" | "selected";
export type Top10DraftEntry = { answer: string; aliases: string };

type Props = {
  questions: Top10Question[];
  mode: Top10SelectionMode;
  onModeChange: (mode: Top10SelectionMode) => void;
  selectedId: string;
  onChooseQuestion: (
    question: Top10Question,
    mode: Exclude<Top10SelectionMode, "custom">,
  ) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  entries: Top10DraftEntry[];
  onEntriesChange: (entries: Top10DraftEntry[]) => void;
};

export default function Top10BankPicker({
  questions,
  mode,
  onModeChange,
  selectedId,
  onChooseQuestion,
  prompt,
  onPromptChange,
  entries,
  onEntriesChange,
}: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar");
    if (!needle) return questions;
    return questions.filter(
      (question) =>
        question.prompt.toLocaleLowerCase("ar").includes(needle) ||
        question.items.some((item) =>
          item.answer.toLocaleLowerCase("ar").includes(needle),
        ),
    );
  }, [questions, search]);
  const selected = questions.find((question) => question.id === selectedId);

  const chooseRandom = () => {
    if (questions.length === 0) return;
    const candidates = questions.filter(
      (question) => question.id !== selectedId,
    );
    const pool = candidates.length > 0 ? candidates : questions;
    const question = pool[Math.floor(Math.random() * pool.length)];
    onChooseQuestion(question, "random");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            { id: "random", label: "اختيار عشوائي", icon: "🎲" },
            { id: "selected", label: "اختيار محدد", icon: "✅" },
            { id: "custom", label: "سؤال مخصص", icon: "✍️" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onModeChange(item.id);
              if (item.id === "random") chooseRandom();
            }}
            className={cn(
              "rounded-xl border px-4 py-3 text-xs font-extrabold transition-all",
              mode === item.id
                ? "border-cyan/45 bg-cyan/10 text-cyan shadow-[0_0_20px_rgba(34,211,238,.12)]"
                : "border-line bg-void/35 text-ink-mute hover:text-ink",
            )}
          >
            <span className="ml-2">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {mode === "random" && (
        <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-cyan">اختيار عشوائي من البنك</p>
              <p className="mt-1 text-xs text-ink-mute">
                يختار النظام سؤالاً كاملاً مع الإجابات والمرادفات العشرة.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={chooseRandom}>
              <Shuffle className="h-4 w-4" /> تغيير السؤال
            </Button>
          </div>
        </div>
      )}

      {mode === "selected" && (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في أسئلة TOP 10 أو إجاباتها..."
            icon={<Search className="h-4 w-4" />}
          />
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-line p-3">
            {filtered.map((question) => {
              const active = question.id === selectedId;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => onChooseQuestion(question, "selected")}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right transition-all",
                    active
                      ? "border-success/45 bg-success/10 text-success-bright"
                      : "border-line bg-void/35 text-ink hover:border-cyan/30",
                  )}
                >
                  <span className="text-xs font-bold leading-6">
                    {question.prompt}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode !== "custom" && selected && (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
          <p className="text-sm font-black text-ink">{selected.prompt}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {selected.items.map((item, index) => (
              <div
                key={`${selected.id}-${index}`}
                className="rounded-xl border border-line bg-void/40 p-3"
              >
                <span className="font-display text-xs font-black text-gold">
                  #{index + 1}
                </span>
                <p className="mt-1 text-xs font-extrabold text-ink">
                  {item.answer}
                </p>
                {item.aliases.length > 0 && (
                  <p className="mt-1 text-[9px] leading-4 text-ink-faint">
                    {item.aliases.join("، ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-5">
            <Field label="السؤال الرئيسي" required>
              <Input
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="مثال: اذكر 10 أشياء تراها في المطبخ"
              />
            </Field>
            <p className="mt-3 text-xs leading-6 text-ink-mute">
              البطاقة الأولى = نقطة واحدة، والعاشرة = 10 نقاط. افصل المرادفات
              بفاصلة.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {entries.map((entry, index) => (
              <div
                key={index}
                className="anim-option-enter rounded-2xl border border-line bg-void/35 p-4"
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-display text-xl font-black text-cyan">
                    #{index + 1}
                  </span>
                  <span className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] font-bold text-gold">
                    {index + 1} نقطة
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={entry.answer}
                    onChange={(event) =>
                      onEntriesChange(
                        entries.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, answer: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="الإجابة المخفية"
                  />
                  <Input
                    value={entry.aliases}
                    onChange={(event) =>
                      onEntriesChange(
                        entries.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, aliases: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="مرادفات: سكينة، سكاكين"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
