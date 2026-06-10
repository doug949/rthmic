export function RecordFlipIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <ellipse cx="12" cy="12" rx="7" ry="3.4" transform="rotate(-18 12 12)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" />
      <path d="M5.2 8.1C6.5 5.9 9 4.5 12 4.5c1.7 0 3.2.4 4.5 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m15.2 3.7 1.8 2.1-2.6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.8 15.9c-1.3 2.2-3.8 3.6-6.8 3.6-1.7 0-3.2-.4-4.5-1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m8.8 20.3-1.8-2.1 2.6-.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
