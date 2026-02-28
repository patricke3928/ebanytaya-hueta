"use client";

import { useEffect } from "react";

export type ToastTone = "info" | "success" | "error";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  count?: number;
};

type Props = {
  items: ToastItem[];
  onDismiss: (id: number) => void;
};

export function ToastStack({ items, onDismiss }: Props) {
  useEffect(() => {
    if (items.length === 0) return;

    const timers = items.map((item) =>
      window.setTimeout(() => {
        onDismiss(item.id);
      }, 3600),
    );

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [items, onDismiss]);

  if (items.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone}`}>
          <p>
            {item.message}
            {item.count && item.count > 1 ? ` x${item.count}` : ""}
          </p>
          <button type="button" className="toast-close" onClick={() => onDismiss(item.id)} aria-label="Close">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
