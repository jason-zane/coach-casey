import { TimezoneCapture } from "./_components/timezone-capture";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <TimezoneCapture />
      {children}
    </div>
  );
}
