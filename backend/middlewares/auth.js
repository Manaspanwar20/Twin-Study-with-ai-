const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
    const autheader = req.headers.authorization;
    if (!autheader || !autheader.startsWith('Bearer')) {
        return res.status(401).json({ message: "Unauthorized" })
    }
    const token = autheader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, "secret");
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: "Unauthorized" })
    }
}

module.exports = auth;