import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import MainLayout from './components/layout/main-layout';

import NotFound from './pages/not-found';
import Dashboard from './pages/home';
import ProductManagement from './pages/products';
import ProductPage from './pages/products/product';
import StockPage from './pages/stock';
import ServicesPage from './pages/services';
import PurchaseOrdersPage from './pages/purchase-orders';
import OrdersPage from './pages/orders';
import PartnersPage from './pages/partners';
import CreditorsDebtorsPage from './pages/creditors-debtors';
import ReportsPage from './pages/reports';
import ReportPage from './pages/reports/report';
import SettingsPage from './pages/settings';

const AppRoutes = () => (
  <Routes>
    <Route element={<MainLayout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/products" element={<ProductManagement />} />
      <Route path="/products/:id" element={<ProductPage />} />
      <Route path="/stock" element={<StockPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/partners" element={<PartnersPage />} />
      <Route path="/creditors-debtors" element={<CreditorsDebtorsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/reports/:slug" element={<ReportPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      {/* legacy paths from the hosted era */}
      <Route path="/admin/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
);

export default AppRoutes;
