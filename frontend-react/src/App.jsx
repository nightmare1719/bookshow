import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import Home from './components/Home';
import EventDetail from './components/EventDetail';
import SeatSelection from './components/SeatSelection';
import Checkout from './components/Checkout';
import Invoice from './components/Invoice';
import MyBookings from './components/MyBookings';
import OrganizerDashboard from './components/OrganizerDashboard';
import AuthModal from './components/AuthModal';
import Toast from './components/Toast';

export default function App() {
  const { authLoading } = useApp();
  const [page, setPage] = useState({ name: 'home' });

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
    <div className="min-h-screen flex flex-col bg-[#0f0f0f] text-white">
      <Navbar setPage={setPage} />

      <main className="flex-1">
        {page.name === 'home' && <Home setPage={setPage} />}
        {page.name === 'event-detail' && (
          <EventDetail eventId={page.eventId} setPage={setPage} />
        )}
        {page.name === 'seats' && (
          <SeatSelection eventId={page.eventId} setPage={setPage} />
        )}
        {page.name === 'checkout' && (
          <Checkout
            eventId={page.eventId}
            selectedSeats={page.selectedSeats}
            setPage={setPage}
          />
        )}
        {page.name === 'invoice' && (
          <Invoice bookingId={page.bookingId} setPage={setPage} />
        )}
        {page.name === 'my-bookings' && <MyBookings setPage={setPage} />}
        {page.name === 'organizer' && <OrganizerDashboard />}
      </main>

      <AuthModal />
      <Toast />
    </div>
  );
}
