const asyncHandler = require('express-async-handler');
const Stripe = require('stripe');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Route = require('../models/Route');
const logger = require('../utils/logger');

// Initialize Stripe
let stripe;

try {
  console.log('STRIPE_SECRET_KEY from env:', process.env.STRIPE_SECRET_KEY);
  
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('ERROR: Stripe API key is not set. Please set STRIPE_SECRET_KEY in your .env file.');
    throw new Error('Stripe API key is not configured.');
  }

  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });

  if (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    console.warn('WARNING: Using test Stripe API key. This should not be used in production.');
    if (process.env.NODE_ENV === 'production') {
      console.error('ERROR: Production environment is using test Stripe API key!');
      console.error('Please set STRIPE_SECRET_KEY to a live key in your .env.production file');
    }
  }
  
  console.log('Stripe initialized successfully');
} catch (error) {
  console.error('ERROR: Failed to initialize Stripe:', error.message);
  throw new Error('Stripe initialization failed.');
}


// @desc    Update booking payment status after successful Stripe checkout
// @route   POST /api/payments/update-payment-status
// @access  Public (called from client after successful Stripe payment)
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { bookingId, sessionId } = req.body;
  
  if (!bookingId) {
    res.status(400);
    throw new Error('Booking ID is required');
  }
  
  // Find the booking
  const booking = await Booking.findById(bookingId)
    .populate('route')
    .populate('vendor');
  
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }
  
  // Check if already paid to avoid duplicate processing
  if (booking.paymentStatus === 'paid') {
    logger.info(`Booking ${bookingId} already marked as paid, skipping update`);
    res.status(200).json({
      success: true,
      message: 'Booking already paid',
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.status
      }
    });
    return;
  }
  
  // If sessionId is provided, verify the checkout session
  let paymentIntentId = null;
  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      // Verify the session belongs to this booking
      if (session.metadata?.bookingId !== bookingId.toString()) {
        res.status(400);
        throw new Error('Session does not belong to this booking');
      }
      
      // Check if payment was successful
      if (session.payment_status !== 'paid') {
        res.status(400);
        throw new Error('Payment not completed in Stripe');
      }
      
      paymentIntentId = session.payment_intent;
    } catch (error) {
      logger.error(`Error verifying Stripe session: ${error.message}`);
      res.status(400);
      throw new Error('Failed to verify payment with Stripe');
    }
  }
  
  // Update payment record
  let payment;
  if (paymentIntentId) {
    payment = await Payment.findOneAndUpdate(
      {
        booking: bookingId,
        'paymentGateway.transactionId': sessionId
      },
      {
        status: 'completed',
        'paymentGateway.gatewayResponse': {
          status: 'completed',
          sessionId: sessionId,
          paymentIntentId: paymentIntentId
        }
      },
      { new: true }
    );
  } else {
    // If no sessionId, just find any pending payment for this booking
    payment = await Payment.findOneAndUpdate(
      {
        booking: bookingId,
        status: 'pending'
      },
      {
        status: 'completed',
        'paymentGateway.gatewayResponse': {
          status: 'completed'
        }
      },
      { new: true }
    );
  }
  
  // Update booking status
  booking.paymentStatus = 'paid';
  booking.status = 'confirmed';
  booking.paymentMethod = 'card';
  booking.paymentDetails = {
    transactionId: sessionId,
    paidAt: new Date(),
    gatewayResponse: {
      status: 'completed',
      sessionId: sessionId
    }
  };
  booking.notifications.paymentReceived = true;
  await booking.save();
  
  // Reduce ticket quantity in route
  if (booking.route) {
    await Route.findByIdAndUpdate(booking.route._id, {
      $inc: { availableQuantity: -booking.bookingQuantity }
    });
  }
  
  // Emit socket event for real-time updates
  const io = req.app.get('io');
  if (io) {
    io.to(`booking-${bookingId}`).emit('payment-confirmed', {
      bookingId,
      paymentStatus: 'paid',
      bookingStatus: 'confirmed'
    });
  
    // Notify vendor
    if (booking.vendor) {
      io.to(`vendor-${booking.vendor._id}`).emit('payment-received', {
        bookingId,
        bookingReference: booking.bookingReference,
        amount: booking.totalAmount
      });
    }
  }
  
  logger.info(`Payment status updated for booking ${booking.bookingReference} via direct update`);
  
  res.status(200).json({
    success: true,
    message: 'Payment status updated successfully',
    data: {
      bookingId: booking._id,
      bookingReference: booking.bookingReference,
      paymentStatus: 'paid',
      bookingStatus: 'confirmed',
      amount: booking.totalAmount,
      paidAt: booking.paymentDetails.paidAt
    }
  });
});



