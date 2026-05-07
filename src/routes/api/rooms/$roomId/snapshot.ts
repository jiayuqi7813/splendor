import { createFileRoute } from "@tanstack/react-router";
import { seatCredentialsSchema } from "~/game/protocol";
import { getSnapshot } from "~/server/roomStore";

export const Route = createFileRoute("/api/rooms/$roomId/snapshot")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const credentials = seatCredentialsSchema.safeParse({
          roomId: params.roomId,
          playerId: url.searchParams.get("playerId") ?? "",
          reconnectToken: url.searchParams.get("reconnectToken") ?? "",
        });
        if (!credentials.success) return Response.json({ error: "快照请求参数无效。" }, { status: 400 });
        const snapshot = getSnapshot(credentials.data);
        if (snapshot.error) return Response.json({ error: snapshot.error }, { status: 400 });
        return Response.json(snapshot);
      },
    },
  },
});
