import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { userInfo } = useSelector((state) => state.user);
  const location = useLocation();

  if (!userInfo) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
