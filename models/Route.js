const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
  operator: {
    name: {
      type: String,
      required: [true, 'Operator name is required'],
      trim: true
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    logo: {
      type: String
    },
    contact: {
      phone: String,
      email: String,
      website: String
    }
  },
  from: {
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      default: 'Bangladesh',
      trim: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    },
    terminal: {
      name: String,
      address: String,
      code: String
    }
  },
  to: {
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      default: 'Bangladesh',
      trim: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    },
    terminal: {
      name: String,
      address: String,
      code: String
    }
  },
  type: {
    type: String,
    enum: ['bus', 'train', 'flight', 'launch', 'ferry'],
    required: true
  },
  class: {
    type: String,
    enum: ['economy', 'business', 'first', 'ac', 'non-ac', 'sleeper', 'semi-sleeper'],
    required: true
  },
  schedule: [{
    departureTime: {
      type: String,
      required: true
    },
    arrivalTime: {
      type: String,
      required: true
    },
    duration: {
      type: String,
      required: true
    },
    days: [{
      type: String,
      enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    }],
    frequency: {
      type: String,
      enum: ['daily', 'weekdays', 'weekends', 'specific']
    }
  }],
  pricing: {
    baseFare: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'BDT'
    },
    dynamicPricing: {
      enabled: {
        type: Boolean,
        default: false
      },
      surgeMultiplier: {
        type: Number,
        default: 1.0,
        min: 1.0,
        max: 3.0
      },
      peakDays: [{
        day: {
          type: String,
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        },
        multiplier: {
          type: Number,
          default: 1.0
        }
      }]
    }
  },
  capacity: {
    totalSeats: {
      type: Number,
      required: true
    },
    seatConfiguration: {
      rows: Number,
      seatsPerRow: Number
    },
    amenities: [{
      type: String,
      enum: ['ac', 'wifi', 'charging_point', 'entertainment', 'meals', 'blanket', 'water_bottle']
    }]
  },
  availability: {
    isActive: {
      type: Boolean,
      default: true
    },
    blackoutDates: [{
      startDate: Date,
      endDate: Date,
      reason: String
    }],
    advanceBooking: {
      minimumDays: {
        type: Number,
        default: 1
      },
      maximumDays: {
        type: Number,
        default: 30
      }
    }
  },
  cancellation: {
    allowed: {
      type: Boolean,
      default: true
    },
    refundPolicy: {
      freeCancellationUntil: {
        type: Number,
        default: 24 // hours before departure
      },
      partialRefundUntil: {
        type: Number,
        default: 12 // hours before departure
      },
      cancellationFee: {
        type: Number,
        default: 0
      }
    }
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  // Vendor-specific fields
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    maxlength: 500
  },
  adminReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminReviewedAt: {
    type: Date
  },
  // Advertisement fields
  isAdvertised: {
    type: Boolean,
    default: false
  },
  advertisedAt: {
    type: Date
  },
  advertisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  advertisementPriority: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  advertisementMetrics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    bookings: {
      type: Number,
      default: 0
    },
    revenue: {
      type: Number,
      default: 0
    }
  },
  perks: [{
    type: String,
    enum: ['AC', 'Breakfast', 'WiFi', 'USB Charging', 'Entertainment', 'Blanket', 'Water Bottle', 'Snacks', 'Meal', 'Charging Point']
  }],
  availableQuantity: {
    type: Number,
    required: true,
    min: 1
  },
  imageUrl: {
    type: String
  },
  description: {
    type: String,
    maxlength: 1000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Update the updatedAt field before saving
RouteSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for better query performance
RouteSchema.index({ 'from.city': 1, 'to.city': 1, type: 1 });
RouteSchema.index({ 'operator.code': 1 });
RouteSchema.index({ isActive: 1 });
RouteSchema.index({ 'schedule.departureTime': 1 });

module.exports = mongoose.model('Route', RouteSchema);