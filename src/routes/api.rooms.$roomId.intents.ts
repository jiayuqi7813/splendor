import { createFileRoute } from "@tanstack/react-router";
import { publishRoomIntentInputSchema } from "~/shared/protocol";
import { publishIntent } from "~/server/gameStore";

export const Route = createFileRoute("/api/rooms/$roomId/intents")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = await request.json().catch(() => ({}));
        const input = publishRoomIntentInputSchema.safeParse({ ...body, roomId: params.roomId });
        if (!input.success) return Response.json({ error: "同步意图请求无效。" }, { status: 400 });
        const result = publishIntent(input.data, input.data.intent);
        if (result.error) return Response.json({ error: result.error }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
