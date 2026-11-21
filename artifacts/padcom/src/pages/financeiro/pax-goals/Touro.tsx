/** Ícone de touro (marco da trilha). Cor herda do tema (currentColor). */
export function Touro({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5c1 6 4 8 8 8M29 5c-1 6-4 8-8 8" />
      <path d="M11 13c-2 1-3 3-3 6 0 5 3 9 8 9s8-4 8-9c0-3-1-5-3-6" />
      <path d="M11 13c1.5-1 3-1.5 5-1.5s3.500.5 5 1.5" />
      <circle cx="13" cy="19" r=".8" fill="currentColor" /><circle cx="19" cy="19" r=".8" fill="currentColor" />
      <path d="M13.500 25h5" />
    </svg>
  );
}
