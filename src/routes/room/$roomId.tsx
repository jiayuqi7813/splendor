import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "~/components/MultiplayerRoom";

export const Route = createFileRoute("/room/$roomId")({
  ssr: false,
  component: GameApp,
});
