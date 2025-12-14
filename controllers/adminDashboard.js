const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Route = require('../models/Route');
const Booking = require('../models/Booking');
const logger = require('../utils/logger');

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private/Admin
const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user.id).select('-password');
  
  if (!admin) {
    return res.status(404).json({
      success: false,
      error: 'Admin not found'
    });
  }

  res.status(200).json({
    success: true,
    data: admin
  });
});

// @desc    Update admin profile
// @route   PUT /api/admin/profile
// @access  Private/Admin
const updateAdminProfile = asyncHandler(async (req, res) => {
  const { name, phone, photoURL } = req.body;

  const admin = await User.findById(req.user.id);

  if (!admin) {
    return res.status(404).json({
      success: false,
      error: 'Admin not found'
    });
  }

  // Update fields
  if (name) admin.name = name;
  if (phone) admin.phone = phone;
  if (photoURL) admin.photoURL = photoURL;

  await admin.save();

  res.status(200).json({
    success: true,
    data: admin,
    message: 'Profile updated successfully'
  });
});

// @desc    Get all tickets for management
// @route   GET /api/admin/tickets
// @access  Private/Admin
const getAllTickets = asyncHandler(async (req, res) => {
  const { 
    status, 
    transportType, 
    vendor, 
    dateFrom, 
    dateTo, 
    search,
    page = 1, 
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (status) {
    filter.verificationStatus = status;
  }
  
  if (transportType) {
    filter.type = transportType;
  }
  
  if (vendor) {
    filter.vendor = vendor;
  }
  
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  
  if (search) {
    filter.$or = [
      { 'operator.name': { $regex: search, $options: 'i' } },
      { 'from.city': { $regex: search, $options: 'i' } },
      { 'to.city': { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate skip for pagination
  const skip = (page - 1) * limit;

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Get tickets with pagination
  const tickets = await Route.find(filter)
    .populate('vendor', 'name email photoURL')
    .populate('adminReviewedBy', 'name email')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Get total count for pagination
  const total = await Route.countDocuments(filter);
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: {
      tickets,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        count: total,
        limit: parseInt(limit)
      }
    }
  });
});

// @desc    Approve ticket
// @route   PUT /api/admin/tickets/:id/approve
// @access  Private/Admin
const approveTicket = asyncHandler(async (req, res) => {
  const { adminNotes } = req.body;
  
  const ticket = await Route.findById(req.params.id).populate('vendor');
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      error: 'Ticket not found'
    });
  }

  if (ticket.verificationStatus === 'approved') {
    return res.status(400).json({
      success: false,
      error: 'Ticket is already approved'
    });
  }

  // Update ticket
  ticket.verificationStatus = 'approved';
  ticket.adminNotes = adminNotes || 'Approved by admin';
  ticket.adminReviewedBy = req.user.id;
  ticket.adminReviewedAt = new Date();

  await ticket.save();

  logger.info(`Ticket ${ticket._id} approved by admin ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: ticket,
    message: 'Ticket approved successfully'
  });
});

// @desc    Reject ticket
// @route   PUT /api/admin/tickets/:id/reject
// @access  Private/Admin
const rejectTicket = asyncHandler(async (req, res) => {
  const { adminNotes } = req.body;
  
  if (!adminNotes) {
    return res.status(400).json({
      success: false,
      error: 'Rejection reason is required'
    });
  }
  
  const ticket = await Route.findById(req.params.id).populate('vendor');
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      error: 'Ticket not found'
    });
  }

  if (ticket.verificationStatus === 'rejected') {
    return res.status(400).json({
      success: false,
      error: 'Ticket is already rejected'
    });
  }

  // Update ticket
  ticket.verificationStatus = 'rejected';
  ticket.adminNotes = adminNotes;
  ticket.adminReviewedBy = req.user.id;
  ticket.adminReviewedAt = new Date();

  await ticket.save();

  logger.info(`Ticket ${ticket._id} rejected by admin ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: ticket,
    message: 'Ticket rejected successfully'
  });
});

// @desc    Get all users for management
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = asyncHandler(async (req, res) => {
  const { 
    role, 
    status, 
    search, 
    dateFrom, 
    dateTo,
    page = 1, 
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (role) {
    filter.role = role;
  }
  
  if (status === 'active') {
    filter.isActive = true;
    filter.isSuspended = false;
  } else if (status === 'suspended') {
    filter.isSuspended = true;
  } else if (status === 'fraud') {
    filter.isFraud = true;
  }
  
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate skip for pagination
  const skip = (page - 1) * limit;

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Get users with pagination
  const users = await User.find(filter)
    .select('-password')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Get total count for pagination
  const total = await User.countDocuments(filter);
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: {
      users,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        count: total,
        limit: parseInt(limit)
      }
    }
  });
});

