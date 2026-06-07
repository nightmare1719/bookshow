const { z } = require('zod');

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['attendee', 'organizer']).optional(),
    profile: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().optional()
    }).optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required')
  })
});

const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    venue: z.string().min(1, 'Venue is required'),
    date: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date'),
    category: z.string().optional(),
    basePrice: z.number().min(0, 'Price cannot be negative'),
    totalSeats: z.number().int().positive('Total seats must be positive'),
    bookingType: z.enum(['seated', 'zone']).optional(),
    seatCategories: z.array(z.object({
      name: z.string(),
      price: z.number().min(0),
      count: z.number().int().positive()
    })).optional()
  })
});

const lockSeatSchema = z.object({
  body: z.object({
    seatId: objectIdSchema
  })
});

const completeBookingSchema = z.object({
  body: z.object({
    eventId: objectIdSchema,
    seatIds: z.array(objectIdSchema).min(1, 'Select at least one seat'),
    paymentMethod: z.enum(['mock', 'wallet', 'razorpay']).default('mock'),
    couponCode: z.string().optional()
  })
});

module.exports = {
  registerSchema,
  loginSchema,
  createEventSchema,
  lockSeatSchema,
  completeBookingSchema
};
