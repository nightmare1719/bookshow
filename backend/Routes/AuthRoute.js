const express = require('express');
const { protect } = require('../Middleware/authMiddleware');
const validateRequest = require('../Middleware/validateRequest');
const { registerSchema, loginSchema } = require('../Validators/schemas');
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser
} = require('../Controller/UserController');

const router = express.Router();

router.post('/register', validateRequest(registerSchema), registerUser);
router.post('/login', validateRequest(loginSchema), loginUser);
router.get('/me', protect, getMe);
router.post('/logout', logoutUser);

module.exports = router;
