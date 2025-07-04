import RevenueTable from "@/components/RevenueTable";
import { Navigation } from "@/components/Navigation";

export default function Revenue() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Navigation title="Revenue" />
      <RevenueTable />
    </div>
  );
}
