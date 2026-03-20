'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STAGE_ORDER = [
  'customer', 'survey', 'design', 'proposal', 'acceptance',
  'bus_application', 'materials', 'installation', 'commissioning', 'handover'
]

const STAGE_INFO: Record<string, { label: string; description: string; tasks: string[]; action?: string; actionLabel?: string }> = {
  customer: {
    label: 'Customer',
    description: 'Customer registered and property details confirmed',
    tasks: ['Customer details recorded', 'Property address confirmed', 'EPC data retrieved', 'BUS eligibility checked'],
  },
  survey: {
    label: 'Site survey',
    description: 'Site survey completed and documented',
    tasks: ['Site survey carried out', 'Heat loss survey completed', 'Survey report uploaded', 'Photos taken and uploaded'],
  },
  design: {
    label: 'System design',
    description: 'MCS-compliant system design completed using the design tool',
    tasks: ['Room-by-room heat loss calculated (BS EN 12831-1:2017)', 'MCS 031 performance estimate completed', 'System specified and HP sized', 'MCS 020(a) noise check completed', 'Design signed off'],
    action: 'design',
    actionLabel: 'Open design tool →',
  },
  proposal: {
    label: 'Proposal',
    description: 'Customer proposal and quotation issued',
    tasks: ['Quotation prepared', 'MCS 031 performance estimate included', 'Proposal document sent to customer', 'Customer questions addressed'],
  },
  acceptance: {
    label: 'Customer acceptance',
    description: 'Customer has accepted the proposal',
    tasks: ['Customer signed acceptance form', 'Signed copy received and filed', 'Cooling-off period noted'],
  },
  bus_application: {
    label: 'BUS application',
    description: 'Boiler Upgrade Scheme application submitted',
    tasks: ['BUS application submitted to Ofgem', 'Ofgem application reference obtained', 'Grant approval confirmed'],
  },
  materials: {
    label: 'Materials',
    description: 'Equipment and materials ordered and delivered',
    tasks: ['Equipment ordered from supplier', 'Delivery date confirmed', 'Materials received and checked on site'],
  },
  installation: {
    label: 'Installation',
    description: 'Heat pump system installed',
    tasks: ['Installation completed', 'Building regulations notification submitted', 'F-gas records completed (if applicable)', 'Commissioning checklist prepared'],
  },
  commissioning: {
    label: 'Commissioning',
    description: 'System commissioned and tested',
    tasks: ['System commissioned to MCS standard', 'MCS commissioning checklist completed', 'System pressure test carried out', 'Flow/return temperatures verified', 'Commissioning pack uploaded'],
  },
  handover: {
    label: 'Handover',
    description: 'System handed over to customer',
    tasks: ['Customer handover completed', 'User manual and controls training given', 'Warranty registered with manufacturer', 'MCS certificate issued', 'BUS grant redeemed (if applicable)'],
  },
}

