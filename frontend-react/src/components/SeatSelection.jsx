import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function SeatSelection({ eventId, setPage }) {
  const { apiFetch, showToast } = useApp();
  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection states
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [zoneQuantities, setZoneQuantities] = useState({});
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    const loadSeatsData = async () => {
      setLoading(true);
      try {
        const [eventData, seatsData] = await Promise.all([
          apiFetch(`/events/${eventId}`),
          apiFetch(`/events/${eventId}/seats`),
        ]);
        setEvent(eventData.data.event);
        setSeats(seatsData.data.seats || []);
      } catch (err) {
        showToast('Failed to load seat layout: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      loadSeatsData();
    }
  }, [eventId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'event-detail', eventId })}
        >
          <i className="fas fa-arrow-left"></i> Back to Event
        </button>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-center">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'event-detail', eventId })}
        >
          <i className="fas fa-arrow-left"></i> Back to Event
        </button>
        <p className="text-xl text-gray-400">Event not found.</p>
      </div>
    );
  }

  const isZoneType = event.bookingType === 'zone';

  // Zone specific logic
  const uniqueCategories = [...new Set(seats.map((s) => s.category))];
  const catColors = [
    'bg-blue-900 border-blue-500 text-blue-300',
    'bg-purple-900 border-purple-500 text-purple-300',
    'bg-yellow-900 border-yellow-500 text-yellow-300',
    'bg-pink-900 border-pink-500 text-pink-300',
  ];

  const handleZoneQtyChange = (zoneName, delta, maxAvailable) => {
    const currentQty = zoneQuantities[zoneName] || 0;
    let newQty = currentQty + delta;
    if (newQty < 0) newQty = 0;

    // Calculate total selected tickets
    const otherZonesQty = Object.keys(zoneQuantities)
      .filter((k) => k !== zoneName)
      .reduce((acc, k) => acc + zoneQuantities[k], 0);

    if (otherZonesQty + newQty > 10) {
      showToast('Max 10 tickets per booking', 'error');
      return;
    }
    if (newQty > maxAvailable) {
      showToast(`Only ${maxAvailable} tickets available in this zone`, 'error');
      return;
    }

    const updatedQties = { ...zoneQuantities, [zoneName]: newQty };
    setZoneQuantities(updatedQties);

    // Rebuild selectedSeats list for this zone
    const zoneSeats = seats.filter((s) => s.category === zoneName && s.status === 'available');
    const newSelectedForThisZone = zoneSeats.slice(0, newQty);

    setSelectedSeats((prev) => {
      const filtered = prev.filter((s) => s.category !== zoneName);
      return [...filtered, ...newSelectedForThisZone];
    });
  };

  // Seated specific logic
  const rows = {};
  seats.forEach((s) => {
    const row = s.seatNumber.charAt(0);
    if (!rows[row]) rows[row] = [];
    rows[row].push(s);
  });

  const toggleSeat = (seat) => {
    const isSelected = selectedSeats.some((s) => s._id === seat._id);
    if (isSelected) {
      setSelectedSeats((prev) => prev.filter((s) => s._id !== seat._id));
    } else {
      if (selectedSeats.length >= 10) {
        showToast('Max 10 seats per booking', 'error');
        return;
      }
      setSelectedSeats((prev) => [...prev, seat]);
    }
  };

  const handleProceed = async () => {
    if (!selectedSeats.length) return;
    setLocking(true);
    const lockResults = [];

    for (const seat of selectedSeats) {
      try {
        await apiFetch('/seats/lock', {
          method: 'POST',
          body: JSON.stringify({ seatId: seat._id }),
        });
        lockResults.push(seat);
      } catch (err) {
        showToast(`Could not lock seat ${seat.seatNumber}: ${err.message}`, 'error');
      }
    }

    setLocking(false);
    if (!lockResults.length) return;

    setPage({
      name: 'checkout',
      eventId: event._id,
      selectedSeats: lockResults,
    });
  };

  const totalAmount = selectedSeats.reduce((acc, s) => acc + s.price, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        className="text-gray-400 hover:text-white mb-6 flex items-center gap-2 transition-colors"
        disabled={locking}
        onClick={() => setPage({ name: 'event-detail', eventId })}
      >
        <i className="fas fa-arrow-left"></i> Back to Event
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{event.title}</h2>
          <p className="text-gray-400 text-sm mt-1">
            <i className="fas fa-map-marker-alt mr-1 text-red-500"></i>
            {event.venue} &nbsp;|&nbsp; <i className="fas fa-clock mr-1 text-blue-400"></i>
            {formatDate(event.date)}
          </p>
        </div>
      </div>

      {isZoneType ? (
        // Zone selection layout
        <div>
          <div className="bg-yellow-900/20 border border-yellow-700/50 text-yellow-300 p-4 rounded-xl mb-6 text-sm flex items-center gap-3">
            <i className="fas fa-info-circle text-lg flex-shrink-0"></i>
            <span>
              This is a Zone/Standing admission event. Please select your zone and ticket quantity below.
              No specific seats are assigned.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {uniqueCategories.map((c, i) => {
              const catSeats = seats.filter((s) => s.category === c);
              const availableSeats = catSeats.filter((s) => s.status === 'available');
              const price = catSeats[0]?.price || 0;
              const colorParts = catColors[i % catColors.length].split(' ');
              const colorDot = colorParts[0];

              return (
                <div
                  key={c}
                  className="card p-6 flex items-center justify-between gap-4 border border-gray-700 hover:border-red-500/50 transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full ${colorDot}`}></span>
                      <h3 className="font-bold text-xl capitalize text-white">{c}</h3>
                    </div>
                    <p className="text-green-400 font-bold text-lg mt-1">{formatCurrency(price)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      <i className="fas fa-ticket-alt mr-1"></i>
                      {availableSeats.length} tickets left
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-900 rounded-lg p-1.5 border border-gray-700">
                    <button
                      type="button"
                      className="w-8 h-8 rounded-md bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-all font-bold"
                      onClick={() => handleZoneQtyChange(c, -1, availableSeats.length)}
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-lg text-white">
                      {zoneQuantities[c] || 0}
                    </span>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-md bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-all font-bold"
                      onClick={() => handleZoneQtyChange(c, 1, availableSeats.length)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Seated layout map
        <div>
          <div className="card p-6 mb-6">
            <div className="screen-label"></div>
            <p className="text-center text-gray-500 text-xs mb-8 -mt-4 uppercase tracking-wider">
              SCREEN / STAGE
            </p>
            <div className="space-y-2 overflow-x-auto pb-4">
              {Object.keys(rows)
                .sort()
                .map((row) => (
                  <div key={row} className="flex items-center gap-2 min-w-max">
                    <span className="text-gray-500 text-xs w-4 text-right pr-1">{row}</span>
                    {rows[row]
                      .sort((a, b) => parseInt(a.seatNumber.slice(1)) - parseInt(b.seatNumber.slice(1)))
                      .map((seat) => {
                        const catIdx = uniqueCategories.indexOf(seat.category);
                        const isSelected = selectedSeats.some((s) => s._id === seat._id);
                        let seatClass = seat.status;
                        if (seat.status === 'available') {
                          seatClass += ` cat-${catIdx % 4}`;
                        }
                        if (isSelected) {
                          seatClass = 'selected';
                        }

                        return (
                          <button
                            type="button"
                            key={seat._id}
                            className={`seat ${seatClass}`}
                            title={`${seat.seatNumber} - ${seat.category} - ${formatCurrency(seat.price)}`}
                            disabled={seat.status !== 'available'}
                            onClick={() => toggleSeat(seat)}
                          >
                            {seat.seatNumber.slice(1)}
                          </button>
                        );
                      })}
                  </div>
                ))}
            </div>
          </div>

          {/* Legends */}
          <div className="flex flex-wrap gap-4 mb-6 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
            <div className="flex items-center gap-2 text-sm">
              <div className="seat available w-5 h-5 text-xs"></div>
              <span className="text-gray-400">Available</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="seat selected w-5 h-5 text-xs"></div>
              <span className="text-gray-400">Selected</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="seat locked w-5 h-5 text-xs"></div>
              <span className="text-gray-400">Locked</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="seat booked w-5 h-5 text-xs"></div>
              <span className="text-gray-400">Booked</span>
            </div>
            {uniqueCategories.map((c, i) => {
              const seatsInCat = seats.filter((s) => s.category === c);
              const price = seatsInCat[0]?.price || 0;
              const borderStyles = catColors[i % catColors.length].split(' ').slice(0, 2).join(' ');

              return (
                <div key={c} className="flex items-center gap-2 text-sm">
                  <div className={`w-4 h-4 rounded border-2 ${borderStyles}`}></div>
                  <span className="text-white capitalize">
                    {c} - {formatCurrency(price)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Box */}
      <div className="card p-5 flex items-center justify-between mt-8">
        <div>
          <p className="text-gray-400 text-sm">
            {isZoneType ? 'Selected Tickets' : 'Selected Seats'}
          </p>
          <p className="font-bold text-lg text-white">
            {selectedSeats.length
              ? isZoneType
                ? `${selectedSeats.length} ticket(s)`
                : selectedSeats.map((s) => s.seatNumber).join(', ')
              : 'None'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">Total</p>
          <p className="font-bold text-2xl text-green-400">{formatCurrency(totalAmount)}</p>
        </div>
        <button
          className="btn-primary px-8 py-3 text-lg flex items-center gap-2"
          disabled={selectedSeats.length === 0 || locking}
          onClick={handleProceed}
        >
          {locking ? (
            <>
              <i className="fas fa-spinner fa-spin"></i> Processing...
            </>
          ) : (
            <>
              <i className="fas fa-arrow-right"></i> Proceed
            </>
          )}
        </button>
      </div>
    </div>
  );
}
