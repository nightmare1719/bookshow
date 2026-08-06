const mongoose = require('mongoose');

const enableInMemoryFallback = () => {
  global.USE_IN_MEMORY_FALLBACK = true;
  global.USE_TRANSACTIONS = false;
  console.warn('⚠️ Running with IN-MEMORY database (seeded mock data, no persistence). MongoDB is not required.');
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    enableInMemoryFallback();
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    global.USE_IN_MEMORY_FALLBACK = false;

    // Check if transactions are supported (e.g. replica sets)
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      await session.abortTransaction();
      session.endSession();
      global.USE_TRANSACTIONS = true;
      console.log('✅ Transactions supported and enabled');
    } catch (txErr) {
      global.USE_TRANSACTIONS = false;
      console.warn('⚠️ Transactions NOT supported (standalone MongoDB). Falling back to non-transactional operations.');
    }
  } catch (err) {
    console.error('MongoDB remote connection error:', err.message);
    
    // Try local database fallback
    try {
      console.log('Trying local MongoDB fallback (mongodb://127.0.0.1:27017/bookshow)...');
      const conn = await mongoose.connect('mongodb://127.0.0.1:27017/bookshow', {
        serverSelectionTimeoutMS: 3000
      });
      console.log(`Connected to local MongoDB: ${conn.connection.host}`);
      global.USE_IN_MEMORY_FALLBACK = false;
      global.USE_TRANSACTIONS = false; // standard local standalone installations typically do not use transactions
    } catch (localErr) {
      console.error('Local MongoDB connection failed:', localErr.message);
      enableInMemoryFallback();
    }
  }
};

module.exports = connectDB;