export default function JobDetailPage() {
  const params = useParams()
  const jobId = params.id as string

  const [job, setJob] = useState<any>(null)
  const [stages, setStages] = useState<any[]>([])
  const [customer, setCustomer] = useState<any>(null)
  const [heatLoss, setHeatLoss] = useState<any>(null)
  const [systemDesign, setSystemDesign] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: jobData } = await (supabase as any)
      .from('jobs').select('*').eq('id', jobId).single()
    if (!jobData) { window.location.replace('/jobs'); return }
    setJob(jobData)
    setActiveStage(jobData.current_stage)

    const { data: stagesData } = await (supabase as any)
      .from('job_stages').select('*').eq('job_id', jobId)
    setStages(stagesData || [])

    const { data: custData } = await (supabase as any)
      .from('customers').select('*').eq('id', jobData.customer_id).single()
    setCustomer(custData)

    const { data: hlData } = await (supabase as any)
      .from('heat_loss_calculations').select('*').eq('job_id', jobId).single()
    setHeatLoss(hlData)

    const { data: sdData } = await (supabase as any)
      .from('system_designs').select('*').eq('job_id', jobId).single()
    setSystemDesign(sdData)

    const { data: docsData } = await (supabase as any)
      .from('mcs_documents').select('*').eq('job_id', jobId).order('stage')
    setDocuments(docsData || [])

    setLoading(false)
  }

  async function completeStage(stage: string) {
    setCompleting(stage)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await (supabase as any)
      .from('job_stages')
      .update({ status: 'complete', completed_by: session.user.id, completed_at: new Date().toISOString() })
      .eq('job_id', jobId).eq('stage', stage)

    await (supabase as any).from('audit_log').insert({
      job_id: jobId,
      user_id: session.user.id,
      action: 'stage_completed',
      stage,
      entity_type: 'job_stage',
      description: `Stage completed: ${STAGE_INFO[stage]?.label}`,
    })

    await load()
    setActiveStage(job?.current_stage || stage)
    setCompleting(null)
  }

  function getStageStatus(stage: string): string {
    return stages.find(s => s.stage === stage)?.status || 'locked'
  }

  function getDocStatusPill(status: string) {
    const map: Record<string, string> = {
      not_generated: 'bg-gray-100 text-gray-400',
      generated: 'bg-blue-50 text-blue-700',
      signed: 'bg-emerald-50 text-emerald-700',
      approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-red-50 text-red-700',
    }
    return map[status] || 'bg-gray-100 text-gray-400'
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading job...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" /></svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">MCS Umbrella</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/jobs" className="text-xs text-gray-400 hover:text-gray-600">← All jobs</a>
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">{job?.reference}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Customer summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-medium text-gray-900">{customer?.first_name} {customer?.last_name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{customer?.address_line1}, {customer?.city}, {customer?.postcode}</div>
              <div className="text-xs text-gray-400 mt-0.5">{customer?.phone}{customer?.email ? ` · ${customer.email}` : ''}</div>
            </div>
            <div className="flex items-center gap-4 text-right">
              {customer?.epc_rating && (
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-0.5">EPC</div>
                  <div className="text-xl font-semibold text-gray-900">{customer.epc_rating}</div>
                </div>
              )}
              {systemDesign ? (
                <div className="text-center border-l border-gray-100 pl-4">
                  <div className="text-xs text-gray-400 mb-0.5">Design</div>
                  <div className="text-lg font-semibold text-emerald-700">{systemDesign.recommended_hp_kw} kW</div>
                  <div className="text-xs text-gray-400">SPF {systemDesign.spf_estimate} · {'★'.repeat(systemDesign.star_rating || 0)}</div>
                </div>
              ) : heatLoss ? (
                <div className="text-center border-l border-gray-100 pl-4">
                  <div className="text-xs text-gray-400 mb-0.5">Est. heat loss</div>
                  <div className="text-lg font-semibold text-emerald-700">{heatLoss.recommended_hp_kw} kW</div>
                </div>
              ) : null}
              <div className="text-center border-l border-gray-100 pl-4">
                <div className="text-xs text-gray-400 mb-0.5">BUS</div>
                <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                  ['eligible','approved','redeemed'].includes(job?.bus_status) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {job?.bus_status === 'eligible' ? '£7,500' : job?.bus_status === 'approved' ? 'Approved' : job?.bus_status === 'redeemed' ? 'Redeemed' : 'Not claiming'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stage pipeline */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="text-sm font-medium text-gray-900 mb-5">Workflow stages</div>

          <div className="flex mb-6 overflow-x-auto pb-1">
            {STAGE_ORDER.map((stage, i) => {
              const status = getStageStatus(stage)
              const isActive = stage === activeStage
              return (
                <div key={stage} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => setActiveStage(stage)}
                    className={`flex flex-col items-center px-2 py-2 rounded-lg transition-colors min-w-[72px] ${isActive ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
                      status === 'complete' ? 'bg-emerald-700 text-white' :
                      status === 'in_progress' ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400' :
                      status === 'flagged' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {status === 'complete' ? '✓' : i + 1}
                    </div>
                    <div className={`text-xs text-center leading-tight ${
                      isActive ? 'text-emerald-700 font-medium' :
                      status === 'complete' ? 'text-gray-600' :
                      status === 'locked' ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {STAGE_INFO[stage]?.label}
                    </div>
                  </button>
                  {i < STAGE_ORDER.length - 1 && (
                    <div className={`w-4 h-0.5 flex-shrink-0 ${
                      getStageStatus(STAGE_ORDER[i + 1]) !== 'locked' || status === 'complete' ? 'bg-emerald-300' : 'bg-gray-100'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>

          {activeStage && (
            <div className={`border rounded-xl p-5 ${
              getStageStatus(activeStage) === 'in_progress' ? 'border-emerald-200 bg-emerald-50' :
              getStageStatus(activeStage) === 'complete' ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{STAGE_INFO[activeStage]?.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{STAGE_INFO[activeStage]?.description}</div>
                </div>
                <div className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${
                  getStageStatus(activeStage) === 'complete' ? 'bg-emerald-100 text-emerald-800' :
                  getStageStatus(activeStage) === 'in_progress' ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {getStageStatus(activeStage) === 'complete' ? 'Complete' :
                   getStageStatus(activeStage) === 'in_progress' ? 'In progress' : 'Locked'}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {STAGE_INFO[activeStage]?.tasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${
                      getStageStatus(activeStage) === 'complete' ? 'bg-emerald-700' : 'border border-gray-300 bg-white'
                    }`}>
                      {getStageStatus(activeStage) === 'complete' && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className={`text-xs ${
                      getStageStatus(activeStage) === 'complete' ? 'text-gray-600' :
                      getStageStatus(activeStage) === 'locked' ? 'text-gray-300' : 'text-gray-700'
                    }`}>{task}</span>
                  </div>
                ))}
              </div>

              {/* Design stage shows design summary if saved */}
              {activeStage === 'design' && systemDesign && (
                <div className="bg-white border border-emerald-200 rounded-lg p-3 mb-3 grid grid-cols-5 gap-3 text-xs">
                  <div><div className="text-gray-400">Heat loss</div><div className="font-semibold">{(systemDesign.total_heat_loss_w / 1000).toFixed(1)} kW</div></div>
                  <div><div className="text-gray-400">ASHP size</div><div className="font-semibold text-emerald-700">{systemDesign.recommended_hp_kw} kW</div></div>
                  <div><div className="text-gray-400">Flow temp</div><div className="font-semibold">{systemDesign.flow_temp_c}°C</div></div>
                  <div><div className="text-gray-400">SPF</div><div className="font-semibold">{systemDesign.spf_estimate}</div></div>
                  <div><div className="text-gray-400">Stars</div><div className="font-semibold">{'★'.repeat(systemDesign.star_rating || 0)}</div></div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {getStageStatus(activeStage) === 'in_progress' && (
                  <>
                    {STAGE_INFO[activeStage]?.action && (
                      <a
                        href={`/jobs/${jobId}/${STAGE_INFO[activeStage].action}`}
                        className="bg-white border border-emerald-600 text-emerald-700 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors hover:bg-emerald-50"
                      >
                        {STAGE_INFO[activeStage].actionLabel}
                      </a>
                    )}
                    <button
                      onClick={() => completeStage(activeStage)}
                      disabled={completing === activeStage}
                      className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                    >
                      {completing === activeStage ? 'Completing...' : `Mark complete →`}
                    </button>
                  </>
                )}

                {activeStage === 'design' && getStageStatus(activeStage) !== 'locked' && (
                  <a href={`/jobs/${jobId}/design`} className="text-xs text-emerald-700 hover:underline">
                    {systemDesign ? 'Edit design →' : 'Open design tool →'}
                  </a>
                )}

                {getStageStatus(activeStage) === 'locked' && (
                  <div className="text-xs text-gray-400 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M4 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    </svg>
                    Complete the previous stage to unlock this one
                  </div>
                )}
                {getStageStatus(activeStage) === 'complete' && (
                  <div className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3.5 3.5 6.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Stage completed
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MCS Document pack */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-sm font-medium text-gray-900 mb-4">MCS document pack</div>
          {documents.length === 0 ? (
            <div className="text-xs text-gray-400">Documents will appear here as stages are completed.</div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-gray-50 border border-gray-200 rounded flex items-center justify-center flex-shrink-0">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <path d="M2 1h5l3 3v9H2V1z" stroke="#9ca3af" strokeWidth="1.2" fill="none"/>
                        <path d="M7 1v3h3" stroke="#9ca3af" strokeWidth="1.2" fill="none"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-900">{doc.doc_name}</div>
                      <div className="text-xs text-gray-400">{doc.doc_ref}</div>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${getDocStatusPill(doc.status)}`}>
                    {doc.status?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}