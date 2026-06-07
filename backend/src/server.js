const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { typeDefs, resolvers } = require('./graphql/graphqlSchema');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1);
});

const startServer = async () => {
  await connectDB();

  // Initialize and start Apollo Server
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  });
  await apolloServer.start();

  // Mount GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        let currentUser = null;
        if (
          req.headers.authorization &&
          req.headers.authorization.startsWith('Bearer')
        ) {
          try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            currentUser = await User.findById(decoded.id).lean();
          } catch (_) {}
        }
        return { req: { ...req, user: currentUser } };
      },
    })
  );

  const server = http.createServer(app);

  // Initialize Socket.io
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    socket.on('stream-chat-send', (data) => {
      io.emit('stream-chat-receive', data);
    });
    socket.on('disconnect', () => {});
  });

  // Make io globally accessible for controllers to emit messages
  global.io = io;

  server.listen(PORT, () => {
    console.log(
      `Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
    );
  });

  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err.message);
    server.close(() => process.exit(1));
  });
};

startServer();
