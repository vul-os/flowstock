import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { 
  LineChart, 
  BarChart3, 
  Calendar, 
  DollarSign, 
  Scale, 
  Wallet, 
  ClipboardList,
  ArrowRightCircle
} from 'lucide-react';

const ReportsPage = () => {
  const navigate = useNavigate();

  const reports = [
    {
      title: "Cash Flow Statement",
      description: "Track money movement with operating, investing, and financing activities",
      frequency: "Monthly Review",
      icon: LineChart,
      slug: "cash-flow",
    },
    {
      title: "Accounts Aging",
      description: "Monitor receivables and payables by age for better cash management",
      frequency: "Weekly Review",
      icon: Calendar,
      slug: "accounts-aging",
    },
    {
      title: "Profit & Loss",
      description: "Review income, expenses, and overall profitability",
      frequency: "Monthly/Quarterly Review",
      icon: DollarSign,
      slug: "profit-loss",
    },
    {
      title: "Balance Sheet",
      description: "View assets, liabilities, and equity position",
      frequency: "Monthly Review",
      icon: Scale,
      slug: "balance-sheet",
    },
    {
      title: "Budget vs. Actual",
      description: "Compare planned versus actual financial performance",
      frequency: "Monthly Review",
      icon: BarChart3,
      slug: "budget-actual",
    },
    {
      title: "Inventory Management",
      description: "Track stock levels, turnover rates, and item performance",
      frequency: "Weekly Review",
      icon: ClipboardList,
      slug: "inventory",
    },
    {
      title: "Sales Report",
      description: "Monitor revenue streams and sales team performance",
      frequency: "Daily/Weekly Review",
      icon: Wallet,
      slug: "sales",
    }
  ];

  const handleCardClick = (slug) => {
    navigate(`/admin/reports/${slug}`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-white">Reports</h1>
        <p className="text-white">Essential reports for monitoring business performance</p>
      </div>

      <div className="grid gap-4">
        {reports.map((report, index) => {
          const Icon = report.icon;
          return (
            <Card 
              key={index} 
              className="group hover:shadow-lg transition-all duration-300 ease-in-out border-blue-100 cursor-pointer transform hover:-translate-y-1"
              onClick={() => handleCardClick(report.slug)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleCardClick(report.slug)}
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
                  <ArrowRightCircle className="h-6 w-6 text-blue-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
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