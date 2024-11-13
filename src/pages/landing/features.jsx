import React from 'react';
import { Check } from 'lucide-react';
import FlowStockScreenshot from '@/assets/flowstock-screenshot.png';

const Features = () => {
  const features = [
    {
      title: "Complete Stock Management",
      points: [
        "Real-time inventory tracking and valuation",
        "Batch tracking and expiry date management",
      ]
    },
    {
      title: "Advanced Accounting Features",
      points: [
        "Comprehensive debtors and creditors management",
        "Automated payment reminders and tracking",
        "Account reconciliation and aging reports",
      ]
    },
    {
      title: "Powerful Reporting Suite",
      points: [
        "Customizable financial statements and reports",
        "Real-time profit and loss analysis",
        "Cash flow forecasting and management",
        "Tax compliance and GST reporting"
      ]
    }
  ];

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-6">
        {/* Centered Title and Description */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl font-bold mb-4">
            Streamline Your Business Operations
          </h2>
          <p className="text-lg text-gray-600">
            An all-in-one solution that combines powerful stock management with comprehensive accounting features to help you make better business decisions.
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Image */}
          <div className="relative">
            <div className="bg-gray-200 rounded-lg shadow-xl overflow-hidden">
              <img
                src={FlowStockScreenshot}
                alt="FlowStock Dashboard"
                className="w-full h-auto"
              />
            </div>
            {/* Feature highlight dots */}
            <div className="absolute top-1/4 right-1/4 w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
            <div className="absolute bottom-1/3 left-1/3 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
          </div>

          {/* Right Column - Features */}
          <div className="space-y-12">
            {features.map((feature, index) => (
              <div key={index} className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <ul className="space-y-3">
                  {feature.points.map((point, pointIndex) => (
                    <li key={pointIndex} className="flex items-start">
                      <Check className="h-5 w-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Statistics Section */}
      <div className="container mx-auto px-6 mt-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { number: "99.9%", label: "Uptime" },
            { number: "24/7", label: "Support" },
            { number: "100k+", label: "Active SKU's" },
            { number: "3+", label: "Countries" }
          ].map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {stat.number}
              </div>
              <div className="text-gray-600">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;