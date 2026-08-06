import React, { useState } from 'react';

export default function SignUp({ onRegister, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('attendee');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || !firstName || !lastName) return;
    setLoading(true);
    await onRegister(email, password, role, firstName, lastName, referralCode);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">First Name</label>
            <input
              type="text"
              className="input"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Last Name</label>
            <input
              type="text"
              className="input"
              placeholder="Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>
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
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Account Type</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="attendee">Attendee (Book Tickets)</option>
            <option value="organizer">Organizer (Create Events)</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-1 block">Referral Code (Optional)</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. REF-XXXXXX"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </div>
    </form>
  );
}
