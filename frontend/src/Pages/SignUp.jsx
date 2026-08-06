import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, clearError } from '../store/userSlice';

export default function SignUp() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('attendee'); // attendee, organizer, or admin
  const [theaterName, setTheaterName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [validationError, setValidationError] = useState('');

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
    setValidationError('');

    if (role === 'organizer') {
      if (!theaterName.trim()) {
        setValidationError('Theater Name is required for Organizer/Admin signup.');
        return;
      }
      if (!gstNumber.trim()) {
        setValidationError('GST Number is required for Organizer/Admin signup.');
        return;
      }
      const digitsCount = (gstNumber.match(/\d/g) || []).length;
      const lettersCount = (gstNumber.match(/[a-zA-Z]/g) || []).length;
      if (gstNumber.length !== 15 || digitsCount !== 12 || lettersCount !== 3) {
        setValidationError('GST Number must be exactly 15 characters, containing 12 digits and 3 letters.');
        return;
      }
    }

    dispatch(
      registerUser({
        email,
        password,
        role,
        profile: { firstName, lastName },
        theaterName: role === 'organizer' ? theaterName : undefined,
        gstNumber: role === 'organizer' ? gstNumber : undefined,
        referralCode: referralCode.trim() || undefined,
      })
    );
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="glass-strong rounded-3xl p-8 w-full max-w-md transition-all hover:border-white/20 shadow-2xl">
        <h2 className="text-3xl font-extrabold text-red-500 text-center mb-2 tracking-tight">
          BookShow
        </h2>
        <p className="text-center text-zinc-400 text-sm mb-6">
          Create your account to start booking shows
        </p>

        {(error || validationError) && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {error || validationError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
                placeholder="Jane"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
              placeholder="jane.doe@example.com"
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
              minLength={6}
              className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
              placeholder="Minimum 6 characters"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Account Type
            </label>
            <div className="flex glass rounded-xl p-1 gap-1">
              <button
                type="button"
                className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer border-none ${
                  role === 'attendee'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white bg-transparent'
                }`}
                onClick={() => setRole('attendee')}
              >
                Attendee
              </button>
              <button
                type="button"
                className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition cursor-pointer border-none ${
                  role === 'organizer'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white bg-transparent'
                }`}
                onClick={() => setRole('organizer')}
              >
                Organizer / Admin
              </button>
            </div>
          </div>

          {role === 'organizer' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Theater Name
                </label>
                <input
                  type="text"
                  value={theaterName}
                  onChange={(e) => setTheaterName(e.target.value)}
                  required
                  className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Royal Cinemas"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  GST Number (15 chars: 12 digits, 3 letters)
                </label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  required
                  maxLength={15}
                  className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
                  placeholder="e.g. 22AAAAA1111A1Z1"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Referral Code (Optional)
            </label>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              className="w-full glass-field px-4 py-2.5 rounded-xl text-sm"
              placeholder="e.g. REF-XXXXXX"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-red-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2 border-none"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-zinc-500 text-sm">
            Already have an account?{' '}
            <Link
              to="/signin"
              state={{ from: location.state?.from }}
              className="text-red-400 font-semibold hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
