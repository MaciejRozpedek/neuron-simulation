import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: function AppErrorComponent({ error }) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Application error</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String((error as Error).message)}</pre>
        </div>
      );
    },
  });
}
