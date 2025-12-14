const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Route = require('../models/Route');
const Booking = require('../models/Booking');
const logger = require('../utils/logger');

// @desc    Get vendor profile
// @route   GET /api/vendor/profile
// @access  Private (Vendor)
const getVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await User.findById(req.user.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  // Calculate profile completion percentage
  let completionPercentage = 0;
  const fields = [
    'name', 'email', 'phone', 'photoURL', 'businessName', 
    'businessAddress.street', 'businessAddress.city', 'businessPhone',
    'businessEmail', 'businessLicense.number', 'bankDetails.accountName'
  ];
  
  let completedFields = 0;
  fields.forEach(field => {
    const value = field.includes('.') ? 
      field.split('.').reduce((obj, key) => obj?.[key], vendor) : 
      vendor[field];
    if (value) completedFields++;
  });
  
  completionPercentage = Math.round((completedFields / fields.length) * 100);
  
  await User.findByIdAndUpdate(req.user.id, { 
    profileCompletion: completionPercentage 
  });
  
  res.status(200).json({
    success: true,
    data: {
      ...vendor.toObject(),
      profileCompletion: completionPercentage
    }
  });
});

// @desc    Update vendor profile
// @route   PUT /api/vendor/profile
// @access  Private (Vendor)
const updateVendorProfile = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    photoURL,
    businessName,
    businessAddress,
    businessPhone,
    businessEmail,
    businessLicense,
    taxId,
    bankDetails
  } = req.body;
  
  const vendor = await User.findById(req.user.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  // Update vendor fields
  const updateFields = {
    name,
    email,
    phone,
    photoURL,
    businessName,
    businessAddress,
    businessPhone,
    businessEmail,
    businessLicense,
    taxId,
    bankDetails
  };
  
  // Remove undefined fields
  Object.keys(updateFields).forEach(key => {
    if (updateFields[key] === undefined) {
      delete updateFields[key];
    }
  });
  
  const updatedVendor = await User.findByIdAndUpdate(
    req.user.id, 
    updateFields, 
    { new: true, runValidators: true }
  );
  
  // Recalculate profile completion
  let completionPercentage = 0;
  const fields = [
    'name', 'email', 'phone', 'photoURL', 'businessName', 
    'businessAddress.street', 'businessAddress.city', 'businessPhone',
    'businessEmail', 'businessLicense.number', 'bankDetails.accountName'
  ];
  
  let completedFields = 0;
  fields.forEach(field => {
    const value = field.includes('.') ? 
      field.split('.').reduce((obj, key) => obj?.[key], updatedVendor) : 
      updatedVendor[field];
    if (value) completedFields++;
  });
  
  completionPercentage = Math.round((completedFields / fields.length) * 100);
  
  await User.findByIdAndUpdate(req.user.id, { 
    profileCompletion: completionPercentage 
  });
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Vendor profile updated: ${updatedVendor.email}`);
  }
  
  res.status(200).json({
    success: true,
    data: {
      ...updatedVendor.toObject(),
      profileCompletion: completionPercentage
    }
  });
});

// @desc    Add new ticket
// @route   POST /api/vendor/tickets
// @access  Private (Vendor)
const addTicket = asyncHandler(async (req, res) => {
  const {
    operatorName,
    operatorCode,
    fromCity,
    fromState,
    toCity,
    toState,
    type,
    class: ticketClass,
    departureTime,
    arrivalTime,
    duration,
    baseFare,
    totalSeats,
    amenities,
    perks,
    availableQuantity,
    imageUrl,
    description
  } = req.body;
  
  // Validate required fields
  if (!operatorName || !fromCity || !toCity || !type || !baseFare || !availableQuantity) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }
  
  const ticket = await Route.create({
    operator: {
      name: operatorName,
      code: operatorCode || operatorName.substring(0, 3).toUpperCase()
    },
    from: {
      city: fromCity,
      state: fromState || ''
    },
    to: {
      city: toCity,
      state: toState || ''
    },
    type,
    class: ticketClass || 'economy',
    schedule: [{
      departureTime,
      arrivalTime,
      duration
    }],
    pricing: {
      baseFare
    },
    capacity: {
      totalSeats,
      amenities: amenities || []
    },
    perks: perks || [],
    availableQuantity: parseInt(availableQuantity),
    imageUrl,
    description,
    createdBy: req.user.id,
    vendor: req.user.id
  });
  
  const populatedTicket = await Route.findById(ticket._id)
    .populate('vendor', 'name email businessName');
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Ticket added by vendor: ${req.user.id}, Ticket ID: ${ticket._id}`);
  }
  
  res.status(201).json({
    success: true,
    data: populatedTicket
  });
});

