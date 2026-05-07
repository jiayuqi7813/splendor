import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="home">
      <section className="homePanel">
        <h1>Splendor Online</h1>
        <p>项目已收拢到单包路由结构。继续使用房间链接进入游戏。</p>
        <Link className="primaryButton" to="/room/$roomId" params={{ roomId: "LOCAL" }}>
          进入房间
        </Link>
      </section>
    </main>
  );
}
