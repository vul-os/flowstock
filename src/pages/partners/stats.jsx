import { Users, Building2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const StatsCards = ({ customersCount, suppliersCount }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Customers</CardTitle>
            <CardDescription>Total: {customersCount}</CardDescription>
          </div>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Suppliers</CardTitle>
            <CardDescription>Total: {suppliersCount}</CardDescription>
          </div>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
      </Card>
    </div>
  );
};