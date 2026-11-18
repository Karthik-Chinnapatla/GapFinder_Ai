const mongoose = require('mongoose');

let cachedPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured in environment variables.');
  }

  if (!cachedPromise) {
    mongoose.set('strictQuery', true);
    cachedPromise = mongoose
      .connect(uri, {
        dbName: 'gapfinder_db',
        serverSelectionTimeoutMS: 10000,
      })
      .then((conn) => {
        console.log(`[MongoDB] Connected to database: ${conn.connection.name}`);
        return conn.connection;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }

  return cachedPromise;
}

module.exports = { connectDB };