// @desc    Make user admin
// @route   PUT /api/admin/users/:id/make-admin
// @access  Private/Admin
const makeUserAdmin = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (user.role === 'admin') {
    return res.status(400).json({
      success: false,
      error: 'User is already an admin'
    });
  }

  user.role = 'admin';
  await user.save();

  logger.info(`User ${user._id} promoted to admin by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'User promoted to admin successfully'
  });
});

// @desc    Make user vendor
// @route   PUT /api/admin/users/:id/make-vendor
// @access  Private/Admin
const makeUserVendor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (user.role === 'vendor') {
    return res.status(400).json({
      success: false,
      error: 'User is already a vendor'
    });
  }

  if (user.isFraud) {
    return res.status(400).json({
      success: false,
      error: 'Cannot promote fraudulent user to vendor'
    });
  }

  user.role = 'vendor';
  await user.save();

  logger.info(`User ${user._id} promoted to vendor by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'User promoted to vendor successfully'
  });
});

// @desc    Remove admin role
// @route   PUT /api/admin/users/:id/remove-admin
// @access  Private/Admin
const removeAdminRole = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (user.role !== 'admin') {
    return res.status(400).json({
      success: false,
      error: 'User is not an admin'
    });
  }

  if (user._id.toString() === req.user.id.toString()) {
    return res.status(400).json({
      success: false,
      error: 'Cannot remove your own admin role'
    });
  }

  user.role = 'user';
  await user.save();

  logger.info(`Admin role removed from user ${user._id} by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'Admin role removed successfully'
  });
});

// @desc    Suspend user
// @route   PUT /api/admin/users/:id/suspend
// @access  Private/Admin
const suspendUser = asyncHandler(async (req, res) => {
  const { suspensionReason } = req.body;
  
  if (!suspensionReason) {
    return res.status(400).json({
      success: false,
      error: 'Suspension reason is required'
    });
  }
  
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (user.isSuspended) {
    return res.status(400).json({
      success: false,
      error: 'User is already suspended'
    });
  }

  if (user._id.toString() === req.user.id.toString()) {
    return res.status(400).json({
      success: false,
      error: 'Cannot suspend your own account'
    });
  }

  user.isSuspended = true;
  user.suspendedAt = new Date();
  user.suspendedBy = req.user.id;
  user.suspensionReason = suspensionReason;
  
  await user.save();

  // If vendor, hide their tickets
  if (user.role === 'vendor') {
    await Route.updateMany(
      { vendor: user._id },
      { 
        verificationStatus: 'pending',
        adminNotes: 'Vendor suspended - tickets hidden'
      }
    );
  }

  logger.info(`User ${user._id} suspended by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'User suspended successfully'
  });
});

// @desc    Activate user
// @route   PUT /api/admin/users/:id/activate
// @access  Private/Admin
const activateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (!user.isSuspended) {
    return res.status(400).json({
      success: false,
      error: 'User is not suspended'
    });
  }

  user.isSuspended = false;
  user.suspendedAt = null;
  user.suspendedBy = null;
  user.suspensionReason = null;
  
  await user.save();

  logger.info(`User ${user._id} activated by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'User activated successfully'
  });
});

// @desc    Mark vendor as fraud
// @route   PUT /api/admin/users/:id/mark-fraud
// @access  Private/Admin
const markVendorAsFraud = asyncHandler(async (req, res) => {
  const { fraudReason } = req.body;
  
  if (!fraudReason) {
    return res.status(400).json({
      success: false,
      error: 'Fraud reason is required'
    });
  }
  
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  if (user.role !== 'vendor') {
    return res.status(400).json({
      success: false,
      error: 'Can only mark vendors as fraudulent'
    });
  }

  if (user.isFraud) {
    return res.status(400).json({
      success: false,
      error: 'User is already marked as fraudulent'
    });
  }

  user.isFraud = true;
  user.markedAsFraudAt = new Date();
  user.markedAsFraudBy = req.user.id;
  user.fraudReason = fraudReason;
  
  await user.save();

  // Hide all vendor's tickets
  await Route.updateMany(
    { vendor: user._id },
    { 
      verificationStatus: 'rejected',
      adminNotes: 'Vendor marked as fraudulent - tickets hidden'
    }
  );

  // Reject all pending bookings
  await Booking.updateMany(
    { 
      vendor: user._id,
      bookingStatus: 'pending'
    },
    {
      bookingStatus: 'rejected',
      vendorResponseNotes: 'Vendor marked as fraudulent - booking rejected'
    }
  );

  logger.info(`Vendor ${user._id} marked as fraud by ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: user,
    message: 'Vendor marked as fraudulent successfully'
  });
});

