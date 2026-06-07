const { gql } = require('graphql-tag');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');

const typeDefs = gql`
  type Event {
    id: ID!
    title: String!
    description: String
    venue: String!
    date: String!
    category: String!
    basePrice: Float!
    totalSeats: Int!
    seatsSold: Int!
    dynamicPrice: Float!
    isActive: Boolean!
    bookingType: String!
  }

  type Booking {
    id: ID!
    eventId: Event
    seatNumbers: [String]!
    totalAmount: Float!
    transactionId: String
    status: String!
    paymentMethod: String!
    qrCode: String
    createdAt: String!
  }

  type Query {
    events(category: String): [Event]!
    event(id: ID!): Event
    myBookings: [Booking]!
  }
`;

const resolvers = {
  Query: {
    events: async (_, { category }) => {
      const filter = { isActive: true, date: { $gte: new Date() } };
      if (category) filter.category = category;
      return await Event.find(filter).sort({ date: 1 }).lean();
    },
    event: async (_, { id }) => {
      return await Event.findById(id).lean();
    },
    myBookings: async (_, __, { req }) => {
      // Manual Auth Check inside resolver context
      // Assumes Apollo context is populated with req which contains req.user from auth middleware
      if (!req.user) {
        throw new Error('Unauthorized. JWT required.');
      }
      return await Booking.find({ userId: req.user._id, status: 'confirmed' })
        .populate('eventId')
        .sort({ createdAt: -1 })
        .lean();
    }
  },
  Event: {
    id: (parent) => parent._id.toString(),
  },
  Booking: {
    id: (parent) => parent._id.toString(),
  }
};

module.exports = { typeDefs, resolvers };
