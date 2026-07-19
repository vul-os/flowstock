import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRightCircle } from "lucide-react";
import { REPORTS } from "./reports-config";

const ReportsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title mb-2">Reports</h1>
        <p className="text-muted-foreground">
          Every report is computed live from your local data and can be exported
          to CSV.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.slug}
              className="group hover:shadow-lg transition-all duration-300 ease-in-out border-primary/30 cursor-pointer transform hover:-translate-y-1"
              onClick={() => navigate(`/reports/${report.slug}`)}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" && navigate(`/reports/${report.slug}`)
              }
              role="button"
              aria-label={`View ${report.title} report`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-xl bg-primary-muted text-primary group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold mb-1 text-primary group-hover:text-blue-700 transition-colors">
                        {report.title}
                      </h2>
                      <p className="text-primary mb-2 group-hover:text-blue-600 transition-colors">
                        {report.description}
                      </p>
                      <p className="text-sm text-primary group-hover:text-blue-500 transition-colors">
                        {report.frequency}
                      </p>
                    </div>
                  </div>
                  <ArrowRightCircle className="h-6 w-6 shrink-0 text-primary group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
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
