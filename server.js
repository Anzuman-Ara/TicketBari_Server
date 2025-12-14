const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Load environment variables BEFORE importing any routes
console.log('=== Loading environment variables ===');
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

dotenv.config();
console.log('After dotenv.config():', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Not loaded');

// Ensure environment variables are loaded from server directory
const envPath = path.join(__dirname, '.env');
console.log('Loading from explicit path:', envPath);
const result = dotenv.config({ path: envPath });
console.log('Explicit config result:', result.parsed ? 'Success' : 'Failed');
console.log('After explicit config:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Not loaded');

// Load production environment variables if in production mode
if (process.env.NODE_ENV === 'production') {
  const prodEnvPath = path.join(__dirname, '.env.production');
  console.log('Loading production config from:', prodEnvPath);
  dotenv.config({ path: prodEnvPath });
  console.log('After production config:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Not loaded');
}

// Debug: Log if environment variables are loaded
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is not loaded from environment variables');
  console.error(`Attempted to load from: ${envPath}`);
  if (process.env.NODE_ENV === 'production') {
    console.error(`Also attempted to load from: ${path.join(__dirname, '.env.production')}`);
  }
  console.error('Available STRIPE environment variables:', Object.keys(process.env).filter(k => k.includes('STRIPE')));
  console.error('All environment variables:', Object.keys(process.env).slice(0, 20));
  process.exit(1); // Exit if Stripe key is not loaded
}

console.log('Stripe API Key loaded successfully:', process.env.STRIPE_SECRET_KEY.substring(0, 20) + '...');

// Import routes
const authRoutes = require('./routes/auth');
const firebaseAuthRoutes = require('./routes/firebaseAuth');
const userRoutes = require('./routes/users');
const bookingRoutes = require('./routes/bookings');
const routeRoutes = require('./routes/routes');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const vendorRoutes = require('./routes/vendor');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { auth: authMiddleware } = require('./middleware/auth');
const { corsErrorHandler, corsLoggingMiddleware } = require('./middleware/corsErrorHandler');

// Import utils
const logger = require('./utils/logger');
const connectDB = require('./config/database');

// Clear Firebase module cache to ensure fresh load with current env vars
delete require.cache[require.resolve('./config/firebase')];

// Import Firebase configuration to ensure it's initialized
require('./config/firebase');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB
connectDB();

// Trust proxy for rate limiting and secure headers
app.set('trust proxy', 1);


// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://www.googleapis.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
    },
  },
}));

// Rate limiting - only apply in production
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Ensure CORS headers are included in rate limit responses
    headers: true,
  });

  app.use(limiter);
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Environment-specific allowed origins
    let allowedOrigins = [];

    if (process.env.NODE_ENV === 'production') {
      // Production: Strict origin validation
      allowedOrigins = [
        process.env.CLIENT_URL || 'https://ticketbari-client.vercel.app',
        'https://ticketbari-client.vercel.app',
        'https://ticketbari.netlify.app',
        'https://www.ticketbari.com',
        'https://ticketbari.com'
      ];
    } else {
      // Development: More permissive for local development
      allowedOrigins = [
        process.env.CLIENT_URL || 'http://localhost:3000',
        'http://localhost:3000',
        'http://localhost:5173',
        'https://localhost:3000',
        'https://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        // Add localhost variations
        'http://localhost',
        'https://localhost',
        'http://127.0.0.1',
        'https://127.0.0.1'
      ];
    }

    // Only log CORS checks in production environment to reduce noise
    if (process.env.NODE_ENV === 'production') {
      logger.info(`CORS check - Origin: ${origin}`);
    }

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if the origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      // Only log allowed origins in production environment
      if (process.env.NODE_ENV === 'production') {
        logger.info(`CORS: Allowing origin ${origin}`);
      }
      callback(null, true);
    } else {
      // For development, be more permissive - check if it looks like a local development URL
      if (process.env.NODE_ENV === 'development') {
        if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]')) {
          return callback(null, true);
        }
      }

      // Log blocked origins only in production
      if (process.env.NODE_ENV === 'production') {
        logger.error(`CORS: Blocking origin ${origin}`);
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept', 'X-CSRF-Token'],
  exposedHeaders: ['Set-Cookie', 'Authorization']
};

// Add CORS logging middleware
app.use(corsLoggingMiddleware);

// Reduce request logging to only critical paths in production
app.use((req, res, next) => {
  // Only log in production environment for vendor/admin routes
  if (process.env.NODE_ENV === 'production' && (req.path.startsWith('/api/vendor') || req.path.startsWith('/api/admin'))) {
    logger.info(`Incoming ${req.method} request to ${req.path}`);
  }
  next();
});

// Apply CORS middleware with more permissive settings for Firebase auth routes in development
if (process.env.NODE_ENV === 'development') {
  const firebaseCorsOptions = {
    origin: true, // Reflect the request origin
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept', 'X-CSRF-Token'],
    exposedHeaders: ['Set-Cookie', 'Authorization']
  };
  
  app.use('/api/auth/firebase', cors(firebaseCorsOptions));
}

app.use(cors(corsOptions));

// Add middleware to handle OPTIONS requests explicitly
app.options('*', cors(corsOptions));


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Reduce Morgan logging - only use in production and only for critical routes
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    skip: (req, res) => {
      // Skip logging for health checks and non-critical routes
      return req.path === '/health' || !req.path.startsWith('/api/vendor') && !req.path.startsWith('/api/admin');
    },
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);

  socket.on('join-booking', (bookingId) => {
    socket.join(`booking-${bookingId}`);
    logger.info(`User ${socket.id} joined booking ${bookingId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Make io accessible to routes
app.set('io', io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/firebase', firebaseAuthRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/bookings', authMiddleware, bookingRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/payments', authMiddleware, paymentRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/vendor', authMiddleware, vendorRoutes);

// Alias /api/tickets to /api/routes for backward compatibility
app.use('/api/tickets', routeRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// CORS error handling middleware (before general error handler)
app.use(corsErrorHandler);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(`Stack trace: ${err.stack}`);

  // Enhanced error handling for port conflicts
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Another instance might be running.`);
    logger.error(`Try killing the existing process or use a different port.`);
  }

  process.exit(1);
});

module.exports = app;