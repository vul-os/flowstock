import { Users, Building2 } from "lucide-react";

import { StatCard, StatGrid } from "@/components/ui/stat";

export const StatsCards = ({ customersCount, suppliersCount }) => (
  <StatGrid className="lg:grid-cols-2">
    <StatCard title="Customers" value={customersCount} icon={Users} />
    <StatCard title="Suppliers" value={suppliersCount} icon={Building2} />
  </StatGrid>
);
