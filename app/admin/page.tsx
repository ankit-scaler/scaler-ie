import { redirect } from "next/navigation";

// /admin used to be one monolithic dashboard; it's now split into
// /admin/tracking, /admin/access, /admin/content. This keeps old
// links/bookmarks to plain /admin working by landing on the default section
// — auth/admin gating happens on that page itself.
export default function AdminPage() {
  redirect("/admin/tracking");
}
