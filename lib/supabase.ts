import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Core types ───────────────────────────────────────────────────────────────

export type WorkStatus =
  | 'draft' | 'quote_sent' | 'quote_viewed' | 'quote_accepted' | 'quote_declined'
  | 'job_scheduled' | 'job_in_progress' | 'job_complete'
  | 'invoice_sent' | 'invoice_viewed' | 'invoice_partially_paid'
  | 'invoice_paid' | 'invoice_overdue' | 'cancelled' | 'archived'

export type VatRate = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside_scope'
export type TradeType = 'plumbing' | 'heating' | 'electrical' | 'gas' | 'building' | 'roofing' | 'carpentry' | 'painting' | 'tiling' | 'groundworks' | 'hvac' | 'renewables' | 'general' | 'other'
export type ComplianceType = 'public_liability' | 'professional_indemnity' | 'employers_liability' | 'vehicle_insurance' | 'vehicle_mot' | 'vehicle_tax' | 'vehicle_service' | 'gas_safe' | 'niceic' | 'napit' | 'mcs' | 'oftec' | 'fgas' | 'trust_mark' | 'chas' | 'constructionline' | 'other_accreditation' | 'tool_calibration' | 'ladder_inspection' | 'other'
export type CostCategory = 'fuel' | 'consumables' | 'workwear' | 'ppe' | 'tools' | 'vehicle' | 'insurance' | 'accreditation' | 'subscription' | 'rent' | 'utilities' | 'marketing' | 'training' | 'subcontractor' | 'materials' | 'other'

export type Account = {
  id: string
  business_name: string
  trading_name?: string
  vat_registered: boolean
  vat_number?: string
  logo_url?: string
  primary_colour: string
  secondary_colour: string
  phone?: string
  email?: string
  address_line1?: string
  postcode?: string
  invoice_prefix: string
  quote_prefix: string
  invoice_payment_terms: number
  plan: 'solo' | 'team' | 'business'
  status: 'trial' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at?: string
}

export type User = {
  id: string
  account_id: string
  email: string
  full_name?: string
  role: 'owner' | 'admin' | 'staff' | 'subcontractor'
  phone?: string
  avatar_url?: string
  job_title?: string
  hourly_rate?: number
}

export type Customer = {
  id: string
  account_id: string
  is_company: boolean
  company_name?: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  mobile?: string
  address_line1?: string
  city?: string
  postcode?: string
  property_type?: string
  epc_rating?: string
  notes?: string
  tags: string[]
  created_at: string
}

export type Work = {
  id: string
  account_id: string
  customer_id: string
  reference?: string
  status: WorkStatus
  trade_type: TradeType
  quote_date?: string
  quote_expires_at?: string
  scheduled_start?: string
  scheduled_end?: string
  actual_start?: string
  actual_end?: string
  invoice_date?: string
  invoice_due_date?: string
  site_address_line1?: string
  site_postcode?: string
  assigned_to: string[]
  subtotal_net: number
  total_vat: number
  total_gross: number
  amount_paid: number
  amount_due: number
  total_cost: number
  gross_margin: number
  margin_pct: number
  internal_notes?: string
  customer_notes?: string
  compliance_type?: string
  last_sent_at?: string
  last_viewed_at?: string
  view_count: number
  public_token?: string
  created_by?: string
  created_at: string
  updated_at: string
  // Joined
  customers?: Customer
  line_items?: LineItem[]
  payments?: Payment[]
}

export type LineItem = {
  id: string
  work_id: string
  catalogue_item_id?: string
  sort_order: number
  name: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
  cost_price?: number
  vat_rate: VatRate
  line_net: number
  line_vat: number
  line_gross: number
  is_material: boolean
  ordered_at?: string
  delivered_at?: string
  supplier?: string
}

export type Payment = {
  id: string
  work_id: string
  amount: number
  method: string
  reference?: string
  notes?: string
  paid_at: string
  created_by?: string
}

export type ActivityLog = {
  id: string
  entity_type: string
  entity_id: string
  event: string
  summary: string
  user_id?: string
  user_name?: string
  email_to?: string
  client_device?: string
  client_location?: string
  read_duration_seconds?: number
  metadata: Record<string, any>
  created_at: string
}

export type ComplianceRecord = {
  id: string
  account_id: string
  type: ComplianceType
  name: string
  provider?: string
  reference_number?: string
  issued_date?: string
  expiry_date?: string
  annual_cost?: number
  monthly_cost?: number
  document_path?: string
  notes?: string
  is_active: boolean
  reminded_60d: boolean
  reminded_30d: boolean
  reminded_7d: boolean
  created_at: string
}

