import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as { bib?: string; totalPenalty?: number };
  if (!body.bib || !/^\d+$/.test(body.bib)) return Response.json({ error: "Numeric BIB is required" }, { status: 400 });
  const result = await transaction(async (client) => {
    const finished = await client.query<{ id: string }>(
      `UPDATE race_sessions r SET state='finished',finished_at=now()
       FROM participants p WHERE p.id=r.participant_id AND r.event_id=$1 AND r.judge_id=$2 AND p.bib=$3 AND r.state='active'
       RETURNING r.id`,
      [auth.user.eventId, auth.user.id, body.bib],
    );
    if (!finished.rows[0]) throw Object.assign(new Error("Active race session not found"), { status: 409 });
    await client.query(
      "UPDATE race_session_participants SET released_at=now() WHERE race_session_id=$1 AND released_at IS NULL",
      [finished.rows[0].id],
    );
    await client.query(
      `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'race.finish','race_session',$3,$4::jsonb)`,
      [auth.user.id, auth.user.eventId, finished.rows[0].id, JSON.stringify({ totalPenalty: body.totalPenalty })],
    );
    return finished.rows[0];
  }).catch((error) => ({ error }));
  if ("error" in result) return Response.json({ error: (result.error as Error).message }, { status: (result.error as { status?: number }).status ?? 500 });
  return Response.json({ sessionId: result.id, finishedAt: new Date().toISOString() });
}
