const express = require('express');
const asyncHandler = require('express-async-handler');
const { auth, authorize } = require('../middleware/auth');
const {
  getUserProfile,
  updateUserProfile,
  getUserBookings,
  getUserTransactions,
  createPaymentIntent,
  confirmPayment,
  exportTransactions
} = require('../controllers/userDashboard');

const router = express.Router();

// All routes require authentication and user role
router.use(auth, authorize('user'));

// User profile routes
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);

// User bookings routes
router.get('/bookings', getUserBookings);

// User transactions routes
router.get('/transactions', getUserTransactions);
router.get('/transactions/export', exportTransactions);

// User payment routes
router.post('/payments/create-intent', createPaymentIntent);
router.post('/payments/confirm', confirmPayment);

module.exports = router;
