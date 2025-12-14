const express = require('express');
const {
  getPaymentHistory,
  getPaymentStatus,
  requestRefund,
  getUserTransactions,
  exportTransactions,
  createCheckoutSession,
  updatePaymentStatus
} = require('../controllers/payments');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Public checkout session endpoint (no auth required for initial checkout)
router.post('/create-checkout-session', createCheckoutSession);

// Protected routes
router.use(auth);

// Payment status update (for Stripe hosted checkout)
router.post('/update-payment-status', updatePaymentStatus);

// Payment history and status
router.get('/history', getPaymentHistory);
router.get('/status/:id', getPaymentStatus);

// Refund
router.post('/refund', requestRefund);

module.exports = router;
