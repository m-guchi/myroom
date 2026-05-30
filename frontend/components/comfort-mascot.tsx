"use client";

interface ComfortMascotProps {
  di?: number;
}

function getMascotColor(di?: number) {
  if (di == null) return "#e74c3c";
  if (di < 55) return "#3498db";
  if (di <= 75) return "#2ecc71";
  return "#e67e22";
}

export function ComfortMascot({ di }: ComfortMascotProps) {
  const color = getMascotColor(di);

  return (
    <svg
      viewBox="0 0 80 80"
      className="size-20 shrink-0"
      aria-hidden
    >
      <ellipse cx="40" cy="48" rx="28" ry="26" fill={color} />
      <ellipse cx="40" cy="44" rx="22" ry="20" fill={color} opacity="0.85" />
      <circle cx="30" cy="40" r="3" fill="#fff" />
      <circle cx="50" cy="40" r="3" fill="#fff" />
      <path
        d="M 32 50 Q 40 56 48 50"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <line
        x1="40"
        y1="18"
        x2="40"
        y2="26"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <polygon
        points="40,10 44,20 36,20"
        fill="#f1c40f"
      />
    </svg>
  );
}
