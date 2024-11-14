import React from 'react';
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Eg from './eg.avif'

const ProductPage = () => {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-900">
      {/* Back Button */}
      <div className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="mx-auto max-w-7xl px-8 py-4">
          <Link 
            to="/admin/products"
            className="inline-flex items-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-8 py-12">
        {/* Top Section - Title, Description, and Image */}
        <div className="mb-16 grid gap-16 lg:grid-cols-2">
          <div>
            <h1 className="mb-6 text-6xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
              SF-AB A765
            </h1>
            <p className="mb-8 text-xl text-neutral-600 dark:text-neutral-400">
              Assorted Screw Set
            </p>
            <p className="text-pretty text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
              Introducing the SF-AB A765 Assorted Screw Set – the ultimate solution for your screw fastening needs. This comprehensive set includes a wide variety of screws meticulously curated to tackle various projects with ease and precision.
            </p>
          </div>
          
          <div className="flex items-start justify-end">
            <img 
              src={Eg} 
              alt="Mockup boxes of assorted screw set"
              className="max-w-xl rounded-lg object-contain"
            />
          </div>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="description" className="w-full">
          <TabsList className="mb-8 inline-flex w-auto space-x-8 rounded-none border-b border-neutral-200 bg-transparent p-0 dark:border-neutral-700">
            <TabsTrigger 
              value="description" 
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-base font-medium data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            >
              Description
            </TabsTrigger>
            <TabsTrigger 
              value="specifications" 
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-base font-medium data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400"
            >
              Specifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="description">
            <div className="grid gap-16 lg:grid-cols-2">
              <div>
                <h2 className="mb-4 text-3xl font-bold text-neutral-800 dark:text-neutral-200">
                  Versatile Screw Fastening Solutions
                </h2>
                <p className="mb-8 text-lg text-neutral-600 dark:text-neutral-400">
                  The SF-AB A765 Assorted Screw Set offers unmatched versatility and convenience, making it the perfect choice for DIY enthusiasts and professionals alike.
                </p>
                <Button 
                  size="lg" 
                  className="group rounded-full bg-blue-600 px-8 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Contact sales to learn more
                  <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {[
                  {
                    title: "Wide Variety",
                    description: "Includes a diverse range of screw types and sizes to accommodate various applications and materials."
                  },
                  {
                    title: "Ease of Use",
                    description: "Each screw is designed for effortless installation, ensuring hassle-free fastening every time."
                  },
                  {
                    title: "Convenience",
                    description: "Eliminates the need for multiple trips to the hardware store, saving time and effort."
                  },
                  {
                    title: "Quality",
                    description: "Premium materials and precision engineering ensure long-lasting performance."
                  }
                ].map((feature, index) => (
                  <div key={index}>
                    <h3 className="mb-2 text-lg font-bold text-neutral-800 dark:text-neutral-200">
                      {feature.title}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="specifications">
            <div className="grid gap-16 lg:grid-cols-2">
              <div className="space-y-8">
                {[
                  {
                    title: "Material",
                    description: "High-quality stainless steel construction ensuring durability and corrosion resistance."
                  },
                  {
                    title: "Assortment",
                    description: "Comprehensive selection including wood screws, machine screws, and sheet metal screws."
                  },
                  {
                    title: "Applications",
                    description: "Suitable for woodworking, metalworking, and general construction projects."
                  }
                ].map((spec, index) => (
                  <div key={index}>
                    <h3 className="mb-2 text-lg font-bold text-neutral-800 dark:text-neutral-200">
                      {spec.title}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      {spec.description}
                    </p>
                  </div>
                ))}
              </div>

              <Card className="h-fit border-neutral-100 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-800">
                <CardContent className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="pb-4 text-left text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Specification
                        </th>
                        <th className="pb-4 text-right text-sm font-medium uppercase tracking-wider text-neutral-500">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {[
                        { spec: "Length Range", value: "10-50mm" },
                        { spec: "Material", value: "Stainless Steel" },
                        { spec: "Finish", value: "Zinc Plated" },
                        { spec: "Head Type", value: "Various" },
                        { spec: "Thread Type", value: "Multiple" },
                        { spec: "Package Quantity", value: "500+ pcs" }
                      ].map((row, index) => (
                        <tr key={index}>
                          <td className="py-4 text-neutral-600 dark:text-neutral-400">
                            {row.spec}
                          </td>
                          <td className="py-4 text-right text-neutral-600 dark:text-neutral-400">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default ProductPage;