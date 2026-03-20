const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const errorhandler = require("./middlewares/error");
const router = require("./authentication/authenticate");
const auth = require("./middlewares/auth");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(errorhandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow frontend access
    methods: ["GET", "POST"]
  }
});

// A simple in-memory store for chats
const chats = {};

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post("/api/upload", auth, upload.array("files"), (req, res) => {
    try {
        const files = req.files.map(f => ({
            url: `http://localhost:3000/uploads/${f.filename}`,
            name: f.originalname,
            mimetype: f.mimetype,
            size: f.size
        }));
        
        // Let's emit a socket message to a chat if chatId is provided
        const { chatId } = req.body;
        if (chatId && chats[chatId]) {
            const msg = {
                id: Date.now().toString() + "_file",
                sender: "user",
                text: "Uploaded file: " + files.map(f => f.name).join(", "),
                files: files,
                timestamp: new Date()
            };
            chats[chatId].messages.push(msg);
            io.to(chatId).emit("receive_message", msg);

            // Simulating AI response to file
            setTimeout(() => {
              if (chats[chatId]) {
                  const aiMsg = {
                      id: Date.now().toString() + "_ai",
                      sender: "ai",
                      text: "I received your file(s)",
                      timestamp: new Date()
                  };
                  chats[chatId].messages.push(aiMsg);
                  io.to(chatId).emit("receive_message", aiMsg);
              }
          }, 1000);
        }
        res.json({ success: true, files });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ success: false, error: "Upload failed" });
    }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }
  try {
    const decoded = jwt.verify(token, "secret");
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_chat", (data, callback) => {
    const chatId = Date.now().toString();
    chats[chatId] = {
      id: chatId,
      messages: [],
      createdAt: new Date(),
    };
    
    // Auto-join the newly created chat room
    socket.join(chatId);

    if (data && data.initialMessage) {
        const msg = {
            id: Date.now().toString() + "_msg",
            sender: "user",
            text: data.initialMessage,
            timestamp: new Date()
        };
        chats[chatId].messages.push(msg);
        
        // Simulating an AI response
        setTimeout(() => {
            if (chats[chatId]) {
                const aiMsg = {
                    id: Date.now().toString() + "_ai",
                    sender: "ai",
                    text: "I received your message: " + data.initialMessage,
                    timestamp: new Date()
                };
                chats[chatId].messages.push(aiMsg);
                io.to(chatId).emit("receive_message", aiMsg);
            }
        }, 1000);
    }
    
    if (typeof callback === "function") {
      callback({ success: true, chatId, chat: chats[chatId] });
    }
  });

  socket.on("join_chat", (chatId) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat ${chatId}`);
  });

  socket.on("send_message", (data) => {
    const { chatId, message } = data;
    if (chats[chatId]) {
      const msg = {
        id: Date.now().toString() + "_msg",
        sender: "user",
        text: message,
        timestamp: new Date()
      };
      chats[chatId].messages.push(msg);
      io.to(chatId).emit("receive_message", msg);

      // Simulating AI response
      setTimeout(() => {
          if (chats[chatId]) {
              const aiMsg = {
                  id: Date.now().toString() + "_ai",
                  sender: "ai",
                  text: "Echo: " + message,
                  timestamp: new Date()
              };
              chats[chatId].messages.push(aiMsg);
              io.to(chatId).emit("receive_message", aiMsg);
          }
      }, 1000);
    }
  });
  
  socket.on("get_chats", (data, callback) => {
      // Return all chats. In a real app, you would filter by userId.
      if (typeof callback === "function") {
          callback(Object.values(chats).sort((a,b) => b.createdAt - a.createdAt));
      }
  });
  
  socket.on("get_chat", (chatId, callback) => {
      if (typeof callback === "function") {
          callback(chats[chatId] || null);
      }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});