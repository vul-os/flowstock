import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Box, DollarSign, TrendingUp } from "lucide-react";

const Home = () => {
  const stockStats = [
    {
      title: "Total Products",
      value: "2,345",
      icon: <Box className="h-6 w-6 text-blue-600" />,
      change: "+12.5%",
      trend: "up"
    },
    {
      title: "Total Value",
      value: "$123,456",
      icon: <DollarSign className="h-6 w-6 text-green-600" />,
      change: "+8.2%",
      trend: "up"
    },
    {
      title: "Active Orders",
      value: "45",
      icon: <Activity className="h-6 w-6 text-orange-600" />,
      change: "-2.4%",
      trend: "down"
    },
    {
      title: "Monthly Sales",
      value: "$28,456",
      icon: <TrendingUp className="h-6 w-6 text-purple-600" />,
      change: "+18.9%",
      trend: "up"
    }
  ];

  const lowStockItems = [
    { name: "Laptop Dell XPS", qty: 5, threshold: 10 },
    { name: "iPhone 15 Pro", qty: 3, threshold: 15 },
    { name: "Samsung TV", qty: 2, threshold: 8 },
    { name: "AirPods Pro", qty: 4, threshold: 12 }
  ];

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Stock Management</h1>
        <div className="space-x-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Product</button>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">Generate Report</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stockStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                {stat.icon}
                <span className={`text-sm font-medium ${
                  stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">Threshold: {item.threshold}</p>
                  </div>
                  <div className="flex items-center">
                    <span className={`px-3 py-1 rounded-full ${
                      item.qty <= item.threshold / 2 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.qty} left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: "Product Added", item: "MacBook Pro", time: "2 hours ago" },
                { action: "Stock Updated", item: "iPhone 15 Pro", time: "4 hours ago" },
                { action: "Order Fulfilled", item: "Samsung TV", time: "5 hours ago" },
                { action: "Low Stock Alert", item: "AirPods Pro", time: "6 hours ago" }
              ].map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-2">
                  <div>
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-gray-500">{activity.item}</p>
                  </div>
                  <span className="text-sm text-gray-500">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Home;