import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use anon key - PDF route is called from authenticated context
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const workId = params.id
  const format = req.nextUrl.searchParams.get('format') || 'html'

  // Fetch all data needed for the document
  const [{ data: work }, { data: items }, { data: payments }] = await Promise.all([
    supabase.from('works').select('*, customers(*), sites(*), accounts(*)').eq('id', workId).single(),
    supabase.from('line_items').select('*').eq('work_id', workId).order('sort_order'),
    supabase.from('payments').select('*').eq('work_id', workId).order('paid_at'),
  ])

  if (!work) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const acc = (work as any).accounts
  const customer = (work as any).customers
  const site = (work as any).sites
  const isInvoice = ['invoice_sent','invoice_viewed','invoice_partially_paid','invoice_paid','invoice_overdue'].includes(work.status)
  const docType = isInvoice ? 'Invoice' : 'Quote'
  const primaryColour = acc?.primary_colour || '#f59e0b'

  // VAT rates
  const vatRates: Record<string, number> = { standard: 20, reduced: 5, zero: 0, exempt: 0, outside_scope: 0 }

  function fmt(n: number) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n || 0)
  }
  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  function customerName() {
    if (!customer) return ''
    if (customer.is_company && customer.company_name) return customer.company_name
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
  }

  const lineItemsHtml = (items || []).map((item: any) => {
    const net = item.quantity * item.unit_price
    const vatPct = vatRates[item.vat_rate] || 0
    const vat = net * (vatPct / 100)
    const gross = net + vat
    return `
      <tr>
        <td class="item-name">
          <strong>${item.name}</strong>
          ${item.description ? `<br><span class="item-desc">${item.description}</span>` : ''}
        </td>
        <td class="item-qty">${item.quantity} ${item.unit}</td>
        <td class="item-price">${fmt(item.unit_price)}</td>
        <td class="item-vat">${vatPct}%</td>
        <td class="item-total">${fmt(gross)}</td>
      </tr>
    `
  }).join('')

  const paymentsHtml = (payments || []).length > 0 ? `
    <div class="payments-section">
      <h3>Payment history</h3>
      <table class="payments-table">
        ${(payments || []).map((p: any) => `
          <tr>
            <td>${fmtDate(p.paid_at)}</td>
            <td style="text-transform:capitalize">${(p.method || '').replace('_', ' ')}</td>
            <td>${p.reference || '—'}</td>
            <td style="text-align:right;color:#16a34a;font-weight:600">${fmt(p.amount)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  ` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${docType} ${work.reference}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 48px 64px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 32px; border-bottom: 2px solid ${primaryColour}; }
  .logo-area { display: flex; align-items: center; gap: 12px; }
  .logo-img { height: 48px; object-fit: contain; }
  .logo-text { font-size: 22px; font-weight: 800; color: #1a1a1a; }
  .logo-sub { font-size: 12px; color: #666; margin-top: 2px; }
  .doc-type { text-align: right; }
  .doc-type h1 { font-size: 32px; font-weight: 800; color: ${primaryColour}; letter-spacing: -0.5px; }
  .doc-type .ref { font-size: 16px; color: #666; margin-top: 4px; font-weight: 500; }

  /* Addresses */
  .addresses { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .address-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; margin-bottom: 8px; }
  .address-block p { line-height: 1.7; color: #333; font-size: 13px; }
  .address-block strong { color: #1a1a1a; font-weight: 600; }

  /* Dates */
  .doc-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: #f8f8f8; border-radius: 8px; padding: 16px 20px; margin-bottom: 32px; }
  .meta-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #999; font-weight: 600; display: block; margin-bottom: 3px; }
  .meta-item span { font-size: 13px; color: #1a1a1a; font-weight: 500; }

  /* Line items */
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .items-table thead th { background: ${primaryColour}15; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; font-weight: 600; border-bottom: 1px solid ${primaryColour}40; }
  .items-table thead th:last-child, .items-table thead th:nth-child(4), .items-table thead th:nth-child(3), .items-table thead th:nth-child(2) { text-align: right; }
  .items-table tbody tr { border-bottom: 1px solid #f0f0f0; }
  .items-table tbody tr:last-child { border-bottom: none; }
  .items-table td { padding: 12px; vertical-align: top; }
  .item-name { width: 40%; }
  .item-desc { font-size: 12px; color: #777; margin-top: 2px; }
  .item-qty, .item-price, .item-vat, .item-total { text-align: right; white-space: nowrap; color: #444; }
  .item-total { font-weight: 600; color: #1a1a1a; }

  /* Totals */
  .totals-section { display: flex; justify-content: flex-end; margin-top: 0; border-top: 1px solid #eee; padding-top: 0; }
  .totals-table { width: 280px; }
  .totals-table tr td { padding: 7px 12px; font-size: 13px; }
  .totals-table tr td:first-child { color: #666; }
  .totals-table tr td:last-child { text-align: right; font-weight: 500; color: #1a1a1a; }
  .total-row td { border-top: 2px solid ${primaryColour}; padding-top: 12px !important; padding-bottom: 12px !important; }
  .total-row td:first-child { font-size: 15px; font-weight: 700; color: #1a1a1a; }
  .total-row td:last-child { font-size: 20px; font-weight: 800; color: ${primaryColour}; }
  .balance-row td { background: ${primaryColour}10; border-radius: 4px; }
  .balance-row td:last-child { color: #dc2626; font-size: 16px; font-weight: 700; }

  /* Notes */
  .notes-section { margin-top: 32px; padding: 20px; background: #fafafa; border-radius: 8px; border-left: 3px solid ${primaryColour}; }
  .notes-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: #999; margin-bottom: 8px; }
  .notes-section p { color: #444; line-height: 1.6; font-size: 13px; }

  /* Payment details */
  .payment-details { margin-top: 32px; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px; }
  .payment-details h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: #999; margin-bottom: 12px; }
  .bank-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .bank-details div label { font-size: 11px; color: #999; display: block; }
  .bank-details div span { font-size: 13px; font-weight: 600; color: #1a1a1a; }

  /* Payments history */
  .payments-section { margin-top: 24px; }
  .payments-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: #999; margin-bottom: 8px; }
  .payments-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .payments-table td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; color: #555; }

  /* Footer */
  .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
  .footer p { font-size: 11px; color: #bbb; }
  .footer .accent { color: ${primaryColour}; font-weight: 600; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 24px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo-area">
      ${acc?.logo_url ? `<img src="${acc.logo_url}" class="logo-img" alt="Logo">` : ''}
      <div>
        <div class="logo-text">${acc?.business_name || ''}</div>
        ${acc?.trading_name ? `<div class="logo-sub">${acc.trading_name}</div>` : ''}
      </div>
    </div>
    <div class="doc-type">
      <h1>${docType}</h1>
      <div class="ref">${work.reference || ''}</div>
    </div>
  </div>

  <!-- Addresses -->
  <div class="addresses">
    <div class="address-block">
      <h3>From</h3>
      <p>
        <strong>${acc?.business_name || ''}</strong><br>
        ${acc?.address_line1 ? acc.address_line1 + '<br>' : ''}
        ${acc?.city ? acc.city + '<br>' : ''}
        ${acc?.postcode || ''}<br>
        ${acc?.phone ? acc.phone + '<br>' : ''}
        ${acc?.email || ''}
        ${acc?.vat_number ? '<br>VAT: ' + acc.vat_number : ''}
      </p>
    </div>
    <div class="address-block">
      <h3>To</h3>
      <p>
        <strong>${customerName()}</strong><br>
        ${customer?.address_line1 ? customer.address_line1 + '<br>' : ''}
        ${customer?.city ? customer.city + '<br>' : ''}
        ${customer?.postcode || ''}<br>
        ${customer?.email || ''}
      </p>
    </div>
    <div class="address-block">
      <h3>Site / property</h3>
      <p>
        ${site ? `<strong>${site.name}</strong><br>${site.address_line1 || ''}<br>${site.postcode || ''}` : (work.site_address_line1 || customer?.address_line1 || '—')}
      </p>
    </div>
  </div>

  <!-- Meta -->
  <div class="doc-meta">
    <div class="meta-item">
      <label>${isInvoice ? 'Invoice date' : 'Quote date'}</label>
      <span>${fmtDate(isInvoice ? work.invoice_date : work.quote_date)}</span>
    </div>
    ${isInvoice ? `
    <div class="meta-item">
      <label>Payment due</label>
      <span>${fmtDate(work.invoice_due_date)}</span>
    </div>` : `
    <div class="meta-item">
      <label>Valid until</label>
      <span>${fmtDate(work.quote_expires_at)}</span>
    </div>`}
    <div class="meta-item">
      <label>Trade</label>
      <span style="text-transform:capitalize">${work.trade_type || ''}</span>
    </div>
  </div>

  <!-- Line items -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="text-align:left">Description</th>
        <th>Qty</th>
        <th>Unit price</th>
        <th>VAT</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-section">
    <table class="totals-table">
      <tr><td>Subtotal (net)</td><td>${fmt(work.subtotal_net)}</td></tr>
      <tr><td>VAT</td><td>${fmt(work.total_vat)}</td></tr>
      <tr class="total-row"><td>Total</td><td>${fmt(work.total_gross)}</td></tr>
      ${(work.amount_paid || 0) > 0 ? `
        <tr><td>Paid</td><td style="color:#16a34a">−${fmt(work.amount_paid)}</td></tr>
        <tr class="balance-row"><td>Balance due</td><td>${fmt(work.amount_due)}</td></tr>
      ` : ''}
    </table>
  </div>

  ${paymentsHtml}

  <!-- Notes -->
  ${work.customer_notes ? `
  <div class="notes-section">
    <h3>Notes</h3>
    <p>${work.customer_notes}</p>
  </div>` : ''}

  <!-- Bank details (invoice only) -->
  ${isInvoice && acc?.bank_account_number ? `
  <div class="payment-details">
    <h3>Payment details</h3>
    <div class="bank-details">
      ${acc.bank_name ? `<div><label>Bank</label><span>${acc.bank_name}</span></div>` : ''}
      ${acc.bank_account_name ? `<div><label>Account name</label><span>${acc.bank_account_name}</span></div>` : ''}
      ${acc.bank_sort_code ? `<div><label>Sort code</label><span>${acc.bank_sort_code}</span></div>` : ''}
      ${acc.bank_account_number ? `<div><label>Account number</label><span>${acc.bank_account_number}</span></div>` : ''}
    </div>
    ${acc?.invoice_notes_default ? `<p style="margin-top:12px;font-size:13px;color:#666">${acc.invoice_notes_default}</p>` : ''}
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <p>${acc?.business_name || ''}${acc?.companies_house_no ? ' · Companies House: ' + acc.companies_house_no : ''}${acc?.vat_number ? ' · VAT: ' + acc.vat_number : ''}</p>
    <p>Generated by <span class="accent">trade stack</span></p>
  </div>

</div>
</body>
</html>`

  if (format === 'html') {
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  // For PDF format, return HTML with print instructions
  // (In production, use Puppeteer or a PDF service)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}