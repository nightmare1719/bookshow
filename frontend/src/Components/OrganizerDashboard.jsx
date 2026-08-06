import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function OrganizerDashboard() {
  const { apiFetch, showToast, currentUser, openAuthModal } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    venue: '',
    category: '',
    image: '',
    bookingType: 'seated',
    screenName: '',
    columns: '',
    rows: '',
    seatCategories: [{ name: 'General', price: '', seats: '' }],
    showtimes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const [couponForm, setCouponForm] = useState({
    code: '',
    discountType: 'percentage',
    discountValue: '',
    expirationDays: 30,
    maxUses: 100
  });

  const [adForm, setAdForm] = useState({
    title: '',
    message: ''
  });

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/bookings/coupons/create', {
        method: 'POST',
        body: JSON.stringify(couponForm)
      });
      showToast('Coupon created successfully!');
      setCouponForm({
        code: '',
        discountType: 'percentage',
        discountValue: '',
        expirationDays: 30,
        maxUses: 100
      });
    } catch (err) {
      showToast(err.message || 'Failed to create coupon', 'error');
    }
  };

  const handlePushAd = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/users/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({ ...adForm, type: 'info' })
      });
      showToast('Ad broadcasted successfully!');
      setAdForm({ title: '', message: '' });
    } catch (err) {
      showToast(err.message || 'Failed to broadcast ad', 'error');
    }
  };

  const isUserAuthorized = currentUser && (currentUser.role === 'organizer' || currentUser.role === 'admin');

  useEffect(() => {
    if (!currentUser) {
      openAuthModal('login');
      setLoading(false);
      return;
    }
    if (!isUserAuthorized) {
      setLoading(false);
      return;
    }
    fetchEvents();
  }, [currentUser]);

  const fetchEvents = async () => {
    try {
      const data = await apiFetch('/events/my-events');
      setEvents(data.data.events);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    let val = e.target.value;
    if (e.target.name === 'rows' || e.target.name === 'columns') {
      const parsed = parseInt(val);
      if (!isNaN(parsed)) {
        val = String(Math.max(1, parsed));
      }
    }
    setFormData((prev) => ({ ...prev, [e.target.name]: val }));
  };

  const handleCategoryChange = (index, field, value) => {
    setFormData((prev) => {
      const cats = [...prev.seatCategories];
      cats[index] = { ...cats[index], [field]: value };
      return { ...prev, seatCategories: cats };
    });
  };

  const addCategory = () => {
    setFormData((prev) => ({
      ...prev,
      seatCategories: [...prev.seatCategories, { name: '', price: '', seats: '' }],
    }));
  };

  const removeCategory = (index) => {
    setFormData((prev) => ({
      ...prev,
      seatCategories: prev.seatCategories.filter((_, i) => i !== index),
    }));
  };

  const handleEdit = (event) => {
    setEditingId(event._id);
    let formattedDate = '';
    if (event.date) {
      const d = new Date(event.date);
      const tzOffset = d.getTimezoneOffset() * 60000;
      formattedDate = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
    }

    setFormData({
      title: event.title || '',
      description: event.description || '',
      date: formattedDate,
      venue: event.venue || '',
      category: event.category || '',
      image: event.image || '',
      bookingType: event.bookingType || 'seated',
      screenName: event.screenName || '',
      columns: event.columns || '',
      rows: event.rows || '',
      seatCategories: event.seatCategories || [{ name: 'General', price: '', seats: '' }],
      showtimes: event.showtimes ? event.showtimes.join(', ') : '',
    });
    setShowForm(true);
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event and its associated seats? This action cannot be undone.')) {
      return;
    }

    try {
      await apiFetch(`/events/${eventId}`, {
        method: 'DELETE',
      });
      showToast('Event deleted successfully!');
      fetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to delete event', 'error');
    }
  };

  const getColumnCount = (colStr) => {
    if (!colStr) return 0;
    const clean = String(colStr).trim();
    if (clean.includes(',')) {
      return clean.split(',').map(s => s.trim()).filter(Boolean).length;
    }
    const parsed = parseInt(clean);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return clean.length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const seatCategories = formData.seatCategories
        .filter((c) => c.name && c.price)
        .map((c) => ({
          name: c.name,
          price: Math.max(0, Number(c.price) || 0),
          totalSeats: Math.max(0, Number(c.seats) || 0),
          count: Math.max(0, Number(c.seats) || 0),
        }));

      const safeRows = Math.max(0, Number(formData.rows) || 0);
      const safeColumns = String(formData.columns || '').trim();

      if (formData.bookingType === 'seated') {
        const colCount = getColumnCount(safeColumns);
        const rowCount = safeRows;
        const capacity = colCount * rowCount;
        const allocated = seatCategories.reduce((sum, c) => sum + c.totalSeats, 0);

        if (allocated > capacity) {
          showToast(`Error: Configured category seats (${allocated}) exceeds the capacity of ${capacity} (${colCount} x ${rowCount}).`, 'error');
          setSubmitting(false);
          return;
        }
      }

      const showtimes = formData.showtimes
        ? formData.showtimes.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const bodyData = {
        ...formData,
        seatCategories,
        showtimes,
        screenName: formData.bookingType === 'seated' ? formData.screenName : undefined,
        columns: formData.bookingType === 'seated' ? safeColumns : undefined,
        rows: formData.bookingType === 'seated' ? safeRows : undefined,
        venue: formData.bookingType === 'seated' ? undefined : formData.venue
      };

      if (editingId) {
        await apiFetch(`/events/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(bodyData),
        });
        showToast('Event updated successfully!');
      } else {
        await apiFetch('/events', {
          method: 'POST',
          body: JSON.stringify(bodyData),
        });
        showToast('Event created successfully!');
      }

      setShowForm(false);
      setEditingId(null);
      setFormData({
        title: '',
        description: '',
        date: '',
        venue: '',
        category: '',
        image: '',
        bookingType: 'seated',
        screenName: '',
        columns: '',
        rows: '',
        seatCategories: [{ name: 'General', price: '', seats: '' }],
        showtimes: '',
      });
      fetchEvents();
    } catch (err) {
      showToast(err.message || 'Failed to save event', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isUserAuthorized) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-500">
        <p>Access denied. Organizer or Admin account required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) {
              setEditingId(null);
              setFormData({
                title: '',
                description: '',
                date: '',
                venue: '',
                category: '',
                image: '',
                bookingType: 'seated',
                screenName: '',
                columns: '',
                rows: '',
                seatCategories: [{ name: 'General', price: '', seats: '' }],
              });
            }
          }}
        >
          {showForm ? 'Cancel' : '+ Create Event'}
        </button>
      </div>

      {/* Admin Controls Section */}
      {currentUser && currentUser.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Coupon Generator */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-red-500 mb-4">🎫 Coupon Manager</h2>
            <form onSubmit={handleCreateCoupon} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Coupon Code</label>
                <input
                  name="code"
                  className="input text-sm"
                  placeholder="e.g. MONSTER20"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm(prev => ({ ...prev, code: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Discount Type</label>
                  <select
                    className="input text-sm"
                    value={couponForm.discountType}
                    onChange={(e) => setCouponForm(prev => ({ ...prev, discountType: e.target.value }))}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Discount Value</label>
                  <input
                    type="number"
                    className="input text-sm"
                    placeholder="e.g. 20"
                    value={couponForm.discountValue}
                    onChange={(e) => setCouponForm(prev => ({ ...prev, discountValue: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Expiration (Days)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    value={couponForm.expirationDays}
                    onChange={(e) => setCouponForm(prev => ({ ...prev, expirationDays: Number(e.target.value) }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Max Uses</label>
                  <input
                    type="number"
                    className="input text-sm"
                    value={couponForm.maxUses}
                    onChange={(e) => setCouponForm(prev => ({ ...prev, maxUses: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full text-xs py-2 mt-2">
                Create Coupon
              </button>
            </form>
          </div>

          {/* Ad Campaign Push Announcement */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-red-500 mb-4">📢 Ad Campaign Broadcast</h2>
            <form onSubmit={handlePushAd} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Campaign / Ad Title</label>
                <input
                  className="input text-sm"
                  placeholder="e.g. Flash Sale: 50% Off Tickets!"
                  value={adForm.title}
                  onChange={(e) => setAdForm(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Ad Message</label>
                <textarea
                  className="input text-sm"
                  rows={4}
                  placeholder="Type the message to be broadcasted to all users..."
                  value={adForm.message}
                  onChange={(e) => setAdForm(prev => ({ ...prev, message: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn-secondary w-full text-xs py-2 mt-1">
                Push Real-Time Ad to All Users
              </button>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Event' : 'New Event'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Title</label>
              <input
                name="title"
                className="input"
                placeholder="Event title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Description</label>
              <textarea
                name="description"
                className="input"
                placeholder="Event description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Date</label>
                <input
                  name="date"
                  type="datetime-local"
                  className="input"
                  value={formData.date}
                  onChange={handleChange}
                  required
                />
              </div>
              {formData.bookingType === 'zone' ? (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Venue</label>
                  <input
                    name="venue"
                    className="input"
                    placeholder="Venue name"
                    value={formData.venue}
                    onChange={handleChange}
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Venue (Default)</label>
                  <input
                    className="input opacity-60"
                    value={currentUser.theaterName || 'My Theater (Default)'}
                    disabled
                  />
                </div>
              )}
            </div>

            {formData.bookingType === 'seated' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Screen Number / Name</label>
                  <input
                    name="screenName"
                    className="input"
                    placeholder="e.g. Screen 1"
                    value={formData.screenName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Seating Columns (String / Count)</label>
                  <input
                    name="columns"
                    className="input"
                    placeholder="e.g. 10 or 1,2,3,4,5,6"
                    value={formData.columns}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Seating Rows (Count)</label>
                  <input
                    name="rows"
                    type="number"
                    min="1"
                    className="input"
                    placeholder="e.g. 10"
                    value={formData.rows}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Category</label>
                <input
                  name="category"
                  className="input"
                  placeholder="e.g. Concert, Play, Sports"
                  value={formData.category}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Booking Type</label>
                <select
                  name="bookingType"
                  className="input"
                  value={formData.bookingType || 'seated'}
                  onChange={handleChange}
                >
                  <option value="seated">Specific Seat Booking (Numbered Rows)</option>
                  <option value="zone">Zone Booking (General Admission / Sections)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Poster Link (Image URL)</label>
              <input
                name="image"
                className="input"
                placeholder="e.g. https://images.unsplash.com/... or local assets path"
                value={formData.image}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Showtimes (Comma separated)</label>
              <input
                name="showtimes"
                className="input"
                placeholder="e.g. 09:00 AM, 12:00 PM, 03:00 PM, 07:00 PM, 10:30 PM"
                value={formData.showtimes || ''}
                onChange={handleChange}
              />
            </div>

            {!editingId && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  {formData.bookingType === 'zone' ? 'Zone / Standing Sections Config' : 'Seat Categories / Rows Config'}
                </label>
                {formData.seatCategories.map((cat, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      className="input flex-1"
                      placeholder={formData.bookingType === 'zone' ? "Zone Name (e.g., VIP Standing)" : "Category/Row Name (e.g., Balcony)"}
                      value={cat.name}
                      onChange={(e) => handleCategoryChange(idx, 'name', e.target.value)}
                    />
                    <input
                      className="input w-24"
                      type="number"
                      min="0"
                      placeholder="Price"
                      value={cat.price}
                      onChange={(e) => handleCategoryChange(idx, 'price', e.target.value)}
                    />
                    <input
                      className="input w-28"
                      type="number"
                      min="0"
                      placeholder={formData.bookingType === 'zone' ? "Capacity" : "Seats"}
                      value={cat.seats}
                      onChange={(e) => handleCategoryChange(idx, 'seats', e.target.value)}
                    />
                    {formData.seatCategories.length > 1 && (
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer px-2"
                        onClick={() => removeCategory(idx)}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer"
                  onClick={addCategory}
                >
                  + Add Category
                </button>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Create Event')}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {events.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>No events created yet</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event._id} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{event.title}</h3>
                  <p className="text-sm text-gray-400">
                    <i className="fas fa-calendar mr-1"></i>
                    {formatDate(event.date)}
                  </p>
                  <p className="text-sm text-gray-400">
                    <i className="fas fa-map-marker-alt mr-1"></i>
                    {event.venue || 'TBA'}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <span className="badge bg-blue-500/20 text-blue-400">
                    {event.category || 'Event'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(event)}
                      className="btn-ghost text-white text-xs font-bold py-1.5 px-3 rounded-lg transition border-none"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(event._id)}
                      className="bg-red-500/15 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold py-1.5 px-3 rounded-lg transition cursor-pointer border border-red-500/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
