"use client";

import { type ReactNode, useEffect, useState } from "react";

type InfoButtonProps = {
  title: string;
  description: string;
  formula?: string;
  bullets?: string[];
  risks?: string[];
  variant?: "icon" | "card";
  label?: ReactNode;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl bg-chip p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-faint">{title}</p>
      <div className="mt-2 text-sm leading-7 text-soft">{children}</div>
    </section>
  );
}

export function InfoButton({
  title,
  description,
  formula,
  bullets,
  risks,
  variant = "icon",
  label,
}: InfoButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const trigger =
    variant === "card" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 text-left shadow-[0_20px_50px_rgba(17,17,17,0.06)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(17,17,17,0.1)]"
        aria-label={`查看 ${title} 說明`}
      >
        {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-[color:var(--border)] bg-chip text-soft transition hover:-translate-y-0.5 hover:text-[color:var(--foreground)]"
        aria-label={`查看 ${title} 說明`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7.5h.01" />
        </svg>
      </button>
    );

  return (
    <>
      {trigger}

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="關閉說明抽屜"
            className="absolute inset-0 bg-overlay"
            onClick={() => setOpen(false)}
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[color:var(--border)] bg-[color:var(--surface-strong)] p-5 shadow-[-24px_0_60px_rgba(17,17,17,0.24)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-faint">說明面板</p>
                <h3 className="mt-2 text-xl font-semibold">{title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-chip text-sm font-semibold text-soft transition hover:text-[color:var(--foreground)]"
                aria-label={`關閉 ${title} 說明`}
              >
                ×
              </button>
            </div>

            <div className="mt-6 overflow-y-auto pr-1">
              <Section title="定義">
                <p>{description}</p>
              </Section>

              {formula ? (
                <Section title="計算">
                  <p>{formula}</p>
                </Section>
              ) : null}

              {bullets && bullets.length > 0 ? (
                <Section title="解讀">
                  <ul className="grid gap-3 text-sm leading-6 text-soft">
                    {bullets.map((bullet) => (
                      <li key={bullet} className="rounded-xl bg-chip px-3 py-3">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {risks && risks.length > 0 ? (
                <Section title="風險">
                  <ul className="grid gap-3 text-sm leading-6 text-soft">
                    {risks.map((risk) => (
                      <li key={risk} className="rounded-xl bg-chip px-3 py-3">
                        {risk}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}