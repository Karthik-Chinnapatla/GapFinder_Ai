require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { ensureDemoAccountSeeded } = require('./seedDemo');

(async () => {
  try {
    await connectDB();
    const demoUser = await ensureDemoAccountSeeded();
    console.log(`[Seed] Demo student ready in gapfinder_db.users -> ${demoUser.email} (${demoUser._id})`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error:', err);
    process.exit(1);
  }
})();
