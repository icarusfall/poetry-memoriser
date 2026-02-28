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
      messages: [
        {
          role: "user",
          content: `Recall the full text of the poem "${title}"${authorHint}. Return ONLY valid JSON with no other text, in this exact format:
{"title": "Full Poem Title", "author": "Author Name", "lines": ["line 1", "line 2", ...]}

Each element in the "lines" array should be one line of the poem. Preserve the original line breaks. Include all stanzas. Use an empty string "" for blank lines between stanzas.`,
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
