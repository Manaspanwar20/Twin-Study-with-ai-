const express = require("express");
const jsonwebtoken = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const router = express.Router();

let users = [];

router.post("/register", async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            const err = new Error("Please provide all the details");
            err.status = 400;
            return next(err);
        }

        const existingUser = users.find((u) => u.email === email);
        if (existingUser) {
            const err = new Error("User already exists");
            err.status = 400;
            return next(err);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: users.length + 1,
            username,
            email,
            password: hashedPassword
        };
        users.push(newUser);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: { id: newUser.id, username: newUser.username, email: newUser.email }
        });
    } catch (error) {
        next(error);
    }
});

router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            const err = new Error("Credentials are missing");
            err.status = 400;
            return next(err);
        }

        const user = users.find((u) => u.email === email);
        if (!user) {
            const err = new Error("User not found");
            err.status = 404;
            return next(err);
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            const err = new Error("Invalid password");
            err.status = 401;
            return next(err);
        }

        const token = jsonwebtoken.sign({ id: user.id }, "secret", { expiresIn: "1h" });
        res.status(200).json({ 
            success: true,
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
