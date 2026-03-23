const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "You are a highly capable and intelligent study assistant. Your goal is to provide accurate, detailed, and clear explanations based on the context provided. When a user refers to an uploaded document, analyze it thoroughly to give the most precise answer possible. If you need more information, ask follow-up questions but try to be as helpful and insightful as you can with the given materials."
});

/**
 * Extract text from local files (PDF or text) as a fallback/context context
 */
async function extractFileText(file) {
    const filePath = path.join(__dirname, 'uploads', file.filename);
    if (!fs.existsSync(filePath)) return "";

    if (file.mimetype === "application/pdf") {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            return `[File Content from ${file.name}]:\n${data.text}\n\n`;
        } catch (e) {
            console.error("PDF Parse error", e);
            return "";
        }
    } else if (file.mimetype.startsWith("text/")) {
        try {
            return `[File Content from ${file.name}]:\n${fs.readFileSync(filePath, 'utf-8')}\n\n`;
        } catch (e) {
            return "";
        }
    }
    return "";
}

/**
 * Helper to convert file to GoogleGenerativeAI.Part for multimodal support
 */
function fileToPart(file) {
    const filePath = path.join(__dirname, 'uploads', file.filename);
    if (!fs.existsSync(filePath)) return null;

    try {
        const data = fs.readFileSync(filePath);
        return {
            inlineData: {
                data: Buffer.from(data).toString("base64"),
                mimeType: file.mimetype
            }
        };
    } catch (e) {
        console.error("Error reading file for Gemini part:", e);
        return null;
    }
}

/**
 * Generate a response from text and optional files via Gemini
 */
async function generateAIResponse(message, files = [], history = [], onChunk = null) {
    try {
        // Filter history to ensure it has required fields and correct roles
        const chatHistory = history
            .filter(item => item.text && item.text.trim())
            .map(item => ({
                role: item.sender === 'user' ? 'user' : 'model',
                parts: [{ text: item.text }]
            }));

        const chat = model.startChat({
            history: chatHistory,
        });

        const parts = [];

        // 1. Handle Files
        // Use text extraction for text files, and direct binary parts for images/PDFs
        let textContext = "";
        for (const file of files) {
            if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
                const part = fileToPart(file);
                if (part) parts.push(part);
            } else {
                textContext += await extractFileText(file);
            }
        }

        if (textContext) {
            parts.push({ text: textContext });
        }

        // 2. Add Message
        if (message) {
            parts.push({ text: message });
        } else if (parts.length > 0) {
            parts.push({ text: "Please analyze the uploaded files." });
        } else {
            return "No message or files provided.";
        }

        // 3. Generate response
        if (!onChunk) {
            const result = await chat.sendMessage(parts);
            return result.response.text();
        }

        const result = await chat.sendMessageStream(parts);
        let fullText = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            onChunk(chunkText);
        }
        return fullText;

    } catch (error) {
        console.error("Gemini AI Error:", error);
        return "I encountered an error with the Gemini service. Please check your API key and connection.";
    }
}

/**
 * Generate a short, concise title for a chat via Gemini
 */
async function generateChatTitle(message) {
    try {
        const titleModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Generate a concise, descriptive title (max 4 words) for a chat that starts with: "${message}". Respond ONLY with the title text.`;
        const result = await titleModel.generateContent(prompt);
        return result.response.text().trim().replace(/[*"']/g, '');
    } catch (e) {
        return "New Chat";
    }
}

module.exports = {
    generateAIResponse,
    generateChatTitle
};

