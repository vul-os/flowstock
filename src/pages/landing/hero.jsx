import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart2, Package, Clock } from "lucide-react";

const Hero = () => {
  return (
    <div className="bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Modern Inventory Management for Growing Businesses
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Streamline your stock control and accounting with our efficient, easy-to-setup solution. 
            Get started in minutes, not months.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Book Demo
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <Package className="h-12 w-12 text-blue-600 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold mb-2">Inventory Control</h3>
              <p className="text-gray-600">Real-time stock tracking and automated reordering</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <BarChart2 className="h-12 w-12 text-blue-600 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold mb-2">Smart Analytics</h3>
              <p className="text-gray-600">Data-driven insights for better decision making</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow-sm">
              <Clock className="h-12 w-12 text-blue-600 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold mb-2">Quick Setup</h3>
              <p className="text-gray-600">Get up and running in less than 10 minutes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;