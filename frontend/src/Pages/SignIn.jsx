import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, clearError } from '../store/userSlice';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { userInfo, loading, error } = useSelector((state) => state.user);

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (userInfo) {
      navigate(from, { replace: true });
    }
  }, [userInfo, navigate, from]);

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser({ email, password }));
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="glass-strong rounded-3xl p-8 w-full max-w-md transition-all hover:border-white/20 shadow-2xl">
        <h2 className="text-3xl font-extrabold text-red-500 text-center mb-2 tracking-tight">
          BookShow
        </h2>
        <p className="text-center text-zinc-400 text-sm mb-6">
          Sign in to your account to book tickets
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full glass-field px-4 py-3 rounded-xl"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full glass-field px-4 py-3 rounded-xl"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-red-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-zinc-500 text-sm">
            Don't have an account?{' '}
            <Link
              to="/signup"
              state={{ from: location.state?.from }}
              className="text-red-400 font-semibold hover:underline"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
