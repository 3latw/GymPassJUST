import { createServer } from "node:net";
import { createApp } from "../src/server.js";

export async function startTestApp(options = {}) {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const origin = `http://127.0.0.1:${port}`,
    instance = await createApp({
      origin,
      databasePath: ":memory:",
      jobs: false,
      demo: true,
      accountFile: false,
      ...options,
    });
  const server = instance.app.listen(port, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  return {
    ...instance,
    origin,
    async close() {
      await new Promise((r) => server.close(r));
      instance.dispose();
    },
  };
}
export async function login(origin, subject = "member-1") {
  const jar = new Map();
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...options.headers,
      },
    });
    for (const item of response.headers.getSetCookie()) {
      const pair = item.split(";")[0],
        index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  let response = await request(origin + "/auth/login");
  if (response.status !== 302) throw new Error("Login did not redirect");
  const authorize = new URL(response.headers.get("location"));
  authorize.searchParams.set("demo_subject", subject);
  response = await request(authorize);
  if (response.status !== 302) throw new Error("Test identity was rejected");
  response = await request(response.headers.get("location"));
  if (response.status !== 302)
    throw new Error("OIDC callback failed: " + response.status);
  const bootstrap = await (await request(origin + "/api/bootstrap")).json();
  return {
    bootstrap,
    request,
    async api(path, method = "GET", data, headers = {}) {
      return request(origin + "/api" + path, {
        method,
        headers: {
          origin,
          "content-type": "application/json",
          "x-csrf-token": bootstrap.csrf,
          ...headers,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    },
  };
}
