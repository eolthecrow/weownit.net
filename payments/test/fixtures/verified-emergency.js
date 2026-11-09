var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/http.js
function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(respond, "respond");

// src/emergency.js
var emergency_default = {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return respond({ service: "weownit-payments", status: "emergency-deny", delivery: "disabled", webhook: "retry" });
    }
    const response = respond({ error: "temporarily_unavailable" }, 503);
    response.headers.set("Retry-After", "60");
    return response;
  }
};
export {
  emergency_default as default
};
//# sourceMappingURL=emergency.js.map