// @desc    Get vendor tickets
// @route   GET /api/vendor/tickets
// @access  Private (Vendor)
const getVendorTickets = asyncHandler(async (req, res) => {
  const { status, search } = req.query; 
  
  let query = { vendor: req.user.id }; 
  
  if (status && status !== 'all') {
    query.verificationStatus = status;
  } 
  
  if (search) {
    query.$or = [
      { 'operator.name': { $regex: search, $options: 'i' } },
      { 'from.city': { $regex: search, $options: 'i' } },
      { 'to.city': { $regex: search, $options: 'i' } }
    ];
  }
  
  const tickets = await Route.find(query)
    .populate('vendor', 'name email businessName')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: tickets.length,
    data: tickets
  });
});

// @desc    Update ticket
// @route   PUT /api/vendor/tickets/:id
// @access  Private (Vendor)
const updateTicket = asyncHandler(async (req, res) => {
  let ticket = await Route.findById(req.params.id); 
  
  if (!ticket) {
    res.status(404);
    throw new Error('Ticket not found');
  }
  
  // Check if ticket belongs to vendor
  if (ticket.vendor.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to update this ticket');
  }
  
  // Don't allow updates if ticket is rejected
  if (ticket.verificationStatus === 'rejected') {
    res.status(400);
    throw new Error('Cannot update rejected ticket');
  }
  
  const {
    operatorName,
    operatorCode,
    fromCity,
    fromState,
    toCity,
    toState,
    type,
    class: ticketClass,
    departureTime,
    arrivalTime,
    duration,
    baseFare,
    totalSeats,
    amenities,
    perks,
    availableQuantity,
    imageUrl,
    description
  } = req.body;
  
  // Update ticket fields
  const updateFields = {}; 
  
  if (operatorName) updateFields['operator.name'] = operatorName;
  if (operatorCode) updateFields['operator.code'] = operatorCode;
  if (fromCity) updateFields['from.city'] = fromCity;
  if (fromState !== undefined) updateFields['from.state'] = fromState;
  if (toCity) updateFields['to.city'] = toCity;
  if (toState !== undefined) updateFields['to.state'] = toState;
  if (type) updateFields.type = type;
  if (ticketClass) updateFields.class = ticketClass;
  if (baseFare) updateFields['pricing.baseFare'] = baseFare;
  if (totalSeats) updateFields['capacity.totalSeats'] = totalSeats;
  if (availableQuantity) updateFields.availableQuantity = parseInt(availableQuantity);
  if (imageUrl) updateFields.imageUrl = imageUrl;
  if (description !== undefined) updateFields.description = description;
  if (amenities) updateFields['capacity.amenities'] = amenities;
  if (perks) updateFields.perks = perks; 
  
  if (departureTime || arrivalTime || duration) {
    updateFields.schedule = [{
      departureTime: departureTime || ticket.schedule[0].departureTime,
      arrivalTime: arrivalTime || ticket.schedule[0].arrivalTime,
      duration: duration || ticket.schedule[0].duration,
      days: ticket.schedule[0].days || ['daily'],
      frequency: ticket.schedule[0].frequency || 'daily'
    }];
  }
  
  ticket = await Route.findByIdAndUpdate(
    req.params.id,
    updateFields,
    { new: true, runValidators: true }
  ).populate('vendor', 'name email businessName');
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Ticket updated by vendor: ${req.user.id}, Ticket ID: ${ticket._id}`);
  }
  
  res.status(200).json({
    success: true,
    data: ticket
  });
});

// @desc    Delete ticket
// @route   DELETE /api/vendor/tickets/:id
// @access  Private (Vendor)
const deleteTicket = asyncHandler(async (req, res) => {
  const ticket = await Route.findById(req.params.id); 
  
  if (!ticket) {
    res.status(404);
    throw new Error('Ticket not found');
  }
  
  // Check if ticket belongs to vendor
  if (ticket.vendor.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to delete this ticket');
  }
  
  // Don't allow deletion if ticket is rejected (to prevent abuse)
  if (ticket.verificationStatus === 'rejected') {
    res.status(400);
    throw new Error('Cannot delete rejected ticket');
  }
  
  await ticket.deleteOne();
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Ticket deleted by vendor: ${req.user.id}, Ticket ID: ${req.params.id}`);
  }
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get vendor booking requests
// @route   GET /api/vendor/bookings
// @access  Private (Vendor)
const getVendorBookings = asyncHandler(async (req, res) => {
  const { status, search, startDate, endDate } = req.query; 
  
  let query = { vendor: req.user.id }; 
  
  if (status && status !== 'all') {
    query.bookingStatus = status;
  } 
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  } 
  
  if (search) {
    query.$or = [
      { 'user.name': { $regex: search, $options: 'i' } },
      { 'user.email': { $regex: search, $options: 'i' } },
      { bookingReference: { $regex: search, $options: 'i' } }
    ];
  }
  
  const bookings = await Booking.find(query)
    .populate('user', 'name email')
    .populate('route', 'operator.name from.city to.city type pricing.baseFare')
    .populate('vendor', 'name email businessName')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Accept booking request
// @route   PUT /api/vendor/bookings/:id/accept
// @access  Private (Vendor)
const acceptBooking = asyncHandler(async (req, res) => {
  const { notes } = req.body; 
  
  const booking = await Booking.findById(req.params.id); 
  
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  
  // Check if booking belongs to vendor
  if (booking.vendor.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to manage this booking');
  }
  
  // Check if booking is already processed
  if (booking.bookingStatus !== 'pending') {
    res.status(400);
    throw new Error('Booking has already been processed');
  }
  
  // Get the route to check availability
  const route = await Route.findById(booking.route);
  if (!route) {
    res.status(404);
    throw new Error('Route not found');
  }
  
  // Check if enough tickets are available
  if (route.availableQuantity < booking.bookingQuantity) {
    res.status(400);
    throw new Error('Insufficient tickets available');
  }
  
  // Update booking status
  booking.bookingStatus = 'accepted';
  booking.vendorResponseAt = new Date();
  booking.vendorResponseNotes = notes || '';
  await booking.save();
  
  // Reduce available quantity
  route.availableQuantity -= booking.bookingQuantity;
  await route.save();
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Booking accepted by vendor: ${req.user.id}, Booking ID: ${booking._id}`);
  }
  
  const populatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name email')
    .populate('route', 'operator.name from.city to.city type pricing.baseFare');
  
  res.status(200).json({
    success: true,
    data: populatedBooking
  });
});

// @desc    Reject booking request
// @route   PUT /api/vendor/bookings/:id/reject
// @access  Private (Vendor)
const rejectBooking = asyncHandler(async (req, res) => {
  const { notes } = req.body; 
  
  const booking = await Booking.findById(req.params.id); 
  
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  
  // Check if booking belongs to vendor
  if (booking.vendor.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to manage this booking');
  }
  
  // Check if booking is already processed
  if (booking.bookingStatus !== 'pending') {
    res.status(400);
    throw new Error('Booking has already been processed');
  }
  
  // Update booking status
  booking.bookingStatus = 'rejected';
  booking.vendorResponseAt = new Date();
  booking.vendorResponseNotes = notes || '';
  await booking.save();
  
  // Only log in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Booking rejected by vendor: ${req.user.id}, Booking ID: ${booking._id}`);
  }
  
  const populatedBooking = await Booking.findById(booking._id)
    .populate('user', 'name email')
    .populate('route', 'operator.name from.city to.city type pricing.baseFare');
  
  res.status(200).json({
    success: true,
    data: populatedBooking
  });
});