export type BusinessCost = {
  id: string
  account_id: string
  category: CostCategory
  name: string
  supplier?: string
  amount: number
  vat_amount: number
  is_recurring: boolean
  recurrence?: string
  cost_date: string
  source?: string
  work_id?: string
  user_id?: string
  receipt_path?: string
  notes?: string
  created_at: string
}

// ─── Status helpers ────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<WorkStatus, string> = {
  draft:                    'Draft',
  quote_sent:               'Quote sent',
  quote_viewed:             'Quote viewed',
  quote_accepted:           'Accepted',
  quote_declined:           'Declined',
  job_scheduled:            'Scheduled',
  job_in_progress:          'In progress',
  job_complete:             'Complete',
  invoice_sent:             'Invoice sent',
  invoice_viewed:           'Invoice viewed',
  invoice_partially_paid:   'Part paid',
  invoice_paid:             'Paid',
  invoice_overdue:          'Overdue',
  cancelled:                'Cancelled',
  archived:                 'Archived',
}

export const STATUS_COLOUR: Record<WorkStatus, string> = {
  draft:                    'bg-gray-800 text-gray-400',
  quote_sent:               'bg-blue-900 text-blue-300',
  quote_viewed:             'bg-blue-800 text-blue-200',
  quote_accepted:           'bg-amber-900 text-amber-300',
  quote_declined:           'bg-gray-800 text-gray-500',
  job_scheduled:            'bg-purple-900 text-purple-300',
  job_in_progress:          'bg-amber-900 text-amber-300',
  job_complete:             'bg-emerald-900 text-emerald-300',
  invoice_sent:             'bg-blue-900 text-blue-300',
  invoice_viewed:           'bg-blue-800 text-blue-200',
  invoice_partially_paid:   'bg-amber-900 text-amber-300',
  invoice_paid:             'bg-emerald-900 text-emerald-300',
  invoice_overdue:          'bg-red-900 text-red-300',
  cancelled:                'bg-gray-800 text-gray-500',
  archived:                 'bg-gray-900 text-gray-600',
}

export const VAT_RATE_PCT: Record<VatRate, number> = {
  standard:     20,
  reduced:      5,
  zero:         0,
  exempt:       0,
  outside_scope: 0,
}

export const TRADE_LABEL: Record<TradeType, string> = {
  plumbing: 'Plumbing', heating: 'Heating', electrical: 'Electrical',
  gas: 'Gas', building: 'Building', roofing: 'Roofing',
  carpentry: 'Carpentry', painting: 'Decorating', tiling: 'Tiling',
  groundworks: 'Groundworks', hvac: 'HVAC', renewables: 'Renewables',
  general: 'General', other: 'Other',
}

export const COMPLIANCE_LABEL: Record<ComplianceType, string> = {
  public_liability: 'Public liability', professional_indemnity: 'Prof. indemnity',
  employers_liability: 'Employers liability', vehicle_insurance: 'Vehicle insurance',
  vehicle_mot: 'Vehicle MOT', vehicle_tax: 'Vehicle tax', vehicle_service: 'Vehicle service',
  gas_safe: 'Gas Safe', niceic: 'NICEIC', napit: 'NAPIT', mcs: 'MCS',
  oftec: 'OFTEC', fgas: 'F-Gas', trust_mark: 'TrustMark',
  chas: 'CHAS', constructionline: 'Constructionline',
  other_accreditation: 'Accreditation', tool_calibration: 'Tool calibration',
  ladder_inspection: 'Ladder inspection', other: 'Other',
}

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  fuel: 'Fuel', consumables: 'Consumables', workwear: 'Workwear', ppe: 'PPE',
  tools: 'Tools', vehicle: 'Vehicle', insurance: 'Insurance',
  accreditation: 'Accreditation', subscription: 'Subscription', rent: 'Rent',
  utilities: 'Utilities', marketing: 'Marketing', training: 'Training',
  subcontractor: 'Subcontractor', materials: 'Materials', other: 'Other',
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
}

export function isQuote(status: WorkStatus): boolean {
  return ['draft','quote_sent','quote_viewed','quote_accepted','quote_declined'].includes(status)
}

export function isJob(status: WorkStatus): boolean {
  return ['job_scheduled','job_in_progress','job_complete'].includes(status)
}

export function isInvoice(status: WorkStatus): boolean {
  return ['invoice_sent','invoice_viewed','invoice_partially_paid','invoice_paid','invoice_overdue'].includes(status)
}