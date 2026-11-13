// Emergency entry point based on the block-aware candidate's response helper.
// It deliberately never calls the normal Worker, storage, Stripe, or email.
import { respond } from "./http.js";

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return respond({ service: "weownit-payments", status: "emergency-deny", delivery: "disabled", webhook: "retry" });
    }
    const response = respond({ error: "temporarily_unavailable" }, 503);
    response.headers.set("Retry-After", "60");
    return response;
  },
};
