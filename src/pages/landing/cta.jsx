import React from 'react';
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
} from "lucide-react";

// CTA Section
const CTA = () => {
  return (
    <section className="py-20 bg-blue-600">
      <div className="container mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Ready to start trading smarter?
        </h2>
        <p className="text-xl text-blue-100 mb-8">
          Join thousands of successful traders using FlowStock today
        </p>
        <div className="flex justify-center gap-4">
          <Button size="lg" variant="secondary" className="gap-2 bg-white text-blue-600 hover:bg-blue-50">
            Get Started Now <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="text-black border-white hover:bg-blue-500">
            Contact Sales
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CTA;