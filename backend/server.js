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
const { generateAIResponse, generateChatTitle, parseSyllabus, generateQuiz } = require("./aiService");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use(errorhandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"], // Allow local frontend origins
    methods: ["GET", "POST"]
  }
});

// A simple in-memory store for chats
let chats = {};
try {
  if (fs.existsSync(path.join(__dirname, 'chats.json'))) {
    const data = fs.readFileSync(path.join(__dirname, 'chats.json'), 'utf8');
    chats = JSON.parse(data);
    console.log("Loaded existing chats from disk.");
  }
} catch (err) {
  console.error("Error loading chats from disk:", err);
}

function saveToDisk() {
  try {
    fs.writeFileSync(path.join(__dirname, 'chats.json'), JSON.stringify(chats, null, 2));
  } catch (err) {
    console.error("Error saving chats to disk:", err);
  }
}

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

app.post("/api/upload", auth, upload.array("files"), (req, res) => {
  try {
    const files = req.files.map(f => ({
      url: `http://localhost:3000/uploads/${f.filename}`,
      name: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      filename: f.filename
    }));

    // Simply return the uploaded files metadata
    res.json({ success: true, files });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
});

// --- Syllabus upload & AI parsing endpoint ---
const syllabusUpload = multer({ storage: storage });

app.post("/api/upload-syllabus", auth, syllabusUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });

    // Build a file descriptor that matches what parseSyllabus expects
    const fileObj = {
      filename: req.file.filename,       // saved name on disk
      mimetype: req.file.mimetype,
      name: req.file.originalname
    };

    // parseSyllabus reads the file directly from disk and sends it to Gemini
    const syllabus = await parseSyllabus(fileObj);
    if (!syllabus) {
      return res.status(500).json({ success: false, error: "Failed to parse syllabus — make sure the file contains readable syllabus content." });
    }

    // Persist syllabus on the in-memory chat so it survives socket reconnects
    const chatId = req.body && req.body.chatId;
    if (chatId && chats[chatId]) {
      chats[chatId].syllabus = syllabus;
      saveToDisk(); // Update file
    }

    res.json({ success: true, syllabus });
  } catch (error) {
    console.error("Syllabus upload error:", error);
    res.status(500).json({ success: false, error: "Syllabus processing failed" });
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  console.log("Handshake token received:", token);
  if (!token) {
    console.log("No token provided in handshake");
    return next(new Error("Authentication error: No token provided"));
  }
  try {
    const decoded = jwt.verify(token, "secret");
    console.log("Token verified for user ID:", decoded.id);
    socket.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id, "User ID:", socket.user?.id);

  socket.on("create_chat", (data, callback) => {
    const chatId = Date.now().toString();
    console.log(`Creating chat ${chatId} for user ${socket.user?.id}`);
    chats[chatId] = {
      id: chatId,
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
    };

    socket.join(chatId);

    if (data && (data.initialMessage || (data.files && data.files.length > 0))) {
      const msg = {
        id: Date.now().toString() + "_msg",
        sender: "user",
        text: data.initialMessage,
        files: data.files || [],
        timestamp: new Date()
      };
      chats[chatId].messages.push(msg);
      saveToDisk();

      if (data.files && data.files.length > 0) {
        chats[chatId].files = [...(chats[chatId].files || []), ...data.files];
      }

      generateChatTitle(data.initialMessage || (data.files && data.files[0].name) || "New Chat").then(title => {
        if (chats[chatId]) {
          chats[chatId].title = title;
          io.to(chatId).emit("chat_updated", chats[chatId]);
        }
      });

      (async () => {
        if (chats[chatId]) {
          const aiMsg = {
            id: Date.now().toString() + "_ai",
            sender: "ai",
            text: "",
            isTyping: true,
            timestamp: new Date()
          };
          chats[chatId].messages.push(aiMsg);
          io.to(chatId).emit("receive_message", aiMsg);

          const history = chats[chatId].messages.slice(0, -2).slice(-10);
          const result = await generateAIResponse(data.initialMessage, data.files || [], history, null, (chunk) => {
            aiMsg.text += chunk;
            aiMsg.isTyping = false;
            io.to(chatId).emit("receive_message_update", { id: aiMsg.id, text: aiMsg.text, isTyping: aiMsg.isTyping });
          });

          if (aiMsg.text === "" && typeof result === "string") {
            aiMsg.text = result;
            aiMsg.isTyping = false;
            io.to(chatId).emit("receive_message_update", { id: aiMsg.id, text: aiMsg.text, isTyping: aiMsg.isTyping });
          }
        }
      })();
    }

    if (typeof callback === "function") {
      callback({ success: true, chatId, chat: chats[chatId] });
    }
  });

  socket.on("join_chat", (chatId) => {
    console.log(`Socket ${socket.id} (User: ${socket.user?.id}) joining chat ${chatId}`);
    socket.join(chatId);
  });

  socket.on("send_message", (data) => {
    const { chatId, message, files } = data;
    console.log(`Message from socket ${socket.id} to chat ${chatId}: ${message} (Files: ${files?.length || 0})`);

    if (chats[chatId]) {
      const msg = {
        id: Date.now().toString() + "_msg",
        sender: "user",
        text: message,
        files: files || [],
        timestamp: new Date()
      };

      if (files && files.length > 0) {
        if (!chats[chatId].files) chats[chatId].files = [];
        chats[chatId].files.push(...files);
      }

      if (chats[chatId].messages.length === 0 || (chats[chatId].messages.length === 1 && chats[chatId].title === "New Chat")) {
        generateChatTitle(message || (files && files[0].name) || "New Chat").then(title => {
          if (chats[chatId]) {
            chats[chatId].title = title;
            io.to(chatId).emit("chat_updated", chats[chatId]);
          }
        });
      }

      chats[chatId].messages.push(msg);
      io.to(chatId).emit("receive_message", msg);

      (async () => {
        if (chats[chatId]) {
          const aiMsg = {
            id: Date.now().toString() + "_ai",
            sender: "ai",
            text: "",
            isTyping: true,
            timestamp: new Date()
          };
          chats[chatId].messages.push(aiMsg);
          io.to(chatId).emit("receive_message", aiMsg);

          const history = chats[chatId].messages.slice(0, -2).slice(-10);
          const syllabus = chats[chatId].syllabus || null;
          const result = await generateAIResponse(message, files || [], history, syllabus, (chunk) => {
            aiMsg.text += chunk;
            aiMsg.isTyping = false;
            io.to(chatId).emit("receive_message_update", { id: aiMsg.id, text: aiMsg.text, isTyping: aiMsg.isTyping });
          });

          if (aiMsg.text === "" && typeof result === "string") {
            aiMsg.text = result;
            aiMsg.isTyping = false;
            io.to(chatId).emit("receive_message_update", { id: aiMsg.id, text: aiMsg.text, isTyping: aiMsg.isTyping });
          }
        }
      })();
    } else {
      console.warn(`Chat ${chatId} not found for message emission!`);
    }
  });

  socket.on("update_syllabus", (data) => {
      const { chatId, syllabus } = data;
      if (chats[chatId]) {
          chats[chatId].syllabus = syllabus;
          saveToDisk();
      }
  });

  socket.on("generate_quiz", async ({ chatId, subject, topic }) => {
      if (!chats[chatId]) return;

      const aiMsg = {
          id: Date.now().toString() + "_quiz",
          sender: "ai",
          type: "quiz",
          text: `Generating a quiz for topic: ${topic}...`,
          isTyping: true,
          timestamp: new Date()
      };
      chats[chatId].messages.push(aiMsg);
      io.to(chatId).emit("receive_message", aiMsg);

      try {
          const quiz = await generateQuiz(subject, topic);
          if (quiz) {
              aiMsg.quiz = quiz;
              aiMsg.text = `Here's a 3-question quiz on **${topic}**. Good luck!`;
          } else {
              aiMsg.text = "I failed to generate a quiz for this topic. Please try again later.";
          }
          aiMsg.isTyping = false;
          io.to(chatId).emit("receive_message_update", aiMsg);
          saveToDisk();
      } catch (err) {
          console.error("Quiz gen error:", err);
          aiMsg.text = "Error generating quiz. Please try again.";
          aiMsg.isTyping = false;
          io.to(chatId).emit("receive_message_update", aiMsg);
      }
  });

  socket.on("update_message", ({ chatId, messageId, updates }) => {
      if (!chats[chatId]) return;
      const msgIndex = chats[chatId].messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
          chats[chatId].messages[msgIndex] = { ...chats[chatId].messages[msgIndex], ...updates };
          saveToDisk();
      }
  });

  socket.on("get_chats", (data, callback) => {
    console.log(`Socket ${socket.id} requesting chats list`);
    if (typeof callback === "function") {
      callback(Object.values(chats).sort((a, b) => b.createdAt - a.createdAt));
    }
  });

  socket.on("get_chat", (chatId, callback) => {
    console.log(`Socket ${socket.id} requesting chat details for ${chatId}`);
    if (typeof callback === "function") {
      callback(chats[chatId] || null);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("User disconnected:", socket.id, "Reason:", reason);
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});