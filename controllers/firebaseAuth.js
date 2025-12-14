const asyncHandler = require('express-async-handler');
const admin = require('../config/firebase');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Login with Firebase ID token
// @route   POST /api/auth/firebase/login
// @access  Public
const firebaseLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    res.status(400);
    throw new Error('ID token is required');
  }

  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture, email_verified } = decodedToken;

    // Check if user exists in our database
    let user = await User.findOne({ 
      $or: [
        { firebaseUid: uid },
        { email: email }
      ]
    });

    if (!user) {
      // Create new user if doesn't exist
      user = await User.create({
        name: name || email.split('@')[0],
        email: email,
        firebaseUid: uid,
        photoURL: picture,
        emailVerified: email_verified,
        role: 'user'
      });
      logger.info(`New user created via Firebase: ${email}`);
    } else {
      // User already exists, just ensure Firebase UID is set
      if (!user.firebaseUid) {
        user = await User.findByIdAndUpdate(user._id, { firebaseUid: uid }, { new: true });
      }
      logger.info(`User logged in via Firebase: ${email}`);
    }

    // Generate our own JWT token for API access
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    logger.error(`Firebase login error: ${error.message}`);
    res.status(401);
    throw new Error('Invalid Firebase ID token');
  }
});

// @desc    Register new user with Firebase
// @route   POST /api/auth/firebase/register
// @access  Public
const firebaseRegister = asyncHandler(async (req, res) => {
  const { idToken, role = 'user' } = req.body;

  if (!idToken) {
    res.status(400);
    throw new Error('ID token is required');
  }

  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture, email_verified } = decodedToken;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { firebaseUid: uid },
        { email: email }
      ]
    });

    if (existingUser) {
      res.status(400);
      throw new Error('User already exists');
    }

    // Create new user
    const user = await User.create({
      name: name || email.split('@')[0],
      email: email,
      firebaseUid: uid,
      photoURL: picture,
      emailVerified: email_verified,
      role: role
    });

    // Generate our own JWT token
    const token = user.getSignedJwtToken();

    logger.info(`New user registered via Firebase: ${email} with role: ${role}`);

    res.status(201).json({
      success: true,
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    logger.error(`Firebase registration error: ${error.message}`);
    res.status(401);
    throw new Error('Invalid Firebase ID token');
  }
});

// @desc    Get current user info
// @route   GET /api/auth/firebase/me
// @access  Private
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      role: user.role,
      emailVerified: user.emailVerified,
      phone: user.phone,
      addresses: user.addresses,
      preferences: user.preferences
    }
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/firebase/update-profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, addresses, preferences } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(addresses && { addresses }),
      ...(preferences && { preferences })
    },
    { new: true, runValidators: true }
  );

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      role: user.role,
      emailVerified: user.emailVerified,
      phone: user.phone,
      addresses: user.addresses,
      preferences: user.preferences
    }
  });
});

module.exports = {
  firebaseLogin,
  firebaseRegister,
  getCurrentUser,
  updateProfile
};