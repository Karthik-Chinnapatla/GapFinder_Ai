const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured in backend/.env');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: 'gapfinder_db',
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`[MongoDB] Connected to database: ${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = { connectDB };
