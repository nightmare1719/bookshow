const express = require('express');
const { protect } = require('../Middleware/authMiddleware');
const validateRequest = require('../Middleware/validateRequest');
const { lockSeatSchema } = require('../Validators/schemas');
const { lockSeat, releaseSeat } = require('../Controller/SeatController');

const router = express.Router();

router.post('/lock', protect, validateRequest(lockSeatSchema), lockSeat);
router.post('/release', protect, releaseSeat);

module.exports = router;
