import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4">
      <div className="glass-strong rounded-3xl px-10 py-12 max-w-lg w-full space-y-5 flex flex-col items-center">
        <span className="text-8xl mb-2 select-none">🎫</span>
        <h1 className="text-4xl font-extrabold text-white tracking-tight">404 - Page Not Found</h1>
        <p className="text-zinc-400 max-w-md">
          The ticket page or event resource you are looking for does not exist or has been moved.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold py-3 px-8 rounded-xl transition shadow-lg shadow-red-600/20 cursor-pointer"
        >
          Go Back Home
        </button>
      </div>
    </div>
  );
}