// @desc    Get payment history for user
// @route   GET /api/payments/history
// @access  Private
const getPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10, status, startDate, endDate, search } = req.query;

  const query = { user: userId };

  if (status) {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const payments = await Payment.find(query)
    .populate({
      path: 'booking',
      populate: {
        path: 'route',
        select: 'title from to departureTime'
      }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    success: true,
    data: payments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get payment status
// @route   GET /api/payments/status/:id
// @access  Private
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const payment = await Payment.findOne({ _id: id, user: userId })
    .populate({
      path: 'booking',
      select: 'bookingReference totalAmount status paymentStatus'
    });

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  res.status(200).json({
    success: true,
    data: payment
  });
});

// @desc    Request refund
// @route   POST /api/payments/refund
// @access  Private
const requestRefund = asyncHandler(async (req, res) => {
  const { paymentId, reason } = req.body;
  const userId = req.user._id;

  const payment = await Payment.findOne({ _id: paymentId, user: userId })
    .populate('booking');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (payment.status !== 'completed') {
    res.status(400);
    throw new Error('Only completed payments can be refunded');
  }

  if (payment.refund?.refundStatus === 'completed') {
    res.status(400);
    throw new Error('Payment has already been refunded');
  }

  // Create refund in Stripe
  const refund = await stripe.refunds.create({
    payment_intent: payment.paymentGateway.transactionId,
    reason: 'requested_by_customer'
  });

  // Update payment record
  payment.status = 'refunded';
  payment.refund = {
    amount: payment.amount,
    reason: reason || 'Customer requested refund',
    refundDate: new Date(),
    refundReference: refund.id,
    refundStatus: 'completed'
  };
  await payment.save();

  // Update booking
  await Booking.findByIdAndUpdate(payment.booking._id, {
    paymentStatus: 'refunded',
    status: 'refunded',
    refundAmount: payment.amount,
    refundReason: reason
  });

  // Restore ticket quantity
  if (payment.booking.route) {
    await Route.findByIdAndUpdate(payment.booking.route, {
      $inc: { availableQuantity: payment.booking.bookingQuantity }
    });
  }

  logger.info(`Refund processed for payment ${paymentId}`);

  res.status(200).json({
    success: true,
    message: 'Refund processed successfully',
    data: {
      refundId: refund.id,
      amount: payment.amount,
      status: 'refunded'
    }
  });
});

// @desc    Get user transactions with filters
// @route   GET /api/user/transactions
// @access  Private
const getUserTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { 
    page = 1, 
    limit = 10, 
    search, 
    startDate, 
    endDate, 
    minAmount, 
    maxAmount 
  } = req.query;

  const query = { user: userId };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) query.amount.$gte = parseFloat(minAmount);
    if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
  }

  let payments = await Payment.find(query)
    .populate({
      path: 'booking',
      populate: {
        path: 'route',
        select: 'title from to'
      }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  // Filter by search if provided
  if (search) {
    const searchLower = search.toLowerCase();
    payments = payments.filter(p => 
      p.booking?.route?.title?.toLowerCase().includes(searchLower) ||
      p.booking?.bookingReference?.toLowerCase().includes(searchLower) ||
      p.paymentGateway?.transactionId?.toLowerCase().includes(searchLower)
    );
  }

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    success: true,
    data: payments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Export transactions as CSV
// @route   GET /api/user/transactions/export
// @access  Private
const exportTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { startDate, endDate } = req.query;

  const query = { user: userId };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const transactions = await Payment.find(query)
    .populate('booking', 'bookingReference')
    .populate('booking.route', 'title')
    .sort({ createdAt: -1 });

  // Generate CSV
  const csvHeaders = 'Transaction ID,Booking Reference,Amount,Currency,Status,Ticket Title,Route,Payment Date\n';
  const csvRows = transactions.map(p => {
    return [
      p.paymentGateway?.transactionId || 'N/A',
      p.booking?.bookingReference || 'N/A',
      p.amount,
      p.currency,
      p.status,
      `"${p.booking?.route?.title || 'Unknown'}"`,
      `"${p.booking?.route?.from || ''} - ${p.booking?.route?.to || ''}"`,
      new Date(p.createdAt).toISOString()
    ].join(',');
  }).join('\n');

  const csv = csvHeaders + csvRows;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=transactions_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
});

