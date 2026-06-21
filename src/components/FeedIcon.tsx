import { useState } from "react";

const PALETTE = [
  "#64748B", "#C2410C", "#4D7C0F", "#A16207",
  "#7E22CE", "#0F766E", "#BE185D", "#4338CA",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function textColor(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 128 ? "#1C1917" : "#FFFFFF";
}

const SIZES = { sm: 16, md: 20, lg: 24 };

function SvgIcon({ title, px }: { title: string; px: number }) {
  const bg = PALETTE[hashString(title) % PALETTE.length];
  const letter = title.charAt(0).toUpperCase();
  const fg = textColor(bg);

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 40"
      className="shrink-0"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill={bg} />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill={fg}
        fontFamily="Georgia, serif"
        fontSize="20"
        fontWeight="bold"
      >
        {letter}
      </text>
    </svg>
  );
}

export default function FeedIcon({
  title,
  icon,
  emailIcon,
  size = "md",
}: {
  title: string;
  icon?: string | null;
  emailIcon?: string | null;
  size?: keyof typeof SIZES;
}) {
  const [broken, setBroken] = useState(false);
  const src = icon || emailIcon;
  const px = SIZES[size];

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: px, height: px }}
        className="object-contain shrink-0"
        onError={() => setBroken(true)}
      />
    );
  }

  return <SvgIcon title={title} px={px} />;
}
