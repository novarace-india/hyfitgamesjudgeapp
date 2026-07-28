import { audit, requireUser } from "../../../../lib/auth.server";
import { query, transaction } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","readonly"]);
  if ("error" in auth) return auth.error;
  const events = await query(
    `SELECT e.*, (SELECT count(*)::int FROM participants p WHERE p.event_id=e.id) AS participant_count
       FROM events e ORDER BY is_active DESC,starts_at DESC NULLS LAST,created_at DESC`,
  );
  return Response.json({ events: events.rows });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Event name is required" }, { status: 400 });
  const result = await query<{ id: string }>(
    `INSERT INTO events(name,venue,starts_at,ends_at,timezone,status)
     VALUES($1,$2,$3,$4,$5,'draft') RETURNING id`,
    [name, String(body.venue ?? ""), body.startsAt || null, body.endsAt || null, String(body.timezone ?? "Asia/Kolkata")],
  );
  await audit(auth.user.id, result.rows[0].id, "event.create", "event", result.rows[0].id, body);
  return Response.json({ id: result.rows[0].id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const eventId = String(body.id ?? "");
  if (!eventId) return Response.json({ error: "Event ID is required" }, { status: 400 });
  await transaction(async (client) => {
    if (body.activate === true) {
      await client.query("UPDATE events SET is_active=false,status=CASE WHEN status='live' THEN 'ready' ELSE status END");
      await client.query("UPDATE events SET is_active=true,status='live',updated_at=now() WHERE id=$1", [eventId]);
    } else {
      await client.query(
        `UPDATE events SET name=COALESCE($2,name),venue=COALESCE($3,venue),status=COALESCE($4,status),updated_at=now() WHERE id=$1`,
        [eventId, body.name || null, body.venue ?? null, body.status || null],
      );
    }
  });
  await audit(auth.user.id, eventId, body.activate ? "event.activate" : "event.update", "event", eventId, body);
  return Response.json({ ok: true });
}
