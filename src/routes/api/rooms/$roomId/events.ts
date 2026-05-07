import { createFileRoute } from "@tanstack/react-router";
import { seatCredentialsSchema, type SseEnvelope } from "~/game/protocol";
import { subscribeToRoom, unsubscribeFromRoom } from "~/server/roomStore";

export const Route = createFileRoute("/api/rooms/$roomId/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const after = Number(url.searchParams.get("after") ?? 0);
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
        let closed = false;

        const closeConnection = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          if (connectionId) unsubscribeFromRoom(credentials.data.roomId, credentials.data.playerId, connectionId);
        };

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: SseEnvelope) => {
              const id = "seq" in event ? `id: ${event.seq}\n` : "";
              controller.enqueue(encoder.encode(`${id}event: room\ndata: ${JSON.stringify(event)}\n\n`));
            };
            const result = subscribeToRoom(credentials.data, Number.isFinite(after) ? after : 0, send);
            if (result.error || !result.connectionId) {
              send({ seq: 0, type: "error", message: result.error ?? "恢复房间失败。" });
              controller.close();
              return;
            }
            connectionId = result.connectionId;
            heartbeat = setInterval(() => send({ type: "heartbeat", at: Date.now() }), 25000);
          },
          cancel() {
            closeConnection();
          },
        });

        request.signal.addEventListener("abort", closeConnection);

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
