const express = require('express');
const asyncHandler = require('express-async-handler');
const Route = require('../models/Route');

const router = express.Router();

// @desc    Get all tickets with search, filter, sort, and pagination
// @route   GET /api/tickets
// @access  Public
const getAllTickets = asyncHandler(async (req, res) => {
  try {
    const {
      search = '',
      from = '',
      to = '',
      type = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 9,
      minPrice,
      maxPrice
    } = req.query;

    // Build filter query
    let query = { 'availability.isActive': true, verificationStatus: 'approved' };

    // Text search across multiple fields
    if (search || from || to) {
      query.$or = [];
      
      if (search) {
        query.$or.push(
          { 'from.city': { $regex: search, $options: 'i' } },
          { 'to.city': { $regex: search, $options: 'i' } },
          { 'operator.name': { $regex: search, $options: 'i' } },
          { 'description': { $regex: search, $options: 'i' } }
        );
      }
      
      if (from) {
        query.$or.push({ 'from.city': { $regex: from, $options: 'i' } });
      }
      
      if (to) {
        query.$or.push({ 'to.city': { $regex: to, $options: 'i' } });
      }
    }

    // Filter by transport type
    if (type) {
      const types = type.split(',').map(t => t.trim().toLowerCase());
      query.type = { $in: types };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query['pricing.baseFare'] = {};
      if (minPrice) query['pricing.baseFare'].$gte = parseFloat(minPrice);
      if (maxPrice) query['pricing.baseFare'].$lte = parseFloat(maxPrice);
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // If sorting by price, use baseFare
    if (sortBy === 'price') {
      sortObj['pricing.baseFare'] = sortOrder === 'asc' ? 1 : -1;
      delete sortObj[sortBy];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const total = await Route.countDocuments(query);
    const tickets = await Route.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .populate('vendor', 'name email')
      .lean();

    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: tickets,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search,
        from,
        to,
        type,
        sortBy,
        sortOrder,
        minPrice,
        maxPrice
      }
    });
  } catch (error) {
    console.error('Error in getAllTickets:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get ticket search suggestions
// @route   GET /api/tickets/suggestions
// @access  Public
const getSearchSuggestions = asyncHandler(async (req, res) => {
  try {
    const { query = '', type = 'all' } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(200).json({
        success: true,
        data: { from: [], to: [], operators: [] }
      });
    }

    const searchRegex = new RegExp(query, 'i');
    
    // Get from cities
    const fromCities = await Route.distinct('from.city', {
      'from.city': searchRegex,
      'availability.isActive': true,
      verificationStatus: 'approved'
    });

    // Get to cities
    const toCities = await Route.distinct('to.city', {
      'to.city': searchRegex,
      'availability.isActive': true,
      verificationStatus: 'approved'
    });

    // Get operators
    const operators = await Route.distinct('operator.name', {
      'operator.name': searchRegex,
      'availability.isActive': true,
      verificationStatus: 'approved'
    });

    res.status(200).json({
      success: true,
      data: {
        from: fromCities.slice(0, 5),
        to: toCities.slice(0, 5),
        operators: operators.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Error in getSearchSuggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Public
const getTicket = asyncHandler(async (req, res) => {
  try {
    const ticket = await Route.findById(req.params.id)
      .populate('vendor', 'name email')
      .populate('adminReviewedBy', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Error in getTicket:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get transport types with counts
// @route   GET /api/tickets/types
// @access  Public
const getTransportTypes = asyncHandler(async (req, res) => {
  try {
    const types = await Route.aggregate([
      {
        $match: {
          'availability.isActive': true,
          verificationStatus: 'approved'
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgPrice: { $avg: '$pricing.baseFare' },
          minPrice: { $min: '$pricing.baseFare' },
          maxPrice: { $max: '$pricing.baseFare' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Transform to include readable names
    const typeNames = {
      bus: 'Bus',
      train: 'Train',
      flight: 'Flight',
      launch: 'Launch',
      ferry: 'Ferry'
    };

    const result = types.map(type => ({
      value: type._id,
      label: typeNames[type._id] || type._id,
      count: type.count,
      avgPrice: Math.round(type.avgPrice),
      minPrice: type.minPrice,
      maxPrice: type.maxPrice
    }));

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in getTransportTypes:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Legacy route for backward compatibility
const searchRoutes = asyncHandler(async (req, res) => {
  // Redirect to the new getAllTickets with search parameters
  req.query = { ...req.body, ...req.query };
  return getAllTickets(req, res);
});

// @desc    Create new ticket (Legacy - use vendor dashboard)
// @route   POST /api/tickets
// @access  Private/Vendor
const createRoute = asyncHandler(async (req, res) => {
  res.status(201).json({
    success: true,
    message: 'Use vendor dashboard to create tickets'
  });
});

// @desc    Update ticket (Legacy - use vendor dashboard)
// @route   PUT /api/tickets/:id
// @access  Private/Vendor
const updateRoute = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Use vendor dashboard to update tickets'
  });
});

// @desc    Delete ticket (Legacy - use vendor dashboard)
// @route   DELETE /api/tickets/:id
// @access  Private/Vendor
const deleteRoute = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Use vendor dashboard to delete tickets'
  });
});

// @desc    Get advertised tickets (public)
const getAdvertisedTickets = asyncHandler(async (req, res) => {
  try {
    const tickets = await Route.find({
      isAdvertised: true,
      verificationStatus: 'approved',
      'availability.isActive': true
    })
    .sort({ advertisementPriority: -1, advertisedAt: -1 })
    .limit(6)
    .populate('vendor', 'name email')
    .lean();

    res.status(200).json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('Error in getAdvertisedTickets:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Routes
router.get('/', getAllTickets);
router.get('/suggestions', getSearchSuggestions);
router.get('/types', getTransportTypes);
router.get('/advertised', getAdvertisedTickets);
router.get('/:id', getTicket);
router.post('/search', searchRoutes); // Legacy
router.post('/', createRoute); // Legacy
router.put('/:id', updateRoute); // Legacy
router.delete('/:id', deleteRoute); // Legacy

module.exports = router;