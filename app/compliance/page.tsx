'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, formatCurrency, formatDate, daysUntil, type ComplianceType, COMPLIANCE_LABEL } from '@/lib/supabase'

const COMPLIANCE_GROUPS = {
  'Insurance': ['public_liability','professional_indemnity','employers_liability'] as ComplianceType[],
  'Accreditations': ['gas_safe','niceic','napit','mcs','oftec','fgas','trust_mark','chas','constructionline','other_accreditation'] as ComplianceType[],
  'Vehicles': ['vehicle_insurance','vehicle_mot','vehicle_tax','vehicle_service'] as ComplianceType[],
  'Other': ['tool_calibration','ladder_inspection','other'] as ComplianceType[],
}

export default function CompliancePage() {
  const router = useRouter()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Insurance')

  const [form, setForm] = useState({
    type: 'public_liability' as ComplianceType,
    name: '',
    provider: '',
    reference_number: '',
    issued_date: '',
    expiry_date: '',
    renewal_date: '',
    annual_cost: '',
    notes: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: u } = await (supabase as any).from('users').select('account_id').eq('id', session.user.id).single()
    if (u?.account_id) setAccountId(u.account_id)
    const { data } = await (supabase as any)
      .from('compliance_records')
      .select('*')
      .eq('is_active', true)
      .order('expiry_date', { ascending: true })
    setRecords(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.name) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const { error: err } = await (supabase as any).from('compliance_records').insert({
        ...form,
        account_id: accountId,
        annual_cost: form.annual_cost ? parseFloat(form.annual_cost) : null,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
        renewal_date: form.renewal_date || null,
      })
      if (err) throw err
      setShowNew(false)
      setForm({ type: 'public_liability', name: '', provider: '', reference_number: '', issued_date: '', expiry_date: '', renewal_date: '', annual_cost: '', notes: '' })
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  function expiryStatus(record: any): { colour: string; label: string; urgent: boolean } {
    const days = daysUntil(record.expiry_date)
    if (days === null) return { colour: 'text-gray-500', label: 'No expiry', urgent: false }
    if (days < 0) return { colour: 'text-red-400', label: `Expired ${Math.abs(days)}d ago`, urgent: true }
    if (days <= 7) return { colour: 'text-red-400', label: `Expires in ${days}d`, urgent: true }
    if (days <= 30) return { colour: 'text-amber-400', label: `Expires in ${days}d`, urgent: true }
    if (days <= 60) return { colour: 'text-amber-300', label: `Expires in ${days}d`, urgent: false }
    return { colour: 'text-emerald-400', label: `Valid · ${days}d`, urgent: false }
  }

  // Count urgent items
  const urgentCount = records.filter(r => expiryStatus(r).urgent).length
  const totalAnnualCost = records.reduce((s, r) => s + (r.annual_cost || 0), 0)

  const inp = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
  const lbl = "block text-xs font-medium text-gray-400 mb-1.5"

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-sm text-gray-600">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <h1 className="text-sm font-semibold text-white">Compliance</h1>
        <div className="flex items-center gap-3">
          {urgentCount > 0 && (
            <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full font-medium">
              {urgentCount} expiring soon
            </span>
          )}
          <button onClick={() => setShowNew(true)}
            className="bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            + Add record
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total records</div>
            <div className="text-2xl font-bold text-white">{records.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Expiring / expired</div>
            <div className={`text-2xl font-bold ${urgentCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {urgentCount}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Annual cost</div>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalAnnualCost)}</div>
            <div className="text-xs text-gray-600 mt-1">{formatCurrency(totalAnnualCost / 12)}/mo</div>
          </div>
        </div>

        {/* Records grouped */}
        {Object.entries(COMPLIANCE_GROUPS).map(([group, types]) => {
          const groupRecords = records.filter(r => types.includes(r.type))
          const groupUrgent = groupRecords.filter(r => expiryStatus(r).urgent).length
          const isExpanded = expandedGroup === group

          return (
            <div key={group} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{group}</span>
                  <span className="text-xs text-gray-600">{groupRecords.length} record{groupRecords.length !== 1 ? 's' : ''}</span>
                  {groupUrgent > 0 && (
                    <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                      {groupUrgent} urgent
                    </span>
                  )}
                </div>
                <span className="text-gray-600 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-800">
                  {groupRecords.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <div className="text-sm text-gray-600 mb-3">No {group.toLowerCase()} records</div>
                      <button onClick={() => { setForm(p => ({ ...p, type: types[0] })); setShowNew(true) }}
                        className="text-xs text-amber-400 hover:text-amber-300">+ Add one →</button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-xs font-medium text-gray-600 px-5 py-3">Name</th>
                          <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden md:table-cell">Provider</th>
                          <th className="text-left text-xs font-medium text-gray-600 px-3 py-3 hidden lg:table-cell">Reference</th>
                          <th className="text-right text-xs font-medium text-gray-600 px-3 py-3 hidden lg:table-cell">Cost</th>
                          <th className="text-right text-xs font-medium text-gray-600 px-5 py-3">Expiry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {groupRecords.map(r => {
                          const { colour, label, urgent } = expiryStatus(r)
                          return (
                            <tr key={r.id} className="hover:bg-gray-800/40 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  {urgent && <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"/>}
                                  <div>
                                    <div className="text-sm font-medium text-gray-200">{r.name}</div>
                                    <div className="text-xs text-gray-600">{COMPLIANCE_LABEL[r.type as ComplianceType]}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 hidden md:table-cell">
                                <span className="text-sm text-gray-400">{r.provider || '—'}</span>
                              </td>
                              <td className="px-3 py-3 hidden lg:table-cell">
                                <span className="text-xs font-mono text-gray-500">{r.reference_number || '—'}</span>
                              </td>
                              <td className="px-3 py-3 text-right hidden lg:table-cell">
                                <span className="text-sm text-gray-400">
                                  {r.annual_cost ? formatCurrency(r.annual_cost) + '/yr' : '—'}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className={`text-xs font-medium ${colour}`}>{label}</div>
                                <div className="text-xs text-gray-700">{formatDate(r.expiry_date)}</div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* New record modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false) }}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="text-base font-bold text-white">Add compliance record</div>
              <button onClick={() => setShowNew(false)} className="text-gray-600 hover:text-gray-400 text-xl">×</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={lbl}>Type</label>
                <select className={inp} value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value as ComplianceType }))}>
                  {Object.entries(COMPLIANCE_GROUPS).map(([group, types]) => (
                    <optgroup key={group} label={group}>
                      {types.map(t => (
                        <option key={t} value={t}>{COMPLIANCE_LABEL[t]}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Name / description *</label>
                <input type="text" className={inp} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Public liability — Hiscox 2025"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Provider / insurer</label>
                  <input type="text" className={inp} value={form.provider}
                    onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}
                    placeholder="Hiscox, Gas Safe, NICEIC…"/>
                </div>
                <div>
                  <label className={lbl}>Reference / cert number</label>
                  <input type="text" className={inp} value={form.reference_number}
                    onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Issue date</label>
                  <input type="date" className={inp} value={form.issued_date}
                    onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Expiry date</label>
                  <input type="date" className={inp} value={form.expiry_date}
                    onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Renewal date</label>
                  <input type="date" className={inp} value={form.renewal_date}
                    onChange={e => setForm(p => ({ ...p, renewal_date: e.target.value }))}/>
                </div>
                <div>
                  <label className={lbl}>Annual cost (£)</label>
                  <input type="number" step="0.01" min="0" className={inp} value={form.annual_cost}
                    onChange={e => setForm(p => ({ ...p, annual_cost: e.target.value }))}
                    placeholder="0.00"/>
                </div>
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <textarea className={`${inp} resize-none`} rows={2} value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}/>
              </div>

              {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 text-gray-950 font-bold text-sm py-3 rounded-xl transition-colors">
                  {saving ? 'Saving…' : 'Save record'}
                </button>
                <button onClick={() => setShowNew(false)}
                  className="px-5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}