import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

const AdminRoute = ({ children }) => {
  const { userInfo } = useSelector((state) => state.user);
  const location = useLocation();

  if (!userInfo || (userInfo.role !== 'organizer' && userInfo.role !== 'admin')) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};

export default AdminRoute;
