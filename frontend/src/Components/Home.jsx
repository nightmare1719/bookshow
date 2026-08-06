import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toggleWishlist } from '../store/wishlistSlice';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';
import heroBanner from '../assets/hero.png';

export default function Home() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { apiFetch } = useApp();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  const wishlistItems = useSelector((state) => state.wishlist.items);
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await apiFetch('/events');
        setEvents(data.data.events);
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const categories = ['all', ...new Set(events.map((e) => e.category).filter(Boolean))];

  const filtered = events.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = category === 'all' || e.category === category;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 flex justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Hero Banner Section */}
      <section className="relative w-full h-[320px] sm:h-[400px] overflow-hidden bg-zinc-950 flex items-center justify-center">
        <img
          src={heroBanner}
          alt="BookShow Hero Banner"
          className="absolute inset-0 w-full h-full object-cover opacity-45 select-none"
        />
        <div className="relative z-10 text-center px-6 max-w-2xl space-y-4">
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            Discover Amazing <span className="text-red-500">Events</span>
          </h1>
          <p className="text-zinc-300 text-sm sm:text-base md:text-lg font-medium leading-relaxed">
            Reserve tickets for the hottest concerts, plays, sports and local festivals around you.
          </p>
        </div>
      </section>

      {/* Filter and Categories Section */}
      <div className="max-w-7xl mx-auto px-6 space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            {searchQuery ? `Search Results for "${searchQuery}"` : '🔥 Popular Shows'}
          </h2>
          
          <div className="flex glass p-1 rounded-2xl gap-1 max-w-full overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer border-none ${
                  category === c
                    ? 'bg-red-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white bg-transparent'
                }`}
              >
                {c === 'all' ? 'All Shows' : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Events Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 glass rounded-3xl">
            <span className="text-5xl mb-4 block">🎫</span>
            <p className="text-zinc-400 font-semibold text-lg">No events found matching your filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((event) => {
              const isWishlisted = wishlistItems.some((item) => item._id === event._id);
              return (
                <div
                  key={event._id}
                  onClick={() => navigate(`/event/${event._id}`)}
                  className="event-card group flex flex-col justify-between"
                >
                  {/* Banner Image */}
                  <div className="relative w-full h-52 overflow-hidden bg-black/40">
                    <img
                      src={event.banner || event.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'}
                      alt={event.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(toggleWishlist(event));
                      }}
                      className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-base w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/70 hover:scale-110 active:scale-95 transition cursor-pointer border border-white/10"
                      title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                    >
                      {isWishlisted ? '❤️' : '🖤'}
                    </button>
                  </div>

                  {/* Card Description */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="bg-red-500/10 text-red-400 text-xs px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wide">
                          {event.category || 'Event'}
                        </span>
                        <span className="text-zinc-500 text-xs font-semibold">
                          {formatDate(event.date)}
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-black text-white leading-snug line-clamp-1 mb-2">
                        {event.title}
                      </h3>
                      
                      <p className="text-zinc-500 text-sm mb-4 flex items-center gap-1.5 font-medium">
                        <i className="fas fa-map-marker-alt text-red-500/70 text-xs"></i>
                        {event.venue || 'TBA'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/80">
                      <span className="text-green-400 font-extrabold text-lg">
                        {formatCurrency(event.minPrice || event.basePrice)} onwards
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/event/${event._id}`);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-5 rounded-xl transition cursor-pointer border-none"
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
