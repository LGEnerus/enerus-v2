'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function MCSCertificatePage() {
  const params = useParams()
  const jobId = params.id as string
  const [cert, setCert] = useState<any>({})
  const [customer, setCustomer] = useState<any>(null)
  const [design, setDesign] = useState<any>(null)
  const [ip, setIp] = useState<any>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: sd } = await (supabase as any).from('system_designs').select('*').eq('job_id', jobId).single()
    setDesign(sd)
    const { data: installer } = await (supabase as any).from('installer_profiles').select('*').eq('user_id', session.user.id).single()
    setIp(installer)
    const { data: existing } = await (supabase as any).from('mcs_certificates').select('*').eq('job_id', jobId).single()
    if (existing) { setCert(existing); setExistingId(existing.id) }
    else {
      // Pre-fill from design and customer
      const di = sd?.design_inputs || {}
      setCert({
        hp_manufacturer: di.systemSpec?.hpManufacturer || '',
        hp_model: di.systemSpec?.hpModel || '',
        hp_mcs_product_ref: di.systemSpec?.hpProductCode || '',
        cylinder_manufacturer: di.systemSpec?.cylinderManufacturer || '',
        cylinder_model: di.systemSpec?.cylinderModel || '',
        property_address: cd ? `${cd.address_line1}${cd.address_line2 ? ', '+cd.address_line2 : ''}` : '',
        property_postcode: cd?.postcode || '',
        epc_rating: cd?.current_epc_rating || '',
        epc_reference: cd?.epc_certificate_number || '',
        heat_loss_kw: sd?.total_heat_loss_w ? (sd.total_heat_loss_w / 1000).toFixed(2) : '',
        flow_temp_c: sd?.flow_temp_c || 50,
        scop_estimate: sd?.scop_estimate || '',
        installation_date: jd.install_date || '',
        status: 'draft',
      })
    }
    setLoading(false)
  }

  function upd(updates: any) { setCert((p: any) => ({ ...p, ...updates })) }

  async function save(submit = false) {
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const payload = {
        ...cert,
        job_id: jobId,
        installer_id: session.user.id,
        status: submit ? 'submitted' : 'draft',
        submitted_at: submit ? new Date().toISOString() : cert.submitted_at,
        updated_at: new Date().toISOString(),
      }
      if (existingId) {
        const { error: e } = await (supabase as any).from('mcs_certificates').update(payload).eq('id', existingId)
        if (e) throw e
      } else {
        const { data, error: e } = await (supabase as any).from('mcs_certificates').insert({ ...payload, created_at: new Date().toISOString() }).select().single()
        if (e) throw e
        if (data) setExistingId(data.id)
      }
      if (submit) {
        await (supabase as any).from('job_stages').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('job_id', jobId).eq('stage', 'handover')
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const inp = "w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-white"
  const lbl = "block text-xs font-medium text-gray-500 mb-1"
  const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4"

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">MCS Installation Certificate</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Job</a>
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button onClick={() => save(false)} disabled={saving}
            className="border border-gray-200 text-gray-600 text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-gray-50">
            {saving ? '...' : saved ? '✓ Saved' : 'Save draft'}
          </button>
          <button onClick={() => window.open(`/api/mcs-cert/${jobId}`, '_blank')}
            className="border border-emerald-300 text-emerald-700 text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-emerald-50">
            Preview PDF
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className={`px-4 py-2 text-xs flex items-center gap-4 ${cert.status === 'submitted' ? 'bg-blue-700 text-white' : cert.status === 'approved' ? 'bg-emerald-700 text-white' : 'bg-gray-700 text-white'}`}>
        <span className="font-medium">MCS Installation Certificate</span>
        <span className="capitalize">{cert.status || 'draft'}</span>
        {cert.certificate_number && <span>Cert: {cert.certificate_number}</span>}
        {cert.mcs_submission_ref && <span>MCS ref: {cert.mcs_submission_ref}</span>}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Installer details (read-only from profile) */}
        {ip && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-gray-700 mb-2">Installer details (from your profile)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400">Company: </span><span>{ip.company_name}</span></div>
              <div><span className="text-gray-400">MCS number: </span><span className="font-medium text-emerald-700">{ip.mcs_certificate_number || '—'}</span></div>
              <div><span className="text-gray-400">Address: </span><span>{ip.address_line1}, {ip.postcode}</span></div>
              <div><span className="text-gray-400">Phone: </span><span>{ip.phone}</span></div>
            </div>
          </div>
        )}

        {/* Property */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">Installation property</div>
          <div className="space-y-3">
            <div>
              <label className={lbl}>Property address</label>
              <input type="text" className={inp} value={cert.property_address || ''} onChange={e => upd({ property_address: e.target.value })}/>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Postcode</label>
                <input type="text" className={inp} value={cert.property_postcode || ''} onChange={e => upd({ property_postcode: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>EPC rating</label>
                <select className={inp} value={cert.epc_rating || ''} onChange={e => upd({ epc_rating: e.target.value })}>
                  <option value="">Select...</option>
                  {['A','B','C','D','E','F','G'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={lbl}>EPC reference number</label>
              <input type="text" className={inp} value={cert.epc_reference || ''} onChange={e => upd({ epc_reference: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"/>
            </div>
          </div>
        </div>

        {/* Heat pump */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">Heat pump details</div>
          <div className="space-y-3">
            <div className={grid2}>
              <div>
                <label className={lbl}>Manufacturer</label>
                <input type="text" className={inp} value={cert.hp_manufacturer || ''} onChange={e => upd({ hp_manufacturer: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>Model</label>
                <input type="text" className={inp} value={cert.hp_model || ''} onChange={e => upd({ hp_model: e.target.value })}/>
              </div>
            </div>
            <div className={grid2}>
              <div>
                <label className={lbl}>Serial number</label>
                <input type="text" className={inp} value={cert.hp_serial_number || ''} onChange={e => upd({ hp_serial_number: e.target.value })}/>
              </div>
              <div>
                <label className={lbl}>MCS product directory reference</label>
                <input type="text" className={inp} value={cert.hp_mcs_product_ref || ''} onChange={e => upd({ hp_mcs_product_ref: e.target.value })}/>
              </div>
            </div>
          </div>
        </div>

        {/* Cylinder */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">Hot water cylinder</div>
          <div className={grid2}>
            <div>
              <label className={lbl}>Manufacturer</label>
              <input type="text" className={inp} value={cert.cylinder_manufacturer || ''} onChange={e => upd({ cylinder_manufacturer: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>Model</label>
              <input type="text" className={inp} value={cert.cylinder_model || ''} onChange={e => upd({ cylinder_model: e.target.value })}/>
            </div>
          </div>
          <div className="mt-3">
            <label className={lbl}>Serial number</label>
            <input type="text" className={inp} value={cert.cylinder_serial_number || ''} onChange={e => upd({ cylinder_serial_number: e.target.value })}/>
          </div>
        </div>

        {/* System design data */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-sm font-semibold text-gray-900 mb-4">System design data</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Heat loss (kW)</label>
              <input type="number" step="0.01" className={inp} value={cert.heat_loss_kw || ''} onChange={e => upd({ heat_loss_kw: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>Flow temperature (°C)</label>
              <input type="number" className={inp} value={cert.flow_temp_c || ''} onChange={e => upd({ flow_temp_c: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>System volume (L)</label>
              <input type="number" className={inp} value={cert.system_volume_l || ''} onChange={e => upd({ system_volume_l: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>SCOP estimate</label>
              <input type="number" step="0.01" className={inp} value={cert.scop_estimate || ''} onChange={e => upd({ scop_estimate: e.target.value })}/>
            </div>
          </div>
          <div className={`${grid2} mt-3`}>
            <div>
              <label className={lbl}>Installation date</label>
              <input type="date" className={inp} value={cert.installation_date || ''} onChange={e => upd({ installation_date: e.target.value })}/>
            </div>
            <div>
              <label className={lbl}>Commissioning date</label>
              <input type="date" className={inp} value={cert.commissioning_date || ''} onChange={e => upd({ commissioning_date: e.target.value })}/>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button onClick={() => save(false)} disabled={saving}
            className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Save draft
          </button>
          <button onClick={() => save(true)} disabled={saving || cert.status === 'submitted'}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:bg-gray-300 transition-colors">
            {cert.status === 'submitted' ? '✓ Submitted to MCS' : 'Submit to MCS →'}
          </button>
        </div>
      </div>
    </div>
  )
}