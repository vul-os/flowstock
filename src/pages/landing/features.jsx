import React from 'react';
import { 
  Users,
  Shield,
  LineChart
} from "lucide-react";

// Features Section
const Features = () => {
    return (
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Everything you need to trade successfully</h2>
            <p className="text-xl text-gray-600">Powerful features to help you make informed decisions</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <LineChart className="h-8 w-8 text-blue-600" />,
                title: "Technical Analysis",
                description: "Advanced charting tools and technical indicators for in-depth market analysis"
              },
              {
                icon: <Shield className="h-8 w-8 text-blue-600" />,
                title: "Risk Management",
                description: "Built-in risk assessment tools to protect your investments"
              },
              {
                icon: <Users className="h-8 w-8 text-blue-600" />,
                title: "Social Trading",
                description: "Learn from successful traders and share strategies with the community"
              },
              // Add more features as needed
            ].map((feature, index) => (
              <div key={index} className="p-6 border rounded-lg hover:shadow-lg transition-shadow">
                {feature.icon}
                <h3 className="text-xl font-semibold mt-4 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };
  
  export default Features