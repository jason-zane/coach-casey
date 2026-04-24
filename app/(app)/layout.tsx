export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
