const express = require('express');
const asyncHandler = require('express-async-handler');
const { auth, authorize } = require('../middleware/auth');
const {
  getAdminProfile,
  updateAdminProfile,
  getAllTickets,
  approveTicket,
  rejectTicket,
  getAllUsers,
  makeUserAdmin,
  makeUserVendor,
  removeAdminRole,
  suspendUser,
  activateUser,
  markVendorAsFraud,
  getAdvertisedTickets,
  toggleTicketAdvertisement,
  getDashboardStats
} = require('../controllers/adminDashboard');
const { getPaymentAnalytics } = require('../controllers/payments');

const router = express.Router();

// Apply admin authorization to all routes
router.use(authorize('admin'));

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private/Admin
router.get('/stats', getDashboardStats);

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private/Admin
router.get('/profile', getAdminProfile);

// @desc    Update admin profile
// @route   PUT /api/admin/profile
// @access  Private/Admin
router.put('/profile', updateAdminProfile);

// @desc    Get all tickets for management
// @route   GET /api/admin/tickets
// @access  Private/Admin
router.get('/tickets', getAllTickets);

// @desc    Approve ticket
// @route   PUT /api/admin/tickets/:id/approve
// @access  Private/Admin
router.put('/tickets/:id/approve', approveTicket);

// @desc    Reject ticket
// @route   PUT /api/admin/tickets/:id/reject
// @access  Private/Admin
router.put('/tickets/:id/reject', rejectTicket);

// @desc    Get all users for management
// @route   GET /api/admin/users
// @access  Private/Admin
router.get('/users', getAllUsers);

// @desc    Make user admin
// @route   PUT /api/admin/users/:id/make-admin
// @access  Private/Admin
router.put('/users/:id/make-admin', makeUserAdmin);

// @desc    Make user vendor
// @route   PUT /api/admin/users/:id/make-vendor
// @access  Private/Admin
router.put('/users/:id/make-vendor', makeUserVendor);

// @desc    Remove admin role
// @route   PUT /api/admin/users/:id/remove-admin
// @access  Private/Admin
router.put('/users/:id/remove-admin', removeAdminRole);

// @desc    Suspend user
// @route   PUT /api/admin/users/:id/suspend
// @access  Private/Admin
router.put('/users/:id/suspend', suspendUser);

// @desc    Activate user
// @route   PUT /api/admin/users/:id/activate
// @access  Private/Admin
router.put('/users/:id/activate', activateUser);

// @desc    Mark vendor as fraud
// @route   PUT /api/admin/users/:id/mark-fraud
// @access  Private/Admin
router.put('/users/:id/mark-fraud', markVendorAsFraud);

// @desc    Get advertised tickets
// @route   GET /api/admin/advertised-tickets
// @access  Private/Admin
router.get('/advertised-tickets', getAdvertisedTickets);

// @desc    Toggle ticket advertisement
// @route   PUT /api/admin/advertised-tickets/:id/toggle
// @access  Private/Admin
router.put('/advertised-tickets/:id/toggle', toggleTicketAdvertisement);

// @desc    Get payment analytics
// @route   GET /api/admin/payments/analytics
// @access  Private/Admin
router.get('/payments/analytics', getPaymentAnalytics);

module.exports = router;