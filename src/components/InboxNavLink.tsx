"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function InboxNavLink() {
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch("/api/threads", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { threads?: Array<{ status: string }> };
        const count = (data.threads ?? []).filter((t) => t.status === "awaiting-approval").length;
        if (mounted) setPendingCount(count);
      } catch {
        // ignore
      }
    };
    check();
    const timer = setInterval(check, 3500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/inbox"
      className="nav-link"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <span>Inbox</span>
      {pendingCount > 0 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: "#d97706",
            color: "#ffffff",
            fontSize: 10.5,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            lineHeight: 1,
          }}
          title={`${pendingCount} deal(s) awaiting human sign-off`}
        >
          {pendingCount}
        </span>
      )}
    </Link>
  );
}

