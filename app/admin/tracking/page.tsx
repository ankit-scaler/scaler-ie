import { requireAdminPage } from "@/lib/admin";
import AdminTracking from "@/components/AdminTracking";

export const dynamic = "force-dynamic";

export default async function AdminTrackingPage() {
  await requireAdminPage();
  return <AdminTracking />;
}
