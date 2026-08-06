import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="glass-nav text-zinc-400 mt-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Logo and Description */}
        <div className="space-y-4">
          <Link
            to="/"
            className="text-2xl font-black text-red-500 hover:text-red-400 transition no-underline decoration-none flex items-center gap-2"
          >
            <span>🎫</span> BookShow
          </Link>
          <p className="text-zinc-500 text-xs leading-relaxed max-w-xs">
            Discover and book tickets for concerts, theater, sports events, festivals and more. Fast checkout, secure bookings, happy memories.
          </p>
        </div>

        {/* Company Links */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wider text-white mb-4">Company</h3>
          <ul className="space-y-2 text-xs font-semibold">
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">About Us</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Careers</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Press Relations</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Contact Support</a></li>
          </ul>
        </div>

        {/* Services Links */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wider text-white mb-4">Categories</h3>
          <ul className="space-y-2 text-xs font-semibold">
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Concerts & Shows</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Theater Plays</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Comedy Shows</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Sports & Arenas</a></li>
          </ul>
        </div>

        {/* Support Links */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wider text-white mb-4">Support</h3>
          <ul className="space-y-2 text-xs font-semibold">
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">FAQ Help Desk</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Terms of Booking</a></li>
            <li><a href="#" className="hover:text-red-500 transition no-underline text-zinc-500">Security Center</a></li>
          </ul>
        </div>

      </div>

      <div className="border-t border-zinc-900/60 py-6 text-center text-zinc-600 text-xs font-medium">
        © 2026 BookShow. Made with ❤️ for Show Lovers.
      </div>
    </footer>
  );
}
