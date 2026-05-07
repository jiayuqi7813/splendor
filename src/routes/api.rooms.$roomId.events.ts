import { createFileRoute } from "@tanstack/react-router";
import { seatCredentialsSchema, type SseEnvelope } from "~/shared/protocol";
import { subscribeToRoom, unsubscribeFromRoom } from "~/server/gameStore";

export const Route = createFileRoute("/api/rooms/$roomId/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const credentials = seatCredentialsSchema.safeParse({
          roomId: params.roomId,
          playerId: url.searchParams.get("playerId") ?? "",
          reconnectToken: url.searchParams.get("reconnectToken") ?? "",
        });

        if (!credentials.success) {
          return Response.json({ error: "SSE 连接参数无效。" }, { status: 400 });
        }

        const encoder = new TextEncoder();
        let connectionId = "";
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: SseEnvelope) => {
              controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
            };
            const result = subscribeToRoom(credentials.data, send);
            if (result.error || !result.connectionId) {
              send({ type: "error", message: result.error ?? "恢复房间失败。" });
              controller.close();
              return;
            }
            connectionId = result.connectionId;
            heartbeat = setInterval(() => send({ type: "heartbeat", at: Date.now() }), 25000);
          },
          cancel() {
            if (heartbeat) clearInterval(heartbeat);
            if (connectionId) unsubscribeFromRoom(credentials.data.roomId, credentials.data.playerId, connectionId);
          },
        });

        request.signal.addEventListener("abort", () => {
          if (heartbeat) clearInterval(heartbeat);
          if (connectionId) unsubscribeFromRoom(credentials.data.roomId, credentials.data.playerId, connectionId);
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