// @desc    Get vendor revenue analytics
// @route   GET /api/vendor/revenue
// @access  Private (Vendor)
const getVendorRevenue = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query; 
  
  // Default to last 30 days if no date range provided
  const defaultEndDate = new Date();
  const defaultStartDate = new Date(defaultEndDate.getTime() - 30 * 24 * 60 * 60 * 1000); 
  
  const start = startDate ? new Date(startDate) : defaultStartDate;
  const end = endDate ? new Date(endDate) : defaultEndDate;
  
  // Get all bookings for the vendor in the date range
  const bookings = await Booking.find({
    vendor: req.user.id,
    createdAt: { $gte: start, $lte: end },
    bookingStatus: { $in: ['accepted', 'completed'] },
    paymentStatus: 'paid'
  }).populate('route', 'type from.city to.city pricing.baseFare');
  
  // Calculate key metrics
  const totalRevenue = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
  const totalTicketsSold = bookings.reduce((sum, booking) => sum + booking.bookingQuantity, 0); 
  
  // Get total tickets added by vendor
  const totalTicketsAdded = await Route.countDocuments({ vendor: req.user.id });
  
  // Calculate average booking value
  const averageBookingValue = bookings.length > 0 ? totalRevenue / bookings.length : 0;
  
  // Calculate conversion rate
  const totalBookings = await Booking.countDocuments({
    vendor: req.user.id,
    createdAt: { $gte: start, $lte: end }
  });
  const conversionRate = totalBookings > 0 ? (bookings.length / totalBookings) * 100 : 0;
  
  // Get revenue trend by month
  const revenueByMonth = await Booking.aggregate([
    {
      $match: {
        vendor: req.user.id,
        createdAt: { $gte: start, $lte: end },
        bookingStatus: { $in: ['accepted', 'completed'] },
        paymentStatus: 'paid'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$totalAmount' },
        bookings: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
  
  // Get popular destinations
  const popularDestinations = await Booking.aggregate([
    {
      $match: {
        vendor: req.user.id,
        createdAt: { $gte: start, $lte: end },
        bookingStatus: { $in: ['accepted', 'completed'] }
      }
    },
    {
      $lookup: {
        from: 'routes',
        localField: 'route',
        foreignField: '_id',
        as: 'routeInfo'
      }
    },
    { $unwind: '$routeInfo' },
    {
      $group: {
        _id: {
          from: '$routeInfo.from.city',
          to: '$routeInfo.to.city'
        },
        bookings: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }
    },
    { $sort: { bookings: -1 } },
    { $limit: 10 }
  ]);
  
  // Get transport type distribution
  const transportTypes = await Booking.aggregate([
    {
      $match: {
        vendor: req.user.id,
        createdAt: { $gte: start, $lte: end },
        bookingStatus: { $in: ['accepted', 'completed'] }
      }
    },
    {
      $lookup: {
        from: 'routes',
        localField: 'route',
        foreignField: '_id',
        as: 'routeInfo'
      }
    },
    { $unwind: '$routeInfo' },
    {
      $group: {
        _id: '$routeInfo.type',
        count: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  // Get booking status breakdown
  const statusBreakdown = await Booking.aggregate([
    {
      $match: {
        vendor: req.user.id,
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$bookingStatus',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Only log revenue analytics access in production environment
  if (process.env.NODE_ENV === 'production') {
    logger.info(`Vendor revenue analytics accessed by vendor: ${req.user.id}`);
  }
  
  res.status(200).json({
    success: true,
    data: {
      metrics: {
        totalRevenue,
        totalTicketsSold,
        totalTicketsAdded,
        averageBookingValue,
        conversionRate
      },
      charts: {
        revenueByMonth,
        popularDestinations,
        transportTypes,
        statusBreakdown
      }
    }
  });
});

module.exports = {
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
};