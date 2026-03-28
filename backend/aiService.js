const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // Corrected model name
    systemInstruction: "You are a highly capable and intelligent study assistant. Your goal is to provide accurate, detailed, and clear explanations based on the context provided. When a user refers to an uploaded document, analyze it thoroughly to give the most precise answer possible. If you need more information, ask follow-up questions but try to be as helpful and insightful as you can with the given materials."
});

/**
 * Extract text from local files (PDF or text) as a fallback/context
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
async function generateAIResponse(message, files = [], history = [], syllabus = null, onChunk = null) {
    try {
        // Filter history to ensure it has required fields and correct roles
        const chatHistory = history
            .filter(item => (item.text && item.text.trim()) || (item.files && item.files.length > 0))
            .map(item => ({
                role: item.sender === 'user' ? 'user' : 'model',
                parts: [{ text: item.text || "Please look at the attached files." }]
            }));

        const chat = model.startChat({
            history: chatHistory,
        });

        const parts = [];

        // 0. Syllabus Context (if available)
        if (syllabus && typeof syllabus !== 'function' && Array.isArray(syllabus.units)) {
            let syllabusText = `CURRENT SYLLABUS CONTEXT:\nSubject: ${syllabus.subject}\n\nUnits and Topics:\n`;
            syllabus.units.forEach((unit, uIdx) => {
                syllabusText += `Unit ${uIdx + 1}: ${unit.name}\n`;
                if (Array.isArray(unit.topics)) {
                    unit.topics.forEach(topic => {
                        syllabusText += ` - ${topic.name} [Status: ${topic.done ? "Completed" : "Pending"}]\n`;
                    });
                }
            });
            syllabusText += `\nPlease use this syllabus info to help the user. If they ask to teach a topic, use this list.`;
            parts.push({ text: syllabusText });
        }

        // 1. Handle Files
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
        console.log(`[Gemini] Sending message with ${parts.length} parts (multimodal/text)`);

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
        console.error("Gemini AI Full Error:", error);
        return "I encountered an error with the Gemini service. Please check your API key and connection.";
    }
}

/**
 * Generate a short, concise title for a chat via Gemini
 */
async function generateChatTitle(message) {
    try {
        const titleModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Generate a concise, descriptive title (max 4 words) for a chat that starts with: "${message}". Respond ONLY with the title text.`;
        const result = await titleModel.generateContent(prompt);
        return result.response.text().trim().replace(/[*"']/g, '');
    } catch (e) {
        return "New Chat";
    }
}

/**
 * Parse a syllabus PDF/text file into a structured topic tree using Gemini.
 */
async function parseSyllabus(file) {
    try {
        console.log("[parseSyllabus] Using model: gemini-2.5-flash");
        const promptModel = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const systemPrompt = `You are a syllabus parser. 
Extract all subjects, units and topics from the given syllabus document into a structured JSON format.
Rules:
- The JSON object MUST follow this EXACT shape:
  {"subject": "<subject or course name>", "units": [{"name": "Unit 1: <unit title>", "topics": [{"name": "<topic name>", "done": false}, ...]}, ...]}
- If no clear units exist, group all topics under a single unit named "General Topics".
- Keep topic names concise but meaningful (3-8 words).
- Include EVERY topic, subtopic or module you find in the document.
- Use the real subject/course name if visible. If not visible, use "Unknown Subject".`;

        let parts = [{ text: systemPrompt }];

        const filePath = path.join(__dirname, 'uploads', file.filename);

        if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
            const data = fs.readFileSync(filePath);
            parts.push({
                inlineData: {
                    data: Buffer.from(data).toString("base64"),
                    mimeType: file.mimetype
                }
            });
        } else {
            let text = "";
            try { text = fs.readFileSync(filePath, 'utf-8'); } catch (e) { text = ""; }
            if (!text.trim()) return null;
            parts.push({ text: `\nDocument content:\n${text.slice(0, 14000)}` });
        }

        const result = await promptModel.generateContent({ contents: [{ role: "user", parts }] });
        const raw = result.response.text().trim();

        try {
            const parsed = JSON.parse(raw);
            if (!parsed.subject) parsed.subject = "My Syllabus";
            if (!Array.isArray(parsed.units)) parsed.units = [];
            return parsed;
        } catch (err) {
            console.error("[parseSyllabus] JSON Parse Error. Raw output was:", raw);
            return null;
        }

    } catch (e) {
        console.error("Syllabus parse error:", e.message || e);
        return null;
    }
}

module.exports = {
    generateAIResponse,
    generateChatTitle,
    parseSyllabus
};
