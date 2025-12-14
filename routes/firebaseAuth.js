const express = require('express');
const { body } = require('express-validator');
const {
  firebaseLogin,
  firebaseRegister,
  getCurrentUser,
  updateProfile
} = require('../controllers/firebaseAuth');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const firebaseLoginValidation = [
  body('idToken').notEmpty().withMessage('Firebase ID token is required')
];

const firebaseRegisterValidation = [
  body('idToken').notEmpty().withMessage('Firebase ID token is required'),
  body('role').optional().isIn(['user', 'vendor', 'admin']).withMessage('Invalid role')
];

const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').optional().isMobilePhone('any').withMessage('Please provide a valid phone number')
];

// Firebase auth routes
router.post('/login', firebaseLoginValidation, firebaseLogin);
router.post('/register', firebaseRegisterValidation, firebaseRegister);
router.get('/me', auth, getCurrentUser);
router.put('/update-profile', auth, updateProfileValidation, updateProfile);

// Handle OPTIONS requests for all routes
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

module.exports = router;