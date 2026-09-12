import { notFound } from "next/navigation";
import { SmithControlCenter } from "@/components/admin/smith-control-center";
import "../smith.css";

const sections = new Set([
  "events",
  "previews",
  "tests",
  "approvals",
  "audit",
  "rollback",
  "setup",
]);

export default async function SmithSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <SmithControlCenter />;
}
