const OpenAIApi = require("openai");
const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3000;

const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const usersDir = path.join(__dirname, 'users');

// Ensure users directory exists
(async () => {
    try {
        await fs.access(usersDir);
        console.log('[Startup] Users directory confirmed');
    } catch (error) {
        console.log('[Startup] Creating users directory');
        await fs.mkdir(usersDir);
    }
})();

app.post('/api/users', async (req, res) => {
    const userId = req.body.userId || require('crypto').randomUUID();
    console.log(`[/api/users] Processing user data for ID: ${userId}`);

    const filePath = path.join(usersDir, `${userId}.json`);
    try {
        let userData = { userId, conversationHistory: [] };
        try {
            const data = await fs.readFile(filePath, 'utf8');
            userData = JSON.parse(data);
            console.log(`[/api/users] Existing user data loaded for ID: ${userId}`);
        } catch (error) {
            console.log(`[/api/users] New user or error reading file for ID: ${userId}, creating new file.`);
        }

        await fs.writeFile(filePath, JSON.stringify(userData, null, 2));
        console.log(`[/api/users] User data saved for ID: ${userId}`);
        res.json(userData);
    } catch (error) {
        console.error(`[/api/users] Failed to process user data for ID: ${userId}, error: ${error}`);
        res.status(500).send('Error processing user data');
    }
});

app.post('/api/chat', async (req, res) => {
    const { messages, userId } = req.body;
    console.log(`[/api/chat] Chat request initiated for user ID: ${userId} with messages: ${JSON.stringify(messages)}`);

    if (!userId) {
        console.error('[/api/chat] UserId is missing');
        return res.status(400).json({ error: 'UserId is required' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    console.log(`[/api/chat] Headers set for SSE for user ID: ${userId}`);
// this is the required way by open ai to get the response, never change it
    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            stream: true,
        });

        console.log(`[/api/chat] OpenAI API stream created for user ID: ${userId}`);

        let fullResponse = "";
// this is the require way by openai to handle streams, never change it
        for await (const part of stream) {
            const delta = part.choices[0].delta;
            const content = delta.content || '';

            console.log(`[/api/chat] Streamed response chunk for user ID: ${userId} - "${content}"`);
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
            fullResponse += content;
        }

        console.log(`[/api/chat] Full concatenated response for user ID: ${userId} - "${fullResponse}"`);

        res.write('data: [DONE]\n\n');
        res.end();

        // Update the conversation history with the full response
        await saveConversationHistory(userId, [...messages, { role: 'assistant', content: fullResponse }]);
        console.log(`[/api/chat] Conversation history updated successfully for user ID: ${userId}`);
    } catch (error) {
        console.error(`[/api/chat] Error during chat for user ID: ${userId} - ${error}`);
        res.end();
    }
});

function saveConversationHistory() {
    console.log(
        "[front.js/saveConversationHistory] Saving conversation history",
        { userId, conversationHistoryLength: conversationHistory.length },
    );

    const conversationHistoryWithTimestamps = conversationHistory.map(entry => ({
        ...entry,
        timestamp: new Date().toISOString(),
    }));

    const uniqueConversationHistory = conversationHistoryWithTimestamps.filter((entry, index, self) =>
        index === self.findIndex(e => e.role === entry.role && e.content === entry.content)
    );

    const groupedConversationHistory = uniqueConversationHistory.reduce((acc, entry) => {
        const existingEntry = acc.find(e => e.role === entry.role && e.content === entry.content);
        if (existingEntry) {
            existingEntry.timestamps.push(entry.timestamp);
        } else {
            acc.push({
                role: entry.role,
                content: entry.content,
                timestamps: [entry.timestamp],
            });
        }
        return acc;
    }, []);

    fetch(`/api/users/${userId}/history`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationHistory: groupedConversationHistory }),
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error("Failed to save conversation history");
            }
            console.log(
                "[front.js/saveConversationHistory] Conversation history saved successfully",
            );
        })
        .catch((error) => {
            console.error(
                "[front.js/saveConversationHistory] Error saving conversation history:",
                error,
            );
        });
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
