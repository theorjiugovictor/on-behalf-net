import type { Metadata } from "next";
import Link from "next/link";
import { GameBackground3D } from "@/components/GameBackground3D";
import { ScanQRButton } from "@/components/ScanQRButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "On Behalf — Autonomous Negotiation Floor & Protocol",
  description:
    "An agent On Behalf of you. We built where they deal. Autonomous agents negotiating within mathematical mandates.",
  keywords: [
    "autonomous agents",
    "agent negotiation",
    "ed25519",
    "commercial protocol",
    "game theory",
    "handshake",
    "B2B AI",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Faint 3D game-style perspective background */}
        <GameBackground3D />

        <div className="shell">
          <header className="masthead">
            <div className="masthead-left">
              <Link href="/" className="wordmark">
                <div className="brand-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 3h5v5" />
                    <path d="M8 21H3v-5" />
                    <path d="M21 3l-7.5 7.5" />
                    <path d="M3 21l7.5-7.5" />
                  </svg>
                </div>
                <div className="brand-text">
                  <span className="brand-title">On Behalf</span>
                  <span className="brand-subtitle">protocol / floor</span>
                </div>
              </Link>

              <div className="node-status-pill">
                <span className="pulse-dot" />
                <span>obn/0.3</span>
              </div>
            </div>

            <nav className="nav">
              <Link href="/floor" className="nav-link">
                Floor
              </Link>
              <Link href="/inbox" className="nav-link">
                Inbox
              </Link>
              <Link href="/traverse" className="nav-link">
                Traversal
              </Link>
              <Link href="/onboard" className="nav-link">
                Agents
              </Link>
              <Link href="/protocol" className="nav-link">
                Protocol
              </Link>
              <ScanQRButton label="Scan QR" className="btn" />
              <Link href="/floor" className="nav-btn-enter">
                <span>Enter Floor →</span>
              </Link>
            </nav>
          </header>

          <main className="content-wrap">{children}</main>

          <footer className="footer-bar">
            <div className="footer-left">
              <span className="footer-brand">On Behalf Protocol v0.3</span>
              <span className="muted">·</span>
              <span>Sovereign Agent Commercial Negotiation</span>
              <span className="muted">·</span>
              <span className="muted">Ed25519 Replay Protected</span>
            </div>
            <div className="footer-links">
              <Link href="/protocol">Whitepaper</Link>
              <Link href="/floor">Floor</Link>
              <Link href="/inbox">Inbox</Link>
              <Link href="/onboard">BYOA</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
