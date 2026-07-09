import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-xl bg-void-2/70 border border-line text-ink ' +
  'placeholder:text-ink-faint transition-all duration-200 ' +
  'focus:outline-none focus:border-neon/60 focus:ring-2 focus:ring-neon/25 ' +
  'disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* Field label wrapper — shared by all inputs                          */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-soft">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  /** When an icon is present it sits on the right (RTL leading edge). */
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, className, ...props },
  ref
) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-ink-faint">
          {icon}
        </span>
        <input
          ref={ref}
          className={cn(fieldBase, 'py-3 pr-11 pl-4 text-sm', className)}
          {...props}
        />
      </div>
    );
  }
  return <input ref={ref} className={cn(fieldBase, 'px-4 py-3 text-sm', className)} {...props} />;
});

/* ------------------------------------------------------------------ */
/* Textarea                                                            */
/* ------------------------------------------------------------------ */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  { className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, 'px-4 py-3 text-sm resize-y', className)}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */
export const Select = forwardRef<
  HTMLSelectElement,
  { className?: string } & React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'appearance-none px-4 py-3 text-sm cursor-pointer bg-[length:0] bg-no-repeat',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export default Input;
