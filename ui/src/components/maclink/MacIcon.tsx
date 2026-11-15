import React from "react";

type Kind = "laptop" | "mini" | "studio" | "imac";

const kindOf = (model: string): Kind => {
  const m = model.toLowerCase();
  if (m.includes("macbook")) return "laptop";
  if (m.includes("imac")) return "imac";
  if (m.includes("studio") || m.includes("mac pro")) return "studio";
  return "mini";
};

const SCREEN = "rgba(255,255,255,0.07)";

/** Line drawings of the Mac families, so the two machines are told apart at a glance */
export const MacIcon: React.FC<{
  model: string;
  size?: number;
  className?: string;
}> = ({ model, size = 56, className }) => {
  const kind = kindOf(model);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {kind === "laptop" && (
        <>
          <rect x="11" y="13" width="42" height="28" rx="2.5" fill={SCREEN} />
          <path d="M14.5 16.5h35v21h-35z" strokeOpacity={0.35} />
          <path
            d="M5 44h54l-2.5 4.5a2 2 0 0 1-1.8 1H9.3a2 2 0 0 1-1.8-1L5 44z"
            fill={SCREEN}
          />
          <path d="M27 44.5h10" strokeOpacity={0.45} />
        </>
      )}
      {kind === "imac" && (
        <>
          <rect x="7" y="10" width="50" height="34" rx="3" fill={SCREEN} />
          <path d="M7 38h50" strokeOpacity={0.35} />
          <path d="M27 44l-2 9h14l-2-9" />
          <path d="M22 53h20" />
        </>
      )}
      {kind === "mini" && (
        <>
          <rect x="9" y="26" width="46" height="14" rx="4" fill={SCREEN} />
          <path d="M13 30h38" strokeOpacity={0.3} />
          <circle cx="47" cy="35" r="0.9" fill="currentColor" stroke="none" />
          <path d="M15 43.5h34" strokeOpacity={0.25} />
        </>
      )}
      {kind === "studio" && (
        <>
          <rect x="12" y="20" width="40" height="24" rx="4.5" fill={SCREEN} />
          <path d="M16 24h32" strokeOpacity={0.3} />
          <circle cx="21" cy="38" r="1.2" strokeOpacity={0.6} />
          <circle cx="26" cy="38" r="1.2" strokeOpacity={0.6} />
          <path d="M17 47.5h30" strokeOpacity={0.25} />
        </>
      )}
    </svg>
  );
};
