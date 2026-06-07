const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.errors.map(e => e.message).join(', ');
      return next(new AppError(message, 400));
    }
    next(err);
  }
};

module.exports = validateRequest;
