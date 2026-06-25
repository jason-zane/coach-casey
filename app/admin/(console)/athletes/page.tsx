import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAdminPageData } from "@/lib/admin/page-data";
import { PageHeader } from "../_components/ui";
import { AthletesTable } from "./_table";

export const dynamic = "force-dynamic";

/**
 * Full cohort table. Filter/sort live client-side over the loaded set; per-row
 * actions (test toggle, weekly review, regenerate debrief, message) and a link
 * into each athlete's detail page.
 */
export default async function AthletesPage() {
  const gate = await requireAdmin();
  if (!gate.ok) redirect("/admin/login");

  const { athletes } = await loadAdminPageData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Console"
        title="Athletes"
        lede="Every athlete, newest first. Toggle the test flag, retrigger a weekly review or debrief, or open one to see the full picture."
      />
      <AthletesTable athletes={athletes} />
    </div>
  );
}
