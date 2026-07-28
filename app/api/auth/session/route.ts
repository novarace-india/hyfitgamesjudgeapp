import { currentUser } from "../../../../lib/auth.server";

export async function GET(request: Request) {
  const user = await currentUser(request);
  return user ? Response.json({ user }) : Response.json({ error: "Authentication required" }, { status: 401 });
}
