import type { Metadata } from "next";
import Link from "next/link";
import { GameBackground3D } from "@/components/GameBackground3D";
import { ScanQRButton } from "@/components/ScanQRButton";
import { InboxNavLink } from "@/components/InboxNavLink";
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
                    width="18"
                    height="18"
                    viewBox="0 0 64 64"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 36V18C12 14.6863 14.6863 12 18 12H36L28 20H20V28L12 36Z"
                      fill="currentColor"
                    />
                    <path
                      d="M52 28V46C52 49.3137 49.3137 52 46 52H28L36 44H44V36L52 28Z"
                      fill="currentColor"
                    />
                    <rect
                      x="32"
                      y="22.8"
                      width="13"
                      height="13"
                      rx="2.5"
                      transform="rotate(45 32 22.8)"
                      fill="#09090B"
                      stroke="currentColor"
                      strokeWidth="3.2"
                    />
                    <circle cx="32" cy="32" r="3" fill="#16A34A" />
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
              <InboxNavLink />
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
