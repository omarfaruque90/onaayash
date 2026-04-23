// api/fetch.js
// Vercel Serverless Function specifically requested for deployment

import { GoogleGenAI } from "@google/genai";
import * as cheerio from "cheerio";

// Helper function to extract media using standard tags or AI
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // If streaming proxy
  if (req.method === "GET" && req.query.proxyUrl) {
    return handleProxy(req, res);
  }

  // If extraction request (can map to /api/extract or /api/fetch)
  if (req.method === "POST") {
    return handleExtract(req, res);
  }

  res.status(405).json({ error: "Method Not Allowed" });
}

async function handleExtract(req, res) {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    let mediaUrl = null;
    let type = "video";
    let title = "Extracted Media - Onaayash";
    let thumbnail = null;

    // User-Agent Rotation Map for Bot bypass
    const userAgents = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/117.0.5938.108 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Enforce root referer (Required for explicit edge bypass setups like TikTok)
    const requestUrl = new URL(url);
    const enforcedReferer = requestUrl.hostname.includes('tiktok.com') ? 'https://www.tiktok.com/' : `${requestUrl.protocol}//${requestUrl.hostname}/`;

    // Advanced Header Spoofing
    const spoofHeaders = {
      "User-Agent": randomUA,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Referer": enforcedReferer,
      "Cache-Control": "no-cache"
    };

    // Fast-fail AbortController for Vercel timeouts (8s ceiling out of 10s serverless lifespan)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 8000);

    const response = await fetch(url, { 
      headers: spoofHeaders,
      signal: abortController.signal
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) {
       return res.status(response.status).json({ error: `Dynamic content blocked: Server returned ${response.status} for URL.` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Initial General Tag Scraper
    title = $('meta[property="og:title"]').attr("content") || $("title").text() || title;
    thumbnail = $('meta[property="og:image"]').attr("content");
    
    // 1. Specific TikTok Scraper
    if (url.includes('tiktok.com')) {
      // TikTok usually hydration data in script#__UNIVERSAL_DATA_FOR_REHYDRATION__
      const hydrationData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
      if (hydrationData) {
        try {
          const parsed = JSON.parse(hydrationData);
          // Look for playAddr or downloadAddr within the generic JSON structure
          // This traverses the known TikTok JSON architecture
          const defaultScope = parsed?.["__DEFAULT_SCOPE__"] || {};
          const videoDetail = defaultScope?.["webapp.video-detail"] || {};
          const itemInfo = videoDetail?.["itemInfo"] || {};
          const itemStruct = itemInfo?.["itemStruct"] || {};
          const video = itemStruct?.["video"] || {};
          
          title = itemStruct?.["desc"] || title;
          thumbnail = video?.["cover"] || thumbnail;
          
          // Prioritize playAddr (Raw/unwatermarked) over downloadAddr
          mediaUrl = video?.["playAddr"] || video?.["downloadAddr"];
          if (mediaUrl) type = "video";
        } catch (e) {
          console.error("Failed to parse TikTok hydration JSON", e);
        }
      }
      
      // Fallback: look for generic script tag with playAddr
      if (!mediaUrl) {
         const playMatch = html.match(/"playAddr":"([^"]+)"/);
         if (playMatch && playMatch[1]) {
             mediaUrl = playMatch[1].replace(/\\u002F/g, '/');
         } else {
             const scriptMatch = html.match(/"downloadAddr":"([^"]+)"/);
             if (scriptMatch && scriptMatch[1]) {
                mediaUrl = scriptMatch[1].replace(/\\u002F/g, '/');
             }
         }
      }
    }

    // 2. Generic Meta Tag Scraper (Fallback for highest res)
    if (!mediaUrl) {
      mediaUrl =
        $('meta[property="og:video:secure_url"]').attr("content") ||
        $('meta[property="og:video:url"]').attr("content") ||
        $('meta[property="og:video"]').attr("content") ||
        $('meta[property="twitter:player:stream"]').attr("content");
        
      if (!mediaUrl) {
        mediaUrl = 
          $('meta[property="og:image:secure_url"]').attr("content") || 
          $('meta[property="og:image"]').attr("content");
        if (mediaUrl) type = "image";
      }
    }

    // 3. AI Parsing Fallback
    if (!mediaUrl && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10 && (url.includes('tiktok') || url.includes('instagram') || url.includes('youtube'))) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        $('style, svg, img, nav, footer, script[src]').remove();
        const cleanHtml = $.html().slice(0, 45000);

        const aiResult = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert data scraper. Extract the absolute highest resolution, direct raw video (.mp4) or image (.jpg/png) URL from the messy HTML chunk provided. 
          Focus intensely on extracting CDN paths (like .byte., .cdn., fbcdn, or strings ending in .mp4). Ignore UI elements, trackers, and low-res thumbnails.
          Reply strictly in JSON: { "mediaUrl": string | null, "type": "video" | "image", "title": string, "thumbnail": string | null }. 
          HTML: ${cleanHtml}`,
          config: { responseMimeType: "application/json", temperature: 0.1 },
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
      } catch (aiError) {
        console.error("AI Extractor failed gracefully:", aiError.message || aiError);
        // Do not throw here, let it fall through to the !mediaUrl 404 handler below
      }
    }

    if (!mediaUrl) {
      return res.status(404).json({ error: "Could not extract raw media URL: Meta tags empty and internal scraping failed." });
    }

    // High Quality Image Fallback Cleanup
    if (type === "image" && mediaUrl) {
       // Strip generic resolution throttles from CDN links to retrieve original
       mediaUrl = mediaUrl.replace(/&s=[\dx]+/gi, "").replace(/\?size=[\dx]+/gi, "");
    }

    // Return the proxy endpoint so the frontend bypasses CORS
    const proxyUrl = `/api/fetch?proxyUrl=${encodeURIComponent(mediaUrl)}&type=${type}`;
    res.json({ title, type, mediaUrl: proxyUrl, originalUrl: mediaUrl, thumbnail });
  } catch (err) {
    if (err.name === 'AbortError') {
       return res.status(504).json({ error: "Source server took too long to respond. Please try again." });
    }
    console.error(err);
    res.status(500).json({ error: "Server Error: Exception thrown during extraction process." });
  }
}

async function handleProxy(req, res) {
  try {
    const { proxyUrl, type } = req.query;
    const url = decodeURIComponent(proxyUrl);
    const refererObj = new URL(url);
    
    // Add same mobile spoofing and referer for the proxy pipe
    let fetchReferer = `${refererObj.protocol}//${refererObj.host}/`;
    if (url.includes('tiktokcdn.com') || url.includes('tiktok.com') || url.includes('tiktokv.com') || url.includes('byte')) {
      fetchReferer = 'https://www.tiktok.com/';
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Referer": fetchReferer,
        "Accept": "*/*"
      },
    });

    if (!response.ok) return res.status(response.status).send(`Failed downstream proxy fetch: ${response.status}`);

    let ext = type === "video" ? "mp4" : "jpg";
    const contentType = response.headers.get("content-type");
    if (contentType) {
      if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
      else if (contentType.includes("mp4")) ext = "mp4";
      else if (contentType.includes("webm")) ext = "webm";
    }

    res.setHeader("Content-Type", contentType || (type === "video" ? "video/mp4" : "image/jpeg"));
    res.setHeader("Content-Disposition", `attachment; filename="Onaayash_Media.${ext}"`);

    // Stream the body (Node 18+ web stream mapping)
    if (response.body) {
      const { Readable } = require("stream");
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.status(500).send("No streaming body available from downstream.");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy error: Pipe failed.");
  }
}
