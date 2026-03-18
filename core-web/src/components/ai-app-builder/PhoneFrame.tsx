import type { ReactNode } from "react";

/**
 * iPhone device frame for app preview.
 * Renders children inside a phone-shaped container with
 * Dynamic Island, status bar, and home indicator.
 */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 290,
          height: 590,
          borderRadius: 40,
          border: "6px solid #1C1C1E",
          backgroundColor: "#000000",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
          flexShrink: 0,
        }}
      >
        {/* Dynamic Island */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 84,
            height: 24,
            borderRadius: 20,
            backgroundColor: "#000000",
            zIndex: 20,
          }}
        />

        {/* Status bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 54,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 20px 6px",
            backgroundColor: "#FFFFFF",
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
              color: "#000",
            }}
          >
            9:41
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Signal bars */}
            <svg width="16" height="11" viewBox="0 0 16 11" fill="#000">
              <rect x="0" y="7" width="3" height="4" rx="0.5" />
              <rect x="4.5" y="4.5" width="3" height="6.5" rx="0.5" />
              <rect x="9" y="2" width="3" height="9" rx="0.5" />
              <rect x="13.5" y="0" width="3" height="11" rx="0.5" opacity="0.3" />
            </svg>
            {/* WiFi */}
            <svg width="13" height="11" viewBox="0 0 13 11" fill="#000">
              <path d="M6.5 9.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5z" />
              <path
                d="M3.5 8a4.5 4.5 0 016 0"
                stroke="#000"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M1 5.5a7.5 7.5 0 0111 0"
                stroke="#000"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            {/* Battery */}
            <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="19"
                height="10"
                rx="2"
                stroke="#000"
                strokeWidth="1"
              />
              <rect x="2" y="2" width="14" height="7" rx="1" fill="#000" />
              <path
                d="M21 4v3"
                stroke="#000"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Screen content */}
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 0,
            right: 0,
            bottom: 20,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
          }}
        >
          {children}
        </div>

        {/* Home indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: "50%",
            transform: "translateX(-50%)",
            width: 100,
            height: 4,
            borderRadius: 2,
            backgroundColor: "#3A3A3C",
            zIndex: 10,
          }}
        />
      </div>
    </div>
  );
}
