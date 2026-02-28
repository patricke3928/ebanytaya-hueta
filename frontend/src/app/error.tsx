"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page auth-page">
      <section className="panel auth-card">
        <h1 className="heading" style={{ fontSize: 28 }}>
          Something went wrong
        </h1>
        <p className="subtle" style={{ marginBottom: 12 }}>
          Unexpected UI error. You can retry the page or go back to dashboard.
        </p>
        <div className="top-actions">
          <button className="primary-btn" type="button" onClick={reset}>
            Retry
          </button>
          <Link className="secondary-btn" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
