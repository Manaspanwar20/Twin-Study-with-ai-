const errorhandler = (err, req, res, next) => {
    res.status(500 || err.status).json({
        success: false,
        message: err.message || "Internal server error",
    })
}

module.exports = errorhandler;
