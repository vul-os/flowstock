import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import BlankLayout from './components/layout/blank-layout';
import MainLayout from './components/layout/main-layout';

// Auth Pages
import SignIn from './pages/auth/signin';
import SignUp from './pages/auth/signup';
import ForgotPassword from './pages/auth/forgot-password';
import UpdatePassword from './pages/auth/update-password';
import AcceptInvite from './pages/auth/accept-invite';

// Components
import ProtectedRoute from './components/auth/protected-route';

// Pages
import NotFound from './pages/not-found';
import LandingPage from './pages/landing';

import Home from './pages/home';
import ProductManagement from './pages/products';
import SettingsPage from './pages/settings';

const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<BlankLayout />}>
        {/* Public routes */}
        <Route exact path="/" element={<LandingPage />} />

        <Route path="/login" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/password-reset" element={<ForgotPassword />} />
        <Route path="/update-password" element={<UpdatePassword />} />

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Protected routes */}
      <Route element={<MainLayout />}>
        <Route path="/admin" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/admin/products" element={<ProtectedRoute><ProductManagement /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;