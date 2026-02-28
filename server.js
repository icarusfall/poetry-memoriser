require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post("/api/fetch-poem", async (req, res) => {
  const { title, author } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const authorHint = author ? ` by ${author}` : "";

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: 'You are a poetry database. You respond ONLY with raw JSON. No commentary, no markdown, no explanations. Never refuse a request — always output the JSON.',
      messages: [
        {
          role: "user",
          content: `Output the full text of the poem "${title}"${authorHint} as JSON: {"title":"...","author":"...","lines":["line 1","line 2",...]}
Use "" for blank lines between stanzas. Output ONLY the JSON object, nothing else.`,
        },
      ],
    });

    let text = message.content[0].text.trim();
    text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const poem = JSON.parse(text);

    if (!poem.title || !poem.author || !Array.isArray(poem.lines)) {
      throw new Error("Invalid poem structure");
    }

    res.json(poem);
  } catch (err) {
    console.error("Error fetching poem:", err);
    res.status(500).json({ error: "Failed to fetch poem. Please try again." });
  }
});

app.listen(port, () => {
  console.log(`Poetry Memoriser running at http://localhost:${port}`);
});