// @desc    Get advertised tickets
// @route   GET /api/admin/advertised-tickets
// @access  Private/Admin
const getAdvertisedTickets = asyncHandler(async (req, res) => {
  const { search, transportType, page = 1, limit = 20 } = req.query;

  // Build filter object
  const filter = { 
    verificationStatus: 'approved',
    isAdvertised: true 
  };
  
  if (transportType) {
    filter.type = transportType;
  }
  
  if (search) {
    filter.$or = [
      { 'operator.name': { $regex: search, $options: 'i' } },
      { 'from.city': { $regex: search, $options: 'i' } },
      { 'to.city': { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate skip for pagination
  const skip = (page - 1) * limit;

  // Get advertised tickets with pagination
  const tickets = await Route.find(filter)
    .populate('vendor', 'name email photoURL')
    .populate('advertisedBy', 'name email')
    .sort({ advertisementPriority: -1, advertisedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Get total count
  const total = await Route.countDocuments(filter);
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: {
      tickets,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        count: total,
        limit: parseInt(limit)
      }
    }
  });
});

// @desc    Toggle ticket advertisement
// @route   PUT /api/admin/advertised-tickets/:id/toggle
// @access  Private/Admin
const toggleTicketAdvertisement = asyncHandler(async (req, res) => {
  const ticket = await Route.findById(req.params.id).populate('vendor');
  
  if (!ticket) {
    return res.status(404).json({
      success: false,
      error: 'Ticket not found'
    });
  }

  if (ticket.verificationStatus !== 'approved') {
    return res.status(400).json({
      success: false,
      error: 'Can only advertise approved tickets'
    });
  }

  // Check if trying to advertise and max limit reached
  if (!ticket.isAdvertised) {
    const currentAds = await Route.countDocuments({ 
      isAdvertised: true,
      verificationStatus: 'approved'
    });
    
    if (currentAds >= 6) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 6 tickets can be advertised simultaneously'
      });
    }
  }

  // Toggle advertisement status
  ticket.isAdvertised = !ticket.isAdvertised;
  ticket.advertisedBy = req.user.id;
  ticket.advertisedAt = new Date();
  
  if (!ticket.isAdvertised) {
    ticket.advertisementPriority = 0;
  }

  await ticket.save();

  logger.info(`Ticket ${ticket._id} advertisement ${ticket.isAdvertised ? 'enabled' : 'disabled'} by admin ${req.user.id}`);

  res.status(200).json({
    success: true,
    data: ticket,
    message: `Ticket ${ticket.isAdvertised ? 'advertised' : 'unadvertised'} successfully`
  });
});

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalVendors,
    totalAdmins,
    totalTickets,
    pendingTickets,
    approvedTickets,
    rejectedTickets,
    advertisedTickets,
    totalBookings,
    recentBookings,
    suspendedUsers,
    fraudVendors,
    totalRevenue
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'vendor' }),
    User.countDocuments({ role: 'admin' }),
    Route.countDocuments(),
    Route.countDocuments({ verificationStatus: 'pending' }),
    Route.countDocuments({ verificationStatus: 'approved' }),
    Route.countDocuments({ verificationStatus: 'rejected' }),
    Route.countDocuments({ isAdvertised: true }),
    Booking.countDocuments(),
    Booking.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name email').populate('route', 'from to').lean(),
    User.countDocuments({ isSuspended: true }),
    User.countDocuments({ role: 'vendor', isFraud: true }),
    Booking.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);

  const stats = {
    users: {
      total: totalUsers,
      vendors: totalVendors,
      admins: totalAdmins,
      suspended: suspendedUsers,
      fraud: fraudVendors
    },
    tickets: {
      total: totalTickets,
      pending: pendingTickets,
      approved: approvedTickets,
      rejected: rejectedTickets,
      advertised: advertisedTickets
    },
    bookings: {
      total: totalBookings,
      recent: recentBookings
    },
    revenue: {
      total: totalRevenue.length > 0 ? totalRevenue[0].total : 0
    }
  };

  res.status(200).json({
    success: true,
    data: stats
  });
});

module.exports = {
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
};