function errorHandler(err, _req, res, _next) {
  console.error('[API Error]', err.message);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid resource identifier format.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File exceeds the 20 MB maximum upload limit.' });
  }
  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'An unexpected server error occurred.',
  });
}

module.exports = { errorHandler };
