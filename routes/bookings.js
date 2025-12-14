const express = require('express');
const { auth: protect } = require('../middleware/auth');
const { createBooking, getUserBookings, getBookingById } = require('../controllers/bookingsController');

const router = express.Router();

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
router.post('/', protect, createBooking);

// @desc    Get user's bookings
// @route   GET /api/user/bookings
// @access  Private
router.get('/user', protect, getUserBookings);

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
router.get('/:id', protect, getBookingById);

module.exports = router;