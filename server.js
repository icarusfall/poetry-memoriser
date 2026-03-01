require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fetch poem by title using web search (works for public domain poems)
async function fetchPoemByTitle(title, authorHint) {
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

  const searchText = searchResponse.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  console.log("Search result length:", searchText.length);
  console.log("Search result preview:", searchText.slice(0, 300));

  if (!searchText.trim()) {
    throw new Error("Web search returned no text content");
  }

  return formatAsPoem(searchText);
}

// Fetch poem from a URL (works for any poem, including copyrighted)
async function fetchPoemByUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status}`);
  }
  const html = await res.text();

  // Truncate to avoid token limits — poem content is usually near the top
  const truncated = html.slice(0, 30000);

  return formatAsPoem(
    `Extract the poem from this webpage HTML. The poem text is in the page content — find it and return all lines.\n\n${truncated}`
  );
}

// Use Claude to format text into structured poem JSON
async function formatAsPoem(content) {
  const formatResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system:
      "You extract poems from provided content and output valid JSON only. No commentary, no markdown. Output the poem exactly as it appears in the source material.",
    messages: [
      {
        role: "user",
        content: `${content}\n\nOutput the poem as a JSON object with keys "title" (string), "author" (string), and "lines" (array of strings, one per line, use "" for stanza breaks). Output ONLY the JSON.`,
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
  const { title, author, url } = req.body;

  if (!title && !url) {
    return res.status(400).json({ error: "Title or URL is required" });
  }

  try {
    let poem;
    if (url) {
      console.log("Fetching poem from URL:", url);
      poem = await fetchPoemByUrl(url);
    } else {
      const authorHint = author ? ` by ${author}` : "";
      console.log("Searching for poem:", title, authorHint);
      poem = await fetchPoemByTitle(title, authorHint);
    }

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
