const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const morgan = require('morgan');
const logger = require('./Utils/logger');

dotenv.config();

const authRouter = require('./Routes/AuthRoute');
const userRouter = require('./Routes/UserRoute');
const eventRouter = require('./Routes/EventRoute');
const seatRouter = require('./Routes/SeatRoute');
const bookingRouter = require('./Routes/BookingRoute');
const errorHandler = require('./Middleware/errorHandler');
const AppError = require('./Utils/AppError');

const app = express();

// Log incoming requests
app.use(morgan('dev', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// CORS
const corsOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : false)
  : true;
app.use(cors({ origin: corsOrigins, credentials: true }));

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// Stricter rate limit for authentication endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth', authLimiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/events', eventRouter);
app.use('/api/seats', seatRouter);
app.use('/api/bookings', bookingRouter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// 404 handler for API routes (registered BEFORE the SPA fallback so
// unknown /api/* requests return JSON instead of index.html)
app.use('/api', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
