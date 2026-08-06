const AppError = require('../Utils/AppError');
const logger = require('../Utils/logger');

module.exports = (err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} -> ${err.statusCode || 500}: ${err.message}`, { stack: err.stack });
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    err = new AppError(`Duplicate value for ${field}. Please use another value.`, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message).join('. ');
    err = new AppError(`Validation error: ${messages}`, 400);
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    err = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') err = new AppError('Invalid token. Please log in again.', 401);
  if (err.name === 'TokenExpiredError') err = new AppError('Token expired. Please log in again.', 401);

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message
  });
};
