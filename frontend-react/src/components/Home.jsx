import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function Home({ setPage }) {
  const { apiFetch, showToast } = useApp();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchVal, setSearchVal] = useState('');
  const [category, setCategory] = useState('');

  // Fetch events
  const loadEvents = async () => {
    setLoading(true);
    try {
      let url = `/events?page=${currentPage}&limit=12`;
      if (searchVal.trim()) {
        url += `&search=${encodeURIComponent(searchVal.trim())}`;
      }
      if (category) {
        url += `&category=${encodeURIComponent(category)}`;
      }
      const data = await apiFetch(url);
      setEvents(data.data.events || []);
      setTotalPages(data.data.pages || 1);
    } catch (err) {
      showToast('Failed to load events: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [currentPage, category]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    loadEvents();
  };

  const handleCategoryFilter = (cat) => {
    setCategory(cat);
    setCurrentPage(1);
  };

  const handlePageChange = (dir) => {
    setCurrentPage((prev) => prev + dir);
  };

  const categoryColors = {
    Movies: 'bg-purple-900 text-purple-300',
    Concerts: 'bg-pink-900 text-pink-300',
    Sports: 'bg-green-900 text-green-300',
    Theatre: 'bg-yellow-900 text-yellow-300',
    Comedy: 'bg-orange-900 text-orange-300',
    General: 'bg-blue-900 text-blue-300',
  };

  return (
    <div>
      {/* Banner */}
      <div className="bg-gradient-to-b from-red-900/30 to-transparent py-16 px-6 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Book Your <span className="text-red-500">Experience</span>
        </h1>
        <p className="text-gray-400 text-lg mb-8">Movies, Concerts, Sports, Theatre & More</p>
        <form onSubmit={handleSearchSubmit} className="max-w-xl mx-auto flex gap-3">
          <input
            className="input flex-1"
            placeholder="Search events, venues..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
          />
          <button type="submit" className="btn-primary px-6">
            <i className="fas fa-search"></i>
          </button>
        </form>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        {/* Categories */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="text-gray-400 text-sm">Filter:</span>
          <button
            className={`badge cursor-pointer transition-all ${
              category === '' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => handleCategoryFilter('')}
          >
            All
          </button>
          {['Movies', 'Concerts', 'Sports', 'Theatre', 'Comedy'].map((cat) => (
            <button
              key={cat}
              className={`badge cursor-pointer transition-all ${
                category === cat ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => handleCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="spinner"></div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <i className="fas fa-calendar-times text-5xl mb-4 block"></i>
            <p className="text-xl">No events found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {events.map((event) => {
                const cc = categoryColors[event.category] || 'bg-blue-900 text-blue-300';
                const available = event.totalSeats - event.seatsSold;
                const pct = Math.round((event.seatsSold / event.totalSeats) * 100);

                return (
                  <div
                    key={event._id}
                    className="event-card"
                    onClick={() => setPage({ name: 'event-detail', eventId: event._id })}
                  >
                    <div className="h-40 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative">
                      <i className="fas fa-calendar-star text-5xl text-gray-600"></i>
                      <span className={`absolute top-3 left-3 badge ${cc}`}>{event.category}</span>
                      {available < 20 && (
                        <span className="absolute top-3 right-3 badge bg-red-900 text-red-300">
                          Almost Full
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg mb-1 truncate text-white">{event.title}</h3>
                      <p className="text-gray-400 text-sm mb-1 truncate">
                        <i className="fas fa-map-marker-alt mr-1 text-red-500"></i>
                        {event.venue}
                      </p>
                      <p className="text-gray-400 text-sm mb-3">
                        <i className="fas fa-clock mr-1 text-blue-400"></i>
                        {formatDate(event.date)}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-green-400 font-bold text-lg">
                          {formatCurrency(event.basePrice)}
                        </span>
                        <span className="text-xs text-gray-500">{available} seats left</span>
                      </div>
                      <div className="mt-2 bg-gray-800 rounded-full h-1.5">
                        <div
                          className="bg-red-500 h-1.5 rounded-full"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-3 mt-8">
                <button
                  className="btn-secondary text-sm flex items-center gap-1"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(-1)}
                >
                  <i className="fas fa-chevron-left"></i> Prev
                </button>
                <span className="flex items-center text-gray-400 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn-secondary text-sm flex items-center gap-1"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(1)}
                >
                  Next <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
