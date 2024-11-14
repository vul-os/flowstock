// ProtectedRoute.jsx
import React, { useContext, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Progress } from "@/components/ui/progress";
import { AuthContext } from '../../context/use-auth';

const REDIRECT_STORAGE_KEY = 'auth_redirect_data';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      const currentPath = location.pathname + location.search;
      localStorage.setItem(REDIRECT_STORAGE_KEY, currentPath);
    }
  }, [user, loading, location]);

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto mt-8">
        <Progress value={33} className="w-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;