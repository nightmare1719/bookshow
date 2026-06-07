const crypto = require('crypto');

/**
 * Generate a beautiful billing invoice for a completed booking
 * @param {Object} booking - Mongoose Booking document
 * @param {Object} user - User document
 * @param {Object} event - Event document
 * @returns {Object} Structured invoice breakdown
 */
const generateInvoice = (booking, user, event) => {
  const invoiceId = `INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const subtotal = booking.totalAmount;
  const taxRate = 0.08; // 8% service tax
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalPaid = Math.round((subtotal + taxAmount) * 100) / 100;

  const invoice = {
    invoiceNumber: invoiceId,
    bookingId: booking._id,
    dateOfIssue: new Date().toISOString(),
    billingTo: {
      email: user.email,
      name: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || 'Valued Attendee',
      phone: user.profile?.phone || 'N/A'
    },
    eventDetails: {
      title: event.title,
      venue: event.venue,
      date: event.date
    },
    pricingBreakdown: {
      seatsCount: booking.seatIds.length,
      subtotal,
      taxAmount,
      totalPaid,
      currency: 'INR'
    },
    paymentDetails: {
      method: booking.paymentMethod,
      transactionId: booking.transactionId
    },
    verificationStamp: crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
      .update(booking._id.toString())
      .digest('hex')
  };

  return invoice;
};

module.exports = {
  generateInvoice
};
