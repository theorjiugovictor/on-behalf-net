"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const DEFAULT_VERCEL_URL = "https://on-behalf-net.vercel.app/onboard?participate=true";

export function QRCodeDisplay({
  url,
  size = 240,
}: {
  url?: string;
  size?: number;
}) {
  const [svg, setSvg] = useState<string>("");
  const [useVercel, setUseVercel] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  // Compute resolved target URL
  const getUrl = () => {
    if (url) return url;
    if (useVercel) {
      if (process.env.NEXT_PUBLIC_APP_URL) {
        return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/onboard?participate=true`;
      }
      if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/onboard?participate=true`;
      }
      return DEFAULT_VERCEL_URL;
    }
    return typeof window !== "undefined"
      ? `${window.location.origin}/onboard?participate=true`
      : DEFAULT_VERCEL_URL;
  };

  const targetUrl = getUrl();

  useEffect(() => {
    QRCode.toString(targetUrl, {
      type: "svg",
      margin: 1,
      color: {
        dark: "#09090b",
        light: "#ffffff",
      },
    })
      .then((s) => setSvg(s))
      .catch((err) => console.error("Could not generate QR code:", err));
  }, [targetUrl]);

  const copy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "24px 20px",
        background: "#ffffff",
        border: "1.5px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        maxWidth: 360,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          padding: 8,
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span
          className="badge"
          style={{
            background: "#09090b",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.04em",
          }}
        >
          SCAN WITH PHONE CAMERA
        </span>

        <div style={{ display: "inline-flex", background: "var(--surface-2)", padding: 2, borderRadius: 6, border: "1px solid var(--border)" }}>
          <button
            type="button"
            className={`btn ${useVercel ? "btn-primary" : ""}`}
            style={{ fontSize: 10.5, padding: "3px 8px", border: "none" }}
            onClick={() => setUseVercel(true)}
          >
            Live Vercel Link
          </button>
          <button
            type="button"
            className={`btn ${!useVercel ? "btn-primary" : ""}`}
            style={{ fontSize: 10.5, padding: "3px 8px", border: "none" }}
            onClick={() => setUseVercel(false)}
          >
            Local Origin
          </button>
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          marginTop: 10,
          marginBottom: 14,
          lineHeight: 1.45,
        }}
      >
        Instantly create an autonomous agent with your own mandate and step onto the trading floor.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "var(--surface-2)",
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            textAlign: "left",
          }}
        >
          {targetUrl}
        </span>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 11, padding: "3px 8px" }}
          onClick={copy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function QRCodeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(9, 9, 11, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          padding: "28px 24px",
          maxWidth: 440,
          width: "100%",
          position: "relative",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "var(--text-dim)",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div style={{ marginBottom: 18 }}>
          <span className="eyebrow" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>
            Mobile Participation
          </span>
          <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
            Join the Negotiation Network
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "6px 0 0" }}>
            Scan from your phone to spawn your agent, establish a commercial mandate, and negotiate in real time.
          </p>
        </div>

        <QRCodeDisplay size={220} />

        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            background: "var(--surface-2)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.45,
          }}
        >
          <strong>How it works:</strong> Your phone generates an Ed25519 identity key locally. You define what your agent wants and where it must walk away. The protocol presents signed deals for your approval.
        </div>
      </div>
    </div>
  );
}
