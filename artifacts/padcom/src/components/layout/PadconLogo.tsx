interface PadconLogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PadconLogo({ className = "", showText = true, size = "md" }: PadconLogoProps) {
  const iconSize = size === "sm" ? 26 : size === "md" ? 32 : 42;
  const fontSize = size === "sm" ? "text-lg" : size === "md" ? "text-xl" : "text-2xl";
  const subSize = size === "sm" ? "text-[7px]" : size === "md" ? "text-[9px]" : "text-[11px]";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M18 10C11.4 10 6 15.4 6 22C6 26.2 8.2 29.9 11.5 32L11.5 36C11.5 37.7 12.8 39 14.5 39L24 39"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          className="text-sidebar-primary"
        />
        <circle cx="30" cy="14" r="3.5" className="text-sidebar-primary" fill="currentColor" opacity="0.8"/>
        <path
          d="M30 10C36.6 10 42 15.4 42 22C42 26.2 39.8 29.9 36.5 32L36.5 36C36.5 37.7 35.2 39 33.5 39L24 39"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
      </svg>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`${fontSize} font-bold tracking-tight`}>
            Pad<span className="text-sidebar-primary">con</span>
          </span>
          <span className={`${subSize} tracking-[0.22em] uppercase opacity-50 font-semibold mt-0.5`}>
            Conect
          </span>
        </div>
      )}
    </div>
  );
}
