import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const MASTER_REF_1 = "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/69092339e_image-1789243802114.jpg";
const MASTER_REF_2 = "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/26a46bef5_1789154356427.jpg";

const REJECT_MSG = "لم يتم قبول الفاتورة.\nيرجى رفع صورة واضحة للفواتير المعتمدة.";
const DUPLICATE_MSG = "هذه الفاتورة تم استخدامها من قبل ولا يمكن استخدامها مرة أخرى.";

const PROMPT = `You are a STRICT automated validator for the "Tal Al Baraka" (مؤسسة تال البركة) Simplified Tax Invoice.

You are given:
- IMAGE 1: the user-uploaded photo to validate.
- IMAGE 2 and IMAGE 3: the OFFICIAL MASTER REFERENCE template (ground truth).

A VALID invoice MUST match the official template. Check ALL of the following against the reference:
1. It is a thermal-receipt style "Simplified Tax Invoice" / "فاتورة ضريبية مبسطة".
2. Merchant is "مؤسسة تال البركة" (Tal Al Baraka).
3. Contains the "Omni" brand header area.
4. Has an invoice number printed as "رقم الفاتورة" (format like 15-04-1-2609205).
5. Has an items table with headers: الصنف / الكمية / السعر / الإجمالي.
6. Has VAT line "ضريبة القيمة المضافة" (15%).
7. Has a QR code and a barcode.
8. Has the footer fields (العميل / البائع / الفرع / مستخدم) and closing "شكراً لزيارتكم".
9. Overall layout, proportions and Arabic/English structure match the reference template.

REJECT (is_valid_invoice=false) any of the following:
- Random paper, normal document, screenshot, edited/manipulated image.
- Unrelated receipt, a different store/merchant, a different invoice design.
- Promotional illustration, scenery photo, playground photo, ride photo, any non-receipt image.
- Invoice missing required sections, or where the invoice number or key info cannot be read.
- Anything that does not sufficiently match the official template.

If valid, extract the invoice number EXACTLY as printed (digits and dashes only, e.g. 15-04-1-2609205).
Respond ONLY with the JSON object matching the schema. Set invoice_number to null if invalid or unreadable.`;

const SCHEMA = {
  type: "object",
  properties: {
    is_valid_invoice: { type: "boolean" },
    invoice_number: { type: ["string", "null"] },
    merchant_name: { type: ["string", "null"] },
    reason: { type: "string" }
  },
  required: ["is_valid_invoice", "invoice_number", "reason"]
};

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const image_url = body?.image_url;
    const customer_id = body?.customer_id || null;
    if (!image_url) return Response.json({ error: "image_url required" }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // 1) Template + structure validation via vision LLM, compared to master reference.
    const verdict = await sr.integrations.Core.InvokeLLM({
      prompt: PROMPT,
      file_urls: [image_url, MASTER_REF_1, MASTER_REF_2],
      response_json_schema: SCHEMA
    });

    const isValid = !!verdict?.is_valid_invoice;
    const invoice_number = verdict?.invoice_number ? String(verdict.invoice_number).trim() : null;

    if (!isValid || !invoice_number) {
      // record the rejection for auditing
      try {
        await sr.entities.InvoiceSubmission.create({
          customer_id,
          customer_name: body?.customer_name || null,
          invoice_number: invoice_number || null,
          image_url,
          status: "rejected",
          merchant_name: verdict?.merchant_name || null,
          rejection_reason: verdict?.reason || "template_mismatch"
        });
      } catch (_) { /* ignore audit failure */ }
      return Response.json({ approved: false, message: REJECT_MSG, reason: verdict?.reason || null });
    }

    // 2) Duplicate invoice-number check across ALL customers.
    const existing = await sr.entities.InvoiceSubmission.filter({
      invoice_number,
      status: "approved"
    });
    if (existing && existing.length > 0) {
      return Response.json({ approved: false, message: DUPLICATE_MSG, duplicate: true });
    }

    // 3) Resolve customer + name.
    let customer = null;
    if (customer_id) {
      try { customer = await sr.entities.Customer.get(customer_id); } catch (_) { /* ignore */ }
    }
    const customer_name = customer?.name || (body?.customer_name ? String(body.customer_name) : "عميل");

    // 4) Persist the approved submission.
    await sr.entities.InvoiceSubmission.create({
      customer_id: customer_id || null,
      customer_name,
      invoice_number,
      image_url,
      status: "approved",
      merchant_name: verdict?.merchant_name || null
    });

    // 5) Increment the customer's approved count.
    let newCount = 1;
    if (customer) {
      newCount = (customer.approved_count || 0) + 1;
      await sr.entities.Customer.update(customer_id, { approved_count: newCount });
    }

    return Response.json({
      approved: true,
      count: newCount,
      invoice_number,
      message: "تم قبول الفاتورة بنجاح"
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}