const asyncHandler = require('express-async-handler');
const Booking = require('../models/Booking');
const Route = require('../models/Route');
const User = require('../models/User');

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = asyncHandler(async (req, res) => {
  const { routeId, quantity } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!routeId || !quantity || quantity < 1) {
    return res.status(400).json({
      success: false,
      message: 'Route ID and valid quantity are required'
    });
  }

  // Find the route
  const route = await Route.findById(routeId);
  if (!route) {
    return res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }

  console.log('Route data:', {
    routeId: route._id,
    operator: route.operator,
    operatorType: typeof route.operator,
    schedule: route.schedule,
    availableTickets: route.availableTickets,
    price: route.price
  });

  // Check if route has available tickets
  const availableTickets = route.availableTickets || route.availableQuantity || 10; // Default to 10 if not specified
  if (availableTickets <= 0) {
    return res.status(400).json({
      success: false,
      message: 'No tickets available for this route'
    });
  }

  // Check if requested quantity exceeds available tickets
  if (quantity > availableTickets) {
    return res.status(400).json({
      success: false,
      message: `Only ${availableTickets} tickets available`
    });
  }

  // Use the booking date from the request or default to today
  let departureTime;
  try {
    if (req.body.bookingDate) {
      departureTime = new Date(req.body.bookingDate);
    } else {
      // If no booking date provided, use today's date with the route's time
      const timeString = route.schedule[0]?.departureTime;

      if (timeString && timeString.length <= 5 && timeString.includes(':')) {
        const today = new Date();
        const [hours, minutes] = timeString.split(':');
        departureTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
      } else {
        departureTime = new Date();
      }
    }

    // Check if the date is valid
    if (isNaN(departureTime.getTime())) {
      console.error('Invalid departure time format:', req.body.bookingDate || route.schedule[0]?.departureTime);
      return res.status(400).json({
        success: false,
        message: 'Invalid departure time format'
      });
    }
  } catch (error) {
    console.error('Error parsing departure time:', error);
    return res.status(400).json({
      success: false,
      message: 'Invalid departure time format'
    });
  }

  const now = new Date();

  console.log('Backend departure time check:', {
    routeDepartureTime: route.schedule[0].departureTime,
    parsedDepartureTime: departureTime.toISOString(),
    now: now.toISOString(),
    isPast: departureTime <= now
  });

  if (departureTime <= now) {
    return res.status(400).json({
      success: false,
      message: 'Cannot book tickets for past departure'
    });
  }

  // Handle vendor/operator - can be either ObjectId string or embedded object
  let vendor;
  try {
    if (route.operator && typeof route.operator === 'string') {
      // If operator is a string (ObjectId), find the user
      vendor = await User.findById(route.operator);
    } else if (route.operator && typeof route.operator === 'object') {
      // If operator is an embedded object, use it directly
      vendor = {
        _id: route.vendor, // Use the actual vendor user ID from the route
        name: route.operator.name,
        email: route.operator.contact?.email || 'vendor@ticketbari.com',
        phone: route.operator.contact?.phone || 'N/A',
        role: 'vendor'
      };
    }

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
  } catch (error) {
    console.error('Error finding vendor:', error);
    return res.status(400).json({
      success: false,
      message: 'Invalid vendor information'
    });
  }

  // Calculate total amount - handle different price field names
  const baseFare = route.price || route.pricing?.baseFare || route.fare || 500; // Default to 500 if not specified
  const totalAmount = baseFare * quantity;

  // Create passengers array (basic implementation)
  const passengers = Array(quantity).fill().map((_, index) => ({
    name: `Passenger ${index + 1}`,
    age: 25,
    gender: 'male',
    seatNumber: `A${index + 1}`
  }));

  // Generate booking reference
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const bookingReference = `TB${year}${month}${random}`;

  // Create the booking
  const booking = await Booking.create({
    bookingReference: bookingReference,
    user: userId,
    route: routeId,
    vendor: vendor._id,
    bookingStatus: 'pending',
    bookingQuantity: quantity,
    passengers: passengers,
    departureDate: departureTime,
    totalAmount: totalAmount,
    baseFare: baseFare,
    contactInfo: {
      email: req.user.email,
      phone: req.user.phone || 'N/A'
    }
  });

  res.status(201).json({
    success: true,
    data: booking,
    message: 'Booking created successfully with pending status'
  });
});

// @desc    Get user's bookings
// @route   GET /api/user/bookings
// @access  Private
const getUserBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ user: req.user.id })
    .populate('route', 'title from to departureTime arrivalTime price operator')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: bookings
  });
});

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('route', 'title from to departureTime arrivalTime price operator')
    .populate('user', 'name email');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found'
    });
  }

  // Check if the user is authorized to view this booking
  if (booking.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this booking'
    });
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById
};