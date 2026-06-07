import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function OrganizerDashboard() {
  const { apiFetch, showToast } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bookingsModalOpen, setBookingsModalOpen] = useState(false);
  const [selectedEventBookings, setSelectedEventBookings] = useState([]);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // AI Analytics State
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Vendor Management State
  const [vendorsModalOpen, setVendorsModalOpen] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCategory, setNewVendorCategory] = useState('Catering');
  const [newVendorCost, setNewVendorCost] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');

  // Live Stream Console State
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [streamInfo, setStreamInfo] = useState({ isLive: false, streamUrl: '' });
  const [streamLoading, setStreamLoading] = useState(false);

  // Coupon Creation State
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState('percentage');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [newCouponUses, setNewCouponUses] = useState('100');

  // New Event Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [category, setCategory] = useState('Concerts');
  const [date, setDate] = useState('');
  const [bookingType, setBookingType] = useState('seated');
  const [basePrice, setBasePrice] = useState('');
  const [totalSeats, setTotalSeats] = useState('');
  const [seatCategories, setSeatCategories] = useState([]); // Array of { name, priceMultiplier } or { name, price }

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadOrganizerEvents = async () => {
    setLoading(true);
    setStatsLoading(true);
    try {
      const res = await apiFetch('/events/my-events');
      setEvents(res.data.events || []);

      const statsRes = await apiFetch('/events/organizer/stats');
      if (statsRes && statsRes.data && statsRes.data.stats) {
        setStats(statsRes.data.stats);
      }
    } catch (err) {
      console.warn('Organizer stats load warning:', err.message);
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizerEvents();
  }, []);

  const openBookingsModal = async (eventId, eventTitle) => {
    setSelectedEventTitle(eventTitle);
    setBookingsModalOpen(true);
    setBookingsLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}/bookings`);
      setSelectedEventBookings(res.data.bookings || []);
    } catch (err) {
      showToast('Failed to load bookings: ' + err.message, 'error');
      setBookingsModalOpen(false);
    } finally {
      setBookingsLoading(false);
    }
  };

  const openAnalyticsModal = async (eventId, eventTitle) => {
    setSelectedEventTitle(eventTitle);
    setAnalyticsModalOpen(true);
    setAnalyticsLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}/ai-analytics`);
      setAnalyticsData(res.data);
    } catch (err) {
      showToast('Failed to load AI analytics: ' + err.message, 'error');
      setAnalyticsModalOpen(false);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openVendorsModal = async (eventId, eventTitle) => {
    setSelectedEventId(eventId);
    setSelectedEventTitle(eventTitle);
    setVendorsModalOpen(true);
    setVendorsLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}/vendors`);
      setVendors(res.data.vendors || []);
    } catch (err) {
      showToast('Failed to load vendors: ' + err.message, 'error');
      setVendorsModalOpen(false);
    } finally {
      setVendorsLoading(false);
    }
  };

  const handleCreateVendor = async (e) => {
    e.preventDefault();
    if (!newVendorName || !newVendorCost) return;
    try {
      const res = await apiFetch(`/events/${selectedEventId}/vendors`, {
        method: 'POST',
        body: JSON.stringify({
          name: newVendorName,
          category: newVendorCategory,
          cost: Number(newVendorCost)
        })
      });
      setVendors([...vendors, res.data.vendor]);
      setNewVendorName('');
      setNewVendorCost('');
      showToast('Vendor contract created!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSettleVendor = async (vendorId) => {
    try {
      const res = await apiFetch(`/events/${selectedEventId}/vendors/${vendorId}/settle`, {
        method: 'POST'
      });
      setVendors(vendors.map(v => v._id === vendorId ? res.data.vendor : v));
      showToast('Vendor logistics contract settled!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openStreamModal = async (eventId, eventTitle) => {
    setSelectedEventId(eventId);
    setSelectedEventTitle(eventTitle);
    setStreamModalOpen(true);
    setStreamLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}/streaming`);
      setStreamInfo(res.data.stream);
    } catch (err) {
      showToast('Failed to load stream status: ' + err.message, 'error');
      setStreamModalOpen(false);
    } finally {
      setStreamLoading(false);
    }
  };

  const handleToggleStream = async (isLive) => {
    try {
      const res = await apiFetch(`/events/${selectedEventId}/streaming`, {
        method: 'POST',
        body: JSON.stringify({ isLive })
      });
      setStreamInfo(res.data.stream);
      showToast(isLive ? 'Live stream started!' : 'Live stream stopped.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!newCouponCode || !newCouponValue) return;
    try {
      await apiFetch('/bookings/coupons/create', {
        method: 'POST',
        body: JSON.stringify({
          code: newCouponCode,
          discountType: newCouponType,
          discountValue: Number(newCouponValue),
          maxUses: Number(newCouponUses)
        })
      });
      showToast('Coupon code created successfully!');
      setNewCouponCode('');
      setNewCouponValue('');
      setCouponModalOpen(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddSeatCategory = () => {
    setSeatCategories([...seatCategories, { name: '', price: '' }]);
  };

  const handleRemoveSeatCategory = (index) => {
    setSeatCategories(seatCategories.filter((_, idx) => idx !== index));
  };

  const handleSeatCategoryChange = (index, field, value) => {
    const updated = seatCategories.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setSeatCategories(updated);
  };

  const handleCreateEventSubmit = async (e) => {
    e.preventDefault();
    if (!title || !venue || !date || !basePrice || !totalSeats) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    // Prepare custom seat categories
    const formattedCategories = seatCategories
      .filter((c) => c.name.trim() !== '' && c.price !== '')
      .map((c) => ({
        name: c.name.trim(),
        price: Number(c.price),
      }));

    try {
      await apiFetch('/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          venue,
          category,
          date,
          bookingType,
          basePrice: Number(basePrice),
          totalSeats: Number(totalSeats),
          seatCategories: formattedCategories,
        }),
      });

      showToast('Event created successfully!');
      setCreateModalOpen(false);
      resetForm();
      loadOrganizerEvents();
    } catch (err) {
      showToast('Failed to create event: ' + err.message, 'error');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setVenue('');
    setCategory('Concerts');
    setDate('');
    setBookingType('seated');
    setBasePrice('');
    setTotalSeats('');
    setSeatCategories([]);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-3xl font-bold mb-8 text-white">Event Management</h2>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-white">Event Management</h2>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm border-yellow-500/40 text-yellow-400 hover:bg-yellow-950/20" onClick={() => setCouponModalOpen(true)}>
            <i className="fas fa-ticket-alt mr-2"></i>Create Coupon
          </button>
          <button className="btn-primary text-sm" onClick={() => setCreateModalOpen(true)}>
            <i className="fas fa-plus mr-2"></i>Create Event
          </button>
        </div>
      </div>

      {/* Dynamic Analytics Stats Grid using MongoDB Aggregations */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 border border-gray-700 bg-gray-900/10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Events</p>
              <h3 className="text-2xl font-black text-white mt-1">{stats.totalEvents}</h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-2"><i className="fas fa-calendar mr-1"></i>Active listings</p>
          </div>
          <div className="card p-5 border border-gray-700 bg-gray-900/10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tickets Sold</p>
              <h3 className="text-2xl font-black text-purple-400 mt-1">
                {stats.totalSeatsSold} <span className="text-xs font-normal text-gray-500">/ {stats.totalCapacity}</span>
              </h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              <i className="fas fa-chart-pie mr-1"></i>
              {stats.totalCapacity > 0 ? Math.round((stats.totalSeatsSold / stats.totalCapacity) * 100) : 0}% booked
            </p>
          </div>
          <div className="card p-5 border border-gray-700 bg-gray-900/10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gross Revenues</p>
              <h3 className="text-2xl font-black text-green-400 mt-1">{formatCurrency(stats.grossRevenue)}</h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-2"><i className="fas fa-arrow-up mr-1 text-green-400"></i>Including discounts</p>
          </div>
          <div className="card p-5 border border-gray-700 bg-gray-900/10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Profit</p>
              <h3 className={`text-2xl font-black mt-1 ${stats.netProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {formatCurrency(stats.netProfit)}
              </h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              <i className="fas fa-truck mr-1 text-yellow-500"></i>Cost: {formatCurrency(stats.vendorCost)}
            </p>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-20 text-gray-500 card border border-gray-700">
          <i className="fas fa-calendar-plus text-5xl mb-4 block"></i>
          <p className="text-xl mb-4">No events created yet</p>
          <button className="btn-primary" onClick={() => setCreateModalOpen(true)}>
            Create Your First Event
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => {
            const available = ev.totalSeats - ev.seatsSold;
            const revenue = ev.seatsSold * ev.basePrice; // Estimate

            return (
              <div
                key={ev._id}
                className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-gray-700 hover:border-gray-500 transition-all duration-300"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xl text-white">{ev.title}</h3>
                    <span className="badge bg-red-950 text-red-300 text-xs uppercase">{ev.bookingType}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm text-gray-400">
                    <p>
                      <i className="fas fa-map-marker-alt mr-2 text-red-500"></i>
                      {ev.venue}
                    </p>
                    <p>
                      <i className="fas fa-clock mr-2 text-blue-400"></i>
                      {formatDate(ev.date)}
                    </p>
                    <p>
                      <i className="fas fa-ticket-alt mr-2 text-green-400"></i>
                      Sold: <span className="text-white">{ev.seatsSold}</span> / {ev.totalSeats}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-right hidden lg:block mr-2">
                    <p className="text-xs text-gray-500">Estimated Revenue</p>
                    <p className="text-green-400 font-bold">{formatCurrency(revenue)}</p>
                  </div>
                  <button
                    className="btn-secondary text-xs py-1.5 px-3"
                    onClick={() => openBookingsModal(ev._id, ev.title)}
                  >
                    <i className="fas fa-users mr-1"></i> Bookings
                  </button>
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 border border-purple-500/30 text-purple-400 hover:bg-purple-950/20"
                    onClick={() => openAnalyticsModal(ev._id, ev.title)}
                  >
                    <i className="fas fa-brain mr-1"></i> AI Analytics
                  </button>
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-950/20"
                    onClick={() => openVendorsModal(ev._id, ev.title)}
                  >
                    <i className="fas fa-truck mr-1"></i> Vendors
                  </button>
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 border border-blue-500/30 text-blue-400 hover:bg-blue-950/20"
                    onClick={() => openStreamModal(ev._id, ev.title)}
                  >
                    <i className="fas fa-video mr-1"></i> Stream
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Create New Event</h3>
              <button
                className="text-gray-500 hover:text-white"
                onClick={() => {
                  setCreateModalOpen(false);
                  resetForm();
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleCreateEventSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Event Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Coldplay World Tour 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">Description</label>
                <textarea
                  className="input"
                  rows="3"
                  placeholder="Describe your event..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Venue *</label>
                  <input
                    className="input"
                    placeholder="e.g. DY Patil Stadium, Mumbai"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Category</label>
                  <select
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="Concerts">Concerts</option>
                    <option value="Movies">Movies</option>
                    <option value="Sports">Sports</option>
                    <option value="Theatre">Theatre</option>
                    <option value="Comedy">Comedy</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Date & Time *</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Booking Type *</label>
                  <select
                    className="input"
                    value={bookingType}
                    onChange={(e) => setBookingType(e.target.value)}
                  >
                    <option value="seated">Seated (Specific Seat Selection)</option>
                    <option value="zone">Zone/Standing (Cluster Booking)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Base Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    placeholder="500"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Total Seats *</label>
                  <input
                    type="number"
                    min="1"
                    max="1500"
                    className="input"
                    placeholder="100"
                    value={totalSeats}
                    onChange={(e) => setTotalSeats(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Seat Categories (optional)</label>
                  <button
                    type="button"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    onClick={handleAddSeatCategory}
                  >
                    <i className="fas fa-plus"></i>Add Category
                  </button>
                </div>

                <div className="space-y-2">
                  {seatCategories.map((cat, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        className="input"
                        placeholder="Category Name (e.g. VIP)"
                        value={cat.name}
                        onChange={(e) => handleSeatCategoryChange(idx, 'name', e.target.value)}
                      />
                      <input
                        type="number"
                        className="input"
                        placeholder="Price (₹)"
                        value={cat.price}
                        onChange={(e) => handleSeatCategoryChange(idx, 'price', e.target.value)}
                      />
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-400 px-2"
                        onClick={() => handleRemoveSeatCategory(idx)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty to use base price for all seats</p>
              </div>

              <button type="submit" className="btn-primary w-full mt-2">
                <i className="fas fa-calendar-plus mr-2"></i>Create Event
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EVENT BOOKINGS DETAIL MODAL */}
      {bookingsModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '700px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Bookings for: {selectedEventTitle}</h3>
              <button
                className="text-gray-500 hover:text-white"
                onClick={() => setBookingsModalOpen(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {bookingsLoading ? (
              <div className="spinner"></div>
            ) : selectedEventBookings.length === 0 ? (
              <p className="text-center text-gray-500 py-10">No tickets purchased for this event yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="py-2">User</th>
                      <th className="py-2">Tickets</th>
                      <th className="py-2">Seats</th>
                      <th className="py-2">Paid</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-white">
                    {selectedEventBookings.map((b) => {
                      const seatsStr = b.seats?.map((s) => s.seatNumber).join(', ') || 'N/A';
                      return (
                        <tr key={b._id}>
                          <td className="py-3">
                            <p className="font-semibold">
                              {b.userId?.profile?.firstName || ''} {b.userId?.profile?.lastName || ''}
                            </p>
                            <p className="text-xs text-gray-500">{b.userId?.email}</p>
                          </td>
                          <td className="py-3">{b.seats?.length}</td>
                          <td className="py-3 font-mono text-xs max-w-[150px] truncate" title={seatsStr}>
                            {seatsStr}
                          </td>
                          <td className="py-3 text-green-400 font-bold">{formatCurrency(b.totalPrice)}</td>
                          <td className="py-3 text-xs text-gray-400">
                            {new Date(b.createdAt).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE COUPON MODAL */}
      {couponModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Create Promo Coupon</h3>
              <button className="text-gray-500 hover:text-white" onClick={() => setCouponModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Coupon Code *</label>
                <input
                  className="input uppercase"
                  placeholder="e.g. SAVE20"
                  value={newCouponCode}
                  onChange={(e) => setNewCouponCode(e.target.value)}
                  style={{ background: '#1c1c1c' }}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Discount Type *</label>
                  <select
                    className="input"
                    value={newCouponType}
                    onChange={(e) => setNewCouponType(e.target.value)}
                    style={{ background: '#1c1c1c' }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Value *</label>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    placeholder="20"
                    value={newCouponValue}
                    onChange={(e) => setNewCouponValue(e.target.value)}
                    style={{ background: '#1c1c1c' }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Max Uses</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={newCouponUses}
                  onChange={(e) => setNewCouponUses(e.target.value)}
                  style={{ background: '#1c1c1c' }}
                />
              </div>
              <button type="submit" className="btn-primary w-full mt-2">Create Coupon</button>
            </form>
          </div>
        </div>
      )}

      {/* AI ANALYTICS MODAL */}
      {analyticsModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="fas fa-brain text-purple-400"></i>AI Turnout & Pricing Forecast
              </h3>
              <button className="text-gray-500 hover:text-white" onClick={() => setAnalyticsModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            {analyticsLoading ? (
              <div className="spinner"></div>
            ) : !analyticsData ? (
              <p className="text-gray-500">Failed to calculate predictive analysis.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="card p-4 border border-gray-800 bg-gray-900/20 text-center">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Predicted Attendance</p>
                    <p className="text-3xl font-extrabold text-purple-400">{analyticsData.predictions.attendancePercent}%</p>
                  </div>
                  <div className="card p-4 border border-gray-800 bg-gray-900/20 text-center">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Turnout Satisfaction</p>
                    <p className="text-3xl font-extrabold text-green-400">{analyticsData.predictions.satisfactionScore}%</p>
                  </div>
                </div>

                <div className="card p-5 border border-gray-800 bg-gray-900/40 space-y-3">
                  <h4 className="font-bold text-sm text-gray-300 uppercase tracking-wider">Dynamic Pricing Recommendations</h4>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Current Price Rate:</span>
                    <span className="font-bold text-white">{formatCurrency(analyticsData.dynamicPricingModel.currentDynamicPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Base Cost Pricing:</span>
                    <span className="text-gray-500">{formatCurrency(analyticsData.dynamicPricingModel.basePrice)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-gray-800 pt-2.5 mt-2">
                    <span className="text-gray-400 font-semibold">Recommended Optimize Price:</span>
                    <span className="font-extrabold text-green-400 text-base">{formatCurrency(analyticsData.dynamicPricingModel.recommendedOptimizePrice)}</span>
                  </div>
                </div>

                <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg p-4 flex items-start gap-3 text-left">
                  <i className="fas fa-magic text-purple-400 text-lg mt-0.5"></i>
                  <div>
                    <h5 className="font-bold text-sm text-purple-200">Recommended Marketing Strategy</h5>
                    <p className="text-xs text-purple-300 mt-1">
                      Our machine learning predictive models estimate a <strong>{analyticsData.predictions.trafficLevel}</strong> booking speed rating. We advise using a <strong>"{analyticsData.dynamicPricingModel.pricingStrategy}"</strong> strategy to maximize ticket revenue.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VENDOR MANAGEMENT MODAL */}
      {vendorsModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '650px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="fas fa-truck text-yellow-500"></i>Vendor Contracts & Settlements
              </h3>
              <button className="text-gray-500 hover:text-white" onClick={() => setVendorsModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6 card p-4 border border-gray-800 bg-gray-900/25">
              <input
                className="input text-sm"
                placeholder="Vendor Name"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                style={{ background: '#1c1c1c' }}
                required
              />
              <select
                className="input text-sm"
                value={newVendorCategory}
                onChange={(e) => setNewVendorCategory(e.target.value)}
                style={{ background: '#1c1c1c' }}
              >
                <option value="Catering">Catering</option>
                <option value="Security">Security</option>
                <option value="Sound & Lights">Sound & Lights</option>
                <option value="Production">Production</option>
                <option value="Logistics">Logistics</option>
              </select>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  className="input text-sm flex-1"
                  placeholder="Cost (₹)"
                  value={newVendorCost}
                  onChange={(e) => setNewVendorCost(e.target.value)}
                  style={{ background: '#1c1c1c' }}
                  required
                />
                <button type="submit" className="btn-primary py-1 px-3.5"><i className="fas fa-plus"></i></button>
              </div>
            </form>

            {vendorsLoading ? (
              <div className="spinner"></div>
            ) : vendors.length === 0 ? (
              <p className="text-center text-gray-500 py-6">No logistics contracts registered.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse text-white">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="py-2">Vendor Name</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Contract Cost</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Settlements</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {vendors.map((v) => (
                      <tr key={v._id}>
                        <td className="py-3 font-semibold">{v.name}</td>
                        <td className="py-3 text-xs text-gray-400">{v.category}</td>
                        <td className="py-3 text-yellow-500 font-bold">{formatCurrency(v.cost)}</td>
                        <td className="py-3">
                          <span className={`badge text-[10px] py-0.5 px-1.5 ${v.status === 'settled' ? 'bg-green-950 text-green-300' : 'bg-yellow-950 text-yellow-300'}`}>
                            {v.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {v.status === 'pending' ? (
                            <button className="btn-primary text-xs py-1 px-2.5" onClick={() => handleSettleVendor(v._id)}>
                              Settle Payout
                            </button>
                          ) : (
                            <span className="text-xs text-gray-500">Paid ({new Date(v.settlementDate).toLocaleDateString()})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIVE STREAM CONSOLE MODAL */}
      {streamModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="fas fa-video text-blue-400"></i>Live Event streaming Console
              </h3>
              <button className="text-gray-500 hover:text-white" onClick={() => setStreamModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            {streamLoading ? (
              <div className="spinner"></div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="p-8 rounded-xl border border-dashed flex flex-col items-center justify-center gap-4 bg-gray-900/10 border-gray-700">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${streamInfo.isLive ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                    <i className="fas fa-broadcast-tower text-3xl"></i>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">{streamInfo.isLive ? 'Broadcasting LIVE' : 'Stream is Offline'}</h4>
                    <p className="text-xs text-gray-400 mt-1">
                      {streamInfo.isLive ? 'Stream simulator is sending feed to the Live Stream Arena.' : 'Start the broadcast simulator feed.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 justify-center">
                  {streamInfo.isLive ? (
                    <button className="btn-secondary text-sm border-red-500/40 text-red-400 hover:bg-red-950/20" onClick={() => handleToggleStream(false)}>
                      <i className="fas fa-stop mr-1"></i>Stop Broadcast
                    </button>
                  ) : (
                    <button className="btn-primary text-sm bg-blue-600 hover:bg-blue-700" onClick={() => handleToggleStream(true)}>
                      <i className="fas fa-play mr-1"></i>Start Broadcast Simulator
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
