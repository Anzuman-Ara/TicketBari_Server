const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Route = require('../models/Route');
const Stripe = require('stripe');

// Initialize Stripe with consistent configuration
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Validate Stripe API key
if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  console.warn('WARNING: Using test Stripe API key. This should not be used in production.');
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Production environment is using test Stripe API key!');
    console.error('Please set STRIPE_SECRET_KEY to a live key in your .env.production file');
  }
}

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Calculate profile completion percentage
  const profileFields = ['name', 'email', 'phone', 'photoURL'];
  const completedFields = profileFields.filter(field => user[field]).length;
  const completionPercentage = Math.round((completedFields / profileFields.length) * 100);

  res.status(200).json({
    success: true,
    data: {
      ...user.toObject(),
      profileCompletion: completionPercentage
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, phone, photoURL } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Update user fields
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (photoURL) user.photoURL = photoURL;

  await user.save();

  res.status(200).json({
    success: true,
    data: user,
    message: 'Profile updated successfully'
  });
});

// @desc    Get user bookings with route details
// @route   GET /api/user/bookings
// @access  Private
const getUserBookings = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { user: req.user.id };
  if (status) {
    query.status = status;
  }

  const bookings = await Booking.find(query)
    .populate('route', 'title from to departureTime arrivalTime image price operator availableTickets')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Booking.countDocuments(query);

  // Calculate countdown for pending bookings
  const bookingsWithCountdown = bookings.map(booking => {
    const bookingObj = booking.toObject();
    if (bookingObj.status === 'pending' && bookingObj.route?.departureTime) {
      const departureTime = new Date(bookingObj.route.departureTime);
      const now = new Date();
      const timeDiff = departureTime.getTime() - now.getTime();

      if (timeDiff > 0) {
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        bookingObj.countdown = {
          days,
          hours,
          minutes,
          expired: false
        };
      } else {
        bookingObj.countdown = {
          days: 0,
          hours: 0,
          minutes: 0,
          expired: true
        };
      }
    }
    return bookingObj;
  });

  res.status(200).json({
    success: true,
    data: bookingsWithCountdown,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get user transaction history
// @route   GET /api/user/transactions
// @access  Private
const getUserTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, startDate, endDate, minAmount, maxAmount, search } = req.query;

  const query = { user: req.user.id };

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Amount range filter
  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = parseFloat(minAmount);
    if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
  }

  // Search by booking reference
  if (search) {
    const booking = await Booking.findOne({
      user: req.user.id,
      bookingReference: { $regex: search, $options: 'i' }
    });
    if (booking) {
      query.booking = booking._id;
    } else {
      // If no booking found with search term, return empty results
      query.booking = null;
    }
  }

  const transactions = await Payment.find(query)
    .populate('booking', 'bookingReference route')
    .populate('booking.route', 'title')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    success: true,
    data: transactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Create Stripe payment intent
// @route   POST /api/user/payments/create-intent
// @access  Private
const createPaymentIntent = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;

  const booking = await Booking.findById(bookingId).populate('route');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found'
    });
  }

  if (booking.user.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this booking'
    });
  }

  if (booking.status !== 'accepted') {
    return res.status(400).json({
      success: false,
      message: 'Booking is not in accepted status'
    });
  }

  if (booking.paymentStatus === 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Booking already paid'
    });
  }

  // Check if departure date has passed
  if (new Date(booking.route.departureTime) <= new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot pay for past departure'
    });
  }

  const amountInTaka = Math.round(booking.totalAmount * 100); // Convert to paisa
  const amountInCents = Math.round(amountInTaka / 100); // Convert to cents for USD

    // Check for existing pending payment to prevent duplicates
    const existingPendingPayment = await Payment.findOne({
      booking: booking._id,
      user: req.user.id,
      status: 'pending'
    });
 
    if (existingPendingPayment) {
      console.log('Using existing pending payment for booking:', booking.bookingReference);
      return res.status(200).json({
        success: true,
        data: {
          clientSecret: null,
          paymentIntentId: existingPendingPayment.paymentGateway?.transactionId,
          amount: booking.totalAmount,
          currency: 'BDT',
          existingPayment: true
        }
      });
    }
 
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd', // Using USD for Stripe, will convert from BDT
        metadata: {
          bookingId: booking._id.toString(),
          userId: req.user.id,
          bookingReference: booking.bookingReference
        },
        description: `Payment for booking ${booking.bookingReference}`,
      });
  
    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: booking.totalAmount,
        currency: 'BDT'
      }
    });
  } catch (error) {
    console.error('Stripe payment intent creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent'
    });
  }
});

