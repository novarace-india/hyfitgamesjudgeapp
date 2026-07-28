import { currentUser } from "../../../../lib/auth.server";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  return Response.json({
    user: {
      id: user.id,
      staffId: user.staffId,
      name: user.name,
      role: user.role,
      eventId: user.eventId,
    },
  });
}
