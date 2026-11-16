export async function onRequest(context) {
  const { request, params } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const subPath = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  const cleanSubPath = subPath.replace(/^\/+/, "");
  const targetUrl = `https://groq.com{cleanSubPath}`;

  const headers = new Headers();
  const auth = request.headers.get("Authorization");
  const contentType = request.headers.get("Content-Type");
  if (auth) headers.set("Authorization", auth);
  if (contentType) headers.set("Content-Type", contentType);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
  });

  const respHeaders = new Headers(response.headers);
  respHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}
