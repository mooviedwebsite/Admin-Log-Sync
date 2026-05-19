/**
 * usePlayerLoader.tsx
 *
 * Shared hook used by MoviePage (and anywhere else) to show
 * dark fade + loading toast before the player opens.
 *
 * Usage:
 *   const { showFade, showToast, triggerPlay, cancelPlay } = usePlayerLoader();
 *
 *   // In your button click handler:
 *   triggerPlay(() => setShowPlayer(true));
 *
 *   // Render:
 *   <>
 *     <DarkFade visible={showFade} />
 *     <LoadingToast visible={showToast} />
 *   </>
 */

import { useState, useRef, useCallback } from "react";
import { Wifi } from "lucide-react";

// ── Dark Fade ─────────────────────────────────────────────────────────────────
export function DarkFade({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "opacity 0.45s cubic-bezier(0.4,0,0.2,1)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "all" : "none",
      }}
    />
  );
}

// ── Loading Toast ──────────────────────────────────────────────────────────────
export function LoadingToast({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        right: "28px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 20px",
        borderRadius: "14px",
        background: "rgba(10,10,10,0.97)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.96)",
        pointerEvents: "none",
      }}
    >
      {/* Spinner ring */}
      <div style={{ position:"relative", width:"20px", height:"20px", flexShrink:0 }}>
        <svg width="20" height="20" viewBox="0 0 20 20"
          style={{ animation:"mpl-spin 0.9s linear infinite", display:"block" }}>
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Icon + text */}
      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
        <Wifi size={14} style={{ color:"rgba(250,204,21,0.7)", flexShrink:0 }} />
        <div>
          <p style={{ fontSize:"12px", fontWeight:700, color:"#fff", margin:0, letterSpacing:"0.02em" }}>
            Loading player
          </p>
          <p style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", margin:0, marginTop:"1px" }}>
            Connecting to server…
          </p>
        </div>
      </div>

      {/* Pulse dot */}
      <div style={{
        width:"6px", height:"6px", borderRadius:"50%",
        background:"#FACC15", flexShrink:0,
        animation:"mpl-pulse 1.4s ease-in-out infinite",
      }} />

      <style>{`
        @keyframes mpl-spin  { to { transform: rotate(360deg); } }
        @keyframes mpl-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }
      `}</style>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePlayerLoader() {
  const [showFade,  setShowFade]  = useState(false);
  const [showToast, setShowToast] = useState(false);
  const clickCount = useRef(0);
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPlay = useCallback(() => {
    clickCount.current += 1;
    if (t1.current) clearTimeout(t1.current);
    if (t2.current) clearTimeout(t2.current);
    setShowFade(false);
    setShowToast(false);
  }, []);

  /**
   * triggerPlay(openFn)
   *  1. Immediately: dark fade in
   *  2. +80ms:       loading toast appears
   *  3. +500ms:      openFn() called (e.g. setShowPlayer(true)), fade + toast hide
   */
  const triggerPlay = useCallback((openFn: () => void) => {
    // Prevent double-click: cancel any pending trigger
    cancelPlay();
    const thisClick = ++clickCount.current;

    setShowFade(true);

    t1.current = setTimeout(() => {
      if (clickCount.current !== thisClick) return;
      setShowToast(true);
    }, 80);

    t2.current = setTimeout(() => {
      if (clickCount.current !== thisClick) return;
      setShowFade(false);
      setShowToast(false);
      openFn();
    }, 500);
  }, [cancelPlay]);

  return { showFade, showToast, triggerPlay, cancelPlay };
}
