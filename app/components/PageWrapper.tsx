"use client";

// Wraps every page's <main> to give consistent fade-in on navigation.
// Usage: replace <main ...> with <PageWrapper className="...">
export function PageWrapper({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={className}
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      {children}
    </main>
  );
}
