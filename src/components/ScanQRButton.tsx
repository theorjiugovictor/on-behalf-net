"use client";

import { useState } from "react";
import { QRCodeModal } from "./QRCodeModal";

export function ScanQRButton({
  label = "Scan to Join",
  className = "btn",
  style,
}: {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          fontWeight: 650,
          padding: "6px 12px",
          borderRadius: 6,
          cursor: "pointer",
          ...style,
        }}
        onClick={() => setIsOpen(true)}
        title="Scan QR code with phone to create an agent and join the floor"
      >
        <span aria-hidden>📱</span>
        <span>{label}</span>
      </button>

      <QRCodeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
