import { randomUUID } from "node:crypto";
import { audit, requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";
import { deliverOutboxOperation } from "../../penalties/route";

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const bib = String(body.bib ?? "").trim();
  const assetType = String(body.assetType ?? "");
  const assetCode = String(body.assetCode ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!/^\d+$/.test(bib) || !["wristband", "transponder1"].includes(assetType) || !assetCode || !reason) {
    return Response.json({ error: "BIB, asset type, new code, and replacement reason are required" }, { status: 400 });
  }
  try {
    const saved = await transaction(async (client) => {
      const participant = await client.query("SELECT id FROM participants WHERE event_id=$1 AND bib=$2 FOR UPDATE", [auth.user.eventId,bib]);
      if (!participant.rowCount) throw Object.assign(new Error(`BIB ${bib} was not found`), { status:404 });
      const previous = await client.query(
        `UPDATE asset_assignments SET active=false,released_at=now(),reason=$4
         WHERE event_id=$1 AND participant_id=$2 AND asset_type=$3 AND active RETURNING id,asset_code AS "assetCode"`,
        [auth.user.eventId,participant.rows[0].id,assetType,reason],
      );
      const replacement = await client.query(
        `INSERT INTO asset_assignments(event_id,participant_id,asset_type,asset_code,assigned_by,replaced_assignment_id,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [auth.user.eventId,participant.rows[0].id,assetType,assetCode,auth.user.id,previous.rows[0]?.id ?? null,reason],
      );
      const config = await client.query(
        `SELECT update_mapping AS "updateMapping" FROM event_configs
         WHERE event_id=$1 AND state='published' ORDER BY version DESC LIMIT 1`,
        [auth.user.eventId],
      );
      const field = assetType === "wristband"
        ? config.rows[0]?.updateMapping?.wristband ?? "wristbandID"
        : config.rows[0]?.updateMapping?.transponder1 ?? "Transponder1";
      const operation = await client.query(
        `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [`checkin-asset-replacement:${randomUUID()}`,auth.user.eventId,participant.rows[0].id,bib,field,assetCode],
      );
      await audit(auth.user.id,auth.user.eventId,"checkin.asset.replace","asset_assignment",replacement.rows[0].id,{
        bib,assetType,assetCode,previousAssetCode:previous.rows[0]?.assetCode ?? null,reason,operationId:operation.rows[0].id,
      });
      return { operationId:operation.rows[0].id,previousAssetCode:previous.rows[0]?.assetCode ?? null };
    });
    const delivery = await deliverOutboxOperation(saved.operationId, auth.user.eventId!);
    return Response.json({ ok:true,previousAssetCode:saved.previousAssetCode,deliveryState:delivery.state }, { status:201 });
  } catch (error) {
    if ((error as { code?:string }).code === "23505") return Response.json({ error:"That asset code is already active" }, { status:409 });
    const status = (error as { status?:number }).status ?? 500;
    return Response.json({ error:status===500?"Asset could not be replaced":(error as Error).message }, { status });
  }
}
