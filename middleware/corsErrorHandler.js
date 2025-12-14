const logger = require('../utils/logger');

/**
 * CORS-specific error handling middleware
 * Handles CORS-related errors and provides appropriate responses
 */
const corsErrorHandler = (err, req, res, next) => {
  // Check if this is a CORS-related error
  if (err && err.message && err.message.includes('Not allowed by CORS')) {
    // Only log CORS errors in production environment to reduce noise
    if (process.env.NODE_ENV === 'production') {
      logger.error(`CORS Error: ${err.message} - Origin: ${req.headers.origin || 'unknown'} - Path: ${req.path}`);
    }

    // Return a more user-friendly error response for CORS issues
    return res.status(403).json({
      success: false,
      error: 'Cross-Origin Request Blocked',
      message: 'The request was blocked due to CORS policy',
      details: {
        allowedOrigins: process.env.NODE_ENV === 'production'
          ? ['https://ticketbari-client.vercel.app', 'https://ticketbari.com']
          : ['http://localhost:3000', 'http://localhost:5173'],
        currentOrigin: req.headers.origin || 'unknown'
      }
    });
  }

  // Check for preflight (OPTIONS) request errors
  if (req.method === 'OPTIONS' && err) {
    // Only log preflight errors in production environment
    if (process.env.NODE_ENV === 'production') {
      logger.error(`Preflight request error: ${err.message}`);
    }
    return res.status(403).json({
      success: false,
      error: 'Preflight Request Failed',
      message: 'CORS preflight request failed'
    });
  }

  // Pass to next error handler if not a CORS error
  next(err);
};

/**
 * CORS logging middleware
 * Logs CORS-related information for debugging only in production for critical routes
 */
const corsLoggingMiddleware = (req, res, next) => {
  // Remove excessive CORS header logging to reduce noise
  // Only log in production for vendor/admin routes at debug level
  if (process.env.NODE_ENV === 'production' && (req.path.startsWith('/api/vendor') || req.path.startsWith('/api/admin'))) {
    logger.debug(`CORS Headers - Origin: ${req.headers.origin || 'none'}`);
  }

  // Add CORS-specific headers for better debugging
  res.setHeader('X-CORS-Status', 'processed');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  next();
};

module.exports = {
  corsErrorHandler,
  corsLoggingMiddleware
};