import Link from 'next/link';

function WorkflowIcon({ className }: { className?: string }) {
  // Vercel-style stacked squares pyramid icon
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      {/* Pyramid of stacked squares - 3 rows */}
      {/* Top row: 1 square */}
      <rect x="10" y="2" width="4" height="4" rx="0.5" />
      {/* Middle row: 2 squares */}
      <rect x="6" y="8" width="4" height="4" rx="0.5" />
      <rect x="14" y="8" width="4" height="4" rx="0.5" />
      {/* Bottom row: 3 squares */}
      <rect x="2" y="14" width="4" height="4" rx="0.5" />
      <rect x="10" y="14" width="4" height="4" rx="0.5" />
      <rect x="18" y="14" width="4" height="4" rx="0.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <WorkflowIcon className="h-6 w-6" />
      <span className="text-lg font-semibold tracking-tight">Workflow</span>
    </Link>
  );
}
