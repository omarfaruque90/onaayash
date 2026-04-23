import express from "express";
import { createServer as createViteServer } from "vite";
import * as path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import * as cheerio from "cheerio";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini SDK with apiKey from environment
// Wait, process.env.GEMINI_API_KEY might be empty if the user hasn't set it yet.
// We only initialize or use it when needed, or fallback.
const getAi = () => {
  if (!process.env.GEMINI_API_KEY) {
     return null;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Unified extract endpoint
  app.post("/api/extract", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      let mediaUrl = null;
      let type = "video";
      let title = "Extracted Media - Onaayash";
      let thumbnail = null;

      const spoofHeaders = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": new URL(url).origin + "/",
      };

      const response = await fetch(url, { headers: spoofHeaders });

      if (!response.ok) {
         return res.status(response.status).json({ error: `Dynamic content blocked: Server returned ${response.status} for URL.` });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Initial General Tag Scraper
      title = $('meta[property="og:title"]').attr("content") || $("title").text() || title;
      thumbnail = $('meta[property="og:image"]').attr("content");
      
      // 1. TikTok Scraper Logic
      if (url.includes('tiktok.com')) {
        const hydrationData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
        if (hydrationData) {
          try {
            const parsed = JSON.parse(hydrationData);
            const defaultScope = parsed?.["__DEFAULT_SCOPE__"] || {};
            const videoDetail = defaultScope?.["webapp.video-detail"] || {};
            const itemInfo = videoDetail?.["itemInfo"] || {};
            const itemStruct = itemInfo?.["itemStruct"] || {};
            const video = itemStruct?.["video"] || {};
            
            title = itemStruct?.["desc"] || title;
            thumbnail = video?.["cover"] || thumbnail;
            
            mediaUrl = video?.["downloadAddr"] || video?.["playAddr"];
            if (mediaUrl) type = "video";
          } catch (e) {
            console.error("Failed to parse TikTok hydration JSON", e);
          }
        }
        
        if (!mediaUrl) {
           const scriptMatch = html.match(/"downloadAddr":"([^"]+)"/);
           if (scriptMatch && scriptMatch[1]) {
              mediaUrl = scriptMatch[1].replace(/\\u002F/g, '/');
           } else {
              const playMatch = html.match(/"playAddr":"([^"]+)"/);
              if (playMatch && playMatch[1]) {
                  mediaUrl = playMatch[1].replace(/\\u002F/g, '/');
              }
           }
        }
      }

      // 2. Generic Meta Tag Scraper (Fallback)
      if (!mediaUrl) {
        mediaUrl =
          $('meta[property="og:video"]').attr("content") ||
          $('meta[property="og:video:url"]').attr("content") ||
          $('meta[property="og:video:secure_url"]').attr("content") ||
          $('meta[property="twitter:player:stream"]').attr("content");
          
        if (!mediaUrl) {
          mediaUrl = $('meta[property="og:image"]').attr("content");
          if (mediaUrl) type = "image";
        }
      }

      const ai = getAi();
      // 3. AI Fallback Parsing (if standard tags aren't sufficient)
      if (
        (!mediaUrl || url.includes("instagram") || url.includes("youtube") || url.includes("tiktok")) && 
        ai
      ) {
        $("style, svg, img, nav, footer, script[src]").remove();
        const cleanHtml = $.html().slice(0, 45000); // Send partial DOM for JSON-LD/script searching

        const prompt = `
          You are an advanced media extraction API. Extract the direct raw video or image URL (mp4, webm, jpg, png, etc.) from the provided HTML.
          Look closely at application/ld+json scripts, embedded state objects, or direct <script> definitions.
          Respond strictly with valid JSON format, using this schema:
          {
            "mediaUrl": "string | null",
            "type": "video | image",
            "title": "string",
            "thumbnail": "string | null"
          }
          HTML:
          ${cleanHtml}
        `;

        try {
          const aiResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });

          if (aiResult.text) {
             const parsed = JSON.parse(aiResult.text);
             if (parsed.mediaUrl) {
               mediaUrl = parsed.mediaUrl;
               type = parsed.type || "video";
               title = parsed.title || title;
               thumbnail = parsed.thumbnail || thumbnail;
             }
          }
        } catch (e) {
          console.error("AI Extractor failed:", e);
        }
      }

      if (!mediaUrl) {
        return res.status(404).json({
          error: "Could not extract raw media URL: Meta tags empty and internal scraping failed. The platform may have DRM, strict auth walls, or requires advanced scraping.",
        });
      }

      // Instead of sending the real URL that cors-blocks, send our proxy URL
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(mediaUrl)}&type=${type}`;

      res.json({
        title,
        type,
        mediaUrl: proxyUrl,
        originalUrl: mediaUrl,
        thumbnail,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server Error: Exception thrown during extraction process." });
    }
  });

  // Proxy Streaming endpoint to bypass CORS
  app.get("/api/proxy", async (req, res) => {
    try {
      const { url, type } = req.query;
      if (!url || typeof url !== "string") {
        return res.status(400).send("URL missing");
      }

      const refererObj = new URL(url);
      let fetchReferer = `${refererObj.protocol}//${refererObj.host}/`;
      
      // Specifically target TikTok CDNs and bypass hotlinking
      if (url.includes('tiktokcdn.com') || url.includes('tiktok.com') || url.includes('tiktokv.com') || url.includes('byte')) {
        fetchReferer = 'https://www.tiktok.com/';
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          Referer: fetchReferer,
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        return res.status(response.status).send(`Failed downstream proxy fetch: ${response.status}`);
      }

      let ext = type === "video" ? "mp4" : "jpg";
      const contentType = response.headers.get("content-type");
      if (contentType) {
        if (contentType.includes("png")) ext = "png";
        else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
        else if (contentType.includes("mp4")) ext = "mp4";
        else if (contentType.includes("webm")) ext = "webm";
      }

      res.setHeader(
        "Content-Type",
        contentType || (type === "video" ? "video/mp4" : "image/jpeg")
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Onaayash_Media.${ext}"`
      );

      // Node native fetch response body to Express response stream
      if (response.body) {
        // @ts-ignore
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.status(500).send("No streaming body found");
      }
    } catch (e) {
      console.error("Proxy error:", e);
      res.status(500).send("Streaming proxy error: Pipe failed.");
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
