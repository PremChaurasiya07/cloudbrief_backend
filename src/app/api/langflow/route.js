 export async function POST(request) {
  const { query, userid } = await request.json();

  const response = await fetch("http://localhost:7860/api/v1/run/8aab738a-51cc-4175-8694-7d4aa96e377b", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "authorization": `Bearer ${process.env.LANGFLOW_API_AUTH_KEY}`,
    },
    body: JSON.stringify({
      input_value: query, // ✅ must be a string
      input_type: "chat",
      output_type: "chat",
      session_id: userid || "Not_known",
    }),
  });

  const data = await response.json();

  let message = "❌ No response received.";

  try {
    message = data.outputs?.[0]?.outputs?.[0]?.output_value || message;
  } catch (err) {
    console.error("Failed to extract output_value:", err);
  }

  // ✅ Optional: format for clean UI display
  const formatted = `
💬 WhatsApp Summary for ${new Date().toLocaleDateString()}:

${message}
`.trim();

  return Response.json({ summary: formatted }, { status: 200 });
}



  export async function GET(){
  return Response.json({message:"langflow"}, {
    status: 200,      
  }
);
  }

// export async function POST(request) {
//   const { query } = await request.json();
//   console.log("Incoming query:", query);

//   const headers = new Headers();
//   headers.set('Content-Type', 'text/event-stream');
//   headers.set('Cache-Control', 'no-cache');
//   headers.set('Connection', 'keep-alive');

//   const stream = new ReadableStream({
//     async start(controller) {
//       try {
//         const response = await fetch("http://localhost:7860/api/v1/run/8aab738a-51cc-4175-8694-7d4aa96e377b", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             "authorization": `Bearer ${process.env.LANGFLOW_API_AUTH_KEY}`,
//           },
//           body: JSON.stringify({
//             input_value: query,
//             input_type: "chat",
//             output_type: "chat",
//             session_id: "user_2"
//           }),
//         });

//         if (!response.ok) {
//           throw new Error(`Langflow API error: ${response.statusText}`);
//         }

//         const reader = response.body?.getReader();
//         const decoder = new TextDecoder();

//         if (!reader) {
//           throw new Error("Failed to access response stream reader.");
//         }

//         // Relay Langflow's stream to client
//         while (true) {
//           const { done, value } = await reader.read();
//           if (done) break;

//           const chunk = decoder.decode(value, { stream: true });
//           controller.enqueue(`data: ${chunk}\n\n`);
//           console.log("Chunk received:", chunk);
//         }

//         controller.close();
//       } catch (error) {
//         console.error("Stream error:", error);
//         controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
//         controller.close();
//       }
//     }
//   });

//   return new Response(stream, {
//     headers,
//   });
// }

// export async function GET() {
//   return Response.json({ message: "langflow" });
// }

