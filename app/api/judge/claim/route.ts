import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as { participantId?: string };
  if (!body.participantId) return Response.json({ error: "Participant is required" }, { status: 400 });
  try {
    const session = await transaction(async (client) => {
      const event = await client.query<{ config_version: number }>("SELECT config_version FROM events WHERE id=$1", [auth.user.eventId]);
      const result = await client.query<{ id: string }>(
        `INSERT INTO race_sessions(event_id,participant_id,judge_id,config_version)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [auth.user.eventId, body.participantId, auth.user.id, event.rows[0]?.config_version ?? 1],
      );
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'race.claim','race_session',$3,$4::jsonb)`,
        [auth.user.id, auth.user.eventId, result.rows[0].id, JSON.stringify({ participantId: body.participantId })],
      );
      return result.rows[0];
    });
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return Response.json({ error: "Athlete is already assigned to another active judge" }, { status: 409 });
    throw error;
  }
}
