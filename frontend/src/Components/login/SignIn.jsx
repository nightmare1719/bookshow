import React, { useState } from 'react';

export default function SignIn({ onLogin, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Email</label>
          <input
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Password</label>
          <input
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>
    </form>
  );
}
