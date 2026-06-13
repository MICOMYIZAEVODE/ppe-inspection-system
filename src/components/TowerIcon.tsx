export function TowerIcon({ className = "w-12 h-12 text-[#1D9E75]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 6 L32 58 L42 6" />
      <path d="M24 18 L40 18" />
      <path d="M22 30 L42 30" />
      <path d="M20 44 L44 44" />
      <path d="M32 6 L32 2" />
      <circle cx="32" cy="2" r="1.5" fill="currentColor" />
    </svg>
  );
}
