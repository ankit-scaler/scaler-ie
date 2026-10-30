import { requireAdminPage } from "@/lib/admin";
import AdminContent from "@/components/AdminContent";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  await requireAdminPage();
  return <AdminContent />;
}
