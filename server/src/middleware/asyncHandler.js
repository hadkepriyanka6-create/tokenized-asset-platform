// Wraps an async route so a rejected promise reaches the error handler
// instead of hanging the request. Saves a try/catch in every controller.

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
