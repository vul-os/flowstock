import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Car, Package2, AlertTriangle, TrendingUp, Settings, Search, 
  Filter, ArrowUpRight, ArrowDownRight, Box, ShoppingCart,
  Truck, Clock, BarChart3, Calendar
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

const Dashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Sample data for various charts
  const salesData = [
    { month: 'Jun', revenue: 280000, orders: 145, profit: 84000 },
    { month: 'Jul', revenue: 320000, orders: 168, profit: 96000 },
    { month: 'Aug', revenue: 305000, orders: 157, profit: 91500 },
    { month: 'Sep', revenue: 345000, orders: 182, profit: 103500 },
    { month: 'Oct', revenue: 378000, orders: 196, profit: 113400 },
    { month: 'Nov', revenue: 425000, orders: 215, profit: 127500 },
  ];

  const categoryData = [
    { name: 'Engine Parts', value: 35 },
    { name: 'Brake Systems', value: 25 },
    { name: 'Electrical', value: 20 },
    { name: 'Suspension', value: 15 },
    { name: 'Other', value: 5 },
  ];

  const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#64748b'];

  const inventoryStats = [
    {
      title: "Total Parts",
      value: "4,586",
      icon: <Package2 className="h-6 w-6 text-blue-600" />,
      change: "+85",
      trend: "up",
      details: "Across 12 categories"
    },
    {
      title: "Monthly Revenue",
      value: "R425,750",
      icon: <TrendingUp className="h-6 w-6 text-green-600" />,
      change: "+12.3%",
      trend: "up",
      details: "vs last month"
    },
    {
      title: "Critical Stock",
      value: "23",
      icon: <AlertTriangle className="h-6 w-6 text-orange-600" />,
      change: "-5",
      trend: "down",
      details: "Requires attention"
    },
    {
      title: "Active Orders",
      value: "38",
      icon: <ShoppingCart className="h-6 w-6 text-purple-600" />,
      change: "+8",
      trend: "up",
      details: "In processing"
    },
    {
      title: "Average Delivery",
      value: "2.4 days",
      icon: <Truck className="h-6 w-6 text-indigo-600" />,
      change: "-0.5",
      trend: "up",
      details: "Last 30 days"
    },
    {
      title: "Stock Value",
      value: "R2.8M",
      icon: <Box className="h-6 w-6 text-cyan-600" />,
      change: "+5.2%",
      trend: "up",
      details: "Total inventory"
    }
  ];

  const lowStockParts = [
    { 
      name: "Brake Pads - Toyota Hilux 2022", 
      qty: 5, 
      threshold: 15, 
      sku: "BP-TH22",
      category: "Brakes",
      lastOrdered: "2024-11-10",
      supplier: "BrakeTech SA"
    },
    { 
      name: "Oil Filter - VW Golf 7", 
      qty: 8, 
      threshold: 20, 
      sku: "OF-VW7",
      category: "Filters",
      lastOrdered: "2024-11-08",
      supplier: "EuroParts"
    },
    { 
      name: "Timing Belt Kit - Ford Ranger", 
      qty: 3, 
      threshold: 10, 
      sku: "TB-FR21",
      category: "Engine",
      lastOrdered: "2024-11-05",
      supplier: "AutoZone"
    },
    { 
      name: "Spark Plugs - BMW 3 Series", 
      qty: 12, 
      threshold: 30, 
      sku: "SP-BM3",
      category: "Electrical",
      lastOrdered: "2024-11-12",
      supplier: "BMWParts SA"
    }
  ];

  const recentActivities = [
    { 
      type: "order",
      title: "New Order #ORD-2024-1185",
      description: "15 items ordered by AutoFix Workshop",
      time: "10 minutes ago",
      value: "R12,450"
    },
    { 
      type: "alert",
      title: "Low Stock Alert",
      description: "Brake Pads - Toyota Hilux 2022 below threshold",
      time: "25 minutes ago"
    },
    { 
      type: "delivery",
      title: "Delivery Completed",
      description: "Order #ORD-2024-1182 delivered to Customer",
      time: "1 hour ago",
      value: "R8,750"
    },
    { 
      type: "stock",
      title: "Stock Updated",
      description: "Received 50x Oil Filters from supplier",
      time: "2 hours ago"
    }
  ];

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Home</h1>
          <p className="text-gray-500">Reports Summary</p>
        </div>
        <div className="flex space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search parts, orders, or suppliers..."
              className="pl-10 pr-4 py-2 border rounded-md w-80"
            />
          </div>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Time Period Selector */}
      <div className="flex gap-2">
        {['week', 'month', 'quarter', 'year'].map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded-md ${
              selectedPeriod === period 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {inventoryStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                {stat.icon}
                <span className={`text-sm font-medium ${
                  stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change}
                  {stat.trend === 'up' ? 
                    <ArrowUpRight className="h-4 w-4 inline ml-1" /> : 
                    <ArrowDownRight className="h-4 w-4 inline ml-1" />
                  }
                </span>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.title}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.details}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Revenue & Profit Trend</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                  Revenue
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                  Profit
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis 
                    tickFormatter={(value) => `R${value / 1000}k`}
                  />
                  <Tooltip 
                    formatter={(value) => [`R${value.toLocaleString()}`, 'Amount']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#16a34a" 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Critical Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Critical Stock Alerts</span>
              <button className="text-sm text-blue-600 hover:text-blue-800">
                View All
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockParts.map((part, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{part.name}</p>
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-700">
                        {part.category}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm text-gray-500">
                      <span>SKU: {part.sku}</span>
                      <span>Supplier: {part.supplier}</span>
                      <span>Last Order: {part.lastOrdered}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full ${
                      part.qty <= part.threshold / 2 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {part.qty} in stock
                    </span>
                    <button className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                      Reorder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent Activity</span>
              <button className="text-sm text-blue-600 hover:text-blue-800">
                View All
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className={`p-2 rounded-full ${
                    activity.type === 'order' ? 'bg-green-100' :
                    activity.type === 'alert' ? 'bg-red-100' :
                    activity.type === 'delivery' ? 'bg-blue-100' :
                    activity.type === 'stock' ? 'bg-yellow-100' : 'bg-gray-100'
                  }`}>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{activity.title}</p>
                      <span className="text-sm text-gray-500">{activity.time}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                    {activity.value && (
                      <p className="text-sm font-medium text-green-600 mt-1">{activity.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default Dashboard;