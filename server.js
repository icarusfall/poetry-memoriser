require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;
const cheerio = require("cheerio");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

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

// Fetch poem from a URL by scraping the page directly
async function fetchPoemByUrl(url) {
  if (url.includes("poetryfoundation.org")) {
    throw new Error(
      "Poetry Foundation blocks automated access. Please use an AllPoetry link instead, or search by title."
    );
  }

  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header").remove();

  let title = "";
  let author = "";
  let lines = [];

  if (url.includes("allpoetry.com")) {
    title = $("h1").first().text().trim();
    // Author name is in the main_poem section before the h1
    author =
      $(".main_poem a[href^='/']")
        .filter((_, el) => {
          const href = $(el).attr("href") || "";
          // Author links are like /Donald-Marquis (single path segment, no further slashes)
          return /^\/[A-Z]/.test(href) && !href.includes("/poem");
        })
        .first()
        .text()
        .trim() || "Unknown";
    // Poem text is in .poem_body inside a div with class like orig_XXXXX
    const poemDiv = $(".poem_body [class^='orig_']").first();
    const poemHtml = poemDiv.html() || $(".poem_body").first().html() || "";
    lines = poemHtml
      .split(/<br\s*\/?>/)
      .map((l) => cheerio.load(`<span>${l}</span>`).text().trimEnd());
  } else {
    // Generic fallback: extract body text and use Claude to structure it
    const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 15000);
    return formatAsPoem(
      `Extract the poem from this page content:\n\n${bodyText}`
    );
  }

  // Clean up lines: collapse runs of empty strings into single stanza breaks
  const cleaned = [];
  let lastWasEmpty = false;
  for (const line of lines) {
    if (line === "") {
      if (!lastWasEmpty && cleaned.length > 0) {
        cleaned.push("");
        lastWasEmpty = true;
      }
    } else {
      cleaned.push(line);
      lastWasEmpty = false;
    }
  }
  if (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") {
    cleaned.pop();
  }

  if (cleaned.length === 0) {
    throw new Error("Could not extract poem lines from page");
  }

  return { title, author, lines: cleaned };
}

// Use Claude to format text into structured poem JSON (fallback)
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
    const message = err.message.includes("Poetry Foundation")
      ? err.message
      : "Failed to fetch poem. Please try again.";
    res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Poetry Memoriser running at http://localhost:${port}`);
});
