import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Navbar from './Components/Navbar';
import Footer from './Components/Footer';
import Home from './Components/Home';
import EventDetail from './Components/EventDetail';
import SignIn from './Pages/SignIn';
import SignUp from './Pages/SignUp';
import NotFound from './Pages/NotFound';
import MyBookings from './Components/MyBookings';
import Invoice from './Components/Invoice';
import OrganizerDashboard from './Components/OrganizerDashboard';
import ProtectedRoute from './Components/ProtectedRoute';
import AdminRoute from './Components/adminroute';
import Toast from './Components/Toast';
import SeatSelection from './Components/SeatSelection';

export default function App() {
  const { authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] text-white">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-400 mt-4 text-sm font-semibold tracking-wider uppercase">
            Loading BookShow...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col text-white font-sans">
        {/* Animated glass background orbs */}
        <div className="bg-orbs" aria-hidden="true">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
        </div>

        <Navbar />

        <main className="relative z-10 flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/event/:id" element={<EventDetail />} />
            <Route path="/event/:id/seats" element={<SeatSelection />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            
            <Route
              path="/my-bookings"
              element={
                <ProtectedRoute>
                  <MyBookings />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/invoice/:bookingId"
              element={
                <ProtectedRoute>
                  <Invoice />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/products"
              element={
                <AdminRoute>
                  <OrganizerDashboard />
                </AdminRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <Footer />
        <Toast />
      </div>
    </BrowserRouter>
  );
}
