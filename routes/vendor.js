const express = require('express');
const {
  getVendorProfile,
  updateVendorProfile,
  addTicket,
  getVendorTickets,
  updateTicket,
  deleteTicket,
  getVendorBookings,
  acceptBooking,
  rejectBooking,
  getVendorRevenue
} = require('../controllers/vendorDashboard');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Protect all vendor routes
router.use(auth);

// Only vendors can access these routes
router.use(authorize('vendor', 'admin'));

// Profile routes
router.route('/profile')
  .get(getVendorProfile)
  .put(updateVendorProfile);

// Ticket routes
router.route('/tickets')
  .post(addTicket)
  .get(getVendorTickets);

router.route('/tickets/:id')
  .put(updateTicket)
  .delete(deleteTicket);

// Booking routes
router.route('/bookings')
  .get(getVendorBookings);

router.route('/bookings/:id/accept')
  .put(acceptBooking);

router.route('/bookings/:id/reject')
  .put(rejectBooking);

// Revenue analytics route
router.route('/revenue')
  .get(getVendorRevenue);

module.exports = router;