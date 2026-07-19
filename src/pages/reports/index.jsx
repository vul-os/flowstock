import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import {
  Boxes,
  ArrowLeftRight,
  AlertTriangle,
  TrendingUp,
  Scale,
  ArrowRightCircle,
} from 'lucide-react';

export const REPORTS = [
  {
    slug: 'inventory-valuation',
    title: 'Inventory Valuation',
    description: 'Stock on hand valued at cost and at retail, per variant with grand totals',
    frequency: 'Monthly review',
    icon: Boxes,
  },
  {
    slug: 'stock-movements',
    title: 'Stock Movements',
    description: 'Full movement ledger — receipts, sales, transfers and adjustments, filterable',
    frequency: 'Daily review',
    icon: ArrowLeftRight,
  },
  {
    slug: 'low-stock',
    title: 'Low Stock',
    description: 'Items at or below their reorder point, with shortfall and supplier hints',
    frequency: 'Weekly review',
    icon: AlertTriangle,
  },
  {
    slug: 'sales',
    title: 'Sales',
    description: 'Monthly revenue for the trailing 12 months, top products and top customers',
    frequency: 'Weekly review',
    icon: TrendingUp,
  },
  {
    slug: 'accounts',
    title: 'Creditors & Debtors',
    description: 'Outstanding balances — who owes you and who you owe, with totals',
    frequency: 'Weekly review',
    icon: Scale,
  },
];

const ReportsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 tracking-tight">Reports</h1>
        <p className="text-gray-500">
          Every report is computed live from your local data and can be exported to CSV.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.slug}
              className="group hover:shadow-lg transition-all duration-300 ease-in-out border-blue-100 cursor-pointer transform hover:-translate-y-1"
              onClick={() => navigate(`/reports/${report.slug}`)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/reports/${report.slug}`)}
              role="button"
              aria-label={`View ${report.title} report`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-xl bg-blue-50 text-blue-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold mb-1 text-blue-900 group-hover:text-blue-700 transition-colors">
                        {report.title}
                      </h2>
                      <p className="text-blue-700 mb-2 group-hover:text-blue-600 transition-colors">
                        {report.description}
                      </p>
                      <p className="text-sm text-blue-400 group-hover:text-blue-500 transition-colors">
                        {report.frequency}
                      </p>
                    </div>
                  </div>
                  <ArrowRightCircle className="h-6 w-6 shrink-0 text-blue-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ReportsPage;
