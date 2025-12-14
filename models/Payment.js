const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'BDT',
    enum: ['BDT', 'USD', 'EUR', 'GBP']
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'mobile_banking', 'cash', 'wallet'],
    required: true
  },
  paymentGateway: {
    name: {
      type: String,
      enum: ['stripe', 'paypal', 'bkash', 'nagad', 'rocket', 'ssl_commerz', 'aamarpay'],
      default: 'stripe'
    },
    transactionId: {
      type: String,
      index: true
    },
    chargeId: String,
    paymentIntentId: String,
    customerId: String,
    paymentMethodId: String,
    gatewayResponse: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'disputed'],
    default: 'pending'
  },
  transactionDetails: {
    cardLast4: String,
    cardBrand: String,
    cardExpMonth: Number,
    cardExpYear: Number,
    cardCountry: String,
    cardFunding: String,
    bankName: String,
    accountNumber: String,
    referenceNumber: String,
    receiptUrl: String,
    receiptNumber: String
  },
  fees: {
    processingFee: {
      type: Number,
      default: 0
    },
    gatewayFee: {
      type: Number,
      default: 0
    },
    platformFee: {
      type: Number,
      default: 0
    },
    totalFees: {
      type: Number,
      default: 0
    }
  },
  vendorPayout: {
    amount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    payoutDate: Date,
    payoutReference: String
  },
  refund: {
    amount: {
      type: Number,
      default: 0
    },
    reason: String,
    refundDate: Date,
    refundReference: String,
    refundStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed']
    },
    stripeRefundId: String
  },
  dispute: {
    disputeId: String,
    reason: String,
    status: {
      type: String,
      enum: ['warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'charge_refunded', 'won', 'lost']
    },
    amount: Number,
    createdAt: Date,
    evidence: mongoose.Schema.Types.Mixed
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    deviceFingerprint: String,
    riskScore: Number,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'elevated']
    }
  },
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  attempts: [{
    attemptedAt: {
      type: Date,
      default: Date.now
    },
    status: String,
    errorCode: String,
    errorMessage: String,
    declineCode: String
  }],
  webhookEvents: [{
    eventId: String,
    eventType: String,
    receivedAt: {
      type: Date,
      default: Date.now
    },
    processed: {
      type: Boolean,
      default: false
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  failedAt: Date
});

// Update the updatedAt field before saving
PaymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate total fees
PaymentSchema.pre('save', function(next) {
  this.fees.totalFees = (this.fees.processingFee || 0) + 
                        (this.fees.gatewayFee || 0) + 
                        (this.fees.platformFee || 0);
  next();
});

// Calculate vendor payout amount (total - fees)
PaymentSchema.pre('save', function(next) {
  if (this.status === 'completed' && this.vendorPayout.amount === 0) {
    this.vendorPayout.amount = this.amount - this.fees.totalFees;
  }
  next();
});

// Set completedAt or failedAt timestamps
PaymentSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'completed' && !this.completedAt) {
      this.completedAt = Date.now();
    } else if (this.status === 'failed' && !this.failedAt) {
      this.failedAt = Date.now();
    }
  }
  next();
});

// Virtual for net amount (after fees)
PaymentSchema.virtual('netAmount').get(function() {
  return this.amount - this.fees.totalFees;
});

// Virtual for is refundable
PaymentSchema.virtual('isRefundable').get(function() {
  return this.status === 'completed' && 
         !this.refund?.refundStatus && 
         !this.dispute?.disputeId;
});

// Indexes for better query performance
PaymentSchema.index({ booking: 1 });
PaymentSchema.index({ user: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ 'paymentGateway.transactionId': 1 });
PaymentSchema.index({ 'paymentGateway.chargeId': 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ user: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ 'vendorPayout.status': 1 });

// Unique compound index to prevent duplicate pending payments for the same booking
// This prevents race conditions where multiple payment creation requests come in simultaneously
PaymentSchema.index({ booking: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

// Ensure virtuals are included in JSON output
PaymentSchema.set('toJSON', { virtuals: true });
PaymentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Payment', PaymentSchema);
