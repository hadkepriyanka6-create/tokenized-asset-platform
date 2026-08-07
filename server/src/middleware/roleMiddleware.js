// roleMiddleware — must always be used AFTER authMiddleware.
// Usage: router.get("/route", authMiddleware, roleMiddleware("Admin", "Issuer"), handler)

const roleMiddleware = (...roles) => {
    return (req, res, next) => {

        // Guard: authMiddleware must have run first and set req.user
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please log in.",
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role(s): ${roles.join(", ")}. Your role: ${req.user.role}`,
            });
        }

        next();
    };
};

module.exports = roleMiddleware;