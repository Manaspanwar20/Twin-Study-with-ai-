const express = require("express");
const app = express();
const cors = require("cors");
const errorhandler = require("./middlewares/error");
const router = require("./authentication/authenticate");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(errorhandler);

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});