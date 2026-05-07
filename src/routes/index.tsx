import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "~/features/game/GameApp";

export const Route = createFileRoute("/")({
  ssr: false,
  component: GameApp,
});
