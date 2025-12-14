const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  bookingReference: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  vendorResponseAt: {
    type: Date
  },
  vendorResponseNotes: {
    type: String,
    maxlength: 500
  },
  bookingQuantity: {
    type: Number,
    required: true,
    min: 1
  },
  passengers: [{
    name: {
      type: String,
      required: true
    },
    age: {
      type: Number,
      required: true
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true
    },
    seatNumber: {
      type: String,
      required: true
    },
    ticketNumber: {
      type: String,
      unique: true
    }
  }],
  departureDate: {
    type: Date,
    required: true
  },
  returnDate: {
    type: Date
  },
  totalAmount: {
    type: Number,
    required: true
  },
  baseFare: {
    type: Number,
    required: true
  },
  taxes: {
    type: Number,
    default: 0
  },
  fees: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'mobile_banking', 'cash']
  },
  paymentDetails: {
    transactionId: String,
    gatewayResponse: mongoose.Schema.Types.Mixed,
    paidAt: Date
  },
  contactInfo: {
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    }
  },
  specialRequests: {
    type: String,
    maxlength: 500
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundReason: {
    type: String
  },
  notifications: {
    bookingConfirmed: { type: Boolean, default: false },
    paymentReceived: { type: Boolean, default: false },
    departureReminder: { type: Boolean, default: false },
    cancellationNotice: { type: Boolean, default: false }
  },
  paymentLock: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate unique booking reference
BookingSchema.pre('save', async function(next) {
  if (this.isNew && !this.bookingReference) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.bookingReference = `TB${year}${month}${random}`;
  }
  this.updatedAt = Date.now();
  next();
});

// Generate unique ticket numbers for each passenger
BookingSchema.pre('save', async function(next) {
  if (this.isNew) {
    for (let i = 0; i < this.passengers.length; i++) {
      if (!this.passengers[i].ticketNumber) {
        const routeCode = this.route.toString().substr(-6).toUpperCase();
        const passengerNum = (i + 1).toString().padStart(2, '0');
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        this.passengers[i].ticketNumber = `TKT${routeCode}${passengerNum}${randomNum}`;
      }
    }
  }
  next();
});

// Index for better query performance
BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ route: 1, departureDate: 1 });
BookingSchema.index({ bookingReference: 1 });

module.exports = mongoose.model('Booking', BookingSchema);