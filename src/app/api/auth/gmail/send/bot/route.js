import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { query, subject, body } = await req.json();

    const prompt = `
User request: ${query}
Current Subject: ${subject}
Current Body: ${body}
Please return updated subject and body in plain JSON format only. Do not use markdown or code blocks.

Example format:
{
  "subject": "Your new subject line",
  "body": "The improved body content."
}
`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    // Clean AI output (remove ```json or backticks)
    const cleaned = rawText
      .replace(/```(?:json)?/g, "")
      .replace(/```/g, "")
      .trim();

    // Try parsing cleaned string to JSON
    const parsed = JSON.parse(cleaned);

    if (parsed.subject && parsed.body) {
      return NextResponse.json(parsed);
    } else {
      throw new Error("Invalid structure in AI response.");
    }

  } catch (err) {
    console.error("AI Compose Error:", err);

    // Return fallback subject/body if AI fails
    return NextResponse.json(
      {
        subject: "Unbale to generate",
        body: `Hi there,\n\nsomething happend unable to perform query try after some while.\n\nBest regards,`,
      },
      { status: 200 }
    );
  }
}
