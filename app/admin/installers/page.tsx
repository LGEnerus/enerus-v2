'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminInstallersPage() {
  const [installers, setInstallers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }

    const { data: userData } = await (supabase as any)
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (userData?.role !== 'admin') { window.location.replace('/dashboard'); return }

    // Query installer_profiles without join first
    const { data: profiles, error: profileError } = await (supabase as any)
      .from('installer_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    // Get job counts
    const { data: jobs } = await (supabase as any)
      .from('jobs')
      .select('installer_id')

    const jobCounts: Record<string, number> = {}
    ;(jobs || []).forEach((j: any) => {
      jobCounts[j.installer_id] = (jobCounts[j.installer_id] || 0) + 1
    })

    // Get user emails separately
    const { data: users } = await (supabase as any)
      .from('users')
      .select('id, email, created_at')

    const userMap: Record<string, any> = {}
    ;(users || []).forEach((u: any) => { userMap[u.id] = u })

    const withExtras = (profiles || []).map((p: any) => ({
      ...p,
      job_count: jobCounts[p.id] || 0,
      user_email: userMap[p.user_id]?.email || '',
      user_created_at: userMap[p.user_id]?.created_at || '',
    }))

    setInstallers(withExtras)
    setLoading(false)
  }

  async function updateStatus(profileId: string, status: string) {
    await (supabase as any)
      .from('installer_profiles')
      .update({ status })
      .eq('id', profileId)

    setInstallers(prev => prev.map(p => p.id === profileId ? { ...p, status } : p))
    if (selected?.id === profileId) setSelected((prev: any) => ({ ...prev, status }))
  }

  function getStatusPill(status: string) {
    const map: Record<string, string> = {
      incomplete: 'bg-amber-50 text-amber-700',
      pending_review: 'bg-blue-50 text-blue-700',
      active: 'bg-emerald-50 text-emerald-700',
      suspended: 'bg-red-50 text-red-700',
    }
    return map[status] || 'bg-gray-100 text-gray-500'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading installers...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Enerus Plus</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Admin</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">← Overview</a>
          <a href="/admin/bus" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">BUS</a>
          <a href="/admin/jobs" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">All jobs</a>
          <a href="/admin/qc" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">QC</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-gray-900">Installers</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {installers.length} registered · {installers.filter(i => i.status === 'active').length} active
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3 mb-4">
            Error loading installers: {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Installer list */}
          <div className="col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
            {installers.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">No installers found</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Company</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">MCS</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Profile</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Jobs</th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {installers.map((inst: any) => (
                    <tr
                      key={inst.id}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${selected?.id === inst.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelected(inst)}
                    >
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-gray-900">{inst.company_name || '—'}</div>
                        <div className="text-xs text-gray-400">{inst.user_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-gray-500">{inst.mcs_number || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${inst.completion_pct || 0}%` }}/>
                          </div>
                          <span className="text-xs text-gray-400">{inst.completion_pct || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{inst.job_count}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${getStatusPill(inst.status)}`}>
                          {inst.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-emerald-700">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail panel */}
          <div className="col-span-1">
            {selected ? (
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div>
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-semibold text-base mb-3">
                    {(selected.company_name || 'E').charAt(0).toUpperCase()}
                  </div>
                  <div className="text-sm font-medium text-gray-900">{selected.company_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{selected.user_email}</div>
                </div>

                <div className="space-y-2 text-xs border-t border-gray-100 pt-4">
                  {[
                    { label: 'Director', value: selected.director_name },
                    { label: 'MCS number', value: selected.mcs_number },
                    { label: 'Phone', value: selected.phone },
                    { label: 'City', value: selected.city },
                    { label: 'Postcode', value: selected.postcode },
                    { label: 'Competencies', value: (selected.competencies || []).join(', ').toUpperCase() || '—' },
                    { label: 'PL insurance', value: selected.public_liability_expiry ? `Exp. ${selected.public_liability_expiry}` : 'Not uploaded' },
                    { label: 'EL insurance', value: selected.employers_liability_expiry ? `Exp. ${selected.employers_liability_expiry}` : 'Not uploaded' },
                    { label: 'Umbrella signed', value: selected.umbrella_agreement_signed ? 'Yes' : 'No' },
                    { label: 'Jobs', value: selected.job_count },
                    { label: 'Registered', value: selected.user_created_at ? new Date(selected.user_created_at).toLocaleDateString('en-GB') : '—' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-gray-400">{row.label}</span>
                      <span className="text-gray-900 font-medium text-right max-w-[140px] truncate">{row.value || '—'}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-medium text-gray-600 mb-2">Change status</div>
                  <div className="grid grid-cols-2 gap-2">
                    {['active', 'pending_review', 'incomplete', 'suspended'].map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(selected.id, s)}
                        className={`text-xs py-1.5 px-3 rounded-lg border transition-colors capitalize ${
                          selected.status === s
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                        }`}
                      >
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-center h-48">
                <p className="text-xs text-gray-400">Click an installer to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}