// @desc    Get vendor revenue
// @route   GET /api/vendor/revenue
// @access  Private (Vendor)
const getVendorRevenue = asyncHandler(async (req, res) => {
  const vendorId = req.user._id;
  const { startDate, endDate } = req.query;

  const matchQuery = {
    status: 'completed'
  };

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  // Get bookings for this vendor
  const vendorBookings = await Booking.find({ vendor: vendorId }).select('_id');
  const bookingIds = vendorBookings.map(b => b._id);

  matchQuery.booking = { $in: bookingIds };

  const revenue = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        avgTransactionValue: { $avg: '$amount' }
      }
    }
  ]);

  // Get daily revenue for chart
  const dailyRevenue = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 30 }
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: revenue[0] || { totalRevenue: 0, totalTransactions: 0, avgTransactionValue: 0 },
      dailyRevenue
    }
  });
});

// @desc    Create Stripe checkout session
// @route   POST /api/payments/create-checkout-session
// @access  Public
const createCheckoutSession = asyncHandler(async (req, res) => {
  const { bookingId, successUrl, cancelUrl } = req.body;

  if (!bookingId) {
    res.status(400);
    throw new Error('Booking ID is required');
  }

  if (!successUrl || !cancelUrl) {
    res.status(400);
    throw new Error('Success and cancel URLs are required');
  }

  // Find the booking
  const booking = await Booking.findById(bookingId)
    .populate('route')
    .populate('user');

  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }

  // Check if booking is already paid
  if (booking.paymentStatus === 'paid') {
    res.status(400);
    throw new Error('Booking is already paid');
  }
  
  // Check if there are enough available tickets
  if (booking.route && booking.route.availableQuantity < booking.bookingQuantity) {
    res.status(400);
    throw new Error('Not enough available tickets for this route');
  }

  
  // Create Stripe checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'bdt',
            product_data: {
              name: booking.route?.title || 'Ticket Booking',
              description: `${booking.route?.from || 'Departure'} to ${booking.route?.to || 'Arrival'}`
            },
            unit_amount: Math.round(booking.totalAmount * 100), // Convert to cents
          },
          quantity: booking.bookingQuantity || 1,
        }
      ],
      mode: 'payment',
      success_url: successUrl.includes('booking_id')
        ? successUrl + '&session_id={CHECKOUT_SESSION_ID}'
        : `${successUrl}&booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        bookingId: bookingId.toString(),
        userId: booking.user?._id.toString()
      },
      customer_email: booking.user?.email
    });

    // Check for existing pending payment for this booking
    let payment = await Payment.findOne({
      booking: bookingId,
      status: 'pending'
    });

    if (payment) {
      // Update existing pending payment with new session ID
      payment.paymentGateway.transactionId = session.id;
      payment.updatedAt = Date.now();
      await payment.save();
      logger.info(`Updated existing pending payment ${payment._id} with new Stripe session ${session.id}`);
    } else {
      // Create a new pending payment record
      payment = new Payment({
        booking: bookingId,
        user: booking.user?._id,
        amount: booking.totalAmount,
        currency: 'BDT',
        status: 'pending',
        paymentMethod: 'card',
        paymentGateway: {
          gateway: 'stripe',
          transactionId: session.id
        }
      });

      await payment.save();
      logger.info(`Created new pending payment ${payment._id} for Stripe session ${session.id}`);
    }
    
    

    

    logger.info(`Created Stripe checkout session ${session.id} for booking ${bookingId}`);

    res.status(200).json({
      success: true,
      message: 'Checkout session created successfully',
      data: {
        sessionId: session.id,
        sessionUrl: session.url,
        bookingId: booking._id
      }
    });
  } catch (error) {
    logger.error(`Error creating Stripe checkout session: ${error.message}`);
    res.status(500);
    throw new Error('Failed to create checkout session');
  }
});

// @desc    Get admin payment analytics
// @route   GET /api/admin/payments/analytics
// @access  Private (Admin)
const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const matchQuery = {};

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  // Overall stats
  const overallStats = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  // Payment method breakdown
  const paymentMethods = await Payment.aggregate([
    { $match: { ...matchQuery, status: 'completed' } },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  // Daily trends
  const dailyTrends = await Payment.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        revenue: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] }
        }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 30 }
  ]);

  // Success rate
  const totalPayments = await Payment.countDocuments(matchQuery);
  const successfulPayments = await Payment.countDocuments({ ...matchQuery, status: 'completed' });
  const successRate = totalPayments > 0 ? (successfulPayments / totalPayments * 100).toFixed(2) : 0;

  res.status(200).json({
    success: true,
    data: {
      overallStats,
      paymentMethods,
      dailyTrends,
      successRate: parseFloat(successRate),
      totalPayments,
      successfulPayments
    }
  });
});

module.exports = {
  getPaymentHistory,
  getPaymentStatus,
  requestRefund,
  getUserTransactions,
  exportTransactions,
  getVendorRevenue,
  getPaymentAnalytics,
  createCheckoutSession,
  updatePaymentStatus
};
