require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchPoem(title, authorHint) {
  // Step 1: Search the web for the full poem text
  const searchResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content: `Search the web for the full text of the poem "${title}"${authorHint}. Try Poetry Foundation (poetryfoundation.org) first, but search other sources if needed. Find the complete poem with every line.`,
      },
    ],
  });

  // Collect the text blocks from the search response
  const searchText = searchResponse.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log("Search result length:", searchText.length);
  console.log("Search result preview:", searchText.slice(0, 300));

  if (!searchText.trim()) {
    throw new Error("Web search returned no text content");
  }

  // Step 2: Format the found poem as JSON
  const formatResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: "You output valid JSON and nothing else. No commentary, no markdown.",
    messages: [
      {
        role: "user",
        content: `Here is information about a poem:\n\n${searchText}\n\nOutput the full text of this poem as a JSON object with keys "title" (string), "author" (string), and "lines" (array of strings, one per line, use "" for stanza breaks).`,
      },
      {
        role: "assistant",
        content: "{",
      },
    ],
  });

  let text = "{" + formatResponse.content[0].text.trim();
  text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}

app.post("/api/fetch-poem", async (req, res) => {
  const { title, author } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const authorHint = author ? ` by ${author}` : "";

  try {
    const poem = await fetchPoem(title, authorHint);
    console.log("Parsed poem:", JSON.stringify(poem, null, 2));

    if (!poem.title || !poem.author || !Array.isArray(poem.lines)) {
      console.error("Invalid structure. Keys found:", Object.keys(poem));
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