// @desc    Confirm payment
// @route   POST /api/user/payments/confirm
// @access  Private
const confirmPayment = asyncHandler(async (req, res) => {
  const { bookingId, paymentIntentId } = req.body;

  const booking = await Booking.findById(bookingId).populate('route');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found'
    });
  }

  if (booking.user.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this booking'
    });
  }

  try {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update booking status
      booking.paymentStatus = 'paid';
      booking.status = 'confirmed';
      booking.paymentDetails = {
        transactionId: paymentIntentId,
        paidAt: new Date()
      };
      await booking.save();
  
      // Check for existing pending payment to update instead of creating new
      const existingPendingPayment = await Payment.findOne({
        booking: booking._id,
        user: req.user.id,
        status: 'pending'
      });
  
      let payment;
      if (existingPendingPayment) {
        // Update existing pending payment to completed
        payment = await Payment.findByIdAndUpdate(
          existingPendingPayment._id,
          {
            status: 'completed',
            'paymentGateway.gatewayResponse': paymentIntent,
            transactionDetails: {
              cardLast4: paymentIntent.charges.data[0]?.payment_method_details?.card?.last4,
              cardBrand: paymentIntent.charges.data[0]?.payment_method_details?.card?.brand
            }
          },
          { new: true }
        );
        console.log('Updated existing pending payment to completed for booking:', booking.bookingReference);
      } else {
        // Create payment record
        payment = await Payment.create({
          booking: booking._id,
          user: req.user.id,
          amount: booking.totalAmount,
          currency: 'BDT',
          paymentMethod: 'card',
          paymentGateway: {
            name: 'stripe',
            transactionId: paymentIntentId,
            gatewayResponse: paymentIntent
          },
          status: 'completed',
          transactionDetails: {
            cardLast4: paymentIntent.charges.data[0]?.payment_method_details?.card?.last4,
            cardBrand: paymentIntent.charges.data[0]?.payment_method_details?.card?.brand
          }
        });
      }

      // Reduce available tickets
      const route = await Route.findById(booking.route._id);
      route.availableTickets = Math.max(0, route.availableTickets - booking.passengers.length);
      await route.save();

      res.status(200).json({
        success: true,
        data: {
          booking,
          payment
        },
        message: 'Payment confirmed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }
  } catch (error) {
    console.error('Payment confirmation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment confirmation failed'
    });
  }
});

// @desc    Export transactions as CSV
// @route   GET /api/user/transactions/export
// @access  Private
const exportTransactions = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const query = { user: req.user.id };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const transactions = await Payment.find(query)
    .populate('booking', 'bookingReference')
    .populate('booking.route', 'title')
    .sort({ createdAt: -1 });

  // Generate CSV content
  const csvHeaders = 'Transaction ID,Amount (BDT),Ticket Title,Payment Date,Status\n';
  const csvRows = transactions.map(transaction => {
    const date = new Date(transaction.createdAt).toLocaleDateString('en-BD');
    const amount = transaction.amount;
    const title = transaction.booking?.route?.title || 'Unknown';
    const status = transaction.status;

    return `${transaction.paymentGateway.transactionId},${amount},${title},${date},${status}`;
  }).join('\n');

  const csvContent = csvHeaders + csvRows;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=transactions_${new Date().toISOString().split('T')[0]}.csv`);
  res.status(200).send(csvContent);
});

module.exports = {
  getUserProfile,
  updateUserProfile,
  getUserBookings,
  getUserTransactions,
  createPaymentIntent,
  confirmPayment,
  exportTransactions
};