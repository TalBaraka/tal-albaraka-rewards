import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { customerState } from "../../shared/customerState.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const name = (body?.name || "").toString().trim();
    if (!name) return Response.json({ error: "name required" }, { status: 400 });
    const device_id = (body?.device_id || "").toString().trim();

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    let customer = null;

    // 1) Same device wins: the prize is bound to the device, even if the
    //    customer re-opens the app or enters a different name.
    if (device_id) {
      const byDevice = await sr.entities.Customer.filter({ device_id }, '-created_date', 5);
      if (byDevice && byDevice.length > 0) customer = byDevice[0];
    }

    // 2) Fallback: same name shows that name's previous data.
    if (!customer) {
      const byName = await sr.entities.Customer.filter({ name }, '-created_date', 5);
      if (byName && byName.length > 0) customer = byName[0];
    }

    if (customer) {
      const updates: Record<string, any> = {};
      if (customer.name !== name) updates.name = name;
      if (!customer.device_id && device_id) updates.device_id = device_id;

      if (Object.keys(updates).length > 0) {
        customer = await sr.entities.Customer.update(customer.id, updates);
      }
      return Response.json(customerState(customer));
    }

    const created = await sr.entities.Customer.create({
      name,
      session_id: (body?.session_id || (crypto as any).randomUUID()).toString(),
      device_id: device_id || null,
      approved_count: 0,
      prize_status: "none"
    });

    return Response.json(customerState(created));
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}