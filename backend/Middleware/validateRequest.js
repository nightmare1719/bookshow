const { ZodError } = require('zod');
const AppError = require('../Utils/AppError');

const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      console.error('❌ Validation Error Details:', JSON.stringify(err.errors, null, 2));
      const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return next(new AppError(message, 400));
    }
    next(err);
  }
};

module.exports = validateRequest;
