import { notFound } from "next/navigation";
import { SmithControlCenter } from "@/components/admin/smith-control-center";
import { isAdminControlSection } from "@/lib/admin-control-sections";
import "../smith.css";

export default async function SmithSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "overview" || !isAdminControlSection(section)) notFound();
  return <SmithControlCenter />;
}
