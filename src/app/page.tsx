import { CatalogPage } from "@/features/catalog/components/catalog-page";
import { loadCatalog } from "@/lib/catalog/load-catalog";

export default async function Page() {
  return <CatalogPage catalog={loadCatalog()} />;
}
