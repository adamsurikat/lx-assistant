import { ImageResponse } from "next/og";

// Generates the browser-tab favicon at build time (see
// node_modules/next/dist/docs/.../app-icons.md — the `icon.tsx` file
// convention). Motif: a time-clock punch card — a paper card with a slot
// at the top and rows of punched holes, evoking classic time-tracking
// while nodding to the post-it board (orange "punched" row). Colors match
// the app's brand palette in globals.css (--nb-orange / --nb-ink / --nb-paper).
// The card is drawn slightly smaller than the full tile, leaving a small
// transparent margin around it.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const INK = "#111111";
const ORANGE = "#ff5f1f";
const PAPER = "#fdf6ec";

function Hole({ top, left, color }: { top: number; left: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: 2.92,
        height: 2.92,
        display: "flex",
        borderRadius: 0.77,
        background: color,
      }}
    />
  );
}

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2.24,
            left: 2.24,
            width: 27.52,
            height: 27.52,
            display: "flex",
            borderRadius: 6.02,
            background: PAPER,
            border: `1.72px solid ${INK}`,
            boxSizing: "border-box",
          }}
        />
        {/* Punch slot at the top of the card */}
        <div
          style={{
            position: "absolute",
            top: 6.11,
            left: 9.98,
            width: 12.04,
            height: 3.1,
            display: "flex",
            borderRadius: 1.55,
            background: INK,
          }}
        />
        {/* Row of unpunched holes */}
        <Hole top={13.42} left={9.55} color={INK} />
        <Hole top={13.42} left={14.54} color={INK} />
        <Hole top={13.42} left={19.53} color={INK} />
        {/* Row of "punched" holes, in the brand accent color */}
        <Hole top={19.44} left={9.55} color={ORANGE} />
        <Hole top={19.44} left={14.54} color={ORANGE} />
        <Hole top={19.44} left={19.53} color={ORANGE} />
      </div>
    ),
    { ...size }
  );
}
